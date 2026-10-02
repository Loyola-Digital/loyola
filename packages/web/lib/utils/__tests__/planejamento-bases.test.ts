import { describe, expect, it } from "vitest";
import { CAMPOS_DOS_INPUTS_FINANCEIROS } from "@loyola-x/shared/src/planejamento-inputs-financeiros";
import { organicosVazios, pagosVazios } from "@loyola-x/shared/src/planejamento-combinacoes";
import type { InputsPersistidos } from "@/lib/utils/planejamento-inputs-form";
import { montarReferencia, textoDoCabecalhoDasBases } from "@/lib/utils/planejamento-referencia";
import {
  etapaEscolhidaDaBase,
  montarRealizado,
  realizadoDoInvestimentoMeta,
  type EtapaDaBase,
  type LinhaDeOrigemLida,
  type RealizadoDaApi,
} from "@/lib/utils/planejamento-realizado";
import {
  AVISO_SEM_SIMULADOR,
  alternarBase,
  basesMarcadasNaOrdemDaLista,
  escolherEtapaDaBase,
  gruposDaConversaoOrganica,
  gruposDaConversaoPaga,
  gruposDoInput,
  gruposDoInvestimentoMeta,
  linhasDaDeclaracao,
  rotuloComBases,
  type ReferenciaDeBase,
} from "@/lib/utils/planejamento-bases";

/**
 * Story 48.14 — várias bases de referência lado a lado.
 *
 * As fixtures de investimento são os números MEDIDOS em produção em
 * 2026-10-01 (regra de `investimentoMetaDoFunil`, SELECT só-leitura) e
 * registrados na story: `dg-pg04` e `dg-pg02`, as duas bases que o Danilo vai
 * marcar para planejar o `dg-pg05`. Os tickets e taxas são ilustrativos.
 *
 * ⚠️ `fmtCurrency` separa "R$" do número com U+00A0 (espaço inquebrável). As
 * asserções de moeda normalizam o NBSP em vez de copiar o caractere invisível.
 */
const semNbsp = (s: string | null) => (s === null ? null : s.replace(/\u00a0/g, " "));

const VENDAS_PG04: EtapaDaBase = { id: "pg04-vendas", nome: "Vendas", stageType: "sales" };
const VENDAS_PG02: EtapaDaBase = { id: "pg02-vendas", nome: "Vendas", stageType: "sales" };
const DOWNSELL_PG02: EtapaDaBase = { id: "pg02-downsell", nome: "Downsell Vendas", stageType: "sales" };

function apiPg04(): RealizadoDaApi {
  return {
    funnelId: "pg04",
    investimentoMeta: {
      total: 59579.46,
      quente: 40815.28,
      frio: 18764.18,
      indefinido: 0,
      pctQuente: 0.6851,
      campanhasVinculadas: 56,
      campanhasComSpend: 46,
      janela: { de: "2026-07-10", ate: "2026-08-21" },
    },
    etapas: [{ id: "pg04-cap", nome: "Captação Paga", stageType: "paid" }, VENDAS_PG04],
    google: { temFonte: false, motivo: "Nenhum lançamento usou Google Ads." },
  };
}

function apiPg02(): RealizadoDaApi {
  return {
    funnelId: "pg02",
    investimentoMeta: {
      total: 126373.06,
      quente: 78784.44,
      frio: 47588.62,
      indefinido: 0,
      pctQuente: 0.6234,
      campanhasVinculadas: 46,
      campanhasComSpend: 45,
      janela: { de: "2026-04-17", ate: "2026-06-16" },
    },
    etapas: [VENDAS_PG02, DOWNSELL_PG02],
    google: { temFonte: false, motivo: "Nenhum lançamento usou Google Ads." },
  };
}

const linha = (nome: string, leads: number, compradores: number): LinhaDeOrigemLida => ({
  nome,
  leads,
  compradores,
  taxa: leads > 0 ? (compradores / leads) * 100 : null,
});

/** Base SEM simulador (como as três do DG): só o realizado. */
function baseSoRealizado(
  funnelId: string,
  nome: string,
  api: RealizadoDaApi | null,
  extra: {
    etapa?: EtapaDaBase | null;
    ticket?: number | null;
    organicas?: LinhaDeOrigemLida[];
    pagas?: LinhaDeOrigemLida[];
    lendo?: boolean;
  } = {},
): ReferenciaDeBase {
  const referencia = montarReferencia({ nome, temSimulador: false }, { inputs: null, organicos: null, pagos: null });
  return {
    funnelId,
    nome,
    referencia: referencia!,
    realizado: montarRealizado({
      api,
      etapaEscolhida: extra.etapa ?? null,
      ticketMedioBruto: extra.ticket ?? null,
      fontesOrganicas: extra.organicas,
      fontesPagasPorTemperatura: extra.pagas,
    }),
    lendoRealizado: extra.lendo ?? false,
  };
}

/** Base COM simulador: planejado (`base:`) + realizado (`real:`). */
function baseComSimulador(funnelId: string, nome: string, api: RealizadoDaApi | null, ticketReal: number | null): ReferenciaDeBase {
  const inputs = Object.fromEntries(CAMPOS_DOS_INPUTS_FINANCEIROS.map((k) => [k, null])) as unknown as InputsPersistidos;
  inputs.ticketMedio = 1200;
  inputs.pctReembolso = 0.04;
  const organicos = organicosVazios();
  organicos.blocos.whatsapp.conversaoMedia = 0.04;
  const pagos = pagosVazios();
  pagos.blocos.meta_quente.conversaoMedia = 0.012;
  const referencia = montarReferencia({ nome, temSimulador: true }, { inputs, organicos, pagos });
  return {
    funnelId,
    nome,
    referencia: referencia!,
    realizado: montarRealizado({
      api,
      etapaEscolhida: api ? (api.etapas.find((e) => e.stageType === "sales") ?? null) : null,
      ticketMedioBruto: ticketReal,
      fontesOrganicas: undefined,
      fontesPagasPorTemperatura: undefined,
    }),
  };
}

const pg04 = () =>
  baseSoRealizado("pg04", "dg-pg04", apiPg04(), {
    etapa: VENDAS_PG04,
    ticket: 1187,
    organicas: [linha("WhatsApp", 400, 10), linha("Outros", 100, 1)],
    pagas: [linha("Meta Ads · quente", 1000, 15)],
  });
const pg02 = () =>
  baseSoRealizado("pg02", "dg-pg02", apiPg02(), {
    etapa: VENDAS_PG02,
    ticket: 1312.5,
    organicas: [linha("WhatsApp", 500, 20)],
    pagas: [linha("Meta Ads · quente", 2000, 50)],
  });

/** A lista como `/bases` devolve: do lançamento mais recente para o mais antigo. */
const LISTA = [
  { funnelId: "pg04", nome: "dg-pg04" },
  { funnelId: "pg03", nome: "dg-pg03" },
  { funnelId: "pg02", nome: "dg-pg02" },
];

describe("AC1/AC2 — rótulo com 0, 1 e 2 bases", () => {
  it("nenhuma base marcada → o rótulo fica exatamente como sem base, e o cabeçalho pede a escolha", () => {
    expect(rotuloComBases("Ticket Médio", gruposDoInput([], "ticketMedio"))).toBe("Ticket Médio");
    expect(textoDoCabecalhoDasBases([])).toContain("Escolha");
  });

  it("UMA base → mesmo formato, com o nome do funil (um formato só)", () => {
    expect(semNbsp(rotuloComBases("Ticket Médio", gruposDoInput([pg04()], "ticketMedio")))).toBe("Ticket Médio (dg-pg04 real: R$ 1.187,00)");
  });

  it("DUAS bases → um grupo por base, separados por ' · '", () => {
    expect(semNbsp(rotuloComBases("Ticket Médio", gruposDoInput([pg04(), pg02()], "ticketMedio")))).toBe(
      "Ticket Médio (dg-pg04 real: R$ 1.187,00 · dg-pg02 real: R$ 1.312,50)",
    );
  });

  it("com várias marcadas, o cabeçalho fala de várias e não pede 'Escolha…' (PO-01)", () => {
    const texto = textoDoCabecalhoDasBases([pg04().referencia, pg02().referencia]);
    expect(texto).toContain("lançamentos marcados");
    expect(texto).toContain("cada um com o nome dele");
    expect(texto).not.toContain("Escolha");
  });

  it("a ordem é a da LISTA de /bases, não a da marcação: marcar pg02 antes de pg04 ainda mostra pg04 primeiro", () => {
    const marcadas = basesMarcadasNaOrdemDaLista(LISTA, ["pg02", "pg04"]);
    expect(marcadas.map((b) => b.nome)).toEqual(["dg-pg04", "dg-pg02"]);
    const porId: Record<string, ReferenciaDeBase> = { pg04: pg04(), pg02: pg02() };
    const rotulo = semNbsp(rotuloComBases("Ticket Médio", gruposDoInput(marcadas.map((b) => porId[b.funnelId]), "ticketMedio")));
    expect(rotulo).toBe("Ticket Médio (dg-pg04 real: R$ 1.187,00 · dg-pg02 real: R$ 1.312,50)");
  });

  it("id marcado que saiu da lista é ignorado", () => {
    expect(basesMarcadasNaOrdemDaLista(LISTA, ["sumiu", "pg03"]).map((b) => b.funnelId)).toEqual(["pg03"]);
  });

  it("base COM simulador e base SEM simulador no mesmo rótulo: `base:` só na que tem", () => {
    const comSim = baseComSimulador("m2", "fz-m2-jul26", apiPg02(), 1187);
    const semSim = baseSoRealizado("m1", "fz-m1-abr26", apiPg04(), { etapa: VENDAS_PG04, ticket: 900 });
    expect(semNbsp(rotuloComBases("Ticket Médio", gruposDoInput([comSim, semSim], "ticketMedio")))).toBe(
      "Ticket Médio (fz-m2-jul26 base: R$ 1.200,00 real: R$ 1.187,00 · fz-m1-abr26 real: R$ 900,00)",
    );
    // Campo só planejado (sem medição): a base sem simulador não tem o que dizer e some.
    expect(rotuloComBases("Reembolso", gruposDoInput([comSim, semSim], "pctReembolso"))).toBe("Reembolso (fz-m2-jul26 base: 4,00%)");
  });

  it("base SEM valor para o campo é OMITIDA — nunca `0`, nunca `—` em nome de outra", () => {
    // pg04 sem etapa de vendas → sem ticket médio realizado.
    const pg04SemVendas = baseSoRealizado("pg04", "dg-pg04", apiPg04(), { etapa: null, ticket: null });
    const rotulo = semNbsp(rotuloComBases("Ticket Médio", gruposDoInput([pg04SemVendas, pg02()], "ticketMedio")));
    expect(rotulo).toBe("Ticket Médio (dg-pg02 real: R$ 1.312,50)");
    expect(rotulo).not.toContain("dg-pg04");
    // Nenhuma das duas com valor → rótulo limpo.
    expect(rotuloComBases("Comissões", gruposDoInput([pg04SemVendas, pg02()], "pctComissoes"))).toBe("Comissões");
  });

  it("vale para a conversão por canal (aba 2) e por fonte paga (aba 3), uma base por grupo", () => {
    expect(rotuloComBases("Conversão média em vendas", gruposDaConversaoOrganica([pg04(), pg02()], "whatsapp"))).toBe(
      "Conversão média em vendas (dg-pg04 real: 2,50% · dg-pg02 real: 4,00%)",
    );
    expect(rotuloComBases("Conversão média em vendas", gruposDaConversaoPaga([pg04(), pg02()], "meta_quente"))).toBe(
      "Conversão média em vendas (dg-pg04 real: 1,50% · dg-pg02 real: 2,50%)",
    );
    // Canal sem linha em nenhuma das duas → sem parênteses.
    expect(rotuloComBases("Conversão média em vendas", gruposDaConversaoOrganica([pg04(), pg02()], "youtube"))).toBe(
      "Conversão média em vendas",
    );
  });
});

describe("AC5 — investimento real quente e frio em R$ (números medidos em 01/10)", () => {
  it("Meta · quente: pg04 R$ 40.815,28 · pg02 R$ 78.784,44", () => {
    expect(semNbsp(rotuloComBases("Meta · quente", gruposDoInvestimentoMeta([pg04(), pg02()], "quente")))).toBe(
      "Meta · quente (dg-pg04 real: R$ 40.815,28 · dg-pg02 real: R$ 78.784,44)",
    );
  });

  it("Meta · frio: a referência entra DEPOIS do percentual planejado — pg04 R$ 18.764,18 · pg02 R$ 47.588,62", () => {
    expect(semNbsp(rotuloComBases("Meta · frio (35,00%)", gruposDoInvestimentoMeta([pg04(), pg02()], "frio")))).toBe(
      "Meta · frio (35,00%) (dg-pg04 real: R$ 18.764,18 · dg-pg02 real: R$ 47.588,62)",
    );
  });

  it("valor por base, sem conta nova: é `investimentoMeta.quente`/`.frio` da rota", () => {
    expect(semNbsp(realizadoDoInvestimentoMeta(pg04().realizado, "quente"))).toBe("R$ 40.815,28");
    expect(semNbsp(realizadoDoInvestimentoMeta(pg04().realizado, "frio"))).toBe("R$ 18.764,18");
    expect(semNbsp(realizadoDoInvestimentoMeta(pg02().realizado, "quente"))).toBe("R$ 78.784,44");
    expect(semNbsp(realizadoDoInvestimentoMeta(pg02().realizado, "frio"))).toBe("R$ 47.588,62");
  });

  it("sem gasto, ou sem NENHUMA campanha com temperatura no nome → a base some do cartão (não vira R$ 0,00)", () => {
    const semGasto = apiPg04();
    semGasto.investimentoMeta = { ...semGasto.investimentoMeta, total: 0, quente: 0, frio: 0, campanhasComSpend: 0, pctQuente: null };
    const semTemperatura = apiPg02();
    semTemperatura.investimentoMeta = { ...semTemperatura.investimentoMeta, quente: 0, frio: 0, indefinido: 126373.06, pctQuente: null };
    const bases = [baseSoRealizado("pg04", "dg-pg04", semGasto), baseSoRealizado("pg02", "dg-pg02", semTemperatura)];
    expect(rotuloComBases("Meta · quente", gruposDoInvestimentoMeta(bases, "quente"))).toBe("Meta · quente");
    expect(rotuloComBases("Meta · frio (35,00%)", gruposDoInvestimentoMeta(bases, "frio"))).toBe("Meta · frio (35,00%)");
  });

  it("frio medido em zero com quente > 0 É medição e aparece", () => {
    const soQuente = apiPg04();
    soQuente.investimentoMeta = { ...soQuente.investimentoMeta, quente: 59579.46, frio: 0, pctQuente: 1 };
    expect(semNbsp(realizadoDoInvestimentoMeta(baseSoRealizado("pg04", "dg-pg04", soQuente).realizado, "frio"))).toBe("R$ 0,00");
  });

  it("rota sem resposta → nada no cartão daquela base", () => {
    expect(realizadoDoInvestimentoMeta(baseSoRealizado("pg02", "dg-pg02", null).realizado, "quente")).toBeNull();
  });
});

describe("AC4 — procedência por base: a falha de uma não apaga a outra", () => {
  it("uma linha por base, começando pelo nome, na ordem recebida", () => {
    const linhas = linhasDaDeclaracao([pg04(), pg02()]);
    expect(linhas.map((l) => l.nome)).toEqual(["dg-pg04", "dg-pg02"]);
    expect(linhas[0].texto).toBe(
      'investimento de 46 de 56 campanhas entre 2026-07-10 e 2026-08-21 · Google aparece como 0 % por não haver campanha do Google vinculada — não é medição · ticket médio (produto principal + order bump) e conversão vêm da etapa "Vendas" · 20,00% dos leads orgânicos ficaram fora dos cinco canais nomeados (Closer, Outros, Sem Track).',
    );
    expect(linhas[1].texto).toContain("investimento de 45 de 46 campanhas entre 2026-04-17 e 2026-06-16");
  });

  it("pg02 sem resposta: SÓ a linha dela diz que falhou; a do pg04 segue com a procedência", () => {
    const linhas = linhasDaDeclaracao([pg04(), baseSoRealizado("pg02", "dg-pg02", null)]);
    expect(linhas[0].falha).toBe(false);
    expect(linhas[0].texto).toContain("investimento de 46 de 56 campanhas");
    expect(linhas[0].texto).not.toContain("não puderam ser lidos");
    expect(linhas[1].falha).toBe(true);
    expect(linhas[1].texto).toContain("não puderam ser lidos");
  });

  it("…e nos rótulos o pg04 continua aparecendo", () => {
    const bases = [pg04(), baseSoRealizado("pg02", "dg-pg02", null)];
    expect(semNbsp(rotuloComBases("Meta · quente", gruposDoInvestimentoMeta(bases, "quente")))).toBe("Meta · quente (dg-pg04 real: R$ 40.815,28)");
    expect(semNbsp(rotuloComBases("Investimento em Anúncios", gruposDoInput(bases, "investimentoAnuncios")))).toBe(
      "Investimento em Anúncios (dg-pg04 real: R$ 59.579,46)",
    );
  });

  it("a frase de base sem simulador (48.13 AC5) é POR BASE", () => {
    const comSim = baseComSimulador("m2", "fz-m2-jul26", apiPg02(), 1187);
    const linhas = linhasDaDeclaracao([comSim, pg04()]);
    expect(linhas[0].avisoSemSimulador).toBeNull();
    expect(linhas[1].avisoSemSimulador).toBe(AVISO_SEM_SIMULADOR);
  });

  it("falha numa base sem simulador não promete 'planejados (base) seguem válidos'; na com simulador, promete", () => {
    const [semSim] = linhasDaDeclaracao([baseSoRealizado("pg02", "dg-pg02", null)]);
    expect(semSim.texto).not.toContain("planejados");
    const [comSim] = linhasDaDeclaracao([baseComSimulador("m2", "fz-m2-jul26", null, null)]);
    expect(comSim.texto).toContain("Os valores planejados (base) seguem válidos.");
  });

  it("base ainda lendo → a linha diz que está lendo, não que falhou nem que não existe", () => {
    const [l] = linhasDaDeclaracao([baseSoRealizado("pg02", "dg-pg02", null, { lendo: true })]);
    expect(l.lendo).toBe(true);
    expect(l.falha).toBe(false);
    expect(l.texto).not.toContain("não puderam ser lidos");
  });
});

describe("AC3 — etapa de vendas por base", () => {
  it("o padrão é a que não é downsell; uma escolha válida da base vale", () => {
    expect(etapaEscolhidaDaBase(apiPg02().etapas, undefined)?.id).toBe("pg02-vendas");
    expect(etapaEscolhidaDaBase(apiPg02().etapas, "pg02-downsell")?.id).toBe("pg02-downsell");
  });

  it("id que não é etapa de vendas DESSA base (de outra base, etapa paga) cai no padrão", () => {
    expect(etapaEscolhidaDaBase(apiPg02().etapas, "pg04-vendas")?.id).toBe("pg02-vendas");
    expect(etapaEscolhidaDaBase(apiPg04().etapas, "pg04-cap")?.id).toBe("pg04-vendas");
  });

  it("trocar a etapa de uma base não mexe na das outras", () => {
    const antes = { pg04: "pg04-vendas", pg02: "pg02-vendas" };
    const depois = escolherEtapaDaBase(antes, "pg02", "pg02-downsell");
    expect(depois).toEqual({ pg04: "pg04-vendas", pg02: "pg02-downsell" });
    expect(antes).toEqual({ pg04: "pg04-vendas", pg02: "pg02-vendas" });
  });
});

describe("AC6 — marcar e desmarcar é só leitura", () => {
  it("alternarBase devolve uma lista nova e não altera a recebida", () => {
    const marcadas = ["pg04"];
    expect(alternarBase(marcadas, "pg02")).toEqual(["pg04", "pg02"]);
    expect(alternarBase(marcadas, "pg04")).toEqual([]);
    expect(marcadas).toEqual(["pg04"]);
  });
});
