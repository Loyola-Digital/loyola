"use client";

// Story 42.17 — "Dados diários" da etapa Lyrio, logo abaixo do Resumo: uma
// linha por dia de calendário de SP da janela do filtro, só o consolidado (D3),
// e o Total no rodapé, que é o dos cards do Resumo. A conta mora em
// `lib/utils/dados-diarios-lyrio.ts`; aqui só o desenho.
//
// Padrão visual do `SalesDailyTable` (18.95): Dia ordenável e fixo à esquerda,
// dica por coluna, Total no rodapé. O conteúdo é outro (Meta + Google + vendas
// do RevenueCat), então o componente é novo. No celular a rolagem horizontal é
// DENTRO da tabela (AC6): a seção tem `min-w-0`, e o contêiner, `overflow-x-auto`.

import { useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { ORDEM_DO_DIA_PADRAO, inverterOrdemDoDia, type OrdemDoDia } from "@/lib/utils/ordem-do-dia";
import { EventosDoDia, type EventosPorDia } from "./eventos-do-dia";
import {
  DICA_DIA_EM_ANDAMENTO,
  formatarCelula,
  montarDadosDiariosDoLyrio,
  type ColunaDosDadosDiarios,
  type EntradaDosDadosDiarios,
  type ValoresDoDia,
  type ChaveDaColuna,
} from "@/lib/utils/dados-diarios-lyrio";

function fmtDia(d: string): string {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

const DIA_FIXO = "sticky left-0 z-10";

function Celulas({
  colunas,
  valores,
  causas,
}: {
  colunas: ColunaDosDadosDiarios[];
  valores: ValoresDoDia;
  causas: Partial<Record<ChaveDaColuna, string>>;
}) {
  return (
    <>
      {colunas.map((c) => (
        <TableCell
          key={c.chave}
          data-coluna={c.chave}
          className={`text-right whitespace-nowrap tabular-nums ${causas[c.chave] ? "cursor-help" : ""}`}
          title={causas[c.chave]}
        >
          {formatarCelula(c.formato, valores[c.chave])}
        </TableCell>
      ))}
    </>
  );
}

export function LyrioDadosDiarios({
  entrada,
  eventosPorDia,
}: {
  entrada: Omit<EntradaDosDadosDiarios, "ordem">;
  /**
   * O que o Log de Campanha registrou em cada dia, para os ícones ao lado da
   * data. Vem da etapa e não de um hook aqui: a tabela continua sem consulta
   * própria (AC3d/AC4b da 42.17), e com ela o dia em que o ROAS virou mostra,
   * ali mesmo, que houve ajuste de budget ou criativo novo.
   */
  eventosPorDia?: EventosPorDia;
}) {
  const [ordem, setOrdem] = useState<OrdemDoDia>(ORDEM_DO_DIA_PADRAO);
  const dados = montarDadosDiariosDoLyrio({ ...entrada, ordem });

  return (
    <section aria-label="Dados diários" className="min-w-0 max-w-full space-y-2 rounded-xl border border-border/40 bg-card p-4">
      <h2 className="text-sm font-semibold">{dados.titulo}</h2>
      {dados.avisos.map((a) => (
        <p key={a} role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {a}
        </p>
      ))}
      {dados.carregando ? (
        <Skeleton data-testid="dados-diarios-carregando" className="h-40 w-full" />
      ) : (
        <div data-rolagem="tabela" className="max-w-full overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={`${DIA_FIXO} bg-background min-w-[110px]`}>
                  <button
                    type="button"
                    onClick={() => setOrdem((o) => inverterOrdemDoDia(o))}
                    className="inline-flex items-center gap-1 font-semibold hover:text-foreground transition-colors"
                    title={ordem === "desc" ? "Mais recente primeiro — clique para inverter" : "Mais antigo primeiro — clique para inverter"}
                    aria-label={`Ordenar por dia: ${ordem === "desc" ? "decrescente" : "crescente"}`}
                  >
                    Dia
                    {ordem === "desc" ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />}
                  </button>
                </TableHead>
                {dados.colunas.map((c) => (
                  <TableHead key={c.chave} className={`text-right whitespace-nowrap ${c.dica ? "cursor-help" : ""}`} title={c.dica ?? undefined}>
                    {c.rotulo}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {dados.dias.map((r) => (
                <TableRow key={r.date} data-dia={r.date}>
                  <TableCell className={`${DIA_FIXO} bg-background whitespace-nowrap`}>
                    {fmtDia(r.date)}
                    <EventosDoDia entradas={eventosPorDia?.get(r.date)} dia={r.date} />
                    {r.emAndamento && (
                      <span
                        className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                        title={DICA_DIA_EM_ANDAMENTO}
                      >
                        {DICA_DIA_EM_ANDAMENTO}
                      </span>
                    )}
                  </TableCell>
                  <Celulas colunas={dados.colunas} valores={r.valores} causas={r.causas} />
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow className="font-semibold" data-dia="total">
                <TableCell className={`${DIA_FIXO} bg-muted`}>Total</TableCell>
                <Celulas colunas={dados.colunas} valores={dados.total.valores} causas={dados.total.causas} />
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}
    </section>
  );
}
