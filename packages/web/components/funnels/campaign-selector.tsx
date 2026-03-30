"use client";

import { useState, useMemo } from "react";
import { Check, ChevronsUpDown, Search, LinkIcon, X } from "lucide-react";
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
import type { FunnelCampaign } from "@loyola-x/shared";

interface CampaignSelectorProps {
  campaigns: MetaCampaignOption[];
  accountLinked: boolean;
  value: FunnelCampaign[];
  onChange: (campaigns: FunnelCampaign[]) => void;
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
  onChange,
  disabled,
}: CampaignSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selectedIds = new Set(value.map((c) => c.id));

  const filtered = useMemo(() => {
    if (!search) return campaigns;
    const q = search.toLowerCase();
    return campaigns.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.objective.toLowerCase().includes(q),
    );
  }, [campaigns, search]);

  function toggleCampaign(campaign: MetaCampaignOption) {
    if (selectedIds.has(campaign.id)) {
      onChange(value.filter((c) => c.id !== campaign.id));
    } else {
      onChange([...value, { id: campaign.id, name: campaign.name }]);
    }
  }

  function removeCampaign(id: string) {
    onChange(value.filter((c) => c.id !== id));
  }

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
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className="w-full justify-between font-normal"
          >
            {value.length > 0 ? (
              <span className="truncate">
                {value.length} campanha{value.length > 1 ? "s" : ""} selecionada{value.length > 1 ? "s" : ""}
              </span>
            ) : (
              <span className="text-muted-foreground">Selecionar campanhas...</span>
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
              filtered.map((campaign) => {
                const isSelected = selectedIds.has(campaign.id);
                return (
                  <button
                    key={campaign.id}
                    type="button"
                    className={cn(
                      "flex w-full items-start gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent",
                      isSelected && "bg-accent",
                    )}
                    onClick={() => toggleCampaign(campaign)}
                  >
                    <Check
                      className={cn(
                        "mt-0.5 size-4 shrink-0",
                        isSelected ? "opacity-100" : "opacity-0",
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
                );
              })
            )}
          </div>
        </PopoverContent>
      </Popover>

      {/* Selected campaigns chips */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((c) => (
            <Badge key={c.id} variant="secondary" className="gap-1 pr-1">
              <span className="truncate max-w-[150px]">{c.name}</span>
              <button
                type="button"
                onClick={() => removeCampaign(c.id)}
                className="ml-0.5 rounded-full p-0.5 hover:bg-muted"
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
