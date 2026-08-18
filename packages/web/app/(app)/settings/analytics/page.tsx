"use client";

/**
 * Configuração global do Plausible (self-hosted).
 *
 * Fica em Settings, e não dentro do projeto, porque a instância é UMA só para
 * todos os experts — o que cada projeto escolhe é apenas o domínio a ler, lá na
 * aba Analytics da etapa. Só admin edita: a chave vale para a base inteira.
 */

import { useEffect, useState } from "react";
import { BarChart3, Check, Loader2, Plug, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useDeletePlausibleConfig,
  usePlausibleConfig,
  useSavePlausibleConfig,
  useTestPlausible,
  type PlausibleTeste,
} from "@/lib/hooks/use-plausible";
import { useUserRole } from "@/lib/hooks/use-user-role";

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export default function AnalyticsSettingsPage() {
  const role = useUserRole();
  const isAdmin = role === "admin";
  const cfg = usePlausibleConfig();
  const salvar = useSavePlausibleConfig();
  const apagar = useDeletePlausibleConfig();
  const testar = useTestPlausible();

  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [resultado, setResultado] = useState<PlausibleTeste | null>(null);

  // A URL salva preenche o campo assim que carrega; a chave nunca volta do
  // servidor, então o campo fica vazio e só é enviado se a pessoa digitar.
  useEffect(() => {
    if (cfg.data?.baseUrl) setBaseUrl(cfg.data.baseUrl);
  }, [cfg.data?.baseUrl]);

  if (!isAdmin) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Acesso restrito</CardTitle>
          <CardDescription>
            Só administradores configuram a instância de analytics — ela vale para todos os projetos.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (cfg.isLoading) return <Skeleton className="h-64" />;

  async function handleTestar() {
    setResultado(null);
    try {
      const r = await testar.mutateAsync({
        baseUrl: baseUrl.trim() || undefined,
        apiKey: apiKey.trim() || undefined,
      });
      setResultado(r);
    } catch (e) {
      setResultado({ ok: false, detalhe: errMsg(e) });
    }
  }

  function handleSalvar() {
    salvar.mutate(
      { baseUrl: baseUrl.trim(), apiKey: apiKey.trim() || undefined },
      {
        onSuccess: (r) => {
          setApiKey("");
          toast.success("Plausible configurado");
          if (r.aviso) setResultado({ ok: true, inconclusivo: true, detalhe: r.aviso });
        },
        onError: (e) => toast.error(errMsg(e)),
      },
    );
  }

  const configurado = cfg.data?.configured ?? false;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-primary" />
                Plausible (self-hosted)
                {configurado && (
                  <Badge variant="secondary" className="text-[10px]">conectado</Badge>
                )}
              </CardTitle>
              <CardDescription>
                Alternativa ao Google Analytics. A instância é a mesma para todos os experts — em cada
                projeto você escolhe qual site dela ler, na aba <strong>Analytics</strong> da etapa.
                Escolher um site ali desliga o GA4 daquele projeto.
              </CardDescription>
            </div>
            {configurado && (
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0 gap-1.5 text-muted-foreground hover:text-red-500"
                disabled={apagar.isPending}
                onClick={() =>
                  apagar.mutate(undefined, {
                    onSuccess: () => {
                      setApiKey("");
                      setResultado(null);
                      toast.success("Configuração removida — os projetos voltam ao GA4");
                    },
                    onError: (e) => toast.error(errMsg(e)),
                  })
                }
              >
                {apagar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                Remover
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="plausible-url" className="text-xs font-medium">Endereço da instância</Label>
              <Input
                id="plausible-url"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://analytics.suaempresa.com.br"
                autoComplete="off"
              />
              <p className="text-[11px] text-muted-foreground">
                A raiz do painel, sem caminho — a mesma URL que você abre no navegador.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="plausible-key" className="text-xs font-medium">
                Chave da API {configurado && <span className="font-normal text-muted-foreground">(preencha só para trocar)</span>}
              </Label>
              <Input
                id="plausible-key"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={configurado ? "•••••••• guardada" : "cole a chave gerada no Plausible"}
                autoComplete="off"
              />
              <p className="text-[11px] text-muted-foreground">
                No Plausible: avatar → <em>Settings</em> → <em>API Keys</em> → <em>New API Key</em>.
                Ela fica cifrada aqui e nunca é devolvida para a tela.
              </p>
            </div>
          </div>

          {resultado && (
            <div
              className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${
                !resultado.ok
                  ? "border-red-500/30 bg-red-500/5 text-red-500"
                  : resultado.inconclusivo
                    ? "border-amber-500/30 bg-amber-500/5 text-amber-600 dark:text-amber-400"
                    : "border-emerald-500/30 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400"
              }`}
            >
              {!resultado.ok ? (
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              ) : resultado.inconclusivo ? (
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              ) : (
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              )}
              <span className="min-w-0">{resultado.detalhe}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={handleSalvar}
              disabled={salvar.isPending || !baseUrl.trim() || (!configurado && !apiKey.trim())}
              className="gap-1.5"
            >
              {salvar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
              {configurado ? "Salvar alterações" : "Conectar"}
            </Button>
            <Button variant="outline" onClick={handleTestar} disabled={testar.isPending || !baseUrl.trim()} className="gap-1.5">
              {testar.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Testar conexão
            </Button>
            {cfg.data?.updatedAt && (
              <span className="text-[11px] text-muted-foreground">
                atualizado em {new Date(cfg.data.updatedAt).toLocaleString("pt-BR")}
              </span>
            )}
          </div>

          <p className="text-[11px] text-muted-foreground">
            Instância sem a <em>Sites API</em> habilitada não permite conferir a chave aqui — o teste
            avisa quando é o caso, e a confirmação vem ao escolher o site de um projeto.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
