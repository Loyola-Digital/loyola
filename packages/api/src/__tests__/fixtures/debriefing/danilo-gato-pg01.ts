/**
 * Story 49.5 — fixture de COMPARAÇÃO (decisão 1 do dono: nunca bloqueia).
 * DG-PG01: números do §8 do perfil `danilo-gato.md` da skill `loyola-debriefing`
 * (reconferido em 28/08/2026). Só números — sem e-mail, telefone ou nome (LGPD).
 */

import type { FixtureDeDebriefing } from "../../../services/debriefing-fixture-compare.js";

const o = (rotulo: string) => `squads/loyola-debriefing/data/expert-profiles/danilo-gato.md §8 coluna PG01 linha '${rotulo}'`;

export const fixture: FixtureDeDebriefing = {
  id: "dg-pg01-skill",
  expert: "danilo-gato",
  lancamento: "DG-PG01",
  oraculo: {
    id: "skill-export-cru",
    papel: "comparacao",
    fonte: "skill loyola-debriefing — Hotmart/n8n (PG01)",
    janela: { de: "2026-01-19", ate: "2026-03-10" },
    reconferidoEm: "2026-08-28",
  },
  fatorImpostoDaFonte: 1.13,
  metricas: [
    { chave: "leadsOficial", valor: 1174, unidade: "contagem", classe: "volume", mapeamento: "SEM_CAMPO_EQUIVALENTE", origem: o("# Leads (Debriefing / oficial do resumo)"), nota: "o Loyola não tem o # Leads oficial do debriefing diário (lacuna LEADS_DO_PAINEL)" },
    { chave: "compradoresCaptacaoEmailOuTelefone", valor: 1149, unidade: "contagem", classe: "volume", mapeamento: "compradoresUnicos.porEmailOuTelefone", origem: o("Compradores de captação (dedup e-mail OU telefone)") },
    { chave: "compradoresUnicosEmail", valor: 1153, unidade: "contagem", classe: "volume", mapeamento: "compradoresUnicos.porEmail", origem: o("Compradores únicos (arquivo, dedup só e-mail)") },
    { chave: "faturamentoCaptacao", valor: 73567.59, unidade: "BRL", classe: "dinheiro", mapeamento: "faturamentoCaptacao", origem: o("Faturamento captação") },
    { chave: "ticketCaptacao", valor: 64.03, unidade: "BRL", classe: "dinheiro", mapeamento: "ticketCaptacao", origem: o("Ticket médio captação") },
    { chave: "pctComTierSuperior", valor: 29.4, unidade: "pct", classe: "taxa-de-volume", mapeamento: "pctComTierSuperior", casas: 1, origem: o("% com tier superior (combo/gravação ∪ bump)") },
    { chave: "comboLinhas", valor: 340, unidade: "contagem", classe: "volume", mapeamento: "vendasCaptacao.combo", origem: o("Combo — linhas / receita (linhas)") },
    { chave: "comboReceita", valor: 44648.68, unidade: "BRL", classe: "dinheiro", mapeamento: "faturamentoCombo", origem: o("Combo — linhas / receita (receita)") },
    { chave: "vendasPrincipal", valor: 74, unidade: "contagem", classe: "volume", mapeamento: "vendasPrincipal", origem: o("Vendas principal (oficial)") },
    { chave: "faturamentoPrincipal", valor: 215_300, unidade: "BRL", classe: "dinheiro", mapeamento: "faturamentoPrincipal", origem: o("Faturamento principal (s/ TMB)") },
    { chave: "ticketPrincipal", valor: 2909, unidade: "BRL", classe: "dinheiro", mapeamento: "SEM_CAMPO_EQUIVALENTE", origem: o("Ticket do principal"), nota: "o payload não expõe ticket do principal" },
    { chave: "tmbVendas", valor: 14, unidade: "contagem", classe: "volume", mapeamento: "tmb.vendas", origem: o("Vendas TMB (valor excluído) — vendas") },
    { chave: "tmbValor", valor: 50_000, unidade: "BRL", classe: "dinheiro", mapeamento: "tmb.valorExcluido", origem: o("Vendas TMB (valor excluído) — valor") },
    { chave: "investimentoCaptacao", valor: 42334.98, unidade: "BRL", classe: "custo", mapeamento: "investimentoCaptacao", origem: o("Investimento captação (+13%)") },
    { chave: "investimentoTotal", valor: 47892.02, unidade: "BRL", classe: "custo", mapeamento: "investimentoTotal", origem: o("Investimento total (+13%)") },
    { chave: "impressoesCaptacao", valor: 850_264, unidade: "contagem", classe: "volume", mapeamento: "impressoesCaptacao", origem: o("Impressões captação") },
    { chave: "linkClicksCaptacao", valor: 13_808, unidade: "contagem", classe: "volume", mapeamento: "linkClicksCaptacao", origem: o("Link clicks captação") },
    { chave: "cpmCaptacao", valor: 49.79, unidade: "BRL", classe: "custo", mapeamento: "cpmCaptacao", origem: o("CPM captação") },
    { chave: "pctCompradoresPorCliques", valor: 8.32, unidade: "pct", classe: "taxa-de-volume", mapeamento: "pctCompradoresPorCliques", casas: 2, origem: o("% Compradores/Cliques") },
    { chave: "conversaoIngressoPrincipal", valor: 6.44, unidade: "pct", classe: "taxa-de-volume", mapeamento: "conversaoIngressoPrincipal", casas: 2, origem: o("Captação→Principal") },
    { chave: "roasCaptacao", valor: 1.74, unidade: "razao", classe: "razao-de-custo", mapeamento: "roasCaptacao", casas: 2, origem: o("ROAS captação (a)"), nota: "o (a) do §8 é o (b) da task 07: captação = ingresso + combo + order bump" },
    { chave: "roasTotal", valor: 6.38, unidade: "razao", classe: "razao-de-custo", mapeamento: "roasTotalSemTmb", casas: 2, origem: o("ROAS captação+principal (b)"), nota: "decisão 5: o ROAS total inclui o downsell; PG01/PG02 não fecham sem ele (R4)" },
    { chave: "roasSoIngresso", valor: 0.68, unidade: "razao", classe: "razao-de-custo", mapeamento: "roasSoIngresso", casas: 2, origem: o("ROAS só ingresso base (sem tier superior)") },
    { chave: "faixaAB", valor: 187, unidade: "contagem", classe: "volume", mapeamento: "faixa.volumeAB", origem: o("Faixa A+B (pesquisa inteira) — volume") },
    { chave: "faixaABpct", valor: 46.5, unidade: "pct", classe: "taxa-de-volume", mapeamento: "faixa.pctAB", casas: 1, origem: o("Faixa A+B (pesquisa inteira) — %") },
    { chave: "faixaD", valor: 68, unidade: "contagem", classe: "volume", mapeamento: "faixa.volumeD", origem: o("Faixa D (pesquisa inteira)") },
    { chave: "closerPrincipal", valor: 0, unidade: "contagem", classe: "volume", mapeamento: "fechamento.closer.vendas", origem: o("Closer no principal"), nota: "eixo de fechamento (decisão 3)" },
    { chave: "semTrackReal", valor: 18, unidade: "contagem", classe: "volume", mapeamento: "canal.semTrackReal.vendas", origem: o("Sem-track real (recalculado)"), nota: "R2-5: Sem track real é separado de Aquisição não rastreada (só closer)" },
    { chave: "vendasPrincipalOrigemPaga", valor: 14, unidade: "contagem", classe: "volume", mapeamento: "vendasPrincipalOrigemPaga", origem: o("Vendas do principal com origem PAGA — vendas") },
    { chave: "pctVendasPrincipalOrigemPaga", valor: 18.9, unidade: "pct", classe: "taxa-de-volume", mapeamento: "pctVendasPrincipalOrigemPaga", casas: 1, origem: o("Vendas do principal com origem PAGA — %") },
    { chave: "pesquisaAntesDaDedup", valor: 1946, unidade: "contagem", classe: "volume", mapeamento: "pesquisa.linhasComRespondente", origem: o("Pesquisa dedup (antes)") },
    { chave: "pesquisaRespondentes", valor: 402, unidade: "contagem", classe: "volume", mapeamento: "pesquisa.respondentes", origem: o("Pesquisa dedup (depois)") },
  ],
};

export default fixture;
