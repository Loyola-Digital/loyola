import { describe, it, expect } from "vitest";
import {
  lerDeCadaConta,
  lerDeTodasAsContas,
  montarRespostaDoSeletor,
  ordenarContas,
  rotuloDaConta,
  type ContaMetaDoProjeto,
} from "../services/meta-contas-do-projeto.js";

/**
 * Story 29.83 — o caso real que motivou a story: o expert Danilo Gato com duas
 * contas e a MESMA campanha (pelo nome) nas duas.
 */
const ANTIGA: ContaMetaDoProjeto = {
  id: "a0000000-0000-4000-8000-00000000000a",
  accountName: "Danilo Gato",
  metaAccountId: "111",
  accessToken: "SEGREDO-DO-TOKEN",
};
const NOVA: ContaMetaDoProjeto = {
  id: "b0000000-0000-4000-8000-00000000000b",
  accountName: "DaniloGatoPerpétuo",
  metaAccountId: "1728118665260386",
  accessToken: "SEGREDO-DO-TOKEN",
};
const NOME = "dg_a02_claude-negocios_of03_perpetuo_2026_cold_abo_videos_lpa";

const campanha = (id: string, name = NOME) => ({ id, name, status: "ACTIVE", objective: "OUTCOME_SALES" });

describe("lerDeCadaConta", () => {
  it("a falha de uma conta não apaga o que a outra leu", async () => {
    const leitura = await lerDeCadaConta([ANTIGA, NOVA], async (conta) => {
      if (conta === NOVA) throw new Error("token expirado");
      return [campanha("c-antiga")];
    });

    expect(leitura.porConta).toEqual([{ conta: ANTIGA, itens: [campanha("c-antiga")] }]);
    expect(leitura.falhas).toEqual([{ conta: NOVA, erro: "token expirado" }]);
  });
});

describe("lerDeTodasAsContas", () => {
  it("junta os itens de todas as contas", async () => {
    const itens = await lerDeTodasAsContas([ANTIGA, NOVA], async (conta) => [
      { conta: conta.metaAccountId },
    ]);
    expect(itens).toEqual([{ conta: "111" }, { conta: "1728118665260386" }]);
  });

  it("lança, nomeando a conta, se qualquer uma falhar — total pela metade não é número", async () => {
    await expect(
      lerDeTodasAsContas([ANTIGA, NOVA], async (conta) => {
        if (conta === NOVA) throw new Error("rate limit");
        return [1];
      }),
    ).rejects.toThrow("DaniloGatoPerpétuo (act_1728118665260386): rate limit");
  });
});

describe("ordenarContas", () => {
  it("ordena por nome e, no empate, por id — nunca pela ordem do banco", () => {
    const empate = { ...ANTIGA, id: "00000000-0000-4000-8000-000000000000" };
    expect(ordenarContas([NOVA, ANTIGA, empate]).map((c) => c.id)).toEqual([
      empate.id,
      ANTIGA.id,
      NOVA.id,
    ]);
  });
});

describe("rotuloDaConta", () => {
  it("usa o nome cadastrado quando existe e o act_ sempre", () => {
    expect(rotuloDaConta(NOVA)).toBe("DaniloGatoPerpétuo (act_1728118665260386)");
    expect(rotuloDaConta({ metaAccountId: "9", accessToken: "t" })).toBe("act_9");
  });
});

describe("montarRespostaDoSeletor", () => {
  it("campanhas com o mesmo nome em contas diferentes saem distinguíveis pela conta", () => {
    const resposta = montarRespostaDoSeletor([ANTIGA, NOVA], {
      porConta: [
        { conta: ANTIGA, itens: [campanha("c-antiga")] },
        { conta: NOVA, itens: [campanha("52577008819383")] },
      ],
      falhas: [],
    });

    expect(resposta.accountLinked).toBe(true);
    expect(resposta.accountErrors).toEqual([]);
    expect(resposta.campaigns.map((c) => [c.name, c.accountName])).toEqual([
      [NOME, "Danilo Gato"],
      [NOME, "DaniloGatoPerpétuo"],
    ]);
    expect(resposta.campaigns[1]).toMatchObject({
      id: "52577008819383",
      accountId: NOVA.id,
      metaAccountId: "1728118665260386",
    });
  });

  it("a conta que falhou aparece em accountErrors e continua em accounts", () => {
    const resposta = montarRespostaDoSeletor([ANTIGA, NOVA], {
      porConta: [{ conta: ANTIGA, itens: [campanha("c-antiga")] }],
      falhas: [{ conta: NOVA, erro: "token expirado" }],
    });

    expect(resposta.accounts.map((c) => c.accountName)).toEqual(["Danilo Gato", "DaniloGatoPerpétuo"]);
    expect(resposta.accountErrors).toEqual([
      {
        accountId: NOVA.id,
        accountName: "DaniloGatoPerpétuo",
        metaAccountId: "1728118665260386",
        error: "token expirado",
      },
    ]);
    // Não pode carregar token para o navegador.
    expect(JSON.stringify(resposta)).not.toContain("SEGREDO-DO-TOKEN");
  });
});
