import { describe, expect, it } from "vitest";
import {
  MOTIVO_API_ANTERIOR,
  MOTIVO_FALHA,
  MOTIVO_SEM_DADOS,
  MOTIVO_SEM_DURACAO,
  MOTIVO_SEM_PITCH,
  centesimosDeDecimal,
  centesimosTruncados,
  diaNoFuso,
  estadoDaTabela,
  intervaloDoBloco,
  linhaDaTabela,
  periodoDoCabecalho,
  pitchConfiguradoNoPainel,
  textoDeContagem,
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

  // TEST-002a (gate) — o caso misto: o vídeo que falhou TEM pitch (o pitch vem
  // da `/players/list`, independente da `sessions/stats` que falhou), e o único
  // lido não tem. O "—" da Retenção do Total é pelo pitch, não "sem dados".
  it("caso misto [falhou com pitch, lido sem pitch] → Retenção do Total '—' pelo pitch", () => {
    const falhou = vsl({ nome: "Falhou", pitchConfigurado: true, pitchTime: 160, brutos: null, erro: "VTurb respondeu 500" });
    const semPitch = vsl({ nome: "Sem pitch", pitchConfigurado: false, pitchTime: null, brutos: { viewedUniq: 1000, startedUniq: 500, overPitch: 999, underPitch: 1 } });
    const t = totalDaTabela([falhou, semPitch]);
    expect(t.retencao).toEqual({ texto: null, motivo: MOTIVO_SEM_PITCH });
    expect(t.playRate.texto).toBe("50,00%");
    expect(t.foraPorFalha).toEqual(["Falhou"]);
    expect(t.foraDaRetencao).toEqual(["Sem pitch"]);
  });
});

describe("AC12 — o painel por vídeo só fala em pitch com pitch válido", () => {
  it("pitch atual positivo → configurado", () => {
    expect(pitchConfiguradoNoPainel(95)).toBe(true);
    expect(pitchConfiguradoNoPainel(1)).toBe(true);
  });

  it("0 (a cópia da API antiga em 498 de 574 players), ausente ou inválido → '—' com o motivo", () => {
    expect(pitchConfiguradoNoPainel(0)).toBe(false);
    expect(pitchConfiguradoNoPainel(null)).toBe(false);
    expect(pitchConfiguradoNoPainel(undefined)).toBe(false);
    expect(pitchConfiguradoNoPainel(-5)).toBe(false);
    expect(pitchConfiguradoNoPainel(Number.NaN)).toBe(false);
  });
});

describe("DOC-001 — o período do cabeçalho é o das linhas na tela", () => {
  const pedido = { startDate: "2026-09-16", endDate: "2026-09-23" };
  const devolvido = { funnelId: "f", videos: [], range: { startDate: "2026-08-24", endDate: "2026-09-23", timezone: "America/Sao_Paulo" } };

  it("com linhas (inclusive as antigas, esmaecidas na troca de período) → a janela devolvida pela rota", () => {
    expect(periodoDoCabecalho("pronta", devolvido, pedido)).toEqual({ startDate: "2026-08-24", endDate: "2026-09-23" });
  });

  it("sem linhas (esqueleto, erro) → a janela pedida", () => {
    expect(periodoDoCabecalho("carregando", undefined, pedido)).toEqual(pedido);
    expect(periodoDoCabecalho("erro", devolvido, pedido)).toEqual(pedido);
    expect(periodoDoCabecalho("erro", undefined, pedido)).toEqual(pedido);
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

// ============================================================
// Story 29.82 — as colunas completas do VTurb.
//
// Os brutos abaixo são os MEDIDOS no VTurb em 2026-10-09 (janela 09/09 →
// 08/10, payload da rota nova no Dev Agent Record da story): 3 players perpétuos com Plays ≠ Plays
// Únicos e durações diferentes, para a escolha do AC3 (plays = total_started,
// resposta do dono) e o peso pela duração serem observáveis no Total.
// ============================================================

function vslCompleta(
  nome: string,
  b: { viewed: number; viewedUniq: number; started: number; startedUniq: number; over: number; under: number; clicked: number; eng: number },
  duracao: number | null,
  over: Partial<VslDoFunil> = {},
): VslDoFunil {
  return vsl({
    nome,
    duracao,
    brutos: {
      viewedUniq: b.viewedUniq,
      startedUniq: b.startedUniq,
      overPitch: b.over,
      underPitch: b.under,
      viewed: b.viewed,
      started: b.started,
      clicked: b.clicked,
      engagementRate: b.eng,
    },
    ...over,
  });
}

const V1 = vslCompleta("V1", { viewed: 905, viewedUniq: 774, started: 331, startedUniq: 310, over: 87, under: 211, clicked: 49, eng: 30.05 }, 684);
const V6 = vslCompleta("V6", { viewed: 15128, viewedUniq: 13792, started: 5181, startedUniq: 5130, over: 308, under: 4917, clicked: 0, eng: 12.77 }, 303);
const V5 = vslCompleta("V5", { viewed: 109, viewedUniq: 81, started: 64, startedUniq: 62, over: 40, under: 21, clicked: 9, eng: 70.49 }, 375);

describe("Story 29.82 AC1/AC5 — cada coluna nova a partir dos brutos", () => {
  it("contagens com milhar pt-BR; Audiência do Pitch = total_over_pitch; Engajamento do VTurb truncado", () => {
    const l = linhaDaTabela(V6);
    expect(l.visualizacoes.texto).toBe("15.128");
    expect(l.visUnicas.texto).toBe("13.792");
    expect(l.plays.texto).toBe("5.181");
    expect(l.playsUnicos.texto).toBe("5.130");
    expect(l.audienciaPitch.texto).toBe("308");
    expect(l.engajamento.texto).toBe("12,77%");
    expect(l.cliques).toEqual({ texto: "0", motivo: null }); // um 0 real é 0 (R1)
  });

  it("Cliques no Botão é o NÚMERO do VTurb — sem %, nunca cliques ÷ views", () => {
    const l = linhaDaTabela(V1);
    expect(l.cliques.texto).toBe("49");
    expect(l.cliques.texto).not.toContain("%");
  });

  it("Plays é total_started e Plays Únicos é o único — não se confundem", () => {
    const l = linhaDaTabela(V1);
    expect(l.plays.texto).toBe("331");
    expect(l.playsUnicos.texto).toBe("310");
    expect(l.visualizacoes.texto).toBe("905");
    expect(l.visUnicas.texto).toBe("774");
  });

  it("textoDeContagem: separador de milhar pt-BR", () => {
    expect(textoDeContagem(1234567)).toBe("1.234.567");
    expect(textoDeContagem(0)).toBe("0");
  });
});

describe("Story 29.82 AC5/PO-04 — truncagem do Engajamento imune a ponto flutuante", () => {
  it("0,29 do VTurb aparece 0,29% (o piso em float dá 0,28%); 16,1 aparece 16,10%", () => {
    expect(Math.floor(0.29 * 100)).toBe(28); // o defeito que a conta exata evita
    expect(centesimosDeDecimal(0.29)).toBe(29);
    expect(centesimosDeDecimal(16.1)).toBe(1610);
    expect(centesimosDeDecimal(30.0585)).toBe(3005); // trunca, não arredonda
    const l = (eng: number) => linhaDaTabela(vslCompleta("x", { viewed: 1, viewedUniq: 1, started: 1, startedUniq: 1, over: 0, under: 1, clicked: 0, eng }, 100));
    expect(l(0.29).engajamento.texto).toBe("0,29%");
    expect(l(16.1).engajamento.texto).toBe("16,10%");
  });

  it("no Total também: um vídeo só com 0,29 → 0,29%; 16,1 → 16,10%", () => {
    const um = (eng: number) => totalDaTabela([vslCompleta("x", { viewed: 1, viewedUniq: 1, started: 7, startedUniq: 1, over: 0, under: 1, clicked: 0, eng }, 303)]);
    expect(um(0.29).engajamento.texto).toBe("0,29%");
    expect(um(16.1).engajamento.texto).toBe("16,10%");
  });

  it("decimal inválido ou negativo → null; notação científica é lida exata", () => {
    expect(centesimosDeDecimal(-1)).toBeNull();
    expect(centesimosDeDecimal(Number.NaN)).toBeNull();
    expect(centesimosDeDecimal(1e-7)).toBe(0);
    expect(centesimosDeDecimal(1e21)).toBe(1e23);
  });
});

describe("Story 29.82 AC2 — Total: soma das contagens e Engajamento pela definição do dono", () => {
  const t = totalDaTabela([V1, V6, V5]);

  it("cada contagem é a SOMA dos vídeos", () => {
    expect(t.visualizacoes.texto).toBe("16.142"); // 905 + 15.128 + 109
    expect(t.visUnicas.texto).toBe("14.647");
    expect(t.plays.texto).toBe("5.576"); // 331 + 5.181 + 64 (total_started)
    expect(t.playsUnicos.texto).toBe("5.502"); // 310 + 5.130 + 62
    expect(t.audienciaPitch.texto).toBe("435"); // 87 + 308 + 40
    expect(t.cliques.texto).toBe("58");
  });

  it("Engajamento = Σ(eng × plays × duração) ÷ Σ(plays × duração), plays = total_started → 15,68%", () => {
    expect(t.engajamento.texto).toBe("15,68%");
    // e não: média simples (37,77%), peso por plays únicos (15,56%), peso só por plays (14,45%)
    expect(t.engajamento.texto).not.toBe("37,77%");
    expect(t.engajamento.texto).not.toBe("15,56%");
    expect(t.engajamento.texto).not.toBe("14,45%");
  });

  it("Play Rate e Retenção do Total seguem pela soma dos brutos (29.78)", () => {
    expect(t.playRate.texto).toBe(pct(5502, 14647));
    expect(t.retencao.texto).toBe(pct(435, 435 + 5149));
  });
});

describe("Story 29.82 AC4 — ausência não vira zero", () => {
  it("vídeo SEM duração: Engajamento '—' pelo motivo, fora do numerador E do denominador; o resto segue", () => {
    // Sem video_duration o VTurb não calcula e a API normaliza para 0.
    const semDuracao = vslCompleta("V5", { viewed: 109, viewedUniq: 81, started: 64, startedUniq: 62, over: 40, under: 21, clicked: 9, eng: 0 }, null);
    const l = linhaDaTabela(semDuracao);
    expect(l.engajamento).toEqual({ texto: null, motivo: MOTIVO_SEM_DURACAO });
    expect(l.plays.texto).toBe("64");
    expect(l.cliques.texto).toBe("9");
    const t = totalDaTabela([V1, V6, semDuracao]);
    expect(t.engajamento.texto).toBe("14,94%"); // só V1 e V6
    expect(t.foraDoEngajamento).toEqual(["V5"]);
    expect(t.plays.texto).toBe("5.576"); // nas contagens ele entra
  });

  it("nenhum vídeo com duração → Engajamento do Total '—' pela duração", () => {
    const a = vslCompleta("A", { viewed: 1, viewedUniq: 1, started: 1, startedUniq: 1, over: 0, under: 1, clicked: 0, eng: 0 }, null);
    expect(totalDaTabela([a]).engajamento).toEqual({ texto: null, motivo: MOTIVO_SEM_DURACAO });
  });

  it("vídeo sem pitch: Audiência do Pitch '—' com o motivo e fora do Σ dela", () => {
    const semPitch = { ...V5, pitchTime: null, pitchConfigurado: false };
    expect(linhaDaTabela(semPitch).audienciaPitch).toEqual({ texto: null, motivo: MOTIVO_SEM_PITCH });
    const t = totalDaTabela([V1, V6, semPitch]);
    expect(t.audienciaPitch.texto).toBe("395"); // 87 + 308, sem os 40 do V5
    expect(t.foraDaRetencao).toEqual(["V5"]);
    expect(totalDaTabela([semPitch]).audienciaPitch).toEqual({ texto: null, motivo: MOTIVO_SEM_PITCH });
  });

  it("vídeo sem plays no período → Engajamento '—' sem dados, não 0%", () => {
    const parado = vslCompleta("P", { viewed: 10, viewedUniq: 10, started: 0, startedUniq: 0, over: 0, under: 0, clicked: 0, eng: 0 }, 300);
    expect(linhaDaTabela(parado).engajamento).toEqual({ texto: null, motivo: MOTIVO_SEM_DADOS });
    expect(totalDaTabela([parado]).engajamento).toEqual({ texto: null, motivo: MOTIVO_SEM_DADOS });
  });

  it("vídeo com falha: '—' em todas as colunas novas e fora do Total", () => {
    const falhou = vsl({ nome: "F", brutos: null, erro: "VTurb respondeu 500", duracao: 600 });
    const l = linhaDaTabela(falhou);
    for (const c of [l.visualizacoes, l.visUnicas, l.plays, l.playsUnicos, l.audienciaPitch, l.engajamento, l.cliques]) {
      expect(c).toEqual({ texto: null, motivo: MOTIVO_FALHA });
    }
    const t = totalDaTabela([V1, falhou]);
    expect(t.plays.texto).toBe("331");
    expect(t.engajamento.texto).toBe("30,05%");
    expect(t.foraPorFalha).toEqual(["F"]);
  });
});

describe("Story 29.82 AC6 — front contra a API anterior (v36, sem os campos novos)", () => {
  // Payload como a v36 devolve: quatro brutos e nenhuma `duracao`.
  const antigo = vsl({ nome: "Antigo", brutos: { viewedUniq: 521, startedUniq: 158, overPitch: 13, underPitch: 151 } });

  it("colunas de hoje medidas; as novas '—' com o motivo, sem erro", () => {
    const l = linhaDaTabela(antigo);
    expect(l.playRate.texto).toBe("30,32%");
    expect(l.retencao.texto).toBe("7,92%");
    expect(l.visUnicas.texto).toBe("521");
    expect(l.playsUnicos.texto).toBe("158");
    expect(l.audienciaPitch.texto).toBe("13");
    for (const c of [l.visualizacoes, l.plays, l.engajamento, l.cliques]) {
      expect(c).toEqual({ texto: null, motivo: MOTIVO_API_ANTERIOR });
    }
  });

  it("Total: as somas novas e o Engajamento '—' — nunca um 0 que parece medição", () => {
    const t = totalDaTabela([antigo, V1]);
    for (const c of [t.visualizacoes, t.plays, t.engajamento, t.cliques]) {
      expect(c).toEqual({ texto: null, motivo: MOTIVO_API_ANTERIOR });
    }
    expect(t.playRate.texto).toBe(pct(158 + 310, 521 + 774));
  });
});
