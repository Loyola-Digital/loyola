"use client";

import { use } from "react";
import { SwitchyTab } from "@/components/switchy";
import { useUserRole } from "@/lib/hooks/use-user-role";

interface Props {
  params: Promise<{ id: string }>;
}

export default function ProjectSwitchPage({ params }: Props) {
  const { id: projectId } = use(params);
  const role = useUserRole();

  // Switch (Switchy) é restrito a não-guests. Guest que chega via URL direto
  // (o item já fica oculto no nav) vê acesso negado em vez do módulo.
  if (role === "guest") {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-24 text-center">
        <p className="text-lg font-semibold">Acesso restrito</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          O módulo Switch não está disponível para o seu perfil. Fale com um
          administrador do projeto se precisar de acesso.
        </p>
      </div>
    );
  }

  return <SwitchyTab projectId={projectId} />;
}
