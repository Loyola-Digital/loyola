"use client";

import { useState } from "react";
import { Loader2, Plus, Trash2, Pencil, Check, X, Layers, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { toast } from "sonner";
import {
  useSwitchyPresets,
  useCreateSwitchyPreset,
  useUpdateSwitchyPreset,
  useDeleteSwitchyPreset,
  type SwitchyPreset,
} from "@/lib/hooks/use-switchy";

interface Props {
  projectId: string;
  canEdit: boolean;
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

interface DraftFields {
  label: string;
  utmMedium: string;
  utmSource: string;
}

const EMPTY_DRAFT: DraftFields = { label: "", utmMedium: "", utmSource: "" };

export function SwitchyPresetsManager({ projectId, canEdit }: Props) {
  const presets = useSwitchyPresets(projectId);
  const createPreset = useCreateSwitchyPreset(projectId);
  const updatePreset = useUpdateSwitchyPreset(projectId);
  const deletePreset = useDeleteSwitchyPreset(projectId);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<DraftFields>(EMPTY_DRAFT);
  const [adding, setAdding] = useState(false);
  const [addDraft, setAddDraft] = useState<DraftFields>(EMPTY_DRAFT);
  const [deleteTarget, setDeleteTarget] = useState<SwitchyPreset | null>(null);

  function startEdit(p: SwitchyPreset) {
    setEditingId(p.id);
    setEditDraft({ label: p.label, utmMedium: p.utmMedium, utmSource: p.utmSource });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditDraft(EMPTY_DRAFT);
  }

  function handleSaveEdit() {
    if (!editingId) return;
    const label = editDraft.label.trim();
    const utmMedium = editDraft.utmMedium.trim();
    const utmSource = editDraft.utmSource.trim();
    if (!label || !utmMedium || !utmSource) {
      toast.error("Preencha label, utm_medium e utm_source.");
      return;
    }
    updatePreset.mutate(
      { presetId: editingId, label, utmMedium, utmSource },
      {
        onSuccess: () => {
          toast.success("Canal atualizado");
          cancelEdit();
        },
        onError: (e) => toast.error(errMsg(e)),
      },
    );
  }

  function handleCreate() {
    const label = addDraft.label.trim();
    const utmMedium = addDraft.utmMedium.trim();
    const utmSource = addDraft.utmSource.trim();
    if (!label || !utmMedium || !utmSource) {
      toast.error("Preencha label, utm_medium e utm_source.");
      return;
    }
    createPreset.mutate(
      { label, utmMedium, utmSource },
      {
        onSuccess: () => {
          toast.success("Canal adicionado");
          setAdding(false);
          setAddDraft(EMPTY_DRAFT);
        },
        onError: (e) => toast.error(errMsg(e)),
      },
    );
  }

  function handleToggle(p: SwitchyPreset, enabled: boolean) {
    updatePreset.mutate(
      { presetId: p.id, enabled },
      {
        onError: (e) => toast.error(errMsg(e)),
      },
    );
  }

  function handleDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    deletePreset.mutate(target.id, {
      onSuccess: () => {
        toast.success(`Canal "${target.label}" removido`);
        setDeleteTarget(null);
      },
      onError: (e) => {
        toast.error(errMsg(e));
        setDeleteTarget(null);
      },
    });
  }

  const list = presets.data ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Layers className="h-4 w-4 text-primary" />
          Canais (presets)
        </CardTitle>
        {canEdit && !adding && (
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => {
              setAddDraft(EMPTY_DRAFT);
              setAdding(true);
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            Adicionar canal
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {presets.isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : presets.isError ? (
          <div className="flex items-center gap-2 text-xs text-red-500">
            <span>Erro ao carregar canais: {errMsg(presets.error)}</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[10px] gap-1"
              onClick={() => presets.refetch()}
            >
              <RefreshCw className="h-3 w-3" /> Tentar de novo
            </Button>
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Label</TableHead>
                  <TableHead>utm_medium</TableHead>
                  <TableHead>utm_source</TableHead>
                  <TableHead className="w-[90px] text-center">Ativo</TableHead>
                  {canEdit && <TableHead className="w-[90px] text-right">Ações</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.length === 0 && !adding ? (
                  <TableRow>
                    <TableCell
                      colSpan={canEdit ? 5 : 4}
                      className="text-center text-sm text-muted-foreground py-6"
                    >
                      Nenhum canal configurado ainda.
                    </TableCell>
                  </TableRow>
                ) : (
                  list.map((p) =>
                    editingId === p.id ? (
                      <TableRow key={p.id}>
                        <TableCell>
                          <Input
                            className="h-8 text-xs"
                            value={editDraft.label}
                            onChange={(e) =>
                              setEditDraft((d) => ({ ...d, label: e.target.value }))
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            className="h-8 text-xs"
                            value={editDraft.utmMedium}
                            onChange={(e) =>
                              setEditDraft((d) => ({ ...d, utmMedium: e.target.value }))
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            className="h-8 text-xs"
                            value={editDraft.utmSource}
                            onChange={(e) =>
                              setEditDraft((d) => ({ ...d, utmSource: e.target.value }))
                            }
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="text-xs text-muted-foreground">—</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={handleSaveEdit}
                              disabled={updatePreset.isPending}
                              aria-label="Salvar"
                            >
                              {updatePreset.isPending ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Check className="h-3.5 w-3.5" />
                              )}
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={cancelEdit}
                              aria-label="Cancelar"
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium text-sm">{p.label}</TableCell>
                        <TableCell>
                          <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                            {p.utmMedium}
                          </code>
                        </TableCell>
                        <TableCell>
                          <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                            {p.utmSource}
                          </code>
                        </TableCell>
                        <TableCell className="text-center">
                          <Switch
                            checked={p.enabled}
                            onCheckedChange={(v) => handleToggle(p, v)}
                            disabled={!canEdit || updatePreset.isPending}
                            aria-label={`Canal ${p.label} ativo`}
                          />
                        </TableCell>
                        {canEdit && (
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7"
                                onClick={() => startEdit(p)}
                                aria-label="Editar canal"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                onClick={() => setDeleteTarget(p)}
                                aria-label="Remover canal"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ),
                  )
                )}

                {adding && (
                  <TableRow>
                    <TableCell>
                      <Input
                        autoFocus
                        className="h-8 text-xs"
                        placeholder="label"
                        value={addDraft.label}
                        onChange={(e) =>
                          setAddDraft((d) => ({ ...d, label: e.target.value }))
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-8 text-xs"
                        placeholder="utm_medium"
                        value={addDraft.utmMedium}
                        onChange={(e) =>
                          setAddDraft((d) => ({ ...d, utmMedium: e.target.value }))
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-8 text-xs"
                        placeholder="utm_source"
                        value={addDraft.utmSource}
                        onChange={(e) =>
                          setAddDraft((d) => ({ ...d, utmSource: e.target.value }))
                        }
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="text-xs text-muted-foreground">—</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={handleCreate}
                          disabled={createPreset.isPending}
                          aria-label="Salvar novo canal"
                        >
                          {createPreset.isPending ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Check className="h-3.5 w-3.5" />
                          )}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => {
                            setAdding(false);
                            setAddDraft(EMPTY_DRAFT);
                          }}
                          aria-label="Cancelar novo canal"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover canal?</AlertDialogTitle>
            <AlertDialogDescription>
              O canal <strong>{deleteTarget?.label}</strong> será removido dos presets
              deste projeto.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletePreset.isPending ? "Removendo..." : "Remover"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
