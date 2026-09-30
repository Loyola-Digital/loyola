"use client";

/**
 * Grupos de WhatsApp no dashboard do funil — direto da API do SendFlow.
 *
 * ## Por que não vem mais da planilha
 *
 * A seção antiga (`groups-dashboard-section`) lia uma planilha exportada à mão.
 * Dois funis do sistema tinham essa planilha vinculada; todos os outros — este
 * inclusive — não tinham, e a seção simplesmente NÃO APARECIA. O dado existia
 * o tempo todo no SendFlow.
 *
 * Com a API a fonte é uma só, está sempre atualizada e não depende de alguém
 * lembrar de exportar. E os DISPAROS entram na mesma tabela: eles vêm no mesmo
 * payload, e um dia com disparo e zero entrada é justamente o que se quer ver.
 *
 * ## Quando não aparece
 *
 * Sem campanha casada, a seção diz o que procurou e lista as campanhas
 * disponíveis — em vez de um vazio que parece bug. O casamento normaliza a
 * grafia (`fz-m3-set-26` acha `FZM3`), e o `matchCode` do funil é o override
 * para quando nem isso resolve.
 */

import { useMemo, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  MousePointerClick,
  Send,
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useSendflowSummary } from "@/lib/hooks/use-sendflow";
import { CanalDeQuemEntrou } from "./canal-de-quem-entrou";
import { OrigemDosParticipantes } from "./origem-dos-participantes";
import {
  montarDiario,
  reconstruirTotais,
  totaisDoDiario,
  type PontoDoDia,
} from "@/lib/utils/sendflow-diario";

const fmt = (n: number) => n.toLocaleString("pt-BR");
const comSinal = (n: number) => (n > 0 ? `+${fmt(n)}` : fmt(n));
const dataBR = (iso: string) => {
  const [a, m, d] = iso.split("-");
  return d && m && a ? `${d}/${m}/${a.slice(2)}` : iso;
};

function Kpi({
  icon,
  label,
  valor,
  sub,
  cor,
}: {
  icon: React.ReactNode;
  label: string;
  valor: string;
  sub?: string | null;
  cor: "purple" | "green" | "red" | "blue";
}) {
  const classe = {
    purple: "text-purple-500",
    green: "text-green-600",
    red: "text-red-600",
    blue: "text-blue-500",
  }[cor];

  return (
    <div className="rounded-md border border-border/40 bg-card/30 p-3">
      <div className={`flex items-center gap-1.5 text-xs ${classe}`}>
        {icon}
        <span className="font-medium uppercase tracking-wider">{label}</span>
      </div>
      <div className={`mt-1 text-2xl font-bold ${classe}`}>{valor}</div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

/**
 * Entradas, saídas e disparos por dia.
 *
 * ## Por que Recharts e não barras à mão
 *
 * A primeira versão eram `div`s com altura em pixel. Funcionava e era feia: sem
 * eixo, sem grade, sem escala legível — só tarjas coloridas. O Recharts já está
 * no projeto (o dashboard de lançamento usa), então o gráfico decente sai de
 * graça e fica igual ao resto das telas.
 *
 * ## Barras para o fluxo, linha para o acumulado
 *
 * Entrou e saiu são eventos do dia — barra. O tamanho do grupo é o resultado
 * acumulado desses eventos, e linha é o que mostra tendência. Os dois no mesmo
 * gráfico respondem "cresceu?" e "por causa de quê?" de uma vez.
 *
 * A saída vai como NEGATIVA: empilhar as duas no mesmo lado esconderia o dia
 * em que saiu mais gente do que entrou, que é justamente o dia a investigar.
 */
function Grafico({
  linhas,
  participantesHoje,
}: {
  linhas: PontoDoDia[];
  participantesHoje: number;
}) {
  // Do mais antigo para o mais novo: o tempo anda para a direita, ao contrário
  // da tabela, onde o recente vem primeiro.
  const cronologico = [...linhas].reverse();

  const dados = reconstruirTotais(cronologico, participantesHoje);

  const dia = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7);

  return (
    <div className="rounded-md border border-border/40 bg-card/30 p-4">
      <h4 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Entradas, saídas e tamanho do grupo
      </h4>
      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart
          data={dados}
          margin={{ top: 4, right: 8, left: -18, bottom: 0 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="currentColor"
            className="text-border/40"
          />
          <XAxis
            dataKey="date"
            tickFormatter={dia}
            tick={{ fontSize: 10 }}
            stroke="currentColor"
            className="text-muted-foreground"
          />
          <YAxis
            yAxisId="fluxo"
            tick={{ fontSize: 10 }}
            stroke="currentColor"
            className="text-muted-foreground"
          />
          <YAxis
            yAxisId="total"
            orientation="right"
            tick={{ fontSize: 10 }}
            stroke="currentColor"
            className="text-muted-foreground"
          />
          <Tooltip
            contentStyle={{
              background: "hsl(var(--popover))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 8,
              fontSize: 12,
            }}
            labelFormatter={(v) => dataBR(String(v))}
            formatter={(valor, nome) => {
              // A saída é plotada negativa para descer do eixo; no balão ela
              // volta a ser um número de pessoas, que é como se fala dela.
              const n = Math.abs(Number(valor));
              return [fmt(n), nome];
            }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar
            yAxisId="fluxo"
            dataKey="entrou"
            name="Entrou"
            fill="#22c55e"
            radius={[2, 2, 0, 0]}
          />
          <Bar
            yAxisId="fluxo"
            dataKey="saiuNegativo"
            name="Saiu"
            fill="#ef4444"
            radius={[0, 0, 2, 2]}
          />
          <Bar
            yAxisId="fluxo"
            dataKey="disparos"
            name="Disparos"
            fill="#3b82f6"
            radius={[2, 2, 0, 0]}
          />
          <Line
            yAxisId="total"
            type="monotone"
            dataKey="total"
            name="No grupo"
            stroke="#a855f7"
            strokeWidth={2}
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function GruposDoSendflow({
  projectId,
  funnelId,
}: {
  projectId: string;
  funnelId: string;
}) {
  const [dias, setDias] = useState<7 | 14 | 30>(30);
  const { data, isLoading } = useSendflowSummary(projectId, funnelId);

  const linhas = useMemo(() => {
    if (!data || data.semCampanha) return [];
    const todas = montarDiario(
      data.entradas,
      data.saidas,
      data.cliques,
      data.disparos,
    );
    // Corte por data, não pelas N primeiras linhas: dia sem movimento nenhum
    // não gera linha, e "30 linhas" viraria muito mais de 30 dias.
    const limite = new Date(Date.now() - dias * 86_400_000)
      .toISOString()
      .slice(0, 10);
    return todas.filter((l) => l.date >= limite);
  }, [data, dias]);

  if (isLoading) {
    return (
      <div className="space-y-3 rounded-lg border border-border/40 bg-card/40 p-6">
        <Skeleton className="h-5 w-40" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      </div>
    );
  }

  // Sem conexão configurada no projeto — nem seção, nem erro. A maioria dos
  // projetos não tem operação de WhatsApp.
  if (!data) return null;

  if (data.semCampanha) {
    return (
      <div className="rounded-lg border border-border/40 bg-card/40 p-6">
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <Users className="h-4 w-4 text-purple-500" />
          Grupos
        </h3>
        <p className="mt-2 text-[13px] text-muted-foreground">
          Nenhuma campanha do SendFlow casou com este funil. Procurei por{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-[12px]">
            {data.tokenBuscado}
          </code>
          .
        </p>
        {data.campanhasDisponiveis.length > 0 && (
          <p className="mt-2 text-[12px] text-muted-foreground">
            Disponíveis:{" "}
            {data.campanhasDisponiveis.map((c) => c.name).join(" · ")}. Se uma
            delas é deste funil, preencha o <strong>código de casamento</strong>{" "}
            nas configurações do funil.
          </p>
        )}
      </div>
    );
  }

  const totais = totaisDoDiario(linhas);
  const abertos = data.grupos.filter((g) => !g.cheio).length;

  return (
    <div className="space-y-6 rounded-lg border border-border/40 bg-card/40 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold">
            <Users className="h-4 w-4 text-purple-500" />
            Grupos
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Send className="h-3.5 w-3.5" />
            <span className="font-mono">{data.campanha.name}</span>
            <span className="text-muted-foreground/60">·</span>
            <span>direto do SendFlow</span>
          </div>
        </div>
        <Select
          value={String(dias)}
          onValueChange={(v) => setDias(Number(v) as 7 | 14 | 30)}
        >
          <SelectTrigger className="h-8 w-[110px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Últimos 7d</SelectItem>
            <SelectItem value="14">Últimos 14d</SelectItem>
            <SelectItem value="30">Últimos 30d</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi
          icon={<Users className="h-4 w-4" />}
          label="Participantes"
          valor={fmt(data.totalParticipantes)}
          sub={`${data.grupos.length} grupo(s) · ${abertos} aberto(s)`}
          cor="purple"
        />
        <Kpi
          icon={<ArrowDownToLine className="h-4 w-4" />}
          label="Entrou"
          valor={comSinal(totais.entrou)}
          sub={`nos últimos ${dias}d`}
          cor="green"
        />
        <Kpi
          icon={<ArrowUpFromLine className="h-4 w-4" />}
          label="Saiu"
          valor={comSinal(-totais.saiu)}
          sub={`nos últimos ${dias}d`}
          cor="red"
        />
        <Kpi
          icon={<MousePointerClick className="h-4 w-4" />}
          label="Cliques"
          valor={fmt(totais.cliques)}
          sub={`${totais.disparos} disparo(s)`}
          cor="blue"
        />
      </div>

      {linhas.length > 0 ? (
        <>
          <Grafico
            linhas={linhas}
            participantesHoje={data.totalParticipantes}
          />

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead className="text-right text-green-600">
                    Entrou
                  </TableHead>
                  <TableHead className="text-right text-red-600">
                    Saiu
                  </TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                  <TableHead className="text-right">Cliques</TableHead>
                  <TableHead className="text-right text-blue-500">
                    Disparos
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhas.map((l) => (
                  <TableRow key={l.date}>
                    <TableCell className="whitespace-nowrap">
                      {dataBR(l.date)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-green-600">
                      {l.entrou > 0 ? comSinal(l.entrou) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-red-600">
                      {l.saiu > 0 ? comSinal(-l.saiu) : "—"}
                    </TableCell>
                    <TableCell
                      className={`text-right font-medium tabular-nums ${
                        l.saldo < 0 ? "text-red-600" : ""
                      }`}
                    >
                      {comSinal(l.saldo)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {l.cliques > 0 ? fmt(l.cliques) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-blue-500">
                      {l.disparos > 0 ? fmt(l.disparos) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      ) : (
        <p className="text-[13px] text-muted-foreground">
          A campanha está casada, mas não houve movimento nos últimos {dias}{" "}
          dias.
        </p>
      )}

      <CanalDeQuemEntrou projectId={projectId} funnelId={funnelId} />

      <OrigemDosParticipantes
        projectId={projectId}
        funnelId={funnelId}
        campanhaId={data.campanha.id}
      />
    </div>
  );
}
