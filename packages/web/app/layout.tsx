import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Providers } from "@/lib/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Loyola Digital X",
    template: "%s | Loyola Digital X",
  },
  description:
    "Central de Mentes — Plataforma de AI para gestao inteligente de equipes e tarefas",
  icons: { icon: "/icon.svg" },
  openGraph: {
    title: "Loyola Digital X",
    description:
      "Central de Mentes — Plataforma de AI para gestao inteligente de equipes e tarefas",
    type: "website",
  },
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
