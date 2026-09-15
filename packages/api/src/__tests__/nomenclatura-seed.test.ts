/**
 * Story 47.1 — AC 15 da spec: o seed roda duas vezes sem duplicar.
 *
 * Banco em memória que respeita os UNIQUE naturais das tabelas `naming_*`
 * (é o que `onConflictDoNothing` faz no Postgres). O que se prova: contagem
 * igual na segunda rodada, changelog só para o que entrou, e os `[PREENCHER]`
 * pulados com aviso — não inventados.
 */
import { describe, expect, it } from "vitest";
import { getTableName } from "drizzle-orm";
import { DADOS_DO_SEED, seedNomenclatura } from "../db/seeds/nomenclatura.js";

const CHAVE: Record<string, (r: Record<string, unknown>) => string> = {
  naming_experts: (r) => `${r.code}`,
  naming_products: (r) => `${r.expertId}|${r.slug}`,
  naming_funnels: (r) => `${r.expertId}|${r.code}`,
  naming_offers: (r) => `${r.expertId}|${r.code}`,
  naming_landing_pages: (r) => `${r.slug}`,
  naming_dictionary_values: (r) => `${r.type}|${r.value}`,
  naming_changelog: () => `${Math.random()}`,
};

function bancoEmMemoria() {
  const tabelas = new Map<string, Record<string, unknown>[]>();
  let seq = 0;
  const linhasDe = (t: unknown) => {
    const nome = getTableName(t as never);
    if (!tabelas.has(nome)) tabelas.set(nome, []);
    return { nome, linhas: tabelas.get(nome)! };
  };
  const db = {
    select: () => ({ from: (t: unknown) => Promise.resolve([...linhasDe(t).linhas]) }),
    insert: (t: unknown) => ({
      values: (vs: Record<string, unknown> | Record<string, unknown>[]) => {
        const { nome, linhas } = linhasDe(t);
        const lista = Array.isArray(vs) ? vs : [vs];
        const inserir = (comConflito: boolean) => {
          const novos: Record<string, unknown>[] = [];
          for (const v of lista) {
            const chave = CHAVE[nome](v);
            if (linhas.some((l) => CHAVE[nome](l) === chave)) {
              if (comConflito) continue;
              throw new Error(`unique violado em ${nome}: ${chave}`);
            }
            const linha = { id: `id-${++seq}`, active: true, ...v };
            linhas.push(linha);
            novos.push(linha);
          }
          return novos;
        };
        return {
          onConflictDoNothing: () => ({ returning: async () => inserir(true) }),
          returning: async () => inserir(false),
          then: (ok: (v: unknown) => void, falhou: (e: unknown) => void) => Promise.resolve().then(() => inserir(false)).then(ok, falhou),
        };
      },
    }),
  };
  const contagens = () => Object.fromEntries([...tabelas.entries()].map(([k, v]) => [k, v.length]));
  return { db: db as never, tabelas, contagens };
}

describe("seed da nomenclatura", () => {
  it("AC 15: duas rodadas, mesma contagem em todas as tabelas; nada duplica", async () => {
    const banco = bancoEmMemoria();
    const primeira = await seedNomenclatura(banco.db);
    const depoisDa1 = banco.contagens();
    const segunda = await seedNomenclatura(banco.db);
    expect(banco.contagens()).toEqual(depoisDa1);
    expect(Object.values(segunda.inseridos).every((n) => n === 0)).toBe(true);
    // 10 da spec § 9.6 (+2025) + 7 do nome de anúncio (Story 47.10: 3 tipos de criativo + 4 siglas)
    // + 2 da origem do vídeo (Story 47.12: ia · h)
    expect(primeira.inseridos.naming_dictionary_values).toBe(19);
  });

  it("valores fixos entram na ordem da spec § 9.6 e nada de mix/carrossel fora do lugar", async () => {
    const banco = bancoEmMemoria();
    await seedNomenclatura(banco.db);
    const valores = banco.tabelas.get("naming_dictionary_values")!;
    const por = (type: string) => valores.filter((v) => v.type === type).sort((a, b) => (a.sortOrder as number) - (b.sortOrder as number)).map((v) => v.value);
    expect(por("year")).toEqual(["2025", "2026", "2027"]);
    expect(por("temperature")).toEqual(["hot", "cold"]);
    expect(por("auction")).toEqual(["abo", "cbo"]);
    expect(por("format")).toEqual(["videos", "estaticos", "mix"]);
  });

  it("47.10 AC1: tipo de criativo e sigla de lançamento entram na ordem e com as descrições do pedido", async () => {
    const banco = bancoEmMemoria();
    await seedNomenclatura(banco.db);
    const valores = banco.tabelas.get("naming_dictionary_values")!;
    const por = (type: string) => valores.filter((v) => v.type === type).sort((a, b) => (a.sortOrder as number) - (b.sortOrder as number)).map((v) => [v.value, v.description]);
    expect(por("creative_type")).toEqual([["ad", "estático"], ["adv", "vídeo"], ["carr", "carrossel"]]);
    expect(por("launch_type")).toEqual([["pg", "lançamento pago"], ["l", "lançamento gratuito"], ["m", "meteórico"], ["pr", "evento presencial"]]);
  });

  it("changelog: uma linha `create` por registro inserido, e só na primeira rodada", async () => {
    const banco = bancoEmMemoria();
    await seedNomenclatura(banco.db);
    const inseridos = [...banco.tabelas.entries()].filter(([k]) => k !== "naming_changelog").reduce((n, [, v]) => n + v.length, 0);
    expect(banco.tabelas.get("naming_changelog")!).toHaveLength(inseridos);
    await seedNomenclatura(banco.db);
    expect(banco.tabelas.get("naming_changelog")!).toHaveLength(inseridos);
  });

  it("TODO(P1): o que a spec deixou em [PREENCHER] é pulado com aviso, não inventado", async () => {
    const banco = bancoEmMemoria();
    const r = await seedNomenclatura(banco.db);
    const semNome = DADOS_DO_SEED.experts.filter((e) => !e.name).map((e) => e.code);
    for (const code of semNome) expect(r.pulados).toContain(`expert ${code}: name em TODO(P1)`);
    expect(banco.tabelas.get("naming_experts") ?? []).toHaveLength(DADOS_DO_SEED.experts.length - semNome.length);
    // nada dependente de expert pulado entra
    if (semNome.includes("bbe")) {
      expect(banco.tabelas.get("naming_offers") ?? []).toHaveLength(0);
      expect(r.pulados.some((p) => p.startsWith("lp bbe-churrasco-a01-of01-lpa"))).toBe(true);
    }
  });

  it("quando os valores forem preenchidos, a cadeia inteira entra (simulação com a spec completa)", async () => {
    // Não altera DADOS_DO_SEED: prova que o MECANISMO funciona com dados completos,
    // usando um clone preenchido — os valores reais continuam sendo P1.
    const banco = bancoEmMemoria();
    const mod = await import("../db/seeds/nomenclatura.js");
    const original = JSON.parse(JSON.stringify(mod.DADOS_DO_SEED));
    const d = mod.DADOS_DO_SEED as unknown as typeof original;
    for (const e of d.experts) e.name = e.name ?? e.code.toUpperCase();
    for (const p of d.produtos) { p.expert = p.expert ?? "bbe"; p.name = p.name ?? p.slug; }
    for (const f of d.funis) f.description = f.description ?? "VSL direto para checkout";
    try {
      const r = await seedNomenclatura(banco.db);
      expect(r.pulados).toEqual([]);
      expect(banco.contagens()).toMatchObject({ naming_experts: 4, naming_products: 5, naming_funnels: 1, naming_offers: 2, naming_landing_pages: 1 });
      expect(banco.tabelas.get("naming_landing_pages")![0].slug).toBe("bbe-churrasco-a01-of01-lpa");
      const r2 = await seedNomenclatura(banco.db);
      expect(Object.values(r2.inseridos).every((n) => n === 0)).toBe(true);
    } finally {
      Object.assign(d, original);
    }
  });
});
