"use client";

/**
 * META ADS — TESTE (aba da Captação Paga).
 *
 * Moldura visual (design system nosso + estrutura bonita): logo de fundo em
 * marca d'água ocupando ~metade da tela bem opaca, gradientes/glows sutis, e
 * header com gradient-text. DENTRO renderiza o DASHBOARD REAL inteiro (todos os
 * gráficos + o filtro de dias que já funciona) — nada é reduzido; só a moldura
 * é nova. Theme-aware pra não parecer "enfiado" no app.
 */

import type { ReactNode } from "react";
import { FlaskConical } from "lucide-react";

export function MetaAdsTesteTab({ children }: { children: ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/40 bg-gradient-to-b from-card/60 to-background p-4 sm:p-6">
      {/* Logo em marca d'água — metade da tela, bem opaca (faint) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 z-0 hidden w-1/2 bg-no-repeat opacity-[0.05] md:block dark:opacity-[0.07]"
        style={{
          backgroundImage: "url('/logo.svg')",
          backgroundPosition: "center right",
          backgroundSize: "contain",
        }}
      />
      {/* Glows sutis (brand) — theme-aware, sem virar bloco escuro estranho */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background:
            "radial-gradient(560px 260px at 12% 0%, rgba(124,58,237,.10), transparent)," +
            "radial-gradient(520px 240px at 88% 8%, rgba(6,182,212,.10), transparent)," +
            "radial-gradient(680px 300px at 60% 100%, rgba(253,212,73,.07), transparent)",
        }}
      />

      <div className="relative z-10 space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-400/30 bg-cyan-400/10">
              <FlaskConical className="h-4.5 w-4.5 text-cyan-400" />
            </span>
            <div>
              <h2 className="text-xl font-bold leading-none tracking-tight sm:text-2xl">
                Meta Ads{" "}
                <span className="bg-gradient-to-r from-cyan-400 via-sky-400 to-violet-500 bg-clip-text text-transparent">
                  TESTE
                </span>
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Mesmo dashboard, todos os gráficos e o filtro de dias — só a moldura é o experimento.
              </p>
            </div>
          </div>
          <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-widest text-violet-500 dark:text-violet-300">
            experimento visual
          </span>
        </div>

        {/* Dashboard real completo */}
        {children}
      </div>
    </div>
  );
}
