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
