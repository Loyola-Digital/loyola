/**
 * Story 49.5 AC6 — as 10 armadilhas de `data/armadilhas-conhecidas.md` da skill
 * `loyola-debriefing`: cada uma com um positivo (o payload dos motores reais
 * passa) e um negativo (o payload adulterado como a armadilha o deixaria falha
 * na guarda). E o ponta a ponta: os motores REAIS sobre uma entrada que contém
 * cada armadilha produzem um payload que passa em todos os invariantes — e a
 * correção desfeita na entrada do motor faz a guarda correspondente falhar.
 */

import { describe, expect, it } from "vitest";
import { computeDebriefingMoneyTime } from "../services/debriefing-money-time-engine.js";
import { computeDebriefingAudience } from "../services/debriefing-audience-engine.js";
import { montarPayloadDebriefing, type DebriefingPayload } from "../services/debriefing-payload.js";
import { validateDebriefing, type CodigoAlertaFase12, type CodigoInvarianteFase12 } from "../services/debriefing-guards.js";
import {
  GERADO_EM,
  classificador,
  configSintetica,
  entradaAudienceSintetica,
  entradaMoneyTimeSintetica,
  payloadMinimo,
  payloadSintetico,
} from "./fixtures/debriefing-payload-sintetico.js";

const inv = (p: DebriefingPayload, c: CodigoInvarianteFase12) => validateDebriefing(p).invariantes.find((i) => i.codigo === c)!.status;
const alerta = (p: DebriefingPayload, c: CodigoAlertaFase12) => validateDebriefing(p).alertas.find((a) => a.codigo === c);
const mutado = (f: (p: DebriefingPayload) => void) => {
  const p = payloadMinimo();
  f(p);
  return p;
};

type Armadilha = { n: number; nome: string; guardas: CodigoInvarianteFase12[]; negativos: [string, CodigoInvarianteFase12, (p: DebriefingPayload) => void][] };

const ARMADILHAS: Armadilha[] = [
  {
    n: 1,
    nome: "duplicatas → faturamento dobrado",
    guardas: ["F1"],
    negativos: [["faturamento dobrado em um caminho de soma", "F1", (p) => void (p.dinheiroTempo.faturamentoPorEtapa.captacao *= 2)]],
  },
  {
    n: 2,
    nome: "29.9 lido como 299",
    guardas: ["F15"],
    negativos: [["grupo monetário já parseado", "F15", (p) => void ((p.dinheiroTempo.origemDoValor as Record<string, string>).captacao = "ja-parseado")]],
  },
  {
    n: 3,
    nome: "combo contado como ingresso",
    guardas: ["F14"],
    negativos: [
      [
        "produto da captação sem papel resolvido pelo default",
        "F14",
        (p) => void p.dinheiroTempo.produtosNaoClassificados.push({ produto: "Combo Novo", vendas: 3, faturamento: 891, tiposAssumidos: ["principal"] }),
      ],
    ],
  },
  {
    n: 4,
    nome: "coorte pela coluna de data errada",
    guardas: ["F7"],
    negativos: [["baseDeData: venda", "F7", (p) => void ((p.dinheiroTempo.coorte as { baseDeData: string }).baseDeData = "venda")]],
  },
  {
    n: 5,
    nome: "Sem Track só pela UTM do lead",
    guardas: ["F3", "F4", "F5"],
    negativos: [
      [
        "Sem track real > 0 com UTM de venda presente (conta de canais não fecha)",
        "F5",
        (p) => {
          const c = p.dinheiroTempo.compradores.find((x) => x.canal === "Pago Quente")!;
          c.canal = "Sem track real";
        },
      ],
      [
        "comprador só com UTM de closer contado em Sem track real em vez do balde só-closer (R2-5)",
        "F5",
        (p) => {
          const t = p.dinheiroTempo.tabela1.canais;
          t.find((x) => x.canal === "Aquisição não rastreada (só closer)")!.ingressos += 1;
          t.find((x) => x.canal === "Sem track real")!.ingressos -= 1;
        },
      ],
    ],
  },
  {
    n: 6,
    nome: "pesquisa com e-mails repetidos",
    guardas: ["F9"],
    negativos: [["respondentes ≠ linhas − vazias − repetidas", "F9", (p) => void (p.publico.pesquisa.duplicadasRemovidas = 0)]],
  },
  {
    n: 7,
    nome: "coorte cortada por MAXD curto",
    guardas: ["F7"],
    negativos: [
      [
        "maxD = 35 com venda em D+39 fora dos buckets",
        "F7",
        (p) => {
          const c = p.dinheiroTempo.coorte;
          c.maxD = 35;
          c.serie.find((s) => s.dMais === 39)!.vendas += 1;
          c.serie.find((s) => s.dMais === 1)!.vendas -= 1;
        },
      ],
    ],
  },
  {
    n: 8,
    nome: "Comunidade/Front somados a canais",
    guardas: ["F5"],
    negativos: [
      ["canal Front na Tabela 1", "F5", (p) => void (p.dinheiroTempo.tabela1.canais[2]!.canal = "Front" as never)],
      ["canal Closer na Tabela 1", "F5", (p) => void (p.dinheiroTempo.tabela1.canais[2]!.canal = "Closer" as never)],
    ],
  },
  {
    n: 9,
    nome: "classificadores diferentes",
    guardas: ["F6"],
    negativos: [
      ["classificadorVersao diferente", "F6", (p) => void (p.dinheiroTempo.classificadorVersao = "49.2-v1")],
      [
        "mesma tupla com dois rótulos de canal",
        "F6",
        (p) => {
          const t = p.dinheiroTempo.tuplasClassificadas.find((x) => x.canal === "Pago Quente")!;
          p.publico.tuplasClassificadas.push({ ...t, canal: "Sem track real", segmento: "Sem track" });
        },
      ],
    ],
  },
];

describe("AC6 — armadilhas 1–9 (invariantes)", () => {
  for (const a of ARMADILHAS) {
    it(`#${a.n} ${a.nome}: o payload dos motores reais passa em ${a.guardas.join("/")}`, () => {
      const p = payloadMinimo();
      for (const g of a.guardas) expect(inv(p, g)).toBe("passed");
    });
    for (const [nome, guarda, mutar] of a.negativos) {
      it(`#${a.n} negativo — ${nome} → ${guarda} falha`, () => {
        expect(inv(mutado(mutar), guarda)).toBe("failed");
      });
    }
  }
});

describe("AC6 — armadilha 10 (ROAS diário em dia de gasto ~zero)", () => {
  it("positivo: o dia de R$ 1,14 sai sinalizado e o WF6 o cita", () => {
    const p = payloadMinimo();
    expect(p.dinheiroTempo.roasDiarioCaptacao.find((d) => d.dia === "2026-04-22")!.picoArtefato).toBe(true);
    expect(alerta(p, "WF6")!.mensagem).toMatch(/D\+5 \(2026-04-22/);
  });

  it("negativo: dia abaixo do limiar NÃO sinalizado pelo motor — o alerta ausente é detectado", () => {
    const p = mutado((x) => void (x.dinheiroTempo.roasDiarioCaptacao.find((d) => d.dia === "2026-04-22")!.picoArtefato = false));
    const a = alerta(p, "WF6");
    expect(a).toBeDefined();
    expect(a!.mensagem).toMatch(/1 dia\(s\) abaixo do limiar NÃO sinalizado\(s\) pelo motor: D\+5/);
    expect(validateDebriefing(p).bloqueado).toBe(false);
  });
});

describe("AC6 — ponta a ponta com os motores reais", () => {
  it("a entrada contém cada armadilha e o payload passa em todos os invariantes", () => {
    const p = payloadSintetico();
    const m = p.dinheiroTempo;
    // #1 dup 2× removida pela camada 1
    expect(m.dedup.camada1.removidas).toBe(1);
    // #2 "4.000" é quatro mil
    expect(m.auditoriaDeVendas.filter((a) => a.valor === 4000)).toHaveLength(3);
    // #3 produto fora do mapa listado (assumido ingresso pela regra do painel)
    expect(m.produtosNaoClassificados).toEqual([{ produto: "Produto Novo", vendas: 1, faturamento: 99, tiposAssumidos: ["ingresso"] }]);
    // telefone com ".0" não cria comprador a mais no critério com telefone
    expect(m.captacao.compradoresUnicos.porEmailOuTelefone).toBe(m.captacao.compradoresUnicos.porEmail);
    // #6 e-mail repetido na pesquisa
    expect(p.publico.pesquisa.duplicadasRemovidas).toBe(1);
    // #4 coorte pelo lead
    expect(m.coorte.baseDeData).toBe("lead");
    // decisão 7: principal antes da abertura
    expect(m.vendasExcluidas).toHaveLength(1);

    const r = validateDebriefing(p);
    expect(r.invariantes.filter((i) => i.status === "failed")).toEqual([]);
    expect(r.bloqueado).toBe(false);
  });

  it("#3 desfeito na entrada: produto da captação que o loader pôs no default de uma etapa de Vendas → F14 bloqueia", () => {
    const mtIn = entradaMoneyTimeSintetica();
    const v = mtIn.vendas.find((x) => x.produto === "Produto Novo")!;
    (v as { tipo: string }).tipo = "principal";
    const mt = computeDebriefingMoneyTime(mtIn);
    const au = computeDebriefingAudience(entradaAudienceSintetica(mtIn));
    const p = montarPayloadDebriefing(mt, au, configSintetica(), GERADO_EM);
    expect(inv(p, "F14")).toBe("failed");
  });

  it("#9 desfeito na entrada: o Motor II com outra versão do classificador → F6 bloqueia", () => {
    const mtIn = entradaMoneyTimeSintetica();
    const mt = computeDebriefingMoneyTime(mtIn);
    const au = computeDebriefingAudience({ ...entradaAudienceSintetica(mtIn), classificador: { ...classificador, versao: "outra-versao" } });
    expect(inv(montarPayloadDebriefing(mt, au, configSintetica(), GERADO_EM), "F6")).toBe("failed");
  });

  it("#9 desfeito na entrada: o Motor II com outra regra de closer (mesma versão) → F6 acha a tupla com dois rótulos", () => {
    const mtIn = entradaMoneyTimeSintetica();
    const mt = computeDebriefingMoneyTime(mtIn);
    // Mesma versão, regra de closer diferente: toda venda vira "closer".
    const outro: typeof classificador = { ...classificador, classificar: (e) => ({ ...classificador.classificar(e), fechamento: "closer" }) };
    const au = computeDebriefingAudience({ ...entradaAudienceSintetica(mtIn), classificador: outro });
    expect(inv(montarPayloadDebriefing(mt, au, configSintetica(), GERADO_EM), "F6")).toBe("failed");
  });

  it("F3 desfeito na entrada: o Motor II recebe as vendas sem a higiene da 49.3 → compradores diferentes bloqueiam", () => {
    const mtIn = entradaMoneyTimeSintetica();
    const mt = computeDebriefingMoneyTime(mtIn);
    const auIn = entradaAudienceSintetica(mtIn);
    // Sem o corte "principal antes da abertura" e sem a dedup: o comprador c3 da venda excluída entra.
    const extra = { ...auIn.compradores[0]!, emailCru: "c-extra@x.com", comprouCaptacao: true };
    const au = computeDebriefingAudience({ ...auIn, compradores: [...auIn.compradores, extra] });
    expect(inv(montarPayloadDebriefing(mt, au, configSintetica(), GERADO_EM), "F3")).toBe("failed");
  });
});
