/**
 * Reaponta os widgets salvos da entidade `vendas` para `faturamento`.
 *
 * ## Por que um script, e não uma migration SQL
 *
 * A decisão é por widget, não por linha: quem usa a dimensão `vendas.produto`
 * PRECISA continuar em `vendas`, porque o agregado diário das planilhas guarda
 * só data, faturamento e contagem — produto não existe lá. Escrever isso em SQL
 * daria um `CASE` dentro de um `jsonb_set` que ninguém consegue reler.
 *
 * ## Por que precisa existir
 *
 * Criar a entidade nova não conserta o que já estava salvo. Os widgets do
 * painel nasceram apontando para `manual_sales` — 25 linhas em toda a história
 * — e continuaram lá depois do conserto, mostrando "4 vendas · R$ 8.875" para
 * um projeto que faturou R$ 305 mil no período.
 *
 * Uso:
 *   node packages/api/scripts/migrar-widgets-para-faturamento.mjs          (relatório)
 *   node packages/api/scripts/migrar-widgets-para-faturamento.mjs --aplicar
 */

import "dotenv/config";
import pg from "pg";

/** O que troca. A chave da esquerda vira a da direita. */
const METRICAS = {
  "vendas.count": "faturamento.compradores",
  "vendas.revenue": "faturamento.bruto",
  "vendas.ticket_por_venda": "faturamento.ticket",
};

const DIMENSOES = {
  "vendas.date": "faturamento.date",
  "vendas.projeto": "faturamento.projeto",
};

/**
 * Dimensão que só existe em `vendas`.
 *
 * O widget que usa uma destas fica onde está: migrá-lo trocaria um número
 * incompleto por um erro de campo inexistente, que é pior.
 */
const SO_EM_VENDAS = new Set(["vendas.produto"]);

/** O widget migrado, ou `null` quando não dá para migrar. */
function migrar(widget) {
  const spec = widget.querySpec ?? widget.spec;
  if (!spec || spec.entity !== "vendas") return null;

  const dims = spec.dimensions ?? [];
  if (dims.some((d) => SO_EM_VENDAS.has(d))) return null;

  const traduzir = (lista, mapa) => (lista ?? []).map((k) => mapa[k] ?? k);
  const novasMetricas = traduzir(spec.metrics, METRICAS);
  const novasDimensoes = traduzir(dims, DIMENSOES);

  // Sobrou alguma chave de `vendas`? Então há campo que este script não conhece
  // — parar é melhor que gravar um spec meio traduzido que não executa.
  const restou = [...novasMetricas, ...novasDimensoes].filter((k) => k.startsWith("vendas."));
  if (restou.length > 0) return null;

  const filtros = {};
  for (const [chave, filtro] of Object.entries(spec.filters ?? {})) {
    filtros[DIMENSOES[chave] ?? METRICAS[chave] ?? chave] = filtro;
  }

  const ordem = (spec.order_by ?? []).map((o) => ({
    ...o,
    field: METRICAS[o.field] ?? DIMENSOES[o.field] ?? o.field,
  }));

  return {
    ...widget,
    [widget.querySpec ? "querySpec" : "spec"]: {
      ...spec,
      entity: "faturamento",
      metrics: novasMetricas,
      dimensions: novasDimensoes,
      filters: filtros,
      order_by: ordem,
    },
  };
}

const aplicar = process.argv.includes("--aplicar");
const cliente = new pg.Client({ connectionString: process.env.DATABASE_URL });
await cliente.connect();

const { rows } = await cliente.query(`SELECT id, nome, widgets FROM bi_dashboards`);

let migrados = 0;
let mantidos = 0;

for (const painel of rows) {
  const widgets = Array.isArray(painel.widgets) ? painel.widgets : [];
  let mudou = false;

  const novos = widgets.map((w) => {
    const spec = w.querySpec ?? w.spec;
    if (spec?.entity !== "vendas") return w;

    const migrado = migrar(w);
    if (!migrado) {
      mantidos += 1;
      console.log(`  = "${w.titulo ?? w.title}" fica em vendas (usa ${JSON.stringify(spec.dimensions)})`);
      return w;
    }
    migrados += 1;
    mudou = true;
    console.log(`  → "${w.titulo ?? w.title}" ${JSON.stringify(spec.metrics)} vira faturamento`);
    return migrado;
  });

  if (mudou && aplicar) {
    await cliente.query(`UPDATE bi_dashboards SET widgets = $1 WHERE id = $2`, [
      JSON.stringify(novos),
      painel.id,
    ]);
  }
}

console.log(
  `\n${migrados} widget(s) migrado(s), ${mantidos} mantido(s) em vendas.` +
    (aplicar ? " Gravado." : " Nada gravado — rode com --aplicar."),
);

await cliente.end();
