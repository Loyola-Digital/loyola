/**
 * Story 49.5 — fixture de COMPARAÇÃO (decisão 1 do dono: nunca bloqueia).
 * DG-PG02: números do §8 do perfil `danilo-gato.md` da skill `loyola-debriefing`
 * (reconferido em 28/08/2026). Só números — sem e-mail, telefone ou nome (LGPD).
 */

import type { FixtureDeDebriefing } from "../../../services/debriefing-fixture-compare.js";

const o = (rotulo: string) => `squads/loyola-debriefing/data/expert-profiles/danilo-gato.md §8 coluna PG02 linha '${rotulo}'`;

export const fixture: FixtureDeDebriefing = {
  id: "dg-pg02-skill",
  expert: "danilo-gato",
  lancamento: "DG-PG02",
  oraculo: {
    id: "skill-export-cru",
    papel: "comparacao",
    fonte: "skill loyola-debriefing — export cru da Kiwify (PG02)",
    janela: { de: "2026-04-16", ate: "2026-06-13" },
    reconferidoEm: "2026-08-28",
  },
  fatorImpostoDaFonte: 1.13,
  metricas: [
    { chave: "leadsOficial", valor: 1952, unidade: "contagem", classe: "volume", mapeamento: "SEM_CAMPO_EQUIVALENTE", origem: o("# Leads (Debriefing / oficial do resumo)"), nota: "o Loyola não tem o # Leads oficial do debriefing diário (lacuna LEADS_DO_PAINEL)" },
    { chave: "compradoresCaptacaoEmailOuTelefone", valor: 1845, unidade: "contagem", classe: "volume", mapeamento: "compradoresUnicos.porEmailOuTelefone", origem: o("Compradores de captação (dedup e-mail OU telefone)") },
    { chave: "faturamentoCaptacao", valor: 227491.74, unidade: "BRL", classe: "dinheiro", mapeamento: "faturamentoCaptacao", origem: o("Faturamento captação") },
    { chave: "captacaoPagaKiwify", valor: 239243.4, unidade: "BRL", classe: "dinheiro", mapeamento: "SEM_CAMPO_EQUIVALENTE", origem: o("Captação PAGA (Kiwify, exclui backend/downsell)"), nota: "definição da skill sem campo no payload" },
    { chave: "faturamentoTotalKiwify", valor: 469769.4, unidade: "BRL", classe: "dinheiro", mapeamento: "SEM_CAMPO_EQUIVALENTE", origem: o("Faturamento total Kiwify (`Preço base do produto`, paid)"), nota: "soma do export cru inteiro — sem campo no payload" },
    { chave: "ticketCaptacao", valor: 123.3, unidade: "BRL", classe: "dinheiro", mapeamento: "ticketCaptacao", origem: o("Ticket médio captação") },
    { chave: "pctComTierSuperior", valor: 38.3, unidade: "pct", classe: "taxa-de-volume", mapeamento: "pctComTierSuperior", casas: 1, origem: o("% com tier superior (combo/gravação ∪ bump)") },
    { chave: "comboLinhas", valor: 597, unidade: "contagem", classe: "volume", mapeamento: "vendasCaptacao.combo", origem: o("Combo — linhas / receita (linhas)") },
    { chave: "comboReceita", valor: 143156.2, unidade: "BRL", classe: "dinheiro", mapeamento: "faturamentoCombo", origem: o("Combo — linhas / receita (receita)") },
    { chave: "orderBumpPessoas", valor: 115, unidade: "contagem", classe: "volume", mapeamento: "comOrderBump", origem: o("Order bump — pessoas / receita (pessoas)") },
    { chave: "orderBumpReceita", valor: 13866.55, unidade: "BRL", classe: "dinheiro", mapeamento: "faturamentoOrderBump", origem: o("Order bump — pessoas / receita (receita)") },
    { chave: "vendasPrincipal", valor: 70, unidade: "contagem", classe: "volume", mapeamento: "vendasPrincipal", origem: o("Vendas principal (oficial)") },
    { chave: "faturamentoPrincipal", valor: 245_800, unidade: "BRL", classe: "dinheiro", mapeamento: "faturamentoPrincipal", origem: o("Faturamento principal (s/ TMB)") },
    { chave: "ticketPrincipal", valor: 3615, unidade: "BRL", classe: "dinheiro", mapeamento: "SEM_CAMPO_EQUIVALENTE", origem: o("Ticket do principal"), nota: "o payload não expõe ticket do principal" },
    { chave: "tmbVendas", valor: 4, unidade: "contagem", classe: "volume", mapeamento: "tmb.vendas", origem: o("Vendas TMB (valor excluído) — vendas") },
    { chave: "tmbValor", valor: 18_000, unidade: "BRL", classe: "dinheiro", mapeamento: "tmb.valorExcluido", origem: o("Vendas TMB (valor excluído) — valor") },
    { chave: "investimentoCaptacao", valor: 125692.71, unidade: "BRL", classe: "custo", mapeamento: "investimentoCaptacao", origem: o("Investimento captação (+13%)") },
    { chave: "investimentoTotal", valor: 146151.39, unidade: "BRL", classe: "custo", mapeamento: "investimentoTotal", origem: o("Investimento total (+13%)") },
    { chave: "impressoesCaptacao", valor: 2_397_701, unidade: "contagem", classe: "volume", mapeamento: "impressoesCaptacao", origem: o("Impressões captação") },
    { chave: "linkClicksCaptacao", valor: 35_882, unidade: "contagem", classe: "volume", mapeamento: "linkClicksCaptacao", origem: o("Link clicks captação") },
    { chave: "cpmCaptacao", valor: 52.42, unidade: "BRL", classe: "custo", mapeamento: "cpmCaptacao", origem: o("CPM captação") },
    { chave: "pctCompradoresPorCliques", valor: 5.14, unidade: "pct", classe: "taxa-de-volume", mapeamento: "pctCompradoresPorCliques", casas: 2, origem: o("% Compradores/Cliques") },
    { chave: "conversaoIngressoPrincipal", valor: 3.79, unidade: "pct", classe: "taxa-de-volume", mapeamento: "conversaoIngressoPrincipal", casas: 2, origem: o("Captação→Principal") },
    { chave: "roasCaptacao", valor: 1.81, unidade: "razao", classe: "razao-de-custo", mapeamento: "roasCaptacao", casas: 2, origem: o("ROAS captação (a)"), nota: "o (a) do §8 é o (b) da task 07: captação = ingresso + combo + order bump" },
    { chave: "roasTotal", valor: 3.54, unidade: "razao", classe: "razao-de-custo", mapeamento: "roasTotalSemTmb", casas: 2, origem: o("ROAS captação+principal (b)"), nota: "decisão 5: o ROAS total inclui o downsell; PG01/PG02 não fecham sem ele (R4)" },
    { chave: "roasSoIngresso", valor: 0.56, unidade: "razao", classe: "razao-de-custo", mapeamento: "roasSoIngresso", casas: 2, origem: o("ROAS só ingresso base (sem tier superior)") },
    { chave: "faixaAB", valor: 176, unidade: "contagem", classe: "volume", mapeamento: "faixa.volumeAB", origem: o("Faixa A+B (pesquisa inteira) — volume") },
    { chave: "faixaABpct", valor: 13.8, unidade: "pct", classe: "taxa-de-volume", mapeamento: "faixa.pctAB", casas: 1, origem: o("Faixa A+B (pesquisa inteira) — %") },
    { chave: "faixaD", valor: 745, unidade: "contagem", classe: "volume", mapeamento: "faixa.volumeD", origem: o("Faixa D (pesquisa inteira)") },
    { chave: "closerPrincipal", valor: 22, unidade: "contagem", classe: "volume", mapeamento: "fechamento.closer.vendas", origem: o("Closer no principal"), nota: "eixo de fechamento (decisão 3)" },
    { chave: "semTrackReal", valor: 10, unidade: "contagem", classe: "volume", mapeamento: "canal.semTrackReal.vendas", origem: o("Sem-track real (recalculado)"), nota: "R2-5: Sem track real é separado de Aquisição não rastreada (só closer)" },
    { chave: "vendasPrincipalOrigemPaga", valor: 13, unidade: "contagem", classe: "volume", mapeamento: "vendasPrincipalOrigemPaga", origem: o("Vendas do principal com origem PAGA — vendas") },
    { chave: "pctVendasPrincipalOrigemPaga", valor: 18.6, unidade: "pct", classe: "taxa-de-volume", mapeamento: "pctVendasPrincipalOrigemPaga", casas: 1, origem: o("Vendas do principal com origem PAGA — %") },
    { chave: "pesquisaAntesDaDedup", valor: 1281, unidade: "contagem", classe: "volume", mapeamento: "pesquisa.linhasComRespondente", origem: o("Pesquisa dedup (antes)") },
    { chave: "pesquisaRespondentes", valor: 1272, unidade: "contagem", classe: "volume", mapeamento: "pesquisa.respondentes", origem: o("Pesquisa dedup (depois)") },
    { chave: "crossLaunchCaptacao", valor: 5.8, unidade: "pct", classe: "taxa-de-volume", mapeamento: "crossLaunch.jaEmBaseAnterior.captacao", casas: 1, origem: o("Cross-launch (captação do destino) — % (PG01→PG02)") },
    { chave: "crossLaunchCaptacaoN", valor: 107, unidade: "contagem", classe: "volume", mapeamento: "crossLaunch.jaEmBaseAnterior.captacao.n", origem: o("Cross-launch (captação do destino) — pessoas (PG01→PG02)") },
    { chave: "jaEmBaseAnteriorPrincipal", valor: 15.7, unidade: "pct", classe: "taxa-de-volume", mapeamento: "crossLaunch.jaEmBaseAnterior.principal", casas: 1, origem: o("Já em base anterior (principal)") },
  ],
  divergenciasClassificadas: [
    {
      chave: "closerPrincipal",
      causa: "definicao",
      nota: "INFO-001 (gate 49.3): closer no principal 56 no Loyola × 22 na skill — divergência de definição do eixo de fechamento (decisão 3), não falha",
      classificadaPor: "QA Quinn (INFO-001, gate da 49.3) — registrada pelo dev Dex na 49.5",
      data: "2026-10-02",
    },
    {
      chave: "roasSoIngresso",
      causa: "definicao",
      nota: "INFO-001 (gate 49.3): Gravação classificada como order_bump no Loyola (R2-1) — ROAS só ingresso 0,46 no Loyola × 0,56 na skill; divergência de definição, não falha",
      classificadaPor: "QA Quinn (INFO-001, gate da 49.3) — registrada pelo dev Dex na 49.5",
      data: "2026-10-02",
    },
  ],
};

export default fixture;
