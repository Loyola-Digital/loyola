/**
 * Story 42.9 — as colunas de login pertencem a UMA tabela só.
 *
 * ## O defeito que isto impede
 *
 * A migration `0108_plausible_login.sql` criou `login_email`,
 * `login_password_encrypted` e `login_password_iv` em `plausible_config`. No
 * `schema.ts`, porém, o bloco foi colado em TRÊS tabelas — levando junto o
 * comentário sobre a Sites API do Plausible, dentro da definição do RevenueCat.
 *
 * O Drizzle monta o `SELECT` a partir do schema, não do banco. Resultado:
 *
 * ```
 *   SELECT id, project_id, api_key_encrypted, api_key_iv, login_email, …
 *   FROM revenuecat_connections
 *   → column "login_email" does not exist  → HTTP 500
 * ```
 *
 * Toda rota que lesse `revenuecat_connections` ou `memberkit_connections`
 * devolvia 500. Na tela do Lyrio isso apareceu como "os dados do RevenueCat
 * estão zerados" — o erro não chega ao usuário, o vazio chega.
 *
 * Medido em produção (2026-08-25), antes do fix:
 *
 * ```
 *   ✗ revenuecat_connections   column "login_email" does not exist
 *   ✗ memberkit_connections    column "login_email" does not exist
 *   ✓ plausible_config         colunas existem
 * ```
 *
 * ## Por que este teste e não um diff schema↔banco
 *
 * O ideal seria comparar o schema com o banco, mas isso precisa de conexão e
 * não roda em CI. Este teste cobre o caso concreto: um campo que pertence a uma
 * integração aparecendo na tabela de outra — que é como o defeito nasceu
 * (copiar-colar de bloco) e como ele voltaria.
 */

import { describe, it, expect } from "vitest";
import { getTableColumns } from "drizzle-orm";
import {
  revenuecatConnections,
  memberkitConnections,
  plausibleConfig,
} from "../db/schema.js";

const CAMPOS_DE_LOGIN = ["loginEmail", "loginPasswordEncrypted", "loginPasswordIv"];

describe("as colunas de login do Plausible ficam só no Plausible", () => {
  it("`plausibleConfig` tem os três — é a dona", () => {
    const cols = Object.keys(getTableColumns(plausibleConfig));
    for (const campo of CAMPOS_DE_LOGIN) expect(cols).toContain(campo);
  });

  it("`revenuecatConnections` NÃO tem nenhum", () => {
    // Tê-los aqui derruba com 500 toda rota do RevenueCat, porque a migration
    // criou as colunas só em `plausible_config`.
    const cols = Object.keys(getTableColumns(revenuecatConnections));
    for (const campo of CAMPOS_DE_LOGIN) expect(cols).not.toContain(campo);
  });

  it("`memberkitConnections` NÃO tem nenhum", () => {
    const cols = Object.keys(getTableColumns(memberkitConnections));
    for (const campo of CAMPOS_DE_LOGIN) expect(cols).not.toContain(campo);
  });

  it("as duas tabelas seguem com o que de fato precisam", () => {
    // Guarda contra "resolver" removendo demais.
    for (const t of [revenuecatConnections, memberkitConnections]) {
      const cols = Object.keys(getTableColumns(t));
      expect(cols).toContain("apiKeyEncrypted");
      expect(cols).toContain("apiKeyIv");
    }
  });
});
