/**
 * Story 29.55 — quais planilhas a aba genérica pode editar.
 *
 * A tabela `funnel_spreadsheets` é compartilhada por seis tipos e os dois
 * `perpetual_*` têm tela própria, com vocabulário de mapeamento próprio. A aba
 * genérica os LISTA (o backend devolve tudo do funil), mas não deve oferecer
 * Editar nem Remover: o `PUT` substitui o `column_mapping` inteiro, então
 * salvar por ali apaga `valorBruto` e `productName` e o dashboard do perpétuo
 * perde o faturamento sem nada avisar.
 *
 * ⚠️ Esta lista tem uma gêmea no backend (`routes/funnel-spreadsheets.ts`,
 * `TIPOS_COM_TELA_PROPRIA`), que é quem de fato barra a escrita. Aqui é só o
 * que a tela mostra. Se um tipo novo ganhar tela própria, mude nos dois —
 * mesma convenção do `productKey`.
 *
 * Em `lib/utils` porque é o único diretório que o runner do pacote executa.
 */

import type { FunnelSpreadsheetType } from "@/lib/types/funnel-spreadsheet";

const TIPOS_COM_TELA_PROPRIA: ReadonlySet<string> = new Set([
  "perpetual_sales",
  "perpetual_upsell",
]);

/** Onde essa planilha se edita de verdade — vira a frase ao lado do item. */
const ONDE_SE_EDITA: Record<string, string> = {
  perpetual_sales: "Editada no dashboard do perpétuo",
  perpetual_upsell: "Editada no dashboard do perpétuo (Ascensão)",
};

export function ehGerenciadaPorOutraTela(type: FunnelSpreadsheetType | string): boolean {
  return TIPOS_COM_TELA_PROPRIA.has(type);
}

/**
 * A frase que substitui os botões.
 *
 * `null` para os tipos que a aba governa — e é o que mantém a linha limpa para
 * o caso normal, em vez de um aviso genérico em toda planilha.
 */
export function ondeSeEdita(type: FunnelSpreadsheetType | string): string | null {
  return ONDE_SE_EDITA[type] ?? null;
}
