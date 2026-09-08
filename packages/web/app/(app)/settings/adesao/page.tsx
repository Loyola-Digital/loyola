"use client";

/**
 * Adesão do time ao Loyola X.
 *
 * ## A pergunta é "quem NÃO está usando"
 *
 * Uma lista só de quem usou responde "quem usa" — e isso já se sabe. O valor da
 * tela está nas linhas de baixo: quem nunca abriu, e quem abriu e parou. Por
 * isso a lista traz todo mundo e destaca a ausência em vez de escondê-la.
 *
 * ## Dias ativos, não requisições
 *
 * Quem abre uma tela e trabalha nela a manhã inteira faz menos chamadas que
 * quem recarrega o dashboard trinta vezes. Ordenar por volume premiaria o
 * segundo. O número que responde adesão é em quantos DIAS a pessoa apareceu.
 */

import { useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertCircle, Users } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useUserRole } from "@/lib/hooks/use-user-role";
import { useAdesao, type PessoaNaAdesao } from "@/lib/hooks/use-adesao";

const PERIODOS = [
  { rotulo: "7 dias", dias: 7 },
  { rotulo: "30 dias", dias: 30 },
  { rotulo: "90 dias", dias: 90 },
];

function quando(iso: string | null): string {
  if (!iso) return "nunca";
  const horas = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
  if (horas < 1) return "agora há pouco";
  if (horas < 24) return `há ${horas}h`;
  const dias = Math.floor(horas / 24);
  if (dias === 1) return "ontem";
  if (dias < 30) return `há ${dias} dias`;
  return `há ${Math.floor(dias / 30)} meses`;
}

const PAPEL: Record<string, string> = {
  admin: "Admin",
  manager: "Gestor",
  copywriter: "Copy",
  guest: "Convidado",
};

/**
 * A faixa que resume o engajamento de uma pessoa no período.
 *
 * Cor e palavra juntas, e não só cor: "sumido" precisa ser lido, não deduzido
 * de um tom de laranja — e a tela vai ser mostrada em reunião, projetada.
 */
function selo(p: PessoaNaAdesao, dias: number): { texto: string; classe: string } {
  if (!p.ultimoUso) return { texto: "nunca entrou", classe: "bg-destructive/10 text-destructive" };
  const desdeODia = Math.floor((Date.now() - new Date(p.ultimoUso).getTime()) / 86_400_000);
  if (desdeODia >= 14) return { texto: "sumido", classe: "bg-destructive/10 text-destructive" };
  if (desdeODia >= 5) return { texto: "esfriando", classe: "bg-amber-500/10 text-amber-600" };
  // "Frequente" é sobre CONSTÂNCIA: um terço dos dias do período é o corte
  // entre quem incorporou a ferramenta e quem entra quando lembra.
  if (p.diasAtivos >= Math.max(3, dias / 3)) {
    return { texto: "frequente", classe: "bg-emerald-500/10 text-emerald-600" };
  }
  return { texto: "ativo", classe: "bg-primary/10 text-primary" };
}

export default function AdesaoPage() {
  const role = useUserRole();
  const [dias, setDias] = useState(30);
  const { data, isLoading } = useAdesao(dias);

  if (role !== "admin") {
    return (
      <div className="rounded-xl border border-dashed border-border/40 p-12 text-center">
        <AlertCircle className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          A adesão do time é visível só para admin.
        </p>
      </div>
    );
  }

  const pessoas = data?.pessoas ?? [];
  const nunca = pessoas.filter((p) => !p.ultimoUso);
  const ativos = pessoas.filter((p) => p.ultimoUso);
  const mediaDeDias =
    ativos.length > 0
      ? Math.round((ativos.reduce((s, p) => s + p.diasAtivos, 0) / ativos.length) * 10) / 10
      : 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
            <Users className="h-5 w-5 text-primary" />
            Adesão do time
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Quem está usando o Loyola X, com que frequência e em que áreas.
          </p>
        </div>
        <div className="flex gap-1">
          {PERIODOS.map((p) => (
            <button
              key={p.dias}
              type="button"
              onClick={() => setDias(p.dias)}
              className={`rounded-md border px-2.5 py-1 text-[12px] transition-colors ${
                dias === p.dias
                  ? "border-primary bg-primary/10 font-medium text-primary"
                  : "border-border/60 text-muted-foreground hover:bg-muted"
              }`}
            >
              {p.rotulo}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-border/60 bg-card p-4">
              <p className="text-2xl font-bold tabular-nums">{ativos.length}</p>
              <p className="text-[12px] text-muted-foreground">
                usaram nos últimos {dias} dias, de {pessoas.length}
              </p>
            </div>
            <div className="rounded-xl border border-border/60 bg-card p-4">
              <p className="text-2xl font-bold tabular-nums">{mediaDeDias}</p>
              <p className="text-[12px] text-muted-foreground">
                dias ativos em média, entre quem usou
              </p>
            </div>
            <div
              className={`rounded-xl border p-4 ${
                nunca.length > 0 ? "border-destructive/40 bg-destructive/5" : "border-border/60 bg-card"
              }`}
            >
              <p className="text-2xl font-bold tabular-nums">{nunca.length}</p>
              <p className="text-[12px] text-muted-foreground">
                não entraram nenhuma vez no período
              </p>
            </div>
          </div>

          {(data?.porDia.length ?? 0) > 0 && (
            <div className="rounded-xl border border-border/60 bg-card p-4">
              <p className="mb-3 text-[12px] font-medium text-muted-foreground">
                Pessoas distintas por dia
              </p>
              <ResponsiveContainer width="100%" height={140}>
                <AreaChart data={data?.porDia ?? []}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" vertical={false} />
                  <XAxis
                    dataKey="dia"
                    tick={{ fontSize: 10 }}
                    tickFormatter={(d: string) => d.slice(8, 10) + "/" + d.slice(5, 7)}
                    className="text-muted-foreground"
                  />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} width={24} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                    labelFormatter={(d) => String(d).split("-").reverse().join("/")}
                    formatter={(v) => [`${Number(v)} pessoa${Number(v) === 1 ? "" : "s"}`, ""]}
                  />
                  <Area
                    type="monotone"
                    dataKey="pessoas"
                    stroke="var(--color-primary)"
                    fill="var(--color-primary)"
                    fillOpacity={0.15}
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-border/60">
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="border-b border-border/60 bg-muted/30">
                  {["Pessoa", "Situação", "Último acesso", "Dias ativos", "Onde trabalhou"].map(
                    (h) => (
                      <th
                        key={h}
                        className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {pessoas.map((p) => {
                  const s = selo(p, dias);
                  return (
                    <tr key={p.id} className="border-b border-border/40 last:border-b-0">
                      <td className="px-3 py-2">
                        <div className="font-medium">{p.nome}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {PAPEL[p.papel] ?? p.papel} · {p.email}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${s.classe}`}
                        >
                          {s.texto}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-[12px] text-muted-foreground">
                        {quando(p.ultimoUso)}
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {p.diasAtivos}
                        <span className="text-[11px] text-muted-foreground"> / {dias}</span>
                      </td>
                      <td className="px-3 py-2">
                        {p.areas.length === 0 ? (
                          <span className="text-[12px] text-muted-foreground">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {/* Três áreas: a quarta em diante é cauda, e a
                                linha da tabela vira parágrafo. */}
                            {p.areas.slice(0, 3).map((a) => (
                              <span
                                key={a.area}
                                className="rounded border border-border/50 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                              >
                                {a.rotulo}
                              </span>
                            ))}
                            {p.areas.length > 3 && (
                              <span className="text-[10px] text-muted-foreground">
                                +{p.areas.length - 3}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            O registro guarda <strong>área e frequência</strong> — nunca a URL, o que foi aberto ou
            o conteúdo. Serve para saber se o produto está sendo usado, não para acompanhar o que
            cada pessoa faz. A contagem começou quando esta tela entrou no ar.
          </p>
        </>
      )}
    </div>
  );
}
