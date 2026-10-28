import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Story 42.15 (AC8d, AC6, AC2b, AC7a, AC10) — o FIO da tela, lendo o fonte (o
 * padrão da 42.13, 42.14 e 42.16): os `.tsx` de `components/funnels` não são
 * coletados pelo vitest, então o que sai e o que fica é provado aqui.
 */
const url = (rel: string) => new URL(rel, import.meta.url);
const ler = (rel: string) => readFileSync(fileURLToPath(url(rel)), "utf8");
const etapa = ler("../../../components/funnels/lyrio-stage-view.tsx");
const card = ler("../../../components/funnels/lyrio-card-com-janela.tsx");
const grade = ler("../../../components/funnels/lyrio-resumo-cards.tsx");
const resumo = ler("../resumo-mobile-lyrio.ts");
/** O código do construtor, sem os comentários (a documentação cita as datas e a fonte antiga). */
const codigoDoResumo = resumo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
/** O JSX que a tela desenha, sem os comentários (um comentário pode citar o nome do componente). */
const jsx = etapa.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");

describe("AC6 — o que sai da tela, e o que fica", () => {
  it("(a) <LyrioResumoPorCanal> não é importado nem renderizado; o componente e `linhasDoResumoPorCanal` ficam (AC3b usa a função)", () => {
    expect(jsx).not.toMatch(/<LyrioResumoPorCanal\b/);
    expect(etapa).not.toMatch(/import \{ LyrioResumoPorCanal \}/);
    expect(existsSync(fileURLToPath(url("../../../components/funnels/lyrio-resumo-por-canal.tsx")))).toBe(true);
    expect(resumo).toMatch(/linhasDoResumoPorCanal\(\{/);
  });
  it("(b) <RevenuecatOverviewBlock> não é importado nem renderizado; o componente fica; `useRevenuecatOverview` continua (MRR e assinaturas)", () => {
    expect(jsx).not.toMatch(/<RevenuecatOverviewBlock\b/);
    expect(etapa).not.toMatch(/import \{ RevenuecatOverviewBlock \}/);
    expect(existsSync(fileURLToPath(url("../../../components/funnels/revenuecat-overview-block.tsx")))).toBe(true);
    expect(etapa).toMatch(/const overview = useRevenuecatOverview\(projectId, funnelId, stage\.id\);/);
    expect(etapa).toMatch(/overview: overviewEstado,/);
  });
  it("(c) o painel \"RevenueCat\" do rodapé continua: o overview ao vivo e as vendas, com Por canal, Por loja e Por produto", () => {
    const rodape = jsx.slice(jsx.indexOf('<h2 className="text-sm font-semibold text-muted-foreground">RevenueCat</h2>'));
    expect(rodape.length).toBeGreaterThan(100);
    expect(rodape).toMatch(/<RevenuecatOverviewPanel\s/);
    expect(rodape).toMatch(/<RevenuecatPanel\s/);
    expect(etapa).toMatch(/title="Por produto"/);
    expect(etapa).toMatch(/title="Por loja"/);
  });
});

describe("AC2 — a receita do Resumo é a do webhook, na MESMA consulta dos blocos", () => {
  it("(b) uma consulta `vendas-por-canal` com o `days` do filtro; o Resumo lê o estado dos blocos", () => {
    expect(etapa.match(/useRevenuecatVendasPorCanal\(/g)).toHaveLength(1);
    expect(etapa).toMatch(/useRevenuecatVendasPorCanal\(projectId, funnelId, stage\.id, days, connected\)/);
    const chamada = etapa.slice(etapa.indexOf("const cardsResumo = cardsDoResumo({"), etapa.indexOf("});", etapa.indexOf("const cardsResumo = cardsDoResumo({")));
    expect(chamada).toMatch(/vendas: vendasDosBlocos,/);
    expect(chamada).toMatch(/ctx: \{ diasDoFiltro: days, hoje, serieDesde \}/);
  });
  it("(e) o `serieDesde` vem da API (`assinaturaDesde` dos pagantes), sem data fixa no código", () => {
    expect(etapa).toMatch(/const serieDesde = pagantesFiltro\.tipo === "pronto" \? pagantesFiltro\.dados\.assinaturaDesde : null;/);
    expect(codigoDoResumo).not.toMatch(/2026-08-10|2026-10-06|10\/08|06\/10/);
  });
  it("(f) a Receita não lê mais `…/revenuecat/receita`", () => {
    expect(etapa).not.toMatch(/useRevenuecatReceita/);
    expect(codigoDoResumo).not.toMatch(/metrics\/revenue|ReceitaDoPeriodo/);
  });
  it("(g) erro das vendas: aviso role=alert DENTRO do bloco do Resumo", () => {
    const inicio = jsx.indexOf("{tituloDoResumo(days, hoje)}");
    const secao = jsx.slice(inicio, jsx.indexOf("</section>", inicio));
    expect(secao).toMatch(/\{connected && avisoDasVendas && \(\s*<p role="alert"[^>]*>\s*\{avisoDasVendas\}/);
    expect(etapa).toMatch(/const avisoDasVendas = vendasDosBlocos\.tipo === "erro" \?/);
  });
});

describe("AC7a — um só componente desenha valor principal + linhas, nos 13 cards", () => {
  it("a grade passa as linhas, o carregando e o alerta para o card da 42.14 (SuperficieDoCard)", () => {
    expect(grade).toMatch(/secundarias=\{c\.secundarias\}\s*carregando=\{c\.carregando\}\s*alerta=\{c\.alerta\}/);
    expect(card).toMatch(/export const SuperficieDoCard = React\.forwardRef</);
    expect(card).toMatch(/ref=\{ref\}\s*\{\.\.\.rest\}/);
  });
  it("(c) a linha corta com reticências: `truncate` no item e `min-w-0` no card", () => {
    expect(card).toMatch(/<li\s+key=\{l\.id\}\s+className=\{`truncate /);
    expect(card).toMatch(/className=\{`min-w-0 space-y-0\.5 rounded-lg border p-3/);
  });
  it("todos os cards do Resumo passam pela MESMA grade: o principal, CAC, LTV bruto, Renovações, LTV (margem) e LTV/CAC", () => {
    for (const cards of ["cardsResumo", "aquisicao.cac", "aquisicao.ltv", "aquisicao.renovacoes", "[ltvPorChurn.ltv, ltvPorChurn.relacao]"]) {
      expect(jsx, cards).toContain(`<GradeDoResumo cards={${cards}} />`);
    }
  });
});

describe("AC10 — o fio do LTV por churn", () => {
  it("o churn pede 30 dias FIXOS (não o filtro) nas duas consultas; o CAC é o consolidado do filtro", () => {
    expect(etapa).toMatch(/useRevenuecatMetricasDerivadas\(projectId, funnelId, stage\.id, DIAS_DO_CHURN, connected\)/);
    expect(etapa).toMatch(/useRevenuecatAtivasNoInicio\(projectId, funnelId, stage\.id, DIAS_DO_CHURN, connected\)/);
    expect(etapa).toMatch(/cac: aquisicao\.cacConsolidadoDoFiltro,/);
    expect(etapa).toMatch(/margem: margemDosPercentuais\(percentuais\),/);
    expect(etapa).toMatch(/arpu: arpuDoOverview\(overviewEstado\),/);
  });
  it("o hook da rota nova pede `ativas-no-inicio?days=`", () => {
    const hooks = ler("../../hooks/use-revenuecat.ts");
    expect(hooks).toMatch(/\/stages\/\$\{stageId\}\/revenuecat\/ativas-no-inicio\?days=\$\{days\}/);
    expect(hooks).toMatch(/queryKey: \["revenuecat-ativas-no-inicio", stageId, days\]/);
  });
});

describe("QA loop 1 (REL-001, DOC-001) — o fio do estado da config e da cobertura", () => {
  const trecho = (inicio: string) => etapa.slice(etapa.indexOf(inicio), etapa.indexOf("});", etapa.indexOf(inicio)));
  it("os percentuais saem do ESTADO da consulta da config (carregando / erro / pronto), não do fallback", () => {
    expect(etapa).toMatch(/const percentuais = percentuaisDaConfig\(estadoDaFonte\(\{ isLoading: config\.isLoading, error: config\.error, data: config\.data \}\)\);/);
    const resumoCall = trecho("const cardsResumo = cardsDoResumo({");
    const ltvCall = trecho("const ltvPorChurn = cardsDoLtvPorChurn({");
    expect(resumoCall).toMatch(/\n\s+percentuais,\n/);
    expect(ltvCall).toMatch(/margem: margemDosPercentuais\(percentuais\),/);
    for (const call of [resumoCall, ltvCall]) expect(call).not.toMatch(/platformFeePct|MARGEM_DEFAULTS/);
  });
  it("DOC-001: o Resumo sabe que a cobertura (pagantes) ainda carrega", () => {
    expect(trecho("const cardsResumo = cardsDoResumo({")).toMatch(/serieCarregando: pagantesFiltro\.tipo === "carregando",/);
  });
});
