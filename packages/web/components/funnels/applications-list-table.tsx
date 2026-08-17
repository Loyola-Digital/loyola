"use client";

/**
 * Story 43.7 — quem aplicou, linha a linha.
 *
 * Vive logo abaixo do gráfico "Aplicações por dia" e responde a outra pergunta:
 * o gráfico diz "quantas por dia, por página"; a tabela diz "quem, e de que
 * página veio". A coluna LP sai do mesmo `utm_term` e pela mesma função da
 * Story 43.6 — se as duas telas discordassem sobre a página de uma aplicação,
 * nenhuma das duas serviria.
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
import { useStageApplicationsList } from "@/lib/hooks/use-stage-applications";

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
            Quem aplicou e de qual página veio · mais recentes primeiro
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
                  <TableHead
                    className="max-w-[280px]"
                    title="utm_term do anúncio de origem — é dele que a LP é extraída"
                  >
                    utm_term
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
                    {/* `title` com o valor inteiro: o utm_term real passa de 100
                        caracteres e truncar sem dar acesso ao original esconderia
                        justamente a evidência de qual anúncio trouxe a pessoa. */}
                    <TableCell
                      className="max-w-[280px] truncate font-mono text-[10px] text-muted-foreground"
                      title={l.utmTerm || undefined}
                    >
                      {l.utmTerm || "—"}
                    </TableCell>
                    <TableCell>
                      {l.lp ? (
                        <span className="inline-block rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
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
