"use client";

import { useMemo, useState } from "react";
import { Plus, X, RefreshCw, Settings2, Calculator } from "lucide-react";
import { toast } from "sonner";
import type {
  SalesPlanRule,
  SalesPlanRuleInput,
  SalesPlanParticipant,
} from "@loyola-x/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useSalesPlan,
  useSalesPlanSources,
  useSalesPlanRules,
  useSetSalesPlanRules,
} from "@/lib/hooks/use-sales-plan";
import { useEventProducts } from "@/lib/hooks/use-event-config";
import { LeadDetailDialog, type RoiLead } from "@/components/funnels/roi-calculator";

// ============================================================
// Helpers
// ============================================================
function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value);
}

/** Texto curto da faixa: "≥ R$ 100k", "R$ 20k–60k", "< R$ 20k", "Qualquer". */
function formatRange(min: number | null, max: number | null): string {
  const k = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));
  if (min != null && max != null) return `R$ ${k(min)}–${k(max)}`;
  if (min != null) return `≥ R$ ${k(min)}`;
  if (max != null) return `< R$ ${k(max)}`;
  return "Qualquer";
}

// ============================================================
// SalesPlanTab (principal)
// ============================================================
export function SalesPlanTab({ projectId, funnelId, stageId }: { projectId: string; funnelId: string; stageId: string }) {
  const { data, isLoading, refetch, isFetching } = useSalesPlan(projectId, funnelId, stageId);
  const { data: sourcesData } = useSalesPlanSources(projectId, funnelId, stageId);
  const sources = useMemo(() => sourcesData?.sources ?? [], [sourcesData]);

  const [showConfig, setShowConfig] = useState(false);
  const [roiLead, setRoiLead] = useState<RoiLead | null>(null);

  if (isLoading) {
    return (
      <div className="rounded-2xl bg-[#0a0e1a] border border-[#1f2937] p-6 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 rounded-xl bg-[#111827] animate-pulse" />)}
        </div>
        <div className="h-64 rounded-xl bg-[#111827] animate-pulse" />
      </div>
    );
  }

  const summary = data?.summary;
  const tiers = data?.tiers ?? [];
  const unmatched = data?.unmatched ?? [];
  const hasSources = sources.length > 0;

  const kpis: { label: string; value: string; gold?: boolean }[] = [
    { label: "Participantes", value: String(summary?.totalParticipants ?? 0) },
    { label: "Com faturamento", value: String(summary?.withRevenue ?? 0), gold: true },
    { label: "Sem faturamento", value: String(summary?.withoutRevenue ?? 0) },
    { label: "Potencial (base)", value: formatCurrency(summary?.totalRevenue ?? 0), gold: true },
  ];

  return (
    <div className="rounded-2xl bg-[#0a0e1a] text-[#f3f4f6] border border-[#1f2937] p-4 sm:p-6 space-y-6">
      {/* Header estilo relatório */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 border-b border-[#d4af37]/60 pb-4">
        <div>
          <div className="text-[11px] tracking-[2px] uppercase font-semibold text-[#d4af37]">Imersão Presencial</div>
          <h2 className="text-xl sm:text-2xl font-extrabold mt-1 text-[#f3f4f6]">Plano de Vendas</h2>
          <p className="text-[13px] text-[#9ca3af] mt-1 max-w-2xl">
            Cruzamento das planilhas (por email) com a matriz de faturamento → oferta.
            Toque num participante pra rodar a <span className="text-[#d4af37]">calculadora de ROI</span> no número dele.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => refetch()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold border border-[#1f2937] text-[#9ca3af] hover:bg-[#1a2236] transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} /> Atualizar
          </button>
          <button
            type="button"
            onClick={() => setShowConfig((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold border border-[#d4af37]/40 text-[#d4af37] hover:bg-[#d4af37]/10 transition-colors"
          >
            <Settings2 className="h-3.5 w-3.5" /> Matriz de ofertas
          </button>
        </div>
      </div>

      {/* Matriz de ofertas (config) */}
      {showConfig && (
        <div className="rounded-xl border border-[#1f2937] bg-[#0d1424] p-4">
          <RulesEditor projectId={projectId} funnelId={funnelId} stageId={stageId} />
        </div>
      )}

      {!hasSources ? (
        <div className="rounded-xl bg-[#111827] border border-[#1f2937] p-8 text-center text-sm space-y-1">
          <p className="font-medium text-[#f3f4f6]">Nenhuma planilha conectada ainda.</p>
          <p className="text-[#9ca3af]">
            Conecte as planilhas dos participantes na aba <strong className="text-[#d4af37]">Leads do Evento</strong> —
            elas alimentam tanto o Mapa quanto este Plano de Vendas.
          </p>
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {kpis.map((k) => (
              <div key={k.label} className="rounded-xl bg-[#111827] border border-[#1f2937] p-4 transition-colors hover:border-[#d4af37]/60">
                <div className="text-[11px] uppercase tracking-[1px] text-[#6b7280] mb-2">{k.label}</div>
                <div className={`text-2xl font-extrabold leading-none ${k.gold ? "text-[#d4af37]" : "text-[#f3f4f6]"}`}>{k.value}</div>
              </div>
            ))}
          </div>

          {/* Breakdown por tipo */}
          {summary && summary.byType.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] uppercase tracking-[1px] text-[#6b7280]">Por tipo:</span>
              {summary.byType.map((t) => (
                <span key={t.tipo} className="text-[11px] rounded-full border border-[#1f2937] px-2.5 py-1 text-[#9ca3af]">
                  {t.tipo} <strong className="text-[#f3f4f6]">{t.count}</strong>
                </span>
              ))}
            </div>
          )}

          {/* Matriz de decisão (resumo) */}
          {tiers.length > 0 && (
            <div className="rounded-xl border border-[#1f2937] overflow-x-auto">
              <div className="px-4 py-2.5 bg-[#1f2937] text-[11px] uppercase tracking-[1px] font-semibold">Matriz de decisão</div>
              <table className="w-full min-w-[440px] text-[13px]">
                <thead className="bg-[#141c2e] text-[#9ca3af]">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold text-[11px] uppercase tracking-[1px]">Faixa</th>
                    <th className="text-left px-3 py-2 font-semibold text-[11px] uppercase tracking-[1px]">Oferta recomendada</th>
                    <th className="text-right px-3 py-2 font-semibold text-[11px] uppercase tracking-[1px]">Pessoas</th>
                  </tr>
                </thead>
                <tbody className="bg-[#111827]">
                  {tiers.map((t) => (
                    <tr key={t.ruleId} className="border-t border-[#1f2937]">
                      <td className="px-3 py-2 text-[#f3f4f6] font-medium">
                        {t.label} <span className="text-[#6b7280] font-normal">· {formatRange(t.minRevenue, t.maxRevenue)}</span>
                      </td>
                      <td className="px-3 py-2 text-[#d4af37] font-semibold">{t.offer || "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-[#f3f4f6]">{t.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Tiers detalhados */}
          {tiers.filter((t) => t.count > 0).map((t) => (
            <SegmentTable
              key={t.ruleId}
              title={t.label}
              subtitle={`${formatRange(t.minRevenue, t.maxRevenue)} · ${t.offer || "sem oferta definida"}`}
              participants={t.participants}
              onPick={(p) => setRoiLead({ name: p.name, email: p.email, revenue: p.revenue })}
            />
          ))}

          {/* Sem faturamento / fora de faixa */}
          {unmatched.length > 0 && (
            <div className="rounded-xl border border-[#ef4444]/40 bg-[#ef4444]/[0.06] overflow-hidden">
              <div className="px-4 py-2.5 text-[12px] font-bold uppercase tracking-[1px] text-[#ef4444]">
                ⚠ {unmatched.length} sem faturamento / fora de faixa — cobrar pesquisa
              </div>
              <SegmentTable participants={unmatched} bare onPick={(p) => setRoiLead({ name: p.name, email: p.email, revenue: p.revenue })} />
            </div>
          )}
        </>
      )}

      <LeadDetailDialog
        open={!!roiLead}
        onOpenChange={(o) => !o && setRoiLead(null)}
        lead={roiLead}
        projectId={projectId}
        funnelId={funnelId}
        stageId={stageId}
      />
    </div>
  );
}

// ============================================================
// Tabela de participantes de um segmento
// ============================================================
function SegmentTable({
  title, subtitle, participants, bare, onPick,
}: { title?: string; subtitle?: string; participants: SalesPlanParticipant[]; bare?: boolean; onPick?: (p: SalesPlanParticipant) => void }) {
  return (
    <div className={bare ? "" : "rounded-xl border border-[#1f2937] overflow-hidden"}>
      {title && (
        <div className="px-4 py-3 bg-[#141c2e] border-b border-[#1f2937]">
          <div className="text-[15px] font-bold text-[#d4af37]">{title}</div>
          {subtitle && <div className="text-[12px] text-[#9ca3af] mt-0.5">{subtitle}</div>}
        </div>
      )}
      <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-[13px]">
        <thead className="bg-[#1f2937] text-[#f3f4f6]">
          <tr>
            <th className="text-left px-3 py-2 font-semibold text-[11px] uppercase tracking-[1px]">Nome</th>
            <th className="text-left px-3 py-2 font-semibold text-[11px] uppercase tracking-[1px]">Email</th>
            <th className="text-left px-3 py-2 font-semibold text-[11px] uppercase tracking-[1px]">Tipo</th>
            <th className="text-right px-3 py-2 font-semibold text-[11px] uppercase tracking-[1px]">Faturamento</th>
          </tr>
        </thead>
        <tbody className="bg-[#111827]">
          {participants.map((p) => (
            <tr
              key={p.email}
              onClick={() => onPick?.(p)}
              className="border-t border-[#1f2937] hover:bg-[#1a2236] transition-colors cursor-pointer"
            >
              <td className="px-3 py-2 text-[#f3f4f6] font-medium max-w-[180px] truncate">
                <span className="inline-flex items-center gap-1.5">
                  <Calculator className="h-3.5 w-3.5 text-[#d4af37]/70 shrink-0" />
                  {p.name || "—"}
                </span>
              </td>
              <td className="px-3 py-2 text-[#9ca3af] max-w-[200px] truncate">{p.email}</td>
              <td className="px-3 py-2">
                <span className="text-[10px] rounded-full border border-[#1f2937] px-2 py-0.5 text-[#9ca3af]">{p.tipo}</span>
              </td>
              <td className="px-3 py-2 text-right tabular-nums font-bold text-[#d4af37]" title={p.revenueRaw ?? undefined}>
                {p.revenue != null ? formatCurrency(p.revenue) : <span className="text-[#6b7280] font-normal">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}

// ============================================================
// Editor da matriz de faixas → oferta
// ============================================================
type DraftRule = { label: string; minRevenue: string; maxRevenue: string; offer: string };

function ruleToDraft(r: SalesPlanRule): DraftRule {
  return {
    label: r.label,
    minRevenue: r.minRevenue != null ? String(r.minRevenue) : "",
    maxRevenue: r.maxRevenue != null ? String(r.maxRevenue) : "",
    offer: r.offer,
  };
}

function RulesEditor({ projectId, funnelId, stageId }: { projectId: string; funnelId: string; stageId: string }) {
  const { data: rulesData, isLoading: rulesLoading } = useSalesPlanRules(projectId, funnelId, stageId);
  const { data: productsData } = useEventProducts(projectId, funnelId, stageId);
  const setRules = useSetSalesPlanRules(projectId, funnelId, stageId);

  const serverRules = useMemo(() => rulesData?.rules ?? [], [rulesData]);
  const [draft, setDraft] = useState<DraftRule[] | null>(null);
  const rows = draft ?? serverRules.map(ruleToDraft);
  const products = productsData?.products ?? [];

  function update(i: number, patch: Partial<DraftRule>) {
    setDraft(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function addRow() { setDraft([...rows, { label: "", minRevenue: "", maxRevenue: "", offer: "" }]); }
  function removeRow(i: number) { setDraft(rows.filter((_, idx) => idx !== i)); }

  function parseNum(v: string): number | null {
    const t = v.trim();
    if (!t) return null;
    const n = Number(t.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }

  function save() {
    const payload: SalesPlanRuleInput[] = [];
    for (const r of rows) {
      if (!r.label.trim()) { toast.error("Toda faixa precisa de um rótulo"); return; }
      const minRevenue = parseNum(r.minRevenue);
      const maxRevenue = parseNum(r.maxRevenue);
      if (minRevenue != null && maxRevenue != null && minRevenue >= maxRevenue) {
        toast.error(`Faixa "${r.label}": mínimo deve ser menor que o máximo`);
        return;
      }
      payload.push({ label: r.label.trim(), minRevenue, maxRevenue, offer: r.offer.trim() });
    }
    setRules.mutate(payload, {
      onSuccess: () => { toast.success("Matriz salva"); setDraft(null); },
      onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar"),
    });
  }

  const dirty = draft !== null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[13px] font-semibold text-[#f3f4f6]">Matriz de ofertas</div>
          <div className="text-[11px] text-[#6b7280]">Faixa de faturamento → oferta. A 1ª faixa que contém o valor vence (deixe min/max vazio p/ sem limite).</div>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={addRow} className="h-8">
            <Plus className="h-3.5 w-3.5 mr-1" /> Faixa
          </Button>
          {dirty && (
            <Button type="button" size="sm" onClick={save} disabled={setRules.isPending} className="bg-[#d4af37] text-black hover:bg-[#d4af37]/90 h-8">
              {setRules.isPending ? "Salvando..." : "Salvar matriz"}
            </Button>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        rulesLoading ? (
          <Skeleton className="h-9" />
        ) : (
          <p className="text-[12px] text-[#6b7280] italic">Nenhuma faixa. Adicione faixas pra recomendar ofertas por faturamento.</p>
        )
      ) : (
        <div className="space-y-2 overflow-x-auto">
          <div className="grid grid-cols-[1fr_90px_90px_1.2fr_32px] gap-2 px-1 min-w-[480px] text-[10px] uppercase tracking-[1px] text-[#6b7280]">
            <span>Rótulo</span><span>Mín (R$)</span><span>Máx (R$)</span><span>Oferta</span><span />
          </div>
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_90px_90px_1.2fr_32px] gap-2 items-center min-w-[480px]">
              <Input value={r.label} onChange={(e) => update(i, { label: e.target.value })} placeholder="Tier A" className="h-9 bg-[#1a2236] border-[#1f2937] text-[#f3f4f6]" />
              <Input value={r.minRevenue} onChange={(e) => update(i, { minRevenue: e.target.value })} placeholder="—" inputMode="numeric" className="h-9 bg-[#1a2236] border-[#1f2937] text-[#f3f4f6]" />
              <Input value={r.maxRevenue} onChange={(e) => update(i, { maxRevenue: e.target.value })} placeholder="—" inputMode="numeric" className="h-9 bg-[#1a2236] border-[#1f2937] text-[#f3f4f6]" />
              <Input value={r.offer} onChange={(e) => update(i, { offer: e.target.value })} placeholder="Pacote / produto" list="sales-plan-offers" className="h-9 bg-[#1a2236] border-[#1f2937] text-[#f3f4f6]" />
              <button type="button" onClick={() => removeRow(i)} className="text-[#6b7280] hover:text-[#ef4444] transition-colors flex justify-center" title="Remover faixa">
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
          <datalist id="sales-plan-offers">
            {products.map((p) => <option key={p.id} value={p.name} />)}
          </datalist>
        </div>
      )}
    </div>
  );
}
