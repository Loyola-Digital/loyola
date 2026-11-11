"use client";

/**
 * Quem entra e quem sai, mês a mês.
 *
 * O saldo de seguidores esconde o movimento: ganhar 580 num mês em que 2.168
 * pessoas foram embora é um problema diferente de ganhar 580 tendo perdido 50.
 * A barra para baixo é o que o número de crescimento nunca mostra, e a linha de
 * baixo diz quanto do que entrou já tinha ido embora no mesmo mês.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Dica } from "@/components/instagram/dica";
import { useInstagramMensal, type MesDoOrganico } from "@/lib/hooks/use-instagram-mensal";
import { rotuloDoMes } from "@/lib/utils/meses-do-instagram";

interface Props {
  accountId: string | null;
  /** Quantos meses mostrar — o histórico do LoyolaX começa em junho/2026. */
  meses?: number;
}

const nf = (n: number) => Math.round(n).toLocaleString("pt-BR");

interface Linha {
  mes: string;
  rotulo: string;
  entraram: number;
  /** Negativo de propósito: desenha para baixo do zero. */
  sairam: number;
  saldo: number;
  churn: number | null;
}

function montarLinhas(meses: MesDoOrganico[]): Linha[] {
  return meses
    .filter((m) => !m.semDados && (m.novosSeguidores > 0 || m.unfollows > 0))
    .map((m) => ({
      mes: m.mes,
      rotulo: rotuloDoMes(m.mes),
      entraram: m.novosSeguidores,
      sairam: -m.unfollows,
      saldo: m.crescimento,
      churn: m.novosSeguidores > 0 ? (m.unfollows / m.novosSeguidores) * 100 : null,
    }));
}

export function QuemEntraEQuemSai({ accountId, meses = 12 }: Props) {
  const { data, isLoading } = useInstagramMensal(accountId);

  if (isLoading) return <Skeleton className="h-72 w-full rounded-xl" />;

  const linhas = montarLinhas(data?.meses ?? []).slice(-meses);
  if (linhas.length === 0) return null;

  const pior = linhas.reduce((a, b) => ((b.churn ?? 0) > (a.churn ?? 0) ? b : a));

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-1.5">
          <CardTitle className="text-base">Quem entra e quem sai</CardTitle>
          <Dica>
            {`Seguidores que entraram (barra para cima) e que saíram (barra para baixo) em cada mês.

O crescimento do mês é a diferença entre as duas. Embaixo de cada mês, quanto do que entrou foi embora no mesmo período — quanto menor, melhor.`}
          </Dica>
        </div>
        <p className="text-xs text-muted-foreground">
          O saldo esconde o movimento: dá para crescer pouco tendo entrado muita gente.
          {pior.churn != null && pior.churn >= 50 && (
            <>
              {" "}
              O mês mais apertado foi <b className="text-foreground">{pior.rotulo}</b>: de cada 100
              que entraram, {Math.round(pior.churn)} saíram.
            </>
          )}
        </p>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={linhas} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} stackOffset="sign">
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" vertical={false} />
              <XAxis dataKey="rotulo" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={52}
                tickFormatter={(v: number) => nf(Math.abs(v))}
              />
              <ReferenceLine y={0} className="stroke-border" />
              <Tooltip
                cursor={{ className: "fill-muted/40" }}
                contentStyle={{
                  background: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(valor, nome) => [nf(Math.abs(Number(valor ?? 0))), String(nome)]}
                labelFormatter={(rotulo) => {
                  const l = linhas.find((x) => x.rotulo === String(rotulo));
                  if (!l) return String(rotulo ?? "");
                  const saldo = `${l.saldo >= 0 ? "+" : "−"}${nf(Math.abs(l.saldo))}`;
                  return `${rotulo} · saldo ${saldo}${
                    l.churn != null ? ` · ${Math.round(l.churn)}% saíram` : ""
                  }`;
                }}
              />
              <Bar dataKey="entraram" name="Entraram" stackId="f" radius={[2, 2, 0, 0]}>
                {linhas.map((l) => (
                  <Cell key={l.mes} className="fill-emerald-500" />
                ))}
              </Bar>
              <Bar dataKey="sairam" name="Saíram" stackId="f" radius={[0, 0, 2, 2]}>
                {linhas.map((l) => (
                  <Cell key={l.mes} className="fill-red-500" />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          {linhas.map((l) => (
            <span key={l.mes} className="tabular-nums">
              {l.rotulo}:{" "}
              <b className={l.churn != null && l.churn >= 70 ? "text-red-500" : "text-foreground"}>
                {l.churn == null ? "—" : `${Math.round(l.churn)}%`}
              </b>{" "}
              saíram
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
