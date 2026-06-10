"use client";

import { useEffect, useState } from "react";
import { Loader2, Save, Settings2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import {
  useSwitchySettings,
  useSetSwitchySettings,
  type SwitchyPixel,
  type SwitchySettings,
} from "@/lib/hooks/use-switchy";

interface Props {
  projectId: string;
  canEdit: boolean;
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Extrai o valor de um pixel por plataforma do array salvo. */
function pixelValue(pixels: SwitchyPixel[], platform: SwitchyPixel["platform"]): string {
  return pixels.find((p) => p.platform === platform)?.value ?? "";
}

export function SwitchyConfigPanel({ projectId, canEdit }: Props) {
  const settings = useSwitchySettings(projectId);
  const setSettings = useSetSwitchySettings(projectId);

  // Estado controlado dos campos do form. Semeado uma vez quando os settings
  // carregam (flag `seeded`), sem sobrescrever depois que o usuário editar.
  const [metaPixel, setMetaPixel] = useState("");
  const [gtmContainer, setGtmContainer] = useState("");
  const [showGdpr, setShowGdpr] = useState(false);
  const [defaultTerm, setDefaultTerm] = useState("");
  const [defaultContent, setDefaultContent] = useState("");
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    if (seeded || !settings.data) return;
    setMetaPixel(pixelValue(settings.data.pixels, "facebook"));
    setGtmContainer(pixelValue(settings.data.pixels, "gtm"));
    setShowGdpr(settings.data.showGdpr);
    setDefaultTerm(settings.data.defaultUtmTerm ?? "");
    setDefaultContent(settings.data.defaultUtmContent ?? "");
    setSeeded(true);
  }, [settings.data, seeded]);

  function handleSave() {
    if (!canEdit) return;
    const pixels: SwitchyPixel[] = [];
    const meta = metaPixel.trim();
    const gtm = gtmContainer.trim();
    if (meta) {
      pixels.push({ platform: "facebook", value: meta, title: "Meta Pixel" });
    }
    if (gtm) {
      pixels.push({ platform: "gtm", value: gtm, title: "Google Tag Manager" });
    }
    const payload: SwitchySettings = {
      pixels,
      showGdpr,
      defaultUtmTerm: defaultTerm.trim() ? defaultTerm.trim() : null,
      defaultUtmContent: defaultContent.trim() ? defaultContent.trim() : null,
    };
    setSettings.mutate(payload, {
      onSuccess: () => toast.success("Configurações salvas!"),
      onError: (e) => toast.error(errMsg(e)),
    });
  }

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
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="switchy-meta-pixel" className="text-xs">
                  Meta Pixel ID
                </Label>
                <Input
                  id="switchy-meta-pixel"
                  placeholder="1234567890"
                  value={metaPixel}
                  onChange={(e) => setMetaPixel(e.target.value)}
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="switchy-gtm" className="text-xs">
                  GTM Container
                </Label>
                <Input
                  id="switchy-gtm"
                  placeholder="GTM-XXXX"
                  value={gtmContainer}
                  onChange={(e) => setGtmContainer(e.target.value)}
                  disabled={!canEdit}
                />
                {gtmContainer.trim() && !gtmContainer.trim().toUpperCase().startsWith("GTM-") && (
                  <p className="text-[10px] text-amber-500">
                    Container GTM normalmente começa com “GTM-”.
                  </p>
                )}
              </div>
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
