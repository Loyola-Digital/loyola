// ============================================================
// Story 42.8 — o que dizer ao gestor quando o Google Ads não responde.
//
// ## O defeito que isto corrige
//
// A rota já devolvia o motivo da falha no campo `error` do payload
// (`funnels.ts:947`). O seletor decidia só por `campaigns.length === 0` e o
// ignorava, então três situações muito diferentes viravam a mesma frase:
//
//   token revogado             → "não retornou campanhas no período"
//   sem permissão no customer  → "não retornou campanhas no período"
//   conta ok, sem campanha     → "não retornou campanhas no período"
//
// Só a terceira era verdade. Medido em produção (2026-08-25), as DUAS contas do
// sistema estavam quebradas — `Lyrio App` com `invalid_grant` e `Netão` com 403
// — e a tela dizia a ambas que era ausência de campanha. O investimento do
// Google ficou fora do ROAS sem que nada apontasse para a causa.
// ============================================================

export type FalhaGoogleAds = "token_revogado" | "sem_permissao" | "outra";

/**
 * Classifica a mensagem de erro da rota. `null` quando não houve falha.
 *
 * A comparação é por trecho da mensagem porque é o que a API do Google devolve
 * — não há código estável para distinguir os dois casos que pedem ações
 * diferentes.
 */
export function classificarFalhaGoogleAds(erro: string | null | undefined): FalhaGoogleAds | null {
  if (!erro) return null;
  const t = erro.toLowerCase();
  if (t.includes("invalid_grant") || t.includes("expired or revoked")) return "token_revogado";
  if (t.includes("permission") || t.includes("403")) return "sem_permissao";
  return "outra";
}

export interface OrientacaoDeFalha {
  titulo: string;
  acao: string;
  /** A mensagem crua da API, para quem for investigar. */
  detalhe: string | null;
}

/**
 * A orientação por tipo de falha.
 *
 * Token revogado e falta de permissão levam a ações diferentes — reconectar
 * contra verificar o acesso ao customer. Dizer "erro ao buscar campanhas" nos
 * dois casos devolve o gestor ao ponto de partida.
 */
export function orientacaoDaFalha(
  erro: string | null | undefined,
): OrientacaoDeFalha | null {
  const tipo = classificarFalhaGoogleAds(erro);
  if (!tipo) return null;
  const detalhe = erro ?? null;

  if (tipo === "token_revogado") {
    return {
      titulo: "A conexão com o Google Ads expirou.",
      acao: "Reconecte a conta em Configurações → Google Ads. Enquanto isso, o investimento do Google não entra no ROAS.",
      detalhe,
    };
  }
  if (tipo === "sem_permissao") {
    return {
      titulo: "A conta conectada não tem acesso a este cliente do Google Ads.",
      acao: "Verifique no Google Ads se o usuário conectado tem permissão sobre a conta, ou reconecte com um usuário que tenha.",
      detalhe,
    };
  }
  return {
    titulo: "Não foi possível buscar as campanhas do Google Ads.",
    acao: "A mensagem abaixo veio da API do Google.",
    detalhe,
  };
}

/** Quantos dias a rota olha para trás ao listar campanhas (`funnels.ts:937`). */
export const JANELA_DE_CAMPANHAS_EM_DIAS = 90;
