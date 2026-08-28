"use client";

/**
 * O PDI mudou de casa: agora é uma aba da ficha, em /pessoal.
 *
 * Esta rota continua existindo porque links antigos existem — em conversa, em
 * favorito, na memória de quem digita a URL. Devolver 404 para quem digita
 * `/pdi` seria trocar "sei onde fica" por "sumiu".
 *
 * `replace` e não `push`: o voltar do navegador tem que sair da área, não
 * cair de novo no redirecionamento.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function PdiRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/pessoal?aba=pdi");
  }, [router]);

  return (
    <div className="flex items-center justify-center p-12 text-sm text-muted-foreground">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      Levando você para a sua ficha…
    </div>
  );
}
