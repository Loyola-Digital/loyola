"use client";

import { useState, useCallback } from "react";
import {
  TrendingUp,
  Plus,
  Loader2,
  Trash2,
  Link2,
  Unlink,
  FileSpreadsheet,
  Eye,
  Save,
  Copy,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  useMetaAdsAccounts,
  useCreateMetaAdsAccount,
  useDeleteMetaAdsAccount,
  useLinkMetaAdsProject,
  useUnlinkMetaAdsProject,
  type MetaAdsAccount,
} from "@/lib/hooks/use-meta-ads";
import {
  useGoogleSheetsConnection,
  useConnectGoogleSheet,
  useDeleteGoogleSheetsConnection,
  useMapSheetTabs,
  useSheetTabPreview,
  type TabMappingInput,
} from "@/lib/hooks/use-google-sheets";
import { useProjects } from "@/lib/hooks/use-projects";

export default function TrafficSettingsPage() {
  const { data: accounts, isLoading } = useMetaAdsAccounts();
  const { data: projects } = useProjects();
  const createAccount = useCreateMetaAdsAccount();
  const deleteAccount = useDeleteMetaAdsAccount();
  const linkProject = useLinkMetaAdsProject();
  const unlinkProject = useUnlinkMetaAdsProject();

  const [accountName, setAccountName] = useState("");
  const [metaAccountId, setMetaAccountId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [formError, setFormError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<MetaAdsAccount | null>(null);

  function handleCreate() {
    setFormError("");
    if (!accountName.trim() || !metaAccountId.trim() || !accessToken.trim()) {
      setFormError("Preencha todos os campos.");
      return;
    }
    createAccount.mutate(
      { accountName: accountName.trim(), metaAccountId: metaAccountId.trim(), accessToken: accessToken.trim() },
      {
        onSuccess: () => {
          toast.success("Conta conectada com sucesso!");
          setAccountName("");
          setMetaAccountId("");
          setAccessToken("");
        },
        onError: (err) => {
          setFormError(err instanceof Error ? err.message : "Erro ao conectar conta.");
        },
      }
    );
  }

  function handleDelete() {
    if (!deleteTarget) return;
    deleteAccount.mutate(deleteTarget.id, {
      onSuccess: () => {
        toast.success("Conta removida.");
        setDeleteTarget(null);
      },
      onError: () => toast.error("Erro ao remover conta."),
    });
  }

  function handleLink(accountId: string, projectId: string) {
    linkProject.mutate(
      { accountId, projectId },
      {
        onSuccess: () => toast.success("Projeto vinculado!"),
        onError: (err) => toast.error(err instanceof Error ? err.message : "Erro ao vincular."),
      }
    );
  }

  function handleUnlink(accountId: string, projectId: string) {
    unlinkProject.mutate(
      { accountId, projectId },
      {
        onSuccess: () => toast.success("Projeto desvinculado."),
        onError: () => toast.error("Erro ao desvincular."),
      }
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Meta Ads / Tráfego
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Gerencie contas de anúncios Meta Ads conectadas à plataforma.
        </p>
      </div>

      {/* Add account form */}
      <div className="rounded-2xl border border-border/30 bg-card/60 p-5 space-y-4">
        <h2 className="text-sm font-semibold">Conectar nova conta</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="accountName" className="text-xs">Nome da conta</Label>
            <Input
              id="accountName"
              placeholder="Cliente ABC"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="metaAccountId" className="text-xs">Ad Account ID</Label>
            <Input
              id="metaAccountId"
              placeholder="123456789"
              value={metaAccountId}
              onChange={(e) => setMetaAccountId(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="accessToken" className="text-xs">Access Token</Label>
            <Input
              id="accessToken"
              type="password"
              placeholder="EAAxxxxxxx..."
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
            />
          </div>
        </div>
        {formError && (
          <p className="text-sm text-destructive">{formError}</p>
        )}
        <Button onClick={handleCreate} disabled={createAccount.isPending}>
          {createAccount.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          Conectar conta
        </Button>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && (!accounts || accounts.length === 0) && (
        <div className="rounded-2xl border border-border/30 bg-card/60 p-8 text-center">
          <TrendingUp className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="font-medium">Nenhuma conta de anúncios cadastrada</p>
          <p className="text-sm text-muted-foreground mt-1">
            Adicione uma conta Meta Ads acima para começar.
          </p>
        </div>
      )}

      {/* Accounts list */}
      {accounts && accounts.length > 0 && (
        <div className="space-y-4">
          {accounts.map((account) => {
            const linkedProjectIds = new Set(account.projects.map((p) => p.projectId));
            const availableProjects = (projects ?? []).filter(
              (p) => !linkedProjectIds.has(p.id)
            );

            return (
              <div
                key={account.id}
                className="rounded-2xl border border-border/30 bg-card/60 p-5 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{account.accountName}</span>
                      <Badge variant="outline" className="text-[10px]">
                        act_{account.metaAccountId}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Criada em {new Date(account.createdAt).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive/70 hover:text-destructive"
                    onClick={() => setDeleteTarget(account)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                {/* Linked projects */}
                <div className="flex flex-wrap items-center gap-2">
                  {account.projects.map((p) => (
                    <Badge
                      key={p.projectId}
                      variant="secondary"
                      className="flex items-center gap-1 pr-1"
                    >
                      <Link2 className="h-3 w-3" />
                      {p.projectName}
                      <button
                        onClick={() => handleUnlink(account.id, p.projectId)}
                        className="ml-1 rounded-full p-0.5 hover:bg-destructive/20 transition-colors"
                      >
                        <Unlink className="h-3 w-3 text-destructive/70" />
                      </button>
                    </Badge>
                  ))}

                  {availableProjects.length > 0 && (
                    <Select
                      onValueChange={(projectId) => handleLink(account.id, projectId)}
                    >
                      <SelectTrigger className="h-7 w-[160px] text-xs">
                        <SelectValue placeholder="Vincular projeto..." />
                      </SelectTrigger>
                      <SelectContent>
                        {availableProjects.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ============================================================ */}
      {/* GOOGLE SHEETS SECTION */}
      {/* ============================================================ */}
      <GoogleSheetsSection projects={projects ?? []} />

      {/* Delete confirmation */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover conta de anúncios?</AlertDialogTitle>
            <AlertDialogDescription>
              A conta <strong>{deleteTarget?.accountName}</strong> será removida permanentemente.
              Todas as vinculações com projetos serão perdidas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ============================================================
// GOOGLE SHEETS SECTION
// ============================================================

const TAB_TYPES = [
  { value: "leads", label: "Leads" },
  { value: "survey", label: "Pesquisa" },
  { value: "sales", label: "Vendas" },
] as const;

const REQUIRED_COLUMNS: Record<string, { field: string; label: string }[]> = {
  leads: [
    { field: "utmCampaign", label: "UTM Campaign" },
    { field: "utmMedium", label: "UTM Medium" },
    { field: "utmContent", label: "UTM Content" },
  ],
  sales: [
    { field: "utmCampaign", label: "UTM Campaign" },
    { field: "utmMedium", label: "UTM Medium" },
    { field: "utmContent", label: "UTM Content" },
    { field: "valor", label: "Valor da venda" },
  ],
  survey: [],
};

function GoogleSheetsSection({ projects }: { projects: { id: string; name: string }[] }) {
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [sheetUrl, setSheetUrl] = useState("");
  const [connectError, setConnectError] = useState("");
  const [deleteSheetTarget, setDeleteSheetTarget] = useState<{ id: string; projectId: string } | null>(null);

  const connectSheet = useConnectGoogleSheet();
  const deleteSheet = useDeleteGoogleSheetsConnection();

  const { data: connection, isLoading: loadingConnection, error: connectionError } =
    useGoogleSheetsConnection(selectedProjectId || null);

  const hasConnection = !!connection && !connectionError;

  function handleConnect() {
    setConnectError("");
    if (!selectedProjectId || !sheetUrl.trim()) {
      setConnectError("Selecione um projeto e cole a URL da planilha.");
      return;
    }
    connectSheet.mutate(
      { projectId: selectedProjectId, spreadsheetUrl: sheetUrl.trim() },
      {
        onSuccess: () => {
          toast.success("Planilha conectada com sucesso!");
          setSheetUrl("");
        },
        onError: (err: unknown) => {
          const msg = err instanceof Error ? err.message : "Erro ao conectar planilha.";
          setConnectError(msg);
          // Check if error has serviceAccountEmail
          const errData = (err as { serviceAccountEmail?: string });
          if (errData.serviceAccountEmail) {
            setConnectError(
              `${msg} Compartilhe a planilha com: ${errData.serviceAccountEmail}`
            );
          }
        },
      }
    );
  }

  function handleDeleteSheet() {
    if (!deleteSheetTarget) return;
    deleteSheet.mutate(deleteSheetTarget, {
      onSuccess: () => {
        toast.success("Planilha desconectada.");
        setDeleteSheetTarget(null);
      },
      onError: () => toast.error("Erro ao desconectar planilha."),
    });
  }

  return (
    <>
      <div className="border-t border-border/30 pt-8">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5" />
          Google Sheets
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Conecte uma planilha do Google Sheets a um projeto para cruzar dados de leads e vendas com campanhas.
        </p>
      </div>

      {/* Connect form */}
      <div className="rounded-2xl border border-border/30 bg-card/60 p-5 space-y-4">
        <h2 className="text-sm font-semibold">Conectar planilha</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Projeto</Label>
            <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
              <SelectTrigger className="text-sm">
                <SelectValue placeholder="Selecione um projeto..." />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">URL da planilha</Label>
            <Input
              placeholder="https://docs.google.com/spreadsheets/d/..."
              value={sheetUrl}
              onChange={(e) => setSheetUrl(e.target.value)}
            />
          </div>
        </div>
        {connectError && (
          <div className="text-sm text-destructive space-y-1">
            <p>{connectError}</p>
            {connectError.includes("Compartilhe") && <CopyEmailButton text={connectError.split(": ").pop() ?? ""} />}
          </div>
        )}
        <Button onClick={handleConnect} disabled={connectSheet.isPending}>
          {connectSheet.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FileSpreadsheet className="h-4 w-4" />
          )}
          Conectar planilha
        </Button>
      </div>

      {/* Loading */}
      {selectedProjectId && loadingConnection && (
        <Skeleton className="h-40 rounded-xl" />
      )}

      {/* Connected sheet */}
      {hasConnection && (
        <div className="rounded-2xl border border-border/30 bg-card/60 p-5 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-green-500" />
                <span className="font-semibold">{connection.spreadsheetName}</span>
                <Badge variant="default" className="text-[10px] bg-green-500/20 text-green-600">
                  Conectada
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Conectada em {new Date(connection.createdAt).toLocaleDateString("pt-BR")}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="text-destructive/70 hover:text-destructive"
              onClick={() =>
                setDeleteSheetTarget({ id: connection.id, projectId: connection.projectId })
              }
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>

          {/* Tab mapping */}
          <TabMappingSection connection={connection} />
        </div>
      )}

      {/* No connection for selected project */}
      {selectedProjectId && !loadingConnection && !hasConnection && (
        <div className="rounded-2xl border border-border/30 bg-card/60 p-8 text-center">
          <FileSpreadsheet className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            Nenhuma planilha conectada a este projeto.
          </p>
        </div>
      )}

      {/* Delete sheet confirmation */}
      <AlertDialog open={deleteSheetTarget !== null} onOpenChange={(open) => { if (!open) setDeleteSheetTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desconectar planilha?</AlertDialogTitle>
            <AlertDialogDescription>
              A planilha será desconectada e todos os mapeamentos de abas serão removidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteSheet} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Desconectar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ============================================================
// COPY EMAIL BUTTON
// ============================================================

function CopyEmailButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copiado!" : "Copiar email"}
    </button>
  );
}

// ============================================================
// TAB MAPPING SECTION
// ============================================================

function TabMappingSection({
  connection,
}: {
  connection: { id: string; projectId: string; spreadsheetId: string; tabMappings: { tabName: string; tabType: string; columnMapping: Record<string, string> }[] };
}) {
  const mapTabs = useMapSheetTabs();
  const [previewTab, setPreviewTab] = useState<string | null>(null);
  const { data: preview, isLoading: loadingPreview } = useSheetTabPreview(
    previewTab ? connection.id : null,
    previewTab
  );

  // Build initial state from existing mappings
  const existingMappings = connection.tabMappings ?? [];
  const [tabConfigs, setTabConfigs] = useState<
    Record<string, { type: string; columnMapping: Record<string, string> }>
  >(() => {
    const initial: Record<string, { type: string; columnMapping: Record<string, string> }> = {};
    for (const m of existingMappings) {
      initial[m.tabName] = {
        type: m.tabType,
        columnMapping: m.columnMapping as Record<string, string>,
      };
    }
    return initial;
  });

  // Get list of tabs — we need to fetch from API
  // We show all tabs that have mappings, plus preview lets user discover new ones
  const mappedTabNames = Object.keys(tabConfigs);

  const [newTabName, setNewTabName] = useState("");

  const updateTabType = useCallback((tabName: string, type: string) => {
    setTabConfigs((prev) => ({
      ...prev,
      [tabName]: { type, columnMapping: prev[tabName]?.columnMapping ?? {} },
    }));
  }, []);

  const updateColumnMapping = useCallback(
    (tabName: string, field: string, headerName: string) => {
      setTabConfigs((prev) => ({
        ...prev,
        [tabName]: {
          ...prev[tabName],
          columnMapping: { ...prev[tabName]?.columnMapping, [field]: headerName },
        },
      }));
    },
    []
  );

  const addSurveyField = useCallback((tabName: string, field: string) => {
    setTabConfigs((prev) => ({
      ...prev,
      [tabName]: {
        ...prev[tabName],
        columnMapping: { ...prev[tabName]?.columnMapping, [field]: "" },
      },
    }));
  }, []);

  function handleSave() {
    const mappings: TabMappingInput[] = [];
    for (const [tabName, config] of Object.entries(tabConfigs)) {
      if (config.type && config.type !== "none") {
        mappings.push({
          tabName,
          tabType: config.type as "leads" | "survey" | "sales",
          columnMapping: config.columnMapping,
        });
      }
    }
    if (mappings.length === 0) {
      toast.error("Configure pelo menos uma aba.");
      return;
    }
    mapTabs.mutate(
      { connectionId: connection.id, projectId: connection.projectId, mappings },
      {
        onSuccess: () => toast.success("Mapeamento salvo!"),
        onError: () => toast.error("Erro ao salvar mapeamento."),
      }
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Mapeamento de abas</h3>
        <Button size="sm" onClick={handleSave} disabled={mapTabs.isPending}>
          {mapTabs.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Salvar mapeamento
        </Button>
      </div>

      {/* Add tab by name */}
      <div className="flex items-center gap-2">
        <Input
          placeholder="Nome da aba (ex: Leads Jan)"
          value={newTabName}
          onChange={(e) => setNewTabName(e.target.value)}
          className="max-w-xs text-sm"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            if (newTabName.trim()) {
              setTabConfigs((prev) => ({
                ...prev,
                [newTabName.trim()]: { type: "", columnMapping: {} },
              }));
              setNewTabName("");
            }
          }}
        >
          <Plus className="h-3.5 w-3.5" />
          Adicionar aba
        </Button>
      </div>

      {/* Tab list */}
      {mappedTabNames.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Adicione abas da planilha para mapear colunas.
        </p>
      )}

      {mappedTabNames.map((tabName) => {
        const config = tabConfigs[tabName];
        const tabType = config?.type || "";
        const requiredCols = REQUIRED_COLUMNS[tabType] ?? [];
        const isSurvey = tabType === "survey";

        return (
          <div
            key={tabName}
            className="rounded-xl border border-border/20 bg-muted/20 p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{tabName}</span>
                <Select
                  value={tabType}
                  onValueChange={(v) => updateTabType(tabName, v)}
                >
                  <SelectTrigger className="h-7 w-[130px] text-xs">
                    <SelectValue placeholder="Tipo..." />
                  </SelectTrigger>
                  <SelectContent>
                    {TAB_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs"
                  onClick={() => setPreviewTab(previewTab === tabName ? null : tabName)}
                >
                  <Eye className="h-3.5 w-3.5" />
                  {previewTab === tabName ? "Fechar" : "Preview"}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive/60 hover:text-destructive"
                  onClick={() => {
                    setTabConfigs((prev) => {
                      const next = { ...prev };
                      delete next[tabName];
                      return next;
                    });
                    if (previewTab === tabName) setPreviewTab(null);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {/* Preview table */}
            {previewTab === tabName && (
              <div className="overflow-x-auto">
                {loadingPreview && <Skeleton className="h-32" />}
                {preview && (
                  <table className="w-full text-xs border border-border/20 rounded">
                    <thead>
                      <tr className="bg-muted/40">
                        {preview.headers.map((h, i) => (
                          <th key={i} className="px-2 py-1.5 text-left font-medium border-b border-border/20">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.rows.map((row, ri) => (
                        <tr key={ri} className="border-b border-border/10">
                          {row.map((cell, ci) => (
                            <td key={ci} className="px-2 py-1 text-muted-foreground truncate max-w-[150px]">
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {preview && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Mostrando {preview.rows.length} de {preview.totalRows} linhas
                  </p>
                )}
              </div>
            )}

            {/* Column mapping for leads/sales */}
            {tabType && !isSurvey && requiredCols.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {requiredCols.map((col) => (
                  <div key={col.field} className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{col.label}</Label>
                    {preview ? (
                      <Select
                        value={config?.columnMapping?.[col.field] ?? ""}
                        onValueChange={(v) => updateColumnMapping(tabName, col.field, v)}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Selecione coluna..." />
                        </SelectTrigger>
                        <SelectContent>
                          {preview.headers.map((h) => (
                            <SelectItem key={h} value={h}>
                              {h}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        className="h-8 text-xs"
                        placeholder="Nome da coluna"
                        value={config?.columnMapping?.[col.field] ?? ""}
                        onChange={(e) =>
                          updateColumnMapping(tabName, col.field, e.target.value)
                        }
                      />
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Column mapping for survey (dynamic fields) */}
            {isSurvey && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Adicione os campos da pesquisa que deseja importar:
                </p>
                {Object.entries(config?.columnMapping ?? {}).map(([field, headerName]) => (
                  <div key={field} className="flex items-center gap-2">
                    <Input
                      className="h-8 text-xs max-w-[150px]"
                      placeholder="Nome do campo"
                      value={field}
                      readOnly
                    />
                    {preview ? (
                      <Select
                        value={headerName}
                        onValueChange={(v) => updateColumnMapping(tabName, field, v)}
                      >
                        <SelectTrigger className="h-8 text-xs max-w-[200px]">
                          <SelectValue placeholder="Coluna..." />
                        </SelectTrigger>
                        <SelectContent>
                          {preview.headers.map((h) => (
                            <SelectItem key={h} value={h}>
                              {h}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        className="h-8 text-xs max-w-[200px]"
                        placeholder="Nome da coluna"
                        value={headerName}
                        onChange={(e) =>
                          updateColumnMapping(tabName, field, e.target.value)
                        }
                      />
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive/60"
                      onClick={() => {
                        setTabConfigs((prev) => {
                          const mapping = { ...prev[tabName].columnMapping };
                          delete mapping[field];
                          return { ...prev, [tabName]: { ...prev[tabName], columnMapping: mapping } };
                        });
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
                <SurveyFieldAdder
                  onAdd={(field) => addSurveyField(tabName, field)}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// SURVEY FIELD ADDER
// ============================================================

function SurveyFieldAdder({ onAdd }: { onAdd: (field: string) => void }) {
  const [fieldName, setFieldName] = useState("");

  return (
    <div className="flex items-center gap-2">
      <Input
        className="h-8 text-xs max-w-[200px]"
        placeholder="Nome do campo (ex: renda, sexo)"
        value={fieldName}
        onChange={(e) => setFieldName(e.target.value)}
      />
      <Button
        variant="outline"
        size="sm"
        className="h-8 text-xs"
        onClick={() => {
          if (fieldName.trim()) {
            onAdd(fieldName.trim());
            setFieldName("");
          }
        }}
      >
        <Plus className="h-3 w-3" />
        Adicionar campo
      </Button>
    </div>
  );
}
