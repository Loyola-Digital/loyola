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
import {
  orientacaoDaFalha,
  JANELA_DE_CAMPANHAS_EM_DIAS,
} from "@/lib/utils/google-ads-erro";

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
  /**
   * Story 42.8 — o motivo da falha, quando houve. A rota sempre o devolveu;
   * sem ele aqui, um erro de autenticação era exibido como ausência de
   * campanha e mandava o gestor procurar no lugar errado.
   */
  error?: string | null;
}

export function GoogleAdsCampaignSelector({
  campaigns,
  accountLinked,
  value,
  onChange,
  disabled,
  error,
}: GoogleAdsCampaignSelectorProps) {
  const falha = orientacaoDaFalha(error);
  if (!accountLinked) {
    return (
      <p className="text-xs text-muted-foreground">
        Nenhuma conta Google Ads vinculada a este projeto. Conecte em{" "}
        <strong>Configurações → Google Ads</strong> e vincule ao projeto pra as campanhas
        aparecerem aqui.
      </p>
    );
  }

  // Story 42.8 (AC1/AC2) — falha primeiro. A ordem importa: uma busca que
  // falhou também devolve zero campanhas, e testar o vazio antes esconderia o
  // motivo.
  if (falha) {
    return (
      <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
        <p className="font-medium text-amber-700 dark:text-amber-500">{falha.titulo}</p>
        <p className="mt-1 text-muted-foreground">{falha.acao}</p>
        {falha.detalhe && (
          <p className="mt-1.5 break-words font-mono text-[10px] text-muted-foreground/70">
            {falha.detalhe}
          </p>
        )}
      </div>
    );
  }

  if (campaigns.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        A conta está vinculada e respondeu, mas não há campanha com entrega nos
        últimos {JANELA_DE_CAMPANHAS_EM_DIAS} dias. Campanha criada e ainda sem
        veiculação não aparece aqui.
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
