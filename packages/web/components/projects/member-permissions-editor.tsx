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
  { key: "conversations", label: "Conversas" },
  { key: "mind", label: "Mind" },
];

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
                  checked={member.permissions[key]}
                  disabled={updatePermissions.isPending}
                  onCheckedChange={(checked: boolean) =>
                    updatePermissions.mutate({
                      userId: member.userId,
                      permissions: { ...member.permissions, [key]: checked },
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
