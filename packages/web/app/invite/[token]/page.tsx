"use client";

import { use, useState } from "react";
import { CheckCircle, Instagram, MessageSquare, Brain, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useApiClient } from "@/lib/hooks/use-api-client";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";

interface InviteInfo {
  projectName: string;
  invitedByName: string;
  email: string;
  permissions: {
    instagram: boolean;
    conversations: boolean;
    mind: boolean;
  };
  expiresAt: string;
}

interface AcceptResult {
  projectId: string;
  userId: string;
  permissions: InviteInfo["permissions"];
}

const MODULE_ICONS = {
  instagram: Instagram,
  conversations: MessageSquare,
  mind: Brain,
} as const;

const MODULE_LABELS = {
  instagram: "Instagram",
  conversations: "Conversas",
  mind: "Mind (IA)",
} as const;

interface Props {
  params: Promise<{ token: string }>;
}

export default function InvitePage({ params }: Props) {
  const { token } = use(params);
  const apiClient = useApiClient();
  const { isSignedIn, isLoaded } = useAuth();
  const [accepted, setAccepted] = useState(false);

  const { data: invite, isLoading, error } = useQuery<InviteInfo>({
    queryKey: ["invite", token],
    queryFn: async () => {
      let res: Response;
      try {
        res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/invitations/${token}`);
      } catch {
        throw new Error("connection_error");
      }
      if (res.status === 409) throw new Error("already_accepted");
      if (!res.ok) throw new Error("not_found");
      return res.json();
    },
    retry: false,
  });

  const acceptMutation = useMutation({
    mutationFn: () => apiClient<AcceptResult>(`/api/invitations/${token}/accept`, { method: "POST" }),
    onSuccess: () => {
      setAccepted(true);
    },
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    const errMsg = (error as Error).message;
    const message =
      errMsg === "already_accepted"
        ? "Este convite já foi aceito anteriormente."
        : errMsg === "not_found"
          ? "Este convite expirou ou é inválido. Peça um novo ao seu gestor."
          : "Erro ao carregar convite. Verifique sua conexão e tente novamente.";

    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-md rounded-xl border bg-card p-8 flex flex-col items-center gap-4 text-center">
          <XCircle className="h-12 w-12 text-destructive" />
          <h1 className="text-xl font-bold">Convite inválido</h1>
          <p className="text-sm text-muted-foreground">{message}</p>
        </div>
      </div>
    );
  }

  if (accepted) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-md rounded-xl border bg-card p-8 flex flex-col items-center gap-4 text-center">
          <CheckCircle className="h-12 w-12 text-green-500" />
          <h1 className="text-xl font-bold">Convite aceito!</h1>
          <p className="text-sm text-muted-foreground">
            Faça login com o e-mail <strong>{invite?.email}</strong> para acessar o projeto.
          </p>
          <Button asChild className="mt-2">
            <Link href="/sign-in">Entrar na plataforma</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (!invite) return null;

  const enabledModules = (Object.keys(MODULE_LABELS) as Array<keyof typeof MODULE_LABELS>).filter(
    (key) => invite.permissions[key],
  );

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border bg-card p-8 flex flex-col gap-6">
        <div className="text-center flex flex-col gap-1">
          <h1 className="text-2xl font-bold">Você foi convidado</h1>
          <p className="text-sm text-muted-foreground">
            <strong>{invite.invitedByName}</strong> convidou você para acessar o projeto{" "}
            <strong>{invite.projectName}</strong>.
          </p>
        </div>

        <div className="rounded-md bg-muted px-4 py-3 text-sm">
          <span className="text-muted-foreground">E-mail: </span>
          <strong>{invite.email}</strong>
        </div>

        {enabledModules.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">Módulos liberados:</p>
            <div className="flex flex-col gap-1.5">
              {enabledModules.map((key) => {
                const Icon = MODULE_ICONS[key];
                return (
                  <div key={key} className="flex items-center gap-2 text-sm">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <span>{MODULE_LABELS[key]}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {acceptMutation.error && (
          <p className="text-sm text-destructive text-center">
            Erro ao aceitar convite. Tente novamente.
          </p>
        )}

        {isLoaded && !isSignedIn ? (
          <Button asChild className="w-full">
            <Link href={`/sign-up?redirect_url=/invite/${token}`}>
              Criar conta para aceitar
            </Link>
          </Button>
        ) : (
          <Button
            onClick={() => acceptMutation.mutate()}
            disabled={acceptMutation.isPending || !isLoaded}
            className="w-full"
          >
            {acceptMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Aceitando...
              </>
            ) : (
              "Aceitar convite"
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
