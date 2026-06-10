"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Save, Settings2, RefreshCw, Check, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import {
  useSwitchySettings,
  useSetSwitchySettings,
  useSwitchyAccountPixels,
  type SwitchyPixel,
  type SwitchyAccountPixel,
  type SwitchySettings,
} from "@/lib/hooks/use-switchy";

interface Props {
  projectId: string;
  canEdit: boolean;
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Normaliza a plataforma crua do Switchy (GraphQL) para o enum aceito pelos
 * settings (`facebook` | `gtm`). A API de settings só aceita esses dois; demais
 * plataformas (ex: tiktok) são descartadas com aviso.
 */
function normalizePlatform(raw: string): SwitchyPixel["platform"] | null {
  const p = raw.toLowerCase();
  if (p === "facebook" || p === "meta") return "facebook";
  if (p === "gtm" || p === "googletagmanager" || p === "google-tag-manager") return "gtm";
  return null;
}

/** Label amigável da plataforma pro chip/lista. */
function platformLabel(raw: string): string {
  const p = raw.toLowerCase();
  if (p === "facebook" || p === "meta") return "Meta";
  if (p === "gtm") return "GTM";
  return raw;
}

export function SwitchyConfigPanel({ projectId, canEdit }: Props) {
  const settings = useSwitchySettings(projectId);
  const setSettings = useSetSwitchySettings(projectId);
  const accountPixels = useSwitchyAccountPixels(projectId);

  // Seleção de pixels por `value` (o ID/container que vai pro Switchy). Semeado
  // a partir dos settings salvos uma única vez.
  const [selectedValues, setSelectedValues] = useState<Set<string>>(new Set());
  const [showGdpr, setShowGdpr] = useState(false);
  const [defaultTerm, setDefaultTerm] = useState("");
  const [defaultContent, setDefaultContent] = useState("");
  const [seeded, setSeeded] = useState(false);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    if (seeded || !settings.data) return;
    setSelectedValues(new Set(settings.data.pixels.map((p) => p.value)));
    setShowGdpr(settings.data.showGdpr);
    setDefaultTerm(settings.data.defaultUtmTerm ?? "");
    setDefaultContent(settings.data.defaultUtmContent ?? "");
    setSeeded(true);
  }, [settings.data, seeded]);

  const pixels = useMemo(() => accountPixels.data ?? [], [accountPixels.data]);

  // Pixels já salvos que não voltam na conta (ex: removidos no Switchy). Mantém
  // a seleção visível pra não sumir silenciosamente do que está salvo.
  const orphanSelected = useMemo<SwitchyPixel[]>(() => {
    if (!settings.data) return [];
    const accountValues = new Set(pixels.map((p) => p.value));
    return settings.data.pixels.filter(
      (p) => selectedValues.has(p.value) && !accountValues.has(p.value),
    );
  }, [settings.data, pixels, selectedValues]);

  const filteredPixels = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return pixels;
    return pixels.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.platform.toLowerCase().includes(q) ||
        p.value.toLowerCase().includes(q),
    );
  }, [pixels, filter]);

  function toggle(value: string) {
    if (!canEdit) return;
    setSelectedValues((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  function handleSave() {
    if (!canEdit) return;

    // Monta o array de pixels no shape dos settings a partir da seleção. Para os
    // pixels que vieram da conta, usa platform/value/title da conta; para órfãos
    // (não mais na conta mas ainda salvos), preserva o que estava salvo.
    const byValue = new Map<string, SwitchyAccountPixel>(
      pixels.map((p) => [p.value, p]),
    );
    const out: SwitchyPixel[] = [];
    const skipped: string[] = [];

    for (const value of selectedValues) {
      const account = byValue.get(value);
      if (account) {
        const platform = normalizePlatform(account.platform);
        if (!platform) {
          skipped.push(account.title || account.value);
          continue;
        }
        out.push({
          platform,
          value: account.value,
          title: account.title,
          id: account.id,
          workspaceId: account.workspaceId ?? null,
        });
        continue;
      }
      const orphan = orphanSelected.find((p) => p.value === value);
      if (orphan) out.push(orphan);
    }

    const payload: SwitchySettings = {
      pixels: out,
      showGdpr,
      defaultUtmTerm: defaultTerm.trim() ? defaultTerm.trim() : null,
      defaultUtmContent: defaultContent.trim() ? defaultContent.trim() : null,
    };

    setSettings.mutate(payload, {
      onSuccess: () => {
        if (skipped.length > 0) {
          toast.warning(
            `Salvo. ${skipped.length} pixel(s) ignorado(s) (plataforma não suportada): ${skipped.join(", ")}`,
          );
        } else {
          toast.success("Configurações salvas!");
        }
      },
      onError: (e) => toast.error(errMsg(e)),
    });
  }

  const selectedCount = selectedValues.size;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Settings2 className="h-4 w-4 text-primary" />
          Configuração de pixels e defaults
        </CardTitle>
      </CardHeader>
      <CardContent>
        {settings.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-9" />
            <Skeleton className="h-9" />
            <Skeleton className="h-9 w-40" />
          </div>
        ) : settings.isError ? (
          <div className="flex items-center gap-2 text-xs text-red-500">
            <span>Erro ao carregar configurações: {errMsg(settings.error)}</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[10px] gap-1"
              onClick={() => settings.refetch()}
            >
              <RefreshCw className="h-3 w-3" /> Tentar de novo
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Seletor de pixels da conta Switchy */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs">
                  Pixels da conta Switchy
                  {selectedCount > 0 && (
                    <span className="ml-1.5 text-[10px] text-muted-foreground">
                      ({selectedCount} selecionado{selectedCount > 1 ? "s" : ""})
                    </span>
                  )}
                </Label>
                {accountPixels.isFetching && (
                  <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                )}
              </div>

              {accountPixels.isLoading ? (
                <div className="space-y-2">
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} className="h-10" />
                  ))}
                </div>
              ) : accountPixels.isError ? (
                <div className="flex items-center gap-2 text-xs text-red-500">
                  <span>
                    Erro ao carregar pixels: {errMsg(accountPixels.error)}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[10px] gap-1"
                    onClick={() => accountPixels.refetch()}
                  >
                    <RefreshCw className="h-3 w-3" /> Tentar de novo
                  </Button>
                </div>
              ) : pixels.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Nenhum pixel cadastrado na conta do Switchy.
                </p>
              ) : (
                <>
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Filtrar por nome, plataforma ou ID..."
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                      className="h-8 pl-7 text-xs"
                    />
                  </div>
                  <ScrollArea className="h-52 rounded-md border">
                    <div className="space-y-1 p-1.5">
                      {filteredPixels.length === 0 ? (
                        <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                          Nenhum pixel encontrado.
                        </p>
                      ) : (
                        filteredPixels.map((p) => {
                          const isChecked = selectedValues.has(p.value);
                          const supported = normalizePlatform(p.platform) !== null;
                          return (
                            <button
                              key={p.id}
                              type="button"
                              disabled={!canEdit}
                              onClick={() => toggle(p.value)}
                              className={`flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                                isChecked
                                  ? "border-primary/40 bg-primary/5"
                                  : "border-border hover:bg-muted/50"
                              }`}
                            >
                              <span
                                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                                  isChecked
                                    ? "border-primary bg-primary"
                                    : "border-muted-foreground/30"
                                }`}
                              >
                                {isChecked && (
                                  <Check className="h-3 w-3 text-primary-foreground" />
                                )}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate font-medium">
                                  {p.title || p.value}
                                </span>
                                <span className="block truncate text-[10px] text-muted-foreground">
                                  {p.value}
                                </span>
                              </span>
                              <Badge
                                variant={supported ? "secondary" : "outline"}
                                className="shrink-0 text-[9px]"
                              >
                                {platformLabel(p.platform)}
                                {!supported && " · n/d"}
                              </Badge>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </ScrollArea>
                </>
              )}

              {orphanSelected.length > 0 && (
                <p className="text-[10px] text-amber-500">
                  {orphanSelected.length} pixel(s) salvo(s) não estão mais na
                  conta do Switchy mas seguem aplicados.
                </p>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="switchy-default-term" className="text-xs">
                  utm_term padrão (opcional)
                </Label>
                <Input
                  id="switchy-default-term"
                  placeholder="ex: criativo-a"
                  value={defaultTerm}
                  onChange={(e) => setDefaultTerm(e.target.value)}
                  maxLength={120}
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="switchy-default-content" className="text-xs">
                  utm_content padrão (opcional)
                </Label>
                <Input
                  id="switchy-default-content"
                  placeholder="ex: post-organico"
                  value={defaultContent}
                  onChange={(e) => setDefaultContent(e.target.value)}
                  maxLength={120}
                  disabled={!canEdit}
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id="switchy-gdpr"
                checked={showGdpr}
                onCheckedChange={setShowGdpr}
                disabled={!canEdit}
              />
              <Label htmlFor="switchy-gdpr" className="text-sm cursor-pointer">
                Exibir aviso de GDPR nos shortlinks
              </Label>
            </div>

            {canEdit && (
              <Button
                size="sm"
                className="gap-1.5"
                onClick={handleSave}
                disabled={setSettings.isPending}
              >
                {setSettings.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Salvar
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
