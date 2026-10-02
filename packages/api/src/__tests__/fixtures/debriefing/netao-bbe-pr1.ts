/**
 * Story 49.5 — fixture de COMPARAÇÃO (decisão 1 do dono: nunca bloqueia;
 * decisão 2: o Netão entra desde o dia 1). BBE-PR1, D0 28/03/2026 (depois do
 * corte do gross-up — K vale). Números do §8 do perfil `netao.md` da skill
 * `loyola-debriefing`. Só números (LGPD).
 *
 * Custo fora da mídia (custos fixos do evento, lucro, margem, "recebido",
 * contratado) entra como SEM_CAMPO_EQUIVALENTE — fora da comparação.
 */

import type { FixtureDeDebriefing } from "../../../services/debriefing-fixture-compare.js";

const o = (rotulo: string) => `squads/loyola-debriefing/data/expert-profiles/netao.md §8 item '${rotulo}'`;
const EVENTO = "valor do evento presencial fora da mídia e das planilhas de venda — sem campo no payload";

export const fixture: FixtureDeDebriefing = {
  id: "netao-bbe-pr1-skill",
  expert: "netao",
  lancamento: "BBE-PR1",
  oraculo: {
    id: "skill-export-cru",
    papel: "comparacao",
    fonte: "skill loyola-debriefing — debriefing BBE-PR1 (Kiwify + MemberKit + Stract)",
    janela: { de: "2026-03-28", ate: "2026-07-06" },
    reconferidoEm: "sem data no perfil (§8 pós Fase 2)",
  },
  fatorImpostoDaFonte: 1.13,
  metricas: [
    { chave: "vendasPrincipal", valor: 10, unidade: "contagem", classe: "volume", mapeamento: "vendasPrincipal", origem: o("Principal Margem 3x") },
    { chave: "closerPrincipal", valor: 10, unidade: "contagem", classe: "volume", mapeamento: "fechamento.closer.vendas", origem: o("Fechamento (eixo separado): 100% closer"), nota: "eixo de fechamento (decisão 3)" },
    { chave: "semTrackRealPrincipal", valor: 6, unidade: "contagem", classe: "volume", mapeamento: "canal.semTrackReal.vendas", origem: o("Principal por aquisição do lead (lente refinada adotada)"), nota: "comprador só com sellerName = Sem track real + closer (R2-5, leitura literal)" },
    { chave: "contratadoPrincipal", valor: 300000, unidade: "BRL", classe: "dinheiro", mapeamento: "SEM_CAMPO_EQUIVALENTE", origem: o("Principal Margem 3x"), nota: EVENTO },
    { chave: "recebidoPrincipal", valor: 160000.01, unidade: "BRL", classe: "dinheiro", mapeamento: "SEM_CAMPO_EQUIVALENTE", origem: o("Principal Margem 3x"), nota: EVENTO },
    { chave: "ingressosVendas", valor: 25, unidade: "contagem", classe: "volume", mapeamento: "vendasCaptacao", origem: o("Ingressos Kiwify") },
    { chave: "ingressosFaturamento", valor: 84031.62, unidade: "BRL", classe: "dinheiro", mapeamento: "faturamentoCaptacao", origem: o("Ingressos Kiwify") },
    { chave: "ticketIngresso", valor: 3361.26, unidade: "BRL", classe: "dinheiro", mapeamento: "ticketCaptacao", origem: o("Funil de 3 estágios — Ingressos") },
    { chave: "investimentoBruto", valor: 26444.93, unidade: "BRL", classe: "dinheiro", mapeamento: "investimentoTotalBruto", origem: o("Mídia (Fase 3)"), nota: "spend cru — o imposto não o afeta" },
    { chave: "investimentoComImposto", valor: 29882.77, unidade: "BRL", classe: "custo", mapeamento: "investimentoTotal", origem: o("Mídia (Fase 3)") },
    { chave: "impressoes", valor: 1677315, unidade: "contagem", classe: "volume", mapeamento: "impressoesTotal", origem: o("Mídia (Fase 3)") },
    { chave: "linkClicks", valor: 24581, unidade: "contagem", classe: "volume", mapeamento: "linkClicksTotal", origem: o("Mídia (Fase 3)") },
    { chave: "ctr", valor: 1.47, unidade: "pct", classe: "taxa-de-volume", mapeamento: "ctrTotal", casas: 2, origem: o("Mídia (Fase 3)") },
    { chave: "shareQuente", valor: 96.08, unidade: "pct", classe: "taxa-de-volume", mapeamento: "shareQuenteTotal", casas: 2, origem: o("Mídia (Fase 3)") },
    { chave: "captacaoLeadBruto", valor: 4469, unidade: "BRL", classe: "dinheiro", mapeamento: "SEM_CAMPO_EQUIVALENTE", origem: o("Mídia (Fase 3)"), nota: "split por tipo de campanha da skill (lead × venda de ingresso), não por etapa" },
    { chave: "instagramOrganicoIngressos", valor: 10, unidade: "contagem", classe: "volume", mapeamento: "canal.instagramOrganico.ingressos", origem: o("Ingressos por aquisição (UTM Kiwify)") },
    { chave: "pagoQuenteIngressos", valor: 5, unidade: "contagem", classe: "volume", mapeamento: "canal.pagoQuente.ingressos", origem: o("Ingressos por aquisição (UTM Kiwify)") },
    { chave: "semTrackIngressos", valor: 4, unidade: "contagem", classe: "volume", mapeamento: "canal.semTrackReal.ingressos", origem: o("Ingressos por aquisição (UTM Kiwify)") },
    { chave: "whatsappIngressos", valor: 3, unidade: "contagem", classe: "volume", mapeamento: "canal.whatsapp.ingressos", origem: o("Ingressos por aquisição (UTM Kiwify)") },
    { chave: "outrosOrganicosIngressos", valor: 3, unidade: "contagem", classe: "volume", mapeamento: "canal.outrosOrganicos.ingressos", origem: o("Ingressos por aquisição (UTM Kiwify)") },
    { chave: "roasIngressoCaptacaoMaisVenda", valor: 2.81, unidade: "razao", classe: "razao-de-custo", mapeamento: "roasCaptacao", casas: 2, origem: o("RESULTADO (Fase 7) — ROAS ingresso (÷ captação+venda)"), nota: "sem order bump: captação = ingresso" },
    { chave: "roasTotalCheio", valor: 12.85, unidade: "razao", classe: "razao-de-custo", mapeamento: "SEM_CAMPO_EQUIVALENTE", casas: 2, origem: o("RESULTADO (Fase 7) — ROAS total (cheio)"), nota: EVENTO },
    { chave: "custosFixosEventoMaisMidia", valor: 220192.91, unidade: "BRL", classe: "custo", mapeamento: "SEM_CAMPO_EQUIVALENTE", origem: o("RESULTADO (Fase 7) — custos fixos evento+mídia"), nota: EVENTO },
    { chave: "lucroLiquidoCheio", valor: 163838.71, unidade: "BRL", classe: "dinheiro", mapeamento: "SEM_CAMPO_EQUIVALENTE", origem: o("RESULTADO (Fase 7) — lucro líquido cheio"), nota: EVENTO },
  ],
};

export default fixture;
