/**
 * Story 49.5 — fixture GOVERNANTE do DG-PG02 (decisão 1 do dono: o número do
 * Loyola manda). Valores da seção "Correção 41.10" de
 * `docs/specs/epic-41-valores-conferencia.md` (tabela AC4, janela 17/04–11/05,
 * o oráculo declarado pela 41.10 AC5(g)) + o principal e o downsell medidos
 * pelo Motor I da 49.3 em produção (somente leitura). K = 1.
 *
 * ⚠️ 41.12 fatia A (R5-1): enquanto o Resumão não tiver a camada 2 `(e-mail,
 * produto)`, as linhas de vendas e faturamento da captação divergem do
 * Debriefing em 9 linhas / R$ 596,30 — classificadas `definicao` abaixo. Quando
 * a fatia A entrar na `main`, esta fixture passa aos valores da "Correção 41.12"
 * (2.188 / 1.892 / 296 / R$ 230.501,64 = 198.239,10 + 32.262,54), o mapeamento
 * "vendas" passa a ser `dedup.camada2.depois` e as classificações `definicao`
 * saem (41.12 AC12) — divergência restante vira `bug` ou `fonte-janela`.
 */

import type { FixtureDeDebriefing } from "../../../services/debriefing-fixture-compare.js";

const SPEC = "docs/specs/epic-41-valores-conferencia.md §Correção 41.10 (b) tabela 'Dedup + regra R2-1' linha 17/04–11/05";
const o = (coluna: string) => `${SPEC} coluna '${coluna}'`;
const MEDIDO = (rotulo: string) =>
  `docs/stories/49.3.debriefing-money-time-engine.md §Conferência em produção (somente leitura) linha '${rotulo}'`;
const CAMADA2 =
  "camada 2 (e-mail, produto) só no Debriefing até a 41.12 fatia A — 9 recompras do mesmo produto pelo mesmo e-mail, R$ 596,30 (docs/stories/41.12, R5-1); decisão 1A do dono";
const classificada = (chave: string) => ({
  chave,
  causa: "definicao" as const,
  nota: CAMADA2,
  classificadaPor: "dono (decisão 1A, 2026-10-02; R5-1) — registrada pelo dev Dex na 49.5",
  data: "2026-10-02",
});

export const fixture: FixtureDeDebriefing = {
  id: "dg-pg02-loyola",
  expert: "danilo-gato",
  lancamento: "DG-PG02",
  oraculo: {
    id: "loyola-epic41",
    papel: "governante",
    fonte: "Loyola — planilha n8n de produção pelo código do loader (Correção 41.10) + Motor I da 49.3",
    janela: { de: "2026-04-17", ate: "2026-05-11" },
    reconferidoEm: "2026-10-01",
  },
  fatorImpostoDaFonte: "loyola",
  datasChave: {
    inicioCaptacao: "2026-04-16",
    aberturaCarrinho: "2026-05-09",
    fimCarrinho: "2026-05-27",
    downsell: { abertura: "2026-06-03", fim: "2026-06-13" },
  },
  metricas: [
    { chave: "vendas", valor: 2197, unidade: "contagem", classe: "volume", mapeamento: "vendasCaptacao", origem: o("vendas"), nota: "Resumão: depois da camada 1; o payload: depois das camadas 1 e 2" },
    { chave: "vendasCaptacao", valor: 1900, unidade: "contagem", classe: "volume", mapeamento: "vendasCaptacao.ingressoMaisCombo", origem: o("captação") },
    { chave: "vendasOrderBump", valor: 297, unidade: "contagem", classe: "volume", mapeamento: "vendasCaptacao.orderBump", origem: o("order bump") },
    { chave: "ingressosUnicos", valor: 1807, unidade: "contagem", classe: "volume", mapeamento: "ingressosUnicos", origem: o("ingressos únicos") },
    { chave: "faturamentoTotal", valor: 231097.94, unidade: "BRL", classe: "dinheiro", mapeamento: "faturamentoCaptacao", origem: o("faturamento total") },
    { chave: "faturamentoCaptacao", valor: 198736.4, unidade: "BRL", classe: "dinheiro", mapeamento: "faturamentoIngressoMaisCombo", origem: o("captação (R$)") },
    { chave: "faturamentoOrderBump", valor: 32361.54, unidade: "BRL", classe: "dinheiro", mapeamento: "faturamentoOrderBump", origem: o("order bump (R$)") },
    {
      chave: "investimentoCaptacao",
      valor: 126566.14,
      unidade: "BRL",
      classe: "custo",
      mapeamento: "investimentoCaptacao",
      origem: "docs/specs/epic-41-valores-conferencia.md §DG-PG02-ABR26 linha 'investimento c/ imposto' (a 41.10 não o altera)",
    },
    { chave: "vendasPrincipal", valor: 71, unidade: "contagem", classe: "volume", mapeamento: "vendasPrincipal", origem: MEDIDO("Captação / principal") },
    { chave: "faturamentoPrincipal", valor: 245800, unidade: "BRL", classe: "dinheiro", mapeamento: "faturamentoPrincipal", origem: MEDIDO("Faturamento do principal s/ TMB") },
    { chave: "faturamentoDownsell", valor: 20714.4, unidade: "BRL", classe: "dinheiro", mapeamento: "faturamentoDownsell", origem: MEDIDO("Faturamento do downsell") },
  ],
  divergenciasClassificadas: [
    classificada("vendas"),
    classificada("vendasCaptacao"),
    classificada("vendasOrderBump"),
    classificada("faturamentoTotal"),
    classificada("faturamentoCaptacao"),
    classificada("faturamentoOrderBump"),
    {
      chave: "investimentoCaptacao",
      causa: "fonte-janela",
      nota:
        "drift de reprocessamento dos dados da Meta: o payload lê R$ 126.616,38 contra R$ 126.566,14 da spec (+R$ 50,24 / +0,04%), " +
        "a mesma diferença já registrada na story 41.2 (docs/specs/epic-41-valores-conferencia.md §As duas diferenças que sobraram, item 1) — " +
        "a Meta reprocessou o spend depois da conferência; abaixo do limiar de alerta de 0,05% e do de bloqueio de 0,5%",
      classificadaPor: "coordenador (decisão de 2026-10-02, QA loop iteração 1 / REQ-001) — registrada pelo dev Dex na 49.5",
      data: "2026-10-02",
    },
  ],
};

export default fixture;
