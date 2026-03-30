"use client";

import { useState, useMemo } from "react";
import { Check, ChevronsUpDown, Search, LinkIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { MetaCampaignOption } from "@/lib/hooks/use-funnels";

interface CampaignSelectorProps {
  campaigns: MetaCampaignOption[];
  accountLinked: boolean;
  value: string | null;
  onSelect: (campaignId: string | null, campaignName: string | null) => void;
  disabled?: boolean;
}

const statusColors: Record<string, string> = {
  ACTIVE: "bg-green-500/15 text-green-700 dark:text-green-400",
  PAUSED: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400",
  ARCHIVED: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400",
};

export function CampaignSelector({
  campaigns,
  accountLinked,
  value,
  onSelect,
  disabled,
}: CampaignSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search) return campaigns;
    const q = search.toLowerCase();
    return campaigns.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.objective.toLowerCase().includes(q),
    );
  }, [campaigns, search]);

  const selected = campaigns.find((c) => c.id === value);

  if (!accountLinked) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-dashed border-muted-foreground/30 px-3 py-2 text-sm text-muted-foreground">
        <LinkIcon className="size-4" />
        <span>
          Conecte uma conta Meta Ads em{" "}
          <a href="/settings/traffic" className="text-primary underline">
            Configurações
          </a>
        </span>
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          {selected ? (
            <span className="truncate">{selected.name}</span>
          ) : (
            <span className="text-muted-foreground">Selecionar campanha...</span>
          )}
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <div className="flex items-center border-b px-3">
          <Search className="mr-2 size-4 shrink-0 opacity-50" />
          <Input
            placeholder="Buscar campanha..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 border-0 shadow-none focus-visible:ring-0"
          />
        </div>
        <div className="max-h-[300px] overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              Nenhuma campanha encontrada
            </div>
          ) : (
            filtered.map((campaign) => (
              <button
                key={campaign.id}
                type="button"
                className={cn(
                  "flex w-full items-start gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent",
                  value === campaign.id && "bg-accent",
                )}
                onClick={() => {
                  onSelect(
                    value === campaign.id ? null : campaign.id,
                    value === campaign.id ? null : campaign.name,
                  );
                  setOpen(false);
                  setSearch("");
                }}
              >
                <Check
                  className={cn(
                    "mt-0.5 size-4 shrink-0",
                    value === campaign.id ? "opacity-100" : "opacity-0",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{campaign.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {campaign.objective.replace(/_/g, " ")}
                  </div>
                </div>
                <Badge
                  variant="secondary"
                  className={cn(
                    "ml-auto shrink-0 text-[10px]",
                    statusColors[campaign.status] ?? statusColors.ARCHIVED,
                  )}
                >
                  {campaign.status}
                </Badge>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
