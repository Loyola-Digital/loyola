"use client";

/**
 * O PDI desenhado com os componentes do app.
 *
 * Substitui o iframe quando o documento entrega os dados (o normal). Ganhos que
 * o embed não dava: o texto é selecionável e pesquisável pelo Ctrl+F da página,
 * a carta acompanha o tema e a largura da tela em vez de rolar dentro de uma
 * caixa, e nada de terceiro roda no navegador de quem abre.
 *
 * O amarelo sobre escuro é mantido de propósito: é a identidade da carta, e
 * quem já recebeu a sua reconhece o documento.
 */

import { Award, Check, GraduationCap, Square, Target, TrendingUp } from "lucide-react";
import type { PdiDados } from "@/lib/utils/pdi-dados";

const AMARELO = "#F5C800";

function Secao({
  titulo,
  icone,
  children,
}: {
  titulo: string;
  icone?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">
        {icone}
        {titulo}
      </h3>
      {children}
    </section>
  );
}

/** Item com quadradinho — o mesmo desenho das listas do documento original. */
function Linha({ texto }: { texto: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2">
      <span
        className="mt-1 h-2 w-2 shrink-0 rounded-[2px]"
        style={{ background: AMARELO }}
        aria-hidden
      />
      <span className="text-[13px] leading-snug text-neutral-200">{texto}</span>
    </div>
  );
}

export function PdiCard({ dados }: { dados: PdiDados }) {
  return (
    <article className="overflow-hidden rounded-xl border border-white/10 bg-[#111111] text-white">
      {/* Cabeçalho */}
      <header className="border-b border-white/10 px-5 py-5 sm:px-7 sm:py-6">
        <p className="text-[10px] font-semibold uppercase tracking-[0.24em]" style={{ color: AMARELO }}>
          {dados.eyebrow}
        </p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-2xl font-bold leading-tight sm:text-3xl">{dados.name}</h2>
            <p className="mt-0.5 text-[13px] text-neutral-400">
              {[dados.role, dados.company].filter(Boolean).join(" · ")}
            </p>
          </div>
          {dados.levelBadge && (
            <span
              className="shrink-0 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-black"
              style={{ background: AMARELO }}
            >
              {dados.levelBadge}
            </span>
          )}
        </div>
        {dados.motto && (
          <p className="mt-4 border-l-2 pl-3 text-[13px] italic leading-relaxed text-neutral-300" style={{ borderColor: AMARELO }}>
            “{dados.motto}”
          </p>
        )}
      </header>

      <div className="space-y-7 px-5 py-6 sm:px-7">
        {/* Ciclo */}
        {(dados.cycle.label || dados.cycle.percent > 0) && (
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-[13px] font-medium">{dados.cycle.label}</p>
              <p className="text-[11px] text-neutral-400">{dados.cycle.monthOf}</p>
            </div>
            <div
              className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10"
              role="progressbar"
              aria-valuenow={dados.cycle.percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={dados.cycle.label || "Progresso do ciclo"}
            >
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${dados.cycle.percent}%`, background: AMARELO }}
              />
            </div>
          </div>
        )}

        {/* Características principais */}
        <Secao titulo="Características Principais" icone={<TrendingUp className="h-3.5 w-3.5" />}>
          <div className="space-y-2.5">
            {dados.attributes.map((a) => (
              <div key={a.label}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[11px] uppercase tracking-wide text-neutral-300">{a.label}</span>
                  <span className="shrink-0 font-mono text-[11px] tabular-nums" style={{ color: AMARELO }}>
                    {a.value}/10
                  </span>
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${a.value * 10}%`, background: AMARELO }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Secao>

        {dados.strengths.length > 0 && (
          <Secao titulo="Pontos Fortes" icone={<Award className="h-3.5 w-3.5" />}>
            <div className="space-y-1.5">
              {dados.strengths.map((t) => (
                <Linha key={t} texto={t} />
              ))}
            </div>
          </Secao>
        )}

        {dados.achievements.length > 0 && (
          <Secao titulo="Conquistas do Mês" icone={<Check className="h-3.5 w-3.5" />}>
            <div className="space-y-1.5">
              {dados.achievements.map((t) => (
                <Linha key={t} texto={t} />
              ))}
            </div>
          </Secao>
        )}

        {/* Melhoria e estudos lado a lado, como no documento — e empilhados no
            celular, que é onde o embed antigo obrigava a rolar de lado. */}
        {(dados.improvements.length > 0 || dados.studies.length > 0) && (
          <div className="grid gap-5 sm:grid-cols-2">
            {dados.improvements.length > 0 && (
              <Secao titulo="Pontos de Melhoria" icone={<Target className="h-3.5 w-3.5" />}>
                <ul className="space-y-1.5">
                  {dados.improvements.map((t) => (
                    <li key={t} className="flex gap-2 text-[13px] leading-snug text-neutral-300">
                      <span style={{ color: AMARELO }}>→</span>
                      {t}
                    </li>
                  ))}
                </ul>
              </Secao>
            )}
            {dados.studies.length > 0 && (
              <Secao titulo="Estudos" icone={<GraduationCap className="h-3.5 w-3.5" />}>
                <ul className="space-y-1.5">
                  {dados.studies.map((t) => (
                    <li key={t} className="flex gap-2 text-[13px] leading-snug text-neutral-300">
                      <Square className="mt-1 h-2.5 w-2.5 shrink-0" style={{ color: AMARELO }} />
                      {t}
                    </li>
                  ))}
                </ul>
              </Secao>
            )}
          </div>
        )}

        {dados.goals.length > 0 && (
          <Secao titulo="Objetivos · Próximos 90 Dias">
            <div className="space-y-1.5">
              {dados.goals.map((t, i) => (
                <div
                  key={t}
                  className="flex items-start gap-3 rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2.5"
                >
                  <span className="font-mono text-[13px] font-bold tabular-nums" style={{ color: AMARELO }}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="text-[13px] leading-snug text-neutral-200">{t}</span>
                </div>
              ))}
            </div>
          </Secao>
        )}
      </div>

      {(dados.issued || dados.cardNumber) && (
        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 px-5 py-3 text-[10px] uppercase tracking-wider text-neutral-500 sm:px-7">
          <span>{dados.issued}</span>
          <span>{dados.cardNumber}</span>
        </footer>
      )}
    </article>
  );
}
