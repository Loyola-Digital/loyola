"use client";

/**
 * Um mês contra outro, à escolha.
 *
 * A tabela mensal responde "está crescendo ou caindo?" ao longo dos meses.
 * Esta aqui responde outra pergunta: "como setembro se compara com julho?" —
 * que é a pergunta de reunião, e que a tabela corrida não responde porque os
 * dois meses ficam longe um do outro e cada linha compara com a anterior.
 *
 * Os dois meses saem da MESMA resposta da tabela mensal (`/mensal?meses=24`),
 * então trocar a escolha não custa chamada à Meta.
 *
 * ## O mês em curso não entra na diferença
 *
 * Ele abria escolhido por ser o mais recente, e a coluna "Diferença" lia onze
 * dias contra trinta: tudo vermelho, sem nada ter acontecido. A escolha
 * padrão passa a ser o último mês FECHADO contra o anterior. Quem escolher o
 * mês em curso de propósito continua vendo os números dele — mas a diferença
 * fica em branco, com o motivo escrito embaixo, em vez de uma queda inventada.
 */

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ExternalLink, Loader2, Minus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dica } from "@/components/instagram/dica";
import { useInstagramMensal, type MesDoOrganico } from "@/lib/hooks/use-instagram-mensal";
import {
  LINHAS_DO_COMPARATIVO,
  diferencaEntreMeses,
  rotuloDoMes,
  type Diferenca,
  type LinhaComparavel,
} from "@/lib/utils/meses-do-instagram";

const fmt = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("pt-BR");

function valorDaLinha(m: MesDoOrganico | undefined, l: LinhaComparavel): string {
  if (!m) return "—";
  if (m.semDados) return "sem dado";
  const v = m[l.chave as keyof MesDoOrganico] as number | null | undefined;
  if (v == null) return "—";
  if (l.tipo === "taxa") return `${String(v).replace(".", ",")}%`;
  if (l.tipo === "saldo") return `${v > 0 ? "+" : ""}${fmt(v)}`;
  return fmt(v);
}

/** Mês sem dado não entra na conta: a diferença para um zero falso seria inventada. */
function numeroDoMes(m: MesDoOrganico | undefined, l: LinhaComparavel): number | null {
  if (!m || m.semDados) return null;
  return (m[l.chave as keyof MesDoOrganico] as number | null) ?? null;
}

/** A diferença, com seta e cor — cor sozinha exclui quem não distingue verde de vermelho. */
function Delta({ d, invertido }: { d: Diferenca; invertido?: boolean }) {
  if (d.valor == null) return <span className="text-[11px] text-muted-foreground/60">—</span>;
  const sobe = d.valor > 0;
  const parado = d.valor === 0;
  // Em unfollows, subir é ruim: a cor segue o que o número significa, não o sinal.
  const bom = invertido ? !sobe : sobe;
  const Icone = parado ? Minus : sobe ? ArrowUp : ArrowDown;
  const cor = parado ? "text-muted-foreground" : bom ? "text-emerald-600" : "text-red-500";
  const n = Math.abs(d.valor);
  const texto =
    d.unidade === "pp"
      ? `${n.toFixed(1).replace(".", ",")} pp`
      : d.unidade === "pessoas"
        ? `${fmt(n)}`
        : `${n}%`;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[12px] font-medium tabular-nums ${cor}`}>
      <Icone className="h-3 w-3" />
      {texto}
    </span>
  );
}

function MelhorPost({ m }: { m: MesDoOrganico | undefined }) {
  if (!m?.melhorPost) return <span className="text-[12px] text-muted-foreground">—</span>;
  const p = m.melhorPost;
  return (
    <a
      href={p.permalink ?? "#"}
      target="_blank"
      rel="noreferrer noopener"
      className="group inline-flex max-w-[220px] items-start gap-1 text-[12px] hover:text-primary"
    >
      <span className="line-clamp-2 leading-snug">
        {p.titulo}
        {p.engajamento !== null && (
          <span className="text-muted-foreground">
            {" "}
            · {String(p.engajamento).replace(".", ",")}%
          </span>
        )}
      </span>
      <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
    </a>
  );
}

export function ComparativoDeMeses({ accountId }: { accountId: string | null }) {
  const { data, isLoading, error } = useInstagramMensal(accountId);
  const meses = useMemo(() => [...(data?.meses ?? [])].reverse(), [data]); // recente primeiro
  const [a, setA] = useState<string | null>(null);
  const [b, setB] = useState<string | null>(null);

  // Padrão: o último mês FECHADO contra o anterior. O mais recente de todos é
  // o mês em curso, e abrir com ele pintava a tela inteira de vermelho. Só
  // roda quando a lista chega, e não sobrescreve escolha feita.
  useEffect(() => {
    const fechados = meses.filter((m) => m.emCurso == null);
    const padrao = fechados.length >= 2 ? fechados : meses;
    if (padrao.length >= 2) {
      setA((x) => x ?? padrao[0]!.mes);
      setB((x) => x ?? padrao[1]!.mes);
    }
  }, [meses]);

  if (!accountId) return null;

  const mesA = meses.find((m) => m.mes === a);
  const mesB = meses.find((m) => m.mes === b);
  // Um mês em curso contra um fechado não é comparação: são onze dias contra
  // trinta. Dois meses em curso não existem, então basta checar a diferença.
  const parcial = mesA && mesB && (mesA.emCurso == null) !== (mesB.emCurso == null)
    ? (mesA.emCurso ? mesA : mesB)
    : null;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 pb-2">
        <div className="flex items-center gap-1.5">
          <CardTitle className="text-base">Comparar meses</CardTitle>
          <Dica>
            {`Dois meses lado a lado, com a diferença entre eles.

Contagens comparam em %; o engajamento em pontos percentuais (pp); o saldo de seguidores em pessoas, porque saldo negativo faria a porcentagem mentir.

Em unfollows, a cor segue o significado: subir é vermelho.

Os meses vêm da mesma busca da tabela mensal, então trocar a escolha não custa consulta nova.`}
          </Dica>
        </div>
        <div className="flex items-center gap-2">
          {[
            { valor: a, set: setA, aria: "Primeiro mês" },
            { valor: b, set: setB, aria: "Segundo mês" },
          ].map((s, i) => (
            <div key={s.aria} className="flex items-center gap-2">
              {i === 1 && <span className="text-[12px] text-muted-foreground">vs</span>}
              <Select value={s.valor ?? undefined} onValueChange={s.set}>
                <SelectTrigger className="h-8 w-[130px] text-[12px]" aria-label={s.aria}>
                  <SelectValue placeholder={isLoading ? "Carregando…" : "Mês"} />
                </SelectTrigger>
                <SelectContent>
                  {meses.map((m) => (
                    <SelectItem key={m.mes} value={m.mes} className="text-[12px]">
                      {rotuloDoMes(m.mes)}
                      {m.emCurso && (
                        <span className="text-muted-foreground"> · em curso</span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Buscando os meses…
          </p>
        ) : error ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Não consegui buscar o histórico. O token da conta pode ter expirado.
          </p>
        ) : meses.length < 2 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Ainda não há dois meses para comparar.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-border/60 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-2 py-2 text-left">Métrica</th>
                  <th className="px-2 py-2 text-right">{a ? rotuloDoMes(a) : "—"}</th>
                  <th className="px-2 py-2 text-right">{b ? rotuloDoMes(b) : "—"}</th>
                  <th className="px-2 py-2 text-right">Diferença</th>
                </tr>
              </thead>
              <tbody>
                {LINHAS_DO_COMPARATIVO.map((l) => (
                  <tr key={l.chave} className="border-b border-border/40 last:border-b-0">
                    <td className="px-2 py-2">
                      <span className="inline-flex items-center gap-1">
                        {l.rotulo}
                        <Dica>{l.dica}</Dica>
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right font-medium tabular-nums">
                      {valorDaLinha(mesA, l)}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                      {valorDaLinha(mesB, l)}
                    </td>
                    <td className="px-2 py-2 text-right">
                      {parcial ? (
                        <span className="text-[11px] text-muted-foreground/60">—</span>
                      ) : (
                        <Delta
                          d={diferencaEntreMeses(
                            numeroDoMes(mesA, l),
                            numeroDoMes(mesB, l),
                            l.tipo,
                          )}
                          invertido={l.chave === "unfollows"}
                        />
                      )}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td className="px-2 py-2">
                    <span className="inline-flex items-center gap-1">
                      Melhor post
                      <Dica>
                        O post de maior taxa de engajamento do mês, com a taxa ao lado.
                      </Dica>
                    </span>
                  </td>
                  <td className="px-2 py-2 text-right">
                    <MelhorPost m={mesA} />
                  </td>
                  <td className="px-2 py-2 text-right">
                    <MelhorPost m={mesB} />
                  </td>
                  <td />
                </tr>
              </tbody>
            </table>
            {parcial && (
              <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                {rotuloDoMes(parcial.mes)} ainda está em curso — {parcial.emCurso!.dias} de{" "}
                {parcial.emCurso!.de} dias. Os números dele continuam na tabela, mas a diferença
                fica em branco: comparar um mês pela metade com um mês fechado só daria queda.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
