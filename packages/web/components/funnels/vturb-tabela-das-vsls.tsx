"use client";

/**
 * Story 29.78 — a tabela das VSLs do funil perpétuo, no topo do bloco VSL.
 *
 * Uma linha por vídeo vinculado às etapas do funil (Play Rate e Retenção ao
 * pitch, "igual o VTurb", truncados a 2 casas) e a linha de Total pela soma
 * dos brutos. As contas vivem em `lib/utils/vturb-tabela.ts`, testadas; este
 * componente só desenha e diz o porquê de cada "—".
 *
 * Quem decide SE a tabela aparece é o bloco (`VturbStageTab`), porque o
 * seletor de período muda de lugar conforme ela aparece ou não.
 *
 * Story 29.82 — as 10 colunas do VTurb, nesta ordem (AC1): Vídeo ·
 * Visualizações · Vis. Únicas · Plays · Plays Únicos · Play Rate · Retenção ao
 * Pitch · Audiência do Pitch · Engajamento · Cliques no Botão. A tabela rola
 * na horizontal (R2); a coluna do nome fica presa à esquerda.
 */

import type { ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  linhaDaTabela,
  periodoDoCabecalho,
  totalDaTabela,
  type CelulaDeTaxa,
  type LinhaDaTabela,
  type TabelaDeVslsDoFunil,
} from "@/lib/utils/vturb-tabela";

/**
 * Story 29.82 (AC1) — as colunas de números, na ORDEM da story. A linha de
 * vídeo e a de Total desenham as mesmas chaves, então não divergem.
 */
const COLUNAS: { chave: Exclude<keyof LinhaDaTabela, "playerId" | "nome" | "erro">; titulo: string; dica: string }[] = [
  { chave: "visualizacoes", titulo: "Visualizações", dica: "Carregamentos do player no período (total_viewed)" },
  { chave: "visUnicas", titulo: "Vis. Únicas", dica: "Carregamentos únicos por dispositivo (total_viewed_device_uniq)" },
  { chave: "plays", titulo: "Plays", dica: "Plays no período (total_started)" },
  { chave: "playsUnicos", titulo: "Plays Únicos", dica: "Plays únicos por dispositivo (total_started_device_uniq)" },
  { chave: "playRate", titulo: "Play Rate", dica: "Plays únicos ÷ carregamentos únicos do player (dispositivo)" },
  {
    chave: "retencao",
    titulo: "Retenção ao Pitch",
    dica: "Passaram do pitch ÷ (passaram + não passaram do pitch) — a conta do VTurb, com o pitch cadastrado lá hoje",
  },
  { chave: "audienciaPitch", titulo: "Audiência do Pitch", dica: "Pessoas que chegaram no pitch (total_over_pitch)" },
  {
    chave: "engajamento",
    titulo: "Engajamento",
    dica: "Do VTurb: tempo total assistido ÷ (plays × duração do vídeo). No Total: Σ assistido ÷ Σ (plays × duração)",
  },
  {
    chave: "cliques",
    titulo: "Cliques no Botão",
    dica: "Número de cliques no botão de ação, como o VTurb conta (total_clicked) — um número, não taxa",
  },
];

function Taxa({ celula }: { celula: CelulaDeTaxa }) {
  if (celula.texto !== null) return <span className="tabular-nums">{celula.texto}</span>;
  // Ausência com o motivo à vista — nunca um 0 % que parece medição.
  return (
    <span className="inline-flex flex-col items-end leading-tight">
      <span className="text-muted-foreground">—</span>
      {celula.motivo && <span className="text-[10px] text-muted-foreground">{celula.motivo}</span>}
    </span>
  );
}

export function TabelaDasVsls({
  estado,
  dados,
  erro,
  atualizando = false,
  range,
  seletor,
}: {
  estado: "carregando" | "erro" | "pronta";
  dados: TabelaDeVslsDoFunil | undefined;
  erro: string | null;
  /** Trocando de período com a tabela anterior na tela. */
  atualizando?: boolean;
  /** A janela PEDIDA — no cabeçalho só sem linhas (esqueleto, erro). */
  range: { startDate: string; endDate: string };
  /** O seletor de período do bloco — aqui quando a tabela aparece. */
  seletor: ReactNode;
}) {
  // DOC-001 — com linhas na tela, o período é o devolvido (o das linhas).
  const periodo = periodoDoCabecalho(estado, dados, range);
  const cabecalho = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h3 className="text-sm font-semibold">VSLs do funil</h3>
        <p className="text-[11px] text-muted-foreground">
          {periodo.startDate} → {periodo.endDate} · números do VTurb; taxas truncadas a 2 casas
        </p>
      </div>
      {seletor}
    </div>
  );

  if (estado === "carregando") {
    return (
      <div className="space-y-3 rounded-xl border border-border/40 bg-card/60 p-4">
        {cabecalho}
        <Skeleton className="h-24 rounded-lg" />
      </div>
    );
  }

  // Falha geral (AC8): dizer que falhou, e por quê — não uma tabela vazia.
  if (estado === "erro" || !dados) {
    return (
      <div className="space-y-3 rounded-xl border border-border/40 bg-card/60 p-4">
        {cabecalho}
        <p role="alert" className="flex items-center gap-1.5 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          Não foi possível ler a tabela das VSLs{erro ? `: ${erro}` : "."}
        </p>
      </div>
    );
  }

  const linhas = dados.videos.map(linhaDaTabela);
  const total = totalDaTabela(dados.videos);

  return (
    <div
      className={`space-y-3 rounded-xl border border-border/40 bg-card/60 p-4 ${
        atualizando ? "opacity-70 transition-opacity" : ""
      }`}
    >
      {cabecalho}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] whitespace-nowrap text-xs">
          <thead>
            <tr className="border-b border-border/40 text-left text-muted-foreground">
              <th className="sticky left-0 bg-card py-1.5 pr-3 font-medium">Nome</th>
              {COLUNAS.map((c) => (
                <th key={c.chave} className="py-1.5 pl-3 text-right font-medium" title={c.dica}>
                  {c.titulo}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.playerId} className="border-b border-border/20 align-top">
                <td className="sticky left-0 bg-card py-1.5 pr-3">
                  <span className="font-medium">{l.nome}</span>
                  {l.erro && (
                    <span role="alert" className="block text-[10px] text-destructive">
                      falha na leitura: {l.erro}
                    </span>
                  )}
                </td>
                {COLUNAS.map((c) => (
                  <td key={c.chave} className="py-1.5 pl-3 text-right">
                    <Taxa celula={l[c.chave]} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="align-top font-semibold">
              <td className="sticky left-0 bg-card py-1.5 pr-3" title="Soma dos brutos dos vídeos — um aparelho que viu dois vídeos conta nos dois">
                Total
                <span className="block text-[10px] font-normal text-muted-foreground">soma dos vídeos</span>
              </td>
              {COLUNAS.map((c) => (
                <td key={c.chave} className="py-1.5 pl-3 text-right">
                  <Taxa celula={total[c.chave]} />
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Total = soma dos vídeos: um aparelho que viu dois vídeos conta nos dois. Engajamento do Total = Σ tempo assistido ÷ Σ (plays × duração).
      </p>
      {(total.foraPorFalha.length > 0 || total.foraDaRetencao.length > 0 || total.foraDoEngajamento.length > 0) && (
        <div className="space-y-0.5 text-[11px] text-muted-foreground">
          {total.foraPorFalha.length > 0 && (
            <p>Fora do Total (falha na leitura): {total.foraPorFalha.join(", ")}.</p>
          )}
          {total.foraDaRetencao.length > 0 && (
            <p>
              Fora da Retenção e da Audiência do Pitch do Total (pitch não configurado no VTurb): {total.foraDaRetencao.join(", ")}.
            </p>
          )}
          {total.foraDoEngajamento.length > 0 && (
            <p>Fora do Engajamento do Total (duração do vídeo ausente no VTurb): {total.foraDoEngajamento.join(", ")}.</p>
          )}
        </div>
      )}
    </div>
  );
}
