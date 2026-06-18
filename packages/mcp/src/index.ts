#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { LoyolaClient } from "./client.js";
import { registerTools } from "./tools.js";

/**
 * Loyola X MCP server (Story 36.6).
 * Embrulha a API pública read-only Meta Ads Creative Intelligence como tools MCP
 * para a IA consumir via stdio. Transporte fino: zero lógica de negócio aqui.
 */
async function main(): Promise<void> {
  const config = loadConfig();
  const client = new LoyolaClient(config);

  const server = new McpServer({ name: "loyola-x", version: "0.1.0" });
  registerTools(server, client);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // stdout é reservado para o protocolo MCP — logs vão para stderr.
  console.error(`[loyola-x-mcp] conectado (stdio) → ${config.baseUrl}`);
}

main().catch((err) => {
  console.error("[loyola-x-mcp] erro fatal:", err);
  process.exit(1);
});
