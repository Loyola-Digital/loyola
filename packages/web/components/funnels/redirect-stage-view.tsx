"use client";

/**
 * Etapa "Redirect" — o anúncio manda direto para o grupo de WhatsApp.
 *
 * ## O que esta etapa responde
 *
 * Nesta campanha ninguém se cadastra: não há formulário, não há planilha, não
 * há e-mail. A pergunta do time é uma só, e ela cruza duas fontes:
 *
 *     impressões → cliques no link (Meta) → visitas da página (pixel) → entrou no grupo (SendFlow)
 *
 * O número que manda é o **custo por entrada no grupo** — o CPL desta etapa,
 * onde "lead" é gente dentro do grupo.
 *
 * ## Por que a campanha do SendFlow é escolhida à mão
 *
 * O dashboard de grupos do FUNIL casa a campanha pelo nome (`sendflow-casamento`).
 * Aqui não: a etapa aponta para a campanha explicitamente, porque a campanha de
 * redirect costuma ter nome próprio (é uma oferta, não o lançamento) e porque o
 * mesmo funil pode ter duas etapas de redirect, cada uma com seus grupos.
 *
 * ## Por que a janela recorta o lado do grupo
 *
 * A Meta responde "últimos N dias"; o SendFlow devolve a campanha inteira. Sem
 * o recorte (`desdeIso`), a tabela mostraria entradas de meses atrás ao lado de
 * uma coluna de investimento vazia.
 */

import { useMemo, useState } from "react";
import {
  ArrowDownToLine,
  ArrowRightLeft,
  ArrowUpFromLine,
  DollarSign,
  Eye,
  MousePointerClick,
  Settings2,
  Users,
} from "lucide-react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
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
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { DayRangePicker } from "@/components/ui/day-range-picker";
import { useUpdateStage } from "@/lib/hooks/use-funnel-stages";
import { useCampaignPicker } from "@/lib/hooks/use-funnels";
import { useCampaignDailyInsightsBulk } from "@/lib/hooks/use-traffic-analytics";
import { useSendflowCampanhas, useSendflowReleaseSummary } from "@/lib/hooks/use-sendflow";
import { montarDiario } from "@/lib/utils/sendflow-diario";
import {
  desdeIso,
  metaPorDia,
  montarRedirectDiario,
  totaisDoRedirect,
} from "@/lib/utils/redirect-diario";
import { CampaignSelector } from "./campaign-selector";
import { StageDeleteSection } from "./stage-delete-section";
import { CampaignLogButton } from "./campaign-log-link";
import type { FunnelCampaign, FunnelStage } from "@loyola-x/shared";

const brl = (v: number | null | undefined) =>
  v == null
    ? "—"
    : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
const num = (v: number | null | undefined) =>
  v == null ? "—" : Math.round(v).toLocaleString("pt-BR");
const pct = (v: number | null | undefined) => (v == null ? "—" : `${v.toFixed(1)}%`);
const dataBR = (iso: string) => {
  const [a, m, d] = iso.split("-");
  return d && m && a ? `${d}/${m}` : iso;
};

function Kpi({
  icon,
  label,
  valor,
  sub,
  destaque,
}: {
  icon: React.ReactNode;
  label: string;
  valor: string;
  sub?: string;
  destaque?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-3 ${
        destaque ? "border-primary/40 bg-primary/5" : "border-border/40 bg-card/60"
      }`}
    >
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <p className="mt-0.5 text-xl font-bold tabular-nums">{valor}</p>
      {sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

interface RedirectStageViewProps {
  projectId: string;
  funnelId: string;
  funnelName: string;
  stage: FunnelStage;
}

export function RedirectStageView({
  projectId,
  funnelId,
  funnelName,
  stage,
}: RedirectStageViewProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [stageName, setStageName] = useState("");
  const [days, setDays] = useState(30);

  const updateStage = useUpdateStage(projectId, funnelId, stage.id);
  const campaignIds = useMemo(() => stage.campaigns.map((c) => c.id), [stage.campaigns]);
  const releases = stage.sendflowReleases ?? [];
  // Uma etapa = uma operação de grupos na prática; a primeira campanha é a da
  // etapa. O campo é lista para não precisar de migration se um dia a etapa
  // observar duas.
  const release = releases[0] ?? null;

  // O picker da Meta só é consultado com o painel aberto — é uma chamada por
  // conta do projeto.
  const { data: metaPicker } = useCampaignPicker(settingsOpen ? projectId : null);
  const sendflowCampanhas = useSendflowCampanhas(settingsOpen ? projectId : null);

  const metaDaily = useCampaignDailyInsightsBulk(
    campaignIds.length ? projectId : null,
    campaignIds.length ? campaignIds : null,
    days,
  );
  const grupo = useSendflowReleaseSummary(projectId, release?.id ?? null);

  const desde = useMemo(() => desdeIso(days), [days]);

  const linhas = useMemo(() => {
    const meta = metaPorDia([metaDaily.data ?? []]);
    const doGrupo = grupo.data
      ? montarDiario(
          grupo.data.entradas,
          grupo.data.saidas,
          grupo.data.cliques,
          grupo.data.disparos,
        )
      : [];
    return montarRedirectDiario(
      meta.filter((d) => d.date >= desde),
      doGrupo.filter((d) => d.date >= desde),
    );
  }, [metaDaily.data, grupo.data, desde]);

  const totais = useMemo(() => totaisDoRedirect(linhas), [linhas]);
  // Do mais antigo para o mais novo: é como o gráfico lê o tempo.
  const serie = useMemo(() => [...linhas].reverse(), [linhas]);

  const carregando = metaDaily.isLoading || grupo.isLoading;
  const semConfig = campaignIds.length === 0 && !release;

  async function salvarNome() {
    if (!stageName.trim() || stageName.trim() === stage.name) return;
    await updateStage.mutateAsync({ name: stageName.trim() });
    toast.success("Nome atualizado");
  }

  function salvarCampanhasMeta(campaigns: FunnelCampaign[]) {
    // Só `campaigns`, como a tela genérica da etapa: a conta da Meta é
    // resolvida no servidor a partir das contas do projeto, e mandar um
    // `metaAccountId` adivinhado aqui sobrescreveria o vínculo certo.
    updateStage.mutate(
      { campaigns },
      {
        onSuccess: () => toast.success("Campanhas Meta atualizadas"),
        onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar"),
      },
    );
  }

  function salvarRelease(id: string) {
    const escolhida = sendflowCampanhas.data?.releases.find((r) => r.id === id);
    updateStage.mutate(
      { sendflowReleases: escolhida ? [{ id: escolhida.id, name: escolhida.name }] : [] },
      {
        onSuccess: () => toast.success("Campanha do SendFlow vinculada"),
        onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar"),
      },
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">{funnelName}</p>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{stage.name}</h1>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 flex items-center gap-1">
              <ArrowRightLeft className="h-3 w-3" />
              Redirect
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            Do anúncio direto para o grupo — sem captação de lead no meio.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <DayRangePicker days={days} onDaysChange={setDays} />
          <CampaignLogButton projectId={projectId} funnelId={funnelId} />
          <Sheet
            open={settingsOpen}
            onOpenChange={(open) => {
              setSettingsOpen(open);
              if (open) setStageName(stage.name);
            }}
          >
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Settings2 className="h-3.5 w-3.5" />
                Configurar
              </Button>
            </SheetTrigger>
            <SheetContent className="w-full sm:max-w-md overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Configurações da Etapa</SheetTitle>
              </SheetHeader>
              <div className="space-y-6 mt-6">
                <div className="space-y-2">
                  <Label htmlFor="redirect-stage-name">Nome da etapa</Label>
                  <div className="flex gap-2">
                    <Input
                      id="redirect-stage-name"
                      value={stageName}
                      onChange={(e) => setStageName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && salvarNome()}
                    />
                    <Button
                      size="sm"
                      onClick={salvarNome}
                      disabled={
                        updateStage.isPending ||
                        !stageName.trim() ||
                        stageName.trim() === stage.name
                      }
                    >
                      Salvar
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Campanhas da Meta</Label>
                  <CampaignSelector
                    campaigns={metaPicker?.campaigns ?? []}
                    accountLinked={metaPicker?.accountLinked ?? !!stage.metaAccountId}
                    accounts={metaPicker?.accounts}
                    accountErrors={metaPicker?.accountErrors}
                    value={stage.campaigns}
                    onChange={salvarCampanhasMeta}
                    disabled={updateStage.isPending}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    O investimento, os cliques no link e as visitas da página (pixel) vêm
                    daqui.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Campanha do SendFlow (os grupos)</Label>
                  <Select value={release?.id ?? ""} onValueChange={salvarRelease}>
                    <SelectTrigger>
                      <SelectValue placeholder="Escolher a campanha" />
                    </SelectTrigger>
                    <SelectContent>
                      {(sendflowCampanhas.data?.releases ?? []).map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.name}
                          {r.archived ? " (arquivada)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">
                    É a campanha, não o grupo: só ela tem entradas e saídas por dia no
                    SendFlow. Todos os grupos dela contam.
                  </p>
                  {sendflowCampanhas.error && (
                    <p className="text-[11px] text-amber-600">
                      Não deu para listar as campanhas — confira a conexão do SendFlow em
                      Configurações.
                    </p>
                  )}
                </div>

                <StageDeleteSection
                  projectId={projectId}
                  funnelId={funnelId}
                  stageId={stage.id}
                  stageName={stage.name}
                />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {semConfig ? (
        <div className="rounded-xl border border-dashed border-border/60 p-8 text-center">
          <ArrowRightLeft className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-2 text-sm font-medium">Falta ligar as duas pontas</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Em <strong>Configurar</strong>: as campanhas da Meta (investimento e pixel) e a
            campanha do SendFlow (os grupos). Com as duas, a etapa compara quem clicou com
            quem entrou.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
            <Kpi
              icon={<DollarSign className="h-3 w-3" />}
              label="Investimento"
              valor={brl(totais.investimento)}
              sub={`${num(totais.impressoes)} impressões`}
            />
            <Kpi
              icon={<MousePointerClick className="h-3 w-3" />}
              label="Cliques no link"
              valor={num(totais.cliquesNoLink)}
              sub="contados pela Meta"
            />
            <Kpi
              icon={<Eye className="h-3 w-3" />}
              label="Visitas da página"
              valor={num(totais.visitasDaPagina)}
              sub={`${pct(totais.taxaCliqueParaPagina)} dos cliques · pixel`}
            />
            <Kpi
              icon={<ArrowDownToLine className="h-3 w-3" />}
              label="Entraram no grupo"
              valor={num(totais.entrou)}
              sub={`${pct(totais.taxaPaginaParaGrupo)} de quem visitou`}
            />
            <Kpi
              icon={<ArrowUpFromLine className="h-3 w-3" />}
              label="Saíram"
              valor={num(totais.saiu)}
              sub={`saldo ${num(totais.saldo)}`}
            />
            <Kpi
              icon={<DollarSign className="h-3 w-3" />}
              label="Custo por entrada"
              valor={brl(totais.custoPorEntrada)}
              sub={`${pct(totais.taxaCliqueParaGrupo)} clique → grupo`}
              destaque
            />
            <Kpi
              icon={<Users className="h-3 w-3" />}
              label="No grupo agora"
              valor={num(grupo.data?.totalParticipantes)}
              sub={
                grupo.data
                  ? `${grupo.data.grupos.length} ${grupo.data.grupos.length === 1 ? "grupo" : "grupos"}`
                  : "—"
              }
            />
          </div>

          {/* O aviso fica à vista: metade da comparação simplesmente não existe
              sem o SendFlow, e uma coluna de entradas zerada parece resultado. */}
          {release && grupo.error && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400">
              Não deu para ler a campanha <strong>{release.name}</strong> no SendFlow. Os
              números do grupo estão fora desta tela até a leitura voltar — o que aparece
              aqui é só o lado da Meta.
            </div>
          )}
          {!release && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400">
              Sem campanha do SendFlow vinculada: dá para ver o que a Meta entregou, mas não
              quem entrou no grupo.
            </div>
          )}

          {carregando ? (
            <Skeleton className="h-72 w-full" />
          ) : (
            <div className="rounded-xl border border-border/40 p-4">
              <p className="text-sm font-medium">Quem visitou × quem entrou</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Barras: entradas e saídas do grupo no dia. Linhas: cliques no link e visitas
                da página pelo pixel.
              </p>
              <div className="mt-3 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={serie}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
                    <XAxis dataKey="date" tickFormatter={dataBR} fontSize={11} />
                    <YAxis fontSize={11} />
                    <Tooltip
                      labelFormatter={(d) => dataBR(String(d))}
                      formatter={(v, nome) => [num(Number(v)), String(nome)]}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="entrou" name="Entrou no grupo" fill="#10b981" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="saiu" name="Saiu" fill="#f43f5e" radius={[2, 2, 0, 0]} />
                    <Line
                      type="monotone"
                      dataKey="cliquesNoLink"
                      name="Cliques no link"
                      stroke="#6366f1"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="visitasDaPagina"
                      name="Visitas da página (pixel)"
                      stroke="#f59e0b"
                      strokeWidth={2}
                      dot={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-border/40 p-4">
            <p className="text-sm font-medium">Dia por dia</p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/40 text-left text-muted-foreground">
                    <th className="pb-1.5 font-medium">Dia</th>
                    <th className="pb-1.5 text-right font-medium">Investimento</th>
                    <th className="pb-1.5 text-right font-medium">Impressões</th>
                    <th className="pb-1.5 text-right font-medium">Cliques</th>
                    <th
                      className="pb-1.5 text-right font-medium"
                      title="Landing page views do pixel"
                    >
                      Visitas
                    </th>
                    <th className="pb-1.5 text-right font-medium">Entrou</th>
                    <th className="pb-1.5 text-right font-medium">Saiu</th>
                    <th className="pb-1.5 text-right font-medium">Saldo</th>
                    <th className="pb-1.5 text-right font-medium">Custo/entrada</th>
                    <th className="pb-1.5 text-right font-medium" title="Visitas ÷ cliques">
                      Clique → página
                    </th>
                    <th className="pb-1.5 text-right font-medium" title="Entradas ÷ visitas">
                      Página → grupo
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="py-4 text-center text-muted-foreground">
                        Nenhum dia com movimento nesta janela.
                      </td>
                    </tr>
                  ) : (
                    linhas.map((l) => (
                      <tr key={l.date} className="border-b border-border/20 last:border-0">
                        <td className="py-1.5 pr-2">{dataBR(l.date)}</td>
                        <td className="py-1.5 text-right tabular-nums">{brl(l.investimento)}</td>
                        <td className="py-1.5 text-right tabular-nums">{num(l.impressoes)}</td>
                        <td className="py-1.5 text-right tabular-nums">{num(l.cliquesNoLink)}</td>
                        <td className="py-1.5 text-right tabular-nums">{num(l.visitasDaPagina)}</td>
                        <td className="py-1.5 text-right tabular-nums text-emerald-600">
                          {num(l.entrou)}
                        </td>
                        <td className="py-1.5 text-right tabular-nums text-rose-600">
                          {num(l.saiu)}
                        </td>
                        <td
                          className={`py-1.5 text-right tabular-nums ${
                            l.saldo < 0 ? "text-rose-600" : ""
                          }`}
                        >
                          {num(l.saldo)}
                        </td>
                        <td className="py-1.5 text-right tabular-nums">{brl(l.custoPorEntrada)}</td>
                        <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                          {pct(l.taxaCliqueParaPagina)}
                        </td>
                        <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                          {pct(l.taxaPaginaParaGrupo)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {grupo.data && grupo.data.grupos.length > 0 && (
            <div className="rounded-xl border border-border/40 p-4">
              <p className="text-sm font-medium">Grupos de {grupo.data.campanha.name}</p>
              <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
                {grupo.data.grupos.map((g) => (
                  <div key={g.id} className="rounded-lg border border-border/30 bg-card/60 p-2">
                    <p className="truncate text-xs font-medium" title={g.name}>
                      {g.name}
                    </p>
                    <p className="text-lg font-bold tabular-nums">{num(g.participantes)}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {g.cheio ? "lotado" : "aberto"}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
