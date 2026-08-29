/**
 * As regras de origem como serviço.
 *
 * O teste que mais importa é o da precedência: a regra existe para preencher o
 * vazio, nunca para reescrever o que a planilha disse. Inverter isso faria uma
 * classificação apagar dado real, em silêncio.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CAMPO_DA_ORIGEM,
  invalidarRegras,
  origemDaLinha,
  regrasDoProjeto,
} from "../services/source-rules-store.js";
import type { RegraDeOrigem } from "../services/source-rules.js";

const PROJETO = "30000000-0000-4000-8000-000000000003";

const regra = (over: Partial<RegraDeOrigem> = {}): RegraDeOrigem => ({
  id: "r1",
  campo: "utm_medium",
  operador: "igual",
  valor: "ig-bio",
  origem: "organic_instagram",
  ordem: 0,
  ativa: true,
  ...over,
});

beforeEach(() => invalidarRegras());

describe("a planilha vence a regra", () => {
  it("origem declarada passa intacta, mesmo com regra que casaria", () => {
    // A regra preenche o vazio; reescrever dado real seria apagar informação
    // sem ninguém pedir.
    const linha = { [CAMPO_DA_ORIGEM]: "paid_metaads", utm_medium: "ig-bio" };
    expect(origemDaLinha(linha, [regra()])).toBe("paid_metaads");
  });

  it("origem vazia é preenchida pela regra", () => {
    const linha = { [CAMPO_DA_ORIGEM]: "", utm_medium: "ig-bio" };
    expect(origemDaLinha(linha, [regra()])).toBe("organic_instagram");
  });

  it("origem só com espaços conta como vazia", () => {
    const linha = { [CAMPO_DA_ORIGEM]: "   ", utm_medium: "ig-bio" };
    expect(origemDaLinha(linha, [regra()])).toBe("organic_instagram");
  });

  it("sem regra que case, continua vazio — não inventa origem", () => {
    const linha = { [CAMPO_DA_ORIGEM]: "", utm_medium: "outro" };
    expect(origemDaLinha(linha, [regra()])).toBe("");
  });

  it("regra desativada não vale", () => {
    const linha = { [CAMPO_DA_ORIGEM]: "", utm_medium: "ig-bio" };
    expect(origemDaLinha(linha, [regra({ ativa: false })])).toBe("");
  });

  it("a coluna de origem pode ter outro nome na planilha", () => {
    const linha = { Origem: "", utm_medium: "ig-bio" };
    expect(origemDaLinha(linha, [regra()], "Origem")).toBe("organic_instagram");
  });
});

describe("cache por projeto", () => {
  function dbFalso(regras: RegraDeOrigem[]) {
    const orderBy = vi.fn(async () => regras);
    const select = vi.fn(() => ({ from: () => ({ where: () => ({ orderBy }) }) }));
    return { db: { select } as never, select };
  }

  it("a segunda leitura no mesmo minuto não consulta o banco de novo", async () => {
    // Regra muda uma vez por mês; aplicação é lida várias vezes por minuto.
    const { db, select } = dbFalso([regra()]);
    await regrasDoProjeto(db, PROJETO);
    await regrasDoProjeto(db, PROJETO);
    expect(select).toHaveBeenCalledTimes(1);
  });

  it("criar uma regra invalida o cache daquele projeto", async () => {
    const { db, select } = dbFalso([regra()]);
    await regrasDoProjeto(db, PROJETO);
    invalidarRegras(PROJETO);
    await regrasDoProjeto(db, PROJETO);
    expect(select).toHaveBeenCalledTimes(2);
  });

  it("projetos diferentes não compartilham cache", async () => {
    const { db, select } = dbFalso([regra()]);
    await regrasDoProjeto(db, PROJETO);
    await regrasDoProjeto(db, "40000000-0000-4000-8000-000000000004");
    expect(select).toHaveBeenCalledTimes(2);
  });
});
