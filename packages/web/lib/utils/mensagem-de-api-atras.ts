// Story 47.15 — quando o painel está À FRENTE da API (deploys em ciclos
// diferentes: a Vercel publica na hora, o Railway às vezes horas depois), as
// rotas novas respondem de dois jeitos que NÃO significam "não tem dado":
//
//   POST /api/nomenclatura/ads/partes  → 404 "Not Found"   (rota não existe lá)
//   GET  /api/nomenclatura/ads/partes  → 400 "id: Invalid UUID"  (caiu em
//        GET /ads/:id com id = "partes" — a rota paramétrica antiga)
//
// Em 15/09/2026 o gestor viu os dois crus. Este helper devolve a frase da
// aba ("A API ainda não tem as rotas…") para esses dois casos, e `null` para
// qualquer outro erro — que deve aparecer como veio. Puro, para o vitest do
// web (que só coleta lib/utils) provar o mapeamento.

export interface ErroLido {
  status: number;
  mensagem: string;
}

/** O que o `erroDaApi` de `use-nomenclatura` devolve, sem depender dele (módulo folha). */
export function ehApiAtras(erro: ErroLido | null | undefined): boolean {
  if (!erro) return false;
  // Só o 404 do Fastify para rota inexistente (`error: "Not Found"` literal). Um 404 de
  // domínio chega com mensagem própria ("Expert não encontrado") e NÃO é API atrás (QA 47.15).
  if (erro.status === 404 && /^not found$/i.test(erro.mensagem.trim())) return true;
  // A rota estática nova não existe → a paramétrica `/:id` valida o segmento como uuid e recusa.
  if (erro.status === 400 && /invalid uuid/i.test(erro.mensagem)) return true;
  return false;
}

/**
 * Frase para a tela quando `ehApiAtras`; `null` caso contrário (mostre o erro
 * como veio — nunca "nenhum cadastrado", que é ausência, não falha).
 */
export function mensagemDeApiAtras(erro: ErroLido | null | undefined, recurso: string): string | null {
  if (!ehApiAtras(erro)) return null;
  return `A API ainda não tem as rotas de ${recurso} — provavelmente está atrás do painel. Veja o aviso de versão no topo.`;
}

/**
 * Story 47.16 (AC11, PO-07) — Salvar anúncio de `perpetuo` com a API ANTERIOR
 * à 47.16. A API antiga exige `launchSeq` (zod `.min(1)`, sem `.nullable()`) e
 * recusa o `null` com um 400 do zod NO CAMPO `launchSeq` — um erro que
 * `ehApiAtras` não reconhece (não é 404 nem "Invalid UUID"). Sem isto, o
 * gerador repassaria cru o texto do zod 4 (medido na 4.3.6 da API):
 * "launchSeq: Invalid input: expected number, received null".
 *
 * Reconhece por DOIS sinais, qualquer um basta:
 *  - o veredito do contrato (`compareApiContract` → `api-atras`, Story 29.46)
 *    com um 400 no campo `launchSeq`;
 *  - a assinatura do zod em inglês nesse campo — a API da 47.16 aceita
 *    `null`/ausente e responde em português, então o texto em inglês só sai
 *    de uma API antiga (vale mesmo com o `/api/health` fora do ar).
 * As duas recusas da PRÓPRIA API da 47.16 nesse campo (`launchSeq: a sigla pg
 * exige…`, `launchSeq: "perpetuo" não tem…`) nunca viram esta frase — com o
 * contrato à frente por OUTRA story, elas são erro de verdade.
 * Qualquer outro erro: `mensagemDeApiAtras` (404/Invalid UUID) ou `null` —
 * mostre como veio.
 */
export function mensagemDeApiAtrasAoSalvarAnuncio(
  erro: (ErroLido & { corpo?: { campo?: string } | null }) | null | undefined,
  apiAtras: boolean,
): string | null {
  if (!erro) return null;
  const noCampoDoNumero = erro.status === 400 && (erro.corpo?.campo === "launchSeq" || /^launchSeq:/.test(erro.mensagem));
  // zod 4 ("Invalid input: expected number, received null"); o "Required" do zod 3 fica por robustez.
  const assinaturaDoZod = /^launchSeq: (Invalid input: )?(expected number|required)/i.test(erro.mensagem);
  const recusaDaApiNova = /^launchSeq: (a sigla |")/.test(erro.mensagem);
  if (noCampoDoNumero && !recusaDaApiNova && (apiAtras || assinaturaDoZod)) {
    return "A API ainda não aceita anúncio sem número do lançamento (perpetuo) — ela está numa versão anterior à do painel. Veja o aviso de versão no topo e salve de novo depois do deploy da API.";
  }
  return mensagemDeApiAtras(erro, "anúncios");
}
