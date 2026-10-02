/**
 * Story 49.5 — fixture de COMPARAÇÃO (decisão 1 do dono: nunca bloqueia).
 * FZ-L2-JUN26: números do §8 do perfil `fernanda-zapparolli.md` da skill
 * `loyola-debriefing` (debriefing fechado em 2026-07-02). Só números (LGPD).
 */

import type { FixtureDeDebriefing } from "../../../services/debriefing-fixture-compare.js";

const o = (rotulo: string) => `squads/loyola-debriefing/data/expert-profiles/fernanda-zapparolli.md §8 coluna L2-JUN26 linha '${rotulo}'`;
const LEAD = "denominador = lead; o payload mede o comprador de captação (CONTRACT-001)";

export const fixture: FixtureDeDebriefing = {
  id: "fz-l2-skill",
  expert: "fernanda-zapparolli",
  lancamento: "FZ-L2-JUN26",
  oraculo: {
    id: "skill-export-cru",
    papel: "comparacao",
    fonte: "skill loyola-debriefing — debriefing FZ-L2 (exports Kiwify/TMB + Meta)",
    janela: { de: "2026-05-27", ate: "2026-06-30" },
    reconferidoEm: "2026-07-02",
  },
  fatorImpostoDaFonte: 1.13,
  metricas: [
    { chave: "leads", valor: 1878, unidade: "contagem", classe: "volume", mapeamento: "SEM_CAMPO_EQUIVALENTE", origem: o("Leads"), nota: "o Loyola não tem o # Leads oficial (lacuna LEADS_DO_PAINEL)" },
    { chave: "ingressos", valor: 166, unidade: "contagem", classe: "volume", mapeamento: "ingressosUnicos", origem: o("Ingressos (únicos, R$9,90)") },
    { chave: "faturamentoIngresso", valor: 1643.4, unidade: "BRL", classe: "dinheiro", mapeamento: "faturamentoIngresso", origem: o("Ingressos (únicos, R$9,90)") },
    { chave: "vendasPrincipal", valor: 100, unidade: "contagem", classe: "volume", mapeamento: "vendasPrincipal", origem: o("Vendas principal HEADLINE (L1 = só carrinho, decisão 2026-07-02)") },
    { chave: "tmbNoPrincipal", valor: 21, unidade: "contagem", classe: "volume", mapeamento: "tmb.vendasNoPrincipal", origem: o("Vendas principal HEADLINE (L1 = só carrinho, decisão 2026-07-02)") },
    { chave: "conversaoLeadPrincipal", valor: 5.32, unidade: "pct", classe: "taxa-de-volume", mapeamento: "SEM_CAMPO_EQUIVALENTE", casas: 2, origem: o("Conv. lead→principal HEADLINE"), nota: LEAD },
    { chave: "faturamentoTotalSemTmb", valor: 97815.4, unidade: "BRL", classe: "dinheiro", mapeamento: "faturamentoTotalSemTmb", origem: o("Faturamento bruto s/ TMB HEADLINE") },
    { chave: "investimentoTotal", valor: 14711.49, unidade: "BRL", classe: "custo", mapeamento: "investimentoTotal", origem: o("Investimento HEADLINE (spend × 1,13; L1 sem mídia da reabertura)") },
    { chave: "roasTotal", valor: 6.65, unidade: "razao", classe: "razao-de-custo", mapeamento: "roasTotalSemTmb", casas: 2, origem: o("ROAS HEADLINE · CPA") },
    { chave: "cpa", valor: 147.11, unidade: "BRL", classe: "custo", mapeamento: "SEM_CAMPO_EQUIVALENTE", origem: o("ROAS HEADLINE · CPA"), nota: "o payload não expõe custo por venda do principal" },
    { chave: "roasSoIngresso", valor: 0.52, unidade: "razao", classe: "razao-de-custo", mapeamento: "roasSoIngresso", casas: 2, origem: o("ROAS captação só ingresso") },
    { chave: "cplGratis", valor: 5.07, unidade: "BRL", classe: "custo", mapeamento: "SEM_CAMPO_EQUIVALENTE", origem: o("CPL"), nota: "o payload não expõe custo por lead" },
    { chave: "cpaIngresso", valor: 18.91, unidade: "BRL", classe: "custo", mapeamento: "SEM_CAMPO_EQUIVALENTE", origem: o("CPL"), nota: "o payload não expõe custo por ingresso no Motor I" },
    { chave: "ingressosPorCliques", valor: 10.27, unidade: "pct", classe: "taxa-de-volume", mapeamento: "pctCompradoresPorCliques", casas: 2, origem: o("Ingressos/cliques (captação paga)") },
    { chave: "conversaoIngressoPrincipal", valor: 2.41, unidade: "pct", classe: "taxa-de-volume", mapeamento: "conversaoIngressoPrincipal", casas: 2, origem: o("Ingresso→Principal (match e-mail)") },
    { chave: "linkClicks", valor: 9145, unidade: "contagem", classe: "volume", mapeamento: "linkClicksTotal", origem: o("Link clicks lançamento (fz-l*)") },
    { chave: "instagramOrganicoPrincipal", valor: 49, unidade: "contagem", classe: "volume", mapeamento: "canal.instagramOrganico.vendas", origem: o("Canal top do principal") },
    { chave: "semTrackReal", valor: 1, unidade: "contagem", classe: "volume", mapeamento: "canal.semTrackReal.vendas", origem: o("Sem track real") },
    { chave: "faixaA", valor: 28, unidade: "contagem", classe: "volume", mapeamento: "faixa.A", origem: o("Faixa (pesquisa dedup)") },
    { chave: "faixaB", valor: 252, unidade: "contagem", classe: "volume", mapeamento: "faixa.B", origem: o("Faixa (pesquisa dedup)") },
    { chave: "faixaC", valor: 358, unidade: "contagem", classe: "volume", mapeamento: "faixa.C", origem: o("Faixa (pesquisa dedup)") },
    { chave: "faixaD", valor: 17, unidade: "contagem", classe: "volume", mapeamento: "faixa.D", origem: o("Faixa (pesquisa dedup)") },
    { chave: "pesquisaRespondentes", valor: 655, unidade: "contagem", classe: "volume", mapeamento: "pesquisa.respondentes", origem: o("Faixa (pesquisa dedup)") },
    { chave: "conversaoFaixaA", valor: 3.57, unidade: "pct", classe: "taxa-de-volume", mapeamento: "SEM_CAMPO_EQUIVALENTE", casas: 2, origem: o("Conv. faixa A→principal"), nota: LEAD },
  ],
};

export default fixture;
