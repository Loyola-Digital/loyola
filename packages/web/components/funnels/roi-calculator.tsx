"use client";

import { useMemo, useState } from "react";
import { Calculator, ListChecks, Eye, Share2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useEventLeadAnswers } from "@/lib/hooks/use-event-config";
import type { EventRevenueMatchInfo } from "@loyola-x/shared";

// Story 19.15 — Calculadora de Lucro (BBE Escala) portada do HTML do closer.
// Conceito: Lucro = Faturamento × Margem. Duas alavancas (margem + faturamento),
// cada uma com "motores" liga/desliga, escada de margem, comparação de cenários
// e efeito composto. Modo lead esconde os controles de venda. Usada na aba
// "Calculadora" do modal do lead (Mapa + Plano de Vendas).

export interface RoiLead {
  name: string;
  email: string;
  phone?: string;
  revenue: number | null;
  revenueMatch?: "email" | "phone" | "name" | "time" | null;
  revenueMatchInfo?: EventRevenueMatchInfo | null;
}

/** Proximidade temporal compra × resposta: "7 min depois", "2 h antes". null se sem gap. */
export function matchGapLabel(info: EventRevenueMatchInfo | null | undefined): string | null {
  const g = info?.gapMinutes;
  if (g == null) return null;
  const abs = Math.abs(g);
  const rel = g >= 0 ? "depois" : "antes";
  if (abs < 60) return `${abs} min ${rel}`;
  if (abs < 1440) return `${Math.round(abs / 60)} h ${rel}`;
  return `${Math.round(abs / 1440)} d ${rel}`;
}

// Match por nome com compra e resposta a ~1h é praticamente a mesma pessoa
// (só errou o email) — não precisa alarmar.
const STRONG_GAP_MIN = 60;

type MatchTone = "ok" | "warn";
export interface MatchDisplay {
  tone: MatchTone;
  label: string;
  title: string;
}

/**
 * Fonte única do selo/aviso de match (tabela + modal). null = email (confiável,
 * sem selo) ou sem match. "ok" = verde discreto; "warn" = âmbar "confirme".
 */
export function matchDisplay(
  revenueMatch: "email" | "phone" | "name" | "time" | null | undefined,
  info: EventRevenueMatchInfo | null | undefined,
): MatchDisplay | null {
  if (!revenueMatch || revenueMatch === "email") return null;
  const gap = matchGapLabel(info);
  if (revenueMatch === "phone") {
    return {
      tone: "ok",
      label: "✓ por telefone",
      title: "Casado pelo telefone — comprou e respondeu a pesquisa com emails diferentes, mas o telefone bate.",
    };
  }
  if (revenueMatch === "time") {
    return {
      tone: "warn",
      label: `⏱️ horário${gap ? ` · ${gap}` : ""}`,
      title: `Casado pelo HORÁRIO — resposta anônima da pesquisa enviada ${gap ?? "perto"} da compra. Provável, mas sem email/nome pra confirmar.`,
    };
  }
  // name: forte (≤ 1h) → verde; senão → âmbar "confirme".
  const strong = info?.gapMinutes != null && Math.abs(info.gapMinutes) <= STRONG_GAP_MIN;
  const named = info?.buyAt && gap
    ? `Casado pelo nome. Comprou em ${info.buyAt} e respondeu a pesquisa ${gap}.`
    : "Casado pelo nome, sem horário de compra pra cruzar. Confirme se é a mesma pessoa.";
  return strong
    ? { tone: "ok", label: `✓ por nome${gap ? ` · ${gap}` : ""}`, title: named }
    : { tone: "warn", label: "⚠️ confirme", title: named };
}

/** Selo de match (tabela/card): verde se confiável, âmbar se precisa confirmar. */
export function RevenueMatchBadge({
  revenueMatch,
  info,
}: {
  revenueMatch?: "email" | "phone" | "name" | "time" | null;
  info?: EventRevenueMatchInfo | null;
}) {
  const d = matchDisplay(revenueMatch, info);
  if (!d) return null;
  return (
    <div
      className={`mt-0.5 text-[10px] font-normal cursor-help ${d.tone === "ok" ? "text-emerald-400/90" : "text-amber-400/90"}`}
      title={d.title}
    >
      {d.label}
    </div>
  );
}

// ---- Motores (fixos, idênticos ao HTML) ----
interface Motor {
  id: string;
  nm: string;
  pts: number;
  on: boolean;
  mech: string;
  cs: string;
}

const MARG: Motor[] = [
  { id: "cmv", nm: "CMV & Ficha Técnica", pts: 4.0, on: true, mech: "Custo real por prato e ficha revisada. O maior vazamento.", cs: "★ base do Edson" },
  { id: "prec", nm: "Precificação & Cardápio", pts: 3.0, on: true, mech: "Preço pelo número, não pelo feeling.", cs: "fim do preço no escuro" },
  { id: "card", nm: "Cardápio Enxuto", pts: 1.5, on: true, mech: "Corta o que não gira e insumo parado no estoque.", cs: "Edson: diminuiu cardápio" },
  { id: "comp", nm: "Compras & Fornecedores", pts: 1.5, on: true, mech: "Negociação e padronização — escala do grupo.", cs: "lista Bom Beef" },
  { id: "desp", nm: "Desperdício & Perdas", pts: 1.5, on: false, mech: "Controle de sobra, quebra e porcionamento.", cs: "dinheiro no lixo" },
  { id: "oper", nm: "Operação & Raio de Entrega", pts: 1.5, on: false, mech: "Cozinha eficiente, raio certo: menos custo.", cs: "Edson: ajustou raio" },
  { id: "gest", nm: "Gestão & Produtividade", pts: 1.0, on: false, mech: "Time com método, dono fora da operação.", cs: "Edson: saiu da cozinha" },
  { id: "ctrl", nm: "Controles & DRE", pts: 1.0, on: true, mech: "Medir ao centavo. A base que destrava o resto.", cs: "a fundação · Auditoria" },
];

const REV: Motor[] = [
  { id: "canais", nm: "Novos Canais / Plataformas", pts: 30, on: true, mech: "Explorar bem delivery/marketplaces.", cs: "Edson: plataformas estouraram" },
  { id: "salao", nm: "Salão / Venda Presencial", pts: 15, on: false, mech: "Ativar o salão: ponto, fachada, experiência.", cs: "Edson: salão maior" },
  { id: "escala", nm: "Escala / Nova Unidade", pts: 50, on: false, mech: "Multiplicar unidades, virar rede — o teto.", cs: "caminho da franquia" },
  { id: "ltv", nm: "Ticket Médio / Recompra", pts: 15, on: false, mech: "Combos, recompra, base ativa.", cs: "mais valor por cliente" },
];

// ---- Helpers ----
const fmt = (n: number) => "R$ " + Math.round(n).toLocaleString("pt-BR");
const pct = (n: number) => (Math.round(n * 10) / 10).toString().replace(".", ",") + "%";
const g1 = (x: number) => (Math.round(x * 10) / 10).toString().replace(".", ",");
const ptsLabel = (p: number) => p.toString().replace(".", ",");

/**
 * Modal do lead com abas "Infos" + "Calculadora".
 */
export function LeadDetailDialog({
  open, onOpenChange, lead, projectId, funnelId, stageId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  lead: RoiLead | null;
  projectId: string;
  funnelId: string;
  stageId: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-2xl p-0 overflow-hidden border-[#1f2937] bg-[#0b0b0d] text-white gap-0 sm:rounded-2xl">
        <DialogTitle className="sr-only">Detalhes do lead</DialogTitle>
        {lead && (
          <Tabs key={lead.email} defaultValue="roi" className="flex flex-col gap-0">
            <div className="px-4 pt-4">
              <TabsList className="grid w-full grid-cols-2 bg-[#1c1c1e] border border-[rgba(84,84,88,0.5)] p-1 h-auto">
                <TabsTrigger value="infos" className="gap-1.5 text-[12px] data-[state=active]:bg-[#2c2c2e] data-[state=active]:text-[#ffc24b] text-[rgba(235,235,245,0.62)]">
                  <ListChecks className="h-3.5 w-3.5" /> Infos
                </TabsTrigger>
                <TabsTrigger value="roi" className="gap-1.5 text-[12px] data-[state=active]:bg-[#2c2c2e] data-[state=active]:text-[#ffc24b] text-[rgba(235,235,245,0.62)]">
                  <Calculator className="h-3.5 w-3.5" /> Calculadora
                </TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="infos" className="mt-0">
              <LeadInfos lead={lead} projectId={projectId} funnelId={funnelId} stageId={stageId} />
            </TabsContent>
            <TabsContent value="roi" className="mt-0">
              <RoiCalculator lead={lead} />
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

function LeadInfos({
  lead, projectId, funnelId, stageId,
}: { lead: RoiLead; projectId: string; funnelId: string; stageId: string }) {
  const { data, isLoading, isError } = useEventLeadAnswers(
    projectId, funnelId, stageId, lead.email, lead.name, lead.phone, lead.revenueMatchInfo?.surveyAt,
  );
  const groups = data?.groups ?? [];
  const matchInfo = matchDisplay(lead.revenueMatch, lead.revenueMatchInfo);

  return (
    <div className="max-h-[80vh] overflow-y-auto">
      <div className="px-5 pt-4 pb-4 border-b border-[#d4af37]/50">
        <div className="text-[10px] tracking-[2px] uppercase font-bold text-[#d4af37]">Ficha do lead</div>
        <h2 className="text-lg font-extrabold mt-1 leading-tight truncate">{lead.name || lead.email}</h2>
        <p className="text-[12px] text-[#9ca3af] mt-0.5 truncate">{lead.email}</p>
        {matchInfo && (
          <div
            className={`mt-2 rounded-lg border px-3 py-2 text-[12px] ${
              matchInfo.tone === "ok"
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                : "border-amber-500/40 bg-amber-500/10 text-amber-200"
            }`}
          >
            {matchInfo.title}
          </div>
        )}
      </div>
      <div className="px-5 py-4 space-y-4">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-9 rounded-lg bg-[#1c1c1e] animate-pulse" />
            ))}
          </div>
        ) : isError ? (
          <p className="text-[13px] text-[#ff453a]">Não foi possível carregar as respostas deste lead.</p>
        ) : groups.length === 0 ? (
          <p className="text-[13px] text-[rgba(235,235,245,0.34)]">
            Nenhuma resposta encontrada nas planilhas para <strong className="text-[rgba(235,235,245,0.62)]">{lead.email}</strong>.
            Confira o mapeamento das planilhas na aba <strong className="text-[#d4af37]">Leads</strong>.
          </p>
        ) : (
          groups.map((gp, gi) => (
            <div key={gi} className="rounded-xl border border-[rgba(84,84,88,0.5)] overflow-hidden">
              <div className="px-3 py-2 bg-[#141c2e] border-b border-[rgba(84,84,88,0.5)] flex items-center justify-between gap-2">
                <span className="text-[12px] font-semibold text-white truncate">{gp.source}</span>
                <span className="text-[9px] uppercase tracking-[1px] text-[rgba(235,235,245,0.34)] shrink-0">
                  {gp.role === "survey" ? "Respostas" : gp.role === "participants" ? "Participantes" : gp.role}
                </span>
              </div>
              <dl className="divide-y divide-[rgba(84,84,88,0.5)]">
                {gp.answers.map((a, ai) => (
                  <div key={ai} className="px-3 py-2">
                    <dt className="text-[10px] uppercase tracking-[0.5px] text-[rgba(235,235,245,0.34)]">{a.label}</dt>
                    <dd className="text-[13px] text-white mt-0.5 break-words whitespace-pre-wrap">{a.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ---- Switch estilo iOS ----
function Sw({ on, onClick, blue }: { on: boolean; onClick: () => void; blue?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`relative shrink-0 w-[51px] h-[31px] rounded-2xl transition-colors duration-200 ${
        on ? (blue ? "bg-[#0a84ff]" : "bg-[#30d158]") : "bg-[rgba(120,120,128,0.22)]"
      }`}
    >
      <span
        className={`absolute top-[2px] left-[2px] w-[27px] h-[27px] rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.3)] transition-transform duration-300 ${
          on ? "translate-x-[20px]" : ""
        }`}
      />
    </button>
  );
}

function MotorRow({ m, on, onToggle, blue, fat }: { m: Motor; on: boolean; onToggle: () => void; blue?: boolean; fat: number }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5 border-t border-[rgba(84,84,88,0.5)] first:border-t-0">
      <div className="flex-1 min-w-0">
        <div className="text-[15px] font-medium flex items-center gap-2 flex-wrap leading-tight">
          {m.nm}
          <span className={`text-[11px] font-bold ${blue ? "text-[#0a84ff]" : "text-[#ffc24b]"} bg-[rgba(120,120,128,0.22)] px-1.5 py-0.5 rounded-full`}>
            +{ptsLabel(m.pts)}{blue ? "%" : " pts"}
          </span>
        </div>
        <div className="text-[12.5px] text-[rgba(235,235,245,0.62)] mt-0.5 leading-snug">
          {m.mech} <span className="text-[11px] font-semibold text-[#64d2ff]">{m.cs}</span>
        </div>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <div className={`text-[11px] font-bold text-[#30d158] min-h-[14px] transition-opacity ${on ? "opacity-100" : "opacity-0"}`}>
          {on ? "+" + fmt((fat * m.pts) / 100) : ""}
        </div>
        <Sw on={on} onClick={onToggle} blue={blue} />
      </div>
    </div>
  );
}

const SECH = "text-[13px] font-semibold tracking-[0.3px] uppercase text-[rgba(235,235,245,0.62)] px-1 pb-2";
const GROUP = "bg-[#1c1c1e] rounded-2xl border border-[rgba(84,84,88,0.5)] overflow-hidden shadow-[0_10px_40px_rgba(0,0,0,0.42)]";
const NUMINPUT = "border-none bg-transparent text-[#ffc24b] text-[19px] font-semibold text-right w-[120px] outline-none tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

function RoiCalculator({ lead }: { lead: RoiLead }) {
  const [fatStr, setFatStr] = useState(lead.revenue != null ? String(lead.revenue) : "200000");
  const [segMode, setSegMode] = useState<"4" | "5" | "6" | "know">("5");
  const [m0Str, setM0Str] = useState("5");
  const [tkStr, setTkStr] = useState("15000");
  const [conservador, setConservador] = useState(true);
  const [margOn, setMargOn] = useState<boolean[]>(MARG.map((m) => m.on));
  const [revOn, setRevOn] = useState<boolean[]>(REV.map((m) => m.on));
  const [leadMode, setLeadMode] = useState(false);

  const c = useMemo(() => {
    const fat = Number(fatStr) || 0;
    const m0 = segMode === "know" ? Number(m0Str) || 0 : Number(segMode);
    const cap = conservador ? 16 : 18;

    let mpts = 0, nM = 0;
    MARG.forEach((m, i) => { if (margOn[i]) { mpts += m.pts; nM++; } });
    const mNew = Math.max(m0, Math.min(m0 + mpts, cap));

    let g = 0, nR = 0;
    REV.forEach((m, i) => { if (revOn[i]) { g += m.pts; nR++; } });
    const fatNew = fat * (1 + g / 100);

    // escada
    const tiers = [m0, (m0 + mNew) / 2, mNew];
    const tv = tiers.map((t) => (fat * t) / 100);
    const tmax = Math.max(...tv) || 1;
    const dMes = tv[2] - tv[0];

    // cenários
    const lHoje = (fat * m0) / 100;
    const lFat = (fatNew * m0) / 100;
    const lMarg = (fat * mNew) / 100;
    const lComp = (fatNew * mNew) / 100;
    const novo = lComp - lHoje;
    const ano = novo * 12;
    const mult = lHoje > 0 ? lComp / lHoje : 0;
    const max = Math.max(lComp, lHoje, lFat, lMarg) || 1;
    const r1 = lHoje > 0 ? lFat / lHoje : 0;

    return { fat, m0, cap, mpts, nM, mNew, g, nR, fatNew, tiers, tv, tmax, dMes, lHoje, lFat, lMarg, lComp, novo, ano, mult, max, r1 };
  }, [fatStr, segMode, m0Str, conservador, margOn, revOn]);

  function share() {
    const txt =
      "📊 Seu raio-X de margem\n\n" +
      "Faturamento: " + fmt(c.fat) + "/mês\n" +
      "Margem hoje (~" + pct(c.m0) + "): sobra ~" + fmt(c.lHoje) + "/mês\n" +
      "Mirando " + pct(c.mNew) + " de margem: ~" + fmt(c.lMarg) + "/mês\n\n" +
      "➡️ Só de margem, são " + fmt(c.dMes * 12) + "/ano que hoje vazam da operação.\n\n" +
      "Não é sorte, é sistema. Bora destravar essa margem? 💪";
    const nav = navigator as Navigator & { share?: (data: { text: string }) => Promise<void> };
    if (nav.share) nav.share({ text: txt }).catch(() => {});
    else window.open("https://wa.me/?text=" + encodeURIComponent(txt), "_blank");
  }

  const scn = [
    { c: "hoje", nm: "Hoje", sub: pct(c.m0) + " · fat atual", v: c.lHoje, bg: "bg-[#2c2c2e] text-[rgba(235,235,245,0.62)]" },
    { c: "fat", nm: "Só faturamento", sub: "cresce, margem " + pct(c.m0), v: c.lFat, bg: "bg-gradient-to-r from-[#a33] to-[#ff453a] text-white" },
    { c: "marg", nm: "Só margem", sub: pct(c.mNew) + ", fat igual", v: c.lMarg, bg: "bg-gradient-to-r from-[#caa040] to-[#ffc24b] text-[#1a1206]" },
    { c: "comp", nm: "⭐ Composto", sub: "margem + escala", v: c.lComp, bg: "bg-gradient-to-r from-[#1f9e54] to-[#30d158] text-[#04210f]" },
  ];

  return (
    <div className="max-h-[84vh] overflow-y-auto">
      {leadMode && (
        <button
          type="button"
          onClick={() => setLeadMode(false)}
          className="w-full flex items-center justify-center gap-2 bg-[#30d158] text-[#04210f] font-bold text-[15px] py-2.5 sticky top-0 z-10"
        >
          👁 Modo lead ativo — toque pra voltar
        </button>
      )}

      <div className="px-5 py-5 space-y-6">
        {/* Hero */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[13px] font-semibold text-[#30d158]">Lucro = Faturamento × Margem</div>
            <h1 className="text-[26px] sm:text-[30px] font-bold tracking-[-0.5px] leading-[1.1] mt-1">
              Margem destrava.<br />Escala multiplica.
            </h1>
            {!leadMode && (
              <p className="text-[rgba(235,235,245,0.62)] text-[14.5px] mt-2 max-w-md">
                A maioria não sabe a própria margem — então partimos da média do setor e subimos ligando motores reais. Não é sorte: é sistema.
              </p>
            )}
          </div>
          {!leadMode && (
            <button
              type="button"
              onClick={() => setLeadMode(true)}
              className="shrink-0 w-[34px] h-[34px] rounded-full border border-[rgba(84,84,88,0.5)] bg-[rgba(120,120,128,0.22)] flex items-center justify-center"
              title="Modo lead"
              aria-label="Modo lead"
            >
              <Eye className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* PASSO 1 — Ponto de partida */}
        {!leadMode && (
          <section>
            <div className={SECH}>Ponto de partida</div>
            <div className={GROUP}>
              <div className="flex items-center gap-3 px-4 py-3.5">
                <span className="text-[16px] font-medium flex-1">Faturamento / mês</span>
                <span className="text-[rgba(235,235,245,0.34)] text-[15px] font-semibold -mr-2">R$</span>
                <input type="number" inputMode="numeric" step={10000} value={fatStr} onChange={(e) => setFatStr(e.target.value)} className={NUMINPUT} />
              </div>
              <div className="px-4 py-3.5 border-t border-[rgba(84,84,88,0.5)]">
                <div className="text-[16px] font-medium mb-2.5">Margem hoje</div>
                <div className="flex bg-[rgba(120,120,128,0.22)] rounded-[10px] p-0.5">
                  {(["4", "5", "6", "know"] as const).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setSegMode(opt)}
                      className={`flex-1 text-[14px] font-semibold py-2 rounded-lg transition ${
                        segMode === opt ? "bg-[#2c2c2e] shadow-[0_1px_4px_rgba(0,0,0,0.22)] text-white" : "text-white/90"
                      }`}
                    >
                      {opt === "know" ? "Sei o nº" : opt + "%"}
                    </button>
                  ))}
                </div>
                {segMode === "know" ? (
                  <div className="flex items-center gap-3 mt-3">
                    <span className="text-[16px] font-medium flex-1">Margem real</span>
                    <input type="number" inputMode="decimal" step={0.5} value={m0Str} onChange={(e) => setM0Str(e.target.value)} className={NUMINPUT + " w-[80px]"} />
                    <span className="text-[rgba(235,235,245,0.34)] text-[15px] font-semibold">%</span>
                  </div>
                ) : (
                  <div className="text-[12.5px] text-[rgba(235,235,245,0.34)] text-center mt-2.5">A maioria não sabe — usando a média do setor (4–6%)</div>
                )}
              </div>
              <div className="flex items-center gap-3 px-4 py-3.5 border-t border-[rgba(84,84,88,0.5)]">
                <span className="text-[16px] font-medium flex-1">Ticket do programa</span>
                <span className="text-[rgba(235,235,245,0.34)] text-[15px] font-semibold -mr-2">R$</span>
                <input type="number" inputMode="numeric" step={1000} value={tkStr} onChange={(e) => setTkStr(e.target.value)} className={NUMINPUT} />
              </div>
            </div>
          </section>
        )}

        {/* PASSO 2 — Alavanca 1: Margem */}
        <section className="space-y-3">
          {!leadMode && (
            <>
              <div className={SECH}>Alavanca 1 · <span className="text-[#ffc24b]">Margem</span> — ligue os motores</div>
              <div className={GROUP}>
                {MARG.map((m, i) => (
                  <MotorRow key={m.id} m={m} on={margOn[i]} fat={c.fat} onToggle={() => setMargOn((arr) => arr.map((v, j) => (j === i ? !v : v)))} />
                ))}
              </div>
              <div className={GROUP}>
                <div className="flex items-center gap-3 px-4 py-3.5">
                  <div className="flex-1">
                    <div className="text-[16px] font-medium">Modo conservador</div>
                    <div className="text-[13px] text-[rgba(235,235,245,0.62)] mt-0.5">Trava a projeção em 16%. Número subestimado é inatacável.</div>
                  </div>
                  <Sw on={conservador} onClick={() => setConservador((v) => !v)} />
                </div>
              </div>
            </>
          )}
          {/* Gauge margem */}
          <div className={GROUP + " p-[18px]"}>
            <div className="flex items-baseline justify-between">
              <div>
                <div className="text-[13px] text-[rgba(235,235,245,0.62)]">de <span className="text-[#ff453a] font-bold">{pct(c.m0)}</span> hoje para</div>
                <div className="text-[42px] font-bold tracking-[-1px] text-[#30d158] leading-none">{pct(c.mNew)}</div>
              </div>
              <div className="text-[13px] text-[rgba(235,235,245,0.62)] text-right">{c.nM} motores<br />ligados</div>
            </div>
            <div className="h-3 rounded-[7px] bg-[rgba(120,120,128,0.22)] relative overflow-hidden mt-3.5">
              <div className="h-full rounded-[7px] bg-gradient-to-r from-[#ff453a] via-[#ffc24b] to-[#30d158] transition-[width] duration-500" style={{ width: Math.max(2, Math.min(100, (c.mNew / 20) * 100)) + "%" }} />
            </div>
            <div className="relative h-4 mt-1.5 text-[11px] font-semibold">
              <div className="absolute -translate-x-1/2 text-[#ff453a]" style={{ left: "25%" }}>▲ setor</div>
              <div className="absolute -translate-x-1/2 text-[#30d158]" style={{ left: "85%" }}>▲ Netão 16–18%</div>
            </div>
          </div>
        </section>

        {/* ESCADA */}
        <section className="space-y-3">
          <div className={SECH}>A escada da margem · <span className="text-[#30d158]">dinheiro no bolso</span></div>
          <div className={GROUP + " flex items-end justify-around gap-3.5 h-[200px] p-4"}>
            {c.tiers.map((t, i) => {
              const bar = ["bg-gradient-to-b from-[#ff6b61] to-[#ff453a]", "bg-gradient-to-b from-[#ffd36b] to-[#ffc24b]", "bg-gradient-to-b from-[#5fe393] to-[#30d158]"][i];
              const pctColor = i === 0 ? "text-[#ff453a]" : i === 2 ? "text-[#30d158]" : "text-[rgba(235,235,245,0.62)]";
              return (
                <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
                  <div className="text-[15px] font-bold mb-2 whitespace-nowrap">{fmt(c.tv[i])}</div>
                  <div className={`w-full max-w-[64px] rounded-t-lg rounded-b-[3px] transition-[height] duration-500 ${bar}`} style={{ height: Math.max(6, (c.tv[i] / c.tmax) * 100) + "%", minHeight: 12 }} />
                  <div className={`text-[14px] font-bold mt-2 ${pctColor}`}>{pct(t)}</div>
                </div>
              );
            })}
          </div>
          <div className="text-[15px] font-semibold leading-relaxed text-center">
            De <span className="text-[#ff453a]">{pct(c.m0)}</span> pra <span className="text-[#30d158]">{pct(c.mNew)}</span> = <span className="text-[#30d158]">{fmt(c.dMes)}/mês</span> · <span className="text-[#30d158]">{fmt(c.dMes * 12)}/ano</span> no bolso
          </div>
          <div className="text-[12.5px] text-[rgba(235,235,245,0.34)] italic leading-relaxed px-1">
            Mesmo faturamento — só a margem muda. É o slide do palco (5% · 10% · 15%), no número dele.
          </div>
        </section>

        {/* PASSO 3 — Alavanca 2: Faturamento */}
        <section className="space-y-3">
          {!leadMode && (
            <>
              <div className={SECH}>Alavanca 2 · <span className="text-[#0a84ff]">Faturamento</span> — o teto do Dia 2</div>
              <div className={GROUP}>
                {REV.map((m, i) => (
                  <MotorRow key={m.id} m={m} on={revOn[i]} blue fat={c.fat} onToggle={() => setRevOn((arr) => arr.map((v, j) => (j === i ? !v : v)))} />
                ))}
              </div>
            </>
          )}
          <div className={GROUP + " p-[18px]"}>
            <div className="flex items-baseline justify-between">
              <div className="text-[13px] text-[rgba(235,235,245,0.62)]">faturamento projetado</div>
              <div className="text-[30px] font-bold tracking-[-1px] text-[#0a84ff] leading-none">{fmt(c.fatNew)}</div>
            </div>
            <div className="text-[13px] text-[#0a84ff] text-right mt-1">+{pct(c.g)}</div>
          </div>
        </section>

        {/* RESULTADO */}
        <section className="space-y-3">
          <div className={SECH}>Resultado · <span className="text-[#30d158]">efeito composto</span></div>
          <div className="bg-[#1c1c1e] border border-[rgba(84,84,88,0.5)] rounded-[20px] p-5 shadow-[0_10px_40px_rgba(0,0,0,0.42)] relative overflow-hidden">
            <div className="flex flex-col gap-2.5">
              {scn.map((r) => (
                <div key={r.c} className="grid grid-cols-[96px_1fr] gap-2.5 items-center">
                  <div className="text-[12.5px] font-semibold leading-tight">
                    {r.nm}
                    <small className="block font-normal text-[rgba(235,235,245,0.34)] text-[10.5px] mt-0.5">{r.sub}</small>
                  </div>
                  <div className="h-[34px] bg-[rgba(120,120,128,0.22)] rounded-[9px] overflow-hidden relative">
                    <div className={`h-full flex items-center justify-end px-2.5 font-bold text-[13px] rounded-lg transition-[width] duration-500 whitespace-nowrap ${r.bg}`} style={{ width: Math.max(9, (r.v / c.max) * 100) + "%", minWidth: 52 }}>
                      {fmt(r.v)}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-end justify-between gap-3 mt-[18px] pt-[18px] border-t border-[rgba(84,84,88,0.5)]">
              <div>
                <div className="text-[12.5px] text-[rgba(235,235,245,0.62)]">Lucro composto / mês</div>
                <div className="text-[38px] font-bold tracking-[-1px] text-[#30d158] leading-none">{fmt(c.lComp)}</div>
              </div>
              <div className="text-[13px] font-bold text-[#30d158] bg-[rgba(48,209,88,0.14)] border border-[rgba(48,209,88,0.3)] px-2.5 py-1.5 rounded-full whitespace-nowrap">{g1(c.mult)}×</div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 mt-3.5">
              <div className="bg-[#0b0b0d] border border-[rgba(84,84,88,0.5)] rounded-xl px-3.5 py-3">
                <div className="text-[11.5px] text-[rgba(235,235,245,0.62)]">Dinheiro novo / mês</div>
                <div className="text-[19px] font-bold mt-0.5 text-[#30d158]">{(c.novo >= 0 ? "+" : "") + fmt(c.novo)}</div>
              </div>
              <div className="bg-[#0b0b0d] border border-[rgba(84,84,88,0.5)] rounded-xl px-3.5 py-3">
                <div className="text-[11.5px] text-[rgba(235,235,245,0.62)]">Por ano</div>
                <div className="text-[19px] font-bold mt-0.5 text-[#ffc24b]">{fmt(c.ano)}</div>
              </div>
            </div>

            <div className="text-[15px] font-semibold leading-relaxed text-center mt-3.5">
              {c.g > 0 && c.mpts > 0 ? (
                <>Só faturamento (+{pct(c.g)}), margem travada: lucro vai a só <span className="text-[#ff453a]">{g1(c.r1)}×</span>. Margem <span className="text-[#30d158]">+</span> escala: <span className="text-[#30d158]">{g1(c.mult)}× o lucro</span> — <span className="text-[#30d158]">{fmt(c.ano)}</span>/ano novos.</>
              ) : c.mpts > 0 ? (
                "Ligue também os motores de faturamento pra ver o composto."
              ) : (
                "Ligue os motores acima."
              )}
            </div>
          </div>

          <button type="button" onClick={share} className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold text-[15px] bg-[#30d158] text-[#04210f] transition active:scale-[0.97]">
            <Share2 className="h-4 w-4" /> Mandar o número pro lead
          </button>

          {!leadMode && (
            <div className="bg-[#1c1c1e] border border-[rgba(84,84,88,0.5)] border-l-[3px] border-l-[#ffc24b] rounded-r-2xl rounded-l-md px-4 py-4 italic text-[15px] leading-relaxed shadow-[0_10px_40px_rgba(0,0,0,0.42)]">
              <span className="text-[11px] tracking-[0.6px] uppercase font-bold text-[#ffc24b] not-italic block mb-1.5">Pra falar — rodando com ele</span>
              "Lucro é faturamento vezes margem. Hoje, na margem do setor, sobra <b className="not-italic text-white">{fmt(c.lHoje)}</b>. Se você só crescer faturamento e manter 5%, dobra de tamanho e o lucro mal mexe — o vazamento dobra junto. Agora, destravando a margem pra <b className="not-italic text-white">{pct(c.mNew)}</b> <span className="not-italic">E</span> crescendo, o lucro vai pra <b className="not-italic text-white">{fmt(c.lComp)}</b>: <b className="not-italic text-white">{g1(c.mult)}×</b> o de hoje. Isso é composto — não é sorte, é sistema."
            </div>
          )}

          <div className="text-[12.5px] text-[rgba(235,235,245,0.34)] italic leading-relaxed px-1">
            Números de demonstração — pontos por motor são conservadores e ilustrativos. A Auditoria de Margem (14 dias) calibra cada motor no CMV/DRE real. Margem trava em 16–18% (a do Netão).
          </div>
        </section>
      </div>
    </div>
  );
}
