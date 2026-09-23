import { describe, expect, it } from "vitest";
import {
  MOTIVO_FALHA,
  MOTIVO_SEM_DADOS,
  MOTIVO_SEM_PITCH,
  centesimosTruncados,
  diaNoFuso,
  estadoDaTabela,
  intervaloDoBloco,
  linhaDaTabela,
  textoDePercentual,
  totalDaTabela,
  type VslDoFunil,
} from "@/lib/utils/vturb-tabela";

/**
 * Story 29.78 — a tabela das VSLs do funil perpétuo.
 *
 * Os números de Retenção são os BRUTOS REAIS medidos pelo @sm em 2026-09-23
 * contra o painel do VTurb (story, AC3). Os de Play Rate: a story traz só a
 * taxa medida com 4 casas (hambúrguer 44,7357; PPS 30,3263), não os brutos —
 * os pares abaixo são os menores inteiros que reproduzem essas 4 casas
 * (990/2213 = 44,73565…; 158/521 = 30,32629…). O que o teste prova é o
 * truncamento dessas taxas, não os brutos daqueles players.
 */

const pct = (p: number, t: number) => {
  const c = centesimosTruncados(p, t);
  return c === null ? null : textoDePercentual(c);
};

function vsl(over: Partial<VslDoFunil> & { nome: string }): VslDoFunil {
  return {
    playerId: over.nome,
    pitchTime: 160,
    pitchConfigurado: true,
    brutos: { viewedUniq: 0, startedUniq: 0, overPitch: 0, underPitch: 0 },
    erro: null,
    ...over,
  };
}

describe("AC3 — a fórmula do VTurb, truncada a 2 casas", () => {
  it("Retenção com os brutos medidos: NETÃO 225/4032 · PPS 13/164 · hambúrguer 65/2172", () => {
    expect(pct(225, 4032)).toBe("5,58%");
    expect(pct(13, 164)).toBe("7,92%"); // 7,9268: ARREDONDAR daria 7,93
    expect(pct(65, 2172)).toBe("2,99%");
  });

  it("Play Rate truncado: 44,7357 → 44,73 (arredondar daria 44,74) · 30,3263 → 30,32", () => {
    expect(pct(990, 2213)).toBe("44,73%");
    expect(pct(158, 521)).toBe("30,32%");
  });

  it("a base da Retenção é over + under, NÃO os plays únicos (NETÃO: 3.903 plays daria 5,76%)", () => {
    const netao = vsl({ nome: "NETÃO VSL V2.mp4", brutos: { viewedUniq: 9000, startedUniq: 3903, overPitch: 225, underPitch: 3807 } });
    expect(linhaDaTabela(netao).retencao).toEqual({ texto: "5,58%", motivo: null });
  });

  it("PO-09 — razão redonda com inteiros: 57/100 → 57,00% (o piso em ponto flutuante dá 56,99%)", () => {
    expect(Math.floor((57 / 100) * 10000) / 100).toBe(56.99); // o defeito que a conta inteira evita
    expect(pct(57, 100)).toBe("57,00%");
  });

  it("PO-09 — nenhum par p ≤ t ≤ 5.000 diverge do piso exato ⌊p·10000/t⌋ (BigInt como referência)", () => {
    let divergentes = 0;
    for (let t = 1; t <= 5000; t++) {
      for (let p = 0; p <= t; p++) {
        if (centesimosTruncados(p, t) !== Number((BigInt(p) * 10000n) / BigInt(t))) divergentes++;
      }
    }
    expect(divergentes).toBe(0);
  });

  it("denominador zero é ausência, não 0% — e contagem inválida também", () => {
    expect(centesimosTruncados(0, 0)).toBeNull();
    expect(centesimosTruncados(5, 0)).toBeNull();
    expect(centesimosTruncados(1.5, 10)).toBeNull();
    expect(centesimosTruncados(0, 10)).toBe(0);
    expect(textoDePercentual(0)).toBe("0,00%");
    expect(textoDePercentual(10000)).toBe("100,00%");
  });
});

describe("AC4/AC7/AC8 — cada linha diz por que não tem número", () => {
  it("pitch não configurado → Retenção '—' com o motivo; Play Rate segue medido", () => {
    const l = linhaDaTabela(vsl({ nome: "A", pitchTime: null, pitchConfigurado: false, brutos: { viewedUniq: 2213, startedUniq: 990, overPitch: 2000, underPitch: 0 } }));
    expect(l.retencao).toEqual({ texto: null, motivo: MOTIVO_SEM_PITCH });
    expect(l.playRate.texto).toBe("44,73%");
  });

  it("vídeo sem tráfego no período (ou resposta vazia do VTurb) → '—' 'sem dados no período', nunca 0%", () => {
    const l = linhaDaTabela(vsl({ nome: "B" }));
    expect(l.playRate).toEqual({ texto: null, motivo: MOTIVO_SEM_DADOS });
    expect(l.retencao).toEqual({ texto: null, motivo: MOTIVO_SEM_DADOS });
  });

  it("falha de um vídeo aparece NA LINHA dele, com a mensagem", () => {
    const l = linhaDaTabela(vsl({ nome: "C", brutos: null, erro: "Limite de requisições do VTurb atingido." }));
    expect(l.erro).toBe("Limite de requisições do VTurb atingido.");
    expect(l.playRate).toEqual({ texto: null, motivo: MOTIVO_FALHA });
    expect(l.retencao).toEqual({ texto: null, motivo: MOTIVO_FALHA });
  });
});

describe("AC2 — Total pela soma dos brutos, nunca média de taxas", () => {
  // PPS 13/164 e hambúrguer 65/2172, com volumes de play diferentes.
  const pps = vsl({ nome: "PPS", brutos: { viewedUniq: 521, startedUniq: 158, overPitch: 13, underPitch: 151 } });
  const hamburguer = vsl({ nome: "Hambúrguer", brutos: { viewedUniq: 2213, startedUniq: 990, overPitch: 65, underPitch: 2107 } });

  it("Retenção total = Σover ÷ (Σover + Σunder) = 78/2336 → 3,33% (a média das taxas daria 5,45%)", () => {
    const t = totalDaTabela([pps, hamburguer]);
    expect(t.retencao.texto).toBe("3,33%");
    expect(t.playRate.texto).toBe(pct(158 + 990, 521 + 2213)); // 1148/2734 = 41,98…
    expect(t.playRate.texto).toBe("41,98%");
  });

  it("vídeo sem pitch entra no Play Rate e sai da Retenção do Total, e a tabela diz qual", () => {
    const semPitch = vsl({ nome: "Sem pitch", pitchTime: null, pitchConfigurado: false, brutos: { viewedUniq: 1000, startedUniq: 500, overPitch: 999, underPitch: 1 } });
    const t = totalDaTabela([pps, semPitch]);
    expect(t.retencao.texto).toBe("7,92%"); // só o PPS
    expect(t.playRate.texto).toBe(pct(158 + 500, 521 + 1000));
    expect(t.foraDaRetencao).toEqual(["Sem pitch"]);
  });

  it("vídeo com falha sai do Total inteiro, com a indicação", () => {
    const falhou = vsl({ nome: "Falhou", brutos: null, erro: "VTurb respondeu 500" });
    const t = totalDaTabela([pps, falhou]);
    expect(t.playRate.texto).toBe("30,32%");
    expect(t.retencao.texto).toBe("7,92%");
    expect(t.foraPorFalha).toEqual(["Falhou"]);
  });

  it("nenhum vídeo com pitch → Retenção do Total '—' pelo pitch; todos falharam → '—' pela falha", () => {
    const semPitch = vsl({ nome: "X", pitchConfigurado: false, pitchTime: null, brutos: { viewedUniq: 10, startedUniq: 5, overPitch: 5, underPitch: 0 } });
    expect(totalDaTabela([semPitch]).retencao).toEqual({ texto: null, motivo: MOTIVO_SEM_PITCH });
    const t = totalDaTabela([vsl({ nome: "Y", brutos: null, erro: "x" })]);
    expect(t.playRate).toEqual({ texto: null, motivo: MOTIVO_FALHA });
    expect(t.retencao).toEqual({ texto: null, motivo: MOTIVO_FALHA });
  });
});

describe("AC1/AC8/AC9 — quando a tabela aparece", () => {
  const base = { ehPerpetuo: true, carregando: false, statusDoErro: null, temErro: false, quantidade: 2 };

  it("só no perpétuo — lançamento e mobile seguem sem a tabela", () => {
    expect(estadoDaTabela({ ...base, ehPerpetuo: false })).toBe("oculta");
    expect(estadoDaTabela(base)).toBe("pronta");
  });

  it("API antiga (404: a rota não existe) → o bloco fica como era, sem erro", () => {
    expect(estadoDaTabela({ ...base, temErro: true, statusDoErro: 404 })).toBe("oculta");
  });

  it("qualquer outra falha aparece como erro — nunca uma tabela vazia calada", () => {
    expect(estadoDaTabela({ ...base, temErro: true, statusDoErro: 502 })).toBe("erro");
    expect(estadoDaTabela({ ...base, temErro: true, statusDoErro: undefined })).toBe("erro");
  });

  it("funil sem vídeo (200 com lista vazia) → sem tabela; carregando → esqueleto", () => {
    expect(estadoDaTabela({ ...base, quantidade: 0 })).toBe("oculta");
    expect(estadoDaTabela({ ...base, carregando: true, quantidade: undefined })).toBe("carregando");
  });
});

describe("AC6 — a janela no fuso da conexão, não em UTC", () => {
  // 23/09 às 22h em São Paulo = 24/09 01h em UTC: o `toISOString` antigo já
  // pedia ao VTurb o dia 24.
  const noiteEmSP = new Date("2026-09-24T01:00:00.000Z");

  it("às 22h em São Paulo, 'hoje' ainda é 23/09", () => {
    expect(diaNoFuso(noiteEmSP, "America/Sao_Paulo")).toBe("2026-09-23");
    expect(noiteEmSP.toISOString().slice(0, 10)).toBe("2026-09-24"); // o defeito
  });

  it("intervalo de 30 dias termina hoje no fuso e começa 30 dias antes (a régua de sempre)", () => {
    expect(intervaloDoBloco(30, "America/Sao_Paulo", noiteEmSP)).toEqual({ startDate: "2026-08-24", endDate: "2026-09-23" });
    expect(intervaloDoBloco(7, "America/Sao_Paulo", noiteEmSP)).toEqual({ startDate: "2026-09-16", endDate: "2026-09-23" });
  });

  it("sem fuso ou fuso inválido → São Paulo (o padrão da conexão)", () => {
    expect(diaNoFuso(noiteEmSP, null)).toBe("2026-09-23");
    expect(diaNoFuso(noiteEmSP, "Fuso/Inexistente")).toBe("2026-09-23");
  });
});
