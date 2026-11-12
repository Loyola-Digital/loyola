"use client";

/**
 * O relatório do mês, em três leituras do mesmo mês.
 *
 * Três pessoas diferentes abrem a mesma página querendo coisas diferentes: o
 * cliente quer saber se foi bom, o social media quer saber o que repetir, e
 * quem vai mandar no WhatsApp quer um texto que cole. Uma versão só obriga
 * duas delas a garimpar.
 *
 * Nada aqui é gerado: é o mês montado dos números que as outras abas já
 * mostram, mais as frases que alguém escreveu em "Editar o mês".
 */

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Copy, ExternalLink, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Dica } from "@/components/instagram/dica";
import { DialogDeMetas } from "@/components/instagram/dialog-de-metas";
import { useMetasDoInstagram } from "@/lib/hooks/use-instagram-metas";
import { useInstagramMensal } from "@/lib/hooks/use-instagram-mensal";
import type { InstagramMedia, InstagramProfile } from "@/lib/hooks/use-instagram";
import { NOME_DO_FORMATO, formatoDoPost, postsNoPeriodo } from "@/lib/utils/instagram-posts";
import { limitesDoMes, rotuloDoMes } from "@/lib/utils/meses-do-instagram";
import { destaquesDoPeriodo, referenciasPorFormato, statusDoPost } from "@/lib/utils/instagram-sinal";
import { interessePorMil } from "@/lib/utils/instagram-posts";
import { cartoesDoRelatorio, textoDoRelatorio } from "@/lib/utils/instagram-relatorio";
import { rascunhoDoResumo } from "@/lib/utils/instagram-rascunho";
import { agruparPorTema } from "@/lib/utils/instagram-temas";

interface Props {
  accountId: string | null;
  profile?: InstagramProfile;
  media?: InstagramMedia[];
  isLoading: boolean;
}

type Visao = "cliente" | "social" | "texto";

const VISOES: { chave: Visao; rotulo: string; para: string }[] = [
  { chave: "cliente", rotulo: "Resumo para o cliente", para: "o que foi o mês, em uma página" },
  { chave: "social", rotulo: "Análise do social media", para: "o que repetir e o que rever" },
  { chave: "texto", rotulo: "Versão para compartilhar", para: "texto que cola no WhatsApp" },
];

const nf = (n: number) => Math.round(n).toLocaleString("pt-BR");
const umaCasa = (n: number) => n.toFixed(1).replace(".", ",");

export function RelatorioDoMes({ accountId, profile, media, isLoading }: Props) {
  const { data: mensal, isLoading: mensalLoading } = useInstagramMensal(accountId);
  const { data: metasData, isLoading: metasLoading } = useMetasDoInstagram(accountId);
  const [visao, setVisao] = useState<Visao>("cliente");
  const [mesEscolhido, setMesEscolhido] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);

  const comDado = useMemo(
    () => (mensal?.meses ?? []).filter((m) => !m.semDados).slice(-6).reverse(),
    [mensal],
  );
  const meses = useMemo(() => comDado.map((m) => m.mes), [comDado]);
  // Abre no último mês FECHADO, não no mês em curso: o relatório é o que vai
  // para o cliente, e o mês pela metade chegava lá com queda em tudo. O mês em
  // curso continua escolhível na lista.
  const mes =
    mesEscolhido ?? comDado.find((m) => m.emCurso == null)?.mes ?? meses[0] ?? null;
  const indice = mensal?.meses.findIndex((m) => m.mes === mes) ?? -1;
  const doMes = indice >= 0 ? mensal!.meses[indice] : null;
  const anterior = indice > 0 ? mensal!.meses[indice - 1] : null;
  const meta = metasData?.metas.find((m) => m.mes === mes) ?? null;

  const postsDoMes = useMemo(() => {
    if (!mes || !media) return [];
    const { since, until } = limitesDoMes(mes);
    return postsNoPeriodo(media, since, until);
  }, [media, mes]);

  if (isLoading || mensalLoading || metasLoading) return <Skeleton className="h-96 w-full rounded-xl" />;
  if (!mes || !doMes) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Ainda não há mês com dado para montar um relatório.
      </p>
    );
  }

  const cartoes = cartoesDoRelatorio(doMes, anterior);
  // Enquanto ninguém escreve, o rascunho dos números ocupa o lugar — marcado
  // como rascunho. "Nenhuma frase escrita para este mês" era uma folha em
  // branco, e folha em branco não é preenchida: em produção as três frases
  // estão vazias desde que a tela existe. O rascunho nunca é gravado sozinho;
  // "Editar o mês" abre com ele dentro, e salvar é que confirma.
  const rascunho = rascunhoDoResumo(doMes, anterior);
  const escritas = [meta?.resumoOndeEstamos, meta?.resumoAprendizado, meta?.resumoPrioridade];
  const temFrase = escritas.some((f) => f?.trim());
  const frases = temFrase
    ? escritas
    : [rascunho.onde, rascunho.aprendizado, rascunho.prioridade];
  const rotulosDasFrases = ["Onde estamos", "O que aprendemos", "A prioridade seguinte"];
  const plano = (meta?.plano ?? []).filter((p) => p.oQue?.trim());
  const texto = textoDoRelatorio({ perfil: profile?.username ?? null, mes, doMes, anterior, meta });

  return (
    <div className="space-y-5">
      {/* ---- barra: visão + mês ---- */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-border/60 p-0.5">
          {VISOES.map((v) => (
            <button
              key={v.chave}
              type="button"
              onClick={() => setVisao(v.chave)}
              title={v.para}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                visao === v.chave ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {v.rotulo}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
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
            </button>
          ))}
          {accountId && (
            <Button variant="outline" size="sm" className="ml-1 gap-1.5" onClick={() => setEditando(true)}>
              <Pencil className="h-3.5 w-3.5" />
              Editar o mês
            </Button>
          )}
        </div>
      </div>

      {/* O mês escolhido ainda não acabou: sem isto, os números parecem o
          resultado do mês quando são só os dias que já passaram. */}
      {doMes.emCurso && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[12px] leading-relaxed text-muted-foreground">
          <b className="text-foreground">{rotuloDoMes(mes)} ainda está em curso</b> —{" "}
          {doMes.emCurso.dias} de {doMes.emCurso.de} dias. Os números são do que já passou, e por
          isso o relatório não compara com o mês anterior. Para mandar ao cliente, escolha o último
          mês fechado.
        </p>
      )}

      {/* ---- resumo em três frases ---- */}
      {visao !== "texto" && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <CardTitle className="text-base">Resumo de {rotuloDoMes(mes)}</CardTitle>
              {!temFrase && (
                <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-600 dark:text-amber-400">
                  rascunho — editar
                </span>
              )}
              <Dica>
                Três frases: onde estamos, o que aprendemos e qual é a prioridade seguinte. É a
                leitura que nenhum número produz sozinho — e a primeira coisa que o cliente lê.
                {"\n\n"}
                Enquanto ninguém escreve, elas vêm rascunhadas dos números do mês e aparecem
                marcadas como rascunho. O rascunho não é gravado: &ldquo;Editar o mês&rdquo; abre
                com ele dentro, e salvar é que confirma.
              </Dica>
            </div>
          </CardHeader>
          <CardContent>
            {!temFrase && (
              <p className="mb-2 text-[12px] text-muted-foreground">
                Rascunho montado dos números deste mês. Em <b>Editar o mês</b> ele abre pronto para
                corrigir — nada vai para o cliente antes de alguém salvar.
              </p>
            )}
            {frases.every((f) => !f?.trim()) ? (
              <p className="text-sm text-muted-foreground">
                Ainda não há número suficiente neste mês para rascunhar o resumo. Em{" "}
                <b>Editar o mês</b> ficam as três frases que abrem o relatório.
              </p>
            ) : (
              <dl className="divide-y divide-border/40">
                {frases.map((f, i) =>
                  f?.trim() ? (
                    <div key={rotulosDasFrases[i]} className="grid gap-1 py-2.5 sm:grid-cols-[minmax(0,11rem)_1fr] sm:gap-4">
                      <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                        {rotulosDasFrases[i]}
                      </dt>
                      <dd className={`text-sm ${temFrase ? "" : "italic text-muted-foreground"}`}>
                        {f}
                      </dd>
                    </div>
                  ) : null,
                )}
              </dl>
            )}
          </CardContent>
        </Card>
      )}

      {/* ---- resultados ---- */}
      {visao !== "texto" && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {cartoes.map((c) => (
            <div key={c.rotulo} className="rounded-xl border border-border/40 bg-card/60 p-3">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {c.rotulo}
              </p>
              <p className="text-2xl font-bold tabular-nums">{c.valor}</p>
              {c.variacao && <p className="text-[11px] text-muted-foreground">{c.variacao}</p>}
              <p className="mt-1 text-[11px] text-muted-foreground">{c.explicacao}</p>
            </div>
          ))}
        </div>
      )}

      {/* ---- visão do cliente: os posts que explicam ---- */}
      {visao === "cliente" && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Conteúdos que explicam o resultado</CardTitle>
          </CardHeader>
          <CardContent>
            {postsDoMes.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum post deste mês na janela carregada (a lista traz os 100 mais recentes).
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {destaquesDoPeriodo(postsDoMes).map(({ pergunta, post, valor }) => (
                  <a
                    key={pergunta}
                    href={post.permalink ?? "#"}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="rounded-xl border border-border/40 bg-card/60 p-3 transition-colors hover:border-border"
                  >
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      {pergunta}
                    </p>
                    <p className="text-sm font-semibold tabular-nums">{valor}</p>
                    <p className="line-clamp-2 text-xs text-muted-foreground">{post.caption ?? "Sem legenda"}</p>
                  </a>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ---- visão do social media: o que repetir e o que rever ---- */}
      {visao === "social" && postsDoMes.length > 0 && <ParaOSocialMedia posts={postsDoMes} />}

      {/* ---- próximos passos ---- */}
      {visao !== "texto" && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Próximos passos</CardTitle>
          </CardHeader>
          <CardContent>
            {plano.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma prioridade registrada. Em <b>Editar o mês</b> cabem até três, cada uma com
                responsável e prazo — sem isso, o relatório termina sem ninguém dono de nada.
              </p>
            ) : (
              <ul className="space-y-2">
                {plano.map((p, i) => (
                  <li key={i} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                    <span>{p.oQue}</span>
                    {p.responsavel && <b className="text-xs">{p.responsavel}</b>}
                    {p.prazo && <span className="text-xs text-muted-foreground">até {p.prazo}</span>}
                    {p.status && (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {p.status === "concluido" ? "concluído" : p.status === "em-andamento" ? "em andamento" : "a fazer"}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {/* ---- versão para compartilhar ---- */}
      {visao === "texto" && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div className="flex items-center gap-1.5">
              <CardTitle className="text-base">Versão para compartilhar</CardTitle>
              <Dica>
                O mesmo mês em texto puro, para colar no WhatsApp ou no e-mail. Sem isto, quem manda
                o resultado digita tudo de novo — e o que chega ao cliente nunca é igual ao que a
                tela mostra.
              </Dica>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => {
                navigator.clipboard
                  .writeText(texto)
                  .then(() => toast.success("Relatório copiado"))
                  .catch(() => toast.error("Não consegui copiar"));
              }}
            >
              <Copy className="h-3.5 w-3.5" />
              Copiar
            </Button>
          </CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap rounded-lg bg-muted/40 p-4 font-sans text-sm">{texto}</pre>
          </CardContent>
        </Card>
      )}

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

/**
 * O recorte do social media: o que repetir, o que rever e que tema rendeu.
 *
 * O cliente quer saber se o mês foi bom; quem produz quer saber o que fazer na
 * segunda-feira, e isso é uma lista de posts, não um indicador.
 */
function ParaOSocialMedia({ posts }: { posts: InstagramMedia[] }) {
  const referencias = referenciasPorFormato(posts);
  const ordenados = [...posts]
    .filter((p) => interessePorMil(p) != null)
    .sort((a, b) => (interessePorMil(b) ?? 0) - (interessePorMil(a) ?? 0));
  const temas = agruparPorTema(posts).slice(0, 5);

  const lista = (titulo: string, itens: InstagramMedia[], vazio: string) => (
    <div>
      <h4 className="mb-2 text-sm font-medium">{titulo}</h4>
      {itens.length === 0 ? (
        <p className="text-xs text-muted-foreground">{vazio}</p>
      ) : (
        <ul className="space-y-2">
          {itens.map((p) => {
            const status = statusDoPost(p, referencias);
            return (
              <li key={p.id} className="flex items-start gap-2">
                {p.thumbnail_url ?? p.media_url ? (
                  <img src={p.thumbnail_url ?? p.media_url} alt="" className="h-10 w-10 shrink-0 rounded object-cover" />
                ) : (
                  <span className="h-10 w-10 shrink-0 rounded bg-muted" />
                )}
                <span className="min-w-0 text-xs">
                  <b>{NOME_DO_FORMATO[formatoDoPost(p)]}</b> · alcance {nf(p.reach ?? 0)} ·{" "}
                  {umaCasa(interessePorMil(p) ?? 0)} por mil
                  {status && <span className="ml-1 text-muted-foreground">({status})</span>}
                  <span className="block truncate text-muted-foreground">{p.caption ?? "Sem legenda"}</span>
                  {p.permalink && (
                    <a
                      href={p.permalink}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-0.5 text-muted-foreground hover:text-foreground"
                    >
                      abrir <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-1.5">
          <CardTitle className="text-base">O que repetir e o que rever</CardTitle>
          <Dica>
            Ordenado por interesse por mil — compartilhamentos e salvamentos a cada mil alcançados —
            para que posts de tamanhos diferentes caibam na mesma lista.
          </Dica>
        </div>
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-2">
        {lista("Os 5 que mais se espalharam", ordenados.slice(0, 5), "Nenhum post com alcance medido.")}
        {lista("Os 5 para rever", ordenados.slice(-5).reverse(), "Nenhum post com alcance medido.")}
        {temas.length > 0 && (
          <div className="lg:col-span-2">
            <h4 className="mb-2 text-sm font-medium">Temas que mais se espalharam</h4>
            <ul className="flex flex-wrap gap-2">
              {temas.map((t) => (
                <li key={t.tema} className="rounded-full border border-border/60 px-2.5 py-1 text-xs">
                  {t.tema}
                  <span className="ml-1.5 tabular-nums text-muted-foreground">
                    {t.interesse == null ? "—" : umaCasa(t.interesse)} por mil · {t.posts} post(s)
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
