/**
 * Participante sem e-mail continua sendo participante.
 *
 * Na Leads-Evento do BBE-PR2-OUT/26, 31 das 70 linhas não têm e-mail — as
 * cortesias, 3 VIPs e quase todos os parceiros e fornecedores. Todas caíam
 * fora do mapa.
 */

import { describe, expect, it } from "vitest";
import { chaveDoParticipante, ehChaveSemEmail } from "../services/chave-do-participante.js";

describe("chaveDoParticipante", () => {
  it("o e-mail manda, e vem normalizado", () => {
    expect(chaveDoParticipante(" Ana@X.com ", "11999999999", "Ana")).toBe("ana@x.com");
  });

  it("sem e-mail, o celular vira a chave", () => {
    expect(chaveDoParticipante("", "+55 (11) 99758-6098", "Judá Eckert Berto")).toBe(
      "sem-email:tel:97586098",
    );
  });

  it("o mesmo celular escrito de dois jeitos dá a MESMA chave", () => {
    expect(chaveDoParticipante("", "+55 (11) 96491-1718", "Iago")).toBe(
      chaveDoParticipante("", "11964911718", "Iago Nobre Rocha"),
    );
  });

  it("sem e-mail e sem celular, o nome segura — é a cadeira ainda sem dono", () => {
    expect(chaveDoParticipante("", "", "A Informar (Coca-Cola 2/5)")).toBe(
      "sem-email:nome:a informar (coca-cola 2/5)",
    );
  });

  it("duas cadeiras sem dono são pessoas DIFERENTES", () => {
    expect(chaveDoParticipante("", "", "A Informar (Aurora 2/5)")).not.toBe(
      chaveDoParticipante("", "", "A Informar (Aurora 3/5)"),
    );
  });

  it("linha vazia não vira participante", () => {
    expect(chaveDoParticipante("", "", "")).toBe("");
  });

  it("dá para saber se a chave é e-mail de verdade", () => {
    expect(ehChaveSemEmail(chaveDoParticipante("ana@x.com", "", ""))).toBe(false);
    expect(ehChaveSemEmail(chaveDoParticipante("", "11964911718", ""))).toBe(true);
  });
});
