"use client";

/**
 * Story 43.7 — quem aplicou, linha a linha.
 *
 * Vive logo abaixo do gráfico "Aplicações por dia" e responde a outra pergunta:
 * o gráfico diz "quantas por dia, por página"; a tabela diz "quem, e de que
 * página veio". Story 18.84: a coluna LP sai do mesmo link do anúncio que o
 * gráfico usa (`utm_content → anúncio → link`) — se as duas telas discordassem
 * sobre a página de uma aplicação, nenhuma das duas serviria. Com a API
 * anterior, é a letra da 43.6.
 *
 * Mais recente primeiro: quem abre esta tela está acompanhando um lançamento em
 * curso, e a pergunta é "quem entrou agora".
 */

import { useState } from "react";
import { ChevronLeft, ChevronRight, Users } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useStageApplicationsList, type AplicacaoLinha } from "@/lib/hooks/use-stage-applications";
import { tooltipDaPaginaDaAplicacao } from "@/lib/utils/aplicacoes-por-link";

/**
 * Story 18.84 (AC3) — a página pelo link do anúncio: link puro, hiperlinkado,
 * ou "Sem link resolvido" com a causa. A evidência (o anúncio) vai no tooltip,
 * como o `utm_term` ia antes.
 */
function PaginaPeloLink({ linha }: { linha: AplicacaoLinha }) {
  const titulo = tooltipDaPaginaDaAplicacao(linha);
  if (linha.lp && linha.lpUrl) {
    return (
      <a
        href={linha.lpUrl}
        target="_blank"
        rel="noopener noreferrer"
        title={`${titulo} · ${linha.lpUrl}`}
        className="block max-w-[220px] truncate text-[11px] text-primary hover:underline"
      >
        {linha.lp}
      </a>
    );
  }
  return (
    <span className="text-xs italic text-muted-foreground" title={titulo}>
      Sem link resolvido
    </span>
  );
}

const POR_PAGINA = 6;

function fmtData(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a.slice(2)}`;
}

export function ApplicationsListTable({
  projectId,
  funnelId,
  stageId,
}: {
  projectId: string;
  funnelId: string;
  stageId: string;
}) {
  const { data, isLoading } = useStageApplicationsList(projectId, funnelId, stageId);
  const [pagina, setPagina] = useState(0);

  if (isLoading) return <Skeleton className="h-[300px] rounded-xl" />;
  // Sem planilha vinculada o gráfico acima já explica o que fazer — repetir aqui
  // seria dois avisos para a mesma ausência.
  if (!data || data.semPlanilha) return null;

  const linhas = data.aplicacoes;
  const totalPaginas = Math.max(1, Math.ceil(linhas.length / POR_PAGINA));
  // A página corrente é clampada em vez de guardada como estado derivado: se a
  // lista encolher entre dois fetches, uma página fora do fim renderizaria
  // vazia sem nenhum aviso.
  const atual = Math.min(pagina, totalPaginas - 1);
  const visiveis = linhas.slice(atual * POR_PAGINA, atual * POR_PAGINA + POR_PAGINA);

  return (
    <div className="spy-viz rounded-xl border border-border/40 bg-card p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <Users className="h-4 w-4 text-muted-foreground" />
            Aplicações
          </h3>
          <p className="text-[11px] text-muted-foreground">
            Quem aplicou, de qual canal e de qual página · mais recentes primeiro
          </p>
        </div>
        <p className="text-2xl font-semibold leading-none">
          {linhas.length.toLocaleString("pt-BR")}
        </p>
      </div>

      {linhas.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Nenhuma aplicação registrada nas planilhas deste lançamento.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">Data</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead className="w-[120px]" title="Canal declarado na origem da aplicação">
                    utm_source
                  </TableHead>
                  <TableHead className="w-[130px]">LP vinculada</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visiveis.map((l, i) => (
                  <TableRow key={`${l.email}-${l.data}-${i}`}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {fmtData(l.data)}
                    </TableCell>
                    <TableCell className="text-sm font-medium">{l.nome || "—"}</TableCell>
                    <TableCell className="text-xs">{l.email || "—"}</TableCell>
                    <TableCell className="font-mono text-[11px] text-muted-foreground">
                      {l.utmSource || "—"}
                    </TableCell>
                    <TableCell>
                      {l.lpCausa !== undefined ? (
                        <PaginaPeloLink linha={l} />
                      ) : l.lp ? (
                        /* O utm_term vai no tooltip: ele passa de 100 caracteres
                           e não cabe como coluna, mas é DELE que a LP sai —
                           sem acesso a ele a coluna vira um rótulo inauditável. */
                        <span
                          className="inline-block rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary"
                          title={l.utmTerm ? `Extraída de: ${l.utmTerm}` : "Declarada pelo nome da aba"}
                        >
                          {l.lp}
                        </span>
                      ) : (
                        /* Não é erro: o anúncio de origem não trazia a LP no
                           utm_term (tráfego orgânico, direto, ou utm de
                           segmentação). O tooltip evita que "—" seja lido como
                           dado faltando por bug. */
                        <span
                          className="text-xs text-muted-foreground"
                          title="O utm_term desta aplicação não declara a LP — orgânico, direto ou utm de segmentação"
                        >
                          —
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-[11px] text-muted-foreground">
              {atual * POR_PAGINA + 1}–{atual * POR_PAGINA + visiveis.length} de {linhas.length}
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPagina(Math.max(0, atual - 1))}
                disabled={atual === 0}
                className="flex h-7 w-7 items-center justify-center rounded border border-border/40 text-muted-foreground transition-colors hover:bg-muted/50 disabled:opacity-30 disabled:hover:bg-transparent"
                aria-label="Página anterior"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <span className="px-1 text-[11px] text-muted-foreground">
                {atual + 1} / {totalPaginas}
              </span>
              <button
                type="button"
                onClick={() => setPagina(Math.min(totalPaginas - 1, atual + 1))}
                disabled={atual >= totalPaginas - 1}
                className="flex h-7 w-7 items-center justify-center rounded border border-border/40 text-muted-foreground transition-colors hover:bg-muted/50 disabled:opacity-30 disabled:hover:bg-transparent"
                aria-label="Próxima página"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
