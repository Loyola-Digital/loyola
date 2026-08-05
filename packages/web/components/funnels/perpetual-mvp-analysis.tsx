"use client";

import { useCallback, useMemo, useState, useEffect } from "react";
import { AlertTriangle, Calculator, Info, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { apiErrorMessage, logApiError } from "@/lib/utils/api-error";
import { fracaoParaPP, ppParaFracao } from "@/lib/utils/percent";
import { usePerpetualSalesData } from "@/lib/hooks/use-perpetual-sales-data";
import { useTrafficOverview } from "@/lib/hooks/use-traffic-analytics";
import {
  usePerpetualReportConfig,
  useSavePerpetualReportConfig,
} from "@/lib/hooks/use-perpetual-report-config";
import {
  targetCacDeck,
  compareToTarget,
  killContinueThreshold,
  ProtocolViolation,
  type TargetCacResult,
} from "@/lib/utils/cac-protocol";
import { PerpetualChainSection, type ManualRateEntry } from "./perpetual-chain-section";
import { PerpetualRankingSection, type CeilingEntry } from "./perpetual-ranking-section";
import type { FunnelArchitecture } from "@/lib/utils/funnel-templates";
import type { EntryCostKind, ChainRate } from "@/lib/utils/cac-protocol";
import type { Funnel } from "@loyola-x/shared";

/**
 * Story 29.35 — aba "Análise MVP" do funil perpétuo.
 *
 * Aplica o `reverse_calculation` do LOYOLA-X-CAC-PROTOCOL v1: enquanto a aba
 * Meta Ads mostra o CAC REALIZADO, esta mostra o CAC MÁXIMO SUPORTÁVEL pelo
 * produto — o número contra o qual o realizado é julgado. Sem ele, "o CAC está
 * em R$ 347" é um fato sem decisão.
 *
 * O layout segue o `output_contract` do protocolo. Desta fatia saem as seções
 * 02 (dados faltantes), 05 (CAC alvo), 06 (gap) e 11 (ressalvas); as seções de
 * cadeia e ranking chegam nas stories 29.36 e 29.37.
 */

function fmtBRL(v: number | null | undefined): string {
  if (v == null) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** GR-01.e — todo número exibido carrega de onde veio. */
function StatusTag({ status }: { status: string }) {
  const tone =
    status === "DERIVED"
      ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
      : status === "MEASURED"
        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
        : "bg-muted text-muted-foreground";
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${tone}`}>
      {status}
    </span>
  );
}

interface Props {
  funnel: Funnel;
  projectId: string;
  days: number;
  customRange?: { startDate: string; endDate: string };
}

export function PerpetualMvpAnalysis({ funnel, projectId, days, customRange }: Props) {
  const { data: salesData } = usePerpetualSalesData(
    projectId,
    funnel.id,
    days,
    customRange?.startDate,
    customRange?.endDate,
  );
  // Investimento do período. Vem de `useTrafficOverview` e NÃO de uma
  // reagregação local: o dashboard já teve bug de dupla contagem no bulk
  // diário, e ter duas somas do mesmo spend em telas diferentes é convite
  // para elas divergirem.
  const campaignIds = funnel.campaigns.map((c) => c.id);
  const { data: overview } = useTrafficOverview(
    projectId,
    days,
    campaignIds.length > 0 ? campaignIds : null,
    customRange?.startDate,
    customRange?.endDate,
  );
  const {
    data: configData,
    isError: configFailed,
    error: configError,
  } = usePerpetualReportConfig(projectId, funnel.id);
  const saveConfig = useSavePerpetualReportConfig(projectId, funnel.id);

  const cfg = configData?.config ?? null;

  // Formulário local — só os três inputs que esta story introduz. Os demais
  // (imposto, taxa de plataforma) já são editados na config do relatório;
  // duplicar a edição aqui criaria duas fontes para o mesmo campo.
  const [margemPct, setMargemPct] = useState("");
  const [cmv, setCmv] = useState("");
  const [gatewayPagtoPct, setGatewayPagtoPct] = useState("");

  useEffect(() => {
    if (!cfg) return;
    // O banco guarda fração; a tela fala em pontos percentuais. A conversão
    // acontece AQUI, na borda — dentro da fórmula só circula decimal (U-01).
    setMargemPct(cfg.margemDesejadaPct != null ? fracaoParaPP(cfg.margemDesejadaPct) : "");
    setCmv(cfg.cmv != null ? String(cfg.cmv) : "");
    setGatewayPagtoPct(cfg.gatewayPctVar != null ? fracaoParaPP(cfg.gatewayPctVar) : "");
  }, [cfg]);

  const parseOrNull = (s: string): number | null => {
    const t = s.trim().replace(",", ".");
    if (t === "") return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  };

  /**
   * Ticket médio é DERIVADO, não campo. Uso `ticketMedioBruto`, que o backend
   * já calcula sobre as mesmas vendas do resto da tela — recalcular aqui
   * abriria espaço para divergir do que a aba Meta Ads mostra.
   */
  const ticket = useMemo(() => {
    if (!salesData || salesData.totalVendas <= 0) return null;
    return salesData.ticketMedioBruto;
  }, [salesData]);

  /** CAC realizado do período, para o gap da seção 06. */
  const realizedCac = useMemo(() => {
    if (!salesData || salesData.totalVendas <= 0) return null;
    const spend = overview?.totalSpend ?? null;
    return spend != null && spend > 0 ? spend / salesData.totalVendas : null;
  }, [salesData, overview]);

  const target: TargetCacResult | { error: string } = useMemo(() => {
    try {
      return targetCacDeck({
        ticket,
        // O Loyola X remove reembolso/chargeback do faturamento ex-post
        // (`isRefundBucket`), então o ticket derivado já é líquido deles. As
        // provisões vão a zero — provisionar de novo seria RC-01.
        ticketBasis: "NET_OF_REFUNDS",
        margemDesejada: cfg?.margemDesejadaPct ?? null,
        imposto: cfg?.impostoPct ?? null,
        gatewayPct: cfg?.taxaPlataformaPct ?? null,
        gatewayPctVar: cfg?.gatewayPctVar ?? null,
        cmv: cfg?.cmv ?? null,
        reembolso: 0,
        chargeback: 0,
      });
    } catch (e) {
      // Invariante do protocolo violada (U-01, RC-01...). Aborta com o motivo
      // na tela — jamais degrada para um número plausível.
      return { error: e instanceof ProtocolViolation ? e.message : String(e) };
    }
  }, [ticket, cfg]);

  const hasError = "error" in target;
  const gap = useMemo(
    () => (hasError ? null : compareToTarget(realizedCac, target.valueExact)),
    [hasError, realizedCac, target],
  );

  /**
   * Story 29.36 — taxas que o sistema JÁ mede. CTR e connect rate saem do
   * overview; o resto da cadeia depende de instrumentação que não existe e
   * entra por digitação.
   *
   * `null` quando o denominador é zero — nunca 0, que leria como "conversão
   * nula" em vez de "sem base para medir".
   */
  const measuredRates = useMemo<Record<string, number | null>>(() => {
    const imp = overview?.totalImpressions ?? 0;
    const clicks = overview?.totalLinkClicks ?? overview?.totalClicks ?? 0;
    return {
      CTR: imp > 0 && clicks > 0 ? clicks / imp : null,
      // Connect rate exige pageviews, que vêm de analytics e ainda não chegam
      // a esta tela — fica como manual até a integração existir.
      connect_rate: null,
    };
  }, [overview]);

  /**
   * Custo da entrada. CPM porque é o que o overview entrega; com CPM na
   * entrada, o CTR ENTRA na cadeia (ST-06) — que é o caso aqui.
   */
  const entryCost = useMemo<{ kind: EntryCostKind; value: number } | null>(() => {
    const imp = overview?.totalImpressions ?? 0;
    const spend = overview?.totalSpend ?? 0;
    if (!(imp > 0) || !(spend > 0)) return null;
    return { kind: "CPM", value: (spend / imp) * 1000 };
  }, [overview]);

  // Story 29.37: a cadeia publica suas taxas para o ranking operar sobre as
  // MESMAS, em vez de montar uma segunda versão que poderia divergir.
  const [chainRates, setChainRates] = useState<ChainRate[]>([]);
  const [chainCac, setChainCac] = useState<number | null>(null);
  const handleRatesChange = useCallback((r: ChainRate[], cac: number | null) => {
    setChainRates(r);
    setChainCac(cac);
  }, []);

  async function handleSaveCeilings(ceilings: Record<string, CeilingEntry>) {
    try {
      await saveConfig.mutateAsync({ ceilings });
    } catch (err) {
      logApiError("mvp:save-ceilings", err);
      toast.error(apiErrorMessage(err, "Não foi possível salvar os tetos"));
    }
  }

  async function handleSaveChain(patch: {
    funnelArchitecture?: string | null;
    chainDefectReading?: string | null;
    manualRates?: Record<string, ManualRateEntry>;
  }) {
    try {
      await saveConfig.mutateAsync(patch);
    } catch (err) {
      logApiError("mvp:save-chain", err);
      toast.error(apiErrorMessage(err, "Não foi possível salvar a cadeia"));
    }
  }

  async function handleSave() {
    const m = parseOrNull(margemPct);
    if (m != null && (m <= 0 || m > 99)) {
      toast.error("Margem desejada deve ficar entre 0 e 99%.");
      return;
    }
    // Story 29.39 — gateway em pontos percentuais na tela, fração no resto do
    // sistema. A conversão fica AQUI, na borda: dentro da fórmula só circula
    // decimal (U-01), e o backend rejeita ponto percentual pelo validador `rate`.
    const g = parseOrNull(gatewayPagtoPct);
    if (g != null && (g < 0 || g > 99)) {
      toast.error("Gateway deve ficar entre 0 e 99%.");
      return;
    }
    try {
      await saveConfig.mutateAsync({
        margemDesejadaPct: m == null ? null : ppParaFracao(m),
        cmv: parseOrNull(cmv),
        gatewayPctVar: g == null ? null : ppParaFracao(g),
      });
      toast.success("Premissas do CAC alvo salvas");
    } catch (err) {
      logApiError("mvp:save-premissas", err);
      toast.error(apiErrorMessage(err, "Não foi possível salvar as premissas"));
    }
  }

  return (
    <div className="space-y-4">
      {/* ---- Story 29.38 — falha ao CARREGAR a config.
           Sem isto, erro de carga e "funil ainda não configurado" produzem a
           mesma tela vazia, e o usuário conclui que nada foi salvo. Foi o que
           aconteceu enquanto o banco estava sem as colunas do Epic 29: a aba
           parecia funcionar e simplesmente não guardava nada. ---- */}
      {configFailed && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/5 p-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
            <div className="text-sm">
              <p className="font-medium text-red-700 dark:text-red-300">
                Não foi possível carregar a configuração deste funil
              </p>
              <p className="mt-1 text-muted-foreground">
                {apiErrorMessage(configError, "Erro desconhecido ao consultar a API.", "carregar")}
              </p>
              <p className="mt-1 text-muted-foreground">
                Os números abaixo podem estar incompletos. Salvar agora pode falhar.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ---- Seção 02 — dados faltantes. Bloqueante: se não estiver vazia,
           as seções seguintes saem PARCIAIS e isso é dito no topo. ---- */}
      {!hasError && target.missing.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600 dark:text-amber-400" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                Análise parcial — falta preencher {target.missing.length}{" "}
                {target.missing.length === 1 ? "premissa" : "premissas"}
              </p>
              <p className="text-xs text-muted-foreground">
                {target.missing.join(" · ")} — sem {target.missing.length === 1 ? "ela" : "elas"} o
                CAC alvo não é calculado. O protocolo proíbe estimar: um teto de mídia inventado é
                pior que teto nenhum.
              </p>
            </div>
          </div>
        </div>
      )}

      {hasError && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
          <p className="text-sm font-semibold text-red-600 dark:text-red-400">
            Cálculo interrompido por invariante do protocolo
          </p>
          <p className="mt-1 font-mono text-xs text-muted-foreground">{target.error}</p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ---- Premissas do produto (AC9) ---- */}
        <div className="rounded-xl border border-border/30 bg-card/60 p-5 space-y-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Calculator className="h-4 w-4" />
            Premissas do produto
          </h3>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="mvp-margem" className="text-xs">
                Margem desejada (%)
              </Label>
              <Input
                id="mvp-margem"
                inputMode="decimal"
                value={margemPct}
                onChange={(e) => setMargemPct(e.target.value)}
                placeholder="ex: 15"
                className="h-8 text-xs"
              />
              <p className="text-[11px] text-muted-foreground">
                Precisa embutir equipe, ferramentas e comissão — nenhum dos três aparece em outra
                linha da conta.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="mvp-cmv" className="text-xs">
                  CMV (R$/unidade)
                </Label>
                <Input
                  id="mvp-cmv"
                  inputMode="decimal"
                  value={cmv}
                  onChange={(e) => setCmv(e.target.value)}
                  placeholder="ex: 0"
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mvp-gwpct" className="text-xs">
                  Gateway (%)
                </Label>
                <Input
                  id="mvp-gwpct"
                  inputMode="decimal"
                  value={gatewayPagtoPct}
                  onChange={(e) => setGatewayPagtoPct(e.target.value)}
                  placeholder="ex: 2,5"
                  className="h-8 text-xs"
                />
                <p className="text-[11px] text-muted-foreground">
                  Taxa do gateway de pagamento. <strong>Soma</strong> à taxa da plataforma
                  mostrada abaixo — são custos distintos sobre o mesmo faturamento.
                </p>
              </div>
            </div>

            <Button size="sm" className="h-8 text-xs" onClick={handleSave} disabled={saveConfig.isPending}>
              {saveConfig.isPending ? "Salvando…" : "Salvar premissas"}
            </Button>
          </div>

          {/* Herdados da config do relatório — leitura, para não criar duas
              fontes editáveis para o mesmo campo. */}
          <div className="space-y-1 border-t border-border/20 pt-3 text-[11px] text-muted-foreground">
            <p className="font-medium uppercase tracking-wider">Herdado da config do relatório</p>
            <p>Imposto sobre faturamento: {cfg?.impostoPct != null ? `${(cfg.impostoPct * 100).toFixed(2)}%` : "—"}</p>
            <p>Gateway da plataforma: {cfg?.taxaPlataformaPct != null ? `${(cfg.taxaPlataformaPct * 100).toFixed(2)}%` : "—"}</p>
            <p>Ticket médio (derivado): {fmtBRL(ticket)}</p>
          </div>
        </div>

        {/* ---- Seção 05 — CAC alvo, com o memorial linha a linha ---- */}
        <div className="rounded-xl border border-border/30 bg-card/60 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Target className="h-4 w-4" />
              CAC alvo
            </h3>
            {!hasError && <StatusTag status={target.status} />}
          </div>

          <p className="text-2xl font-semibold tabular-nums">
            {hasError ? "—" : fmtBRL(target.value)}
          </p>

          {!hasError && target.lines.length > 0 && (
            <table className="w-full text-xs">
              <tbody>
                {target.lines.map((l) => (
                  <tr key={l.label} className="border-b border-border/10 last:border-0">
                    <td className="py-1 text-muted-foreground">{l.label}</td>
                    <td className="py-1 text-right tabular-nums">{fmtBRL(l.value)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-border/30 font-semibold">
                  <td className="py-1.5">= CAC alvo</td>
                  <td className="py-1.5 text-right tabular-nums">{fmtBRL(target.value)}</td>
                </tr>
              </tbody>
            </table>
          )}

          {!hasError && (
            <div className="flex items-start gap-2 rounded-lg bg-muted/40 p-2.5">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {target.caveats[0]}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ---- Seção 06 — gap: realizado × alvo ---- */}
      <div className="rounded-xl border border-border/30 bg-card/60 p-5 space-y-3">
        <h3 className="text-sm font-semibold">CAC realizado × alvo</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Realizado</p>
            <p className="text-lg font-semibold tabular-nums">{fmtBRL(realizedCac)}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Alvo</p>
            <p className="text-lg font-semibold tabular-nums">
              {hasError ? "—" : fmtBRL(target.value)}
            </p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Limite kill/continue (1,3×)
            </p>
            <p className="text-lg font-semibold tabular-nums">
              {hasError ? "—" : fmtBRL(killContinueThreshold(target.valueExact))}
            </p>
          </div>
        </div>

        {gap && (
          <div
            className={`rounded-lg p-3 text-xs ${
              gap.verdict === "ESCALAR"
                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                : gap.verdict === "ZONA_DE_TOLERANCIA"
                  ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                  : gap.verdict === "PAUSAR"
                    ? "bg-red-500/10 text-red-700 dark:text-red-400"
                    : "bg-muted text-muted-foreground"
            }`}
          >
            <span className="font-semibold">{gap.verdict.replace(/_/g, " ")}</span>
            {gap.deltaPct != null && (
              <span className="tabular-nums">
                {" "}· {gap.deltaPct > 0 ? "+" : ""}
                {gap.deltaPct.toFixed(1)}% vs alvo
              </span>
            )}
            <span> — {gap.note}</span>
          </div>
        )}

        {/* MTAX-04: as duas pontas já estão na mesma base. Dizer isso evita que
            alguém "corrija" somando imposto de mídia ao alvo. */}
        <p className="text-[11px] text-muted-foreground">
          As duas pontas estão na mesma base (caixa): o realizado já carrega o gross-up de 12,15% e
          o alvo já é teto de mídia. Não existe linha de imposto sobre mídia no alvo — seria dupla
          contagem.
        </p>
      </div>

      {/* ---- Story 29.36 — seções 01, 03 e 04: arquitetura, cadeia e CAC
           decomposto. Vive abaixo do gap porque responde a pergunta seguinte:
           sabendo que o CAC estourou, ONDE ele estourou. ---- */}
      <PerpetualChainSection
        architecture={(cfg?.funnelArchitecture as FunnelArchitecture | null) ?? null}
        chainDefectReading={cfg?.chainDefectReading ?? null}
        manualRates={cfg?.manualRates ?? {}}
        measuredRates={measuredRates}
        periodStart={customRange?.startDate ?? null}
        periodEnd={customRange?.endDate ?? null}
        entryCost={entryCost}
        onSave={handleSaveChain}
        onRatesChange={handleRatesChange}
        saving={saveConfig.isPending}
      />

      {/* ---- Story 29.37 — seções 07 a 10: teto, ranking, ação e projeção.
           Fecha a sequência: quanto pode pagar (05), onde estoura (04), por
           onde começar (08). ---- */}
      <PerpetualRankingSection
        rates={chainRates}
        ceilings={cfg?.ceilings ?? {}}
        entryCostValue={entryCost?.value ?? null}
        currentCac={chainCac}
        funnelValidado={cfg?.validado ?? false}
        onSave={handleSaveCeilings}
        saving={saveConfig.isPending}
      />

      {/* ---- Seção 11 — ressalvas desta análise ---- */}
      <div className="rounded-xl border border-border/30 bg-card/60 p-5 space-y-2">
        <h3 className="text-sm font-semibold">Ressalvas</h3>
        <ul className="list-disc space-y-1 pl-4 text-[11px] text-muted-foreground">
          <li>
            Modelo <strong>M-DECK</strong>, o da fonte. O modelo de unidade econômica (M-EXACT)
            exige quatro declarações contratuais que ainda não temos — se o gateway devolve taxa no
            estorno, se o CMV é recuperado, se o imposto incide sobre receita líquida e se a margem
            é sobre bruto ou líquido.
          </li>
          <li>
            A <strong>Margem</strong> da aba Meta Ads tem escopo diferente do usado aqui: lá é
            margem de contribuição (deduz taxa da plataforma e investimento); o CAC alvo deduz
            também imposto sobre faturamento e CMV. Os dois números não se comparam diretamente.
          </li>
          <li>
            Reembolso e chargeback não entram como provisão porque já saem do faturamento quando
            acontecem — provisionar de novo seria deduzir a mesma perda duas vezes.
          </li>
        </ul>
      </div>
    </div>
  );
}
