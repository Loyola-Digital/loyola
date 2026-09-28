// Story 18.87 — filtro Vídeo / Estático / Todos da tabela "Desempenho de
// Criativos", PELO NOME do anúncio (regra do gestor, 28/09/2026):
//
//   Vídeo    = o nome contém "adv"
//   Estático = o nome contém "ad" e NÃO contém "adv"
//   Todos    = todos os anúncios, inclusive os sem "ad" no nome
//
// Substring em qualquer posição, sem diferenciar maiúscula/minúscula — pedido
// explícito. Por isso "ADS -VENDAS- VID- 1" cai em Estático: contém "AD" e não
// contém "adv". Não é bug; não "corrigir" para o token `ad01`/`adv01`.
//
// Não usa o `objectType` da Meta (é o que o Top Criativos usa, `ehVideo` em
// top-criativos-visoes.ts): o gestor pediu pelo nome.

import type { TipoDeMidia } from "./top-criativos-visoes";

export type { TipoDeMidia };

export const FILTRO_DE_MIDIA_PADRAO: TipoDeMidia = "todos";

export const OPCOES_DE_FILTRO_DE_MIDIA: readonly {
  valor: TipoDeMidia;
  rotulo: string;
}[] = [
  { valor: "video", rotulo: "Vídeo" },
  { valor: "estatico", rotulo: "Estático" },
  { valor: "todos", rotulo: "Todos" },
];

export function passaNoFiltroDeMidia(
  adName: string | null | undefined,
  filtro: TipoDeMidia,
): boolean {
  if (filtro === "todos") return true;
  const nome = (adName ?? "").toLowerCase();
  const temAdv = nome.includes("adv");
  if (filtro === "video") return temAdv;
  return nome.includes("ad") && !temAdv;
}
