import { describe, it, expect } from "vitest";
import { mapearAtividade, ignorarEvento } from "../services/meta-activity-mapper";
import type { MetaActivity } from "../services/meta-ads";

/**
 * `toLocaleString("pt-BR")` separa o símbolo do valor com espaço NÃO separável
 * (U+00A0), não com espaço comum. Normalizar aqui deixa a asserção legível sem
 * esconder o formato real.
 */
const semNbsp = (texto: string | undefined) => (texto ?? "").replace(/\u00a0/g, " ");

/** Atividade com os campos que a Graph API devolve de verdade. */
function atividade(over: Partial<MetaActivity> = {}): MetaActivity {
  return {
    event_type: "update_campaign_budget",
    event_time: "2026-07-29T12:47:48+0000",
    translated_event_type: "Orçamento da campanha atualizado",
    object_id: "120255081659520273",
    object_name: "fz-m2-ago26--leads-captacao--hot--estaticos--lpa",
    actor_name: "Danilo Takeshi Sagae",
    ...over,
  };
}

describe("meta-activity-mapper", () => {
  describe("orçamento", () => {
    // Payload real da conta: valores em centavos, moeda no próprio objeto.
    const extra = JSON.stringify({
      old_value: { type: "payment_amount", currency: "BRL", old_value: 20000, additional_value: "" },
      new_value: { type: "payment_amount", currency: "BRL", new_value: 30000, additional_value: "Por dia" },
      type: "composite_data",
    });

    it("classifica como Ajuste de Budget e converte centavos", () => {
      const d = mapearAtividade(atividade({ extra_data: extra }));
      expect(d?.categoria).toBe("Ajuste de Budget");
      expect(semNbsp(d?.notes)).toContain("R$ 200,00");
      expect(semNbsp(d?.notes)).toContain("R$ 300,00");
      expect(d?.notes).toContain("→");
    });

    it("mantém a cadência do orçamento na observação", () => {
      const d = mapearAtividade(atividade({ extra_data: extra }));
      expect(d?.notes).toContain("por dia");
    });

    it("preserva quem mexeu e o nome da campanha", () => {
      const d = mapearAtividade(atividade({ extra_data: extra }));
      expect(d?.responsavel).toBe("Danilo Takeshi Sagae");
      expect(d?.notes).toContain("fz-m2-ago26--leads-captacao--hot--estaticos--lpa");
    });
  });

  describe("liga/desliga", () => {
    const status = (novo: string) =>
      JSON.stringify({ run_status: { old_value: 1, new_value: 15 }, old_value: "Ativa", new_value: novo, type: "run_status" });

    it("Ativa vira Campanha Ligada", () => {
      const d = mapearAtividade(
        atividade({ event_type: "update_campaign_run_status", extra_data: status("Ativa") }),
      );
      expect(d?.categoria).toBe("Campanha Ligada");
    });

    it("Inativa vira Campanha Desligada", () => {
      const d = mapearAtividade(
        atividade({ event_type: "update_campaign_run_status", extra_data: status("Inativa") }),
      );
      expect(d?.categoria).toBe("Campanha Desligada");
    });

    it("estado desconhecido não é tratado como ligada", () => {
      const d = mapearAtividade(
        atividade({ event_type: "update_ad_set_run_status", extra_data: status("Arquivada") }),
      );
      expect(d?.categoria).toBe("Campanha Desligada");
    });
  });

  describe("público e criativos", () => {
    it("direcionamento vira Ajuste de Público resumido em uma linha", () => {
      const d = mapearAtividade(
        atividade({
          event_type: "update_ad_set_target_spec",
          translated_event_type: "Direcionamento do conjunto de anúncios atualizado",
          extra_data: JSON.stringify({
            old_value: [],
            new_value: [
              { content: "Localização:", children: ["Brasil"] },
              { content: "Idade:", children: ["26 a 60"] },
            ],
            type: "targets_spec",
          }),
        }),
      );
      expect(d?.categoria).toBe("Ajuste de Público");
      expect(d?.notes).toContain("Localização: Brasil");
      expect(d?.notes).toContain("Idade: 26 a 60");
      // Não pode vazar JSON cru na observação que o time lê.
      expect(d?.notes).not.toContain("{");
    });

    it("criação de anúncio vira Publicação de Criativos", () => {
      expect(mapearAtividade(atividade({ event_type: "create_ad" }))?.categoria).toBe(
        "Publicação de Criativos",
      );
    });
  });

  describe("ruído de plataforma", () => {
    it("ignora entrega e cobrança", () => {
      expect(ignorarEvento("first_delivery_event")).toBe(true);
      expect(ignorarEvento("ad_account_billing_charge")).toBe(true);
      expect(mapearAtividade(atividade({ event_type: "first_delivery_event" }))).toBeNull();
    });

    it("não ignora mudança de verba", () => {
      expect(ignorarEvento("update_campaign_budget")).toBe(false);
    });
  });

  describe("dedup", () => {
    it("sourceId é estável para o mesmo evento", () => {
      const a = mapearAtividade(atividade())!;
      const b = mapearAtividade(atividade())!;
      expect(a.sourceId).toBe(b.sourceId);
    });

    it("sourceId separa eventos diferentes do mesmo objeto no mesmo instante", () => {
      const verba = mapearAtividade(atividade())!;
      const status = mapearAtividade(atividade({ event_type: "update_campaign_run_status" }))!;
      expect(verba.sourceId).not.toBe(status.sourceId);
    });
  });

  describe("dados incompletos", () => {
    it("sem extra_data ainda gera entrada", () => {
      const d = mapearAtividade(atividade({ extra_data: undefined }));
      expect(d).not.toBeNull();
      expect(d?.notes).toContain("Orçamento da campanha atualizado");
    });

    it("sem ator cai num responsável genérico", () => {
      expect(mapearAtividade(atividade({ actor_name: undefined }))?.responsavel).toBe("Meta Ads (auto)");
    });

    it("data inválida é descartada", () => {
      expect(mapearAtividade(atividade({ event_time: "não é data" }))).toBeNull();
    });
  });
});
