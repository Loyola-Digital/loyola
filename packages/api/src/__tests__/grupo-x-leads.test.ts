/**
 * De que canal veio quem entrou no grupo.
 *
 * O caso que dita a chave: o SendFlow devolve o número de WhatsApp COM o DDI 55,
 * e a planilha de captação do dg-pg04 escreve sem ele em 82% das linhas.
 * Comparar a string inteira de dígitos não casaria quase nada — e em silêncio.
 */

import { describe, expect, it } from "vitest";
import { cruzarGrupoComLeads, type LeadCaptado } from "../services/grupo-x-leads.js";

const lead = (nome: string, canal: LeadCaptado["canal"]): LeadCaptado => ({
  nome,
  canal,
  origem: canal === "Meta Ads" ? "Pago" : "Orgânico",
});

describe("cruzarGrupoComLeads", () => {
  it("casa o número COM DDI do grupo com o SEM DDI da planilha", () => {
    const r = cruzarGrupoComLeads(
      { atuais: new Set(["5511964911718"]), sairam: new Set() },
      new Map([["64911718", lead("Iago", "Meta Ads")]]),
    );
    expect(r.identificados).toBe(1);
    expect(r.pessoas[0]).toMatchObject({ nome: "Iago", canal: "Meta Ads" });
  });

  it("quem entrou sem passar pela captação conta como Sem cadastro, não desaparece", () => {
    const r = cruzarGrupoComLeads(
      { atuais: new Set(["5511964911701", "5511964911718"]), sairam: new Set() },
      new Map([["64911718", lead("Iago", "Meta Ads")]]),
    );
    expect(r.total).toBe(2);
    expect(r.semCadastro).toBe(1);
    expect(r.canais.map((c) => c.canal)).toContain("Sem cadastro");
  });

  it("separa quem saiu do grupo por canal — é a pergunta que não tinha resposta", () => {
    const r = cruzarGrupoComLeads(
      {
        atuais: new Set(["5511964911701"]),
        sairam: new Set(["5511964911702", "5511964911703"]),
      },
      new Map([
        ["64911701", lead("A", "Meta Ads")],
        ["64911702", lead("B", "Meta Ads")],
        ["64911703", lead("C", "WhatsApp")],
      ]),
    );
    const meta = r.canais.find((c) => c.canal === "Meta Ads");
    expect(meta).toMatchObject({ dentro: 1, sairam: 1, total: 2 });
    expect(r.canais.find((c) => c.canal === "WhatsApp")).toMatchObject({
      dentro: 0,
      sairam: 1,
    });
    expect(r.dentro).toBe(1);
    expect(r.sairam).toBe(2);
  });

  it("os totais fecham com o grupo: ninguém é perdido no caminho", () => {
    const r = cruzarGrupoComLeads(
      {
        atuais: new Set(["5511964911701", "5511964911702"]),
        sairam: new Set(["5511964911703"]),
      },
      new Map(),
    );
    expect(r.total).toBe(3);
    expect(r.canais.reduce((s, c) => s + c.total, 0)).toBe(3);
    expect(r.identificados + r.semCadastro).toBe(r.total);
  });

  it("número curto demais no grupo não casa com lead nenhum", () => {
    const r = cruzarGrupoComLeads(
      { atuais: new Set(["123"]), sairam: new Set() },
      new Map([["", lead("Fantasma", "Meta Ads")]]),
    );
    expect(r.identificados).toBe(0);
  });

  it("grupo vazio não explode", () => {
    const r = cruzarGrupoComLeads(
      { atuais: new Set(), sairam: new Set() },
      new Map([["64911718", lead("Iago", "Meta Ads")]]),
    );
    expect(r).toMatchObject({ total: 0, identificados: 0, canais: [] });
  });
});
