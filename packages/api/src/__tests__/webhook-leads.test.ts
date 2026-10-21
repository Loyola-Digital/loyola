/**
 * O lead que chega por webhook (`services/webhook-leads.ts`).
 *
 * O corpo real que motivou o módulo é o do Mautic via n8n: `nome`, `email`,
 * `telefone` e as cinco UTMs **em branco** — form-urlencoded manda `""`, não
 * manda ausência. Se essa string vazia virasse "(sem source)" em vez de nada,
 * a origem do lead passaria a mentir com cara de dado.
 */

import { describe, it, expect } from "vitest";
import {
  COLUNAS,
  MAPEAMENTO,
  dataComoPlanilha,
  fonteComoPlanilhaId,
  idDaFonte,
  leadsComoPlanilha,
  normalizarLead,
  parseCorpoDeWebhook,
  type LinhaDeFonte,
} from "../services/webhook-leads.js";

const vazio: Omit<LinhaDeFonte, "recebidoEm"> = {
  nome: null,
  email: null,
  telefone: null,
  utmSource: null,
  utmMedium: null,
  utmCampaign: null,
  utmContent: null,
  utmTerm: null,
};

describe("idDaFonte", () => {
  it("reconhece a fonte de webhook e devolve o id", () => {
    const id = "3f1c0a9e-0000-4000-8000-000000000001";
    expect(idDaFonte(fonteComoPlanilhaId(id))).toBe(id);
  });

  it("deixa passar a planilha de verdade do Google", () => {
    expect(idDaFonte("1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms")).toBeNull();
    // Prefixo sem id não é fonte: devolver "" faria o leitor buscar a fonte vazia.
    expect(idDaFonte("webhook:")).toBeNull();
  });
});

describe("normalizarLead", () => {
  it("lê o corpo que o Mautic manda, com as UTMs em branco", () => {
    const lead = normalizarLead({
      nome: "testeqa",
      email: "lucasviilva17@gmail.com",
      telefone: "1111111111111",
      utm_term: "",
      utm_medium: "",
      utm_content: "",
      utm_source: "",
      utm_campaign: "",
    });

    expect(lead).toEqual({
      nome: "testeqa",
      email: "lucasviilva17@gmail.com",
      telefone: "1111111111111",
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
      utmContent: null,
      utmTerm: null,
    });
  });

  it("aceita os apelidos de quem não fala português", () => {
    const lead = normalizarLead({
      Name: "Ana",
      "E-mail": "ANA@X.COM",
      whatsapp: " 11999990000 ",
      utmSource: "ig",
      campanha: "bf26",
    });

    expect(lead?.nome).toBe("Ana");
    // Minúsculo porque o dedup do funil compara e-mail normalizado.
    expect(lead?.email).toBe("ana@x.com");
    expect(lead?.telefone).toBe("11999990000");
    expect(lead?.utmSource).toBe("ig");
    expect(lead?.utmCampaign).toBe("bf26");
  });

  it("descarta o corpo sem e-mail e sem telefone", () => {
    // Sem identificador o lead não entra em únicos nem vai ao CAPI — só infla.
    expect(normalizarLead({ nome: "só o nome", utm_source: "ig" })).toBeNull();
    expect(normalizarLead({})).toBeNull();
  });

  it("não aceita objeto como telefone", () => {
    expect(normalizarLead({ telefone: { ddd: 11 }, email: "a@b.com" })?.telefone).toBeNull();
  });
});

describe("leadsComoPlanilha", () => {
  it("põe cada valor sob o seu cabeçalho", () => {
    const { headers, rows, totalRows } = leadsComoPlanilha([
      {
        ...vazio,
        nome: "Ana",
        email: "ana@x.com",
        telefone: "11999990000",
        utmSource: "ig",
        utmCampaign: "bf26",
        recebidoEm: new Date("2026-10-21T18:30:05Z"),
      },
    ]);

    const valor = (coluna: string) => rows[0][headers.indexOf(coluna)];
    expect(valor("nome")).toBe("Ana");
    expect(valor("email")).toBe("ana@x.com");
    expect(valor("telefone")).toBe("11999990000");
    expect(valor("utm_source")).toBe("ig");
    expect(valor("utm_campaign")).toBe("bf26");
    expect(valor("utm_medium")).toBe("");
    expect(totalRows).toBe(1);
  });

  it("escreve a data como a planilha pt-BR escreveria, no fuso de São Paulo", () => {
    // 18:30 UTC = 15:30 em São Paulo. Em ISO com `Z` os leitores do repo
    // divergiriam entre si; em dd/mm/aaaa todos leem o mesmo dia.
    expect(dataComoPlanilha(new Date("2026-10-21T18:30:05Z"))).toBe("21/10/2026 15:30:05");
    // Perto da meia-noite UTC o dia civil de São Paulo ainda é o anterior.
    expect(dataComoPlanilha(new Date("2026-10-22T01:00:00Z"))).toBe("21/10/2026 22:00:00");
  });

  it("mapeia todo campo do funil para um cabeçalho que existe", () => {
    // Um nome trocado aqui devolveria -1 no `headers.indexOf` lá no agregador,
    // em silêncio — é o modo de falhar que a planilha virtual existe para evitar.
    for (const header of Object.values(MAPEAMENTO)) {
      expect(COLUNAS).toContain(header);
    }
  });
});

describe("parseCorpoDeWebhook", () => {
  const FORM = "application/x-www-form-urlencoded";

  it("lê o form-urlencoded do Mautic", () => {
    const corpo = parseCorpoDeWebhook(
      "nome=testeqa&email=lucasviilva17%40gmail.com&telefone=1111111111111&utm_source=",
      FORM,
    );

    expect(corpo).toEqual({
      nome: "testeqa",
      email: "lucasviilva17@gmail.com",
      telefone: "1111111111111",
      utm_source: "",
    });
  });

  it("desce no `body` quando o n8n manda o nó inteiro", () => {
    const no = JSON.stringify([
      {
        headers: { host: "n8n.loyoladigital.com" },
        body: { nome: "Ana", email: "ana@x.com" },
        webhookUrl: "https://n8n.loyoladigital.com/webhook/dgpg04-pc",
      },
    ]);

    expect(parseCorpoDeWebhook(no, "application/json")).toEqual({
      nome: "Ana",
      email: "ana@x.com",
    });
  });

  it("aceita o JSON simples e recusa o que não dá para interpretar", () => {
    expect(parseCorpoDeWebhook('{"email":"a@b.com"}', "application/json")).toEqual({
      email: "a@b.com",
    });
    expect(parseCorpoDeWebhook("isto não é json", "application/json")).toBeNull();
    expect(parseCorpoDeWebhook("", FORM)).toBeNull();
    expect(parseCorpoDeWebhook(null, FORM)).toBeNull();
  });
});
