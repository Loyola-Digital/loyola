import type { MetadataRoute } from "next";

/**
 * Faz o Loyola X ser instalável no celular (Chrome/Android e "Adicionar à Tela
 * de Início" no iOS). Sem service worker: o app instalado abre em tela cheia,
 * com ícone próprio, mas continua precisando de rede — exatamente como hoje.
 *
 * `start_url` aponta para o painel, não para a landing: quem instalou já é
 * usuário, e o Clerk manda para o login se a sessão tiver caído.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Loyola X",
    short_name: "Loyola X",
    description:
      "Central de Mentes — Plataforma de AI para gestao inteligente de equipes e tarefas",
    start_url: "/entrar",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    lang: "pt-BR",
    // O app roda com `className="dark"` fixo, então os dois são o fundo escuro.
    background_color: "#121212",
    theme_color: "#121212",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // O Android recorta em círculo/squircle: este tem o glifo menor e o fundo
      // sangrando até a borda, senão o recorte come pedaço do símbolo.
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
