"use client";

/**
 * O dashboard do Plausible dentro do Loyola X.
 *
 * Reproduz o recorte da tela do próprio Plausible — visitantes agora, os seis
 * números do topo, o gráfico e os quatro blocos de quebra com abas — porque o
 * pedido foi ver aquilo aqui, sem trocar de aba do navegador. Cada linha traz a
 * barra de proporção e o percentual, que é como o time lê "de onde veio".
 *
 * Tudo chega numa chamada só: o servidor dispara as ~14 consultas em paralelo e
 * devolve pronto. Fazer isso no navegador multiplicaria a latência e exigiria a
 * chave da API no cliente.
 */

import { useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  usePlausibleDashboard,
  type BlocoBreakdown,
  type PlausiblePeriodo,
} from "@/lib/hooks/use-plausible";

const nf = new Intl.NumberFormat("pt-BR");
const pf = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 });

const PERIODOS: Array<{ valor: PlausiblePeriodo; label: string }> = [
  { valor: "day", label: "Hoje" },
  { valor: "7d", label: "7 dias" },
  { valor: "30d", label: "30 dias" },
  { valor: "month", label: "Este mês" },
  { valor: "6mo", label: "6 meses" },
  { valor: "12mo", label: "12 meses" },
];

/** Rótulos das abas. A ordem é a mesma da tela do Plausible. */
const ABAS: Record<string, string> = {
  channels: "Canais",
  sources: "Origens",
  campaigns: "Campanhas",
  pages: "Páginas",
  entry: "Entrada",
  exit: "Saída",
  countries: "Países",
  regions: "Regiões",
  cities: "Cidades",
  browsers: "Navegador",
  os: "Sistema",
  devices: "Dispositivo",
};

function duracao(segundos: number): string {
  if (segundos <= 0) return "0s";
  const m = Math.floor(segundos / 60);
  const s = Math.round(segundos % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/** "2026-08-18 17:00:00" → "17h"; "2026-08-18" → "18/08"; "2026-08" → "ago/26". */
function rotuloEixo(label: string): string {
  if (label.includes(" ")) return `${label.slice(11, 13)}h`;
  const partes = label.split("-");
  if (partes.length === 3) return `${partes[2]}/${partes[1]}`;
  if (partes.length === 2) {
    const meses = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
    return `${meses[Number(partes[1]) - 1] ?? partes[1]}/${partes[0].slice(2)}`;
  }
  return label;
}

interface Props {
  projectId: string;
  /** Filtro de página da etapa. Vazio = o site inteiro, como no painel. */
  pageFilter?: string | null;
  /** Cabeçalho com o nome do site e o botão de trocar a fonte. */
  header?: React.ReactNode;
}

export function PlausibleDashboard({ projectId, pageFilter, header }: Props) {
  const [periodo, setPeriodo] = useState<PlausiblePeriodo>("30d");
  const dash = usePlausibleDashboard(projectId, { periodo, pageFilter, enabled: true });

  return (
    <div className="space-y-4">
      {header}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {/* Visitantes agora: o indicador que abre a tela do Plausible. */}
          <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/5 px-2.5 py-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
            <span className="relative flex h-2 w-2">
              {(dash.data?.agora ?? 0) > 0 && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
              )}
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            {nf.format(dash.data?.agora ?? 0)} agora
          </span>
          {dash.isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </div>

        <div className="flex flex-wrap items-center gap-1">
          {PERIODOS.map((p) => (
            <Button
              key={p.valor}
              variant={periodo === p.valor ? "secondary" : "ghost"}
              size="sm"
              className="h-7 px-2 text-[11px]"
              onClick={() => setPeriodo(p.valor)}
            >
              {p.label}
            </Button>
          ))}
        </div>
      </div>

      {dash.isLoading ? (
        <Skeleton className="h-72" />
      ) : dash.isError ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-red-500">
          <span>{dash.error instanceof Error ? dash.error.message : "Erro ao consultar o Plausible."}</span>
          <Button variant="ghost" size="sm" className="h-6 gap-1 px-2 text-[10px]" onClick={() => dash.refetch()}>
            <RefreshCw className="h-3 w-3" /> Tentar de novo
          </Button>
        </div>
      ) : dash.data ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <Kpi label="Visitantes" value={nf.format(dash.data.totals.visitors)} />
            <Kpi label="Visitas" value={nf.format(dash.data.totals.visits)} />
            <Kpi label="Visualizações" value={nf.format(dash.data.totals.pageviews)} />
            <Kpi label="Views por visita" value={dash.data.totals.viewsPerVisit.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} />
            <Kpi label="Rejeição" value={pf.format(dash.data.totals.bounceRate)} />
            <Kpi label="Duração" value={duracao(dash.data.totals.visitDuration)} />
          </div>

          <section className="rounded-xl border border-border/40 bg-card/60 p-3">
            {dash.data.serie.length === 0 ? (
              <p className="py-10 text-center text-xs text-muted-foreground">Sem tráfego no período.</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={dash.data.serie.map((p) => ({ ...p, eixo: rotuloEixo(p.label) }))}>
                  <defs>
                    <linearGradient id="plausible-visitors" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" vertical={false} />
                  <XAxis dataKey="eixo" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={16} />
                  <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={32} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ fontSize: 11, borderRadius: 8 }}
                    formatter={(v, nome) => [nf.format(Number(v ?? 0)), nome === "visitors" ? "Visitantes" : "Visualizações"]}
                  />
                  <Area type="monotone" dataKey="visitors" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#plausible-visitors)" />
                  <Area type="monotone" dataKey="pageviews" stroke="hsl(var(--muted-foreground))" strokeWidth={1} strokeDasharray="4 3" fill="none" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <BlocoComAbas titulo="Principais fontes" blocos={dash.data.fontes} />
            <BlocoComAbas titulo="Páginas" blocos={dash.data.paginas} mono />
            <BlocoComAbas titulo="Localização" blocos={dash.data.locais} />
            <BlocoComAbas titulo="Dispositivos" blocos={dash.data.dispositivos} />
          </div>

          {dash.data.pageFilter && (
            <p className="text-[11px] text-muted-foreground">
              Filtrado pelas páginas que contêm <code>{dash.data.pageFilter}</code> — no painel do
              Plausible, sem filtro, os números são os do site inteiro.
            </p>
          )}
        </>
      ) : null}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/30 bg-muted/20 px-3 py-2">
      <p className="text-lg font-semibold">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

/**
 * Um bloco do painel: título, abas e as linhas com barra de proporção.
 *
 * A barra fica ATRÁS do texto, como no Plausible — é o que deixa a leitura
 * "quem domina" imediata, sem precisar comparar números um a um.
 */
function BlocoComAbas({
  titulo,
  blocos,
  mono,
}: {
  titulo: string;
  blocos: BlocoBreakdown[];
  mono?: boolean;
}) {
  const [ativa, setAtiva] = useState(blocos[0]?.chave ?? "");
  const bloco = blocos.find((b) => b.chave === ativa) ?? blocos[0];

  return (
    <section className="rounded-xl border border-border/40 bg-card/60 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-semibold">{titulo}</h4>
        <div className="flex gap-1">
          {blocos.map((b) => (
            <button
              key={b.chave}
              type="button"
              onClick={() => setAtiva(b.chave)}
              className={`rounded px-1.5 py-0.5 text-[10px] transition-colors ${
                b.chave === (bloco?.chave ?? "")
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {ABAS[b.chave] ?? b.chave}
            </button>
          ))}
        </div>
      </div>

      {!bloco || bloco.rows.length === 0 ? (
        <p className="py-6 text-center text-[11px] text-muted-foreground">Sem dados no período.</p>
      ) : (
        <div className="space-y-0.5">
          {bloco.rows.map((r, i) => (
            <div key={`${r.nome}-${i}`} className="relative flex items-center justify-between gap-2 rounded px-1.5 py-1 text-xs">
              <span
                className="absolute inset-y-0 left-0 rounded bg-primary/10"
                style={{ width: `${Math.max(r.share * 100, 1)}%` }}
                aria-hidden
              />
              <span className={`relative min-w-0 truncate ${mono ? "font-mono text-[11px]" : ""}`} title={r.nome}>
                {r.nome}
              </span>
              <span className="relative shrink-0 tabular-nums text-muted-foreground">
                {nf.format(r.visitors)}
                <span className="ml-1.5 text-[10px] opacity-70">{pf.format(r.share)}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
