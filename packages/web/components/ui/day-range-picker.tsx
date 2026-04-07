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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const PRESETS = [
  { label: "Hoje", value: 1 },
  { label: "Ontem", value: 1, offset: 1 },
  { label: "Ultimos 3 dias", value: 3 },
  { label: "Ultimos 7 dias", value: 7 },
  { label: "Ultimos 14 dias", value: 14 },
  { label: "Ultimos 30 dias", value: 30 },
  { label: "Ultimos 90 dias", value: 90 },
];

interface DayRangePickerProps {
  days: number;
  onDaysChange: (days: number) => void;
  /** Optional: explicit start/end control */
  startDate?: Date;
  endDate?: Date;
  onRangeChange?: (start: Date, end: Date) => void;
  maxDays?: number;
}

export function DayRangePicker({
  days,
  onDaysChange,
  startDate,
  endDate,
  onRangeChange,
  maxDays = 365,
}: DayRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [isCustom, setIsCustom] = useState(false);
  const [range, setRange] = useState<DateRange | undefined>(undefined);

  const presetMatch = PRESETS.find((p) => p.value === days && !p.offset);
  const displayLabel = isCustom && startDate && endDate
    ? `${format(startDate, "dd/MM", { locale: ptBR })} - ${format(endDate, "dd/MM", { locale: ptBR })}`
    : presetMatch
      ? presetMatch.label
      : `${days} dias`;

  const rangeExceedsLimit = range?.from && range?.to
    ? differenceInDays(range.to, range.from) > maxDays
    : false;

  function handlePreset(value: string) {
    const d = Number(value);
    setIsCustom(false);
    onDaysChange(d);
  }

  function handleRangeConfirm() {
    if (!range?.from || !range?.to || rangeExceedsLimit) return;
    const diffDays = differenceInDays(range.to, range.from) + 1;
    setIsCustom(true);
    onDaysChange(diffDays);
    if (onRangeChange) onRangeChange(range.from, range.to);
    setOpen(false);
  }

  return (
    <div className="flex items-center gap-1.5">
      <Select
        value={isCustom ? "custom" : String(days)}
        onValueChange={(v) => {
          if (v === "custom") {
            setOpen(true);
          } else {
            handlePreset(v);
          }
        }}
      >
        <SelectTrigger className="w-[150px] h-8 text-xs">
          <SelectValue>{displayLabel}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {PRESETS.filter((p) => !p.offset).map((p) => (
            <SelectItem key={p.value} value={String(p.value)}>{p.label}</SelectItem>
          ))}
          <SelectItem value="custom">Personalizado...</SelectItem>
        </SelectContent>
      </Select>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={`gap-1.5 h-8 text-xs ${!isCustom && !open ? "hidden" : ""}`}
          >
            <CalendarIcon className="h-3.5 w-3.5" />
            {isCustom && startDate && endDate
              ? `${format(startDate, "dd/MM")} - ${format(endDate, "dd/MM")}`
              : "Selecionar datas"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <div className="flex">
            {/* Presets sidebar */}
            <div className="border-r p-3 space-y-1 min-w-[140px]">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">Atalhos</p>
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-accent transition-colors"
                  onClick={() => {
                    const end = new Date();
                    if (p.offset) end.setDate(end.getDate() - p.offset);
                    const start = subDays(end, p.value - 1);
                    setRange({ from: start, to: end });
                  }}
                >
                  {p.label}
                </button>
              ))}
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
                  <p className="text-xs text-muted-foreground">Selecione inicio e fim</p>
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
    </div>
  );
}
