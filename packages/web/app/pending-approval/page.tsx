"use client";

import { useClerk } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Clock } from "lucide-react";

export default function PendingApprovalPage() {
  const { signOut } = useClerk();

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="flex flex-col items-center gap-6 max-w-sm text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
          <Clock className="h-8 w-8 text-muted-foreground" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Acesso pendente</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Seu cadastro está aguardando aprovação de um administrador.
            Você receberá acesso assim que for aprovado.
          </p>
        </div>
        <Button variant="outline" onClick={() => signOut({ redirectUrl: "/sign-in" })}>
          Sair
        </Button>
      </div>
    </div>
  );
}
