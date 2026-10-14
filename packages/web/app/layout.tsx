import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Providers } from "@/lib/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Loyola X",
    template: "%s | Loyola X",
  },
  description:
    "Central de Mentes — Plataforma de AI para gestao inteligente de equipes e tarefas",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  // No iOS o manifest não basta: é isto que faz o atalho da tela de início
  // abrir sem a barra do Safari.
  appleWebApp: { capable: true, title: "Loyola X", statusBarStyle: "black" },
  // O Next só emite a meta moderna (`mobile-web-app-capable`); o Safari antes
  // do iOS 15.4 só entende a legada.
  other: { "apple-mobile-web-app-capable": "yes" },
  openGraph: {
    title: "Loyola X",
    description:
      "Central de Mentes — Plataforma de AI para gestao inteligente de equipes e tarefas",
    type: "website",
  },
};

export const viewport: Viewport = {
  // O app é dark fixo — a barra de status do celular acompanha o fundo.
  themeColor: "#121212",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="pt-BR" className="dark">
        <body>
          <Providers>{children}</Providers>
        </body>
      </html>
    </ClerkProvider>
  );
}
