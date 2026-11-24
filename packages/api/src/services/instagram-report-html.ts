/**
 * O relatório mensal do Instagram em HTML autocontido.
 *
 * Pedido do Social Media: poder **baixar** o relatório, não só vê-lo na tela.
 * Guardar já existia (o payload fica em `instagram_monthly_reports.data`); o que
 * faltava era um arquivo para mandar por e-mail, anexar no ClickUp ou abrir sem
 * acesso ao painel.
 *
 * Autocontido de verdade, no mesmo molde do `perpetual-report-html.ts`: CSS
 * inline, zero script, zero fonte externa. Única exceção são as miniaturas dos
 * posts (`<img src>` da Meta), e elas são EXCLUÍDAS de propósito — a URL que a
 * Meta devolve expira em algumas horas, e um arquivo cheio de imagem quebrada
 * parece defeito. O que vai é o link do post, que não expira.
 *
 * Tudo o que vem de legenda, nome de conta ou cidade é escapado: é dado, não
 * markup.
 */

import type { MonthlyReportData, AccountReport, PostSummary } from "@loyola-x/shared";

const int = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
const pct1 = (n: number | null | undefined) =>
  n == null ? "—" : `${n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const sinal = (n: number | null | undefined) =>
  n == null ? "—" : `${n > 0 ? "+" : ""}${n.toLocaleString("pt-BR")}`;

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function dataBr(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
  background:#0b0d12;color:#e6e8ee;line-height:1.5;padding:24px;font-size:14px}
.wrap{max-width:1000px;margin:0 auto}
h1{font-size:22px;font-weight:650;margin-bottom:4px}
h2{font-size:15px;font-weight:600;margin:28px 0 10px;color:#c7cbd6}
h3{font-size:13px;font-weight:600;margin:18px 0 8px;color:#9aa2b6}
.sub{color:#8b93a7;font-size:13px;margin-bottom:20px}
.conta{margin-top:34px;padding-top:18px;border-top:1px solid #1e2333}
.conta:first-of-type{border-top:none;padding-top:0}
.arroba{font-size:12px;color:#8b93a7}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
.kpi{background:#151822;border:1px solid #232838;border-radius:10px;padding:12px}
.kpi .lbl{font-size:11px;color:#8b93a7;text-transform:uppercase;letter-spacing:.03em}
.kpi .val{font-size:19px;font-weight:650;margin-top:3px;font-variant-numeric:tabular-nums}
.kpi .hint{font-size:11px;color:#6f778c;margin-top:2px}
.pos-v{color:#34c77b}.neg-v{color:#f05a5a}
table{width:100%;border-collapse:collapse;font-size:13px}
.scroll{overflow-x:auto;-webkit-overflow-scrolling:touch}
th,td{padding:7px 9px;text-align:right;border-bottom:1px solid #1e2333;white-space:nowrap}
th:first-child,td:first-child{text-align:left;white-space:normal;min-width:220px}
th{font-size:11px;color:#8b93a7;text-transform:uppercase;letter-spacing:.03em;font-weight:600}
td{font-variant-numeric:tabular-nums}
tbody tr:last-child td{border-bottom:none}
a{color:#7aa2f7;text-decoration:none}
a:hover{text-decoration:underline}
.semlink{color:#6f778c}
.duas{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:18px}
.nota{font-size:12px;color:#9aa2b6;background:#111420;border:1px solid #1e2333;
  border-radius:10px;padding:12px;margin-top:10px}
footer{margin-top:32px;padding-top:12px;border-top:1px solid #1e2333;
  font-size:11px;color:#6f778c}
`;

function kpi(lbl: string, val: string, hint?: string): string {
  return `<div class="kpi"><div class="lbl">${lbl}</div><div class="val">${val}</div>${
    hint ? `<div class="hint">${hint}</div>` : ""
  }</div>`;
}

/**
 * Tabela de posts. O link sai só quando há permalink — `instagram.com/p/{id}`
 * montado na mão não abre, porque media id não é o shortcode do post.
 */
function tabelaDePosts(titulo: string, posts: PostSummary[]): string {
  if (posts.length === 0) return "";
  const linhas = posts
    .map((p) => {
      const legenda = esc(p.caption ?? "Sem legenda");
      const texto = legenda.length > 90 ? `${legenda.slice(0, 87)}...` : legenda;
      const titulo = p.permalink
        ? `<a href="${esc(p.permalink)}" target="_blank" rel="noopener noreferrer">${texto}</a>`
        : `<span class="semlink">${texto}</span>`;
      return `<tr>
        <td>${titulo}<br><span class="arroba">${dataBr(p.timestamp)}${
          p.mediaProductType ? ` · ${esc(p.mediaProductType)}` : ""
        }</span></td>
        <td>${int(p.reach)}</td>
        <td>${pct1(p.engagementRate)}</td>
        <td>${int(p.likes)}</td>
        <td>${int(p.comments)}</td>
        <td>${int(p.saves)}</td>
        <td>${int(p.follows)}</td>
      </tr>`;
    })
    .join("");
  return `<h3>${titulo}</h3><div class="scroll"><table>
    <thead><tr><th>Post</th><th>Alcance</th><th>Engaj.</th><th>Curtidas</th>
    <th>Coment.</th><th>Salvos</th><th>Seguidores</th></tr></thead>
    <tbody>${linhas}</tbody></table></div>`;
}

function blocoDaConta(conta: AccountReport): string {
  const t = conta.totals;
  const f = conta.followers;

  // O total de seguidores só é "do fim do mês" no mês corrente; em mês fechado
  // o que existe é a medição da geração. Ver `montarSeguidores`.
  const totalDeSeguidores =
    f.endOfMonth != null
      ? kpi("Seguidores ao fim do mês", int(f.endOfMonth))
      : f.totalMedido != null
        ? kpi(
            "Seguidores (total medido)",
            int(f.totalMedido),
            f.totalMedidoEm ? `medido em ${dataBr(f.totalMedidoEm)}` : undefined,
          )
        : "";

  const demo = conta.demographics;
  const listaDemo = (titulo: string, itens: Array<{ nome: string; valor: number }> | null) => {
    if (!itens || itens.length === 0) return "";
    const linhas = itens
      .map((i) => `<tr><td>${esc(i.nome)}</td><td>${int(i.valor)}</td></tr>`)
      .join("");
    return `<div><h3>${titulo}</h3><div class="scroll"><table>
      <thead><tr><th>Item</th><th>Pessoas</th></tr></thead><tbody>${linhas}</tbody></table></div></div>`;
  };

  return `<section class="conta">
    <h2>${esc(conta.accountName)} <span class="arroba">@${esc(conta.instagramUsername)}</span></h2>
    <div class="kpis">
      ${kpi("Alcance", int(t.reach))}
      ${kpi("Visualizações", int(t.views))}
      ${kpi("Interações", int(t.interactions))}
      ${kpi("Posts publicados", int(t.postsPublished))}
      ${kpi(
        "Saldo de seguidores",
        `<span class="${f.net >= 0 ? "pos-v" : "neg-v"}">${sinal(f.net)}</span>`,
        `+${int(f.gained)} novos · −${int(f.lost)} unfollows`,
      )}
      ${totalDeSeguidores}
      ${f.ganhosPorPost != null ? kpi("Seguidores pelos posts", sinal(f.ganhosPorPost)) : ""}
    </div>

    ${tabelaDePosts("Melhores por alcance", conta.topByReach)}
    ${tabelaDePosts("Melhores por engajamento", conta.topByEngagement)}
    ${tabelaDePosts("Piores por alcance", conta.bottomByReach)}

    ${
      demo
        ? `<div class="duas">
            ${listaDemo(
              "Cidades",
              demo.cities?.map((c) => ({ nome: c.name, valor: c.count })) ?? null,
            )}
            ${listaDemo(
              "Países",
              demo.countries?.map((c) => ({ nome: c.name, valor: c.count })) ?? null,
            )}
          </div>`
        : ""
    }
  </section>`;
}

/**
 * O arquivo que o Social Media baixa. Recebe o payload já gravado — não busca
 * nada na Meta, então o conteúdo é exatamente o que a tela mostra.
 */
export function renderInstagramReportHtml(data: MonthlyReportData): string {
  const contas = data.accounts ?? [];
  const titulo = `Instagram — ${data.monthLabel}`;
  const miniaturasDeFora = contas.some((c) =>
    [...c.topByReach, ...c.topByEngagement].some((p) => p.thumbnailUrl),
  );

  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(titulo)}</title><style>${CSS}</style></head>
<body><div class="wrap">
  <h1>${esc(titulo)}</h1>
  <p class="sub">Período de ${dataBr(data.periodStart)} a ${dataBr(data.periodEnd)} ·
     ${contas.length} ${contas.length === 1 ? "conta" : "contas"} ·
     gerado em ${dataBr(data.generatedAt)}</p>

  ${contas.length === 0 ? "<p class=\"nota\">Nenhuma conta do Instagram vinculada a este projeto no período.</p>" : ""}
  ${contas.map(blocoDaConta).join("")}

  ${
    miniaturasDeFora
      ? `<p class="nota">As miniaturas dos posts ficam fora deste arquivo de propósito:
         a URL que a Meta devolve expira em poucas horas e viraria imagem quebrada.
         O link de cada post está no título — esse não expira.</p>`
      : ""
  }

  <footer>Loyola X · relatório gerado em ${dataBr(data.generatedAt)} ·
    arquivo autocontido, sem script e sem recurso externo</footer>
</div></body></html>`;
}
