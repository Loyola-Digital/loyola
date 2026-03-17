"use client";

import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format, subDays, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { DateRange } from "react-day-picker";

export type PeriodValue = "7d" | "14d" | "30d" | "90d" | "custom";

export interface PeriodConfig {
  period: PeriodValue;
  since: number; // unix timestamp
  until: number; // unix timestamp
}

interface PeriodSelectorProps {
  value: PeriodConfig;
  onChange: (config: PeriodConfig) => void;
}

function periodToConfig(period: Exclude<PeriodValue, "custom">): PeriodConfig {
  const days = { "7d": 7, "14d": 14, "30d": 30, "90d": 90 }[period];
  const until = Math.floor(Date.now() / 1000);
  const since = Math.floor(subDays(new Date(), days).getTime() / 1000);
  return { period, since, until };
}

export function PeriodSelector({ value, onChange }: PeriodSelectorProps) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [range, setRange] = useState<DateRange | undefined>(undefined);

  function handleSelect(p: string) {
    if (p !== "custom") {
      onChange(periodToConfig(p as Exclude<PeriodValue, "custom">));
    } else {
      // Set state to custom immediately so the popover trigger renders
      const until = Math.floor(Date.now() / 1000);
      const since = Math.floor(subDays(new Date(), 30).getTime() / 1000);
      onChange({ period: "custom", since, until });
      setCalendarOpen(true);
    }
  }

  const MAX_DAYS = 93;

  const rangeExceedsLimit =
    range?.from && range?.to
      ? differenceInDays(range.to, range.from) > MAX_DAYS
      : false;

  function handleRangeConfirm() {
    if (range?.from && range?.to && !rangeExceedsLimit) {
      onChange({
        period: "custom",
        since: Math.floor(range.from.getTime() / 1000),
        until: Math.floor(range.to.getTime() / 1000),
      });
      setCalendarOpen(false);
    }
  }

  const displayLabel =
    value.period === "custom"
      ? `${format(new Date(value.since * 1000), "dd/MM")} – ${format(new Date(value.until * 1000), "dd/MM")}`
      : value.period;

  return (
    <div className="flex items-center gap-2">
      <Select value={value.period} onValueChange={handleSelect}>
        <SelectTrigger className="w-[110px]">
          <SelectValue>{displayLabel}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="7d">7 dias</SelectItem>
          <SelectItem value="14d">14 dias</SelectItem>
          <SelectItem value="30d">30 dias</SelectItem>
          <SelectItem value="90d">90 dias</SelectItem>
          <SelectItem value="custom">Personalizado</SelectItem>
        </SelectContent>
      </Select>

      {value.period === "custom" && (
        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1">
              <CalendarIcon className="h-3.5 w-3.5" />
              Intervalo
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="range"
              selected={range}
              onSelect={setRange}
              locale={ptBR}
              numberOfMonths={2}
              disabled={{ after: new Date() }}
            />
            <div className="flex items-center justify-between gap-2 p-2 border-t">
              {rangeExceedsLimit ? (
                <p className="text-xs text-destructive">Máximo 93 dias</p>
              ) : (
                <span />
              )}
              <Button
                size="sm"
                disabled={!range?.from || !range?.to || rangeExceedsLimit}
                onClick={handleRangeConfirm}
              >
                Aplicar
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

export { periodToConfig };
