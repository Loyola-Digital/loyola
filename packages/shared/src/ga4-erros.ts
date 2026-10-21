/**
 * Story 18.90 — por que o GA4 não respondeu, num lugar só.
 *
 * ## Por que este arquivo existe
 *
 * A aba Analytics mostrava "Erro ao consultar GA4" para qualquer falha. Em
 * 20/10/2026 a causa no `dg-bf26` era o Google recusando o refresh token
 * (`invalid_grant`) — a única conexão GA4 do sistema estava revogada desde não
 * se sabe quando, e a tela não dizia que bastava reconectar.
 *
 * A API classifica a falha num destes códigos e manda a mensagem pronta em
 * `error` (o api-client do web já usa `error` como mensagem e `code` como
 * código). O web só decide, pelo código, se oferece "Reconectar".
 *
 * ## Módulo folha, de propósito
 *
 * Só constantes e uma função pura, sem import. O web importa por subpath
 * (`@loyola-x/shared/src/ga4-erros`), a API pelo índice.
 */

export const CODIGOS_ERRO_GA4 = [
  "token_revogado",
  "sem_permissao",
  "cota",
  "oauth_nao_configurado",
  "rede",
  "chave_criptografia",
  "outro",
] as const;

export type CodigoErroGa4 = (typeof CODIGOS_ERRO_GA4)[number];

/** O que a tela mostra para cada causa — sempre dizendo o que fazer. */
export const MENSAGENS_ERRO_GA4: Record<CodigoErroGa4, string> = {
  // Texto fixado pelo @po a partir das palavras do gestor (AC2).
  token_revogado: "A conexão com o Google expirou. Reconecte o GA4 deste projeto.",
  sem_permissao:
    "A conta Google conectada não tem acesso a esta propriedade do GA4. Peça acesso de leitor para essa conta ou reconecte com outra conta.",
  cota: "O GA4 atingiu o limite de consultas desta propriedade. Tente de novo mais tarde.",
  oauth_nao_configurado:
    "A integração com o Google não está configurada no servidor. Avise o administrador do sistema.",
  rede: "Não foi possível falar com o Google agora. Tente de novo em alguns minutos.",
  chave_criptografia: "Não foi possível ler a conexão salva deste projeto. Reconecte o GA4.",
  outro: "O GA4 recusou a consulta",
};

/**
 * Causas que se resolvem reconectando a conta Google: a autorização caiu, a
 * conexão salva não se lê mais, ou a conta não enxerga a propriedade (trocar de
 * conta resolve). Recebe `unknown` porque vem de `err.code` do api-client — com
 * a API anterior à 18.90 não há código e a resposta é `false`.
 */
export function pedeReconexaoGa4(code: unknown): boolean {
  return code === "token_revogado" || code === "chave_criptografia" || code === "sem_permissao";
}
