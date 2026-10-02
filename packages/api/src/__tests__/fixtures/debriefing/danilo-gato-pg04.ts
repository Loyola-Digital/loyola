/**
 * Story 49.5 — fixture de COMPARAÇÃO (decisão 1 do dono: nunca bloqueia).
 * DG-PG04: números do §8 do perfil `danilo-gato.md` da skill `loyola-debriefing`
 * (reconferido em 28/08/2026). Só números — sem e-mail, telefone ou nome (LGPD).
 */

import type { FixtureDeDebriefing } from "../../../services/debriefing-fixture-compare.js";

const o = (rotulo: string) => `squads/loyola-debriefing/data/expert-profiles/danilo-gato.md §8 coluna PG04 linha '${rotulo}'`;

export const fixture: FixtureDeDebriefing = {
  id: "dg-pg04-skill",
  expert: "danilo-gato",
  lancamento: "DG-PG04",
  oraculo: {
    id: "skill-export-cru",
    papel: "comparacao",
    fonte: "skill loyola-debriefing — export cru da Kiwify (PG04)",
    janela: { de: "2026-07-09", ate: "2026-08-19" },
    reconferidoEm: "2026-08-28",
  },
  fatorImpostoDaFonte: 1.13,
  metricas: [
    { chave: "compradoresCaptacaoEmailOuTelefone", valor: 1103, unidade: "contagem", classe: "volume", mapeamento: "compradoresUnicos.porEmailOuTelefone", origem: o("Compradores de captação (dedup e-mail OU telefone)") },
    { chave: "faturamentoCaptacao", valor: 126008.6, unidade: "BRL", classe: "dinheiro", mapeamento: "faturamentoCaptacao", origem: o("Faturamento captação") },
    { chave: "captacaoPagaKiwify", valor: 130655.5, unidade: "BRL", classe: "dinheiro", mapeamento: "SEM_CAMPO_EQUIVALENTE", origem: o("Captação PAGA (Kiwify, exclui backend/downsell)"), nota: "definição da skill sem campo no payload" },
    { chave: "faturamentoTotalKiwify", valor: 331728.3, unidade: "BRL", classe: "dinheiro", mapeamento: "SEM_CAMPO_EQUIVALENTE", origem: o("Faturamento total Kiwify (`Preço base do produto`, paid)"), nota: "soma do export cru inteiro — sem campo no payload" },
    { chave: "ticketCaptacao", valor: 114.24, unidade: "BRL", classe: "dinheiro", mapeamento: "ticketCaptacao", origem: o("Ticket médio captação") },
    { chave: "pctComTierSuperior", valor: 32.9, unidade: "pct", classe: "taxa-de-volume", mapeamento: "pctComTierSuperior", casas: 1, origem: o("% com tier superior (combo/gravação ∪ bump)") },
    { chave: "comboLinhas", valor: 226, unidade: "contagem", classe: "volume", mapeamento: "vendasCaptacao.combo", origem: o("Combo — linhas / receita (linhas)") },
    { chave: "comboReceita", valor: 53437.9, unidade: "BRL", classe: "dinheiro", mapeamento: "faturamentoCombo", origem: o("Combo — linhas / receita (receita)") },
    { chave: "orderBumpPessoas", valor: 142, unidade: "contagem", classe: "volume", mapeamento: "comOrderBump", origem: o("Order bump — pessoas / receita (pessoas)") },
    { chave: "orderBumpReceita", valor: 26962.0, unidade: "BRL", classe: "dinheiro", mapeamento: "faturamentoOrderBump", origem: o("Order bump — pessoas / receita (receita)") },
    { chave: "vendasPrincipal", valor: 45, unidade: "contagem", classe: "volume", mapeamento: "vendasPrincipal", origem: o("Vendas principal (oficial)") },
    { chave: "faturamentoPrincipal", valor: 179_700, unidade: "BRL", classe: "dinheiro", mapeamento: "faturamentoPrincipal", origem: o("Faturamento principal (s/ TMB)") },
    { chave: "ticketPrincipal", valor: 4179, unidade: "BRL", classe: "dinheiro", mapeamento: "SEM_CAMPO_EQUIVALENTE", origem: o("Ticket do principal"), nota: "o payload não expõe ticket do principal" },
    { chave: "tmbVendas", valor: 1, unidade: "contagem", classe: "volume", mapeamento: "tmb.vendas", origem: o("Vendas TMB (valor excluído) — vendas") },
    { chave: "tmbValor", valor: 3500, unidade: "BRL", classe: "dinheiro", mapeamento: "tmb.valorExcluido", origem: o("Vendas TMB (valor excluído) — valor") },
    { chave: "investimentoCaptacao", valor: 65010.04, unidade: "BRL", classe: "custo", mapeamento: "investimentoCaptacao", origem: o("Investimento captação (+13%)") },
    { chave: "investimentoTotal", valor: 69958.26, unidade: "BRL", classe: "custo", mapeamento: "investimentoTotal", origem: o("Investimento total (+13%)") },
    { chave: "impressoesCaptacao", valor: 784_982, unidade: "contagem", classe: "volume", mapeamento: "impressoesCaptacao", origem: o("Impressões captação") },
    { chave: "linkClicksCaptacao", valor: 12_182, unidade: "contagem", classe: "volume", mapeamento: "linkClicksCaptacao", origem: o("Link clicks captação") },
    { chave: "cpmCaptacao", valor: 82.82, unidade: "BRL", classe: "custo", mapeamento: "cpmCaptacao", origem: o("CPM captação") },
    { chave: "pctCompradoresPorCliques", valor: 9.05, unidade: "pct", classe: "taxa-de-volume", mapeamento: "pctCompradoresPorCliques", casas: 2, origem: o("% Compradores/Cliques") },
    { chave: "conversaoIngressoPrincipal", valor: 4.08, unidade: "pct", classe: "taxa-de-volume", mapeamento: "conversaoIngressoPrincipal", casas: 2, origem: o("Captação→Principal") },
    { chave: "roasCaptacao", valor: 1.94, unidade: "razao", classe: "razao-de-custo", mapeamento: "roasCaptacao", casas: 2, origem: o("ROAS captação (a)"), nota: "o (a) do §8 é o (b) da task 07: captação = ingresso + combo + order bump" },
    { chave: "roasTotal", valor: 4.37, unidade: "razao", classe: "razao-de-custo", mapeamento: "roasTotalSemTmb", casas: 2, origem: o("ROAS captação+principal (b)"), nota: "decisão 5: o ROAS total inclui o downsell; PG01/PG02 não fecham sem ele (R4)" },
    { chave: "roasSoIngresso", valor: 0.71, unidade: "razao", classe: "razao-de-custo", mapeamento: "roasSoIngresso", casas: 2, origem: o("ROAS só ingresso base (sem tier superior)") },
    { chave: "faixaAB", valor: 240, unidade: "contagem", classe: "volume", mapeamento: "faixa.volumeAB", origem: o("Faixa A+B (pesquisa inteira) — volume") },
    { chave: "faixaABpct", valor: 40.7, unidade: "pct", classe: "taxa-de-volume", mapeamento: "faixa.pctAB", casas: 1, origem: o("Faixa A+B (pesquisa inteira) — %") },
    { chave: "faixaD", valor: 117, unidade: "contagem", classe: "volume", mapeamento: "faixa.volumeD", origem: o("Faixa D (pesquisa inteira)") },
    { chave: "closerPrincipal", valor: 7, unidade: "contagem", classe: "volume", mapeamento: "fechamento.closer.vendas", origem: o("Closer no principal"), nota: "eixo de fechamento (decisão 3)" },
    { chave: "semTrackReal", valor: 3, unidade: "contagem", classe: "volume", mapeamento: "canal.semTrackReal.vendas", origem: o("Sem-track real (recalculado)"), nota: "R2-5: Sem track real é separado de Aquisição não rastreada (só closer)" },
    { chave: "vendasPrincipalOrigemPaga", valor: 7, unidade: "contagem", classe: "volume", mapeamento: "vendasPrincipalOrigemPaga", origem: o("Vendas do principal com origem PAGA — vendas") },
    { chave: "pctVendasPrincipalOrigemPaga", valor: 15.6, unidade: "pct", classe: "taxa-de-volume", mapeamento: "pctVendasPrincipalOrigemPaga", casas: 1, origem: o("Vendas do principal com origem PAGA — %") },
    { chave: "pesquisaAntesDaDedup", valor: 699, unidade: "contagem", classe: "volume", mapeamento: "pesquisa.linhasComRespondente", origem: o("Pesquisa dedup (antes)") },
    { chave: "pesquisaRespondentes", valor: 601, unidade: "contagem", classe: "volume", mapeamento: "pesquisa.respondentes", origem: o("Pesquisa dedup (depois)") },
    { chave: "crossLaunchCaptacao", valor: 13.0, unidade: "pct", classe: "taxa-de-volume", mapeamento: "crossLaunch.jaEmBaseAnterior.captacao", casas: 1, origem: o("Cross-launch (captação do destino) — % (PG02→PG04)"), nota: "vale com o PG02 como lançamento de comparação principal" },
    { chave: "crossLaunchCaptacaoN", valor: 143, unidade: "contagem", classe: "volume", mapeamento: "crossLaunch.jaEmBaseAnterior.captacao.n", origem: o("Cross-launch (captação do destino) — pessoas (PG02→PG04)"), nota: "vale com o PG02 como lançamento de comparação principal" },
    { chave: "jaEmBaseAnteriorTodas", valor: 16.2, unidade: "pct", classe: "taxa-de-volume", mapeamento: "SEM_CAMPO_EQUIVALENTE", casas: 1, origem: o("Já em base anterior (captação / principal) — PG01 ∪ PG02"), nota: "união de duas bases anteriores; o payload mede só a principal" },
  ],
};

export default fixture;
