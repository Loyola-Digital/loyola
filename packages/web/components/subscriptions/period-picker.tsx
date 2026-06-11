"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Props {
  value: number;
  onChange: (months: number) => void;
}

const OPTIONS = [3, 6, 12, 24] as const;

export function PeriodPicker({ value, onChange }: Props) {
  return (
    <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
      <SelectTrigger className="h-9 w-[150px] text-sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {OPTIONS.map((m) => (
          <SelectItem key={m} value={String(m)} className="text-sm">
            {m} meses
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
