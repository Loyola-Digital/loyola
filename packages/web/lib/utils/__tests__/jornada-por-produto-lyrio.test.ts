/**
 * Story 42.18 (AC4, AC5b) — a tabela "Por produto × canal" dentro do bloco da
 * Jornada: as colunas, as taxas contra os novos DO CANAL, o "—" e o 0%, a
 * paridade com a tabela por canal (AC4c), a dica dos `product_id` (PO-01) e o
 * fio até a tela (o `.tsx` não é coletado — a ligação é provada lendo o fonte,
 * como em `jornada-lyrio.test.ts`).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ARREDONDAMENTO_DO_POR_PRODUTO,
  DICA_DO_POR_PRODUTO,
  colunasDoPorProduto,
  colunasSemParidade,
  dicaDaLinhaDoPorProduto,
  formatarTaxa,
  taxaDaJornada,
  taxasDoPorProduto,
  type CanalDaJornada,
  type ContagemDaJornada,
  type JornadaDoLyrio,
  type LinhaDoPorProduto,
  type PorProdutoDaJornada,
} from "../jornada-lyrio";

const CANAIS: CanalDaJornada[] = ["google_gclid", "meta_install", "meta_fbclid", "organico", "sem_ios", "sem_android", "campanha_meta", "campanha_google"];
const conta = (novos: number, iniciou: number, iniciouTeste: number): ContagemDaJornada => ({ novos, viuPaywall: novos, interagiu: 0, iniciou, iniciouTeste, pagou: 0, receitaUsd: 0 });

/**
 * Google: 3 novos (Anual por trial, Mensal, Sem produto). Orgânico: 7 novos (2
 * Anual por trial, 1 Outros). Meta (fbclid): 0 novos. Conflito: 1 novo, Anual
 * por trial. Os outros canais: 1 novo cada, sem início.
 */
function fixture(): JornadaDoLyrio {
  const novos: Record<CanalDaJornada, number> = { google_gclid: 3, meta_install: 1, meta_fbclid: 0, organico: 7, sem_ios: 1, sem_android: 1, campanha_meta: 1, campanha_google: 1, campanha: 0 };
  const cel: Partial<Record<LinhaDoPorProduto, Partial<Record<CanalDaJornada, [number, number]>>>> = {
    anual: { google_gclid: [1, 1], organico: [2, 2] },
    mensal: { google_gclid: [1, 0] },
    outros: { organico: [1, 0] },
    sem_produto: { google_gclid: [1, 0] },
  };
  const linhas: PorProdutoDaJornada["linhas"] = (["mensal", "trimestral", "semestral", "anual", "outros", "sem_produto"] as const).map((linha) => {
    const canais = CANAIS.map((canal) => ({ canal, iniciou: cel[linha]?.[canal]?.[0] ?? 0, iniciouTeste: cel[linha]?.[canal]?.[1] ?? 0 }));
    const conflito = linha === "anual" ? { iniciou: 1, iniciouTeste: 1 } : { iniciou: 0, iniciouTeste: 0 };
    return {
      linha,
      rotulo: { mensal: "Mensal", trimestral: "Trimestral", semestral: "Semestral", anual: "Anual", outros: "Outros", sem_produto: "Sem produto" }[linha],
      canais,
      conflito,
      total: { iniciou: canais.reduce((a, x) => a + x.iniciou, 0) + conflito.iniciou, iniciouTeste: canais.reduce((a, x) => a + x.iniciouTeste, 0) + conflito.iniciouTeste },
      produtos:
        linha === "anual"
          ? [{ productId: "premium_yearly_150", iniciou: 3, iniciouTeste: 3 }, { productId: "premium_yearly_100:base", iniciou: 1, iniciouTeste: 1 }]
          : linha === "outros"
            ? [{ productId: "rc_promo_Lyrio Pro_daily", iniciou: 1, iniciouTeste: 0 }]
            : linha === "mensal"
              ? [{ productId: "premium_monthly_15:base", iniciou: 1, iniciouTeste: 0 }]
              : [],
    };
  });
  const porProduto: PorProdutoDaJornada = {
    canais: CANAIS.map((canal) => ({ canal, rotulo: canal, novos: novos[canal] })),
    conflito: { novos: 1 },
    total: { novos: CANAIS.reduce((a, c) => a + novos[c], 0) + 1 },
    linhas,
  };
  const iniciouDe = (canal: CanalDaJornada) => linhas.reduce((a, l) => a + l.canais.find((x) => x.canal === canal)!.iniciou, 0);
  const testeDe = (canal: CanalDaJornada) => linhas.reduce((a, l) => a + l.canais.find((x) => x.canal === canal)!.iniciouTeste, 0);
  return {
    days: 28,
    desde: "2026-09-19",
    assinaturaDesde: "2026-08-10",
    linhas: CANAIS.map((canal) => ({ canal, rotulo: canal, ...conta(novos[canal], iniciouDe(canal), testeDe(canal)) })),
    conflito: conta(1, 1, 1),
    total: conta(porProduto.total.novos, 7, 4),
    porProduto,
  };
}

const linhaDe = (j: JornadaDoLyrio, l: LinhaDoPorProduto) => j.porProduto!.linhas.find((x) => x.linha === l)!;
const colunaDe = (j: JornadaDoLyrio, chave: string) => colunasDoPorProduto(j.porProduto!).find((c) => c.chave === chave)!;

describe("AC4a — as colunas: os 8 canais na ordem da Jornada, o conflito quando houver, o Total", () => {
  it("8 canais + conflito + Total; sem conflito, a coluna não aparece", () => {
    const j = fixture();
    expect(colunasDoPorProduto(j.porProduto!).map((c) => c.chave)).toEqual([...CANAIS, "conflito", "total"]);
    const semConflito = { ...j.porProduto!, conflito: { novos: 0 } };
    expect(colunasDoPorProduto(semConflito).map((c) => c.chave)).toEqual([...CANAIS, "total"]);
  });
});

describe("AC4a/AC4e — as taxas contra os novos DO CANAL", () => {
  it("Anual no Google: 1 trial e 1 iniciou sobre 3 novos do canal; no Orgânico, 2 sobre 7", () => {
    const j = fixture();
    expect(taxasDoPorProduto(linhaDe(j, "anual"), colunaDe(j, "google_gclid"))).toEqual({ trial: 1 / 3, iniciou: 1 / 3 });
    expect(taxasDoPorProduto(linhaDe(j, "anual"), colunaDe(j, "organico"))).toEqual({ trial: 2 / 7, iniciou: 2 / 7 });
    expect(taxasDoPorProduto(linhaDe(j, "mensal"), colunaDe(j, "google_gclid"))).toEqual({ trial: 0, iniciou: 1 / 3 });
  });
  it("conflito e Total usam os próprios novos (o Total inclui o conflito)", () => {
    const j = fixture();
    expect(taxasDoPorProduto(linhaDe(j, "anual"), colunaDe(j, "conflito"))).toEqual({ trial: 1, iniciou: 1 });
    expect(taxasDoPorProduto(linhaDe(j, "anual"), colunaDe(j, "total"))).toEqual({ trial: 4 / 16, iniciou: 4 / 16 });
  });
  it("canal com 0 novos → '—'; com novos e ninguém no plano → 0%", () => {
    const j = fixture();
    const fbclid = taxasDoPorProduto(linhaDe(j, "anual"), colunaDe(j, "meta_fbclid"));
    expect([formatarTaxa(fbclid.trial), formatarTaxa(fbclid.iniciou)]).toEqual(["—", "—"]);
    const trimestral = taxasDoPorProduto(linhaDe(j, "trimestral"), colunaDe(j, "google_gclid"));
    expect([formatarTaxa(trimestral.trial), formatarTaxa(trimestral.iniciou)]).toEqual(["0,0%", "0,0%"]);
  });
});

describe("AC4c / AC5b — a paridade com a tabela por canal", () => {
  it("na fixture (um canal sem novos e um conflito), toda coluna fecha", () => {
    expect(colunasSemParidade(fixture())).toEqual([]);
  });
  it("uma linha a mais num canal (ou no conflito) aparece como coluna sem paridade", () => {
    const j = fixture();
    linhaDe(j, "outros").canais.find((x) => x.canal === "organico")!.iniciou += 1;
    expect(colunasSemParidade(j)).toEqual(["organico"]);
    const k = fixture();
    linhaDe(k, "anual").conflito.iniciouTeste = 0;
    expect(colunasSemParidade(k)).toEqual(["conflito"]);
  });
  it("QA TEST-002 — novos diferentes num canal, sem mexer nas contagens, também quebram a paridade", () => {
    const j = fixture();
    j.porProduto!.canais.find((x) => x.canal === "organico")!.novos += 1;
    expect(colunasSemParidade(j)).toEqual(["organico"]);
  });
  it("QA TEST-002 — o Total é conferido: uma linha com o total desalinhado dos canais aparece como \"total\"", () => {
    const j = fixture();
    linhaDe(j, "anual").total.iniciou += 1;
    expect(colunasSemParidade(j)).toEqual(["total"]);
    const k = fixture();
    k.porProduto!.total.novos += 1;
    expect(colunasSemParidade(k)).toEqual(["total"]);
  });
  it("a soma das taxas EXIBIDAS fica dentro do arredondamento declarado da taxa do canal", () => {
    const j = fixture();
    const pp = (s: string) => Number(s.replace("%", "").replace(",", "."));
    for (const c of colunasDoPorProduto(j.porProduto!)) {
      if (c.novos === 0) continue;
      const alvo = c.chave === "total" ? j.total : c.chave === "conflito" ? j.conflito! : j.linhas.find((l) => l.canal === c.chave)!;
      for (const [campo, chave] of [["iniciou", "iniciou"], ["trial", "iniciouTeste"]] as const) {
        const taxas = j.porProduto!.linhas.map((l) => taxasDoPorProduto(l, c)[campo]!);
        const comValor = taxas.filter((t) => t > 0).length;
        const somaExibida = taxas.reduce((a, t) => a + pp(formatarTaxa(t)), 0);
        const doCanal = pp(formatarTaxa(taxaDaJornada(alvo[chave], alvo.novos)));
        expect(Math.abs(somaExibida - doCanal)).toBeLessThanOrEqual(0.05 * comValor + 0.05 + 1e-9);
      }
    }
    expect(ARREDONDAMENTO_DO_POR_PRODUTO).toMatch(/0,1 ponto percentual.*0,05 ponto por linha com valor, mais 0,05/);
  });
  it("com a API anterior (sem porProduto), nada a conferir", () => {
    const antiga: JornadaDoLyrio = { ...fixture(), porProduto: undefined };
    expect(colunasSemParidade(antiga)).toEqual([]);
  });
});

describe("AC2b (PO-01) e AC4d — as dicas", () => {
  it("a dica da linha lista os product_id que caíram nela", () => {
    const j = fixture();
    expect(dicaDaLinhaDoPorProduto(linhaDe(j, "outros"))).toBe("Produtos nesta linha: rc_promo_Lyrio Pro_daily (1 iniciaram; 0 por trial)");
    expect(dicaDaLinhaDoPorProduto(linhaDe(j, "anual"))).toBe("Produtos nesta linha: premium_yearly_150 (3 iniciaram; 3 por trial) · premium_yearly_100:base (1 iniciaram; 1 por trial)");
    expect(dicaDaLinhaDoPorProduto(linhaDe(j, "semestral"))).toBe("Nenhum produto nesta linha na janela.");
    expect(dicaDaLinhaDoPorProduto(linhaDe(j, "sem_produto"))).toMatch(/sem product_id/);
  });
  it("a dica do cabeçalho é a da story", () => {
    expect(DICA_DO_POR_PRODUTO).toBe(
      "Novos do canal na janela que iniciaram este plano ÷ todos os novos do canal. O usuário novo não tem produto antes de iniciar, por isso o denominador é o canal.",
    );
  });
});

const ler = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf-8");

describe("o fio até a tela (AC4a/b/f/g, PO-02)", () => {
  const bloco = ler("../../../components/funnels/lyrio-jornada-por-canal.tsx");

  it("a tabela fica DENTRO do bloco da Jornada, abaixo da tabela por canal, e só com porProduto", () => {
    const fimDaPrimeira = bloco.indexOf("<Celulas c={estado.dados.total} />");
    const segunda = bloco.indexOf("{estado.dados.porProduto && <TabelaPorProduto jornada={estado.dados} p={estado.dados.porProduto} />}");
    expect(fimDaPrimeira).toBeGreaterThan(0);
    expect(segunda).toBeGreaterThan(fimDaPrimeira);
    // depois do estado "pronto": o erro e o carregando vêm antes
    expect(segunda).toBeGreaterThan(bloco.indexOf('estado.tipo === "erro"'));
    expect(bloco.split("<TabelaPorProduto").length - 1).toBe(1);
  });
  it("as colunas, as taxas e a dica vêm das funções testadas", () => {
    expect(bloco).toMatch(/const colunas = colunasDoPorProduto\(p\);/);
    expect(bloco).toMatch(/const t = taxasDoPorProduto\(l, c\);/);
    expect(bloco).toMatch(/\{formatarTaxa\(t\.trial\)\}<\/td>\s*<td className=\{td\}>\{formatarTaxa\(t\.iniciou\)\}/);
    expect(bloco).toMatch(/title=\{dicaDaLinhaDoPorProduto\(l\)\}/);
    expect(bloco).toMatch(/title=\{DICA_DO_POR_PRODUTO\}>→ Trial<\/th>/);
    expect(bloco).toMatch(/\{ARREDONDAMENTO_DO_POR_PRODUTO\}/);
    expect(bloco).toMatch(/const semParidade = colunasSemParidade\(jornada\);/);
    // QA TEST-002: o aviso é DESENHADO quando há coluna sem paridade, com as colunas nele
    expect(bloco).toMatch(/\{semParidade\.length > 0 && \(\s*<p role="alert"[^>]*>\s*A soma por plano não fecha com a tabela por canal em: \{semParidade\.join\(", "\)\}\./);
  });
  it("PO-02: cabeçalho em duas linhas (canal em cima com colSpan 2); AC4g: rolagem na tabela e a coluna Plano fixa", () => {
    expect(bloco).toMatch(/<th key=\{c\.chave\} colSpan=\{2\}/);
    expect(bloco).toMatch(/<th rowSpan=\{2\} className=\{`\$\{plano\}/);
    expect(bloco).toMatch(/const plano = "sticky left-0 [^"]*bg-background/);
    expect(bloco).toMatch(/<td className=\{plano\} title=/);
    const tabela = bloco.slice(bloco.indexOf("function TabelaPorProduto"));
    expect(tabela).toMatch(/<div className="overflow-x-auto">\s*<table/);
  });
});
