"use client";

import { useMemo, useState } from "react";
import { ArrowUpRight, ListOrdered, Pencil, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { actionFor } from "@/lib/utils/diagnostic-tree";
import {
  rank, realDrop, deckLabel, compositeEffect, realDropInterval,
  PROJECTION_DISCLAIMER, ProtocolViolation,
  type CeilingRow, type CeilingSource, type ChainRate, type EntryCostKind,
} from "@/lib/utils/cac-protocol";

/**
 * Story 29.37 — teto, ranking e ação recomendada.
 *
 * A cadeia (29.36) diz ONDE o CAC estoura. Esta seção diz POR ONDE COMEÇAR —
 * e no perpétuo essa decisão vale semanas, porque otimizar uma VSL exige
 * gravação e edição, não é trocar criativo.
 *
 * Cobre as seções 07 (tabela do teto), 08 (ranking), 09 (ações) e 10
 * (projeção) do `output_contract`.
 */

export interface CeilingEntry {
  value: number;
  source: string;
  note?: string;
}

const SOURCE_LABELS: Record<CeilingSource, string> = {
  benchmark_outro_funil: "Benchmark de outro funil da operação",
  melhor_historico: "Melhor histórico deste funil",
  benchmark_fonte: "Benchmark da consultoria (mesma arquitetura)",
  teto_fisico: "Teto físico da métrica",
};

interface Props {
  rates: ChainRate[];
  ceilings: Record<string, CeilingEntry>;
  /**
   * Custo da entrada COM a unidade — gate QA-04.
   *
   * Antes eram só `entryCostValue: number | null`, e a unidade ficava cravada
   * como "CPM" no rótulo e na chave de teto. Quando a 29.44 trocou o custo de
   * entrada para CPC (porque toda arquitetura começa em "cliques no link"), a
   * seção passou a exibir um CPC rotulado CPM — e, com teto salvo, a comparar
   * um CPC contra um teto de CPM. Para quem opera tráfego, CPC e CPM de R$ 2,50
   * são realidades opostas.
   *
   * A unidade viaja junto com o valor: não há como um voltar a divergir do outro.
   */
  entryCost: { kind: EntryCostKind; value: number } | null;
  currentCac: number | null;
  funnelValidado: boolean;
  onSave: (ceilings: Record<string, CeilingEntry>) => Promise<void>;
  saving: boolean;
}

export function PerpetualRankingSection({
  rates, ceilings, entryCost, currentCac, funnelValidado, onSave, saving,
}: Props) {
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draft, setDraft] = useState({ value: "", source: "", note: "" });

  /** Monta as linhas do teto a partir da cadeia + entrada de custo. */
  const rows: CeilingRow[] = useMemo(() => {
    const out: CeilingRow[] = [];
    if (entryCost != null) {
      // A chave do teto e o rótulo saem da MESMA unidade do valor. Teto salvo
      // sob outra unidade simplesmente não é encontrado — que é o correto:
      // teto de CPM não limita CPC.
      const c = ceilings[entryCost.kind];
      out.push({
        key: entryCost.kind, label: entryCost.kind, role: "numerator",
        current: entryCost.value,
        ceiling: c?.value ?? null,
        ceilingSource: (c?.source as CeilingSource) ?? null,
        chainPosition: 0, successes: null, trials: null,
      });
    }
    for (const r of rates) {
      if (r.value == null) continue;
      const c = ceilings[r.key];
      out.push({
        key: r.key, label: r.label, role: "denominator",
        current: r.value,
        ceiling: c?.value ?? null,
        ceilingSource: (c?.source as CeilingSource) ?? null,
        chainPosition: rates.indexOf(r) + 1,
        // Contagens não chegam aqui hoje: a entrada manual fornece a TAXA, não
        // o volume. Por isso o ranking degrada — e declara.
        successes: null, trials: null,
      });
    }
    return out;
  }, [rates, ceilings, entryCost]);

  const ranking = useMemo(() => {
    if (rows.length === 0) return null;
    try {
      return rank(rows, "STATISTICAL", funnelValidado ? "VALIDATED" : "NOT_VALIDATED");
    } catch (e) {
      return { error: e instanceof ProtocolViolation ? e.message : String(e) } as const;
    }
  }, [rows, funnelValidado]);

  const hasError = ranking != null && "error" in ranking;
  const composite = useMemo(() => {
    const withCeiling = rows.filter((r) => r.ceiling != null && r.ceilingSource != null);
    return withCeiling.length > 0 ? compositeEffect(withCeiling) : null;
  }, [rows]);

  function openEditor(key: string) {
    const c = ceilings[key];
    setDraft({ value: c ? String(c.value) : "", source: c?.source ?? "", note: c?.note ?? "" });
    setEditingKey(key);
  }

  async function saveCeiling() {
    if (!editingKey) return;
    const v = Number(draft.value.replace(",", "."));
    if (!Number.isFinite(v) || v <= 0) {
      toast.error("Informe um teto válido.");
      return;
    }
    if (!draft.source) {
      toast.error("Declare de onde vem o teto — sem procedência ele não entra no ranking.");
      return;
    }
    await onSave({
      ...ceilings,
      [editingKey]: { value: v, source: draft.source, note: draft.note.trim() || undefined },
    });
    setEditingKey(null);
    toast.success("Teto registrado");
  }

  const top = !hasError && ranking && ranking.ordered.length > 0 ? ranking.ordered[0] : null;
  const topAction = top ? actionFor(top.key) : null;

  return (
    <div className="space-y-4">
      {/* ---- Seção 07 — tabela do teto ---- */}
      <div className="rounded-xl border border-border/30 bg-card/60 p-5 space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <TrendingDown className="h-4 w-4" />
          Método do teto
        </h3>
        {rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Sem cadeia medida ainda — o teto opera sobre as taxas da seção anterior.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/20 text-muted-foreground">
                  <th className="py-2 pr-3 text-left">Variável</th>
                  <th className="px-2 text-right">Atual</th>
                  <th className="px-2 text-right">Teto</th>
                  <th className="px-2 text-left">Fonte do teto</th>
                  <th className="px-2 text-right">Queda de CAC</th>
                  <th className="px-2 text-right text-[10px]">Rótulo do deck</th>
                  <th className="pl-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const drop = realDrop(r);
                  const deck = deckLabel(r);
                  const fmt = (v: number) =>
                    r.role === "numerator" ? v.toFixed(2) : `${(v * 100).toFixed(2)}%`;
                  return (
                    <tr key={r.key} className="border-b border-border/10">
                      <td className="py-2 pr-3 font-medium">{r.label}</td>
                      <td className="px-2 text-right tabular-nums">{fmt(r.current)}</td>
                      <td className="px-2 text-right tabular-nums">
                        {r.ceiling == null ? <span className="text-muted-foreground">—</span> : fmt(r.ceiling)}
                      </td>
                      <td className="px-2 text-[10px] text-muted-foreground">
                        {r.ceilingSource ? SOURCE_LABELS[r.ceilingSource] : "— (fora do ranking)"}
                      </td>
                      <td className="px-2 text-right tabular-nums font-medium">
                        {drop == null ? "—" : `${(drop * 100).toFixed(2)}%`}
                      </td>
                      <td className="px-2 text-right text-[10px] tabular-nums text-muted-foreground">
                        {deck == null ? "—" : `${(deck * 100).toFixed(2)}%`}
                      </td>
                      <td className="pl-2 text-right">
                        <Button variant="ghost" size="sm" className="h-6 px-1.5" onClick={() => openEditor(r.key)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[10px] text-muted-foreground">
          A coluna do deck aparece só como referência. A ordenação usa a <strong>queda real</strong>:
          para taxas o deck calcula o ganho da métrica, não a queda do CAC, e misturar as duas
          escalas pode inverter a ordem.
        </p>
      </div>

      {/* ---- Editor de teto ---- */}
      {editingKey && (
        <div className="rounded-xl border border-primary/30 bg-card/60 p-5 space-y-3">
          <h4 className="text-sm font-semibold">Teto — {rows.find((r) => r.key === editingKey)?.label}</h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">
                Valor {rows.find((r) => r.key === editingKey)?.role === "denominator" ? "(fração, ex: 0.85)" : "(ex: 15)"}
              </Label>
              <Input
                inputMode="decimal" value={draft.value}
                onChange={(e) => setDraft({ ...draft, value: e.target.value })}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">De onde vem</Label>
              <Select value={draft.source} onValueChange={(v) => setDraft({ ...draft, source: v })}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Declare a procedência" />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(SOURCE_LABELS) as CeilingSource[]).map((s) => (
                    <SelectItem key={s} value={s}>{SOURCE_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Input
            value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })}
            placeholder="Observação (opcional) — ex: melhor semana de junho/2026"
            className="h-8 text-xs"
          />
          <p className="text-[10px] text-muted-foreground">
            Estimativa do analista e extrapolação de tendência não são fontes aceitas. Teto sem
            procedência não entra no ranking — não porque a variável não tenha potencial, mas
            porque não sabemos qual é.
          </p>
          <div className="flex gap-2">
            <Button size="sm" className="h-8 text-xs" onClick={saveCeiling} disabled={saving}>
              {saving ? "Salvando…" : "Salvar teto"}
            </Button>
            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setEditingKey(null)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {/* ---- Seção 08 — ranking. Degradação vai NO TOPO. ---- */}
      {ranking && !hasError && (
        <div className="rounded-xl border border-border/30 bg-card/60 p-5 space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <ListOrdered className="h-4 w-4" />
            Por onde começar
          </h3>

          {ranking.degraded && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5">
              <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                Modo solicitado: {ranking.modeRequested} · modo usado: {ranking.modeUsed}
              </p>
              <p className="text-[10px] text-muted-foreground">
                Sem contagens absolutas por etapa não dá para calcular intervalo de confiança — o
                empate estatístico não foi avaliado. A entrada manual fornece a taxa, não o volume.
              </p>
            </div>
          )}

          {ranking.ordered.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Nenhuma variável com teto declarado. Preencha ao menos um teto para o ranking existir.
            </p>
          ) : (
            <ol className="space-y-1">
              {ranking.ordered.map((r, i) => {
                const drop = realDrop(r);
                const iv = realDropInterval(r);
                return (
                  <li key={r.key} className="flex items-baseline gap-2 text-xs">
                    <span className="w-5 text-right font-semibold text-muted-foreground">{i + 1}.</span>
                    <span className="font-medium">{r.label}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {drop == null ? "—" : `${(drop * 100).toFixed(2)}%`}
                      {iv && ` · IC95 [${(iv[0] * 100).toFixed(1)}%, ${(iv[1] * 100).toFixed(1)}%]`}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}

          <ul className="space-y-0.5 border-t border-border/20 pt-2">
            {ranking.notes.map((n, i) => (
              <li key={i} className="text-[10px] text-muted-foreground">↳ {n}</li>
            ))}
          </ul>
        </div>
      )}

      {/* ---- Seção 09 — ação, SÓ da nº 1 ---- */}
      {top && topAction && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-5 space-y-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <ArrowUpRight className="h-4 w-4" />
            Ação recomendada — {top.label}
          </h3>
          <p className="text-sm">{topAction.action}</p>
          {topAction.rationale && (
            <p className="text-[11px] text-muted-foreground">{topAction.rationale}</p>
          )}
          {topAction.evidence && (
            <p className="text-[11px] text-muted-foreground">
              <strong>Evidência:</strong> {topAction.evidence}
            </p>
          )}
          <p className="text-[10px] text-muted-foreground">
            Só a primeira da lista recebe ação — o protocolo é explícito em aplicar o diagnóstico
            após o ranking, à variável priorizada, e não como varredura.
          </p>
        </div>
      )}

      {/* ---- Seção 10 — projeção ---- */}
      {composite != null && (
        <div className="rounded-xl border border-border/30 bg-card/60 p-5 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Efeito composto</h3>
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              PROJECTED
            </span>
          </div>
          <p className="text-2xl font-semibold tabular-nums">
            {((1 - composite) * 100).toFixed(2)}%
          </p>
          <p className="text-xs text-muted-foreground">
            de queda no CAC levando todas as variáveis com teto declarado ao limite
            {currentCac != null && (
              <> — de {currentCac.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} para{" "}
                {(currentCac * composite).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</>
            )}
          </p>
          <p className="text-[11px] text-muted-foreground">
            Os ganhos se <strong>multiplicam</strong>, não se somam — somar as quedas individuais
            passaria de 100%, o que é aritmeticamente impossível.
          </p>
          <p className="text-[11px] italic text-amber-600 dark:text-amber-400">{PROJECTION_DISCLAIMER}</p>
        </div>
      )}
    </div>
  );
}
