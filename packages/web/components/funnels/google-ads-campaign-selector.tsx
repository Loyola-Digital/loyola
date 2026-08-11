"use client";

/**
 * Seletor de campanhas do Google Ads para vincular a uma etapa.
 *
 * Nasceu inline na página genérica de etapa; virou componente quando a etapa
 * Lyrio (app mobile) passou a precisar do mesmo seletor. Espelha a API do
 * `CampaignSelector` do Meta (campaigns / accountLinked / value / onChange) pra
 * quem lê o código de configuração de etapa não ter que aprender duas formas de
 * fazer a mesma coisa.
 */

import { cn } from "@/lib/utils";
import type { FunnelCampaign } from "@loyola-x/shared";

export interface GoogleAdsCampaignOption {
  id: string;
  name: string;
  status: string;
}

interface GoogleAdsCampaignSelectorProps {
  campaigns: GoogleAdsCampaignOption[];
  /** false = projeto sem conta Google Ads vinculada; o seletor vira instrução. */
  accountLinked: boolean;
  value: FunnelCampaign[];
  onChange: (campaigns: FunnelCampaign[]) => void;
  disabled?: boolean;
}

export function GoogleAdsCampaignSelector({
  campaigns,
  accountLinked,
  value,
  onChange,
  disabled,
}: GoogleAdsCampaignSelectorProps) {
  if (!accountLinked) {
    return (
      <p className="text-xs text-muted-foreground">
        Nenhuma conta Google Ads vinculada a este projeto. Conecte em{" "}
        <strong>Configurações → Google Ads</strong> e vincule ao projeto pra as campanhas
        aparecerem aqui.
      </p>
    );
  }

  if (campaigns.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        A conta está vinculada, mas não retornou campanhas no período.
      </p>
    );
  }

  const selecionadas = new Set(value.map((c) => c.id));

  function alternar(campanha: GoogleAdsCampaignOption) {
    if (disabled) return;
    const jaEstava = selecionadas.has(campanha.id);
    onChange(
      jaEstava
        ? value.filter((c) => c.id !== campanha.id)
        : [...value, { id: campanha.id, name: campanha.name }],
    );
  }

  return (
    <div className="space-y-1 max-h-48 overflow-y-auto">
      {campaigns.map((c) => {
        const marcada = selecionadas.has(c.id);
        return (
          <button
            key={c.id}
            type="button"
            disabled={disabled}
            onClick={() => alternar(c)}
            className={cn(
              "flex w-full items-center gap-2 rounded-md p-2 text-left text-sm transition-colors",
              marcada ? "bg-primary/10" : "hover:bg-muted",
              disabled && "cursor-not-allowed opacity-60",
            )}
          >
            <span
              className={cn(
                "flex h-3 w-3 shrink-0 items-center justify-center rounded-sm border",
                marcada ? "border-primary bg-primary" : "border-muted-foreground",
              )}
            >
              {marcada && (
                <span className="text-[8px] font-bold text-primary-foreground">✓</span>
              )}
            </span>
            <span className="truncate">{c.name}</span>
          </button>
        );
      })}
    </div>
  );
}
