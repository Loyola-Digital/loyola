"use client";

import { useState } from "react";
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
  useAvailableTabs,
  useAIAnalyzeSheet,
  type TabMappingInput,
} from "@/lib/hooks/use-google-sheets";
import {
  useQualificationProfile,
  useSaveQualificationProfile,
  useDeleteQualificationProfile,
  useQualificationPreview,
  useAIGenerateRules,
  type QualificationRule,
} from "@/lib/hooks/use-qualification";
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

      {/* ============================================================ */}
      {/* QUALIFICATION PROFILE SECTION */}
      {/* ============================================================ */}
      <QualificationSection projects={projects ?? []} />

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
  const aiAnalyze = useAIAnalyzeSheet();
  const { data: availableTabs, isLoading: loadingTabs } = useAvailableTabs(connection.id);
  const [aiExplanation, setAiExplanation] = useState("");

  // The 3 data types the system needs
  const DATA_NEEDS = [
    { type: "leads" as const, label: "Leads / CRM", description: "Dados de leads com UTMs para cruzar com campanhas", requiredFields: REQUIRED_COLUMNS.leads },
    { type: "survey" as const, label: "Pesquisa de Captação", description: "Respostas da pesquisa para qualificar leads", requiredFields: [] as { field: string; label: string }[] },
    { type: "sales" as const, label: "Vendas", description: "Dados de vendas para calcular ROAS real", requiredFields: REQUIRED_COLUMNS.sales },
  ];

  // Build state from existing mappings
  const [selections, setSelections] = useState<Record<string, { tabName: string; columnMapping: Record<string, string> }>>(() => {
    const init: Record<string, { tabName: string; columnMapping: Record<string, string> }> = {};
    for (const m of connection.tabMappings ?? []) {
      init[m.tabType] = { tabName: m.tabName, columnMapping: m.columnMapping as Record<string, string> };
    }
    return init;
  });

  // Track which type is showing preview
  const [previewType, setPreviewType] = useState<string | null>(null);
  const previewTabName = previewType ? selections[previewType]?.tabName : null;
  const { data: preview, isLoading: loadingPreview } = useSheetTabPreview(
    previewTabName ? connection.id : null,
    previewTabName
  );

  // Survey dynamic fields
  const [newSurveyField, setNewSurveyField] = useState("");

  const tabs = availableTabs?.tabs ?? [];

  function handleSelectTab(type: string, tabName: string) {
    setSelections((prev) => ({
      ...prev,
      [type]: { tabName, columnMapping: prev[type]?.columnMapping ?? {} },
    }));
    // Auto-show preview
    setPreviewType(type);
  }

  function handleMapColumn(type: string, field: string, headerName: string) {
    setSelections((prev) => ({
      ...prev,
      [type]: {
        ...prev[type],
        columnMapping: { ...prev[type]?.columnMapping, [field]: headerName },
      },
    }));
  }

  function handleSave() {
    const mappings: TabMappingInput[] = [];
    for (const [type, sel] of Object.entries(selections)) {
      if (sel.tabName) {
        mappings.push({
          tabName: sel.tabName,
          tabType: type as "leads" | "survey" | "sales",
          columnMapping: sel.columnMapping,
        });
      }
    }
    if (mappings.length === 0) {
      toast.error("Selecione pelo menos uma aba.");
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

  function handleAIAnalyze() {
    setAiExplanation("");
    aiAnalyze.mutate(connection.id, {
      onSuccess: (data) => {
        const newSelections: Record<string, { tabName: string; columnMapping: Record<string, string> }> = {};
        for (const m of data.mappings) {
          newSelections[m.tabType] = { tabName: m.tabName, columnMapping: m.columnMapping };
        }
        setSelections(newSelections);
        setAiExplanation(data.explanation);
        toast.success(`IA identificou ${data.mappings.length} aba(s). Revise e salve.`);
      },
      onError: (err) => {
        toast.error(err instanceof Error ? err.message : "Erro ao analisar.");
      },
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Mapeamento de Dados</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Selecione manualmente ou deixe a IA mapear automaticamente
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleAIAnalyze} disabled={aiAnalyze.isPending}>
            {aiAnalyze.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TrendingUp className="h-3.5 w-3.5" />}
            Mapear com IA
          </Button>
          <Button size="sm" onClick={handleSave} disabled={mapTabs.isPending}>
            {mapTabs.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Salvar
          </Button>
        </div>
      </div>

      {aiExplanation && (
        <div className="rounded-lg border border-green-500/20 bg-green-500/5 px-4 py-2.5">
          <p className="text-xs text-green-700">{aiExplanation}</p>
        </div>
      )}

      {loadingTabs && <Skeleton className="h-40 rounded-xl" />}

      {!loadingTabs && DATA_NEEDS.map((need) => {
        const sel = selections[need.type];
        const selectedTab = sel?.tabName ?? "";
        const isShowingPreview = previewType === need.type && !!selectedTab;
        const previewHeaders = isShowingPreview ? preview?.headers ?? [] : [];

        return (
          <div key={need.type} className="rounded-xl border border-border/20 bg-muted/20 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{need.label}</span>
                  {selectedTab && (
                    <Badge variant="default" className="text-[10px] bg-green-500/20 text-green-600 border-green-500/30">
                      Configurado
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{need.description}</p>
              </div>
              <div className="flex items-center gap-2">
                <Select value={selectedTab} onValueChange={(v) => handleSelectTab(need.type, v)}>
                  <SelectTrigger className="h-8 w-[180px] text-xs">
                    <SelectValue placeholder="Selecione a aba..." />
                  </SelectTrigger>
                  <SelectContent>
                    {tabs.filter(Boolean).map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedTab && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-8"
                    onClick={() => setPreviewType(isShowingPreview ? null : need.type)}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    {isShowingPreview ? "Fechar" : "Preview"}
                  </Button>
                )}
              </div>
            </div>

            {/* Preview */}
            {isShowingPreview && (
              <div className="overflow-x-auto">
                {loadingPreview && <Skeleton className="h-24" />}
                {preview && (
                  <table className="w-full text-xs border border-border/20 rounded">
                    <thead>
                      <tr className="bg-muted/40">
                        {preview.headers.map((h, i) => (
                          <th key={i} className="px-2 py-1.5 text-left font-medium border-b border-border/20">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.rows.slice(0, 3).map((row, ri) => (
                        <tr key={ri} className="border-b border-border/10">
                          {row.map((cell, ci) => (
                            <td key={ci} className="px-2 py-1 text-muted-foreground truncate max-w-[120px]">{cell}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* Column mapping for leads/sales */}
            {selectedTab && need.type !== "survey" && need.requiredFields.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {need.requiredFields.map((col) => (
                  <div key={col.field} className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{col.label}</Label>
                    <Select
                      value={sel?.columnMapping?.[col.field] ?? ""}
                      onValueChange={(v) => handleMapColumn(need.type, col.field, v)}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Coluna..." />
                      </SelectTrigger>
                      <SelectContent>
                        {(previewHeaders.length > 0 ? previewHeaders : []).filter(Boolean).map((h) => (
                          <SelectItem key={h} value={h}>{h}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            )}

            {/* Column mapping for survey (dynamic) */}
            {selectedTab && need.type === "survey" && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Campos da pesquisa para importar:</p>
                {Object.entries(sel?.columnMapping ?? {}).map(([field, headerName]) => (
                  <div key={field} className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs shrink-0">{field}</Badge>
                    <Select
                      value={headerName}
                      onValueChange={(v) => handleMapColumn("survey", field, v)}
                    >
                      <SelectTrigger className="h-8 text-xs max-w-[200px]">
                        <SelectValue placeholder="Coluna..." />
                      </SelectTrigger>
                      <SelectContent>
                        {(previewHeaders.length > 0 ? previewHeaders : []).filter(Boolean).map((h) => (
                          <SelectItem key={h} value={h}>{h}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive/60"
                      onClick={() => {
                        setSelections((prev) => {
                          const mapping = { ...prev.survey.columnMapping };
                          delete mapping[field];
                          return { ...prev, survey: { ...prev.survey, columnMapping: mapping } };
                        });
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
                <div className="flex items-center gap-2">
                  <Input
                    className="h-8 text-xs max-w-[150px]"
                    placeholder="Nome do campo (ex: renda)"
                    value={newSurveyField}
                    onChange={(e) => setNewSurveyField(e.target.value)}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => {
                      if (newSurveyField.trim()) {
                        handleMapColumn("survey", newSurveyField.trim(), "");
                        setNewSurveyField("");
                      }
                    }}
                  >
                    <Plus className="h-3 w-3" /> Adicionar
                  </Button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// QUALIFICATION PROFILE SECTION
// ============================================================

const OPERATORS = [
  { value: "equals", label: "=" },
  { value: "not_equals", label: "≠" },
  { value: "gte", label: ">=" },
  { value: "lte", label: "<=" },
  { value: "contains", label: "contém" },
  { value: "in", label: "em" },
] as const;

function QualificationSection({ projects }: { projects: { id: string; name: string }[] }) {
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const { data: profile, isLoading } = useQualificationProfile(selectedProjectId || null);
  const saveProfile = useSaveQualificationProfile();
  const deleteProfile = useDeleteQualificationProfile();
  const previewMutation = useQualificationPreview();
  const aiGenerate = useAIGenerateRules();

  const [rules, setRules] = useState<QualificationRule[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [aiDescription, setAiDescription] = useState("");
  const [aiError, setAiError] = useState("");

  // Sync rules from loaded profile
  if (profile && !initialized) {
    setRules(profile.rules);
    setInitialized(true);
  }

  // Reset when project changes
  const handleProjectChange = (id: string) => {
    setSelectedProjectId(id);
    setRules([]);
    setInitialized(false);
  };

  const [newField, setNewField] = useState("");
  const [newOperator, setNewOperator] = useState<string>("equals");
  const [newValue, setNewValue] = useState("");

  function addRule() {
    if (!newField.trim() || !newValue.trim()) return;
    setRules((prev) => [
      ...prev,
      { field: newField.trim(), operator: newOperator as QualificationRule["operator"], value: newValue.trim() },
    ]);
    setNewField("");
    setNewValue("");
  }

  function removeRule(index: number) {
    setRules((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSave() {
    if (!selectedProjectId || rules.length === 0) {
      toast.error("Adicione pelo menos uma regra.");
      return;
    }
    saveProfile.mutate(
      { projectId: selectedProjectId, rules },
      {
        onSuccess: () => toast.success("Perfil salvo!"),
        onError: () => toast.error("Erro ao salvar perfil."),
      }
    );
  }

  function handlePreview() {
    if (!selectedProjectId || rules.length === 0) return;
    previewMutation.mutate({ projectId: selectedProjectId, rules });
  }

  function handleDelete() {
    if (!selectedProjectId) return;
    deleteProfile.mutate(selectedProjectId, {
      onSuccess: () => {
        toast.success("Perfil removido.");
        setRules([]);
        setInitialized(false);
      },
      onError: () => toast.error("Erro ao remover perfil."),
    });
  }

  function handleAIGenerate() {
    if (!selectedProjectId || !aiDescription.trim()) return;
    setAiError("");
    aiGenerate.mutate(
      { projectId: selectedProjectId, description: aiDescription.trim() },
      {
        onSuccess: (data) => {
          setRules(data.rules);
          toast.success(`${data.rules.length} regra(s) gerada(s) pela IA.`);
          // Auto-preview
          previewMutation.mutate({ projectId: selectedProjectId, rules: data.rules });
        },
        onError: (err) => {
          const msg = err instanceof Error ? err.message : "Erro ao gerar regras";
          setAiError(msg);
          toast.error(msg);
        },
      }
    );
  }

  return (
    <div className="border-t border-border/30 pt-8 space-y-4">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Perfil de Lead Qualificado
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Configure o perfil ideal de lead qualificado por projeto para classificar automaticamente.
        </p>
      </div>

      {/* Project selector */}
      <div className="space-y-1.5 max-w-xs">
        <Label className="text-xs">Projeto</Label>
        <Select value={selectedProjectId} onValueChange={handleProjectChange}>
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

      {selectedProjectId && isLoading && <Skeleton className="h-32 rounded-xl" />}

      {selectedProjectId && !isLoading && (
        <div className="rounded-2xl border border-border/30 bg-card/60 p-5 space-y-4">
          {/* Current rules */}
          {rules.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Regras ({rules.length})</h3>
              {rules.map((rule, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 rounded-lg border border-border/20 bg-muted/20 px-3 py-2"
                >
                  <span className="text-sm font-medium">{rule.field}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {OPERATORS.find((o) => o.value === rule.operator)?.label ?? rule.operator}
                  </Badge>
                  <span className="text-sm">{rule.value}</span>
                  <button
                    onClick={() => removeRule(idx)}
                    className="ml-auto rounded-full p-1 hover:bg-destructive/20 transition-colors"
                  >
                    <Trash2 className="h-3 w-3 text-destructive/70" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* AI Generation */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Gerar regras com IA</h3>
            <p className="text-xs text-muted-foreground">
              Descreva seu publico ideal e a IA analisa a planilha para gerar as regras automaticamente.
            </p>
            <div className="flex gap-2">
              <Input
                className="h-8 text-xs flex-1"
                placeholder="Ex: Mulheres catolicas, renda acima de 5 mil, no maximo 2 filhos"
                value={aiDescription}
                onChange={(e) => setAiDescription(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAIGenerate()}
              />
              <Button
                variant="outline"
                size="sm"
                className="h-8 whitespace-nowrap"
                onClick={handleAIGenerate}
                disabled={aiGenerate.isPending || !aiDescription.trim()}
              >
                {aiGenerate.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <TrendingUp className="h-3.5 w-3.5" />
                )}
                Gerar com IA
              </Button>
            </div>
            {aiError && (
              <p className="text-xs text-destructive">{aiError}</p>
            )}
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border/30" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card/60 px-2 text-muted-foreground">ou adicione manualmente</span>
            </div>
          </div>

          {/* Add rule */}
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Campo</Label>
              <Input
                className="h-8 text-xs w-[140px]"
                placeholder="ex: sexo, renda"
                value={newField}
                onChange={(e) => setNewField(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Operador</Label>
              <Select value={newOperator} onValueChange={setNewOperator}>
                <SelectTrigger className="h-8 text-xs w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OPERATORS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Valor</Label>
              <Input
                className="h-8 text-xs w-[140px]"
                placeholder="ex: feminino, 5000"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
              />
            </div>
            <Button variant="outline" size="sm" className="h-8" onClick={addRule}>
              <Plus className="h-3 w-3" />
              Adicionar
            </Button>
          </div>

          {/* Preview */}
          {previewMutation.data && (
            <div className="rounded-lg border border-border/20 bg-muted/30 px-4 py-3">
              <p className="text-sm">
                <strong>{previewMutation.data.qualifiedLeads}</strong> de{" "}
                <strong>{previewMutation.data.totalLeads}</strong> leads qualificados (
                {previewMutation.data.qualificationRate.toFixed(1)}%)
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePreview}
              disabled={previewMutation.isPending || rules.length === 0}
            >
              {previewMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Eye className="h-3.5 w-3.5" />
              )}
              Preview
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saveProfile.isPending || rules.length === 0}>
              {saveProfile.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              Salvar perfil
            </Button>
            {profile && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive/70 hover:text-destructive"
                onClick={handleDelete}
                disabled={deleteProfile.isPending}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remover
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
