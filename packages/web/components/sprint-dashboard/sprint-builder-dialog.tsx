"use client";

import { useEffect, useState, useMemo } from "react";
import { Plus, Trash2, ChevronDown, ChevronRight, Folder, FolderOpen, FileSpreadsheet, Search, Calendar } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  useClickUpHierarchy,
  useUpdateSprintDashboardConfig,
  useListStatuses,
} from "@/lib/hooks/use-sprint-dashboard";
import type { SprintDashboardBlock } from "@loyola-x/shared";

const DEFAULT_COLORS = [
  "#D4537E", "#D85A30", "#7F77DD", "#378ADD", "#1D9E75",
  "#888780", "#534AB7", "#85B7EB", "#0F6E56", "#993556",
];

interface BuilderProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentBlocks: SprintDashboardBlock[];
}

export function SprintBuilderDialog({ open, onOpenChange, currentBlocks }: BuilderProps) {
  const [blocks, setBlocks] = useState<SprintDashboardBlock[]>(currentBlocks);
  const { data: hierarchy, isLoading: hierarchyLoading } = useClickUpHierarchy(open);
  const save = useUpdateSprintDashboardConfig();

  useEffect(() => {
    if (open) setBlocks(currentBlocks);
  }, [open, currentBlocks]);

  function addBlock() {
    const nextColor = DEFAULT_COLORS[blocks.length % DEFAULT_COLORS.length];
    setBlocks((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        title: `Novo bloco ${prev.length + 1}`,
        subtitle: "",
        color: nextColor,
        clickupListIds: [],
        filters: {},
        groupBy: null,
        sortOrder: prev.length,
        campaignPhases: [],
      },
    ]);
  }

  function updateBlock(id: string, partial: Partial<SprintDashboardBlock>) {
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...partial } : b)));
  }

  function removeBlock(id: string) {
    setBlocks((prev) =>
      prev.filter((b) => b.id !== id).map((b, i) => ({ ...b, sortOrder: i })),
    );
  }

  function moveBlock(id: string, direction: -1 | 1) {
    setBlocks((prev) => {
      const idx = prev.findIndex((b) => b.id === id);
      if (idx < 0) return prev;
      const target = idx + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next.map((b, i) => ({ ...b, sortOrder: i }));
    });
  }

  function handleSave() {
    // Valida: cada bloco precisa de pelo menos 1 lista
    const empty = blocks.filter((b) => b.clickupListIds.length === 0);
    if (empty.length > 0) {
      toast.error(`${empty.length} bloco(s) sem lista do ClickUp selecionada`);
      return;
    }
    save.mutate(blocks, {
      onSuccess: () => {
        toast.success("Dashboard salvo!");
        onOpenChange(false);
      },
      onError: (err) =>
        toast.error(err instanceof Error ? err.message : "Erro ao salvar"),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[840px] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Configurar Sprint Dashboard</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-3 pr-2">
          {hierarchyLoading && (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-24" />
              ))}
            </div>
          )}

          {!hierarchyLoading && hierarchy && (
            <>
              {blocks.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border/40 p-6 text-center text-sm text-muted-foreground">
                  Nenhum bloco configurado. Clique em <strong>Adicionar bloco</strong> abaixo.
                </div>
              ) : (
                <div className="space-y-3">
                  {blocks.map((block, idx) => (
                    <BlockEditor
                      key={block.id}
                      block={block}
                      hierarchy={hierarchy}
                      isFirst={idx === 0}
                      isLast={idx === blocks.length - 1}
                      onChange={(partial) => updateBlock(block.id, partial)}
                      onRemove={() => removeBlock(block.id)}
                      onMoveUp={() => moveBlock(block.id, -1)}
                      onMoveDown={() => moveBlock(block.id, 1)}
                    />
                  ))}
                </div>
              )}

              <Button variant="outline" className="w-full gap-1.5" onClick={addBlock}>
                <Plus className="h-4 w-4" />
                Adicionar bloco
              </Button>
            </>
          )}
        </div>

        <DialogFooter className="border-t pt-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={save.isPending}>
            {save.isPending ? "Salvando..." : "Salvar dashboard"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// BlockEditor: editor de um único bloco
// ============================================================

interface BlockEditorProps {
  block: SprintDashboardBlock;
  hierarchy: NonNullable<ReturnType<typeof useClickUpHierarchy>["data"]>;
  isFirst: boolean;
  isLast: boolean;
  onChange: (partial: Partial<SprintDashboardBlock>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

function BlockEditor({ block, hierarchy, isFirst, isLast, onChange, onRemove, onMoveUp, onMoveDown }: BlockEditorProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showPhases, setShowPhases] = useState(false);

  return (
    <div className="rounded-lg border border-border/40 bg-card/40 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={block.color}
          onChange={(e) => onChange({ color: e.target.value })}
          className="w-6 h-6 rounded cursor-pointer border border-border/40"
          title="Cor do bloco"
        />
        <Input
          value={block.title}
          onChange={(e) => onChange({ title: e.target.value })}
          className="h-8 text-sm flex-1"
          placeholder="Nome do bloco"
        />
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="sm" onClick={onMoveUp} disabled={isFirst} className="h-7 w-7 p-0">
            ↑
          </Button>
          <Button variant="ghost" size="sm" onClick={onMoveDown} disabled={isLast} className="h-7 w-7 p-0">
            ↓
          </Button>
          <Button variant="ghost" size="sm" onClick={onRemove} className="h-7 w-7 p-0 text-red-500 hover:text-red-600">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <Input
        value={block.subtitle ?? ""}
        onChange={(e) => onChange({ subtitle: e.target.value })}
        className="h-7 text-xs"
        placeholder="Subtítulo (opcional, ex: 'Workshop churrasco gravado')"
      />

      {/* List picker summary */}
      <div className="flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <FileSpreadsheet className="h-3.5 w-3.5" />
          <span>
            {block.clickupListIds.length === 0
              ? "Nenhuma lista selecionada"
              : `${block.clickupListIds.length} lista(s) do ClickUp`}
          </span>
        </div>
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setShowPicker((v) => !v)}>
          {showPicker ? "Ocultar listas" : "Selecionar listas"}
        </Button>
      </div>

      {showPicker && (
        <ListPicker
          hierarchy={hierarchy}
          selected={block.clickupListIds}
          onChange={(ids) => onChange({ clickupListIds: ids })}
        />
      )}

      {/* Filters + groupBy */}
      <div className="flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          {(block.filters.statuses?.length ?? 0) +
            (block.filters.tags?.length ?? 0) +
            (block.filters.assigneeIds?.length ?? 0) >
          0 ? (
            <span className="text-emerald-500">
              Filtros: {(block.filters.statuses?.length ?? 0)} status · {(block.filters.tags?.length ?? 0)} tags · {(block.filters.assigneeIds?.length ?? 0)} pessoas
            </span>
          ) : (
            <span>Sem filtros</span>
          )}
        </div>
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setShowFilters((v) => !v)}>
          {showFilters ? "Ocultar filtros" : "Filtros + agrupamento"}
        </Button>
      </div>

      {showFilters && (
        <FilterEditor block={block} onChange={onChange} />
      )}

      {/* Fases da campanha (pra view Calendário Macro) */}
      <div className="flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Calendar className="h-3.5 w-3.5" />
          <span>
            {(block.campaignPhases?.length ?? 0) === 0
              ? "Sem fases de campanha"
              : `${block.campaignPhases!.length} fase(s) de campanha`}
          </span>
        </div>
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setShowPhases((v) => !v)}>
          {showPhases ? "Ocultar fases" : "Configurar fases da campanha"}
        </Button>
      </div>

      {showPhases && (
        <PhasesEditor block={block} onChange={onChange} />
      )}
    </div>
  );
}

// ============================================================
// PhasesEditor: lista de fases (label + start + end + cor)
// ============================================================

function PhasesEditor({
  block,
  onChange,
}: {
  block: SprintDashboardBlock;
  onChange: (partial: Partial<SprintDashboardBlock>) => void;
}) {
  const phases = block.campaignPhases ?? [];

  function updatePhase(id: string, partial: Partial<typeof phases[number]>) {
    onChange({
      campaignPhases: phases.map((p) => (p.id === id ? { ...p, ...partial } : p)),
    });
  }

  function addPhase() {
    onChange({
      campaignPhases: [
        ...phases,
        {
          id: crypto.randomUUID(),
          label: "",
          startDate: "",
          endDate: "",
        },
      ],
    });
  }

  function removePhase(id: string) {
    onChange({ campaignPhases: phases.filter((p) => p.id !== id) });
  }

  function movePhase(id: string, dir: -1 | 1) {
    const idx = phases.findIndex((p) => p.id === id);
    if (idx < 0) return;
    const target = idx + dir;
    if (target < 0 || target >= phases.length) return;
    const next = [...phases];
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange({ campaignPhases: next });
  }

  return (
    <div className="rounded-md border border-border/40 bg-background p-3 space-y-2 text-xs">
      <p className="text-[10px] text-muted-foreground">
        Fases mostradas no <strong>Calendário Macro</strong>. Use formato YYYY-MM-DD ou descritivo ("a definir", "após 01/jun"). Fim é opcional (eventos pontuais).
      </p>
      {phases.length === 0 ? (
        <p className="text-[11px] text-muted-foreground italic py-2 text-center">
          Sem fases configuradas.
        </p>
      ) : (
        <div className="space-y-1">
          {phases.map((phase, idx) => (
            <div key={phase.id} className="flex items-center gap-1">
              <Input
                value={phase.label}
                onChange={(e) => updatePhase(phase.id, { label: e.target.value })}
                placeholder="Ex: Lote 1"
                className="h-7 text-[11px] flex-1"
              />
              <Input
                type="date"
                value={isIsoDate(phase.startDate) ? phase.startDate : ""}
                onChange={(e) => updatePhase(phase.id, { startDate: e.target.value })}
                placeholder="Início"
                className="h-7 text-[11px] w-32"
              />
              <Input
                type="date"
                value={isIsoDate(phase.endDate ?? "") ? phase.endDate : ""}
                onChange={(e) => updatePhase(phase.id, { endDate: e.target.value })}
                placeholder="Fim (opcional)"
                className="h-7 text-[11px] w-32"
              />
              <Button variant="ghost" size="sm" onClick={() => movePhase(phase.id, -1)} disabled={idx === 0} className="h-6 w-6 p-0">↑</Button>
              <Button variant="ghost" size="sm" onClick={() => movePhase(phase.id, 1)} disabled={idx === phases.length - 1} className="h-6 w-6 p-0">↓</Button>
              <Button variant="ghost" size="sm" onClick={() => removePhase(phase.id)} className="h-6 w-6 p-0 text-red-500">
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
      <Button variant="outline" size="sm" onClick={addPhase} className="w-full h-7 text-[11px] gap-1">
        <Plus className="h-3 w-3" /> Adicionar fase
      </Button>
    </div>
  );
}

function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

// ============================================================
// ListPicker: tree de spaces → folders → lists
// ============================================================

interface ListPickerProps {
  hierarchy: NonNullable<ReturnType<typeof useClickUpHierarchy>["data"]>;
  selected: string[];
  onChange: (ids: string[]) => void;
}

function ListPicker({ hierarchy, selected, onChange }: ListPickerProps) {
  const [search, setSearch] = useState("");
  const [openSpaces, setOpenSpaces] = useState<Set<string>>(new Set());
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set());
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  function toggleSet(set: Set<string>, key: string): Set<string> {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  }

  function toggleList(listId: string) {
    if (selectedSet.has(listId)) {
      onChange(selected.filter((id) => id !== listId));
    } else {
      onChange([...selected, listId]);
    }
  }

  // Estado de seleção do folder: 'all' / 'some' / 'none'
  function folderSelectionState(listIds: string[]): "all" | "some" | "none" {
    if (listIds.length === 0) return "none";
    const selectedCount = listIds.filter((id) => selectedSet.has(id)).length;
    if (selectedCount === 0) return "none";
    if (selectedCount === listIds.length) return "all";
    return "some";
  }

  // Toggle folder: se 'all' → desmarca todas. Senão → marca todas.
  function toggleFolder(listIds: string[]) {
    const state = folderSelectionState(listIds);
    if (state === "all") {
      const idsToRemove = new Set(listIds);
      onChange(selected.filter((id) => !idsToRemove.has(id)));
    } else {
      const merged = new Set(selected);
      for (const id of listIds) merged.add(id);
      onChange(Array.from(merged));
    }
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return hierarchy.spaces;
    const q = search.trim().toLowerCase();
    return hierarchy.spaces
      .map((space) => ({
        ...space,
        folders: space.folders
          .map((folder) => ({
            ...folder,
            lists: folder.lists.filter((l) => l.name.toLowerCase().includes(q)),
          }))
          .filter((f) => f.lists.length > 0 || f.name.toLowerCase().includes(q)),
        folderlessLists: space.folderlessLists.filter((l) =>
          l.name.toLowerCase().includes(q),
        ),
      }))
      .filter(
        (s) =>
          s.folders.length > 0 ||
          s.folderlessLists.length > 0 ||
          s.name.toLowerCase().includes(q),
      );
  }, [search, hierarchy]);

  return (
    <div className="rounded-md border border-border/40 bg-background p-2 space-y-2 max-h-[280px] overflow-y-auto">
      <div className="relative">
        <Search className="absolute left-2 top-1.5 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="Buscar listas/folders..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-7 h-7 text-xs"
        />
      </div>

      <div className="text-[10px] text-muted-foreground">
        {selected.length} lista(s) selecionada(s)
      </div>

      <div className="space-y-0.5">
        {filtered.map((space) => {
          const spaceOpen = openSpaces.has(space.id) || !!search.trim();
          return (
            <div key={space.id}>
              <button
                onClick={() => setOpenSpaces(toggleSet(openSpaces, space.id))}
                className="w-full flex items-center gap-1 px-1 py-0.5 hover:bg-muted/40 rounded text-xs font-semibold"
              >
                {spaceOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                <span>{space.name}</span>
              </button>
              {spaceOpen && (
                <div className="pl-4 space-y-0.5">
                  {space.folders.map((folder) => {
                    const folderOpen = openFolders.has(folder.id) || !!search.trim();
                    const folderListIds = folder.lists.map((l) => l.id);
                    const folderState = folderSelectionState(folderListIds);
                    const folderHasLists = folderListIds.length > 0;
                    return (
                      <div key={folder.id}>
                        <div className="flex items-center gap-1 px-1 py-0.5 hover:bg-muted/40 rounded text-xs group">
                          {folderHasLists && (
                            <input
                              type="checkbox"
                              checked={folderState === "all"}
                              ref={(el) => {
                                if (el) el.indeterminate = folderState === "some";
                              }}
                              onChange={() => toggleFolder(folderListIds)}
                              className="cursor-pointer shrink-0"
                              title={
                                folderState === "all"
                                  ? "Desmarcar todas as listas do folder"
                                  : "Marcar todas as listas do folder"
                              }
                            />
                          )}
                          <button
                            onClick={() => setOpenFolders(toggleSet(openFolders, folder.id))}
                            className="flex items-center gap-1 flex-1 min-w-0 text-left"
                          >
                            {folderOpen ? (
                              <FolderOpen className="h-3 w-3 text-amber-500 shrink-0" />
                            ) : (
                              <Folder className="h-3 w-3 text-amber-500 shrink-0" />
                            )}
                            <span className="truncate">{folder.name}</span>
                            {folderHasLists && (
                              <span className="text-[9px] text-muted-foreground/70 ml-auto pl-1">
                                {folderListIds.filter((id) => selectedSet.has(id)).length}/
                                {folderListIds.length}
                              </span>
                            )}
                          </button>
                        </div>
                        {folderOpen && (
                          <div className="pl-7 space-y-0.5">
                            {folder.lists.map((list) => (
                              <label
                                key={list.id}
                                className="flex items-center gap-2 px-1 py-0.5 hover:bg-muted/40 rounded text-[11px] cursor-pointer"
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedSet.has(list.id)}
                                  onChange={() => toggleList(list.id)}
                                  className="cursor-pointer"
                                />
                                <span className="truncate">{list.name}</span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {space.folderlessLists.map((list) => (
                    <label
                      key={list.id}
                      className="flex items-center gap-2 px-1 py-0.5 pl-5 hover:bg-muted/40 rounded text-[11px] cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedSet.has(list.id)}
                        onChange={() => toggleList(list.id)}
                        className="cursor-pointer"
                      />
                      <span className="truncate">{list.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// FilterEditor: status / tags / assignees + groupBy
// ============================================================

interface FilterEditorProps {
  block: SprintDashboardBlock;
  onChange: (partial: Partial<SprintDashboardBlock>) => void;
}

function FilterEditor({ block, onChange }: FilterEditorProps) {
  // Carrega statuses da primeira lista do bloco (assume mesma config entre listas relacionadas)
  const firstListId = block.clickupListIds[0] ?? null;
  const { data: statusesData } = useListStatuses(firstListId);
  const availableStatuses = statusesData?.statuses ?? [];

  const [tagInput, setTagInput] = useState("");
  const [assigneeInput, setAssigneeInput] = useState("");

  function toggleStatus(s: string) {
    const cur = new Set(block.filters.statuses ?? []);
    if (cur.has(s)) cur.delete(s);
    else cur.add(s);
    onChange({ filters: { ...block.filters, statuses: Array.from(cur) } });
  }

  function addTag() {
    const t = tagInput.trim();
    if (!t) return;
    const cur = new Set(block.filters.tags ?? []);
    cur.add(t);
    onChange({ filters: { ...block.filters, tags: Array.from(cur) } });
    setTagInput("");
  }

  function removeTag(t: string) {
    onChange({
      filters: { ...block.filters, tags: (block.filters.tags ?? []).filter((x) => x !== t) },
    });
  }

  function addAssignee() {
    const id = assigneeInput.trim();
    if (!id) return;
    const cur = new Set(block.filters.assigneeIds ?? []);
    cur.add(id);
    onChange({ filters: { ...block.filters, assigneeIds: Array.from(cur) } });
    setAssigneeInput("");
  }

  function removeAssignee(id: string) {
    onChange({
      filters: {
        ...block.filters,
        assigneeIds: (block.filters.assigneeIds ?? []).filter((x) => x !== id),
      },
    });
  }

  return (
    <div className="rounded-md border border-border/40 bg-background p-3 space-y-3 text-xs">
      {/* Status */}
      <div className="space-y-1">
        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Filtrar por status</Label>
        {firstListId ? (
          availableStatuses.length === 0 ? (
            <p className="text-[10px] text-muted-foreground">Carregando statuses...</p>
          ) : (
            <div className="flex flex-wrap gap-1">
              {availableStatuses.map((s) => {
                const active = (block.filters.statuses ?? []).includes(s.status);
                return (
                  <button
                    key={s.status}
                    onClick={() => toggleStatus(s.status)}
                    className="text-[10px] px-2 py-0.5 rounded border transition-colors"
                    style={{
                      background: active ? `${s.color}33` : "transparent",
                      borderColor: active ? s.color : "rgba(128,128,128,0.3)",
                      color: active ? s.color : undefined,
                    }}
                  >
                    {s.status}
                  </button>
                );
              })}
            </div>
          )
        ) : (
          <p className="text-[10px] text-muted-foreground">Selecione listas primeiro pra ver os statuses disponíveis.</p>
        )}
      </div>

      {/* Tags */}
      <div className="space-y-1">
        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Tags</Label>
        <div className="flex gap-1">
          <Input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
            placeholder="Adicionar tag..."
            className="h-7 text-[11px]"
          />
          <Button size="sm" variant="outline" onClick={addTag} className="h-7 text-[10px]">
            +
          </Button>
        </div>
        {block.filters.tags && block.filters.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {block.filters.tags.map((t) => (
              <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-muted/40 flex items-center gap-1">
                {t}
                <button onClick={() => removeTag(t)} className="text-red-400 hover:text-red-600">
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Assignee IDs */}
      <div className="space-y-1">
        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Responsáveis (IDs do ClickUp)
        </Label>
        <div className="flex gap-1">
          <Input
            value={assigneeInput}
            onChange={(e) => setAssigneeInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addAssignee())}
            placeholder="ID numérico..."
            className="h-7 text-[11px]"
          />
          <Button size="sm" variant="outline" onClick={addAssignee} className="h-7 text-[10px]">
            +
          </Button>
        </div>
        {block.filters.assigneeIds && block.filters.assigneeIds.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {block.filters.assigneeIds.map((id) => (
              <span key={id} className="text-[10px] px-1.5 py-0.5 rounded bg-muted/40 flex items-center gap-1">
                {id}
                <button onClick={() => removeAssignee(id)} className="text-red-400 hover:text-red-600">
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Group by */}
      <div className="space-y-1">
        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Agrupar tarefas por</Label>
        <Select
          value={block.groupBy ?? "__none__"}
          onValueChange={(v) =>
            onChange({ groupBy: v === "__none__" ? null : (v as "status" | "tag" | "assignee") })
          }
        >
          <SelectTrigger className="h-7 text-[11px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">Sem agrupamento</SelectItem>
            <SelectItem value="status">Status</SelectItem>
            <SelectItem value="tag">Tag</SelectItem>
            <SelectItem value="assignee">Responsável</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
