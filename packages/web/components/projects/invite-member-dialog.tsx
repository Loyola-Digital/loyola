"use client";

import { useState } from "react";
import { Check, Copy, UserPlus } from "lucide-react";
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
  conversations: true,
  mind: true,
};

const MODULE_LABELS: { key: keyof ProjectPermissions; label: string }[] = [
  { key: "instagram", label: "Instagram" },
  { key: "conversations", label: "Conversas" },
  { key: "mind", label: "Mind (IA)" },
];

export function InviteMemberDialog({ projectId, open, onOpenChange }: InviteMemberDialogProps) {
  const [email, setEmail] = useState("");
  const [permissions, setPermissions] = useState<ProjectPermissions>(DEFAULT_PERMISSIONS);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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

  async function handleCopy() {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Convidar pessoa
          </DialogTitle>
        </DialogHeader>

        {!inviteUrl ? (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              Copie o link abaixo e envie ao convidado. O link expira em 7 dias.
            </p>
            <div className="flex items-center gap-2 rounded-md border bg-muted px-3 py-2">
              <span className="flex-1 truncate text-xs font-mono">{inviteUrl}</span>
              <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={handleCopy}>
                {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <DialogFooter>
              <Button onClick={handleClose}>Fechar</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
