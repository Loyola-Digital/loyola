"use client";

/**
 * O painel do Plausible, reproduzido dentro do Loyola X.
 *
 * O objetivo aqui é ser reconhecível: quem usa o Plausible tem de bater o olho e
 * ver a mesma tela. Por isso a paleta é a DELE (indigo sobre cartão branco), e
 * não os tokens do nosso design system — trocar as cores pelas nossas faria um
 * painel parecido, não o mesmo painel. As duas variantes de tema vêm escritas à
 * mão porque essas cores não existem nos nossos tokens.
 *
 * Estrutura, igual à do original: barra de métricas clicáveis que trocam a
 * curva do gráfico, e quatro blocos com abas, cada linha com a barra de
 * proporção atrás do texto e o "Detalhes" abrindo a lista inteira.
 *
 * Tudo chega numa chamada só — inclusive a comparação com o período anterior e
 * as listas completas dos modais. Trocar de aba ou abrir "Detalhes" não vai à
 * rede: os dados já estão na mão, e o painel responde na hora.
 */

import { useState } from "react";
import { ArrowDown, ArrowUp, List, Loader2, RefreshCw } from "lucide-react";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  usePlausibleDashboard,
  type BlocoBreakdown,
  type PlausibleDashboardCompleto,
  type PlausiblePeriodo,
} from "@/lib/hooks/use-plausible";

const nf = new Intl.NumberFormat("pt-BR");
const pf1 = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 });

const PERIODOS: Array<{ valor: PlausiblePeriodo; label: string }> = [
  { valor: "day", label: "Hoje" },
  { valor: "7d", label: "7 dias" },
  { valor: "30d", label: "30 dias" },
  { valor: "month", label: "Este mês" },
  { valor: "6mo", label: "6 meses" },
  { valor: "12mo", label: "12 meses" },
];

type ChaveMetrica = "visitors" | "visits" | "pageviews" | "viewsPerVisit" | "bounceRate" | "visitDuration";

interface DefMetrica {
  chave: ChaveMetrica;
  label: string;
  formata: (v: number) => string;
  /** Rejeição caindo é bom — a seta verde/vermelha inverte. */
  menorEhMelhor?: boolean;
}

const METRICAS: DefMetrica[] = [
  { chave: "visitors", label: "Visitantes únicos", formata: (v) => nf.format(v) },
  { chave: "visits", label: "Visitas totais", formata: (v) => nf.format(v) },
  { chave: "pageviews", label: "Visualizações", formata: (v) => nf.format(v) },
  { chave: "viewsPerVisit", label: "Views por visita", formata: (v) => v.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) },
  { chave: "bounceRate", label: "Taxa de rejeição", formata: (v) => pf1.format(v), menorEhMelhor: true },
  { chave: "visitDuration", label: "Duração da visita", formata: (v) => duracao(v) },
];

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

/** Cabeçalho da coluna da esquerda, como no painel ("Source", "Page"…). */
const COLUNA: Record<string, string> = {
  channels: "Canal",
  sources: "Origem",
  campaigns: "Campanha",
  pages: "Página",
  entry: "Página de entrada",
  exit: "Página de saída",
  countries: "País",
  regions: "Região",
  cities: "Cidade",
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
  header?: React.ReactNode;
}

export function PlausibleDashboard({ projectId, pageFilter, header }: Props) {
  const [periodo, setPeriodo] = useState<PlausiblePeriodo>("30d");
  const [metrica, setMetrica] = useState<ChaveMetrica>("visitors");
  const dash = usePlausibleDashboard(projectId, { periodo, pageFilter, enabled: true });
  const d = dash.data;

  return (
    <div className="space-y-4">
      {header}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[13px] font-medium text-emerald-600 dark:text-emerald-400">
          <span className="relative flex h-2 w-2">
            {(d?.agora ?? 0) > 0 && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
            )}
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          {nf.format(d?.agora ?? 0)} visitantes agora
          {dash.isFetching && <Loader2 className="ml-1 h-3 w-3 animate-spin text-gray-400" />}
        </span>

        <div className="flex flex-wrap items-center gap-1">
          {PERIODOS.map((p) => (
            <button
              key={p.valor}
              type="button"
              onClick={() => setPeriodo(p.valor)}
              className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
                periodo === p.valor
                  ? "bg-indigo-600 font-medium text-white"
                  : "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {dash.isLoading ? (
        <Skeleton className="h-80" />
      ) : dash.isError ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-red-500">
          <span>{dash.error instanceof Error ? dash.error.message : "Erro ao consultar o Plausible."}</span>
          <Button variant="ghost" size="sm" className="h-6 gap-1 px-2 text-[10px]" onClick={() => dash.refetch()}>
            <RefreshCw className="h-3 w-3" /> Tentar de novo
          </Button>
        </div>
      ) : d ? (
        <>
          {/* Cartão de métricas + gráfico, como no painel: um bloco só. */}
          <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="grid grid-cols-2 divide-x divide-gray-100 border-b border-gray-100 md:grid-cols-3 lg:grid-cols-6 dark:divide-gray-800 dark:border-gray-800">
              {METRICAS.map((m) => (
                <BotaoMetrica
                  key={m.chave}
                  def={m}
                  valor={d.totals[m.chave]}
                  anterior={d.anterior?.[m.chave] ?? null}
                  ativa={metrica === m.chave}
                  onClick={() => setMetrica(m.chave)}
                />
              ))}
            </div>

            <div className="p-3">
              {d.serie.length === 0 ? (
                <p className="py-16 text-center text-xs text-gray-500">Sem tráfego no período.</p>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={d.serie.map((p) => ({ ...p, eixo: rotuloEixo(p.label) }))} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="plausible-fill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#4f46e5" stopOpacity={0.22} />
                        <stop offset="100%" stopColor="#4f46e5" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-gray-200 dark:text-gray-800" vertical={false} />
                    <XAxis dataKey="eixo" tick={{ fontSize: 11, fill: "currentColor" }} className="text-gray-500" tickLine={false} axisLine={false} minTickGap={20} />
                    <YAxis
                      tick={{ fontSize: 11, fill: "currentColor" }}
                      className="text-gray-500"
                      tickLine={false}
                      axisLine={false}
                      width={40}
                      tickFormatter={(v: number) =>
                        metrica === "bounceRate" ? `${Math.round(v * 100)}%` : metrica === "visitDuration" ? duracao(v) : nf.format(v)
                      }
                    />
                    <Tooltip
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid rgba(0,0,0,.08)" }}
                      labelStyle={{ fontWeight: 600 }}
                      formatter={(v) => [
                        METRICAS.find((m) => m.chave === metrica)!.formata(Number(v ?? 0)),
                        METRICAS.find((m) => m.chave === metrica)!.label,
                      ]}
                    />
                    <Area type="monotone" dataKey={metrica} stroke="#4f46e5" strokeWidth={2} fill="url(#plausible-fill)" dot={false} activeDot={{ r: 4 }} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <Bloco titulo="Principais fontes" blocos={d.fontes} baseUrl={d.baseUrl} comFavicon={["sources"]} />
            <Bloco titulo="Páginas" blocos={d.paginas} baseUrl={d.baseUrl} mono />
            <Bloco titulo="Localização" blocos={d.locais} baseUrl={d.baseUrl} />
            <Bloco titulo="Dispositivos" blocos={d.dispositivos} baseUrl={d.baseUrl} />
          </div>

          {d.pageFilter && (
            <p className="text-[11px] text-gray-500">
              Filtrado pelas páginas que contêm <code>{d.pageFilter}</code>. Sem filtro, os números são
              os do site inteiro — iguais aos do painel.
            </p>
          )}
        </>
      ) : null}
    </div>
  );
}

/** Um dos seis números do topo. Clicar troca a curva do gráfico. */
function BotaoMetrica({
  def,
  valor,
  anterior,
  ativa,
  onClick,
}: {
  def: DefMetrica;
  valor: number;
  anterior: number | null;
  ativa: boolean;
  onClick: () => void;
}) {
  // Sem base anterior não há variação: mostrar "+100%" porque ontem era zero
  // seria inventar tendência onde só há um começo.
  const variacao = anterior && anterior > 0 ? (valor - anterior) / anterior : null;
  const subiu = (variacao ?? 0) > 0;
  const bom = def.menorEhMelhor ? !subiu : subiu;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative px-3 py-2.5 text-left transition-colors ${
        ativa ? "bg-indigo-50/60 dark:bg-indigo-500/10" : "hover:bg-gray-50 dark:hover:bg-gray-800/50"
      }`}
    >
      {ativa && <span className="absolute inset-x-0 top-0 h-0.5 bg-indigo-600" />}
      <span className="block truncate text-[10px] font-medium uppercase tracking-wide text-gray-500">
        {def.label}
      </span>
      <span className="mt-0.5 flex items-baseline gap-1.5">
        <span className="text-xl font-bold text-gray-900 dark:text-gray-100">{def.formata(valor)}</span>
        {variacao !== null && Math.abs(variacao) >= 0.005 && (
          <span className={`flex items-center text-[10px] font-medium ${bom ? "text-emerald-600" : "text-red-500"}`}>
            {subiu ? <ArrowUp className="h-2.5 w-2.5" /> : <ArrowDown className="h-2.5 w-2.5" />}
            {Math.abs(Math.round(variacao * 100))}%
          </span>
        )}
      </span>
    </button>
  );
}

/** Cartão com abas, cabeçalho de colunas, barras de proporção e "Detalhes". */
function Bloco({
  titulo,
  blocos,
  baseUrl,
  mono,
  comFavicon,
}: {
  titulo: string;
  blocos: BlocoBreakdown[];
  baseUrl: string;
  mono?: boolean;
  /** Chaves de aba que mostram o ícone da origem, servido pela própria instância. */
  comFavicon?: string[];
}) {
  const [ativa, setAtiva] = useState(blocos[0]?.chave ?? "");
  const [detalhes, setDetalhes] = useState(false);
  const bloco = blocos.find((b) => b.chave === ativa) ?? blocos[0];
  const mostraIcone = Boolean(bloco && comFavicon?.includes(bloco.chave));
  // O painel mostra nove linhas e joga o resto para o modal.
  const VISIVEIS = 9;
  const linhas = bloco?.rows ?? [];

  return (
    <section className="flex flex-col rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100">{titulo}</h4>
        <div className="flex gap-2">
          {blocos.map((b) => (
            <button
              key={b.chave}
              type="button"
              onClick={() => setAtiva(b.chave)}
              className={`text-[11px] transition-colors ${
                b.chave === (bloco?.chave ?? "")
                  ? "font-medium text-indigo-600 underline underline-offset-4 dark:text-indigo-400"
                  : "text-gray-500 hover:text-gray-900 dark:hover:text-gray-200"
              }`}
            >
              {ABAS[b.chave] ?? b.chave}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between border-b border-gray-100 pb-1.5 text-[10px] font-medium uppercase tracking-wide text-gray-500 dark:border-gray-800">
        <span>{COLUNA[bloco?.chave ?? ""] ?? "Item"}</span>
        <span>Visitantes</span>
      </div>

      <div className="mt-1 flex-1 space-y-0.5">
        {linhas.length === 0 ? (
          <p className="py-8 text-center text-[11px] text-gray-500">Sem dados no período.</p>
        ) : (
          linhas.slice(0, VISIVEIS).map((r, i) => (
            <Linha key={`${r.nome}-${i}`} linha={r} baseUrl={baseUrl} mono={mono} icone={mostraIcone} />
          ))
        )}
      </div>

      {linhas.length > VISIVEIS && (
        <button
          type="button"
          onClick={() => setDetalhes(true)}
          className="mt-2 flex items-center gap-1 self-start text-[10px] font-medium uppercase tracking-wide text-gray-500 transition-colors hover:text-indigo-600"
        >
          <List className="h-3 w-3" /> Detalhes
        </button>
      )}

      <Dialog open={detalhes} onOpenChange={setDetalhes}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm">
              {titulo} · {ABAS[bloco?.chave ?? ""] ?? ""}
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-0.5 overflow-y-auto pr-1">
            {linhas.map((r, i) => (
              <Linha key={`d-${r.nome}-${i}`} linha={r} baseUrl={baseUrl} mono={mono} icone={mostraIcone} />
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function Linha({
  linha,
  baseUrl,
  mono,
  icone,
}: {
  linha: { nome: string; visitors: number; share: number };
  baseUrl: string;
  mono?: boolean;
  icone?: boolean;
}) {
  return (
    <div className="relative flex items-center justify-between gap-2 py-1 text-[13px]">
      {/* A barra fica ATRÁS do texto, como no painel: a leitura de "quem domina"
          é imediata, sem comparar número por número. */}
      <span
        className="absolute inset-y-0 left-0 rounded-sm bg-indigo-100 dark:bg-indigo-500/20"
        style={{ width: `${Math.max(linha.share * 100, 0.5)}%` }}
        aria-hidden
      />
      <span className="relative flex min-w-0 items-center gap-1.5 pl-1.5">
        {icone && (
          // O favicon vem da própria instância (o Plausible expõe
          // /favicon/sources/:nome) — nada de bater em serviço de terceiro.
          <img
            src={`${baseUrl}/favicon/sources/${encodeURIComponent(linha.nome)}`}
            alt=""
            width={16}
            height={16}
            className="h-4 w-4 shrink-0 rounded-sm"
            loading="lazy"
            onError={(e) => { e.currentTarget.style.visibility = "hidden"; }}
          />
        )}
        <span className={`truncate text-gray-900 dark:text-gray-200 ${mono ? "font-mono text-[12px]" : ""}`} title={linha.nome}>
          {linha.nome}
        </span>
      </span>
      <span className="relative shrink-0 pr-1.5 tabular-nums text-gray-600 dark:text-gray-400">
        {nf.format(linha.visitors)}
        <span className="ml-1.5 text-[11px] text-gray-400">{pf1.format(linha.share)}</span>
      </span>
    </div>
  );
}

export type { PlausibleDashboardCompleto };
