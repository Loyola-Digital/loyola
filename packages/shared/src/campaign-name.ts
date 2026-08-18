/**
 * Story 44.4 — identidade lógica de campanha ao longo do tempo.
 *
 * O histórico de mídia é chaveado por **id**: `meta_campaign_insights_daily` tem
 * PK `(project_id, campaign_id, date_start)`. Isso resolve bem um caso e mal o
 * outro:
 *
 * | situação | efeito |
 * |---|---|
 * | campanha renomeada na Meta | ✅ id não muda, histórico íntegro |
 * | campanha **duplicada** na Meta | ❌ id novo, histórico não se junta |
 *
 * Duplicar campanha é operação corriqueira de tráfego. Sem agrupar, o teto
 * histórico compara a mesma campanha contra si mesma como se fossem duas, e a
 * "melhor janela" pode sair de um id que rodou três dias.
 *
 * ## Módulo folha, sem imports
 *
 * Mesmo desenho de `contract.ts` e `stage-types.ts`, pelo mesmo motivo: o
 * webpack do Next não resolve os imports NodeNext do `index.ts`. O web consome
 * por `@loyola-x/shared/src/campaign-name`; a API, por bare import via
 * `index.ts`. **Os dois caminhos não são intercambiáveis** — ver a tabela em
 * `packages/shared/src/index.ts`.
 */

/**
 * Sufixos que a Meta (e o time) acrescenta ao duplicar.
 *
 * Ancorados no FIM: sem a âncora, `Campanha Copy Center` viraria `campanha`, e
 * o agrupamento juntaria duas campanhas que não têm nada a ver.
 *
 * A ordem importa pouco porque a remoção é de um sufixo por chamada — remover
 * repetições (` - cópia - cópia`) é decisão que ninguém tomou, e inventá-la aqui
 * seria escolher por aproximação.
 */
const SUFIXO_COPIA = /[\s]*(?:[-–—]\s*)?(?:c[óo]pia|copy)\s*$|[\s]*\((?:\d+)\)\s*$/i;

/** Remove acento sem depender de `Intl` (o módulo é folha e roda nos dois lados). */
function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Nome canônico de uma campanha, para agrupar ids que são a mesma coisa.
 *
 * `"Campanha X - Cópia"` → `"campanha x"`
 * `"CAMPANHA  X (2)"`    → `"campanha x"`
 * `"Campanha Copy Center"` → `"campanha copy center"` (sufixo não casa no meio)
 *
 * Devolve string vazia para entrada vazia — **não** inventa um nome. Campanha
 * sem nome é caso para reportar, não para agrupar sob um rótulo qualquer.
 */
export function normalizarNomeCampanha(nome: string | null | undefined): string {
  if (!nome) return "";
  let out = semAcento(String(nome)).toLowerCase();
  // Um sufixo por chamada, e só no fim.
  out = out.replace(SUFIXO_COPIA, "");
  // Colapsa espaço só depois de tirar o sufixo: "x  - copia" precisa que o
  // sufixo case antes de virar "x - copia".
  out = out.replace(/\s+/g, " ").trim();
  return out;
}

/** A entrada tinha sufixo de cópia? Útil para o relatório de revisão. */
export function temSufixoDeCopia(nome: string | null | undefined): boolean {
  if (!nome) return false;
  return SUFIXO_COPIA.test(semAcento(String(nome)).toLowerCase());
}
