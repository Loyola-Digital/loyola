import { describe, it, expect } from "vitest";
import { agruparCampanhasPorConta, campanhaCasaComBusca } from "./campanhas-por-conta";

const ANTIGA = { id: "a", accountName: "Danilo Gato", metaAccountId: "111" };
const NOVA = { id: "b", accountName: "DaniloGatoPerpétuo", metaAccountId: "1728118665260386" };
const NOME = "dg_a02_claude-negocios_of03_perpetuo_2026_hot_abo_videos_lpa";

const camp = (id: string, conta?: { id: string; accountName: string }) => ({
  id,
  name: NOME,
  objective: "OUTCOME_SALES",
  accountId: conta?.id,
  accountName: conta?.accountName,
});

describe("agruparCampanhasPorConta (Story 29.83)", () => {
  it("2 contas: um grupo por conta, mesmo nome em grupos diferentes, na ordem de accounts", () => {
    const grupos = agruparCampanhasPorConta(
      [camp("n1", NOVA), camp("a1", ANTIGA), camp("n2", NOVA)],
      [ANTIGA, NOVA],
      [],
    );
    expect(grupos.map((g) => [g.titulo, g.campanhas.map((c) => c.id)])).toEqual([
      ["Danilo Gato", ["a1"]],
      ["DaniloGatoPerpétuo", ["n1", "n2"]],
    ]);
  });

  it("conta que falhou vira grupo com aviso no lugar das campanhas (AC3)", () => {
    const grupos = agruparCampanhasPorConta(
      [camp("a1", ANTIGA)],
      [ANTIGA, NOVA],
      [{ accountId: "b", accountName: "DaniloGatoPerpétuo", metaAccountId: "1728118665260386", error: "token expirado" }],
    );
    expect(grupos[1]).toEqual({ chave: "b", titulo: "DaniloGatoPerpétuo", campanhas: [], erro: "token expirado" });
  });

  it("1 conta: um grupo só, sem título — o seletor fica como era (AC6)", () => {
    const grupos = agruparCampanhasPorConta([camp("a1", ANTIGA)], [ANTIGA], []);
    expect(grupos).toEqual([{ chave: "todas", titulo: null, campanhas: [camp("a1", ANTIGA)], erro: null }]);
  });

  it("API antiga (sem accountId): um grupo só, sem título (AC8)", () => {
    const grupos = agruparCampanhasPorConta([camp("x1"), camp("x2")], [], []);
    expect(grupos.map((g) => g.titulo)).toEqual([null]);
    expect(grupos[0].campanhas).toHaveLength(2);
  });

  it("conta sem campanha após a busca e sem erro não gera grupo vazio", () => {
    const grupos = agruparCampanhasPorConta([camp("a1", ANTIGA)], [ANTIGA, NOVA], []);
    expect(grupos.map((g) => g.titulo)).toEqual(["Danilo Gato"]);
  });

  it("nada para listar: nenhum grupo", () => {
    expect(agruparCampanhasPorConta([], [ANTIGA, NOVA], [])).toEqual([]);
  });
});

describe("campanhaCasaComBusca", () => {
  it("acha pelo nome da conta, além do nome e do objetivo", () => {
    expect(campanhaCasaComBusca(camp("n1", NOVA), "perpétuo")).toBe(true);
    expect(campanhaCasaComBusca(camp("n1", NOVA), "hot_abo")).toBe(true);
    expect(campanhaCasaComBusca(camp("n1", NOVA), "sales")).toBe(true);
    expect(campanhaCasaComBusca(camp("n1", NOVA), "zzz")).toBe(false);
  });
});
