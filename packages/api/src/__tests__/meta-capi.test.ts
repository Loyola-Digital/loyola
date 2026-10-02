/**
 * A volta da faixa para o Meta.
 *
 * O ponto da feature: o Meta otimiza para "lead" e lead é qualquer formulário
 * preenchido, então ele persegue o mais barato — que costuma ser o pior.
 * Mandando um evento só para a faixa que importa, ele passa a perseguir ESSE.
 *
 * O que estes testes protegem é o que erra em silêncio: PII que sai sem hash,
 * telefone sem DDI que não casa com ninguém, lead repetido a cada sincronização,
 * e lead sem identificador virando evento inútil.
 */

import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  eventoDoLead,
  hashDeEmail,
  hashDeTelefone,
  montarLote,
} from "../services/meta-capi.js";

const sha = (v: string) => createHash("sha256").update(v).digest("hex");

describe("hashDeEmail", () => {
  it("normaliza antes de hashear — o Meta compara com o dele normalizado", () => {
    expect(hashDeEmail("  Ana@Exemplo.COM ")).toBe(sha("ana@exemplo.com"));
  });

  it("sem e-mail não vira hash de vazio — isso casaria com todo mundo sem e-mail", () => {
    expect(hashDeEmail("")).toBe("");
    expect(hashDeEmail(null)).toBe("");
    expect(hashDeEmail("não é e-mail")).toBe("");
  });
});

describe("hashDeTelefone", () => {
  it("põe o DDI 55 no número brasileiro — sem ele o Meta não casa", () => {
    expect(hashDeTelefone("(11) 99905-6831")).toBe(sha("5511999056831"));
    expect(hashDeTelefone("1199056831")).toBe(sha("551199056831"));
  });

  it("número que já tem DDI é respeitado", () => {
    expect(hashDeTelefone("+55 11 99905-6831")).toBe(sha("5511999056831"));
  });

  it("o mesmo número escrito de dois jeitos dá o MESMO hash", () => {
    expect(hashDeTelefone("(11) 99905-6831")).toBe(hashDeTelefone("11999056831"));
  });

  it("lixo não vira identificador", () => {
    expect(hashDeTelefone("123")).toBe("");
    expect(hashDeTelefone("")).toBe("");
  });
});

const OPCOES = { stageId: "etapa-1", eventName: "LeadQualificado" };

describe("eventoDoLead", () => {
  it("nada de PII em claro no evento", () => {
    const e = eventoDoLead(
      { chave: "ana@x.com", email: "ana@x.com", telefone: "11999056831", faixa: "A", score: 42 },
      OPCOES,
    );
    const texto = JSON.stringify(e);
    expect(texto).not.toContain("ana@x.com");
    expect(texto).not.toContain("11999056831");
    expect(e?.user_data.em).toBe(sha("ana@x.com"));
  });

  it("a faixa vai junto — é o que o Meta aprende a perseguir", () => {
    const e = eventoDoLead({ chave: "k", email: "a@b.com", faixa: "A", score: 30 }, OPCOES);
    expect(e?.custom_data).toMatchObject({ faixa: "A", score: 30 });
  });

  it("sem e-mail e sem telefone não há evento — não há com o que casar", () => {
    expect(eventoDoLead({ chave: "k", faixa: "A" }, OPCOES)).toBeNull();
  });

  it("o mesmo lead gera sempre o MESMO event_id — é o que impede o envio dobrado", () => {
    const a = eventoDoLead({ chave: "ana@x.com", email: "ana@x.com", faixa: "A" }, OPCOES);
    const b = eventoDoLead({ chave: "ana@x.com", email: "ana@x.com", faixa: "A", score: 9 }, OPCOES);
    expect(a?.event_id).toBe(b?.event_id);
  });

  it("etapas diferentes não compartilham event_id", () => {
    const a = eventoDoLead({ chave: "k", email: "a@b.com", faixa: "A" }, OPCOES);
    const b = eventoDoLead({ chave: "k", email: "a@b.com", faixa: "A" }, { ...OPCOES, stageId: "etapa-2" });
    expect(a?.event_id).not.toBe(b?.event_id);
  });

  it("lead antigo entra com data dentro da janela de 7 dias, em vez de ser recusado", () => {
    const e = eventoDoLead(
      { chave: "k", email: "a@b.com", faixa: "A", quando: "2020-01-01T00:00:00Z" },
      OPCOES,
    );
    const limite = Math.floor(Date.now() / 1000) - 7 * 86_400;
    expect(e!.event_time).toBeGreaterThan(limite);
  });

  it("a data da resposta é respeitada quando é recente", () => {
    const ontem = new Date(Date.now() - 86_400_000).toISOString();
    const e = eventoDoLead({ chave: "k", email: "a@b.com", faixa: "A", quando: ontem }, OPCOES);
    expect(e!.event_time).toBe(Math.floor(Date.parse(ontem) / 1000));
  });

  it("o evento não se diz nascido no site — ele nasce da nossa classificação", () => {
    const e = eventoDoLead({ chave: "k", email: "a@b.com", faixa: "A" }, OPCOES);
    expect(e?.action_source).toBe("system_generated");
  });
});

describe("montarLote", () => {
  const leads = [
    { chave: "a", email: "a@x.com", faixa: "A" },
    { chave: "b", email: "b@x.com", faixa: "B" },
    { chave: "c", email: "c@x.com", faixa: "A" },
    { chave: "d", faixa: "A" }, // sem identificador
  ];

  it("só as faixas configuradas vão", () => {
    const r = montarLote(leads, { ...OPCOES, faixas: ["A"] });
    expect(r.eventos).toHaveLength(2);
  });

  it("duas faixas configuradas, as duas vão", () => {
    const r = montarLote(leads, { ...OPCOES, faixas: ["A", "B"] });
    expect(r.eventos).toHaveLength(3);
  });

  it("a faixa é comparada sem caixa — 'a' e 'A' são a mesma", () => {
    const r = montarLote([{ chave: "x", email: "x@x.com", faixa: "a" }], {
      ...OPCOES,
      faixas: ["A"],
    });
    expect(r.eventos).toHaveLength(1);
  });

  it("lead sem identificador é CONTADO, não escondido", () => {
    const r = montarLote(leads, { ...OPCOES, faixas: ["A"] });
    expect(r.semIdentificador).toBe(1);
  });

  it("quem já foi não vai de novo, e isso aparece no relatório", () => {
    const r = montarLote(leads, { ...OPCOES, faixas: ["A"], jaEnviados: new Set(["a"]) });
    expect(r.eventos).toHaveLength(1);
    expect(r.jaEstavam).toBe(1);
  });

  it("nenhuma faixa configurada não manda ninguém — silêncio é melhor que ensinar errado", () => {
    expect(montarLote(leads, { ...OPCOES, faixas: [] }).eventos).toHaveLength(0);
  });

  it("as chaves saem na MESMA ordem dos eventos — é por elas que se registra quem foi", () => {
    const r = montarLote(leads, { ...OPCOES, faixas: ["A"] });
    expect(r.chaves).toEqual(["a", "c"]);
    expect(r.chaves).toHaveLength(r.eventos.length);
  });

  it("lead sem identificador não entra nas chaves — não foi enviado, não pode constar como enviado", () => {
    const r = montarLote(leads, { ...OPCOES, faixas: ["A"] });
    expect(r.chaves).not.toContain("d");
  });
});
