"use client";

/**
 * O mapa de funil aberto por link público.
 *
 * Fora do grupo `(app)` de propósito: aquele layout tem a barra lateral, o
 * seletor de projeto e exige login — tudo que quem recebeu um link não tem nem
 * precisa. Aqui é só o desenho, na tela inteira.
 *
 * O canvas é o MESMO do editor, com `token`: ele entra em somente leitura e se
 * atualiza sozinho. Ver o cabeçalho de `FunnelMapCanvas`.
 */

import { use } from "react";
import { FunnelMapCanvas } from "@/components/funnels/funnel-map/funnel-map-canvas";
import { useMapaPorEndereco } from "@/lib/hooks/use-funnel-map";

export default function MapaCompartilhadoPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const { error } = useMapaPorEndereco({ tipo: "compartilhado", token });

  // Link revogado e token que nunca existiu dão o mesmo 404 na API — e a mesma
  // tela aqui. Distinguir diria a quem testa tokens que acertou um.
  if (error) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-2 bg-background p-6 text-center">
        <p className="text-base font-semibold">
          Este link não está mais disponível
        </p>
        <p className="max-w-sm text-[13px] text-muted-foreground">
          Ele pode ter sido revogado por quem compartilhou. Peça um link novo a
          essa pessoa.
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background p-3 sm:p-4">
      <FunnelMapCanvas token={token} altura="calc(100vh - 140px)" />
      <p className="mt-2 text-center text-[10px] text-muted-foreground">
        Loyola X
      </p>
    </main>
  );
}
