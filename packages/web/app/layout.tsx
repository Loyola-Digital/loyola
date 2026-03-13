import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Loyola Digital X",
  description: "Central de Mentes — Loyola Digital",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
