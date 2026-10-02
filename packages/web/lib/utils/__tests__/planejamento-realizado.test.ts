import { describe, expect, it } from "vitest";
import {
  conversaoPorCanal,
  conversaoPorFontePaga,
  etapaDeVendasPadrao,
  etapasDeVendas,
  foraDoMapeamento,
  fracaoDaTaxa,
  montarRealizado,
  realizadoDaConversaoOrganica,
  realizadoDaConversaoPaga,
  realizadoDoInput,
  type EtapaDaBase,
  type LinhaDeOrigemLida,
  type RealizadoDaApi,
} from "@/lib/utils/planejamento-realizado";
import { rotuloComBases } from "@/lib/utils/planejamento-bases";

/**
 * Story 48.11 — a camada B: o valor REALIZADO ao lado do planejado.
 *
 * As armadilhas que estes testes travam: a taxa que chega em pontos e é
 * guardada em fração; "Área de Membros" que não existe no classificador e não
 * pode virar "Outros"; e o payload de uma API antiga, que não pode derrubar a
 * camada A.
 */

/**
 * `toLocaleString("pt-BR", { style: "currency" })` separa "R$" do número com
 * U+00A0 (espaço inquebrável). Sem normalizar, a asserção falha mostrando duas
 * strings visualmente idênticas.
 */
const semNbsp = (s: string | null) => (s === null ? null : s.replace(/\u00a0/g, " "));

const linha = (nome: string, leads: number, compradores: number): LinhaDeOrigemLida => ({
  nome,
  leads,
  compradores,
  taxa: leads > 0 ? (compradores / leads) * 100 : null,
});

const etapas: EtapaDaBase[] = [
  { id: "s1", nome: "Captação Paga", stageType: "paid" },
  { id: "s2", nome: "Vendas", stageType: "sales" },
  { id: "s3", nome: "Downsell Vendas", stageType: "sales" },
];

const api = (over: Partial<RealizadoDaApi["investimentoMeta"]> = {}): RealizadoDaApi => ({
  funnelId: "f1",
  investimentoMeta: {
    total: 126373.06,
    quente: 78710.2,
    frio: 47662.86,
    indefinido: 0,
    pctQuente: 0.6228,
    campanhasVinculadas: 46,
    campanhasComSpend: 45,
    janela: { de: "2026-04-17", ate: "2026-06-16" },
    ...over,
  },
  etapas,
  google: { temFonte: false, motivo: "Nenhum lançamento usou Google Ads." },
});

describe("etapa de vendas da base", () => {
  it("as duas etapas `sales` aparecem — quem escolhe é a tela", () => {
    expect(etapasDeVendas(etapas).map((e) => e.nome)).toEqual(["Vendas", "Downsell Vendas"]);
  });

  it("a padrão é a que NÃO é downsell", () => {
    expect(etapaDeVendasPadrao(etapas)?.nome).toBe("Vendas");
    // Ordem invertida: continua escolhendo "Vendas", não a primeira da lista.
    expect(etapaDeVendasPadrao([etapas[2], etapas[1]])?.nome).toBe("Vendas");
    // "Vendas Downsell" e "Downsell" — a mesma pista, escrita de dois jeitos.
    expect(
      etapaDeVendasPadrao([
        { id: "a", nome: "Vendas Downsell", stageType: "sales" },
        { id: "b", nome: "Vendas", stageType: "sales" },
      ])?.nome,
    ).toBe("Vendas");
  });

  it("sem etapa de vendas → `null` (5 dos 11 lançamentos reais)", () => {
    expect(etapaDeVendasPadrao([{ id: "s1", nome: "Captação Paga", stageType: "paid" }])).toBeNull();
    expect(etapaDeVendasPadrao(undefined)).toBeNull();
  });

  it("só downsell → usa o downsell, não devolve nada", () => {
    expect(etapaDeVendasPadrao([{ id: "a", nome: "Downsell", stageType: "sales" }])?.id).toBe("a");
  });
});

describe("unidade da taxa — pontos na API, fração no simulador", () => {
  it("4,12 pontos vira 0,0412 e aparece como 4,12%", () => {
    expect(fracaoDaTaxa(4.12)).toBeCloseTo(0.0412, 6);
    const real = montarRealizado({
      api: api(),
      etapaEscolhida: etapas[1],
      ticketMedioBruto: 1187,
      fontesOrganicas: [{ nome: "WhatsApp", leads: 1000, compradores: 41.2, taxa: 4.12 }],
      fontesPagasPorTemperatura: undefined,
    });
    // Sem a divisão por 100 sairia "412,00%" — o defeito que este teste pega.
    expect(realizadoDaConversaoOrganica(real, "whatsapp")).toBe("4,12%");
  });

  it("taxa `null` (canal sem lead) não vira 0 %", () => {
    expect(fracaoDaTaxa(null)).toBeNull();
    expect(fracaoDaTaxa(undefined)).toBeNull();
    expect(fracaoDaTaxa(Number.NaN)).toBeNull();
  });
});

describe("mapeamento de canais", () => {
  const fontes = [
    linha("WhatsApp", 1676, 62),
    linha("E-mail", 800, 20),
    linha("Instagram", 500, 10),
    linha("ManyChat", 300, 9),
    linha("YouTube", 200, 4),
    linha("Outros", 438, 14),
    linha("Sem Track", 120, 2),
    linha("Closer", 60, 6),
  ];

  it("os cinco canais nomeados casam com os do simulador", () => {
    const c = conversaoPorCanal(fontes);
    expect(c.whatsapp).toBeCloseTo(62 / 1676, 6);
    expect(c.email).toBeCloseTo(20 / 800, 6);
    expect(c.instagram).toBeCloseTo(10 / 500, 6);
    expect(c.manychat).toBeCloseTo(9 / 300, 6);
    expect(c.youtube).toBeCloseTo(4 / 200, 6);
  });

  it("`area_membros` fica sem medição MESMO havendo linha 'Outros' no payload", () => {
    // O defeito que isto trava: mapear "Outros" para Área de Membros exibiria
    // como medição do canal um agregado de tudo que não foi reconhecido.
    const c = conversaoPorCanal(fontes);
    expect(c.area_membros).toBeUndefined();
    const real = montarRealizado({
      api: api(),
      etapaEscolhida: etapas[1],
      ticketMedioBruto: 1000,
      fontesOrganicas: fontes,
      fontesPagasPorTemperatura: undefined,
    });
    expect(realizadoDaConversaoOrganica(real, "area_membros")).toBeNull();
  });

  it("declara quanto dos leads orgânicos ficou fora dos cinco canais", () => {
    const f = foraDoMapeamento(fontes);
    expect(f.total).toBe(4094);
    expect(f.leads).toBe(438 + 120 + 60); // Outros + Sem Track + Closer
    expect(f.fracao).toBeCloseTo(618 / 4094, 6);
  });

  it("sem linha nenhuma, a fração é `null` — não 0 %", () => {
    expect(foraDoMapeamento([]).fracao).toBeNull();
    expect(foraDoMapeamento(undefined).fracao).toBeNull();
  });
});

describe("fontes pagas por temperatura", () => {
  const pagas = [
    linha("Meta Ads · quente", 2000, 80),
    linha("Meta Ads · frio", 3000, 60),
    linha("Meta Ads · indefinido", 500, 5),
  ];

  it("quente e frio da MESMA plataforma viram campos diferentes", () => {
    const c = conversaoPorFontePaga(pagas);
    expect(c.meta_quente).toBeCloseTo(0.04, 6);
    expect(c.meta_frio).toBeCloseTo(0.02, 6);
    // Se os dois recebessem o agregado, seriam iguais — e não são.
    expect(c.meta_quente).not.toBe(c.meta_frio);
  });

  it("`indefinido` não vira fonte do simulador, e Google sem dado fica `null`", () => {
    const real = montarRealizado({
      api: api(),
      etapaEscolhida: etapas[1],
      ticketMedioBruto: 1000,
      fontesOrganicas: undefined,
      fontesPagasPorTemperatura: pagas,
    });
    expect(realizadoDaConversaoPaga(real, "google_quente")).toBeNull();
    expect(realizadoDaConversaoPaga(real, "google_frio")).toBeNull();
    expect(realizadoDaConversaoPaga(real, "meta_quente")).toBe("4,00%");
  });
});

describe("realizadoDoInput — só quatro campos têm fonte", () => {
  const real = montarRealizado({
    api: api(),
    etapaEscolhida: etapas[1],
    ticketMedioBruto: 1187,
    fontesOrganicas: [],
    fontesPagasPorTemperatura: [],
  });

  it("investimento, % Meta, % quente e ticket médio", () => {
    expect(semNbsp(realizadoDoInput(real, "investimentoAnuncios"))).toBe("R$ 126.373,06");
    expect(realizadoDoInput(real, "pctInvestMeta")).toBe("100,00%");
    expect(realizadoDoInput(real, "pctMetaQuente")).toBe("62,28%");
    expect(semNbsp(realizadoDoInput(real, "ticketMedio"))).toBe("R$ 1.187,00");
  });

  it("os demais campos não inventam medição — inclusive `pctGoogleQuente`", () => {
    expect(realizadoDoInput(real, "pctGoogleQuente")).toBeNull();
    expect(realizadoDoInput(real, "pctReembolso")).toBeNull();
    expect(realizadoDoInput(real, "baseWhatsapp")).toBeNull();
    expect(realizadoDoInput(real, "metaMargemTotal")).toBeNull();
  });

  it("lançamento sem campanha com gasto não mostra investimento nem '100 % Meta'", () => {
    const semGasto = montarRealizado({
      api: api({ total: 0, quente: 0, frio: 0, pctQuente: null, campanhasVinculadas: 0, campanhasComSpend: 0 }),
      etapaEscolhida: null,
      ticketMedioBruto: null,
      fontesOrganicas: undefined,
      fontesPagasPorTemperatura: undefined,
    });
    expect(realizadoDoInput(semGasto, "investimentoAnuncios")).toBeNull();
    expect(realizadoDoInput(semGasto, "pctInvestMeta")).toBeNull();
    expect(realizadoDoInput(semGasto, "pctMetaQuente")).toBeNull();
    expect(realizadoDoInput(semGasto, "ticketMedio")).toBeNull();
  });

  it("ticket médio zero é planilha sem venda, não ticket de R$ 0,00", () => {
    const r = montarRealizado({
      api: api(),
      etapaEscolhida: etapas[1],
      ticketMedioBruto: 0,
      fontesOrganicas: undefined,
      fontesPagasPorTemperatura: undefined,
    });
    expect(realizadoDoInput(r, "ticketMedio")).toBeNull();
  });

  it("uma campanha do Google vinculada tira o 100 % Meta de cena", () => {
    // Hoje são zero nos 11 lançamentos reais — e é só por isso que o 100 % é
    // verdade. Vinculada uma, a divisão deixa de ser conhecida.
    const comGoogleVinculado = montarRealizado({
      api: { ...api(), google: { temFonte: false, campanhasVinculadas: 1, motivo: "" } },
      etapaEscolhida: etapas[1],
      ticketMedioBruto: 1000,
      fontesOrganicas: undefined,
      fontesPagasPorTemperatura: undefined,
    });
    expect(realizadoDoInput(comGoogleVinculado, "pctInvestMeta")).toBeNull();
    // O resto da camada B não é afetado.
    expect(semNbsp(realizadoDoInput(comGoogleVinculado, "investimentoAnuncios"))).toBe("R$ 126.373,06");
  });

  it("payload sem o contador (API anterior) trata como zero — o estado medido hoje", () => {
    const semContador = montarRealizado({
      api: { ...api(), google: { temFonte: false, motivo: "" } },
      etapaEscolhida: etapas[1],
      ticketMedioBruto: 1000,
      fontesOrganicas: undefined,
      fontesPagasPorTemperatura: undefined,
    });
    expect(semContador.googleCampanhasVinculadas).toBe(0);
    expect(realizadoDoInput(semContador, "pctInvestMeta")).toBe("100,00%");
  });

  it("se a API declarasse fonte de Google, o 100 % Meta sairia de cena", () => {
    const comGoogle = montarRealizado({
      api: { ...api(), google: { temFonte: true, motivo: "" } },
      etapaEscolhida: etapas[1],
      ticketMedioBruto: 1000,
      fontesOrganicas: undefined,
      fontesPagasPorTemperatura: undefined,
    });
    expect(realizadoDoInput(comGoogle, "pctInvestMeta")).toBeNull();
  });
});

describe("AC9 — API antiga não derruba a camada A", () => {
  it("sem resposta da rota, a tela sabe que é FALHA, não ausência", () => {
    // Sem esta distinção a declaração diria "esse lançamento não tem etapa de
    // vendas" para uma base que tem — falha virando ausência na tela.
    const semResposta = montarRealizado({
      api: null,
      etapaEscolhida: null,
      ticketMedioBruto: null,
      fontesOrganicas: undefined,
      fontesPagasPorTemperatura: undefined,
    });
    expect(semResposta.temResposta).toBe(false);
    const comResposta = montarRealizado({
      api: api(),
      etapaEscolhida: null,
      ticketMedioBruto: null,
      fontesOrganicas: undefined,
      fontesPagasPorTemperatura: undefined,
    });
    expect(comResposta.temResposta).toBe(true);
  });

  it("sem a rota `realizado`, o `real:` some e o `base:` fica [48.14 inverte: o grupo leva o nome da base]", () => {
    const real = montarRealizado({
      api: null,
      etapaEscolhida: null,
      ticketMedioBruto: null,
      fontesOrganicas: undefined,
      fontesPagasPorTemperatura: undefined,
    });
    expect(realizadoDoInput(real, "investimentoAnuncios")).toBeNull();
    expect(realizadoDaConversaoOrganica(real, "whatsapp")).toBeNull();
    expect(
      rotuloComBases("Investimento em Anúncios", [
        { nome: "dg-pg02", base: "R$ 100.000,00", real: realizadoDoInput(real, "investimentoAnuncios") },
      ]),
    ).toBe("Investimento em Anúncios (dg-pg02 base: R$ 100.000,00)");
  });

  it("sem `fontesPagasPorTemperatura` no payload, as fontes pagas ficam sem `real:`", () => {
    const real = montarRealizado({
      api: api(),
      etapaEscolhida: etapas[1],
      ticketMedioBruto: 1000,
      fontesOrganicas: [linha("WhatsApp", 100, 5)],
      fontesPagasPorTemperatura: undefined, // API anterior à 48.11
    });
    expect(realizadoDaConversaoPaga(real, "meta_quente")).toBeNull();
    // e o resto da camada B continua de pé
    expect(realizadoDaConversaoOrganica(real, "whatsapp")).toBe("5,00%");
    expect(semNbsp(realizadoDoInput(real, "investimentoAnuncios"))).toBe("R$ 126.373,06");
  });
});

/**
 * ⚠️ INVERTIDOS DE PROPÓSITO na Story 48.14 (AC2/AC8). A 48.11 afirmava
 * `(base: X · real: Y)`; agora cada base é um grupo com o nome do funil, as
 * duas leituras DELA separadas por espaço e os grupos separados por " · ":
 * `(dg-pg02 base: X real: Y)`.
 */
describe("rotuloComBases — as duas leituras (formato invertido na 48.14)", () => {
  it("[48.14 inverte: era `(base: X · real: Y)`] base e real juntos, na ordem, depois do nome da base", () => {
    expect(rotuloComBases("Investimento em Anúncios", [{ nome: "dg-pg02", base: "R$ 100.000,00", real: "R$ 126.373,06" }])).toBe(
      "Investimento em Anúncios (dg-pg02 base: R$ 100.000,00 real: R$ 126.373,06)",
    );
  });

  it("[48.14 inverte: sem o nome antes] só um dos dois, ou nenhum", () => {
    expect(rotuloComBases("Ticket Médio", [{ nome: "dg-pg02", base: "R$ 1.200,00", real: null }])).toBe("Ticket Médio (dg-pg02 base: R$ 1.200,00)");
    expect(rotuloComBases("Ticket Médio", [{ nome: "dg-pg02", base: null, real: "R$ 1.187,00" }])).toBe("Ticket Médio (dg-pg02 real: R$ 1.187,00)");
    expect(rotuloComBases("Ticket Médio", [{ nome: "dg-pg02", base: null, real: null }])).toBe("Ticket Médio");
    expect(rotuloComBases("Ticket Médio", [])).toBe("Ticket Médio");
  });

  it("[48.14 inverte: com o nome] zero é valor e aparece; ausência é `null` e não aparece", () => {
    expect(rotuloComBases("Comissões", [{ nome: "dg-pg02", base: "0,00%", real: null }])).toBe("Comissões (dg-pg02 base: 0,00%)");
  });
});
