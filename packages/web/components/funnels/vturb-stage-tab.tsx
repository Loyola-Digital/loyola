"use client";

/**
 * VTurb — analytics da VSL dentro da etapa.
 *
 * A peça central é a CURVA DE RETENÇÃO com o ponto de pitch marcado: é onde o
 * operador de VSL vê quantos chegaram na oferta e onde a audiência cai. Os
 * demais números (play rate, engajamento, retenção no pitch, conversão)
 * existem pra contextualizar essa curva.
 *
 * Gráficos seguem o método de dataviz: uma série = uma cor, grid hairline
 * sólido, tooltip com o valor liderando, tabela equivalente.
 */

import { useState } from "react";
import {
  Video, Plus, Trash2, AlertCircle, Link2, Loader2, Target, TrendingDown,
} from "lucide-react";
import { toast } from "sonner";
import {
  Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  useVturbConnection, useSaveVturbConnection, useVturbPlayers, useVturbStagePlayers,
  useLinkVturbPlayer, useUnlinkVturbPlayer, useVturbOverview, type VturbPlayer,
} from "@/lib/hooks/use-vturb";
import { ChartCard, StatTile, VizTooltip, axisProps, gridProps, nf, nfCompact, VIZ_SERIES_1 } from "@/components/spy-conteudo/viz";

/**
 * Formatadores tolerantes de propósito. A API do VTurb devolve taxa como string
 * ("51.3") e número no mesmo objeto; a normalização vive no serviço da API, mas
 * aqui é a última linha de defesa — um campo inesperado não pode derrubar a
 * página inteira no error boundary do Next.
 */
const numero = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
};
const pct = (v: unknown) => {
  const n = numero(v);
  return n == null ? "—" : `${n.toFixed(1)}%`;
};
const brl = (v: unknown) => {
  const n = numero(v);
  return n == null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

/** Segundos → mm:ss. O eixo da retenção é tempo de vídeo, não número solto. */
function mmss(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.round(s % 60)).padStart(2, "0")}`;
}

function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

// ============================================================
// CONEXÃO
// ============================================================

function ConnectionCard({ projectId }: { projectId: string }) {
  const { data, isLoading } = useVturbConnection(projectId);
  const save = useSaveVturbConnection(projectId);
  const [token, setToken] = useState("");
  const [open, setOpen] = useState(false);

  if (isLoading) return <Skeleton className="h-24 rounded-xl" />;

  if (data?.connected) {
    return (
      <div className="flex items-center justify-between rounded-xl border border-border/40 bg-card px-4 py-2.5">
        <p className="text-xs text-muted-foreground">
          VTurb conectado · fuso <strong>{data.timezone}</strong>
        </p>
        <Button variant="ghost" size="sm" className="text-xs" onClick={() => setOpen(true)}>
          Trocar token
        </Button>
        <TokenDialog open={open} onOpenChange={setOpen} projectId={projectId} />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-dashed border-border/40 p-6 text-center">
      <Video className="mx-auto mb-2 h-7 w-7 text-muted-foreground" />
      <p className="text-sm font-medium">Conectar o VTurb</p>
      <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
        Gere um token em <strong>app.vturb.com → Configurações → Analytics API</strong> e cole aqui.
        O token fica criptografado e vale pro projeto inteiro.
      </p>
      <div className="mx-auto mt-3 flex max-w-md gap-2">
        <Input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Token do Analytics API"
        />
        <Button
          onClick={() =>
            save.mutate(
              { apiToken: token.trim() },
              {
                onSuccess: () => {
                  toast.success("VTurb conectado");
                  setToken("");
                },
                onError: (e) => toast.error(e instanceof Error ? e.message : "Token recusado"),
              },
            )
          }
          disabled={!token.trim() || save.isPending}
        >
          {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Conectar"}
        </Button>
      </div>
    </div>
  );
}

function TokenDialog({
  open, onOpenChange, projectId,
}: { open: boolean; onOpenChange: (o: boolean) => void; projectId: string }) {
  const save = useSaveVturbConnection(projectId);
  const [token, setToken] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Trocar token do VTurb</DialogTitle>
          <DialogDescription>
            O token é validado antes de salvar — se estiver errado, nada é gravado.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="vturb-token">Token</Label>
          <Input id="vturb-token" type="password" value={token} onChange={(e) => setToken(e.target.value)} />
          <Button
            className="w-full"
            disabled={!token.trim() || save.isPending}
            onClick={() =>
              save.mutate(
                { apiToken: token.trim() },
                {
                  onSuccess: () => { toast.success("Token atualizado"); onOpenChange(false); },
                  onError: (e) => toast.error(e instanceof Error ? e.message : "Token recusado"),
                },
              )
            }
          >
            Salvar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// PICKER DE VSL
// ============================================================

function PlayerPicker({
  projectId, stageId, open, onOpenChange,
}: { projectId: string; stageId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { data, isLoading } = useVturbPlayers(projectId, open);
  const link = useLinkVturbPlayer(projectId, stageId);
  const [busca, setBusca] = useState("");
  const [colado, setColado] = useState("");

  const todos = data?.players ?? [];

  // Mais recentes primeiro: numa conta compartilhada, a VSL que você acabou de
  // subir é quase sempre a que você quer vincular.
  const ordenados = [...todos].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));

  // Filtro no CLIENTE de propósito. /players/list não é paginado (vem a conta
  // inteira numa tacada) e a cota de queries é por conta — numa conta com muita
  // gente, cada busca no servidor roubaria cota de todo mundo.
  const termo = busca.trim().toLowerCase();
  const filtrados = termo
    ? ordenados.filter((p) => p.name.toLowerCase().includes(termo) || p.id.toLowerCase().includes(termo))
    : ordenados;

  /**
   * Vincular colando ID ou código embed. A API não expõe as pastas do painel,
   * então quem tem a VSL dentro de uma pasta navega lá, copia o embed e cola
   * aqui. Em vez de adivinhar o formato do ID por regex, procuramos qual dos
   * players da conta aparece dentro do texto colado — funciona com ID puro,
   * embed, iframe ou URL.
   */
  function vincularColado() {
    const txt = colado.trim();
    if (!txt) return;
    const achado = ordenados.find((p) => txt.includes(p.id));
    if (!achado) {
      toast.error("Não achei nenhuma VSL desta conta no texto colado. Confira se o ID está correto.");
      return;
    }
    vincular(achado);
  }

  function vincular(p: VturbPlayer) {
    link.mutate(
      {
        playerId: p.id,
        playerName: p.name,
        // duration e pitch_time vêm daqui e ficam salvos: a API do VTurb exige
        // os dois nos endpoints de stats e não os deduz do player.
        duration: p.duration ?? undefined,
        pitchTime: p.pitch_time ?? undefined,
      },
      {
        onSuccess: () => {
        toast.success(`${p.name} vinculada`);
        setBusca(""); setColado("");
        onOpenChange(false);
      },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao vincular"),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Vincular VSL</DialogTitle>
          <DialogDescription>
            A API da VTurb não expõe as pastas do painel — esta é a lista plana da conta
            inteira. Busque pelo nome, ou cole o ID/embed da VSL que está dentro da sua pasta.
          </DialogDescription>
        </DialogHeader>

        {/* Colar ID/embed — atalho pra quem organiza por pasta no painel VTurb. */}
        <div className="space-y-1.5 rounded-lg border border-border/40 p-2.5">
          <Label className="text-xs font-medium">Colar ID ou código embed</Label>
          <div className="flex gap-1.5">
            <Input
              value={colado}
              onChange={(e) => setColado(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); vincularColado(); } }}
              placeholder="Cole aqui o ID do player ou o embed inteiro"
              className="h-8 text-xs"
            />
            <Button size="sm" className="h-8 shrink-0" onClick={vincularColado} disabled={!colado.trim() || link.isPending}>
              Vincular
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            No painel da VTurb: abra a pasta, menu de 3 pontos do vídeo → Copiar código embed.
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-14" /><Skeleton className="h-14" />
          </div>
        ) : !todos.length ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nenhuma VSL encontrada nessa conta.
          </p>
        ) : (
          <div className="space-y-2">
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder={`Buscar entre ${todos.length} VSLs da conta...`}
              className="h-8 text-xs"
            />
            {filtrados.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nenhuma VSL com “{busca}”.
              </p>
            ) : (
              <div className="space-y-1.5">
                {filtrados.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => vincular(p)}
                    disabled={link.isPending}
                    className="flex w-full items-center gap-2 rounded-lg border border-border/40 p-2.5 text-left transition-colors hover:bg-muted/40"
                  >
                    <Video className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{p.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {p.duration ? `${mmss(p.duration)} de vídeo` : "sem duração cadastrada"}
                        {p.pitch_time ? ` · pitch em ${mmss(p.pitch_time)}` : ""}
                      </p>
                      {/* ID visível: é assim que se confere qual é qual quando
                          dois vídeos de pastas diferentes têm o mesmo nome. */}
                      <p className="truncate font-mono text-[10px] text-muted-foreground/70">{p.id}</p>
                    </div>
                    <Link2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// DASHBOARD DA VSL
// ============================================================

function VslDashboard({
  projectId, stageId, linkId,
}: { projectId: string; stageId: string; linkId: string }) {
  const [dias, setDias] = useState(30);
  const range = { startDate: isoDaysAgo(dias), endDate: isoDaysAgo(0) };
  const { data, isLoading, isFetching } = useVturbOverview(projectId, stageId, linkId, range);

  if (isLoading) return <Skeleton className="h-[420px] rounded-xl" />;
  if (!data) return null;

  const s = data.stats;
  const pitch = data.player.pitchTime;

  // Curva de retenção em % da audiência inicial: comparar "quantos usuários" em
  // absoluto entre VSLs de tráfego diferente não diz nada; o que importa é a
  // fração que sobrevive até cada ponto.
  const base = data.engagement?.grouped_timed?.[0]?.total_users ?? 0;
  const curva = (data.engagement?.grouped_timed ?? []).map((p) => ({
    timed: p.timed,
    label: mmss(p.timed),
    usuarios: p.total_users,
    retencao: base > 0 ? +((p.total_users / base) * 100).toFixed(1) : 0,
  }));

  return (
    <div className={`space-y-4 ${isFetching ? "opacity-70 transition-opacity" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">{data.player.name}</h3>
          <p className="text-[11px] text-muted-foreground">
            {data.player.duration ? `${mmss(data.player.duration)} de vídeo` : "sem duração"}
            {pitch ? ` · pitch em ${mmss(pitch)}` : " · sem ponto de pitch"}
          </p>
        </div>
        <div className="inline-flex rounded-md border border-border/50 p-0.5 text-xs">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDias(d)}
              className={`rounded px-2.5 py-1 transition-colors ${
                dias === d ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Play rate" value={pct(s.play_rate)} sub={`${nfCompact(s.total_started)} plays`} accent />
        <StatTile label="Engajamento" value={pct(s.engagement_rate)} sub="tempo médio ÷ duração" />
        <StatTile
          label="Chegaram no pitch"
          value={pct(s.over_pitch_rate)}
          sub={pitch ? `${nfCompact(s.total_over_pitch)} de ${nfCompact(s.total_over_pitch + s.total_under_pitch)}` : "pitch não configurado"}
        />
        <StatTile
          label="Conversão"
          value={pct(s.overall_conversion_rate)}
          sub={`${nf(s.total_conversions)} vendas · ${brl(s.total_amount_brl)}`}
        />
        <StatTile label="Views" value={nfCompact(s.total_viewed)} sub={`${nfCompact(s.total_viewed_device_uniq)} dispositivos únicos`} />
        <StatTile label="Assistiram até o fim" value={nfCompact(s.total_finished)} />
        <StatTile label="Cliques" value={nfCompact(s.total_clicked)} />
        <StatTile label="Período" value={`${dias}d`} sub={`${range.startDate} → ${range.endDate}`} />
      </div>

      {/* A curva. Sem duração cadastrada a API não devolve — dizemos por quê. */}
      {curva.length > 0 ? (
        <ChartCard
          title="Curva de retenção"
          hint="Quantos % da audiência inicial continuam assistindo em cada momento do vídeo"
          table={{
            head: ["Momento", "Usuários", "Retenção"],
            rows: curva.map((p) => [p.label, p.usuarios, `${p.retencao}%`]),
          }}
        >
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={curva} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="vturbRet" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={VIZ_SERIES_1} stopOpacity={0.18} />
                    <stop offset="100%" stopColor={VIZ_SERIES_1} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...gridProps} />
                <XAxis
                  dataKey="label"
                  {...axisProps}
                  interval={curva.length > 24 ? Math.floor(curva.length / 12) : 0}
                />
                <YAxis {...axisProps} width={44} tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
                <Tooltip
                  cursor={{ stroke: "var(--viz-axis)", strokeWidth: 1 }}
                  content={({ active, payload }) => {
                    const d = payload?.[0]?.payload as (typeof curva)[0] | undefined;
                    if (!d) return null;
                    return (
                      <VizTooltip
                        active={active}
                        title={`${d.label} de vídeo`}
                        rows={[
                          { label: "Retenção", value: `${d.retencao}%`, color: VIZ_SERIES_1 },
                          { label: "Usuários", value: nf(d.usuarios) },
                        ]}
                      />
                    );
                  }}
                />
                {/* O pitch é a linha que importa: tudo à direita dela é gente que
                    ouviu a oferta. Rótulo direto, não escondido no tooltip. */}
                {pitch != null && (
                  <ReferenceLine
                    x={mmss(pitch)}
                    stroke="var(--viz-series-2)"
                    strokeWidth={2}
                    label={{
                      value: "pitch",
                      position: "top",
                      fill: "var(--color-muted-foreground)",
                      fontSize: 10,
                    }}
                  />
                )}
                <Area
                  type="monotone"
                  dataKey="retencao"
                  stroke={VIZ_SERIES_1}
                  strokeWidth={2}
                  fill="url(#vturbRet)"
                  dot={false}
                  activeDot={{ r: 5, fill: VIZ_SERIES_1, stroke: "var(--color-card)", strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          {data.engagement && (
            <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <TrendingDown className="h-3 w-3" />
              Tempo médio assistido: <strong>{mmss(data.engagement.average_watched_time)}</strong>
            </p>
          )}
        </ChartCard>
      ) : (
        <div className="spy-viz rounded-xl border border-dashed border-border/40 p-6 text-center">
          <Target className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
          <p className="text-sm font-medium">Curva de retenção indisponível</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
            O VTurb exige a duração do vídeo pra calcular a retenção, e esta VSL está sem duração
            cadastrada. Preencha a duração no VTurb e revincule a VSL aqui.
          </p>
        </div>
      )}

      {/* Cliques por momento — onde no vídeo o CTA converte. */}
      {data.clicks.length > 0 && (
        <ChartCard
          title="Cliques por momento do vídeo"
          hint="Onde a audiência clica no CTA"
          table={{
            head: ["Momento", "Cliques"],
            rows: data.clicks.map((c) => [mmss(c.timed), c.total_users]),
          }}
        >
          <div className="h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={data.clicks.map((c) => ({ ...c, label: mmss(c.timed) }))}
                margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
              >
                <CartesianGrid {...gridProps} />
                <XAxis
                  dataKey="label"
                  {...axisProps}
                  interval={data.clicks.length > 24 ? Math.floor(data.clicks.length / 12) : 0}
                />
                <YAxis {...axisProps} width={44} tickFormatter={nfCompact} />
                <Tooltip
                  cursor={{ stroke: "var(--viz-axis)", strokeWidth: 1 }}
                  content={({ active, payload }) => {
                    const d = payload?.[0]?.payload as { label: string; total_users: number } | undefined;
                    if (!d) return null;
                    return (
                      <VizTooltip
                        active={active}
                        title={`${d.label} de vídeo`}
                        rows={[{ label: "Cliques", value: nf(d.total_users), color: VIZ_SERIES_1 }]}
                      />
                    );
                  }}
                />
                {pitch != null && (
                  <ReferenceLine x={mmss(pitch)} stroke="var(--viz-series-2)" strokeWidth={2} />
                )}
                <Area
                  type="monotone"
                  dataKey="total_users"
                  stroke={VIZ_SERIES_1}
                  strokeWidth={2}
                  fill="url(#vturbRet)"
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      )}
    </div>
  );
}

// ============================================================
// ABA
// ============================================================

export function VturbStageTab({ projectId, stageId }: { projectId: string; stageId: string }) {
  const { data: conn } = useVturbConnection(projectId);
  const { data: links, isLoading } = useVturbStagePlayers(projectId, stageId);
  const unlink = useUnlinkVturbPlayer(projectId, stageId);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [ativo, setAtivo] = useState<string | null>(null);

  const vinculadas = links?.players ?? [];
  const linkId = ativo ?? vinculadas[0]?.id ?? null;

  return (
    <div className="space-y-4">
      <ConnectionCard projectId={projectId} />

      {conn?.connected && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {isLoading ? (
              <Skeleton className="h-8 w-40" />
            ) : (
              vinculadas.map((p) => (
                <div key={p.id} className="group flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setAtivo(p.id)}
                    className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                      linkId === p.id
                        ? "border-primary bg-primary/10 font-medium text-primary"
                        : "border-border/50 text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {p.playerName}
                    {!p.duration && (
                      <Badge variant="secondary" className="ml-1.5 px-1 text-[9px]">sem duração</Badge>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      unlink.mutate(p.id, {
                        onSuccess: () => {
                          toast.success("VSL desvinculada");
                          if (ativo === p.id) setAtivo(null);
                        },
                      })
                    }
                    className="text-muted-foreground/40 opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                    aria-label={`Desvincular ${p.playerName}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))
            )}
            <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => setPickerOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              Vincular VSL
            </Button>
          </div>

          {linkId ? (
            <VslDashboard projectId={projectId} stageId={stageId} linkId={linkId} />
          ) : (
            <div className="rounded-xl border border-dashed border-border/40 p-10 text-center">
              <AlertCircle className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Nenhuma VSL vinculada a esta etapa ainda.
              </p>
            </div>
          )}

          <PlayerPicker
            projectId={projectId}
            stageId={stageId}
            open={pickerOpen}
            onOpenChange={setPickerOpen}
          />
        </>
      )}
    </div>
  );
}
