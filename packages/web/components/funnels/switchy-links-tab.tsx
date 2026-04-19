"use client";

import { useState, useMemo } from "react";
import {
  ExternalLink,
  MousePointerClick,
  FolderOpen,
  Search,
  Link2,
  Globe,
  Tag,
  ChevronDown,
  ChevronRight,
  Settings2,
  Check,
  Layers,
  Save,
  Plus,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  useSwitchyFolders,
  useSwitchyLinks,
  type SwitchyLink,
  type SwitchyFolder,
} from "@/lib/hooks/use-switchy";
import { useUpdateFunnel } from "@/lib/hooks/use-funnels";
import type { Funnel } from "@loyola-x/shared";

// ============================================================
// HELPERS
// ============================================================

function formatClicks(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function shortUrl(link: SwitchyLink): string {
  return `${link.domain}/${link.id}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getBaseUrl(url: string | null): string {
  if (!url) return "(sem URL)";
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return url.split("?")[0];
  }
}

function extractUtmParams(url: string | null): Record<string, string> {
  if (!url) return {};
  try {
    const u = new URL(url);
    const utms: Record<string, string> = {};
    for (const [key, value] of u.searchParams) {
      if (key.startsWith("utm_") || key === "sck" || key === "vk_source") {
        utms[key] = value;
      }
    }
    return utms;
  } catch {
    return {};
  }
}

interface PageGroup {
  baseUrl: string;
  totalClicks: number;
  links: SwitchyLink[];
}

function groupByPage(links: SwitchyLink[]): PageGroup[] {
  const map = new Map<string, SwitchyLink[]>();
  for (const link of links) {
    const base = getBaseUrl(link.url);
    const arr = map.get(base) ?? [];
    arr.push(link);
    map.set(base, arr);
  }
  return Array.from(map.entries())
    .map(([baseUrl, links]) => ({
      baseUrl,
      totalClicks: links.reduce((sum, l) => sum + (l.clicks ?? 0), 0),
      links: links.sort((a, b) => (b.clicks ?? 0) - (a.clicks ?? 0)),
    }))
    .sort((a, b) => b.totalClicks - a.totalClicks);
}

// ============================================================
// FOLDER PICKER DIALOG
// ============================================================

function FolderPickerDialog({
  allFolders,
  selectedFolders,
  onSave,
}: {
  allFolders: SwitchyFolder[];
  selectedFolders: { id: number; name: string }[];
  onSave: (folders: { id: number; name: string }[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Map<number, string>>(
    () => new Map(selectedFolders.map((f) => [f.id, f.name])),
  );
  const [folderSearch, setFolderSearch] = useState("");

  const filteredFolders = useMemo(() => {
    if (!folderSearch.trim()) return allFolders;
    const q = folderSearch.toLowerCase();
    return allFolders.filter((f) => f.name.toLowerCase().includes(q));
  }, [allFolders, folderSearch]);

  function toggle(folder: SwitchyFolder) {
    setPicked((prev) => {
      const next = new Map(prev);
      if (next.has(folder.id)) {
        next.delete(folder.id);
      } else {
        next.set(folder.id, folder.name);
      }
      return next;
    });
  }

  function handleSave() {
    onSave(Array.from(picked.entries()).map(([id, name]) => ({ id, name })));
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) { setPicked(new Map(selectedFolders.map((f) => [f.id, f.name]))); setFolderSearch(""); } }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Settings2 className="h-3.5 w-3.5" />
          {selectedFolders.length === 0
            ? "Configurar Folders"
            : `${selectedFolders.length} folder${selectedFolders.length > 1 ? "s" : ""}`}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Selecionar Folders do Funil</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar folder..."
              value={folderSearch}
              onChange={(e) => setFolderSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="max-h-[300px] overflow-y-auto space-y-1 border rounded-md p-2">
            {filteredFolders.map((f) => {
              const selected = picked.has(f.id);
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => toggle(f)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left transition-colors ${
                    selected
                      ? "bg-primary/10 text-primary"
                      : "hover:bg-muted"
                  }`}
                >
                  <div
                    className={`h-4 w-4 rounded border flex items-center justify-center ${
                      selected ? "bg-primary border-primary" : "border-muted-foreground/30"
                    }`}
                  >
                    {selected && <Check className="h-3 w-3 text-primary-foreground" />}
                  </div>
                  <FolderOpen className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="truncate">{f.name}</span>
                </button>
              );
            })}
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground">
              {picked.size} selecionada{picked.size !== 1 ? "s" : ""}
            </span>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button size="sm" onClick={handleSave}>
                Salvar
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// LINK ROW (flat)
// ============================================================

function LinkRow({
  link,
  selecting,
  picked,
  onToggle,
}: {
  link: SwitchyLink;
  selecting: boolean;
  picked: boolean;
  onToggle: () => void;
}) {
  return (
    <TableRow
      className={selecting ? "cursor-pointer" : undefined}
      onClick={selecting ? onToggle : undefined}
    >
      {selecting && (
        <TableCell>
          <div
            className={`h-4 w-4 rounded border flex items-center justify-center ${
              picked ? "bg-primary border-primary" : "border-muted-foreground/30"
            }`}
          >
            {picked && <Check className="h-3 w-3 text-primary-foreground" />}
          </div>
        </TableCell>
      )}
      <TableCell>
        {link.favicon ? (
          <img
            src={link.favicon}
            alt=""
            className="h-5 w-5 rounded"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <Globe className="h-4 w-4 text-muted-foreground" />
        )}
      </TableCell>
      <TableCell>
        <div className="max-w-[250px]">
          <p className="font-medium text-sm truncate">
            {link.title || link.id}
          </p>
          <p className="text-xs text-muted-foreground truncate">{link.url}</p>
        </div>
      </TableCell>
      <TableCell>
        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
          {shortUrl(link)}
        </code>
      </TableCell>
      <TableCell className="text-right">
        <span className="font-semibold tabular-nums">
          {formatClicks(link.clicks)}
        </span>
      </TableCell>
      <TableCell>
        <span className="text-xs text-muted-foreground">
          {link.note || "—"}
        </span>
      </TableCell>
      <TableCell>
        <div className="flex gap-1 flex-wrap">
          {link.pixels?.map((p) => (
            <Badge key={p.id} variant="outline" className="text-[10px]">
              <Tag className="h-2.5 w-2.5 mr-0.5" />
              {p.platform}
            </Badge>
          ))}
          {(!link.pixels || link.pixels.length === 0) && (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </div>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {formatDate(link.createdDate)}
      </TableCell>
      <TableCell>
        <a
          href={`https://${shortUrl(link)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-foreground transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink className="h-4 w-4" />
        </a>
      </TableCell>
    </TableRow>
  );
}

// ============================================================
// GROUPED ROW
// ============================================================

function GroupedRow({
  group,
  selecting,
  allPicked,
  onToggleGroup,
}: {
  group: PageGroup;
  selecting: boolean;
  allPicked: boolean;
  onToggleGroup: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const firstFavicon = group.links.find((l) => l.favicon)?.favicon;

  return (
    <>
      <TableRow
        className="cursor-pointer hover:bg-muted/50"
        onClick={selecting ? onToggleGroup : () => setExpanded(!expanded)}
      >
        {selecting && (
          <TableCell>
            <div
              className={`h-4 w-4 rounded border flex items-center justify-center ${
                allPicked ? "bg-primary border-primary" : "border-muted-foreground/30"
              }`}
            >
              {allPicked && <Check className="h-3 w-3 text-primary-foreground" />}
            </div>
          </TableCell>
        )}
        <TableCell>
          {!selecting ? (
            expanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )
          ) : (
            firstFavicon ? (
              <img
                src={firstFavicon}
                alt=""
                className="h-5 w-5 rounded"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            ) : (
              <Globe className="h-4 w-4 text-muted-foreground" />
            )
          )}
        </TableCell>
        <TableCell colSpan={2}>
          <div className="flex items-center gap-2">
            {!selecting && (
              firstFavicon ? (
                <img
                  src={firstFavicon}
                  alt=""
                  className="h-5 w-5 rounded flex-shrink-0"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              ) : (
                <Globe className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              )
            )}
            <div className="min-w-0">
              <p className="font-medium text-sm truncate">{group.baseUrl}</p>
              <p className="text-xs text-muted-foreground">
                {group.links.length} link{group.links.length > 1 ? "s" : ""}
              </p>
            </div>
          </div>
        </TableCell>
        <TableCell className="text-right">
          <span className="font-semibold tabular-nums text-base">
            {formatClicks(group.totalClicks)}
          </span>
        </TableCell>
        <TableCell colSpan={4} />
      </TableRow>
      {expanded &&
        !selecting &&
        group.links.map((link) => {
          const utms = extractUtmParams(link.url);
          const utmKeys = Object.keys(utms);
          return (
            <TableRow key={link.uniq} className="bg-muted/30">
              <TableCell>
                {link.favicon ? (
                  <img
                    src={link.favicon}
                    alt=""
                    className="h-5 w-5 rounded"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : (
                  <Globe className="h-4 w-4 text-muted-foreground" />
                )}
              </TableCell>
              <TableCell>
                <div className="max-w-[250px] pl-4">
                  <p className="text-sm truncate">{link.title || link.id}</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {utmKeys.map((key) => (
                      <Badge
                        key={key}
                        variant="secondary"
                        className="text-[10px] font-normal"
                      >
                        {key.replace("utm_", "")}={utms[key]}
                      </Badge>
                    ))}
                    {utmKeys.length === 0 && (
                      <span className="text-[10px] text-muted-foreground">sem UTMs</span>
                    )}
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                  {shortUrl(link)}
                </code>
              </TableCell>
              <TableCell className="text-right">
                <span className="font-semibold tabular-nums">
                  {formatClicks(link.clicks)}
                </span>
              </TableCell>
              <TableCell>
                <span className="text-xs text-muted-foreground">
                  {link.note || "—"}
                </span>
              </TableCell>
              <TableCell>
                <div className="flex gap-1 flex-wrap">
                  {link.pixels?.map((p) => (
                    <Badge key={p.id} variant="outline" className="text-[10px]">
                      <Tag className="h-2.5 w-2.5 mr-0.5" />
                      {p.platform}
                    </Badge>
                  ))}
                  {(!link.pixels || link.pixels.length === 0) && (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {formatDate(link.createdDate)}
              </TableCell>
              <TableCell>
                <a
                  href={`https://${shortUrl(link)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </TableCell>
            </TableRow>
          );
        })}
    </>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

interface SwitchyLinksTabProps {
  projectId: string;
  funnel: Funnel;
}

export function SwitchyLinksTab({ projectId, funnel }: SwitchyLinksTabProps) {
  const savedLinks = funnel.switchyLinkedLinks ?? [];
  const savedFolders = funnel.switchyFolderIds ?? [];
  const hasSavedFolders = savedFolders.length > 0;
  const hasLinkedLinks = savedLinks.length > 0;

  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(
    funnel.switchyFolderIds?.[0]?.id ?? null,
  );
  const [search, setSearch] = useState("");
  const [grouped, setGrouped] = useState(true);
  const [selecting, setSelecting] = useState(false);
  const [pickedUniqs, setPickedUniqs] = useState<Set<number>>(
    () => new Set(savedLinks.map((l) => l.uniq)),
  );

  const { data: allFolders, isLoading: foldersLoading } =
    useSwitchyFolders(projectId);
  const { data: links, isLoading: linksLoading } = useSwitchyLinks(
    projectId,
    selectedFolderId,
  );
  const updateFunnel = useUpdateFunnel(projectId, funnel.id);

  const linkedSet = useMemo(() => new Set(savedLinks.map((l) => l.uniq)), [savedLinks]);

  const visibleFolders = useMemo(() => {
    if (!allFolders) return [];
    if (!hasSavedFolders) return allFolders;
    const savedIds = new Set(savedFolders.map((f) => f.id));
    return allFolders.filter((f) => savedIds.has(f.id));
  }, [allFolders, savedFolders, hasSavedFolders]);

  // When selecting, show all links. Otherwise show only linked.
  const filtered = useMemo(() => {
    if (!links) return [];
    let result = links;
    if (!selecting && hasLinkedLinks) {
      result = result.filter((l) => linkedSet.has(l.uniq));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (l) =>
          l.title?.toLowerCase().includes(q) ||
          l.id.toLowerCase().includes(q) ||
          l.url?.toLowerCase().includes(q) ||
          l.note?.toLowerCase().includes(q),
      );
    }
    return result;
  }, [links, search, selecting, hasLinkedLinks, linkedSet]);

  const groups = useMemo(() => groupByPage(filtered), [filtered]);

  const totalClicks = useMemo(
    () => filtered.reduce((sum, l) => sum + (l.clicks ?? 0), 0),
    [filtered],
  );

  function togglePickGroup(group: PageGroup) {
    setPickedUniqs((prev) => {
      const next = new Set(prev);
      const allIn = group.links.every((l) => next.has(l.uniq));
      if (allIn) {
        group.links.forEach((l) => next.delete(l.uniq));
      } else {
        group.links.forEach((l) => next.add(l.uniq));
      }
      return next;
    });
  }

  function togglePickLink(link: SwitchyLink) {
    setPickedUniqs((prev) => {
      const next = new Set(prev);
      if (next.has(link.uniq)) next.delete(link.uniq);
      else next.add(link.uniq);
      return next;
    });
  }

  function handleSaveLinks() {
    if (!links) return;
    const selected = links
      .filter((l) => pickedUniqs.has(l.uniq))
      .map((l) => ({ uniq: l.uniq, id: l.id, domain: l.domain }));
    const existing = savedLinks.filter((l) => !links.some((ll) => ll.uniq === l.uniq));
    updateFunnel.mutate({ switchyLinkedLinks: [...existing, ...selected] });
    setSelecting(false);
  }

  function handleCancelSelect() {
    setPickedUniqs(new Set(savedLinks.map((l) => l.uniq)));
    setSelecting(false);
  }

  function handleSaveFolders(folders: { id: number; name: string }[]) {
    updateFunnel.mutate({ switchyFolderIds: folders });
    if (folders.length > 0 && !folders.some((f) => f.id === selectedFolderId)) {
      setSelectedFolderId(folders[0].id);
    }
  }

  if (foldersLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        {selecting && (
          <Select
            value={selectedFolderId ? String(selectedFolderId) : "all"}
            onValueChange={(v) =>
              setSelectedFolderId(v === "all" ? null : Number(v))
            }
          >
            <SelectTrigger className="w-full sm:w-[300px]">
              <FolderOpen className="h-4 w-4 mr-2 text-muted-foreground" />
              <SelectValue placeholder="Selecionar folder" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os links</SelectItem>
              {visibleFolders.map((f) => (
                <SelectItem key={f.id} value={String(f.id)}>
                  {f.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por titulo, slug ou URL..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Switch
              id="group-toggle"
              checked={grouped}
              onCheckedChange={setGrouped}
            />
            <Label htmlFor="group-toggle" className="text-sm whitespace-nowrap cursor-pointer">
              <Layers className="h-3.5 w-3.5 inline mr-1" />
              Agrupar
            </Label>
          </div>

          {selecting ? (
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={handleSaveLinks} className="gap-1.5">
                <Save className="h-3.5 w-3.5" />
                Salvar ({pickedUniqs.size})
              </Button>
              <Button size="sm" variant="ghost" onClick={handleCancelSelect}>
                Cancelar
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => { setSelecting(true); setPickedUniqs(new Set(savedLinks.map((l) => l.uniq))); }}
            >
              <Plus className="h-3.5 w-3.5" />
              Vincular Links
            </Button>
          )}

          {allFolders && !selecting && (
            <FolderPickerDialog
              allFolders={allFolders}
              selectedFolders={savedFolders}
              onSave={handleSaveFolders}
            />
          )}
        </div>
      </div>

      {/* Summary cards — always based on linked data */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {grouped ? "Paginas" : "Links Vinculados"}
            </CardTitle>
            <Link2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {selecting
                ? `${pickedUniqs.size} selecionados`
                : grouped
                  ? groups.length
                  : filtered.length}
            </div>
            {!selecting && grouped && (
              <p className="text-xs text-muted-foreground mt-1">
                {filtered.length} links no total
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total de Cliques
            </CardTitle>
            <MousePointerClick className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatClicks(totalClicks)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Folders
            </CardTitle>
            <FolderOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {hasSavedFolders ? savedFolders.length : 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1 truncate">
              {hasSavedFolders
                ? savedFolders.map((f) => f.name).join(", ")
                : "Configure folders"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      {linksLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Link2 className="h-10 w-10 mb-3" />
          <p>
            {search
              ? "Nenhum link encontrado para essa busca"
              : !selecting && hasLinkedLinks
                ? "Nenhum link vinculado nesta folder"
                : hasSavedFolders
                  ? selecting
                    ? "Selecione uma folder para ver os links"
                    : "Clique em Vincular Links para adicionar"
                  : "Configure as folders deste funil para comecar"}
          </p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                {selecting && <TableHead className="w-[40px]" />}
                <TableHead className="w-[40px]" />
                <TableHead>{grouped ? "Pagina / Link" : "Link"}</TableHead>
                <TableHead>URL Curta</TableHead>
                <TableHead className="text-right">Cliques</TableHead>
                <TableHead>Nota</TableHead>
                <TableHead>Pixels</TableHead>
                <TableHead>Criado em</TableHead>
                <TableHead className="w-[40px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {grouped
                ? groups.map((group) => (
                    <GroupedRow
                      key={group.baseUrl}
                      group={group}
                      selecting={selecting}
                      allPicked={group.links.every((l) => pickedUniqs.has(l.uniq))}
                      onToggleGroup={() => togglePickGroup(group)}
                    />
                  ))
                : filtered.map((link) => (
                    <LinkRow
                      key={link.uniq}
                      link={link}
                      selecting={selecting}
                      picked={pickedUniqs.has(link.uniq)}
                      onToggle={() => togglePickLink(link)}
                    />
                  ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
