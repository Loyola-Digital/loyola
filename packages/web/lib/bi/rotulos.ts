/**
 * Os nomes de tela dos tipos de widget.
 *
 * Ficam separados do enum porque o enum é contrato com a API (`linha`, `barra`)
 * e o rótulo é texto de interface — traduzir um não deveria obrigar a migrar o
 * outro.
 */

import type { TipoDeWidget } from "./tipos";

export const TIPOS_COM_ROTULO: { id: TipoDeWidget; label: string }[] = [
  { id: "kpi", label: "Número (KPI)" },
  { id: "linha", label: "Linha" },
  { id: "barra", label: "Barra" },
  { id: "pizza", label: "Pizza" },
  { id: "tabela", label: "Tabela" },
  { id: "funil", label: "Funil" },
];
