"use client";

/**
 * Story 47.10 — Valores fixos do nome de anúncio: tipo de criativo (ad · adv ·
 * carr) e sigla de lançamento (pg · l · m · pr). Mesmo CRUD do Dicionário ›
 * Valores fixos (`SecaoDeValores`), filtrado nos dois tipos novos — a aba do
 * Dicionário segue com os quatro do nome de campanha.
 */

import { SecaoDeValores } from "../abas";

export function AbaValoresDeAds({ podeEditar }: { podeEditar: boolean }) {
  return (
    <div className="space-y-8">
      <p className="text-sm text-muted-foreground">
        Anúncio de <strong>perpétuo</strong> não tem sigla na lista do pedido (pg · l · m · pr). Quando o dono definir, entra aqui como valor novo — não é invenção do sistema.
      </p>
      <SecaoDeValores tipo="creative_type" podeEditar={podeEditar} />
      <SecaoDeValores tipo="launch_type" podeEditar={podeEditar} />
    </div>
  );
}
