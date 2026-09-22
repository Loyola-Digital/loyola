"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fmtCurrency, fmtInt, fmtPercent } from "@/lib/utils/format-number";
import type { LimitesDaFaixa } from "@loyola-x/shared/src/planejamento-cenarios";
import { classeDaFaixa, estadoDoAtingimento, larguraDaBarra, temReferenciaDeFaixa } from "@/lib/utils/planejamento-organicos-form";

// Stories 48.3/48.4 — peças de UI compartilhadas pelas abas "Leads Orgânicos"
// e "Leads Pagos" (AC11 da 48.4: um componente de faixa só). Sem cálculo:
// tudo que decide cor ou valor vive em `lib/utils` e é testado lá.

export const pctPontos = (fracao: number | null) => fmtPercent(fracao === null ? null : fracao * 100);

/** Campo numérico do bloco: percentual em PONTOS (4 = 4 %) ou moeda em reais. */
export function CampoNumerico({
  id,
  rotulo,
  valor,
  erro,
  placeholder,
  sufixo,
  onChange,
  readOnly,
}: {
  id: string;
  rotulo: string;
  valor: string;
  erro?: string;
  placeholder?: string;
  sufixo: "%" | "R$";
  onChange: (v: string) => void;
  readOnly: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {rotulo}
      </Label>
      <div className="relative">
        <Input
          id={id}
          inputMode="decimal"
          value={valor}
          onChange={(ev) => onChange(ev.target.value)}
          readOnly={readOnly}
          aria-invalid={!!erro}
          className={`pr-8 tabular-nums ${erro ? "border-destructive" : ""}`}
          placeholder={placeholder ?? "—"}
        />
        <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-muted-foreground">{sufixo}</span>
      </div>
      {erro && <p className="text-[11px] text-destructive">{erro}</p>}
    </div>
  );
}

/**
 * Legenda das quatro faixas (AR-004 virou componente): 1 azul … 4 vermelho,
 * no MESMO sentido para leads (48.3) e CPL (48.4, DV-012 = B — não reproduz a
 * inversão da planilha). Sem referência (UX-001) não há faixa.
 */
export function LegendaDasFaixas({
  limites,
  referencia,
  grandeza,
}: {
  limites: LimitesDaFaixa | null;
  /** Leads esperados (48.3) ou CPL médio histórico (48.4); zero ou vazio = sem referência. */
  referencia: number | null;
  grandeza: "leads" | "cpl";
}) {
  const item = (faixa: 1 | 2 | 3 | 4, texto: string) => (
    <span className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[11px] ${classeDaFaixa(faixa)}`}>{texto}</span>
  );
  if (!limites || !temReferenciaDeFaixa(referencia ?? 0)) {
    return (
      <p className="text-xs text-muted-foreground">
        {grandeza === "leads"
          ? "Faixas sem base — informe a taxa de captação e a base do canal."
          : "Faixas sem base — informe o CPL médio histórico da fonte."}
      </p>
    );
  }
  const f = grandeza === "leads" ? fmtInt : fmtCurrency;
  const nome = grandeza === "leads" ? "# Leads" : "CPL";
  return (
    <div className="flex flex-wrap gap-1.5" aria-label={`Legenda das faixas de ${grandeza === "leads" ? "leads" : "CPL"}`}>
      {item(1, `${nome} < ${f(limites.lo)}`)}
      {item(2, `${f(limites.lo)} ≤ ${nome} ≤ ${f(limites.mid)}`)}
      {item(3, `${f(limites.mid)} < ${nome} ≤ ${f(limites.hi)}`)}
      {item(4, `${nome} > ${f(limites.hi)}`)}
    </div>
  );
}

/** A "█" de Y3 (AR-005) como barra, com as cores de DV-016 = A. */
export function BarraDeAtingimento({ atingimento }: { atingimento: number | null }) {
  const estado = estadoDoAtingimento(atingimento);
  const cor = estado === "verde" ? "bg-emerald-500" : estado === "vermelho" ? "bg-red-500" : estado === "neutro" ? "bg-amber-500" : "bg-muted-foreground/30";
  const corTexto = estado === "verde" ? "text-emerald-600" : estado === "vermelho" ? "text-destructive" : "";
  return (
    <div className="space-y-1">
      <p className={`tabular-nums text-sm font-semibold ${corTexto}`}>{pctPontos(atingimento)}</p>
      <div className="h-2 w-full rounded bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={larguraDaBarra(atingimento)}>
        <div className={`h-2 rounded ${cor}`} style={{ width: `${larguraDaBarra(atingimento)}%` }} />
      </div>
    </div>
  );
}

export function Moeda({ valor, destaque }: { valor: number | null; destaque?: boolean }) {
  const texto = fmtCurrency(valor);
  return <span className={`tabular-nums ${destaque ? "font-semibold" : ""} ${texto.startsWith("-") ? "text-destructive" : ""}`}>{texto}</span>;
}
