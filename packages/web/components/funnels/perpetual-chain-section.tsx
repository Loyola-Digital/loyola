"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, GitBranch, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  FUNNEL_TEMPLATES,
  STAGE_MEASUREMENT_WARNINGS,
  getTemplate,
  type FunnelArchitecture,
} from "@/lib/utils/funnel-templates";
import {
  decomposeCac,
  runSanityTests,
  ProtocolViolation,
  type ChainRate,
  type EntryCostKind,
} from "@/lib/utils/cac-protocol";

/**
 * Story 29.36 — cadeia de conversão da aba Análise MVP.
 *
 * Enquanto o CAC alvo (29.35) diz quanto se PODE pagar, a cadeia diz ONDE o
 * CAC está estourando. `CAC = custo_da_entrada ÷ ∏(taxas)` — decomposto termo
 * a termo, porque só a versão aberta mostra qual etapa é o gargalo.
 *
 * Cobre as seções 01 (integridade), 03 (arquitetura) e 04 (CAC atual) do
 * `output_contract`.
 */

export interface ManualRateEntry {
  value: number;
  source: string;
  windowStart: string;
  windowEnd: string;
  measuredAt: string;
}

interface Props {
  architecture: FunnelArchitecture | null;
  chainDefectReading: string | null;
  manualRates: Record<string, ManualRateEntry>;
  /** Taxas que o sistema já mede — CTR e connect rate vêm daqui. */
  measuredRates: Record<string, number | null>;
  /** Janela do período selecionado, para confrontar com a dos valores manuais. */
  periodStart: string | null;
  periodEnd: string | null;
  entryCost: { kind: EntryCostKind; value: number } | null;
  /** Story 29.37: a seção de ranking opera sobre estas mesmas taxas. */
  onRatesChange?: (rates: ChainRate[], cac: number | null) => void;
  onSave: (patch: {
    funnelArchitecture?: string | null;
    chainDefectReading?: string | null;
    manualRates?: Record<string, ManualRateEntry>;
  }) => Promise<void>;
  saving: boolean;
}

export function PerpetualChainSection({
  architecture,
  chainDefectReading,
  manualRates,
  measuredRates,
  periodStart,
  periodEnd,
  entryCost,
  onRatesChange,
  onSave,
  saving,
}: Props) {
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draft, setDraft] = useState({ value: "", source: "", windowStart: "", windowEnd: "" });

  const template = architecture ? getTemplate(architecture) : null;

  /**
   * Monta a cadeia juntando o que o sistema mede com o que foi digitado.
   *
   * A editabilidade NÃO vem do `source` declarado no template — vem de o
   * sistema ter fornecido o número ou não. `source` documenta de onde o dado
   * DEVERIA vir; quem decide se há campo para digitar é a realidade.
   *
   * Isso é auto-corretivo: hoje 6 etapas estão marcadas "analytics" e nenhuma
   * chega a esta tela, então todas são digitáveis. Quando a integração existir
   * e `measuredRates` passar a devolvê-las, o campo some sozinho e o valor
   * passa a vir do sistema — sem tocar no template.
   */
  const rates: ChainRate[] = useMemo(() => {
    if (!template) return [];
    return template.stages.map((s) => {
      const manual = manualRates[s.key];
      const measured = measuredRates[s.key];
      const isManual = measured == null;
      return {
        key: s.key,
        label: s.label,
        numerator: s.numerator,
        denominator: s.denominator,
        value: isManual ? (manual?.value ?? null) : (measured ?? null),
        status: isManual ? (manual ? "MEASURED" : "MISSING") : measured != null ? "MEASURED" : "MISSING",
        source: isManual ? (manual?.source ?? null) : "sistema",
        windowStart: isManual ? (manual?.windowStart ?? null) : periodStart,
        windowEnd: isManual ? (manual?.windowEnd ?? null) : periodEnd,
        measuredAt: isManual ? (manual?.measuredAt ?? null) : null,
      };
    });
  }, [template, manualRates, measuredRates, periodStart, periodEnd]);

  const result = useMemo(() => {
    if (!template || !entryCost || rates.length === 0) return null;
    // `sales_page` tem defeito de cadeia declarado: sem a leitura escolhida,
    // não dá para saber se falta um termo. Calcular assim produziria CAC
    // subestimado sem ninguém perceber.
    if (template.chainDefect && !chainDefectReading) return null;
    try {
      const d = decomposeCac(entryCost, rates);
      return { decomposed: d, sanity: runSanityTests(template.id, entryCost, rates, d), error: null };
    } catch (e) {
      return {
        decomposed: null,
        sanity: null,
        error: e instanceof ProtocolViolation ? e.message : String(e),
      };
    }
  }, [template, entryCost, rates, chainDefectReading]);

  // Publica a cadeia montada para quem precisa dela (ranking da 29.37) sem
  // recalcular — duas montagens da mesma cadeia divergiriam.
  const publishedRef = useRef<string>("");
  useEffect(() => {
    if (!onRatesChange) return;
    const sig = JSON.stringify(rates.map((r) => [r.key, r.value])) + (result?.decomposed?.cac ?? "");
    if (sig === publishedRef.current) return;
    publishedRef.current = sig;
    onRatesChange(rates, result?.decomposed?.cac ?? null);
  }, [rates, result, onRatesChange]);

  function openEditor(key: string) {
    const cur = manualRates[key];
    setDraft({
      value: cur ? String(cur.value * 100) : "",
      source: cur?.source ?? "",
      windowStart: cur?.windowStart ?? periodStart ?? "",
      windowEnd: cur?.windowEnd ?? periodEnd ?? "",
    });
    setEditingKey(key);
  }

  async function saveRate() {
    if (!editingKey) return;
    const pct = Number(draft.value.replace(",", "."));
    if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
      toast.error("A taxa precisa ficar entre 0 e 100%.");
      return;
    }
    if (!draft.source.trim()) {
      toast.error("Informe de onde veio o número — sistema, tela e coluna.");
      return;
    }
    // A janela não tem default: é ela que permite verificar se as taxas da
    // cadeia medem o mesmo período (AGG-01).
    if (!draft.windowStart || !draft.windowEnd) {
      toast.error("Informe a janela de medição — sem ela a cadeia não tem significado.");
      return;
    }
    await onSave({
      manualRates: {
        ...manualRates,
        [editingKey]: {
          value: pct / 100,
          source: draft.source.trim(),
          windowStart: draft.windowStart,
          windowEnd: draft.windowEnd,
          measuredAt: new Date().toISOString(),
        },
      },
    });
    setEditingKey(null);
    toast.success("Taxa registrada");
  }

  return (
    <div className="space-y-4">
      {/* ---- Seção 03 — arquitetura ---- */}
      <div className="rounded-xl border border-border/30 bg-card/60 p-5 space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <GitBranch className="h-4 w-4" />
          Arquitetura do funil
        </h3>

        <Select
          value={architecture ?? ""}
          onValueChange={(v) => onSave({ funnelArchitecture: v })}
        >
          <SelectTrigger className="h-8 w-full text-xs sm:w-[320px]">
            <SelectValue placeholder="Declare a arquitetura para calcular a cadeia" />
          </SelectTrigger>
          <SelectContent>
            {Object.values(FUNNEL_TEMPLATES).map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.label} · {t.stages.length} etapas
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {template && (
          <>
            <p className="text-[11px] text-muted-foreground">{template.description}</p>
            {!template.hasSourceBenchmarks && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400">
                Sem benchmark na fonte para esta arquitetura. Os benchmarks de VSL não se aplicam
                aqui — o teto de cada etapa precisa vir de medição própria.
              </p>
            )}
          </>
        )}

        {/* Defeito de cadeia declarado no protocolo — bloqueia o cálculo. */}
        {template?.chainDefect && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5" />
              Esta arquitetura tem uma etapa ambígua
            </p>
            <p className="text-[11px] text-muted-foreground">{template.chainDefect.description}</p>
            <Select
              value={chainDefectReading ?? ""}
              onValueChange={(v) => onSave({ chainDefectReading: v })}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Escolha a leitura que vale no seu funil" />
              </SelectTrigger>
              <SelectContent>
                {template.chainDefect.readings.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {!template && (
        <p className="text-xs text-muted-foreground">
          Sem arquitetura declarada a cadeia não é calculada — o protocolo proíbe adivinhar quais
          etapas o funil tem.
        </p>
      )}

      {/* ---- Cadeia: uma linha por etapa ---- */}
      {template && (
        <div className="rounded-xl border border-border/30 bg-card/60 p-5 space-y-3">
          <h3 className="text-sm font-semibold">Cadeia de conversão</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/20 text-muted-foreground">
                  <th className="py-2 pr-3 text-left">Etapa</th>
                  <th className="px-2 text-left">Base</th>
                  <th className="px-2 text-right">Taxa</th>
                  <th className="px-2 text-left">Origem</th>
                  <th className="px-2 text-left">Janela</th>
                  <th className="pl-2" />
                </tr>
              </thead>
              <tbody>
                {rates.map((r) => {
                  const stage = template.stages.find((s) => s.key === r.key)!;
                  // Mesma regra do `rates`: editável quando o sistema não
                  // fornece. Ler `stage.source` aqui produziria etapa sem
                  // valor E sem campo — travada para sempre.
                  const isManual = measuredRates[r.key] == null;
                  // Janela do valor manual que não cobre o período em tela: a
                  // taxa existe, mas não descreve o que está sendo analisado.
                  const stale =
                    isManual &&
                    r.windowStart != null &&
                    periodStart != null &&
                    (r.windowStart > periodStart || (r.windowEnd ?? "") < (periodEnd ?? ""));
                  return (
                    <tr key={r.key} className="border-b border-border/10">
                      <td className="py-2 pr-3 font-medium">{r.label}</td>
                      <td className="px-2 text-[10px] text-muted-foreground">
                        {r.numerator} ÷ {r.denominator}
                      </td>
                      <td className="px-2 text-right tabular-nums">
                        {r.value == null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          `${(r.value * 100).toFixed(2)}%`
                        )}
                      </td>
                      <td className="px-2 text-[10px] text-muted-foreground">
                        {r.source ?? <span className="italic">a preencher · ideal: {stage.source}</span>}
                      </td>
                      <td className={`px-2 text-[10px] ${stale ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>
                        {r.windowStart ? `${r.windowStart} → ${r.windowEnd}` : "—"}
                        {stale && " · fora do período"}
                      </td>
                      <td className="pl-2 text-right">
                        {isManual && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-1.5"
                            onClick={() => openEditor(r.key)}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Avisos de medição — só nas etapas que a fonte apontou. */}
          {rates.some((r) => STAGE_MEASUREMENT_WARNINGS[r.key]) && (
            <ul className="space-y-1 border-t border-border/20 pt-2">
              {rates
                .filter((r) => STAGE_MEASUREMENT_WARNINGS[r.key])
                .map((r) => (
                  <li key={r.key} className="text-[10px] text-muted-foreground">
                    <strong>{r.label}:</strong> {STAGE_MEASUREMENT_WARNINGS[r.key]}
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}

      {/* ---- Editor de taxa manual ---- */}
      {editingKey && (
        <div className="rounded-xl border border-primary/30 bg-card/60 p-5 space-y-3">
          <h4 className="text-sm font-semibold">
            {template?.stages.find((s) => s.key === editingKey)?.label}
          </h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Taxa (%)</Label>
              <Input
                inputMode="decimal"
                value={draft.value}
                onChange={(e) => setDraft({ ...draft, value: e.target.value })}
                placeholder="ex: 60"
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Onde mediu</Label>
              <Input
                value={draft.source}
                onChange={(e) => setDraft({ ...draft, source: e.target.value })}
                placeholder="ex: VTurb — curva de retenção"
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Janela: início</Label>
              <Input
                type="date"
                value={draft.windowStart}
                onChange={(e) => setDraft({ ...draft, windowStart: e.target.value })}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Janela: fim</Label>
              <Input
                type="date"
                value={draft.windowEnd}
                onChange={(e) => setDraft({ ...draft, windowEnd: e.target.value })}
                className="h-8 text-xs"
              />
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground">
            A janela é obrigatória. Sem ela não dá para verificar se as taxas da cadeia medem o
            mesmo período — e taxas de períodos diferentes multiplicadas produzem um número
            plausível e sem significado.
          </p>
          <div className="flex gap-2">
            <Button size="sm" className="h-8 text-xs" onClick={saveRate} disabled={saving}>
              {saving ? "Salvando…" : "Salvar taxa"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-xs"
              onClick={() => setEditingKey(null)}
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {/* ---- Seção 04 — CAC decomposto ---- */}
      {result?.error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
          <p className="text-sm font-semibold text-red-600 dark:text-red-400">
            Cadeia interrompida por invariante do protocolo
          </p>
          <p className="mt-1 font-mono text-xs text-muted-foreground">{result.error}</p>
        </div>
      )}

      {result?.decomposed && (
        <div className="rounded-xl border border-border/30 bg-card/60 p-5 space-y-3">
          <h3 className="text-sm font-semibold">CAC decomposto</h3>
          {result.decomposed.cac == null ? (
            <div className="space-y-1">
              <p className="text-2xl font-semibold text-muted-foreground">—</p>
              <p className="text-xs text-muted-foreground">
                Sem medição em: <strong>{result.decomposed.unmeasured.join(", ")}</strong>. O CAC
                decomposto fica indisponível — preencher com 100% faria o número parecer melhor do
                que é.
              </p>
            </div>
          ) : (
            <>
              <p className="text-2xl font-semibold tabular-nums">
                {result.decomposed.cac.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              </p>
              <p className="font-mono text-[10px] text-muted-foreground">
                {result.decomposed.expression}
              </p>
              <p className="text-xs text-muted-foreground">
                {Math.round(result.decomposed.entriesPerSale!).toLocaleString("pt-BR")} entradas por
                venda
              </p>
            </>
          )}
        </div>
      )}

      {/* ---- Seção 01 — integridade dos dados ---- */}
      {result?.sanity && (
        <div className="rounded-xl border border-border/30 bg-card/60 p-5 space-y-2">
          <h3 className="text-sm font-semibold">Integridade dos dados</h3>
          <div className="space-y-1">
            {result.sanity.map((s) => (
              <div key={s.id} className="flex items-start gap-2 text-[11px]">
                <span
                  className={`rounded px-1 py-0.5 font-mono text-[9px] font-semibold ${
                    s.verdict === "PASS"
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : s.verdict === "FAIL"
                        ? "bg-red-500/10 text-red-600 dark:text-red-400"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {s.verdict}
                </span>
                <span className="text-muted-foreground">
                  <strong>{s.id}</strong> {s.name} — {s.detail}
                </span>
              </div>
            ))}
          </div>
          {result.sanity.some((s) => s.verdict === "FAIL") && (
            <p className="text-[11px] font-medium text-red-600 dark:text-red-400">
              Há teste reprovado — o resultado acima não deve ser usado para decisão até a causa ser
              corrigida.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
