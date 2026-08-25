"use client";

// ============================================================
// Story 43.8 — as três camadas do vídeo e as sugestões de remontagem.
//
// A premissa: cada taxa é condicional à anterior, então isola uma parte do
// criativo. É isso que autoriza recombinar abertura de um com promessa de outro.
//
// ⚠️ O alvo do play rate (90%) está acima do melhor criativo de todas as contas
// medidas (70,8%). Por isso o bloco de alvo mostra `nenhumAtinge` de forma
// explícita: um painel todo vermelho significa "alvo mal calibrado" com a mesma
// frequência que "inventário ruim", e só quem definiu o alvo decide qual é.
// ============================================================

import { Film, Trophy, AlertTriangle, Scissors } from "lucide-react";
import { useCamadasDeVideo } from "@/lib/hooks/use-camadas-video";
import {
  ROTULO_DA_CAMADA,
  ROTULO_DA_TAXA,
  taxaDaCamada,
  type Camada,
  type CriativoAvaliado,
  type Remontagem,
} from "@loyola-x/shared/src/video-camadas";

const CAMADAS: Camada[] = ["abertura", "promessa", "corpo"];

const EXPLICACAO: Record<Camada, string> = {
  abertura: "Reproduções de 3s ÷ impressões. Abaixo do alvo → edite os 5 primeiros segundos.",
  promessa: "ThruPlay (≥15s ou completo) ÷ reproduções de 3s. Abaixo → a copy está ruim; troque o hook.",
  corpo: "Chegou a 75% ÷ reproduções de 3s. Abaixo → copy e/ou edição do corpo.",
};

const pct = (v: number | null | undefined) =>
  v == null ? "—" : `${(v * 100).toFixed(1).replace(".", ",")}%`;

function nomeCurto(c: CriativoAvaliado | null) {
  if (!c) return "—";
  return c.adName.length > 46 ? `${c.adName.slice(0, 46)}…` : c.adName;
}

export function CamadasDeVideoSection({ projectId }: { projectId: string }) {
  const { data, isLoading } = useCamadasDeVideo(projectId);

  if (isLoading) {
    return <div className="h-40 animate-pulse rounded-xl border border-border/30 bg-muted/20" />;
  }
  if (!data || data.acimaDoPiso === 0) return null;

  const [a, m, d2] = data.serieDesde?.split("-") ?? [];

  return (
    <div className="space-y-4 rounded-xl border border-border/30 bg-card/60 p-5">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Film className="h-4 w-4" />
          Camadas do vídeo
        </h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Cada taxa mede uma parte diferente do criativo. {data.acimaDoPiso} de{" "}
          {data.totalDeCriativos} criativos têm reproduções suficientes para entrar na conta.
          {data.serieDesde && ` Série desde ${d2}/${m}/${a}.`}
        </p>
      </div>

      {/* As três camadas, com alvo e mediana lado a lado. */}
      <div className="grid gap-2 sm:grid-cols-3">
        {CAMADAS.map((c) => {
          const alvo = data.alvos[c];
          const campeao = data.campeoes[c];
          return (
            <div key={c} className="rounded-lg border border-border/40 p-3">
              <p className="text-[11px] text-muted-foreground">{ROTULO_DA_CAMADA[c]}</p>
              <p className="text-sm font-medium">{ROTULO_DA_TAXA[c]}</p>
              <div className="mt-1.5 flex items-baseline gap-2">
                <span className="text-lg font-semibold tabular-nums">{pct(alvo.medianaDaConta)}</span>
                <span className="text-[10px] text-muted-foreground">mediana</span>
              </div>
              <p className="text-[10px] text-muted-foreground">
                alvo {pct(alvo.alvo)} · {alvo.quantosAtingem} de {alvo.total} atingem
              </p>
              {/* O aviso que impede a leitura errada de um painel todo vermelho. */}
              {alvo.nenhumAtinge && (
                <p className="mt-1 text-[10px] text-amber-600 dark:text-amber-400">
                  Nenhum criativo atinge este alvo — vale revisar se a régua está calibrada
                  para esta conta.
                </p>
              )}
              <p className="mt-1.5 border-t border-border/30 pt-1.5 text-[10px] text-muted-foreground/80">
                {EXPLICACAO[c]}
              </p>
              {campeao && (
                <p className="mt-1 truncate text-[10px]" title={campeao.adName}>
                  <Trophy className="mr-0.5 inline h-3 w-3 text-amber-500" />
                  {pct(taxaDaCamada(campeao.taxas, c))} · {nomeCurto(campeao)}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Sugestões de remontagem. */}
      {data.sugestoes.length > 0 && (
        <div className="space-y-2">
          <h4 className="flex items-center gap-1.5 text-xs font-medium">
            <Scissors className="h-3.5 w-3.5" />
            Sugestões de remontagem
          </h4>
          {data.sugestoes.map((s: Remontagem, i: number) => (
            <div key={i} className="rounded-lg border border-border/40 p-3 text-[11px]">
              <div className="grid gap-1 sm:grid-cols-3">
                {(
                  [
                    ["abertura", s.abertura],
                    ["promessa", s.promessa],
                    ["corpo", s.corpo],
                  ] as const
                ).map(([cam, cri]) => (
                  <div key={cam} className="min-w-0">
                    <p className="text-[10px] text-muted-foreground">{ROTULO_DA_CAMADA[cam]}</p>
                    <p className="truncate font-medium" title={cri.adName}>{nomeCurto(cri)}</p>
                    <p className="text-[10px] text-muted-foreground tabular-nums">
                      {pct(taxaDaCamada(cri.taxas, cam))}
                    </p>
                  </div>
                ))}
              </div>
              {/* AC6 — a sugestão nunca é puramente estatística. */}
              <p
                className={`mt-2 border-t border-border/30 pt-2 ${
                  s.coerente ? "text-muted-foreground" : "text-amber-600 dark:text-amber-400"
                }`}
              >
                {!s.coerente && <AlertTriangle className="mr-1 inline h-3 w-3" />}
                {s.nota}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* AC7 — os dois grupos que NÃO são matéria-prima de remontagem. */}
      <div className="grid gap-2 sm:grid-cols-2 text-[11px]">
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
          <p className="font-medium text-emerald-700 dark:text-emerald-500">
            Padrão-ouro · {data.padraoOuro.length}
          </p>
          <p className="mt-0.5 text-muted-foreground">
            Acima da mediana nas três camadas. Referência, não matéria-prima — já funcionam
            inteiros.
          </p>
          {data.padraoOuro.slice(0, 3).map((c: CriativoAvaliado) => (
            <p key={c.adId} className="mt-0.5 truncate text-[10px]" title={c.adName}>
              {nomeCurto(c)}
            </p>
          ))}
        </div>
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3">
          <p className="font-medium text-red-700 dark:text-red-500">
            Fracos nas três · {data.fracos.length}
          </p>
          <p className="mt-0.5 text-muted-foreground">
            Candidatos a pausar, não a remontar: não há de onde tirar a parte boa.
          </p>
          {data.fracos.slice(0, 3).map((c: CriativoAvaliado) => (
            <p key={c.adId} className="mt-0.5 truncate text-[10px]" title={c.adName}>
              {nomeCurto(c)}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
