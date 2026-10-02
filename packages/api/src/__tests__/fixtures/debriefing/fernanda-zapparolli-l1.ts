/**
 * Story 49.5 — fixture de COMPARAÇÃO (decisão 1 do dono: nunca bloqueia).
 * FZ-L1-FEV26: números do §8 do perfil `fernanda-zapparolli.md` da skill
 * `loyola-debriefing` (debriefing fechado em 2026-07-02). Só números (LGPD).
 * Captação 100% gratuita (sem ingresso): as taxas por lead não têm campo no payload.
 */

import type { FixtureDeDebriefing } from "../../../services/debriefing-fixture-compare.js";

const o = (rotulo: string) => `squads/loyola-debriefing/data/expert-profiles/fernanda-zapparolli.md §8 coluna L1-FEV26 linha '${rotulo}'`;
const LEAD = "denominador = lead da captação gratuita; o payload mede o comprador de captação (CONTRACT-001)";

export const fixture: FixtureDeDebriefing = {
  id: "fz-l1-skill",
  expert: "fernanda-zapparolli",
  lancamento: "FZ-L1-FEV26",
  oraculo: {
    id: "skill-export-cru",
    papel: "comparacao",
    fonte: "skill loyola-debriefing — debriefing FZ-L1 (exports Kiwify/TMB + Meta)",
    janela: { de: "2026-02-19", ate: "2026-05-31" },
    reconferidoEm: "2026-07-02",
  },
  fatorImpostoDaFonte: 1.13,
  metricas: [
    { chave: "leads", valor: 1785, unidade: "contagem", classe: "volume", mapeamento: "SEM_CAMPO_EQUIVALENTE", origem: o("Leads"), nota: "o Loyola não tem o # Leads oficial (lacuna LEADS_DO_PAINEL)" },
    { chave: "vendasPrincipal", valor: 178, unidade: "contagem", classe: "volume", mapeamento: "vendasPrincipal", origem: o("Vendas principal HEADLINE (L1 = só carrinho, decisão 2026-07-02)") },
    { chave: "tmbNoPrincipal", valor: 59, unidade: "contagem", classe: "volume", mapeamento: "tmb.vendasNoPrincipal", origem: o("Vendas principal HEADLINE (L1 = só carrinho, decisão 2026-07-02)") },
    { chave: "conversaoLeadPrincipal", valor: 9.97, unidade: "pct", classe: "taxa-de-volume", mapeamento: "SEM_CAMPO_EQUIVALENTE", casas: 2, origem: o("Conv. lead→principal HEADLINE"), nota: LEAD },
    { chave: "faturamentoTotalSemTmb", valor: 134805.0, unidade: "BRL", classe: "dinheiro", mapeamento: "faturamentoTotalSemTmb", origem: o("Faturamento bruto s/ TMB HEADLINE") },
    { chave: "investimentoTotal", valor: 14059.54, unidade: "BRL", classe: "custo", mapeamento: "investimentoTotal", origem: o("Investimento HEADLINE (spend × 1,13; L1 sem mídia da reabertura)") },
    { chave: "roasTotal", valor: 9.59, unidade: "razao", classe: "razao-de-custo", mapeamento: "roasTotalSemTmb", casas: 2, origem: o("ROAS HEADLINE · CPA") },
    { chave: "cpa", valor: 78.99, unidade: "BRL", classe: "custo", mapeamento: "SEM_CAMPO_EQUIVALENTE", origem: o("ROAS HEADLINE · CPA"), nota: "o payload não expõe custo por venda do principal" },
    { chave: "reaberturaVendas", valor: 176, unidade: "contagem", classe: "volume", mapeamento: "reabertura.vendas", origem: o("APÊNDICE reabertura (L1)") },
    { chave: "reaberturaFaturamento", valor: 135835.09, unidade: "BRL", classe: "dinheiro", mapeamento: "reabertura.faturamento", origem: o("APÊNDICE reabertura (L1)") },
    { chave: "reaberturaInvestimento", valor: 1292.65, unidade: "BRL", classe: "custo", mapeamento: "reabertura.investimento", origem: o("APÊNDICE reabertura (L1)") },
    { chave: "referenciaCombinadaFaturamento", valor: 271837.09, unidade: "BRL", classe: "dinheiro", mapeamento: "referenciaCombinada.faturamento", origem: o("Referência combinada L1 (carrinho+reabertura)") },
    { chave: "referenciaCombinadaInvestimento", valor: 15352.19, unidade: "BRL", classe: "custo", mapeamento: "referenciaCombinada.investimento", origem: o("Referência combinada L1 (carrinho+reabertura)") },
    { chave: "referenciaCombinadaRoas", valor: 17.71, unidade: "razao", classe: "razao-de-custo", mapeamento: "referenciaCombinada.roas", casas: 2, origem: o("Referência combinada L1 (carrinho+reabertura)") },
    { chave: "cpl", valor: 6.58, unidade: "BRL", classe: "custo", mapeamento: "SEM_CAMPO_EQUIVALENTE", origem: o("CPL"), nota: "o payload não expõe custo por lead" },
    { chave: "linkClicks", valor: 12876, unidade: "contagem", classe: "volume", mapeamento: "linkClicksTotal", origem: o("Link clicks lançamento (fz-l*)") },
    { chave: "closerPrincipal", valor: 109, unidade: "contagem", classe: "volume", mapeamento: "fechamento.closer.vendas", origem: o("Canal top do principal"), nota: "eixo de fechamento (decisão 3)" },
    { chave: "semTrackReal", valor: 47, unidade: "contagem", classe: "volume", mapeamento: "canal.semTrackReal.vendas", origem: o("Sem track real") },
    { chave: "faixaA", valor: 46, unidade: "contagem", classe: "volume", mapeamento: "faixa.A", origem: o("Faixa (pesquisa dedup)") },
    { chave: "faixaB", valor: 377, unidade: "contagem", classe: "volume", mapeamento: "faixa.B", origem: o("Faixa (pesquisa dedup)") },
    { chave: "faixaC", valor: 653, unidade: "contagem", classe: "volume", mapeamento: "faixa.C", origem: o("Faixa (pesquisa dedup)") },
    { chave: "faixaD", valor: 65, unidade: "contagem", classe: "volume", mapeamento: "faixa.D", origem: o("Faixa (pesquisa dedup)") },
    { chave: "pesquisaRespondentes", valor: 1144, unidade: "contagem", classe: "volume", mapeamento: "pesquisa.respondentes", origem: o("Faixa (pesquisa dedup)") },
    { chave: "conversaoFaixaA", valor: 8.7, unidade: "pct", classe: "taxa-de-volume", mapeamento: "SEM_CAMPO_EQUIVALENTE", casas: 1, origem: o("Conv. faixa A→principal"), nota: LEAD },
  ],
};

export default fixture;
