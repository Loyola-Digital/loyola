#!/usr/bin/env node
import { statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { LoyolaClient } from "./client.js";
import { registerTools } from "./tools.js";
import {
  buscarManifesto,
  coletarNomesRegistrados,
  compararComManifesto,
  registrarAvisoDeDefasagem,
} from "./defasagem.js";

/**
 * Quando ESTE bundle foi construído.
 *
 * Mesmo recurso do `/api/health`: o mtime do arquivo que está rodando responde
 * sem depender de variável de ambiente — e é justamente o que diz se o build no
 * gateway é de ontem ou de dois meses atrás.
 */
function bundleBuiltAt(): string | null {
  try {
    return statSync(fileURLToPath(import.meta.url)).mtime.toISOString();
  } catch {
    return null;
  }
}

/**
 * Loyola X MCP server (Story 36.6).
 * Embrulha a API pública read-only Meta Ads Creative Intelligence como tools MCP
 * para a IA consumir via stdio. Transporte fino: zero lógica de negócio aqui.
 */
async function main(): Promise<void> {
  const config = loadConfig();
  const client = new LoyolaClient(config);

  const server = new McpServer({ name: "loyola-x", version: "0.1.0" });
  const registradas = coletarNomesRegistrados(server, (s) => registerTools(s, client));

  /**
   * A comparação acontece ANTES do connect.
   *
   * Tool registrada depois do handshake não aparece no roster de quem já
   * listou — e o roster é onde este aviso precisa estar, porque foi olhando
   * para ele que o problema foi descoberto das duas vezes.
   */
  const manifesto = await buscarManifesto(config);
  if (manifesto) {
    const d = compararComManifesto(registradas, manifesto, bundleBuiltAt());
    if (d.atrasado || d.sobrando.length > 0) {
      registrarAvisoDeDefasagem(server, d);
      console.error(`[loyola-x-mcp] ATENÇÃO: ${d.mensagem}`);
    }
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // stdout é reservado para o protocolo MCP — logs vão para stderr.
  console.error(
    `[loyola-x-mcp] conectado (stdio) → ${config.baseUrl} · ${registradas.length} tools` +
      (manifesto ? ` (main: ${manifesto.total})` : " (manifesto indisponível)"),
  );
}

main().catch((err) => {
  console.error("[loyola-x-mcp] erro fatal:", err);
  process.exit(1);
});
