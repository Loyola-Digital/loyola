import { describe, expect, it } from "vitest";
import { semOrfas } from "../services/planner-sync.js";

// O formato real da BBEPR2 em 18/09/2026: a fase importada nasce com id
// "g" + começo do id do evento; a órfã perdeu o `googleEventId`.
const doGoogle = [
  { id: "ggamkj9lkefhf40gj0muk2e2u", name: "Prod. Logística — Margem 3X", start: "2026-08-03", end: "2026-10-05", googleEventId: "gamkj9lkefhf40gj0muk2e2u4k" },
  { id: "gekhlta1u09rlcqjf6et5g98u", name: "Execução de captação — Margem 3X", start: "2026-08-08", end: "2026-10-05", googleEventId: "ekhlta1u09rlcqjf6et5g98ul0" },
];

describe("semOrfas", () => {
  it("fase que perdeu o vínculo mas é o mesmo evento (mesmo id) sai", () => {
    // Mesmo com o nome mexido aqui: o id diz que é o mesmo evento.
    const orfa = { id: "ggamkj9lkefhf40gj0muk2e2u", name: "Prod. Logística", start: "2026-08-03", end: "2026-10-05" };
    expect(semOrfas([orfa], doGoogle)).toEqual([]);
  });

  it("fase criada aqui cujo evento existe no Google (mesmo nome e início) sai", () => {
    // O caso da campanha criada já na agenda: o evento nasceu, o id não voltou.
    const criadaAqui = { id: "abc123", name: "execução de captação - margem 3x", start: "2026-08-08", end: "2026-10-05" };
    expect(semOrfas([criadaAqui], doGoogle)).toEqual([]);
  });

  it("fase manual de verdade fica", () => {
    const manual = { id: "xyz", name: "Reunião de alinhamento", start: "2026-09-01", end: "2026-09-01" };
    expect(semOrfas([manual], doGoogle)).toEqual([manual]);
  });

  it("fase sem data (rascunho) fica", () => {
    const rascunho = { id: "r1", name: "Execução de captação — Margem 3X", start: "", end: "" };
    expect(semOrfas([rascunho], doGoogle)).toEqual([rascunho]);
  });

  it("pendente nunca é órfã: tem o vínculo e a versão boa", () => {
    const pendente = { ...doGoogle[0]!, name: "Renomeada aqui", googleSyncPendente: true };
    expect(semOrfas([pendente], doGoogle)).toEqual([pendente]);
  });
});
