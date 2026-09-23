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
 */

import type { ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  linhaDaTabela,
  totalDaTabela,
  type CelulaDeTaxa,
  type TabelaDeVslsDoFunil,
} from "@/lib/utils/vturb-tabela";

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
  range: { startDate: string; endDate: string };
  /** O seletor de período do bloco — aqui quando a tabela aparece. */
  seletor: ReactNode;
}) {
  const cabecalho = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h3 className="text-sm font-semibold">VSLs do funil</h3>
        <p className="text-[11px] text-muted-foreground">
          {range.startDate} → {range.endDate} · Play Rate e Retenção ao pitch como o VTurb calcula, truncados a 2 casas
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
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/40 text-left text-muted-foreground">
              <th className="py-1.5 pr-3 font-medium">Vídeo</th>
              <th className="py-1.5 px-3 text-right font-medium" title="Plays únicos ÷ carregamentos únicos do player (dispositivo)">
                Play Rate
              </th>
              <th
                className="py-1.5 pl-3 text-right font-medium"
                title="Passaram do pitch ÷ (passaram + não passaram do pitch) — a conta do VTurb, com o pitch cadastrado lá hoje"
              >
                Retenção ao pitch
              </th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.playerId} className="border-b border-border/20 align-top">
                <td className="py-1.5 pr-3">
                  <span className="font-medium">{l.nome}</span>
                  {l.erro && (
                    <span role="alert" className="block text-[10px] text-destructive">
                      falha na leitura: {l.erro}
                    </span>
                  )}
                </td>
                <td className="py-1.5 px-3 text-right">
                  <Taxa celula={l.playRate} />
                </td>
                <td className="py-1.5 pl-3 text-right">
                  <Taxa celula={l.retencao} />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="align-top font-semibold">
              <td className="py-1.5 pr-3" title="Soma dos brutos dos vídeos — um aparelho que viu dois vídeos conta nos dois">
                Total
                <span className="block text-[10px] font-normal text-muted-foreground">soma dos vídeos</span>
              </td>
              <td className="py-1.5 px-3 text-right">
                <Taxa celula={total.playRate} />
              </td>
              <td className="py-1.5 pl-3 text-right">
                <Taxa celula={total.retencao} />
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      {(total.foraPorFalha.length > 0 || total.foraDaRetencao.length > 0) && (
        <div className="space-y-0.5 text-[11px] text-muted-foreground">
          {total.foraPorFalha.length > 0 && (
            <p>Fora do Total (falha na leitura): {total.foraPorFalha.join(", ")}.</p>
          )}
          {total.foraDaRetencao.length > 0 && (
            <p>Fora da Retenção do Total (pitch não configurado no VTurb): {total.foraDaRetencao.join(", ")}.</p>
          )}
        </div>
      )}
    </div>
  );
}
