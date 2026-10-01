import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CANAIS,
  CLASSIFICADOR_VERSAO,
  FECHAMENTOS,
  SEGMENTOS_DE_QUALIFICACAO,
  SEGMENTO_DE_QUALIFICACAO,
  agruparPorCanal,
  agruparPorFechamento,
  classificarOrigem,
  type Canal,
  type ConfigClassificador,
  type EntradaClassificador,
  type ResultadoClassificacao,
  type Utm,
} from "@loyola-x/shared";
import {
  classifyCanal,
  classifyOrigem,
  classifyTemperatura,
  type Canal as CanalAntigo,
  type Origem,
  type Temperatura,
} from "../utils/lead-origin.js";
import { temperaturaDoNome } from "../utils/temperatura-de-publico.js";

/**
 * Story 49.2 — o classificador ÚNICO de origem do debriefing.
 *
 * Os testes vivem na API (e não em `packages/shared`, que não tem runner)
 * porque o diferencial do AC8 precisa de `lead-origin.ts` e
 * `temperatura-de-publico.ts`, que são da API.
 *
 * Os valores de closer abaixo são dos perfis de expert da skill
 * (`danilo-gato.md` §5, `fernanda-zapparolli.md` §5, `netao.md` §5) e existem
 * SÓ aqui: na produção eles chegam pela config, montada a partir de
 * `seller_aliases` / `stage_event_closers`.
 */

const SEM_CONFIG: ConfigClassificador = {
  closerMediums: [],
  closerNomes: [],
  closerPorSellerName: false,
};

/** Danilo Gato: `utm_medium = x1`, nomes de closer em `utm_source`. */
const DG: ConfigClassificador = {
  closerMediums: ["x1"],
  closerNomes: ["isabela", "kayta", "katia", "alberto", "closer", "vendas", "sdr"],
  closerPorSellerName: false,
};

/** Fernanda Zapparolli: `x1` (L1) / `comercial` (L2); `flaviana` é pessoa. */
const FZ: ConfigClassificador = {
  closerMediums: ["x1", "comercial"],
  closerNomes: ["flaviana"],
  closerPorSellerName: false,
};

/** Netão: closer registrado por `seller_name`, não por UTM. */
const NETAO: ConfigClassificador = {
  closerMediums: [],
  closerNomes: [],
  closerPorSellerName: true,
};

function classificar(
  entrada: EntradaClassificador,
  config: ConfigClassificador = DG,
): ResultadoClassificacao {
  return classificarOrigem(entrada, config);
}

const soLead = (lead: EntradaClassificador["lead"], config?: ConfigClassificador) =>
  classificar({ lead, venda: null }, config);

// ============================================================
// AC1 — módulo folha, função pura
// ============================================================

describe("AC1 — módulo folha em shared, função pura", () => {
  const fonte = readFileSync(
    new URL("../../../shared/src/classificador-de-origem.ts", import.meta.url),
    "utf-8",
  );
  /** O código sem comentários — os comentários citam exemplos dos perfis. */
  const codigo = fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  it("não tem nenhum import (módulo folha)", () => {
    expect(fonte).not.toMatch(/^\s*import\s/m);
    expect(fonte).not.toMatch(/\brequire\(/);
    expect(fonte).not.toMatch(/\bimport\(/);
  });

  it("não tem I/O, relógio, aleatoriedade nem estado de processo", () => {
    for (const proibido of ["Date", "Math.random", "process.", "fetch(", "globalThis", "console."]) {
      expect(codigo, proibido).not.toContain(proibido);
    }
  });

  it("nenhum nome de closer nem medium de closer mora no código", () => {
    for (const valor of ["isabela", "kayta", "katia", "alberto", "flaviana", "x1", "comercial", "sdr", "vendedor"]) {
      expect(codigo.toLowerCase(), valor).not.toContain(`"${valor}"`);
    }
  });

  it("exporta CLASSIFICADOR_VERSAO como string não vazia", () => {
    expect(typeof CLASSIFICADOR_VERSAO).toBe("string");
    expect(CLASSIFICADOR_VERSAO.length).toBeGreaterThan(0);
  });

  it("mesma entrada → mesma saída, e não muda a entrada", () => {
    const entrada = Object.freeze({
      lead: Object.freeze({ source: "meta", medium: "cbo", term: "publico-hot" }),
      venda: Object.freeze({ source: "isabela", medium: "x1" }),
      sellerName: "Isabela",
    });
    const config = Object.freeze({ ...DG, closerMediums: Object.freeze([...DG.closerMediums]) as string[] });
    const a = classificarOrigem(entrada, config);
    const b = classificarOrigem(entrada, config);
    expect(a).toEqual(b);
    expect(a).toEqual({
      canal: "Pago Quente",
      fechamento: "closer",
      fonteUtm: "lead",
      regra: 1,
      regraDeFechamento: "medium",
      temperaturaDecididaPor: "utm_term",
    });
  });
});

// ============================================================
// AC2 — as 9 regras de aquisição, na ordem, e o eixo de fechamento
// ============================================================

describe("AC2 — regra 1 (Pago Quente): utm_term, com fallback no campaignName", () => {
  it("utm_term com hot / quente decide", () => {
    expect(soLead({ term: "publico-hot" })).toMatchObject({ canal: "Pago Quente", regra: 1, temperaturaDecididaPor: "utm_term" });
    expect(soLead({ term: "Quente" })).toMatchObject({ canal: "Pago Quente", regra: 1 });
  });

  it("term que não decide → fallback no campaignName", () => {
    const r = soLead({ source: "meta", campaign: "120210", term: "lookalike-1", campaignName: "[PG02][CAPTACAO][HOT]" });
    expect(r).toMatchObject({ canal: "Pago Quente", regra: 1, temperaturaDecididaPor: "campaign_name" });
  });

  it("term vazio → fallback no campaignName", () => {
    expect(soLead({ source: "meta", campaign: "120210", campaignName: "Captação Quente" })).toMatchObject({
      canal: "Pago Quente",
      temperaturaDecididaPor: "campaign_name",
    });
  });

  it("campo fixado: hot no source, no medium ou no utm_campaign cru NÃO decide", () => {
    expect(soLead({ source: "hot" }).canal).toBe("Outros orgânicos");
    expect(soLead({ medium: "hot" }).canal).toBe("Outros orgânicos");
    // O texto de utm_campaign não é lido para temperatura: só o nome resolvido.
    expect(soLead({ source: "meta", campaign: "pg02-hot" }).canal).toBe("Pago N/D");
  });

  it("campaignName sozinho não é UTM preenchida (não tira da regra 9)", () => {
    expect(soLead({ campaignName: "HOT" })).toMatchObject({ canal: "Sem track real", regra: 9 });
  });
});

describe("AC2 — regra 2 (Pago Frio)", () => {
  it("utm_term com cold / frio decide", () => {
    expect(soLead({ term: "cold-lal" })).toMatchObject({ canal: "Pago Frio", regra: 2, temperaturaDecididaPor: "utm_term" });
    expect(soLead({ term: "público frio" })).toMatchObject({ canal: "Pago Frio", regra: 2 });
  });

  it("fallback no campaignName", () => {
    expect(soLead({ source: "fb", campaign: "9", campaignName: "PG02 | COLD" })).toMatchObject({
      canal: "Pago Frio",
      regra: 2,
      temperaturaDecididaPor: "campaign_name",
    });
  });

  it("term e campaignName divergentes → vale o term (nos dois sentidos)", () => {
    expect(soLead({ source: "meta", term: "hot", campaignName: "COLD" })).toMatchObject({ canal: "Pago Quente", temperaturaDecididaPor: "utm_term" });
    expect(soLead({ source: "meta", term: "cold", campaignName: "HOT" })).toMatchObject({ canal: "Pago Frio", temperaturaDecididaPor: "utm_term" });
  });

  it("hot vem antes de cold no mesmo texto (como classifyTemperatura)", () => {
    expect(soLead({ term: "cold-hot" }).canal).toBe("Pago Quente");
  });

  it("temperatura decide antes do canal (regras 1–2 antes de 3–7)", () => {
    expect(soLead({ source: "instagram", term: "hot" }).canal).toBe("Pago Quente");
    expect(soLead({ source: "whatsapp", term: "frio" }).canal).toBe("Pago Frio");
  });
});

describe("AC2 — regra 3 (Pago N/D): cbo/abo/meta/fb por token inteiro em source, medium e campaign", () => {
  it.each(["cbo", "abo", "meta", "fb"])("token %s no source", (t) => {
    expect(soLead({ source: t })).toMatchObject({ canal: "Pago N/D", regra: 3, temperaturaDecididaPor: null });
  });

  it("no medium e no campaign também", () => {
    expect(soLead({ source: "lancamento", medium: "cbo" }).canal).toBe("Pago N/D");
    expect(soLead({ campaign: "[PG02][CAPTACAO][META][ABO]" }).canal).toBe("Pago N/D");
    expect(soLead({ source: "meta-ads" }).canal).toBe("Pago N/D");
  });

  it("token inteiro: pedaço de palavra não casa", () => {
    expect(soLead({ source: "metaverso" }).canal).toBe("Outros orgânicos");
    expect(soLead({ source: "facebook" }).canal).toBe("Outros orgânicos");
    expect(soLead({ source: "fbx" }).canal).toBe("Outros orgânicos");
  });

  it("campo fixado: meta só no utm_term não casa", () => {
    expect(soLead({ term: "meta" }).canal).toBe("Outros orgânicos");
  });

  it("regra 3 antes da 4: ig + cbo é pago", () => {
    expect(soLead({ source: "ig", medium: "cbo" }).canal).toBe("Pago N/D");
  });

  it("term sem hot/cold e campaignName sem hot/cold → Pago N/D (fallback não decide)", () => {
    expect(soLead({ source: "meta", campaign: "1", term: "lal-1", campaignName: "PG02 captação" })).toMatchObject({
      canal: "Pago N/D",
      temperaturaDecididaPor: null,
    });
  });
});

describe("AC2 — regras 4 a 7", () => {
  it("regra 4: ig / instagram (source, medium ou campaign)", () => {
    expect(soLead({ source: "ig" })).toMatchObject({ canal: "Instagram orgânico", regra: 4 });
    expect(soLead({ source: "Instagram" }).canal).toBe("Instagram orgânico");
    expect(soLead({ source: "organico", medium: "stories-ig" }).canal).toBe("Instagram orgânico");
    expect(soLead({ campaign: "post_instagram" }).canal).toBe("Instagram orgânico");
    expect(soLead({ source: "igtv" }).canal).toBe("Outros orgânicos");
  });

  it("regra 4 antes da 5", () => {
    expect(soLead({ source: "instagram", medium: "whatsapp" }).canal).toBe("Instagram orgânico");
  });

  it("regra 5: whatsapp", () => {
    expect(soLead({ source: "whatsapp" })).toMatchObject({ canal: "WhatsApp", regra: 5 });
    expect(soLead({ source: "grupo", medium: "whatsapp" }).canal).toBe("WhatsApp");
    expect(soLead({ source: "wpp" }).canal).toBe("Outros orgânicos");
  });

  it("regra 5 antes da 6", () => {
    expect(soLead({ source: "manychat", medium: "whatsapp" }).canal).toBe("WhatsApp");
  });

  it("regra 6: manychat", () => {
    expect(soLead({ source: "manychat" })).toMatchObject({ canal: "ManyChat", regra: 6 });
    expect(soLead({ medium: "manychat" }).canal).toBe("ManyChat");
  });

  it.each(["chatwoot", "mautic", "qrcode", "bio", "email", "e-mail", "youtube", "google"])(
    "regra 7: %s → Outros orgânicos",
    (s) => {
      expect(soLead({ source: s })).toMatchObject({ canal: "Outros orgânicos", regra: 7 });
    },
  );

  it("regra 7: só campaign ou só term preenchido também é UTM", () => {
    expect(soLead({ campaign: "lancamento-pg02" }).canal).toBe("Outros orgânicos");
    expect(soLead({ term: "lal-1" }).canal).toBe("Outros orgânicos");
  });
});

describe("AC2 — regras 8 e 9 (sem UTM de aquisição)", () => {
  it("regra 8: a única UTM é de closer → Aquisição não rastreada (só closer)", () => {
    expect(classificar({ lead: null, venda: { source: "isabela", medium: "x1" } })).toMatchObject({
      canal: "Aquisição não rastreada (só closer)",
      regra: 8,
      fonteUtm: "nenhuma",
      fechamento: "closer",
    });
  });

  it("regra 8 com o sinal de closer no lead", () => {
    expect(soLead({ medium: "x1" })).toMatchObject({ canal: "Aquisição não rastreada (só closer)", regra: 8 });
  });

  it("regra 9: nenhum campo de UTM no lead e na venda", () => {
    expect(classificar({ lead: null, venda: null })).toMatchObject({
      canal: "Sem track real",
      regra: 9,
      fonteUtm: "nenhuma",
      fechamento: "sem-closer",
      regraDeFechamento: null,
      temperaturaDecididaPor: null,
    });
  });

  it("closer + qualquer outro campo de aquisição não é regra 8", () => {
    expect(soLead({ source: "isabela", medium: "x1", campaign: "lancamento" }).canal).toBe("Outros orgânicos");
  });
});

describe("AC2 — eixo de fechamento", () => {
  it("medium ∈ closerMediums, no lead ou na venda", () => {
    expect(soLead({ source: "meta", medium: "x1" })).toMatchObject({ fechamento: "closer", regraDeFechamento: "medium" });
    expect(classificar({ lead: { source: "meta" }, venda: { medium: "x1" } })).toMatchObject({
      fechamento: "closer",
      regraDeFechamento: "medium",
    });
  });

  it("source ∈ closerNomes, no lead ou na venda", () => {
    expect(soLead({ source: "kayta" })).toMatchObject({ fechamento: "closer", regraDeFechamento: "source" });
    expect(classificar({ lead: { source: "ig" }, venda: { source: "Alberto" } })).toMatchObject({
      canal: "Instagram orgânico",
      fechamento: "closer",
      regraDeFechamento: "source",
    });
  });

  it("precedência do rótulo: medium > source > sellerName", () => {
    const config = { ...DG, closerPorSellerName: true };
    expect(classificar({ lead: { source: "isabela", medium: "x1" }, venda: null, sellerName: "Isabela" }, config).regraDeFechamento).toBe("medium");
    expect(classificar({ lead: { source: "isabela" }, venda: null, sellerName: "Isabela" }, config).regraDeFechamento).toBe("source");
    expect(classificar({ lead: { source: "meta" }, venda: null, sellerName: "Isabela" }, config).regraDeFechamento).toBe("sellerName");
  });

  it("o medium de closer em utm_source não é sinal (e vice-versa)", () => {
    expect(soLead({ source: "x1" }).fechamento).toBe("sem-closer");
    expect(soLead({ medium: "isabela" }).fechamento).toBe("sem-closer");
  });

  it("eixos independentes: mudar a aquisição não muda o fechamento, e vice-versa", () => {
    const aquisicoes = [
      { source: "meta", term: "hot" },
      { source: "meta", term: "cold" },
      { source: "meta" },
      { source: "ig" },
      { source: "whatsapp" },
      { source: "manychat" },
      { source: "chatwoot" },
      null,
    ];
    const config = { ...DG, closerPorSellerName: true };
    for (const lead of aquisicoes) {
      const sem = classificar({ lead, venda: null }, config);
      const comSeller = classificar({ lead, venda: null, sellerName: "Fulano" }, config);
      // O sellerName só mexe no fechamento.
      expect(comSeller.canal).toBe(sem.canal);
      expect(comSeller.regra).toBe(sem.regra);
      expect(sem.fechamento).toBe("sem-closer");
      expect(comSeller.fechamento).toBe("closer");
    }
    const fechamentos = aquisicoes.map((lead) => classificar({ lead, venda: { medium: "x1" } }).fechamento);
    expect(new Set(fechamentos)).toEqual(new Set(["closer"]));
  });

  it("o canal nunca é Closer", () => {
    expect(CANAIS.some((c) => /closer\/|^closer$|vendas/i.test(c))).toBe(false);
  });
});

// ============================================================
// AC3 — UTM efetiva: lead primeiro, fallback na venda
// ============================================================

describe("AC3 — lead primeiro, fallback para a venda", () => {
  it("lead com UTM vence a venda divergente", () => {
    expect(classificar({ lead: { source: "ig" }, venda: { source: "meta", term: "hot" } })).toMatchObject({
      canal: "Instagram orgânico",
      fonteUtm: "lead",
    });
  });

  it("lead sem UTM (null, {}, espaços) → UTM da venda", () => {
    for (const lead of [null, {}, { source: "  ", medium: "", campaign: null, term: undefined }]) {
      expect(classificar({ lead, venda: { source: "meta", term: "cold" } })).toMatchObject({
        canal: "Pago Frio",
        fonteUtm: "venda",
        regra: 2,
      });
    }
  });

  it("lead cuja única UTM é de closer não bloqueia o fallback", () => {
    expect(classificar({ lead: { source: "isabela", medium: "x1" }, venda: { source: "meta" } })).toMatchObject({
      canal: "Pago N/D",
      fonteUtm: "venda",
      fechamento: "closer",
    });
  });

  it("lead só com campaignName (sem UTM) → venda", () => {
    expect(classificar({ lead: { campaignName: "HOT" }, venda: { source: "ig" } })).toMatchObject({
      canal: "Instagram orgânico",
      fonteUtm: "venda",
    });
  });

  it("o campaignName usado é o da UTM efetiva", () => {
    // Lead efetivo sem nome de campanha: o "HOT" da venda não é lido.
    expect(classificar({ lead: { source: "meta" }, venda: { source: "meta", campaign: "1", campaignName: "HOT" } })).toMatchObject({
      canal: "Pago N/D",
      fonteUtm: "lead",
    });
    // Venda efetiva: o nome dela decide.
    expect(classificar({ lead: null, venda: { source: "meta", campaign: "1", campaignName: "HOT" } })).toMatchObject({
      canal: "Pago Quente",
      fonteUtm: "venda",
      temperaturaDecididaPor: "campaign_name",
    });
  });

  it("venda sem lead é classificada pela venda", () => {
    expect(classificar({ lead: null, venda: { source: "whatsapp" } })).toMatchObject({ canal: "WhatsApp", fonteUtm: "venda" });
  });
});

// ============================================================
// AC4 — Sem track real ≠ Sem Track do Debriefing; Closer não esconde a aquisição
// ============================================================

describe("AC4 — Sem track real e os casos nomeados", () => {
  it("armadilha #5: lead sem UTM e venda com UTM de aquisição → NÃO é Sem track", () => {
    const r = classificar({ lead: { source: "" }, venda: { source: "manychat" } });
    expect(r.canal).toBe("ManyChat");
    expect(r.canal).not.toBe("Sem track real");
  });

  it("lead e venda sem nenhum campo de UTM → Sem track real (null, undefined, '', espaços)", () => {
    const vazios: Array<Utm | null | undefined> = [null, undefined, {}, { source: "", medium: "  ", campaign: null, term: undefined }];
    for (const lead of vazios) {
      for (const venda of vazios) {
        expect(classificar({ lead: lead as Utm | null, venda: venda as Utm | null })).toMatchObject({ canal: "Sem track real", regra: 9 });
      }
    }
  });

  it("R2-5 — Closer 22 do DG-PG02: venda só com UTM de closer → Aquisição não rastreada (só closer) + closer", () => {
    const r = classificar({ lead: { source: "  " }, venda: { source: "isabela", medium: "x1" } }, DG);
    expect(r).toMatchObject({
      canal: "Aquisição não rastreada (só closer)",
      regra: 8,
      fechamento: "closer",
    });
    expect(r.canal).not.toBe("Sem track real");
    expect(r.canal).not.toBe("Outros orgânicos");
  });

  it("R2-5 — o mesmo caso com a config de closers VAZIA cai em Outros orgânicos (o balde depende da config)", () => {
    expect(classificar({ lead: { source: "  " }, venda: { source: "isabela", medium: "x1" } }, SEM_CONFIG)).toMatchObject({
      canal: "Outros orgânicos",
      regra: 7,
      fechamento: "sem-closer",
      fonteUtm: "venda",
    });
  });

  it("Decisão 3 — lead com UTM de Meta e venda com medium de closer → Pago… E closer", () => {
    expect(classificar({ lead: { source: "meta", medium: "cbo" }, venda: { source: "meta", medium: "x1" } })).toMatchObject({
      canal: "Pago N/D",
      fechamento: "closer",
      fonteUtm: "lead",
      regraDeFechamento: "medium",
    });
    expect(classificar({ lead: { source: "meta", term: "hot" }, venda: { medium: "x1" } })).toMatchObject({
      canal: "Pago Quente",
      fechamento: "closer",
    });
  });

  it("FZ — ferramenta (chatwoot) + medium de closer: aquisição pela ferramenta, fechamento closer", () => {
    // Leitura literal da regra: só o campo que é sinal de closer é apagado.
    expect(classificar({ lead: null, venda: { source: "chatwoot", medium: "comercial" } }, FZ)).toMatchObject({
      canal: "Outros orgânicos",
      fechamento: "closer",
      regraDeFechamento: "medium",
    });
    expect(classificar({ lead: null, venda: { source: "flaviana", medium: "x1" } }, FZ)).toMatchObject({
      canal: "Aquisição não rastreada (só closer)",
      fechamento: "closer",
    });
  });
});

// ============================================================
// AC5 — Closer vem da config
// ============================================================

describe("AC5 — Closer 100% da config", () => {
  it("x1 na config → closer; config vazia → sem-closer", () => {
    expect(soLead({ source: "meta", medium: "x1" }, DG).fechamento).toBe("closer");
    expect(soLead({ source: "meta", medium: "x1" }, SEM_CONFIG).fechamento).toBe("sem-closer");
  });

  it("nome da config no source → closer; config vazia → sem-closer", () => {
    expect(soLead({ source: "isabela" }, DG).fechamento).toBe("closer");
    expect(soLead({ source: "isabela" }, SEM_CONFIG).fechamento).toBe("sem-closer");
    expect(soLead({ source: "closer" }, SEM_CONFIG).fechamento).toBe("sem-closer");
    expect(soLead({ source: "vendedor" }, SEM_CONFIG).fechamento).toBe("sem-closer");
  });

  it("case-insensitive e sem espaço nas pontas, dos dois lados", () => {
    const config = { closerMediums: [" X1 "], closerNomes: ["  Isabela "], closerPorSellerName: false };
    expect(soLead({ medium: "x1" }, config).fechamento).toBe("closer");
    expect(soLead({ source: "ISABELA  " }, config).fechamento).toBe("closer");
    expect(soLead({ source: "  isabela" }, config).canal).toBe("Aquisição não rastreada (só closer)");
  });

  it("Netão — closer por seller_name: sem UTM + sellerName → Sem track real + closer", () => {
    expect(classificar({ lead: null, venda: null, sellerName: "Netão" }, NETAO)).toMatchObject({
      canal: "Sem track real",
      regra: 9,
      fechamento: "closer",
      regraDeFechamento: "sellerName",
    });
  });

  it("Netão — com closerPorSellerName = false: Sem track real + sem-closer", () => {
    expect(classificar({ lead: null, venda: null, sellerName: "Netão" }, { ...NETAO, closerPorSellerName: false })).toMatchObject({
      canal: "Sem track real",
      fechamento: "sem-closer",
      regraDeFechamento: null,
    });
  });

  it("sellerName em branco não marca closer", () => {
    expect(classificar({ lead: null, venda: null, sellerName: "   " }, NETAO).fechamento).toBe("sem-closer");
  });

  it("determinismo: o mesmo nome classifica Closer em toda chamada (armadilha #9)", () => {
    const rotulos = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const r = classificar({ lead: { source: i % 2 ? "Isabela" : " isabela " }, venda: null });
      rotulos.add(`${r.canal}|${r.fechamento}`);
    }
    expect([...rotulos]).toEqual(["Aquisição não rastreada (só closer)|closer"]);
  });
});

// ============================================================
// AC6 — duas tabelas mutuamente exclusivas, uma por eixo
// ============================================================

describe("AC6 — agrupamento por eixo", () => {
  const entradas: EntradaClassificador[] = [
    { lead: { source: "meta", term: "hot" }, venda: { medium: "x1" } },
    { lead: { source: "meta", term: "frio" }, venda: null },
    { lead: { source: "fb" }, venda: null },
    { lead: { source: "ig" }, venda: null },
    { lead: null, venda: { source: "whatsapp" } },
    { lead: { source: "manychat" }, venda: null },
    { lead: { source: "chatwoot" }, venda: null },
    { lead: null, venda: { source: "isabela", medium: "x1" } },
    { lead: null, venda: { source: "kayta" } },
    { lead: null, venda: null },
    { lead: null, venda: null, sellerName: "Fulano" },
    // degeneradas
    { lead: {}, venda: {} },
    { lead: { source: "   " }, venda: { term: "" } },
  ];
  const classificadas = entradas.map((e) => classificar(e, { ...DG, closerPorSellerName: true }));

  it("Σ por canal === total, e cada linha cai em exatamente um canal", () => {
    const grupos = agruparPorCanal(classificadas);
    expect(grupos.reduce((s, g) => s + g.n, 0)).toBe(classificadas.length);
    const todas = grupos.flatMap((g) => g.linhas);
    expect(todas).toHaveLength(classificadas.length);
    expect(new Set(todas).size).toBe(classificadas.length);
  });

  it("Σ por fechamento === total", () => {
    const grupos = agruparPorFechamento(classificadas);
    expect(grupos.map((g) => g.fechamento)).toEqual(["closer", "sem-closer"]);
    expect(grupos.reduce((s, g) => s + g.n, 0)).toBe(classificadas.length);
    expect(grupos[0]!.n).toBe(4); // x1 da venda, isabela+x1, kayta, Fulano
  });

  it("ordem fixa e todos os canais presentes, inclusive com lista vazia", () => {
    // A ordem é a da tabela de regras (AC2) — fixada por extenso, não por CANAIS.
    expect(CANAIS).toEqual([
      "Pago Quente",
      "Pago Frio",
      "Pago N/D",
      "Instagram orgânico",
      "WhatsApp",
      "ManyChat",
      "Outros orgânicos",
      "Aquisição não rastreada (só closer)",
      "Sem track real",
    ]);
    expect(SEGMENTOS_DE_QUALIFICACAO).toEqual([
      "Pago Quente",
      "Pago Frio",
      "Pago N/D",
      "Orgânico",
      "Aquisição não rastreada (só closer)",
      "Sem track",
    ]);
    const vazio = agruparPorCanal([]);
    expect(vazio.map((g) => g.canal)).toEqual([...CANAIS]);
    expect(vazio.every((g) => g.n === 0)).toBe(true);
    expect(agruparPorFechamento([]).map((g) => [g.fechamento, g.n])).toEqual([
      ["closer", 0],
      ["sem-closer", 0],
    ]);
    expect(agruparPorCanal(classificadas).map((g) => g.canal)).toEqual([...CANAIS]);
  });

  it("R2-5: só-closer e Sem track real são baldes distintos, nunca somados", () => {
    const porCanal = Object.fromEntries(agruparPorCanal(classificadas).map((g) => [g.canal, g.n]));
    expect(porCanal["Aquisição não rastreada (só closer)"]).toBe(2);
    expect(porCanal["Sem track real"]).toBe(4); // null/null, Fulano, {}/{}, espaços
  });

  it("um valor fora da união lança em vez de ir para um balde qualquer", () => {
    expect(() => agruparPorCanal([{ canal: "Closer" as Canal }])).toThrow(/fora da união/);
    expect(() => agruparPorFechamento([{ fechamento: "talvez" as "closer" }])).toThrow(/fora da união/);
  });

  it("Comunidade/Front (listas) e Closer não são canais", () => {
    for (const lista of ["Comunidade", "Front", "Closer", "Closer/Vendas"]) {
      expect(CANAIS as readonly string[]).not.toContain(lista);
    }
    expect(FECHAMENTOS).toEqual(["closer", "sem-closer"]);
  });

  it("SEGMENTO_DE_QUALIFICACAO é total sobre Canal e cai nos segmentos declarados", () => {
    expect(Object.keys(SEGMENTO_DE_QUALIFICACAO).sort()).toEqual([...CANAIS].sort());
    for (const canal of CANAIS) {
      expect(SEGMENTOS_DE_QUALIFICACAO).toContain(SEGMENTO_DE_QUALIFICACAO[canal]);
    }
    expect(SEGMENTO_DE_QUALIFICACAO).toEqual({
      "Pago Quente": "Pago Quente",
      "Pago Frio": "Pago Frio",
      "Pago N/D": "Pago N/D",
      "Instagram orgânico": "Orgânico",
      WhatsApp: "Orgânico",
      ManyChat: "Orgânico",
      "Outros orgânicos": "Orgânico",
      "Aquisição não rastreada (só closer)": "Aquisição não rastreada (só closer)",
      "Sem track real": "Sem track",
    });
    // Todo segmento declarado é alcançável, e Closer/Front não são segmento.
    expect(new Set(Object.values(SEGMENTO_DE_QUALIFICACAO))).toEqual(new Set(SEGMENTOS_DE_QUALIFICACAO));
    expect(SEGMENTOS_DE_QUALIFICACAO as readonly string[]).not.toContain("Closer");
    expect(SEGMENTOS_DE_QUALIFICACAO as readonly string[]).not.toContain("Front");
  });
});

// ============================================================
// AC7 — robustez
// ============================================================

describe("AC7 — nunca lança, não depende de utm_content", () => {
  const valores: unknown[] = [
    null,
    undefined,
    "",
    "   ",
    "META",
    " Instagram ",
    "ÍG",
    "çãõ quente",
    "x1",
    "ISABELA",
    "{{ad.id}}",
    '{"co":"1","u":"x"}',
    120210,
    Number.NaN,
    {},
    [],
    true,
  ];

  /** Gerador determinístico (LCG) — o teste é reprodutível. */
  function* combinacoes(n: number) {
    let s = 49_2;
    const prox = () => {
      s = (s * 1_103_515_245 + 12_345) % 2_147_483_648;
      return valores[s % valores.length];
    };
    for (let i = 0; i < n; i++) {
      yield {
        lead: i % 7 === 0 ? null : { source: prox(), medium: prox(), campaign: prox(), term: prox(), campaignName: prox() },
        venda: i % 5 === 0 ? null : { source: prox(), medium: prox(), campaign: prox(), term: prox(), campaignName: prox() },
        sellerName: prox(),
      } as unknown as EntradaClassificador;
    }
  }

  it("2.000 combinações sujas → sempre um canal e um fechamento da união", () => {
    for (const entrada of combinacoes(2000)) {
      for (const config of [DG, SEM_CONFIG, NETAO]) {
        const r = classificarOrigem(entrada, config);
        expect(CANAIS).toContain(r.canal);
        expect(FECHAMENTOS).toContain(r.fechamento);
        expect(r.regra).toBeGreaterThanOrEqual(1);
        expect(r.regra).toBeLessThanOrEqual(9);
      }
    }
  });

  it("entrada e config malformadas não derrubam", () => {
    const quebrados = [null, undefined, 42, "x", []] as unknown[];
    for (const e of quebrados) {
      for (const c of quebrados) {
        const r = classificarOrigem(e as EntradaClassificador, c as ConfigClassificador);
        expect(r.canal).toBe("Sem track real");
      }
    }
    const configSuja = { closerMediums: [null, 1, " X1 "], closerNomes: "isabela", closerPorSellerName: "sim" };
    const r = classificarOrigem({ lead: { medium: "x1" }, venda: null, sellerName: "a" }, configSuja as unknown as ConfigClassificador);
    expect(r).toMatchObject({ fechamento: "closer", regraDeFechamento: "medium" });
  });

  it("um id numérico em utm_campaign é UTM preenchida (não vira Sem track em silêncio)", () => {
    const r = soLead({ campaign: 120210 as unknown as string, campaignName: "PG02 HOT" });
    expect(r).toMatchObject({ canal: "Pago Quente", temperaturaDecididaPor: "campaign_name" });
  });

  it("utm_content não entra na classificação", () => {
    const base: EntradaClassificador = { lead: { source: "chatwoot" }, venda: null };
    const esperado = classificar(base);
    for (const content of ["{{ad.id}}", '{"co":"meta","u":"hot"}', "meta", "hot", "x1"]) {
      const comContent = { lead: { source: "chatwoot", content }, venda: { content } } as unknown as EntradaClassificador;
      expect(classificar(comContent)).toEqual(esperado);
    }
    expect(classificar({ lead: { content: "meta" }, venda: null } as unknown as EntradaClassificador).canal).toBe("Sem track real");
  });
});

// ============================================================
// AC8 — diferencial contra lead-origin.ts e temperatura-de-publico.ts
// ============================================================

/** O que o classificador antigo diz para a UTM do LEAD (é o que o journey usa). */
interface LeituraAntiga {
  canal: CanalAntigo;
  origem: Origem;
  temperatura: Temperatura;
}

function antigo(entrada: EntradaClassificador): LeituraAntiga {
  const l = entrada.lead ?? {};
  return {
    canal: classifyCanal(l.source, l.medium),
    origem: classifyOrigem(l.source),
    temperatura: classifyTemperatura(l.term),
  };
}

/**
 * O canal novo traduzido para o vocabulário antigo. `null` = o canal novo não
 * tem equivalente lá (o balde só-closer não existe no classificador antigo).
 */
function projetarNoAntigo(canal: Canal): LeituraAntiga | null {
  switch (canal) {
    case "Pago Quente":
      return { canal: "Meta Ads", origem: "Pago", temperatura: "quente" };
    case "Pago Frio":
      return { canal: "Meta Ads", origem: "Pago", temperatura: "frio" };
    case "Pago N/D":
      return { canal: "Meta Ads", origem: "Pago", temperatura: "indefinido" };
    case "Instagram orgânico":
      return { canal: "Instagram", origem: "Orgânico", temperatura: "indefinido" };
    case "WhatsApp":
      return { canal: "WhatsApp", origem: "Orgânico", temperatura: "indefinido" };
    case "ManyChat":
      return { canal: "ManyChat", origem: "Orgânico", temperatura: "indefinido" };
    case "Outros orgânicos":
      return { canal: "Outros", origem: "Orgânico", temperatura: "indefinido" };
    case "Sem track real":
      return { canal: "Sem Track", origem: "Sem Track", temperatura: "indefinido" };
    case "Aquisição não rastreada (só closer)":
      return null;
  }
}

/** As divergências DE PROPÓSITO, com o motivo. Fora desta lista, divergir falha. */
const MOTIVOS = {
  closerEixo:
    "Closer é eixo de fechamento (decisão 3), lido da config; o antigo o trata como canal por regex fixo `closer|vendedor`",
  soCloser:
    "balde `Aquisição não rastreada (só closer)` (R2-5) não existe no antigo — lá o comprador só com UTM de closer cai em Closer ou Outros",
  fallbackVenda: "fallback para a UTM da venda (armadilha #5); o antigo só vê a do lead",
  fallbackCampaignName: "Quente/Frio com fallback no campaign_name da Meta (decisão 4); o antigo só lê utm_term",
  temperaturaAntesDoCanal: "a skill avalia Quente/Frio antes de qualquer canal; o antigo mantém o canal e só anota a temperatura",
  campoDeCasamento:
    "o novo casa termos em source, medium E campaign, e campaign/term contam como UTM preenchida; o antigo só lê source+medium",
  termosDaSkill:
    "termos de canal são os da skill, por token inteiro: `facebook`, `google`, `wpp`, `bio`, `many_chat`, e-mail e YouTube não são canal no debriefing",
  ordemDaSkill: "ordem da skill: Instagram antes de WhatsApp; o antigo testa WhatsApp primeiro",
  pagoPorCboAbo: "`cbo`/`abo` são pago na skill; o antigo não os conhece",
} as const;

type Motivo = keyof typeof MOTIVOS;

interface Caso {
  nome: string;
  entrada: EntradaClassificador;
  config?: ConfigClassificador;
  canal: Canal;
  /** Ausente = as regras coincidem; presente = divergência intencional. */
  diverge?: Motivo;
}

const CASOS: Caso[] = [
  // ---- coincidem ----
  { nome: "lead e venda vazios", entrada: { lead: {}, venda: null }, canal: "Sem track real" },
  { nome: "tudo null", entrada: { lead: null, venda: null }, canal: "Sem track real" },
  { nome: "manychat", entrada: { lead: { source: "manychat" }, venda: null }, canal: "ManyChat" },
  { nome: "whatsapp", entrada: { lead: { source: "whatsapp" }, venda: null }, canal: "WhatsApp" },
  { nome: "instagram", entrada: { lead: { source: "instagram" }, venda: null }, canal: "Instagram orgânico" },
  { nome: "ig", entrada: { lead: { source: "ig" }, venda: null }, canal: "Instagram orgânico" },
  { nome: "meta", entrada: { lead: { source: "meta" }, venda: null }, canal: "Pago N/D" },
  { nome: "META com espaço", entrada: { lead: { source: " META " }, venda: null }, canal: "Pago N/D" },
  { nome: "fb", entrada: { lead: { source: "fb" }, venda: null }, canal: "Pago N/D" },
  { nome: "meta-ads", entrada: { lead: { source: "meta-ads" }, venda: null }, canal: "Pago N/D" },
  { nome: "meta / cpc", entrada: { lead: { source: "meta", medium: "cpc" }, venda: null }, canal: "Pago N/D" },
  { nome: "meta / hot", entrada: { lead: { source: "meta", term: "publico-hot" }, venda: null }, canal: "Pago Quente" },
  { nome: "meta / frio", entrada: { lead: { source: "fb", term: "frio" }, venda: null }, canal: "Pago Frio" },
  { nome: "chatwoot", entrada: { lead: { source: "chatwoot" }, venda: null }, canal: "Outros orgânicos" },
  { nome: "qrcode", entrada: { lead: { source: "qrcode" }, venda: null }, canal: "Outros orgânicos" },
  {
    nome: "lead Meta × venda x1 (decisão 3): o canal coincide, o fechamento é informação nova",
    entrada: { lead: { source: "meta" }, venda: { medium: "x1" } },
    canal: "Pago N/D",
  },
  {
    nome: "Netão: sem UTM + sellerName — canal coincide (Sem track)",
    entrada: { lead: null, venda: null, sellerName: "Netão" },
    config: NETAO,
    canal: "Sem track real",
  },

  // ---- divergem de propósito ----
  { nome: "medium 'closer' fora da config", entrada: { lead: { source: "meta", medium: "closer" }, venda: null }, canal: "Pago N/D", diverge: "closerEixo" },
  { nome: "vendedor", entrada: { lead: { source: "vendedor" }, venda: null }, canal: "Outros orgânicos", diverge: "closerEixo" },
  { nome: "source 'closer' na config", entrada: { lead: { source: "closer" }, venda: null }, canal: "Aquisição não rastreada (só closer)", diverge: "soCloser" },
  { nome: "isabela / x1", entrada: { lead: { source: "isabela", medium: "x1" }, venda: null }, canal: "Aquisição não rastreada (só closer)", diverge: "soCloser" },
  { nome: "venda sem lead", entrada: { lead: null, venda: { source: "meta" } }, canal: "Pago N/D", diverge: "fallbackVenda" },
  { nome: "lead vazio, venda whatsapp", entrada: { lead: { source: " " }, venda: { source: "whatsapp" } }, canal: "WhatsApp", diverge: "fallbackVenda" },
  {
    nome: "campaignName HOT",
    entrada: { lead: { source: "meta", campaign: "120210", campaignName: "PG02 | HOT" }, venda: null },
    canal: "Pago Quente",
    diverge: "fallbackCampaignName",
  },
  {
    nome: "term sem temperatura + campaignName frio",
    entrada: { lead: { source: "meta", term: "lal-1", campaign: "1", campaignName: "Frio" }, venda: null },
    canal: "Pago Frio",
    diverge: "fallbackCampaignName",
  },
  { nome: "instagram + hot", entrada: { lead: { source: "instagram", term: "hot" }, venda: null }, canal: "Pago Quente", diverge: "temperaturaAntesDoCanal" },
  { nome: "só term hot", entrada: { lead: { term: "hot" }, venda: null }, canal: "Pago Quente", diverge: "campoDeCasamento" },
  { nome: "meta só no campaign", entrada: { lead: { campaign: "[PG02][META][CBO]" }, venda: null }, canal: "Pago N/D", diverge: "campoDeCasamento" },
  { nome: "só campaign sem termo", entrada: { lead: { campaign: "lancamento" }, venda: null }, canal: "Outros orgânicos", diverge: "campoDeCasamento" },
  { nome: "facebook", entrada: { lead: { source: "facebook" }, venda: null }, canal: "Outros orgânicos", diverge: "termosDaSkill" },
  { nome: "google", entrada: { lead: { source: "google" }, venda: null }, canal: "Outros orgânicos", diverge: "termosDaSkill" },
  { nome: "google-ads", entrada: { lead: { source: "google-ads" }, venda: null }, canal: "Outros orgânicos", diverge: "termosDaSkill" },
  { nome: "wpp", entrada: { lead: { source: "wpp" }, venda: null }, canal: "Outros orgânicos", diverge: "termosDaSkill" },
  { nome: "bio", entrada: { lead: { source: "bio" }, venda: null }, canal: "Outros orgânicos", diverge: "termosDaSkill" },
  { nome: "many_chat", entrada: { lead: { source: "many_chat" }, venda: null }, canal: "Outros orgânicos", diverge: "termosDaSkill" },
  { nome: "mautic", entrada: { lead: { source: "mautic" }, venda: null }, canal: "Outros orgânicos", diverge: "termosDaSkill" },
  { nome: "youtube", entrada: { lead: { source: "youtube" }, venda: null }, canal: "Outros orgânicos", diverge: "termosDaSkill" },
  { nome: "instagram / whatsapp", entrada: { lead: { source: "instagram", medium: "whatsapp" }, venda: null }, canal: "Instagram orgânico", diverge: "ordemDaSkill" },
  { nome: "cbo", entrada: { lead: { source: "cbo" }, venda: null }, canal: "Pago N/D", diverge: "pagoPorCboAbo" },
];

describe("AC8 — diferencial contra classifyOrigem / classifyCanal / classifyTemperatura", () => {
  it.each(CASOS.map((c) => [c.nome, c] as const))("%s", (_nome, caso) => {
    const novo = classificarOrigem(caso.entrada, caso.config ?? DG);
    expect(novo.canal).toBe(caso.canal);

    const esperadoNoAntigo = projetarNoAntigo(novo.canal);
    const coincide = esperadoNoAntigo !== null && JSON.stringify(esperadoNoAntigo) === JSON.stringify(antigo(caso.entrada));

    if (caso.diverge) {
      // Divergência listada que voltou a coincidir também falha: a lista
      // precisa descrever o código, não o passado.
      expect(coincide, `listado como divergente (${MOTIVOS[caso.diverge]}) mas coincide`).toBe(false);
    } else {
      expect(
        coincide,
        `divergência NÃO listada: novo=${novo.canal} antigo=${JSON.stringify(antigo(caso.entrada))}`,
      ).toBe(true);
    }
  });

  it("toda divergência listada tem motivo, e todo motivo é usado", () => {
    const usados = new Set(CASOS.flatMap((c) => (c.diverge ? [c.diverge] : [])));
    expect([...usados].sort()).toEqual(Object.keys(MOTIVOS).sort());
  });

  it("o diferencial cobre todos os canais novos", () => {
    const cobertos = new Set(CASOS.map((c) => c.canal));
    expect([...cobertos].sort()).toEqual([...CANAIS].sort());
  });
});

describe("AC8 — Quente/Frio ≡ temperaturaDoNome ≡ classifyTemperatura; a única diferença é o fallback", () => {
  const TEXTOS = [
    "hot",
    "HOT",
    "quente",
    "Quente",
    "esquente",
    "cold",
    "frio",
    "FRIO",
    "público-frio",
    "ColdStart",
    "hot-cold",
    "cold-hot",
    "frio quente",
    "photo",
    "[PG02][CAPTACAO][HOT]",
    "lookalike",
    "thermo",
    "aquecimento",
    "",
    "   ",
  ];

  const temperaturaDoCanal = (canal: Canal) =>
    canal === "Pago Quente" ? "quente" : canal === "Pago Frio" ? "frio" : null;

  it.each(TEXTOS)("pelo utm_term: %j", (texto) => {
    const novo = temperaturaDoCanal(soLead({ source: "meta", term: texto }, SEM_CONFIG).canal);
    expect(novo).toBe(temperaturaDoNome(texto));
    expect(novo ?? "indefinido").toBe(classifyTemperatura(texto));
  });

  it.each(TEXTOS)("pelo campaignName: %j", (texto) => {
    const r = soLead({ source: "meta", campaign: "120210", campaignName: texto }, SEM_CONFIG);
    const novo = temperaturaDoCanal(r.canal);
    expect(novo).toBe(temperaturaDoNome(texto));
    // A diferença declarada: o antigo, sem utm_term, nunca decide.
    expect(classifyTemperatura(undefined)).toBe("indefinido");
    expect(r.temperaturaDecididaPor).toBe(novo ? "campaign_name" : null);
  });
});
