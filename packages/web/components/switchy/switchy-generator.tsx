"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Sparkles, FolderOpen, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import {
  useSwitchyFolders,
  useSwitchySettings,
  useSwitchyPresets,
  useGenerateSwitchyLinks,
  type SwitchyGenerateResult,
} from "@/lib/hooks/use-switchy";
import { SwitchyResultsTable } from "./switchy-results-table";

interface Props {
  projectId: string;
  canEdit: boolean;
  /** Story 33.7: quando renderizado dentro de um funil, atrela os links a ele. */
  funnelId?: string;
  /** utm_campaign pré-preenchido (ex: nome do funil). Editável. */
  defaultCampaign?: string;
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function SwitchyGenerator({ projectId, canEdit, funnelId, defaultCampaign }: Props) {
  const folders = useSwitchyFolders(projectId);
  const settings = useSwitchySettings(projectId);
  const presets = useSwitchyPresets(projectId);
  const generate = useGenerateSwitchyLinks(projectId);

  const [checkoutUrl, setCheckoutUrl] = useState("");
  const [folderId, setFolderId] = useState<string>("");
  const [campaign, setCampaign] = useState(defaultCampaign ?? "");
  const [term, setTerm] = useState("");
  const [content, setContent] = useState("");
  const [seededDefaults, setSeededDefaults] = useState(false);
  // Canais marcados (por id do preset). Inicializado com todos os enabled.
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [seededChannels, setSeededChannels] = useState(false);
  const [results, setResults] = useState<SwitchyGenerateResult[]>([]);

  // Pré-preenche term/content uma única vez quando settings carregam, sem
  // sobrescrever edição do usuário.
  useEffect(() => {
    if (seededDefaults || !settings.data) return;
    setTerm(settings.data.defaultUtmTerm ?? "");
    setContent(settings.data.defaultUtmContent ?? "");
    setSeededDefaults(true);
  }, [settings.data, seededDefaults]);

  const enabledPresets = useMemo(
    () => (presets.data ?? []).filter((p) => p.enabled),
    [presets.data],
  );

  // Marca todos os canais enabled por padrão, uma vez.
  useEffect(() => {
    if (seededChannels || !presets.data) return;
    setChecked(new Set(enabledPresets.map((p) => p.id)));
    setSeededChannels(true);
  }, [presets.data, enabledPresets, seededChannels]);

  function toggleChannel(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedFolder = useMemo(
    () => (folders.data ?? []).find((f) => String(f.id) === folderId) ?? null,
    [folders.data, folderId],
  );

  const selectedChannels = useMemo(
    () => enabledPresets.filter((p) => checked.has(p.id)),
    [enabledPresets, checked],
  );

  const canGenerate =
    canEdit &&
    checkoutUrl.trim().length > 0 &&
    !!selectedFolder &&
    campaign.trim().length > 0 &&
    selectedChannels.length > 0;

  function handleGenerate() {
    if (!canEdit) return;
    if (!checkoutUrl.trim()) {
      toast.error("Cole o link de checkout.");
      return;
    }
    if (!selectedFolder) {
      toast.error("Selecione uma folder.");
      return;
    }
    if (!campaign.trim()) {
      toast.error("Informe o utm_campaign.");
      return;
    }
    if (selectedChannels.length === 0) {
      toast.error("Marque ao menos um canal.");
      return;
    }

    const termTrim = term.trim();
    const contentTrim = content.trim();

    generate.mutate(
      {
        checkoutUrl: checkoutUrl.trim(),
        folderId: String(selectedFolder.id),
        folderName: selectedFolder.name,
        campaign: campaign.trim(),
        ...(termTrim ? { term: termTrim } : {}),
        ...(contentTrim ? { content: contentTrim } : {}),
        ...(funnelId ? { funnelId } : {}),
        channels: selectedChannels.map((p) => ({
          label: p.label,
          medium: p.utmMedium,
          source: p.utmSource,
        })),
      },
      {
        onSuccess: (data) => {
          setResults(data.results);
          const ok = data.results.filter((r) => !r.error).length;
          if (ok === data.results.length) {
            toast.success(`${ok} link(s) gerado(s)!`);
          } else {
            toast.warning(`${ok} de ${data.results.length} gerados — alguns canais falharam`);
          }
        },
        onError: (e) => toast.error(errMsg(e)),
      },
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-primary" />
          Gerar links em lote
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Checkout URL + preview cru */}
        <div className="space-y-1">
          <Label htmlFor="switchy-checkout" className="text-xs">
            Link de checkout
          </Label>
          <Input
            id="switchy-checkout"
            placeholder="https://pay.exemplo.com/checkout/abc"
            value={checkoutUrl}
            onChange={(e) => setCheckoutUrl(e.target.value)}
            disabled={!canEdit}
          />
          {checkoutUrl.trim() && (
            <p className="text-[10px] text-muted-foreground break-all">
              URL base: <code className="bg-muted/50 px-1 rounded">{checkoutUrl}</code>
            </p>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {/* Folder */}
          <div className="space-y-1">
            <Label htmlFor="switchy-folder" className="text-xs">
              Folder do Switchy
            </Label>
            {folders.isLoading ? (
              <Skeleton className="h-9" />
            ) : folders.isError ? (
              <p className="text-[10px] text-red-500">
                Erro ao carregar folders: {errMsg(folders.error)}
              </p>
            ) : (
              <Select value={folderId} onValueChange={setFolderId} disabled={!canEdit}>
                <SelectTrigger id="switchy-folder" className="h-9 text-sm">
                  <FolderOpen className="h-4 w-4 mr-2 text-muted-foreground" />
                  <SelectValue placeholder="Selecionar folder" />
                </SelectTrigger>
                <SelectContent>
                  {(folders.data ?? []).map((f) => (
                    <SelectItem key={f.id} value={String(f.id)}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Campaign (obrigatório) */}
          <div className="space-y-1">
            <Label htmlFor="switchy-campaign" className="text-xs">
              utm_campaign <span className="text-red-500">*</span>
            </Label>
            <Input
              id="switchy-campaign"
              placeholder="ex: lancamento-junho"
              value={campaign}
              onChange={(e) => setCampaign(e.target.value)}
              disabled={!canEdit}
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="switchy-term" className="text-xs">
              utm_term (opcional)
            </Label>
            <Input
              id="switchy-term"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              disabled={!canEdit}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="switchy-content" className="text-xs">
              utm_content (opcional)
            </Label>
            <Input
              id="switchy-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              disabled={!canEdit}
            />
          </div>
        </div>

        {/* Canais */}
        <div className="space-y-2">
          <Label className="text-xs">Canais</Label>
          {presets.isLoading ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : presets.isError ? (
            <p className="text-[10px] text-red-500">
              Erro ao carregar canais: {errMsg(presets.error)}
            </p>
          ) : enabledPresets.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Nenhum canal ativo. Ative canais no painel de presets acima.
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {enabledPresets.map((p) => {
                const isChecked = checked.has(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    disabled={!canEdit}
                    onClick={() => toggleChannel(p.id)}
                    className={`flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                      isChecked
                        ? "border-primary/40 bg-primary/5"
                        : "border-border hover:bg-muted/50"
                    }`}
                  >
                    <span
                      className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 ${
                        isChecked
                          ? "bg-primary border-primary"
                          : "border-muted-foreground/30"
                      }`}
                    >
                      {isChecked && <Check className="h-3 w-3 text-primary-foreground" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-medium truncate">{p.label}</span>
                      <span className="block text-[10px] text-muted-foreground truncate">
                        {p.utmMedium} · {p.utmSource}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {canEdit && (
          <Button
            className="gap-1.5"
            onClick={handleGenerate}
            disabled={!canGenerate || generate.isPending}
          >
            {generate.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Gerar
          </Button>
        )}

        {/* Results */}
        {generate.isPending ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : (
          <SwitchyResultsTable results={results} />
        )}
      </CardContent>
    </Card>
  );
}
