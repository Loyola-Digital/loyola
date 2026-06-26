"use client";

import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";

// Story 19.15 — Calculadora de ROI ao vivo (PASSO 3, a alavanca-mãe).
// Roda o ROI no número DELE, na frente DELE: a diferença entre a margem de
// hoje e a do método, anualizada — "a conta que ele já está perdendo".
// Regra de ouro: cenário conservador (número subestimado é inatacável).

export interface RoiLead {
  name: string;
  email: string;
  revenue: number | null;
}

function brl(n: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(n);
}

// "12 mil" / "240 mil" / "1,2 mi" — pra leitura rápida em voz alta.
function compact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `R$ ${(n / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (abs >= 1_000) return `R$ ${Math.round(n / 1000).toLocaleString("pt-BR")} mil`;
  return brl(n);
}

function num(v: string): number {
  if (!v) return 0;
  const n = Number(v.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export function RoiCalculatorDialog({
  open, onOpenChange, lead,
}: { open: boolean; onOpenChange: (o: boolean) => void; lead: RoiLead | null }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md p-0 overflow-hidden border-[#1f2937] bg-[#0a0e1a] text-[#f3f4f6] gap-0 sm:rounded-2xl">
        {lead && <RoiCalculator key={lead.email} lead={lead} />}
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label, value, onChange, prefix, suffix, placeholder,
}: {
  label: string; value: string; onChange: (v: string) => void;
  prefix?: string; suffix?: string; placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-[1px] text-[#6b7280] mb-1">{label}</span>
      <div className="flex items-center rounded-lg bg-[#111827] border border-[#1f2937] focus-within:border-[#d4af37]/70 px-2.5">
        {prefix && <span className="text-[#6b7280] text-sm">{prefix}</span>}
        <input
          inputMode="decimal"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-transparent py-2.5 px-1.5 text-[#f3f4f6] text-base outline-none tabular-nums placeholder:text-[#3f4858]"
        />
        {suffix && <span className="text-[#6b7280] text-sm">{suffix}</span>}
      </div>
    </label>
  );
}

function RoiCalculator({ lead }: { lead: RoiLead }) {
  const [fat, setFat] = useState(lead.revenue != null ? String(lead.revenue) : "");
  const [mHoje, setMHoje] = useState("");
  const [mMet, setMMet] = useState("16");
  const [preco, setPreco] = useState("15000");

  const f = num(fat);
  const mh = num(mHoje);
  const mm = num(mMet);
  const p = num(preco);

  const sobraHoje = (f * mh) / 100;
  const sobraMet = (f * mm) / 100;
  const novoMes = sobraMet - sobraHoje;
  const novoAno = novoMes * 12;
  const ready = f > 0 && mh > 0 && mm > 0 && novoMes > 0;

  return (
    <div className="max-h-[88vh] overflow-y-auto">
      {/* Header */}
      <div className="px-5 pt-5 pb-4 border-b border-[#d4af37]/50">
        <div className="text-[10px] tracking-[2px] uppercase font-bold text-[#d4af37]">ROI ao vivo · Passo 3</div>
        <h2 className="text-xl font-extrabold mt-1 leading-tight">A conta que ele já está perdendo</h2>
        <p className="text-[12px] text-[#9ca3af] mt-1 truncate">{lead.name || lead.email}</p>
      </div>

      {/* Inputs */}
      <div className="px-5 py-4 space-y-3">
        <Field label="Faturamento / mês" value={fat} onChange={setFat} prefix="R$" placeholder="200000" />
        <div className="grid grid-cols-2 gap-2">
          <Field label="Margem hoje" value={mHoje} onChange={setMHoje} suffix="%" placeholder="6" />
          <Field label="Margem método" value={mMet} onChange={setMMet} suffix="%" placeholder="16" />
        </div>
        <Field label="Preço do programa" value={preco} onChange={setPreco} prefix="R$" placeholder="15000" />
      </div>

      {/* Resultado — a conta */}
      {ready ? (
        <div className="px-5 pb-5 space-y-3">
          <div className="rounded-xl bg-[#111827] border border-[#1f2937] divide-y divide-[#1f2937] text-[13px]">
            <div className="flex items-center justify-between px-3.5 py-2.5">
              <span className="text-[#9ca3af]">{compact(f)}/mês × {mh}% <span className="text-[#6b7280]">hoje</span></span>
              <span className="font-bold tabular-nums">{brl(sobraHoje)}</span>
            </div>
            <div className="flex items-center justify-between px-3.5 py-2.5">
              <span className="text-[#9ca3af]">{compact(f)}/mês × {mm}% <span className="text-[#d4af37]">método</span></span>
              <span className="font-bold tabular-nums text-[#d4af37]">{brl(sobraMet)}</span>
            </div>
            <div className="flex items-center justify-between px-3.5 py-2.5 bg-[#0d1424]">
              <span className="text-[#9ca3af]">diferença <span className="text-[#6b7280]">+{compact(novoMes)}/mês × 12</span></span>
              <span className="font-bold tabular-nums text-emerald-400">{brl(novoMes)}</span>
            </div>
          </div>

          {/* O número que choca */}
          <div className="rounded-xl border border-[#ef4444]/40 bg-[#ef4444]/[0.07] px-4 py-4 text-center">
            <div className="text-[10px] uppercase tracking-[1.5px] text-[#ef4444] font-bold">deixando na mesa, todo ano</div>
            <div className="text-3xl sm:text-4xl font-extrabold text-[#ef4444] tabular-nums mt-1 leading-none">{brl(novoAno)}</div>
          </div>

          {/* A frase de fechamento */}
          <p className="text-[13px] text-[#d1d5db] leading-relaxed px-1">
            Programa <strong className="text-[#f3f4f6]">{brl(p)}</strong>, uma vez. Você está deixando{" "}
            <strong className="text-[#ef4444]">{brl(novoAno)}</strong> na mesa, <strong>todo ano</strong>, pra não
            investir <strong className="text-[#f3f4f6]">{brl(p)}</strong> uma vez. Me explica a lógica disso.
          </p>

          <div className="flex items-start gap-2 rounded-lg bg-[#d4af37]/[0.08] border border-[#d4af37]/30 px-3 py-2 text-[11px] text-[#d4af37]">
            <span>🛡️</span>
            <span>Regra de ouro: use sempre a margem do método em <strong>cenário conservador</strong>. Número subestimado é inatacável; redondo e exagerado liga o alarme de picaretagem.</span>
          </div>
        </div>
      ) : (
        <div className="px-5 pb-6 text-[13px] text-[#6b7280]">
          Preencha o <strong className="text-[#9ca3af]">faturamento</strong> e a <strong className="text-[#9ca3af]">margem de hoje</strong> dele
          (pergunte ao vivo) — a conta roda sozinha.
        </div>
      )}
    </div>
  );
}
