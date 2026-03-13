"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMinds } from "@/lib/hooks/use-minds";

interface MindFilterProps {
  value?: string;
  onChange: (mindId?: string) => void;
}

export function MindFilter({ value, onChange }: MindFilterProps) {
  const { squads } = useMinds();

  const minds = squads?.flatMap((s) => s.minds) ?? [];

  return (
    <Select
      value={value ?? "all"}
      onValueChange={(v) => onChange(v === "all" ? undefined : v)}
    >
      <SelectTrigger className="w-[200px]">
        <SelectValue placeholder="Todas as minds" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Todas as minds</SelectItem>
        {minds.map((mind) => (
          <SelectItem key={mind.id} value={mind.id}>
            {mind.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
