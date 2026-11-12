"use client";

/**
 * A aba Decisões: estamos no caminho da meta, o que está travando e o que
 * teria de acontecer.
 *
 * As outras abas mostram o que aconteceu. Esta compara com o que se esperava —
 * é a diferença entre uma tela de relatório e uma tela de decisão. Sem meta
 * cadastrada ela não inventa número nenhum: pede a meta e sai do caminho.
 */

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Pencil, Target } from "lucide-react";
import { Dica } from "@/components/instagram/dica";
import { DialogDeMetas } from "@/components/instagram/dialog-de-metas";
import { metasSugeridas } from "@/lib/utils/instagram-rascunho";
import { useMetasDoInstagram } from "@/lib/hooks/use-instagram-metas";
import { useInstagramMensal } from "@/lib/hooks/use-instagram-mensal";
import type { InstagramMedia } from "@/lib/hooks/use-instagram";
import { NOME_DO_FORMATO, postsNoPeriodo } from "@/lib/utils/instagram-posts";
import { limitesDoMes, rotuloDoMes } from "@/lib/utils/meses-do-instagram";
import {
  ROTULO_DO_NIVEL,
  ganchoExplicaOAlcance,
  linhaDeMeta,
  novosPorPost,
  progressoDoMes,
  semaforoPorFormato,
  simularSaldo,
  type LinhaDeMeta,
  type Nivel,
} from "@/lib/utils/instagram-metas";

interface Props {
  accountId: string | null;
  media?: InstagramMedia[];
  isLoading: boolean;
}

const nf = (n: number) => Math.round(n).toLocaleString("pt-BR");
const umaCasa = (n: number) => n.toFixed(1).replace(".", ",");
const K = (n: number) =>
  n >= 1_000_000 ? `${umaCasa(n / 1_000_000)} mi` : n >= 10_000 ? `${nf(n / 1_000)} mil` : nf(n);

const COR: Record<Nivel, { barra: string; selo: string }> = {
  bom: { barra: "bg-emerald-500", selo: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  atencao: { barra: "bg-amber-500", selo: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  ruim: { barra: "bg-red-500", selo: "bg-red-500/10 text-red-600 dark:text-red-400" },
};

function Selo({ nivel }: { nivel: Nivel }) {
  return (
    <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${COR[nivel].selo}`}>
      {ROTULO_DO_NIVEL[nivel]}
    </span>
  );
}

/**
 * A barra com dois marcadores: a meta do mês e, no mês em curso, o ritmo
 * esperado até hoje. Sem o segundo, todo começo de mês parece fracasso.
 */
function BarraDeMeta({ linha, formatar }: { linha: LinhaDeMeta; formatar: (n: number) => string }) {
  const teto = Math.max(linha.meta, linha.resultado) * 1.12 || 1;
  const pos = (v: number) => `${Math.min(100, (v / teto) * 100).toFixed(1)}%`;
  return (
    <div className="grid gap-1 sm:grid-cols-[minmax(0,12rem)_1fr_auto] sm:items-center sm:gap-3">
      <span className="text-sm">{linha.nome}</span>
      <div className="relative h-2.5 rounded-full bg-muted" role="img" aria-label={`${Math.round(linha.pctDaMeta)}% da meta`}>
        <div className={`absolute inset-y-0 left-0 rounded-full ${COR[linha.nivel].barra}`} style={{ width: pos(linha.resultado) }} />
        {linha.esperadoAteHoje != null && (
          <span
            className="absolute -top-1 -bottom-1 w-px border-l border-dashed border-foreground/70"
            style={{ left: pos(linha.esperadoAteHoje) }}
            title={`Ritmo esperado até hoje: ${formatar(linha.esperadoAteHoje)}`}
          />
        )}
        <span
          className="absolute -top-1 -bottom-1 w-0.5 bg-foreground/70"
          style={{ left: pos(linha.meta) }}
          title={`Meta: ${formatar(linha.meta)}`}
        />
      </div>
      <span className="flex items-center gap-2 text-sm tabular-nums">
        <b>{formatar(linha.resultado)}</b>
        <span className="text-muted-foreground">
          de {formatar(linha.meta)} · {Math.round(linha.pctDaMeta)}%
        </span>
        <Selo nivel={linha.nivel} />
      </span>
    </div>
  );
}

export function PainelDeDecisoes({ accountId, media, isLoading }: Props) {
  const { data: mensal, isLoading: mensalLoading } = useInstagramMensal(accountId);
  const { data: metasData, isLoading: metasLoading } = useMetasDoInstagram(accountId);
  const [mesEscolhido, setMesEscolhido] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);

  // Só os meses com dado, do mais recente para trás: escolher um mês vazio não
  // responde nada.
  const meses = useMemo(
    () => (mensal?.meses ?? []).filter((m) => !m.semDados).map((m) => m.mes).slice(-6).reverse(),
    [mensal],
  );
  const mes = mesEscolhido ?? meses[0] ?? null;
  const doMes = mensal?.meses.find((m) => m.mes === mes) ?? null;
  // A sugestão de meta aparece no texto do estado vazio: a aba abria sem
  // semáforo e sem dizer que havia um caminho de um clique para ligá-lo.
  const sugeridas = metasSugeridas(mensal?.meses ?? []);
  const meta = metasData?.metas.find((m) => m.mes === mes) ?? null;

  const postsDoMes = useMemo(() => {
    if (!mes || !media) return [];
    const { since, until } = limitesDoMes(mes);
    return postsNoPeriodo(media, since, until);
  }, [media, mes]);

  const [simPosts, setSimPosts] = useState<number | null>(null);
  const [simSaidas, setSimSaidas] = useState<number | null>(null);

  if (isLoading || mensalLoading || metasLoading) return <Skeleton className="h-96 w-full rounded-xl" />;
  if (!mes || !doMes) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Ainda não há mês com dado suficiente para comparar com meta.
      </p>
    );
  }

  const progresso = progressoDoMes(mes);
  const emCurso = progresso != null;

  const linhas: { linha: LinhaDeMeta; formatar: (n: number) => string }[] = [];
  if (meta?.saldoSeguidores != null)
    linhas.push({ linha: linhaDeMeta("Saldo de seguidores", doMes.crescimento, meta.saldoSeguidores, progresso), formatar: nf });
  if (meta?.alcance != null)
    linhas.push({ linha: linhaDeMeta("Alcance do mês", doMes.alcance, meta.alcance, progresso), formatar: K });
  if (meta?.posts != null)
    linhas.push({ linha: linhaDeMeta("Posts publicados", doMes.posts, meta.posts, progresso), formatar: nf });

  const porFormato = semaforoPorFormato(postsDoMes, meta?.metasPorFormato ?? {}, 30);
  const gancho = ganchoExplicaOAlcance(postsDoMes);

  const porPost = novosPorPost(doMes.novosSeguidores, doMes.posts);
  const saidasReais = doMes.novosSeguidores > 0 ? (doMes.unfollows / doMes.novosSeguidores) * 100 : 0;
  const simulacao =
    meta?.saldoSeguidores != null && porPost > 0
      ? simularSaldo({
          novosPorPost: porPost,
          posts: simPosts ?? doMes.posts,
          saidasPct: simSaidas ?? saidasReais,
          meta: meta.saldoSeguidores,
        })
      : null;

  return (
    <div className="space-y-6">
      {/* ---- metas ---- */}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 pb-3">
          <div>
            <div className="flex items-center gap-1.5">
              <CardTitle className="text-base">Estamos no caminho da meta?</CardTitle>
              <Dica>
                {`Verde: meta batida. Amarelo: de 70% a 99%. Vermelho: abaixo de 70%.

Em mês que ainda está correndo, a comparação é com o ritmo esperado até hoje (o tracejado), não com a meta inteira — senão todo começo de mês ficaria vermelho.`}
              </Dica>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {meses.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMesEscolhido(m)}
                  className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                    m === mes ? "border-primary bg-primary/10 text-foreground" : "border-border/60 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {rotuloDoMes(m)}
                  {progressoDoMes(m) != null ? " (em curso)" : ""}
                </button>
              ))}
            </div>
          </div>
          {accountId && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setEditando(true)}>
              <Pencil className="h-3.5 w-3.5" />
              {meta ? "Editar metas" : "Definir metas"}
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {linhas.length === 0 ? (
            <div className="flex flex-col items-start gap-2 py-4">
              <div className="flex items-center gap-2 text-sm">
                <Target className="h-4 w-4 text-muted-foreground" />
                Nenhuma meta definida para {rotuloDoMes(mes)}.
              </div>
              <p className="max-w-2xl text-sm text-muted-foreground">
                O mês fechou com <b>{nf(doMes.crescimento)}</b> de saldo, <b>{K(doMes.alcance)}</b> de
                alcance e <b>{doMes.posts}</b> posts. Nenhum desses números é bom ou ruim até alguém
                dizer o que se esperava — é a meta que liga o semáforo e o simulador.
              </p>
              {sugeridas.mesesUsados.length > 0 && (
                <p className="max-w-2xl text-sm text-muted-foreground">
                  <b>Editar o mês</b> já abre com uma sugestão: {nf(sugeridas.saldoSeguidores ?? 0)}{" "}
                  de saldo, {K(sugeridas.alcance ?? 0)} de alcance e {sugeridas.posts} posts — a
                  média dos últimos {sugeridas.mesesUsados.length} mês(es) fechado(s). Aceitar ou
                  ajustar é um clique; manter a conta sem meta é deixar esta tela como está.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {linhas.map(({ linha, formatar }) => (
                <BarraDeMeta key={linha.nome} linha={linha} formatar={formatar} />
              ))}
              <p className="pt-1 text-[11px] text-muted-foreground">
                Traço cheio: a meta do mês.
                {emCurso && " Tracejado: o ritmo esperado até hoje."}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---- formatos ---- */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-1.5">
            <CardTitle className="text-base">O que está bom e o que precisa melhorar, por formato</CardTitle>
            <Dica>
              {`Cada formato é comparado com a sua própria meta de frequência, alcance por post e interesse por mil.

A cor do formato é a pior das três: não adianta o alcance estar ótimo se ninguém compartilha. Formato sem meta aparece com os números, sem cor.`}
            </Dica>
          </div>
        </CardHeader>
        <CardContent>
          {postsDoMes.length < 8 ? (
            <p className="text-sm text-muted-foreground">
              {rotuloDoMes(mes)} tem {postsDoMes.length} post(s) na janela carregada — pouco para
              julgar formato. O semáforo aparece a partir de 8.
            </p>
          ) : (
            <div className="grid gap-3 lg:grid-cols-3">
              {porFormato.map((f) => (
                <article key={f.formato} className="rounded-xl border border-border/40 bg-card/60 p-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold">{NOME_DO_FORMATO[f.formato]}</h4>
                    {f.medidas.some((m) => m.nivel != null) && <Selo nivel={f.nivel} />}
                  </div>
                  <p className="text-[11px] text-muted-foreground">{f.posts} post(s) no mês</p>
                  <div className="mt-3 space-y-2.5">
                    {f.medidas.map((m) => (
                      <div key={m.chave}>
                        <div className="flex items-baseline justify-between text-xs">
                          <span className="text-muted-foreground">{m.rotulo}</span>
                          <span className="tabular-nums">
                            <b>
                              {m.resultado == null
                                ? "—"
                                : m.chave === "alcance"
                                  ? nf(m.resultado)
                                  : umaCasa(m.resultado)}
                            </b>
                            {m.meta != null && (
                              <span className="text-muted-foreground">
                                {" "}
                                de {m.chave === "alcance" ? nf(m.meta) : umaCasa(m.meta)} ·{" "}
                                {Math.round(m.pct ?? 0)}%
                              </span>
                            )}
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 rounded-full bg-muted">
                          <div
                            className={`h-full rounded-full ${m.nivel ? COR[m.nivel].barra : "bg-muted-foreground/40"}`}
                            style={{
                              width: `${Math.min(100, m.pct ?? (m.resultado != null ? 100 : 0))}%`,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  {f.formato === "reels" && gancho && (
                    <p className="mt-3 border-t border-border/40 pt-2 text-xs text-muted-foreground">
                      Reels que seguraram os 3 primeiros segundos alcançaram{" "}
                      <b className="text-foreground">{K(gancho.forte.alcance ?? 0)}</b> ({gancho.forte.n} posts);
                      os que não seguraram, <b className="text-foreground">{K(gancho.fraco.alcance ?? 0)}</b> (
                      {gancho.fraco.n}). Se o alcance está baixo, o começo do vídeo é onde mexer.
                    </p>
                  )}
                  {f.medidas.every((m) => m.nivel == null) && (
                    <p className="mt-3 text-[11px] text-muted-foreground">Sem meta para este formato.</p>
                  )}
                </article>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---- simulador ---- */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-1.5">
            <CardTitle className="text-base">Quantos posts precisamos? Simulador</CardTitle>
            <Dica>
              {`Mexa nos controles para ver o que teria de acontecer para bater a meta de saldo de seguidores.

A conta é simples de propósito: supõe que cada post traga os mesmos seguidores que trouxe na média do mês, e que a saída seja uma porcentagem fixa. Serve para a ordem de grandeza da resposta, não para previsão.`}
            </Dica>
          </div>
        </CardHeader>
        <CardContent>
          {!simulacao ? (
            <p className="text-sm text-muted-foreground">
              O simulador precisa da meta de saldo de seguidores do mês e de pelo menos um post com
              seguidores medidos.
            </p>
          ) : (
            <div className="grid gap-6 lg:grid-cols-[1fr_minmax(0,20rem)]">
              <div className="space-y-5">
                <div>
                  <label htmlFor="sim-posts" className="flex items-baseline justify-between text-sm">
                    <span>Posts no mês</span>
                    <b className="tabular-nums">{simPosts ?? doMes.posts} posts</b>
                  </label>
                  <input
                    id="sim-posts"
                    type="range"
                    min={1}
                    max={120}
                    step={1}
                    value={simPosts ?? doMes.posts}
                    onChange={(e) => setSimPosts(Number(e.target.value))}
                    className="mt-2 w-full accent-primary"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Em {rotuloDoMes(mes)}: {doMes.posts} posts, cerca de {umaCasa((doMes.posts / 30) * 7)} por semana.
                  </p>
                </div>
                <div>
                  <label htmlFor="sim-saidas" className="flex items-baseline justify-between text-sm">
                    <span>Saem, de cada 100 que entram</span>
                    <b className="tabular-nums">{umaCasa(simSaidas ?? saidasReais)}%</b>
                  </label>
                  <input
                    id="sim-saidas"
                    type="range"
                    min={0}
                    max={99}
                    step={0.5}
                    value={simSaidas ?? saidasReais}
                    onChange={(e) => setSimSaidas(Number(e.target.value))}
                    className="mt-2 w-full accent-primary"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Em {rotuloDoMes(mes)}: {Math.round(saidasReais)} de cada 100.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSimPosts(null);
                    setSimSaidas(null);
                  }}
                >
                  Voltar ao real de {rotuloDoMes(mes)}
                </Button>
              </div>

              <div className="rounded-xl border border-border/40 bg-card/60 p-4" aria-live="polite">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  Saldo projetado
                </p>
                <p className="text-3xl font-bold tabular-nums">
                  {simulacao.saldo >= 0 ? "+" : "−"}
                  {nf(Math.abs(simulacao.saldo))}
                </p>
                <div className="mt-2 h-2 rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full ${COR[simulacao.nivel].barra}`}
                    style={{ width: `${Math.min(100, simulacao.pctDaMeta)}%` }}
                  />
                </div>
                <p className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                  <b className="text-foreground">{Math.round(simulacao.pctDaMeta)}%</b> da meta de{" "}
                  {nf(meta!.saldoSeguidores!)}
                  <Selo nivel={simulacao.nivel} />
                </p>
                <p className="mt-3 text-sm">
                  {simulacao.pctDaMeta >= 100 ? (
                    <>A meta seria batida.</>
                  ) : (
                    <>
                      Faltariam <b>{nf(meta!.saldoSeguidores! - simulacao.saldo)}</b> seguidores.{" "}
                      {simulacao.postsNecessarios != null && (
                        <>
                          Só com mais posts, mantendo as saídas: <b>{simulacao.postsNecessarios} posts</b>{" "}
                          no mês ({umaCasa(simulacao.postsNecessarios / 30)} por dia).{" "}
                        </>
                      )}
                      {simulacao.saidasNecessariasPct != null ? (
                        <>
                          Só reduzindo as saídas, mantendo os posts:{" "}
                          <b>{umaCasa(simulacao.saidasNecessariasPct)}%</b> de saídas.
                        </>
                      ) : (
                        <>Mesmo sem nenhuma saída, esse número de posts não bastaria.</>
                      )}
                    </>
                  )}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {accountId && (
        <DialogDeMetas
          accountId={accountId}
          mes={mes}
          atual={meta}
          historico={mensal?.meses}
          open={editando}
          onOpenChange={setEditando}
        />
      )}
    </div>
  );
}
