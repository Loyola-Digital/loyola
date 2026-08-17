"use client";

/**
 * Porta de entrada do app: decide qual é a primeira tela.
 *
 * Quem tem PDI atribuído abre no PDI; quem não tem segue pro fluxo de sempre
 * (Minds). A decisão vive numa rota própria — e não espalhada em cada link de
 * "entrar" — pra ter um lugar só a mudar quando a regra mudar de novo.
 *
 * Usa o endpoint que só diz SE existe, sem trazer o HTML: é uma chamada de
 * decisão, não de conteúdo.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { usePdiExiste } from "@/lib/hooks/use-pdi";

export default function EntrarPage() {
  const router = useRouter();
  const { data, isLoading, isError } = usePdiExiste();

  useEffect(() => {
    if (isLoading) return;
    // Falha na checagem não pode prender ninguém na porta: cai no destino
    // antigo, que é o comportamento que todo mundo já conhece.
    if (isError) {
      router.replace("/minds");
      return;
    }
    router.replace(data?.exists ? "/pdi" : "/minds");
  }, [isLoading, isError, data?.exists, router]);

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-[320px] rounded-xl" />
    </div>
  );
}
