"use client";

/**
 * Spy de Conteúdo — relatório de um perfil, em página própria.
 *
 * Abre em aba nova a partir da lista: o relatório é longo (métricas, gráficos,
 * diagnóstico, insights por publicação) e num painel lateral tudo virava coluna
 * estreita com scroll aninhado. Em aba própria a pessoa também consegue comparar
 * dois perfis lado a lado, que é o uso real da ferramenta.
 */

import { use } from "react";
import Link from "next/link";
import { AlertCircle, ArrowLeft } from "lucide-react";
import { useUserRole } from "@/lib/hooks/use-user-role";
import { ScanReport } from "@/components/spy-conteudo/scan-report";

export default function SpyScanPage({ params }: { params: Promise<{ scanId: string }> }) {
  const { scanId } = use(params);
  const role = useUserRole();

  if (role === "guest") {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-dashed border-border/40 p-12 text-center">
          <AlertCircle className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Spy de Conteúdo é restrito à equipe interna.
          </p>
        </div>
      </div>
    );
  }

  return (
    // Largura maior que a do app: o relatório é dado denso e respira melhor num
    // grid de 2 colunas do que espremido.
    <div className="mx-auto max-w-[1400px] p-6 space-y-4">
      <Link
        href="/spy-conteudo"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Todos os perfis
      </Link>

      <ScanReport scanId={scanId} />
    </div>
  );
}
