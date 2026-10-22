"use client";

// Story 18.94 — grupo Vídeo · Estático · Todos das duas seções de Testes de LPs
// (LaunchDashboard e Meta Ads Teste). Mesma regra e mesmo visual do filtro da
// tabela de Criativos (Story 18.87).

import {
  OPCOES_DE_FILTRO_DE_MIDIA,
  type TipoDeMidia,
} from "@/lib/utils/filtro-de-midia-do-criativo";

const TITULO: Record<TipoDeMidia, string> = {
  video: 'Anúncios com "adv" no nome',
  estatico: 'Anúncios com "ad" no nome, sem "adv"',
  todos: "Todos os anúncios",
};

export function FiltroDeMidiaBotoes({
  valor,
  onChange,
}: {
  valor: TipoDeMidia;
  onChange: (valor: TipoDeMidia) => void;
}) {
  return (
    <div
      className="flex items-center gap-1 rounded-md border border-border/40 p-0.5"
      role="group"
      aria-label="Filtrar por tipo de criativo"
    >
      {OPCOES_DE_FILTRO_DE_MIDIA.map((opt) => (
        <button
          key={opt.valor}
          type="button"
          onClick={() => onChange(opt.valor)}
          aria-pressed={valor === opt.valor}
          title={TITULO[opt.valor]}
          className={`px-2.5 h-6 rounded text-[11px] font-medium transition-colors ${
            valor === opt.valor
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted/50"
          }`}
        >
          {opt.rotulo}
        </button>
      ))}
    </div>
  );
}
