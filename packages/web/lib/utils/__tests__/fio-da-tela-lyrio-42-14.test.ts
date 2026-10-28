import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Story 42.14 (QA loop, TEST-001) — o FIO da tela: o ARGUMENTO de janela de
 * cada consulta da etapa Lyrio. As funções puras recebem o estado pronto; os
 * testes jsdom mocam os hooks sem olhar o `days`. Sem este arquivo, trocar o
 * `days` por 28 numa chamada (ou o 28 fixo por `days`) passava na suíte
 * inteira — e a tela diria "segue o filtro de 90 dias" com 28 dias, ou
 * misturaria janelas no ROAS e na Margem, que é o defeito que a story corrige.
 *
 * Padrão de `vendas-por-canal-lyrio.test.ts` (o fio por `readFileSync` + regex).
 */
const ler = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const etapa = ler("../../../components/funnels/lyrio-stage-view.tsx");
const overview = ler("../../../components/funnels/revenuecat-overview-block.tsx");

describe("o fio do Resumo mobile (lyrio-stage-view.tsx)", () => {
  it("W1 — Meta: a consulta do FILTRO pede `days` e a dos 28 dias fixos pede 28; cada uma vai para a sua janela", () => {
    expect(etapa).toMatch(/const \{ data: metaDailyFiltro, error: erroMetaFiltroQ \} = useCampaignDailyInsightsBulk\(temMeta \? projectId : null, temMeta \? campaignIds : null, days\);/);
    expect(etapa).toMatch(/const \{ data: metaDaily28, error: erroMeta28Q \} = useCampaignDailyInsightsBulk\(temMeta \? projectId : null, temMeta \? campaignIds : null, 28\);/);
    expect(etapa).toMatch(/const metaFiltro = useMemo\(\(\) => \(metaDailyFiltro \? sumMetaSpendWithTax\(\[metaDailyFiltro\]\) : undefined\), \[metaDailyFiltro\]\);/);
    expect(etapa).toMatch(/const meta28 = useMemo\(\(\) => \(metaDaily28 \? sumMetaSpendWithTax\(\[metaDaily28\]\) : undefined\), \[metaDaily28\]\);/);
    // os dois construtores recebem cada janela no seu campo, com o erro de cada uma (REL-001)
    expect(etapa.match(/meta: \{ temCampanhas: temMeta, filtro: metaFiltro, vinteOito: meta28, erroFiltro: erroMetaFiltro, erro28: erroMeta28 \}/g)).toHaveLength(2);
  });

  it("W2 — Google: UMA consulta de max(filtro, 28) dias, recortada nas duas réguas", () => {
    expect(etapa).toMatch(/diasDaConsultaDoGoogle\(days, 28\)/);
    expect(etapa).toMatch(/const googleFiltro = investimentoDoGoogleNaRegua\(contaGoogle, googleConsultas, days, hoje\);/);
    expect(etapa).toMatch(/const google28 = investimentoDoGoogleNaRegua\(contaGoogle, googleConsultas, 28, hoje\);/);
  });

  it("W3/W4 — novos clientes do Resumo pedem a janela do FILTRO; a receita (Story 42.15, D1) é a do webhook, no estado dos blocos", () => {
    // Story 42.15 (AC2f): o Resumo deixou `…/revenuecat/receita`; a receita vem de `vendas-por-canal` com `days`.
    expect(etapa).not.toMatch(/useRevenuecatReceita/);
    expect(etapa).toMatch(/const novosClientesQ = useRevenuecatNovosClientes\(projectId, funnelId, stage\.id, days, connected\);/);
    expect(etapa).toMatch(/vendas: vendasDosBlocos,\s*novosClientes,/);
  });

  it("W6 — pagantes: o FILTRO pede `days` e os CACs de 28 dias fixos pedem 28", () => {
    expect(etapa).toMatch(/const pagantesFiltroQ = useRevenuecatPagantesPorCanal\(projectId, funnelId, stage\.id, days, connected\);/);
    expect(etapa).toMatch(/const pagantes28Q = useRevenuecatPagantesPorCanal\(projectId, funnelId, stage\.id, 28, connected\);/);
    expect(etapa).toMatch(/pagantes28: estadoDaFonte\(\{ isLoading: pagantes28Q\.isLoading, error: pagantes28Q\.error, data: pagantes28Q\.data \}\)/);
  });

  it("L13 — o aviso de produto não classificado está na tela, com role=alert, dentro do bloco do LTV (AC7d)", () => {
    const inicio = etapa.indexOf("LTV bruto por plano");
    expect(inicio).toBeGreaterThan(0);
    const bloco = etapa.slice(inicio, etapa.indexOf("<GradeDoResumo cards={aquisicao.ltv} />", inicio));
    expect(bloco).toMatch(/\{avisoDoLtv && \(\s*<p role="alert"[^>]*>\s*\{avisoDoLtv\}/);
    expect(etapa).toMatch(/const avisoDoLtv = avisoDeNaoClassificado\(pagantesFiltro\.tipo === "pronto" \? pagantesFiltro\.dados\.ltv : undefined\);/);
  });
});

describe("o fio do Overview do RevenueCat (revenuecat-overview-block.tsx)", () => {
  it("W5 — receita e novos clientes do FILTRO; eventos no filtro; numeradores das conversões em 28 dias", () => {
    expect(overview).toMatch(/const receitaQ = useRevenuecatReceita\(projectId, funnelId, stageId, days\);/);
    expect(overview).toMatch(/const novosClientesQ = useRevenuecatNovosClientes\(projectId, funnelId, stageId, days\);/);
    expect(overview).toMatch(/const derivadasQ = useRevenuecatMetricasDerivadas\(projectId, funnelId, stageId, days\);/);
    expect(overview).toMatch(/const derivadas28Q = useRevenuecatMetricasDerivadas\(projectId, funnelId, stageId, 28\);/);
    expect(overview).toMatch(/const pagantes28Q = useRevenuecatPagantesPorCanal\(projectId, funnelId, stageId, 28\);/);
    expect(overview).toMatch(/ctx: \{ diasDoFiltro: days, hoje: hojeNoNegocio\(\) \}/);
  });
});
