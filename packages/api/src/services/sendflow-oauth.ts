/**
 * O aperto de mão OAuth com o SendFlow, feito pelo próprio app.
 *
 * Existe porque a alternativa era humilhante: o servidor do SendFlow só aceita
 * `authorization_code`, então conseguir um refresh token exigia rodar um
 * servidor local que capturasse o callback. Ninguém no time vai fazer isso.
 *
 * Aqui o app registra o próprio cliente OAuth (o servidor suporta registro
 * dinâmico), monta a URL de autorização e recebe o callback. Da tela, é um
 * botão.
 *
 * Também não pedimos client_id/secret a ninguém: o registro dinâmico devolve os
 * dois, e eles ficam guardados junto com o refresh.
 */

import { createHash, randomBytes } from "node:crypto";

const BASE = "https://cf1.sendflow.pro";
const MCP = `${BASE}/mcp`;
const TIMEOUT_MS = 20_000;

export interface ClienteRegistrado {
  clientId: string;
  clientSecret: string;
}

/**
 * Registra um cliente OAuth novo para este ambiente.
 *
 * O `redirect_uri` é fixado no registro e o servidor recusa qualquer outro no
 * fluxo — por isso um cliente por ambiente (produção e local têm callbacks
 * diferentes).
 */
export async function registrarCliente(
  redirectUri: string,
): Promise<ClienteRegistrado> {
  const res = await fetch(`${BASE}/oauth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_name: "Loyola X",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "client_secret_post",
      scope: "mcp offline_access",
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const txt = await res.text();
  if (!res.ok) {
    throw new Error(
      `SendFlow recusou o registro do cliente (${res.status}): ${txt.slice(0, 160)}`,
    );
  }
  const d = JSON.parse(txt) as { client_id?: string; client_secret?: string };
  if (!d.client_id || !d.client_secret) {
    throw new Error(
      "SendFlow registrou o cliente sem devolver client_id/secret.",
    );
  }
  return { clientId: d.client_id, clientSecret: d.client_secret };
}

export interface PedidoEmAndamento {
  clientId: string;
  clientSecret: string;
  verifier: string;
  redirectUri: string;
  /** Quem clicou em conectar — vira o `createdBy` da conexão. */
  userId: string;
  criadoEm: number;
}

/**
 * Pedidos aguardando o retorno do SendFlow.
 *
 * Em memória de propósito: o `state` é um segredo de uso único que vive por
 * segundos, e persistir isso exigiria tabela pra um dado que expira antes do
 * próximo deploy. O custo é que reiniciar a API no meio do fluxo obriga a
 * clicar de novo — aceitável, e a mensagem de erro diz isso.
 */
const pendentes = new Map<string, PedidoEmAndamento>();
const VALIDADE_MS = 10 * 60 * 1000;

function limparVencidos(): void {
  const agora = Date.now();
  for (const [k, v] of pendentes) {
    if (agora - v.criadoEm > VALIDADE_MS) pendentes.delete(k);
  }
}

export interface UrlDeAutorizacao {
  url: string;
  state: string;
}

export async function montarUrlDeAutorizacao(
  redirectUri: string,
  userId: string,
  clienteExistente?: ClienteRegistrado,
): Promise<UrlDeAutorizacao> {
  limparVencidos();
  const cliente = clienteExistente ?? (await registrarCliente(redirectUri));

  // PKCE é obrigatório: o servidor anuncia `code_challenge_methods_supported:
  // ["S256"]` e recusa o fluxo sem challenge.
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = randomBytes(24).toString("base64url");

  pendentes.set(state, {
    clientId: cliente.clientId,
    clientSecret: cliente.clientSecret,
    verifier,
    redirectUri,
    userId,
    criadoEm: Date.now(),
  });

  const url = new URL(`${BASE}/oauth/authorize`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", cliente.clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", "mcp offline_access");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  // `resource` amarra o token ao endpoint MCP — sem isso o servidor emite um
  // token que o /mcp recusa.
  url.searchParams.set("resource", MCP);

  return { url: url.toString(), state };
}

export interface TokensDoCallback {
  clientId: string;
  clientSecret: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  userId: string;
  /** A URI usada nesta autorização — é a que o cliente aceita daqui em diante. */
  redirectUri: string;
}

/** Troca o `code` pelos tokens. Consome o `state`: serve uma vez só. */
export async function trocarCodigo(
  state: string,
  code: string,
): Promise<TokensDoCallback> {
  limparVencidos();
  const pedido = pendentes.get(state);
  if (!pedido) {
    throw new Error(
      "Autorização expirada ou já usada. Volte às configurações e clique em Conectar de novo.",
    );
  }
  pendentes.delete(state);

  const res = await fetch(`${BASE}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: pedido.redirectUri,
      client_id: pedido.clientId,
      client_secret: pedido.clientSecret,
      code_verifier: pedido.verifier,
      resource: MCP,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const txt = await res.text();
  if (!res.ok) {
    throw new Error(
      `SendFlow recusou a troca do código (${res.status}): ${txt.slice(0, 160)}`,
    );
  }
  const t = JSON.parse(txt) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!t.refresh_token) {
    // Sem refresh o acesso morre em 1h e ninguém renova — melhor falhar aqui,
    // explicando, do que gravar uma conexão que quebra sozinha.
    throw new Error(
      "O SendFlow não devolveu refresh token. A autorização precisa incluir o escopo offline_access.",
    );
  }
  return {
    clientId: pedido.clientId,
    clientSecret: pedido.clientSecret,
    accessToken: t.access_token,
    refreshToken: t.refresh_token,
    expiresAt: Date.now() + ((t.expires_in ?? 3600) - 60) * 1000,
    userId: pedido.userId,
    redirectUri: pedido.redirectUri,
  };
}
