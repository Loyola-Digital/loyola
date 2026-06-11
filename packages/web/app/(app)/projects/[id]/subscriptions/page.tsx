"use client";

import { use } from "react";
import { CreditCard } from "lucide-react";
import { useUserRole } from "@/lib/hooks/use-user-role";
import { HotmartConnectionPanel } from "@/components/subscriptions/hotmart-connection-panel";

interface Props {
  params: Promise<{ id: string }>;
}

export default function ProjectSubscriptionsPage({ params }: Props) {
  const { id: projectId } = use(params);
  const role = useUserRole();
  // Permissão binária: guest = leitura; todos os outros = edição (conectar/desconectar).
  const isAdmin = role !== null && role !== "guest";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          Assinaturas
        </h1>
      </div>

      <HotmartConnectionPanel projectId={projectId} isAdmin={isAdmin} />
    </div>
  );
}
