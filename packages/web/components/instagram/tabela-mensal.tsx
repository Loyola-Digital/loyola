"use client";

/**
 * O comparativo mensal do perfil — a planilha que os experts já mantinham.
 *
 * ## A pergunta é "cresceu ou caiu?"
 *
 * Por isso cada número vem com a variação em relação ao mês anterior, e não
 * sozinho. Medido numa conta real: junho fechou −321 seguidores, julho −2.255,
 * agosto +4.134. Os três números soltos numa tela não contam essa virada; lado
 * a lado, contam.
 *
 * ## O mês corrente fica marcado como parcial
 *
 * Ele tem menos dias que os outros e vai parecer uma queda de 70%. Escondê-lo
 * tiraria justamente o mês que está acontecendo; mostrá-lo sem aviso mentiria.
 * Fica, com o rótulo.
 */

import { useState } from "react";
import { ArrowDown, ArrowUp, ExternalLink, Loader2, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useInstagramMensal, type MesDoOrganico } from "@/lib/hooks/use-instagram-mensal";
import { Dica } from "@/components/instagram/dica";

/** O que cada coluna é — no "i" ao lado do título. */
const COLUNAS: [string, string][] = [
  ["Mês", "Mês do calendário. O mês em curso fica marcado: tem menos dias e ainda vai crescer."],
  ["Seguidores", "Total de seguidores no fim do mês. A Meta só dá o total de hoje, então os meses passados são reconstruídos subtraindo o crescimento dos meses seguintes."],
  ["Crescimento", "Saldo do mês: novos seguidores menos unfollows."],
  ["Novos / unfollows", "Quantas contas começaram a seguir (+) e quantas deixaram de seguir (−) no mês."],
  ["Alcance", "Contas únicas alcançadas no mês (soma diária). Embaixo, a variação sobre o mês anterior."],
  ["Views", "Visualizações de todo o conteúdo no mês, contando repetições. Embaixo, a variação sobre o mês anterior."],
  ["Engajamento", "Interações ÷ alcance do mês. A variação embaixo vai em pontos percentuais (pp)."],
  ["Posts", "Posts publicados no mês."],
  ["Melhor post", "O post de maior taxa de engajamento do mês — não o de maior alcance: um post entregue a muita gente e ignorado não é o melhor. Embaixo, a performance dele."],
];

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function nomeDoMes(iso: string): string {
  const [ano, mes] = iso.split("-");
  return `${MESES[Number(mes) - 1] ?? iso} ${String(ano).slice(2)}`;
}

/** Milhares e milhões abreviados: a tabela tem seis colunas de número. */
function curto(n: number | null): string {
  if (n === null) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1).replace(".", ",")} mi`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(abs >= 10_000 ? 0 : 1).replace(".", ",")} mil`;
  return String(n);
}

/**
 * A variação ao lado do número.
 *
 * Cor e seta juntas: só a cor exclui quem não distingue vermelho de verde, e
 * esta tabela é apresentada em reunião, projetada.
 */
function Variacao({ valor, pontos = false }: { valor: number | null; pontos?: boolean }) {
  if (valor === null) {
    return <span className="text-[10px] text-muted-foreground/50">—</span>;
  }
  const sobe = valor > 0;
  const parado = valor === 0;
  const Icone = parado ? Minus : sobe ? ArrowUp : ArrowDown;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[10px] tabular-nums ${
        parado ? "text-muted-foreground" : sobe ? "text-emerald-600" : "text-red-500"
      }`}
    >
      <Icone className="h-2.5 w-2.5" />
      {Math.abs(valor).toString().replace(".", ",")}
      {pontos ? " pp" : "%"}
    </span>
  );
}

function Celula({
  valor,
  variacao,
  pontos,
  sufixo,
}: {
  valor: string;
  variacao: number | null;
  pontos?: boolean;
  sufixo?: string;
}) {
  return (
    <td className="whitespace-nowrap px-3 py-2.5">
      <div className="font-medium tabular-nums">
        {valor}
        {sufixo}
      </div>
      <Variacao valor={variacao} pontos={pontos} />
    </td>
  );
}

/** Quantos meses a tabela abre mostrando; o resto fica a um clique. */
const MESES_VISIVEIS = 6;

export function TabelaMensal({ accountId }: { accountId: string | null }) {
  // A mesma busca de 24 meses do comparativo e do gráfico: uma consulta só.
  const { data, isLoading, error } = useInstagramMensal(accountId);
  const [todos, setTodos] = useState(false);

  if (!accountId) return null;

  const historico = data?.meses ?? [];
  const meses = todos ? historico : historico.slice(-MESES_VISIVEIS);
  const mesCorrente = new Date().toISOString().slice(0, 7);

  return (
    <div className="rounded-xl border border-border/60 bg-card">
      <div className="flex items-baseline justify-between gap-3 border-b border-border/60 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">Comparativo mensal</h2>
          <p className="text-[11px] text-muted-foreground">
            Cada número com a variação sobre o mês anterior
          </p>
        </div>
        <div className="flex items-center gap-3">
          {data?.seguidoresHoje != null && (
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {data.seguidoresHoje.toLocaleString("pt-BR")} seguidores hoje
            </span>
          )}
          {historico.length > MESES_VISIVEIS && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-[11px]"
              onClick={() => setTodos((v) => !v)}
            >
              {todos ? `Só os últimos ${MESES_VISIVEIS}` : `Ver os ${historico.length} meses`}
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <p className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Buscando o histórico de meses…
        </p>
      ) : error ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">
          Não consegui buscar o histórico. O token da conta pode ter expirado.
        </p>
      ) : meses.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">
          Sem dados no período.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-border/60">
                {COLUNAS.map(([h, dica]) => (
                  <th
                    key={h}
                    className="whitespace-nowrap px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    <span className="inline-flex items-center gap-1">
                      {h}
                      <Dica>{dica}</Dica>
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Do mais recente para o mais antigo: o mês que interessa é o
                  de cima, e rolar para achá-lo derrotaria o "bater o olho". */}
              {[...meses].reverse().map((m: MesDoOrganico) => {
                const parcial = m.mes === mesCorrente;
                if (m.semDados) {
                  return (
                    <tr key={m.mes} className="border-b border-border/40 last:border-b-0">
                      <td className="whitespace-nowrap px-3 py-2.5 font-medium">
                        {nomeDoMes(m.mes)}
                      </td>
                      <td
                        colSpan={COLUNAS.length - 1}
                        className="px-3 py-2.5 text-[12px] text-muted-foreground"
                      >
                        Sem dado da Meta para este mês ainda — ele entra na próxima
                        busca (a Meta libera 200 consultas por hora).
                      </td>
                    </tr>
                  );
                }
                return (
                  <tr
                    key={m.mes}
                    className={`border-b border-border/40 last:border-b-0 ${
                      parcial ? "bg-muted/20" : ""
                    }`}
                  >
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <div className="font-medium">{nomeDoMes(m.mes)}</div>
                      {parcial && (
                        <span className="text-[10px] text-muted-foreground">
                          mês em curso
                        </span>
                      )}
                    </td>

                    <td className="whitespace-nowrap px-3 py-2.5 font-medium tabular-nums">
                      {curto(m.seguidoresNoFim)}
                    </td>

                    <td className="whitespace-nowrap px-3 py-2.5">
                      <span
                        className={`font-medium tabular-nums ${
                          m.crescimento > 0
                            ? "text-emerald-600"
                            : m.crescimento < 0
                              ? "text-red-500"
                              : ""
                        }`}
                      >
                        {m.crescimento > 0 ? "+" : ""}
                        {m.crescimento.toLocaleString("pt-BR")}
                      </span>
                    </td>

                    <td className="whitespace-nowrap px-3 py-2.5 text-[11px] tabular-nums text-muted-foreground">
                      <span className="text-emerald-600">
                        +{m.novosSeguidores.toLocaleString("pt-BR")}
                      </span>
                      {" / "}
                      <span className="text-red-500">
                        −{m.unfollows.toLocaleString("pt-BR")}
                      </span>
                    </td>

                    <Celula valor={curto(m.alcance)} variacao={m.variacao.alcance} />
                    <Celula valor={curto(m.views)} variacao={m.variacao.views} />
                    <Celula
                      valor={m.engajamento === null ? "—" : String(m.engajamento).replace(".", ",")}
                      sufixo={m.engajamento === null ? "" : "%"}
                      variacao={m.variacao.engajamento}
                      pontos
                    />

                    <td className="px-3 py-2.5 tabular-nums text-muted-foreground">{m.posts}</td>

                    <td className="px-3 py-2.5">
                      {m.melhorPost ? (
                        <a
                          href={m.melhorPost.permalink ?? "#"}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="group flex max-w-[260px] items-start gap-1 text-[12px] hover:text-primary"
                        >
                          <span className="line-clamp-2 leading-snug">
                            {m.melhorPost.titulo}
                          </span>
                          <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                        </a>
                      ) : (
                        <span className="text-[12px] text-muted-foreground">—</span>
                      )}
                      {m.melhorPost && (
                        <span className="block text-[10px] text-muted-foreground">
                          {m.melhorPost.engajamento !== null &&
                            `${String(m.melhorPost.engajamento).replace(".", ",")}% de engajamento · `}
                          {curto(m.melhorPost.alcance)} de alcance ·{" "}
                          {m.melhorPost.interacoes.toLocaleString("pt-BR")} interações
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="border-t border-border/40 px-4 py-2 text-[10px] leading-relaxed text-muted-foreground">
        Engajamento = interações ÷ alcance. A variação dele vai em pontos percentuais; a dos demais,
        em porcentagem. O Instagram leva cerca de dois dias para fechar os números de seguidores, então
        o mês em curso sempre aparece menor do que vai terminar.
      </p>
    </div>
  );
}
