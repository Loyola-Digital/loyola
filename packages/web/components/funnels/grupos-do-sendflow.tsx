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
import {
  montarDiario,
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

function Grafico({ linhas }: { linhas: PontoDoDia[] }) {
  // Do mais antigo para o mais novo: o tempo anda para a direita, ao contrário
  // da tabela, onde o recente vem primeiro.
  const serie = [...linhas].reverse();
  // Denominador mínimo de 1 evita divisão por zero num período sem movimento.
  const maior = Math.max(1, ...serie.map((s) => Math.max(s.entrou, s.saiu)));
  const ALTURA = 90;

  return (
    <div className="rounded-md border border-border/40 bg-card/30 p-4">
      <h4 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Entradas vs. saídas (diário)
      </h4>
      <div className="flex min-h-[120px] items-end gap-1">
        {serie.map((s) => (
          <div
            key={s.date}
            className="flex min-w-0 flex-1 flex-col items-center justify-end gap-0.5"
            title={`${dataBR(s.date)} · entrou ${fmt(s.entrou)} · saiu ${fmt(s.saiu)}${
              s.disparos > 0 ? ` · ${s.disparos} disparo(s)` : ""
            }`}
          >
            <div className="flex w-full flex-col items-stretch gap-0.5">
              <div
                className="w-full rounded-t-sm bg-green-500/70"
                style={{
                  height: `${Math.max(2, Math.round((s.entrou / maior) * ALTURA))}px`,
                }}
              />
              <div
                className="w-full rounded-b-sm bg-red-500/70"
                style={{
                  height: `${Math.max(2, Math.round((s.saiu / maior) * ALTURA))}px`,
                }}
              />
            </div>
            {/* Ponto sob o dia que teve disparo: liga a mensagem enviada ao
                pico de entrada, que é a leitura que a seção existe para dar. */}
            <div className="h-1.5">
              {s.disparos > 0 && (
                <div className="h-1.5 w-1.5 rounded-full bg-blue-500" />
              )}
            </div>
            <div className="mt-1 origin-left rotate-[-30deg] whitespace-nowrap text-[9px] text-muted-foreground">
              {s.date.slice(5)}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-green-500/70" />
          Entrou
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-red-500/70" />
          Saiu
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
          Disparo
        </span>
      </div>
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
          <Grafico linhas={linhas} />

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
    </div>
  );
}
