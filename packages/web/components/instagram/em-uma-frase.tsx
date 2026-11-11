"use client";

/**
 * A primeira coisa da página: o período inteiro numa frase, e as três etapas
 * que explicam a ordem em que os números devem ser lidos.
 *
 * Vem antes dos cartões de propósito. Quem abre a tela quer saber se o mês foi
 * bom; os treze cartões respondem isso em treze pedaços, e esta frase junta os
 * pedaços na ordem em que a conta funciona.
 */

import { Skeleton } from "@/components/ui/skeleton";
import type { InsightEntry } from "@/lib/hooks/use-instagram";
import {
  alcanceDoPeriodo,
  alcancePorSeguidor,
  seguidoresGanhosEPerdidos,
  somaDaMetrica,
} from "@/lib/utils/instagram-posts";
import { ETAPAS_DO_CAMINHO, fraseDoPeriodo } from "@/lib/utils/instagram-em-uma-frase";

interface Props {
  insights?: InsightEntry[];
  previousInsights?: InsightEntry[];
  isLoading: boolean;
}

export function EmUmaFrase({ insights, previousInsights, isLoading }: Props) {
  if (isLoading) return <Skeleton className="h-36 w-full rounded-xl" />;

  const temAnterior = !!previousInsights && previousInsights.length > 0;
  const follows = seguidoresGanhosEPerdidos(insights);
  const porSeguidor = alcancePorSeguidor(insights);

  const trechos = fraseDoPeriodo({
    alcance: alcanceDoPeriodo(insights),
    alcanceAnterior: temAnterior ? alcanceDoPeriodo(previousInsights) : null,
    compartilhamentos: somaDaMetrica(insights, "shares"),
    compartilhamentosAnterior: temAnterior ? somaDaMetrica(previousInsights, "shares") : null,
    entraram: follows?.gained ?? null,
    sairam: follows?.lost ?? null,
    pctNaoSeguidores: porSeguidor?.pctNaoSeguidores ?? null,
  });

  return (
    <div className="rounded-xl border border-l-4 border-border/40 border-l-primary bg-card/60 p-4">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        Em uma frase
      </p>
      <p className="mt-2 text-[15px] leading-relaxed">
        {trechos.map((t, i) =>
          t.forte ? (
            <strong key={i} className="font-semibold">
              {t.texto}
            </strong>
          ) : (
            <span key={i}>{t.texto}</span>
          ),
        )}
      </p>
      <div className="mt-4 grid gap-3 border-t border-border/40 pt-3 sm:grid-cols-3">
        {ETAPAS_DO_CAMINHO.map((e) => (
          <div key={e.n} className="flex gap-2">
            <span
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white ${e.cor}`}
              aria-hidden="true"
            >
              {e.n}
            </span>
            <p className="text-xs text-muted-foreground">
              <b className="text-foreground">{e.nome}.</b> {e.texto}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
