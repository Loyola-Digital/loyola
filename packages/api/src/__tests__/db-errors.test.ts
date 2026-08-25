import { describe, it, expect } from "vitest";
import { violaUnicidade } from "../utils/db-errors.js";

/**
 * Reproduz o formato real do drizzle-orm 0.45: o erro do pg vem embrulhado, com
 * a mensagem "Failed query: ..." por fora e o SQLSTATE por dentro, em `cause`.
 */
function erroDoDrizzle(constraint: string): Error {
  const doPostgres = Object.assign(
    new Error(
      `duplicate key value violates unique constraint "${constraint}"`,
    ),
    {
      code: "23505",
      constraint,
      detail: "Key (customer_id)=(4386529178) already exists.",
    },
  );

  return Object.assign(
    new Error('Failed query: insert into "google_ads_accounts" ...'),
    { cause: doPostgres },
  );
}

describe("violaUnicidade", () => {
  it("enxerga a constraint atras do wrapper do drizzle", () => {
    expect(
      violaUnicidade(erroDoDrizzle("uq_google_ads_customer_id"), "uq_google_ads_customer_id"),
    ).toBe(true);
  });

  it("nao confunde constraints diferentes na mesma tabela", () => {
    expect(
      violaUnicidade(erroDoDrizzle("uq_google_ads_account_project"), "uq_google_ads_customer_id"),
    ).toBe(false);
  });

  it("aceita o erro do pg sem wrapper", () => {
    const cru = Object.assign(new Error("duplicate key"), {
      code: "23505",
      constraint: "uq_youtube_channel_id",
    });
    expect(violaUnicidade(cru, "uq_youtube_channel_id")).toBe(true);
  });

  it("casa pelo texto quando o driver nao expoe o campo constraint", () => {
    const semCampo = Object.assign(
      new Error('duplicate key value violates unique constraint "uq_stage_organic_post"'),
      { code: "23505" },
    );
    expect(violaUnicidade(semCampo, "uq_stage_organic_post")).toBe(true);
  });

  it("ignora erro que nao e de unicidade", () => {
    const fk = Object.assign(new Error("Failed query: insert ..."), {
      cause: Object.assign(new Error("violates foreign key constraint"), {
        code: "23503",
        constraint: "uq_google_ads_customer_id",
      }),
    });
    expect(violaUnicidade(fk, "uq_google_ads_customer_id")).toBe(false);
  });

  it("sem constraint informada, aceita qualquer unique violation", () => {
    expect(violaUnicidade(erroDoDrizzle("qualquer_uma"))).toBe(true);
  });

  it("nao trava com cause ciclico nem com valores estranhos", () => {
    const a: { cause?: unknown } = {};
    const b = { cause: a };
    a.cause = b;
    expect(violaUnicidade(a, "uq_x")).toBe(false);
    expect(violaUnicidade(null, "uq_x")).toBe(false);
    expect(violaUnicidade("erro em string", "uq_x")).toBe(false);
  });
});
