"use client";

import { useState } from "react";
import { CalendarIcon } from "lucide-react";
import { format, subDays, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const PRESETS = [
  { label: "Hoje", days: 1 },
  { label: "3 dias", days: 3 },
  { label: "7 dias", days: 7 },
  { label: "14 dias", days: 14 },
  { label: "30 dias", days: 30 },
  { label: "90 dias", days: 90 },
];

interface DayRangePickerProps {
  days: number;
  onDaysChange: (days: number) => void;
  maxDays?: number;
}

export function DayRangePicker({
  days,
  onDaysChange,
  maxDays = 365,
}: DayRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<DateRange | undefined>(undefined);
  const [customRange, setCustomRange] = useState<{ from: Date; to: Date } | null>(null);

  const presetMatch = PRESETS.find((p) => p.days === days);
  const displayLabel = customRange
    ? `${format(customRange.from, "dd/MM")} - ${format(customRange.to, "dd/MM")}`
    : presetMatch
      ? presetMatch.label
      : `${days} dias`;

  const rangeExceedsLimit = range?.from && range?.to
    ? differenceInDays(range.to, range.from) > maxDays
    : false;

  function handlePreset(preset: typeof PRESETS[number]) {
    setCustomRange(null);
    onDaysChange(preset.days);
    setOpen(false);
  }

  function handleRangeConfirm() {
    if (!range?.from || !range?.to || rangeExceedsLimit) return;
    const diffDays = differenceInDays(range.to, range.from) + 1;
    setCustomRange({ from: range.from, to: range.to });
    onDaysChange(diffDays);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs">
          <CalendarIcon className="h-3.5 w-3.5" />
          {displayLabel}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end" sideOffset={4}>
        <div className="flex">
          {/* Presets sidebar */}
          <div className="border-r p-3 space-y-0.5 min-w-[120px]">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">Periodo</p>
            {PRESETS.map((p) => (
              <button
                key={p.label}
                className={`w-full text-left text-xs px-2.5 py-1.5 rounded transition-colors ${
                  !customRange && days === p.days
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-accent"
                }`}
                onClick={() => handlePreset(p)}
              >
                {p.label}
              </button>
            ))}
            <div className="border-t my-2" />
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">Personalizado</p>
            <p className="text-[10px] text-muted-foreground">Selecione inicio e fim no calendario</p>
          </div>
          {/* Calendar */}
          <div>
            <Calendar
              mode="range"
              selected={range}
              onSelect={setRange}
              locale={ptBR}
              numberOfMonths={2}
              disabled={{ after: new Date() }}
            />
            <div className="flex items-center justify-between gap-2 p-3 border-t">
              {rangeExceedsLimit ? (
                <p className="text-xs text-destructive">Maximo {maxDays} dias</p>
              ) : range?.from && range?.to ? (
                <p className="text-xs text-muted-foreground">
                  {format(range.from, "dd MMM yyyy", { locale: ptBR })} — {format(range.to, "dd MMM yyyy", { locale: ptBR })}
                  <span className="ml-1 text-foreground font-medium">({differenceInDays(range.to, range.from) + 1} dias)</span>
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">Selecione as datas</p>
              )}
              <Button
                size="sm"
                disabled={!range?.from || !range?.to || rangeExceedsLimit}
                onClick={handleRangeConfirm}
              >
                Aplicar
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
