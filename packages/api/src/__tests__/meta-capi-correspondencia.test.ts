/**
 * A qualidade do que vai ao Meta — URL, nome e `external_id`.
 *
 * ## O que estava errado
 *
 * O evento saía com `em` e `ph` e mais nada, `action_source: system_generated`
 * e sem `event_source_url`. Dois efeitos:
 *
 * 1. A **Qualidade da Correspondência** (a nota por evento no Gerenciador) só é
 *    calculada para evento de SITE. Sem URL e com `system_generated`, não há
 *    nota — e o pouco que casa, casa por dois campos só.
 * 2. O **nome** estava sendo LIDO da planilha e jogado fora. Medido na Captação
 *    Paga do dg-pg05-out-26 (13/10/2026): nome preenchido em 99,3% das 269
 *    linhas, e nenhum evento levava `fn`/`ln`.
 *
 * O `external_id` é o terceiro parâmetro de correspondência que faltava, e é
 * ele que permite ao Gerenciador reconhecer a mesma pessoa em eventos de faixas
 * diferentes.
 */

import { describe, expect, it } from "vitest";
import {
  eventoDoLead,
  hashDeNome,
  montarLote,
  primeiroEUltimoNome,
} from "../services/meta-capi.js";

const lead = {
  chave: "jose@exemplo.com",
  email: "jose@exemplo.com",
  telefone: "41992322266",
  nome: "José Gabriel Silva",
  faixa: "A",
  score: 42,
};

const base = { stageId: "etapa-1", eventName: "LeadFaixaA" };

describe("primeiroEUltimoNome", () => {
  it("manda primeiro e último, e deixa o do meio de fora", () => {
    // O Meta tem campo para primeiro e último; enfiar o do meio no sobrenome
    // faria o hash não casar com nada.
    const { fn, ln } = primeiroEUltimoNome("José Gabriel Silva");
    expect(fn).toBe(hashDeNome("jose"));
    expect(ln).toBe(hashDeNome("silva"));
  });

  it("tira o acento — senão metade dos nomes brasileiros não casa", () => {
    expect(hashDeNome("José")).toBe(hashDeNome("Jose"));
    expect(hashDeNome("MÁRIO")).toBe(hashDeNome("mario"));
  });

  it("nome único vai como primeiro, SEM sobrenome falso", () => {
    // Repetir o mesmo valor nos dois campos seria inventar um sobrenome.
    expect(primeiroEUltimoNome("Madonna")).toEqual({ fn: hashDeNome("madonna"), ln: "" });
  });

  it("vazio ou só espaço não gera hash nenhum", () => {
    expect(primeiroEUltimoNome("")).toEqual({ fn: "", ln: "" });
    expect(primeiroEUltimoNome("   ")).toEqual({ fn: "", ln: "" });
    expect(primeiroEUltimoNome(null)).toEqual({ fn: "", ln: "" });
  });

  it("pontuação sai: nome composto com hífen casa com a versão sem", () => {
    // Caso real de cadastro: "Ana-Maria" e "AnaMaria" são a mesma pessoa, e o
    // Meta quer só letras minúsculas.
    expect(hashDeNome("Ana-Maria")).toBe(hashDeNome("anamaria"));
    expect(hashDeNome("  José  ")).toBe(hashDeNome("jose"));
  });
});

describe("eventoDoLead — os parâmetros de correspondência", () => {
  it("leva nome e external_id junto de e-mail e telefone", () => {
    const e = eventoDoLead(lead, base)!;
    expect(Object.keys(e.user_data).sort()).toEqual([
      "em",
      "external_id",
      "fn",
      "ln",
      "ph",
    ]);
  });

  it("nunca manda PII em claro — tudo é hash de 64 hex", () => {
    const e = eventoDoLead(lead, base)!;
    for (const [campo, valor] of Object.entries(e.user_data)) {
      expect(valor, campo).toMatch(/^[0-9a-f]{64}$/);
    }
    const cru = JSON.stringify(e);
    expect(cru).not.toContain("jose@exemplo.com");
    expect(cru).not.toContain("41992322266");
    expect(cru.toLowerCase()).not.toContain("silva");
  });

  it("lead sem nome ainda vai — com os campos que tem", () => {
    const e = eventoDoLead({ ...lead, nome: null }, base)!;
    expect(Object.keys(e.user_data).sort()).toEqual(["em", "external_id", "ph"]);
  });

  it("external_id é estável e insensível a caixa e espaço na chave", () => {
    const a = eventoDoLead(lead, base)!;
    const b = eventoDoLead({ ...lead, chave: "  JOSE@EXEMPLO.COM " }, base)!;
    expect(a.user_data.external_id).toBe(b.user_data.external_id);
  });

  it("sem e-mail nem telefone continua `null` — nome sozinho o Meta não casa", () => {
    expect(eventoDoLead({ ...lead, email: null, telefone: null }, base)).toBe(null);
  });
});

describe("eventoDoLead — a URL e o action_source", () => {
  it("com URL, sai como evento de SITE apontando para a página", () => {
    const e = eventoDoLead(lead, { ...base, eventSourceUrl: "https://dg.com/pesquisa" })!;
    expect(e.event_source_url).toBe("https://dg.com/pesquisa");
    expect(e.action_source).toBe("website");
  });

  it("sem URL, NÃO diz website — seria mentir sobre a origem", () => {
    // O Meta exige a URL no evento de site; "website" sem página é o pior dos
    // dois mundos: mente e não ganha nota.
    const e = eventoDoLead(lead, base)!;
    expect(e.action_source).toBe("system_generated");
    expect(e.event_source_url).toBeUndefined();
  });

  it("URL só com espaço conta como vazia", () => {
    const e = eventoDoLead(lead, { ...base, eventSourceUrl: "   " })!;
    expect(e.action_source).toBe("system_generated");
    expect(e.event_source_url).toBeUndefined();
  });

  it("`actionSource` explícito manda, mesmo com URL", () => {
    const e = eventoDoLead(lead, {
      ...base,
      eventSourceUrl: "https://dg.com/p",
      actionSource: "system_generated",
    })!;
    expect(e.action_source).toBe("system_generated");
    expect(e.event_source_url).toBe("https://dg.com/p");
  });

  it("a URL chega em TODOS os eventos do lote, não só no primeiro", () => {
    const { eventos } = montarLote(
      [lead, { ...lead, chave: "b@x.com", email: "b@x.com", faixa: "B" }],
      {
        stageId: "etapa-1",
        eventName: "Lead",
        faixas: ["A", "B"],
        eventSourceUrl: "https://dg.com/pesquisa",
      },
    );
    expect(eventos).toHaveLength(2);
    expect(eventos.every((e) => e.event_source_url === "https://dg.com/pesquisa")).toBe(true);
    expect(eventos.every((e) => e.action_source === "website")).toBe(true);
  });
});
