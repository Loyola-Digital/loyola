/**
 * Story 47.16 (AC9) — o registro dos 6 anúncios do dg que já estão no ar.
 *
 * O script (`src/scripts/registrar-anuncios-no-ar-do-dg.ts`) NÃO roda aqui nem
 * em produção antes do deploy — o que se prova é a lógica que ele chama: os 6
 * nomes literais, o plano (inserir / já registrado / colisão = parar), a
 * conferência pelo parse e a prova byte a byte (PO-05).
 */
import { describe, expect, it } from "vitest";
import { type AdSnapshot } from "@loyola-x/shared";
import {
  ANUNCIOS_DO_DG_NO_AR,
  ErroDoRegistro,
  conferirNomes,
  planejarRegistro,
  provarRegistro,
  registrarAnunciosNoAr,
  type LinhaDeProva,
} from "../services/nomenclatura/anuncios-no-ar.js";
import type { Repositorio } from "../services/nomenclatura/repositorio.js";

/** O que o levantamento de produção de 23/09 mostrou para o dg. */
const snapDeProducao = (): AdSnapshot => ({
  experts: [{ code: "dg", active: true }],
  creativeTypes: ["ad", "adv", "carr"].map((value) => ({ value, active: true })),
  launchTypes: ["l", "m", "perpetuo", "pg", "pr"].map((value) => ({ value, active: true })),
  origins: ["h", "ia"].map((value) => ({ value, active: true })),
  partes: [1, 2, 3, 4, 5, 6].flatMap((n) => [
    { expert: "dg", type: "hook" as const, code: `h0${n}`, active: true },
    { expert: "dg", type: "body" as const, code: `b0${n}`, active: true },
  ]),
});

/** Repositório em memória com só o que o registro usa. */
function fake(opts: { anuncios?: { creativeSeq: number; name: string }[]; semParte?: string } = {}) {
  const anuncios: Record<string, unknown>[] = (opts.anuncios ?? []).map((a, i) => ({ id: `x${i}`, expertId: "DG", ...a }));
  const inseridos: Record<string, unknown>[] = [];
  const repo = {
    experts: { porCode: async (code: string) => (code === "dg" ? { id: "DG", code: "dg", active: true } : undefined) },
    dicionario: { porValor: async (_t: string, value: string) => ({ value, active: true }) },
    adPartes: { porCode: async (_e: string, type: string, code: string) => (code === opts.semParte ? undefined : { id: `${type}-${code}`, code, type }) },
    anuncios: { porSeq: async (_e: string, seq: number) => anuncios.find((a) => a.creativeSeq === seq) },
    snapshotDeAnuncios: async () => snapDeProducao(),
    inserir: async (_e: string, v: Record<string, unknown>) => {
      const linha = { id: `novo-${v.creativeSeq}`, ...v };
      anuncios.push(linha);
      inseridos.push(linha);
      return linha;
    },
  };
  return { repo: repo as unknown as Repositorio, anuncios, inseridos };
}

describe("47.16 AC9 — os 6 anúncios do dg no ar", () => {
  it("os nomes são LITERAIS, byte a byte do levantamento — não montados pelo build (PO-05a)", () => {
    expect(ANUNCIOS_DO_DG_NO_AR.map((a) => a.name)).toEqual([
      "adv01_ia_dg_perpetuo_h01_b01_09-2026",
      "adv02_ia_dg_perpetuo_h02_b02_09-2026",
      "adv03_ia_dg_perpetuo_h03_b03_09-2026",
      "adv04_ia_dg_perpetuo_h04_b04_09-2026",
      "adv05_ia_dg_perpetuo_h05_b05_09-2026",
      "adv06_ia_dg_perpetuo_h06_b06_09-2026",
    ]);
    expect(ANUNCIOS_DO_DG_NO_AR.map((a) => a.creativeSeq)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("conferirNomes: com o snapshot de produção, os 6 são v2 válidos com os campos esperados", () => {
    expect(conferirNomes(snapDeProducao())).toEqual([]);
    // sem o h04 do dg, o nome 4 não confere — a conferência é real, não decorativa
    const semH04 = snapDeProducao();
    semH04.partes = semH04.partes!.filter((p) => p.code !== "h04");
    expect(conferirNomes(semH04)).toEqual([expect.stringContaining("adv04_ia_dg_perpetuo_h04_b04_09-2026: inválido — campo 5 (hook): h04 não está cadastrado para dg")]);
  });

  it("planejarRegistro: vazio → inserir os 6; mesmos nomes → 0 (idempotente); NN ocupado por OUTRO nome → colisão (PO-05c)", () => {
    expect(planejarRegistro([]).inserir).toHaveLength(6);
    const segunda = planejarRegistro(ANUNCIOS_DO_DG_NO_AR.map((a) => ({ creativeSeq: a.creativeSeq, name: a.name })));
    expect(segunda).toMatchObject({ inserir: [], colisoes: [] });
    expect(segunda.jaRegistrados).toHaveLength(6);
    // um byte de diferença (o `--` do formato antigo do gerador) já é OUTRO nome
    const colide = planejarRegistro([{ creativeSeq: 3, name: "adv03_ia_dg_perpetuo_h03_b03_09-2026--" }]);
    expect(colide.colisoes).toEqual([{ anuncio: ANUNCIOS_DO_DG_NO_AR[2], ocupadoPor: "adv03_ia_dg_perpetuo_h03_b03_09-2026--" }]);
    expect(colide.inserir).toHaveLength(5);
  });

  it("registrarAnunciosNoAr: 1ª rodada grava 6 (launch_seq null, origem ia, hook/body do dg, structure com `--`); 2ª grava 0", async () => {
    const f = fake();
    const r1 = await registrarAnunciosNoAr(f.repo, { aplicar: true });
    expect(r1.inseridos.map((i) => i.name)).toEqual(ANUNCIOS_DO_DG_NO_AR.map((a) => a.name));
    expect(f.inseridos[0]).toMatchObject({
      expertId: "DG",
      creativeType: "adv",
      creativeSeq: 1,
      launchType: "perpetuo",
      launchSeq: null,
      origin: "ia",
      hookId: "hook-h01",
      bodyId: "body-b01",
      adDate: "2026-09-01",
      description: null,
      structure: "adv01_ia_dg_perpetuo_h01_b01_09-2026--",
      name: "adv01_ia_dg_perpetuo_h01_b01_09-2026",
    });
    const r2 = await registrarAnunciosNoAr(f.repo, { aplicar: true });
    expect(r2.inseridos).toEqual([]);
    expect(r2.plano.jaRegistrados).toHaveLength(6);
    expect(f.anuncios).toHaveLength(6);
  });

  it("registrarAnunciosNoAr: colisão PARA sem gravar nada (nem os 5 livres); sem --aplicar só planeja; hook ausente para", async () => {
    const colide = fake({ anuncios: [{ creativeSeq: 2, name: "ad02_dg_pg04_09-2026" }] });
    await expect(registrarAnunciosNoAr(colide.repo, { aplicar: true })).rejects.toThrow(ErroDoRegistro);
    await expect(registrarAnunciosNoAr(colide.repo, { aplicar: true })).rejects.toThrow(/adv02_ia_dg_perpetuo_h02_b02_09-2026 × ad02_dg_pg04_09-2026/);
    expect(colide.inseridos).toEqual([]);

    const plano = fake();
    const r = await registrarAnunciosNoAr(plano.repo, { aplicar: false });
    expect(r).toMatchObject({ aplicado: false, inseridos: [] });
    expect(r.plano.inserir).toHaveLength(6);
    expect(plano.inseridos).toEqual([]);

    const semHook = fake({ semParte: "h05" });
    await expect(registrarAnunciosNoAr(semHook.repo, { aplicar: true })).rejects.toThrow(/h05 \(hook\)/);
    expect(semHook.inseridos).toEqual([]);
  });

  it("provarRegistro (PO-05b): discrimina — 6 linhas certas passam; nome com `--`, launch_seq 0, origem h ou hook trocado não", () => {
    const certas: LinhaDeProva[] = ANUNCIOS_DO_DG_NO_AR.map((a) => ({ creativeSeq: a.creativeSeq, name: a.name, structure: `${a.name}--`, launchType: "perpetuo", launchSeq: null, origin: "ia", hookCode: a.hook, bodyCode: a.body }));
    expect(provarRegistro(certas)).toEqual([]);
    const com = (i: number, patch: Partial<LinhaDeProva>) => certas.map((l, j) => (j === i ? { ...l, ...patch } : l));
    expect(provarRegistro(com(0, { name: `${certas[0].name}--` }))).toEqual([expect.stringContaining("NN 1 name")]);
    expect(provarRegistro(com(1, { launchSeq: 0 }))).toEqual(["NN 2 launch_seq: lido 0, esperado null"]);
    expect(provarRegistro(com(2, { origin: "h" }))).toEqual(['NN 3 origin: lido "h", esperado "ia"']);
    expect(provarRegistro(com(3, { hookCode: "h01" }))).toEqual(['NN 4 hook: lido "h01", esperado "h04"']);
    // contagem sozinha não basta, mas falta de linha também acusa
    expect(provarRegistro(certas.slice(0, 5))).toEqual(["esperadas 6 linhas com NN 1,2,3,4,5,6, encontradas 5", "NN 6: ausente"]);
  });
});

/**
 * O FIO do script: ele só roda em produção depois do deploy (e com
 * autorização), então o que se prova aqui é que o arquivo chama o que foi
 * testado acima — na transação, com a checagem da migration e com a prova.
 * Ler o fonte é grosseiro; cortar qualquer uma destas ligações derruba o teste.
 */
describe("47.16 AC9 — o script chama a lógica testada", async () => {
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const fonte = readFileSync(fileURLToPath(new URL("../scripts/registrar-anuncios-no-ar-do-dg.ts", import.meta.url)), "utf-8");

  it("confere a migration 0157 no information_schema antes de gravar", () => {
    expect(fonte).toMatch(/information_schema\.columns WHERE table_name = 'naming_ads' AND column_name = 'launch_seq'/);
    expect(fonte).toMatch(/is_nullable !== "YES"/);
  });
  it("grava numa transação pelo repositório (changelog), sem montarAnuncio; só com --aplicar", () => {
    expect(fonte).toMatch(/db\.transaction\(async \(tx\) => registrarAnunciosNoAr\(criarRepositorio\(tx\), \{ aplicar \}\)\)/);
    expect(fonte).toMatch(/process\.argv\.includes\("--aplicar"\)/);
    expect(fonte).not.toMatch(/montarAnuncio|buildAdName/);
  });
  it("termina com a prova byte a byte e sai ≠ 0 se divergir", () => {
    expect(fonte).toMatch(/const divergencias = provarRegistro\(prova\)/);
    expect(fonte).toMatch(/if \(divergencias\.length\) \{[\s\S]*?return 1;/);
  });
});
