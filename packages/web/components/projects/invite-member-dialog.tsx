"use client";

import { useRef, useState } from "react";
import { Check, Copy, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useInviteMember } from "@/lib/hooks/use-projects";
import type { ProjectPermissions } from "@/lib/hooks/use-projects";

interface InviteMemberDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DEFAULT_PERMISSIONS: ProjectPermissions = {
  instagram: true,
  traffic: true,
  youtubeAds: true,
  youtubeOrganic: true,
  conversations: true,
  mind: true,
};

const MODULE_LABELS: { key: keyof ProjectPermissions; label: string }[] = [
  { key: "instagram", label: "Instagram" },
  { key: "traffic", label: "Meta Ads" },
  { key: "youtubeAds", label: "YouTube Ads" },
  { key: "youtubeOrganic", label: "YouTube Canal" },
  { key: "conversations", label: "Conversas" },
  { key: "mind", label: "Mind (IA)" },
];

export function InviteMemberDialog({ projectId, open, onOpenChange }: InviteMemberDialogProps) {
  const [email, setEmail] = useState("");
  const [permissions, setPermissions] = useState<ProjectPermissions>(DEFAULT_PERMISSIONS);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const urlInputRef = useRef<HTMLInputElement>(null);

  const inviteMember = useInviteMember(projectId);

  function togglePermission(key: keyof ProjectPermissions) {
    setPermissions((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    const result = await inviteMember.mutateAsync({ email: email.trim(), permissions });
    setInviteUrl(result.inviteUrl);
  }

  /**
   * `navigator.clipboard` só existe em contexto seguro (https/localhost) e nem
   * todo navegador mobile expõe. Sem o fallback de seleção + execCommand, o
   * botão silenciosamente não fazia nada justamente no celular, que é onde o
   * link costuma ser enviado.
   */
  async function handleCopy() {
    if (!inviteUrl) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(inviteUrl);
      } else {
        const campo = urlInputRef.current;
        if (!campo) throw new Error("sem campo");
        campo.select();
        campo.setSelectionRange(0, inviteUrl.length);
        if (!document.execCommand("copy")) throw new Error("execCommand falhou");
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Seleciona o texto pra pessoa copiar na mão em vez de deixar o botão mudo.
      urlInputRef.current?.select();
      toast.error("Não consegui copiar — o link está selecionado, use Ctrl+C / toque em copiar.");
    }
  }

  function handleClose() {
    setEmail("");
    setPermissions(DEFAULT_PERMISSIONS);
    setInviteUrl(null);
    setCopied(false);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      {/* max-h + scroll: com 6 módulos + header + rodapé o conteúdo passa da
          altura de tela em celular, e o dialog é centralizado — sem isso o
          rodapé (com o botão de gerar) some fora da viewport. */}
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Convidar pessoa
          </DialogTitle>
        </DialogHeader>

        {!inviteUrl ? (
          <form onSubmit={handleSubmit} className="flex min-w-0 flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="invite-email">E-mail do convidado</Label>
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="cliente@empresa.com"
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label>Módulos liberados</Label>
              {MODULE_LABELS.map(({ key, label }) => (
                <div key={key} className="flex items-center justify-between rounded-md border px-3 py-2">
                  <span className="text-sm">{label}</span>
                  <Switch
                    checked={permissions[key]}
                    onCheckedChange={() => togglePermission(key)}
                  />
                </div>
              ))}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose}>
                Cancelar
              </Button>
              <Button type="submit" disabled={inviteMember.isPending}>
                {inviteMember.isPending ? "Gerando..." : "Gerar convite"}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          // `min-w-0` é o que segura a URL dentro do dialog: o DialogContent é
          // um grid, e item de grid tem `min-width: auto` — sem zerar isso, a
          // string longa sem espaços empurra a coluna e vaza pra fora da caixa,
          // por mais `truncate` que tenha lá dentro.
          <div className="flex min-w-0 flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              Copie o link abaixo e envie ao convidado. O link expira em 7 dias.
            </p>

            {/* Input readOnly em vez de <span>: dá seleção com um toque no
                celular (e serve de alvo pro fallback de cópia), e o campo nunca
                cresce além do container. */}
            <Input
              ref={urlInputRef}
              readOnly
              value={inviteUrl}
              onFocus={(e) => e.currentTarget.select()}
              onClick={(e) => e.currentTarget.select()}
              className="w-full min-w-0 font-mono text-xs"
              aria-label="Link do convite"
            />

            <Button onClick={handleCopy} className="w-full gap-2" variant={copied ? "outline" : "default"}>
              {copied ? (
                <>
                  <Check className="h-4 w-4 text-green-500" />
                  Link copiado
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  Copiar link
                </>
              )}
            </Button>

            <DialogFooter>
              <Button variant="ghost" onClick={handleClose}>
                Fechar
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
