"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useProjectMembers,
  useRemoveMember,
  useUpdateMemberPermissions,
} from "@/lib/hooks/use-projects";
import type { ProjectPermissions } from "@/lib/hooks/use-projects";

interface MemberPermissionsEditorProps {
  projectId: string;
}

const MODULE_LABELS: { key: keyof ProjectPermissions; label: string }[] = [
  { key: "instagram", label: "Instagram" },
  { key: "traffic", label: "Meta Ads" },
  { key: "youtubeAds", label: "YouTube Ads" },
  { key: "youtubeOrganic", label: "YouTube Canal" },
  { key: "conversations", label: "Conversas" },
  { key: "mind", label: "Mind" },
];

// Garante que todos os 6 campos existem no object enviado ao backend, mesmo
// se o member.permissions veio de uma linha legacy (pré-expansão do schema)
// com apenas 3 chaves. O Zod do backend exige todos os campos obrigatórios.
function normalizePermissions(p: Partial<ProjectPermissions>): ProjectPermissions {
  return {
    instagram: p.instagram ?? false,
    traffic: p.traffic ?? false,
    youtubeAds: p.youtubeAds ?? false,
    youtubeOrganic: p.youtubeOrganic ?? false,
    conversations: p.conversations ?? false,
    mind: p.mind ?? false,
  };
}

export function MemberPermissionsEditor({ projectId }: MemberPermissionsEditorProps) {
  const { data: members, isLoading } = useProjectMembers(projectId);
  const removeMember = useRemoveMember(projectId);
  const updatePermissions = useUpdateMemberPermissions(projectId);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  if (!members || members.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhum membro convidado ainda.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {members.map((member) => (
        <div key={member.id} className="rounded-md border p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{member.userEmail}</p>
              {member.userName !== member.userEmail && (
                <p className="text-xs text-muted-foreground">{member.userName}</p>
              )}
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-destructive hover:text-destructive"
              disabled={removeMember.isPending}
              onClick={() => removeMember.mutate(member.userId)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex gap-4">
            {MODULE_LABELS.map(({ key, label }) => (
              <div key={key} className="flex items-center gap-1.5">
                <Switch
                  id={`${member.id}-${key}`}
                  checked={member.permissions[key] ?? false}
                  disabled={updatePermissions.isPending}
                  onCheckedChange={(checked: boolean) =>
                    updatePermissions.mutate({
                      userId: member.userId,
                      permissions: normalizePermissions({ ...member.permissions, [key]: checked }),
                    })
                  }
                />
                <label
                  htmlFor={`${member.id}-${key}`}
                  className="text-xs text-muted-foreground cursor-pointer"
                >
                  {label}
                </label>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
