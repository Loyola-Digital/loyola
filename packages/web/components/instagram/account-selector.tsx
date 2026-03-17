"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useInstagramAccounts } from "@/lib/hooks/use-instagram-accounts";

interface AccountSelectorProps {
  value: string | null;
  onChange: (id: string) => void;
  projectId?: string;
}

export function AccountSelector({ value, onChange, projectId }: AccountSelectorProps) {
  const { data: accounts, isLoading } = useInstagramAccounts(projectId);

  if (isLoading) return <Skeleton className="h-9 w-[200px]" />;

  if (!accounts || accounts.length === 0) return null;

  return (
    <Select value={value ?? ""} onValueChange={onChange}>
      <SelectTrigger className="w-[220px]">
        <SelectValue placeholder="Selecionar conta" />
      </SelectTrigger>
      <SelectContent>
        {accounts.map((account) => (
          <SelectItem key={account.id} value={account.id}>
            @{account.instagramUsername}
            {account.accountName !== account.instagramUsername &&
              ` — ${account.accountName}`}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
