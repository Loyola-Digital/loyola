/**
 * A mensagem que aparece quando salvar uma conta do Instagram falha.
 *
 * ## Por que existe
 *
 * Os dois diálogos trocavam QUALQUER erro por "Token inválido ou sem
 * permissões necessárias". Em 16/09/2026 isso custou uma investigação: o token
 * novo do @omeufilhobilingue estava perfeito (testado direto na Meta), e a
 * tela dizia que faltava permissão. O motivo real — outro — ficou escondido.
 *
 * A API já manda a causa no corpo do erro. Aqui ela é mostrada, com um empurrão
 * quando o caminho é conhecido.
 */

export function mensagemDeErroDaConta(erro: unknown): string | null {
  if (!erro) return null;
  const bruta = erro instanceof Error ? erro.message : String(erro);

  if (bruta.includes("já está cadastrada")) {
    return "Esta conta do Instagram já está cadastrada. Para trocar o token, use Editar na conta existente em vez de adicionar de novo.";
  }
  if (/expirado|expired|invalidated|session has been/i.test(bruta)) {
    return "A Meta recusou o token: ele expirou ou foi invalidado. Gere um novo no painel da Meta e cole aqui inteiro.";
  }
  if (/permiss|OAuthException|code 10\b/i.test(bruta)) {
    return `A Meta recusou o token por permissão: ${bruta}. Confira se a conta é Business/Creator e se o token tem as permissões de insights.`;
  }
  // Colar pela metade é o erro mais comum, e a Meta responde "Invalid OAuth
  // access token" — que sozinho não sugere a causa.
  if (/invalid oauth|malformed|Invalid access token/i.test(bruta)) {
    return `A Meta não reconheceu o token: ${bruta}. Verifique se ele foi colado inteiro, sem cortar o começo ou o fim.`;
  }
  if (/API error: 5\d\d/.test(bruta)) {
    return "O servidor falhou ao salvar. Tente de novo; se repetir, me avise.";
  }
  return bruta || "Não consegui salvar a conta.";
}
