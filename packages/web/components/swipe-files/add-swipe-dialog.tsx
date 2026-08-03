"use client";

/**
 * Swipe Files — adicionar referência.
 *
 * Dois caminhos no mesmo diálogo, porque é assim que o time trabalha: ou arrasta
 * o print/vídeo que já tem, ou cola o link do anúncio. Colar o link busca o
 * preview e PRÉ-PREENCHE o título — a fricção de catalogar é o que faz biblioteca
 * de referência morrer, então o formulário adivinha o que dá.
 */

import { useCallback, useRef, useState } from "react";
import { Upload, Link2, Loader2, X, ImageIcon, Film } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  useCreateSwipeFile, useLinkPreview, useUploadToBucket, readMediaDimensions,
  type AssetKind, type LinkPreview, type SwipeFacets,
} from "@/lib/hooks/use-swipe-files";

const MAX_BYTES = 200 * 1024 * 1024;

/** Sugestões que aparecem como chip — o time clica em vez de digitar. */
const PLATAFORMAS = ["Meta", "Google", "TikTok", "YouTube", "Kwai", "Outro"];
const FORMATOS = ["Reel", "Feed", "Story", "Carrossel", "VSL", "Landing page", "E-mail", "Criativo estático"];

function fmtBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.round(n / 1024)} KB`;
}

/** Campo com sugestões clicáveis + digitação livre (o time inventa categoria nova toda semana). */
function CampoComSugestoes({
  id,
  label,
  value,
  onChange,
  sugestoes,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  sugestoes: string[];
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      {sugestoes.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {sugestoes.slice(0, 8).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onChange(value === s ? "" : s)}
              className={`rounded-full border px-2 py-0.5 text-[10px] transition-colors ${
                value === s
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border/50 text-muted-foreground hover:bg-muted"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function AddSwipeDialog({
  open,
  onOpenChange,
  facets,
  storageReady,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  facets: SwipeFacets;
  storageReady: boolean;
}) {
  const createSwipe = useCreateSwipeFile();
  const upload = useUploadToBucket();
  const linkPreview = useLinkPreview();
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [dims, setDims] = useState<{ width: number; height: number } | null>(null);
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);

  const [sourceUrl, setSourceUrl] = useState("");
  const [preview, setPreview] = useState<LinkPreview | null>(null);

  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [brand, setBrand] = useState("");
  const [niche, setNiche] = useState("");
  const [platform, setPlatform] = useState("");
  const [format, setFormat] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);

  function reset() {
    setFile(null);
    if (localPreview) URL.revokeObjectURL(localPreview);
    setLocalPreview(null);
    setDims(null);
    setProgress(0);
    setSourceUrl("");
    setPreview(null);
    setTitle("");
    setNotes("");
    setBrand("");
    setNiche("");
    setPlatform("");
    setFormat("");
    setTagInput("");
    setTags([]);
  }

  const aceitarArquivo = useCallback(
    async (f: File) => {
      if (!storageReady) {
        toast.error("Upload indisponível: bucket não configurado. Use um link por enquanto.");
        return;
      }
      if (f.size > MAX_BYTES) {
        toast.error(`Arquivo tem ${fmtBytes(f.size)} — o limite é 200 MB.`);
        return;
      }
      if (!f.type.startsWith("image/") && !f.type.startsWith("video/")) {
        toast.error("Só imagem ou vídeo. Pra outros formatos, use o link.");
        return;
      }
      setFile(f);
      setLocalPreview(URL.createObjectURL(f));
      setDims(await readMediaDimensions(f));
      // Nome do arquivo vira título provisório — reduz a fricção de catalogar.
      if (!title) setTitle(f.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").slice(0, 200));
    },
    [storageReady, title],
  );

  async function buscarPreview(url: string) {
    const clean = url.trim();
    if (!clean) return;
    try {
      const p = await linkPreview.mutateAsync(clean);
      setPreview(p);
      if (!title && p.title) setTitle(p.title.slice(0, 200));
    } catch (e) {
      // Preview é enriquecimento, não requisito: sem ele a referência ainda vale.
      setPreview(null);
      toast.warning(
        e instanceof Error ? e.message : "Não consegui ler esse link — dá pra salvar mesmo assim.",
      );
    }
  }

  function addTag() {
    const t = tagInput.trim().toLowerCase();
    if (!t || tags.includes(t) || tags.length >= 20) return;
    setTags((prev) => [...prev, t]);
    setTagInput("");
  }

  const assetKind: AssetKind = file
    ? file.type.startsWith("video/") ? "video" : "image"
    : "link";

  const podeSalvar = title.trim() && (file || sourceUrl.trim());

  async function salvar() {
    if (!podeSalvar) return;
    try {
      let fileUrl: string | undefined;
      let fileKey: string | undefined;
      if (file) {
        const r = await upload.mutateAsync({ file, onProgress: setProgress });
        fileUrl = r.publicUrl;
        fileKey = r.key;
      }
      await createSwipe.mutateAsync({
        title: title.trim(),
        assetKind,
        notes: notes.trim() || undefined,
        fileUrl,
        fileKey,
        fileMime: file?.type,
        fileSizeBytes: file?.size,
        width: dims?.width,
        height: dims?.height,
        sourceUrl: sourceUrl.trim() || undefined,
        brand: brand.trim() || undefined,
        niche: niche.trim() || undefined,
        platform: platform.trim() || undefined,
        format: format.trim() || undefined,
        tags,
      });
      toast.success("Referência adicionada à biblioteca");
      reset();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    }
  }

  const enviando = upload.isPending || createSwipe.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nova referência</DialogTitle>
          <DialogDescription>
            Arraste um print ou vídeo, ou cole o link do anúncio — o preview vem sozinho.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Arquivo */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const f = e.dataTransfer.files?.[0];
              if (f) void aceitarArquivo(f);
            }}
            className={`rounded-xl border-2 border-dashed p-5 text-center transition-colors ${
              dragging ? "border-primary bg-primary/5" : "border-border/50"
            }`}
          >
            {localPreview ? (
              <div className="space-y-2">
                <div className="relative mx-auto max-w-[260px]">
                  {assetKind === "video" ? (
                    // Preview local do arquivo que a pessoa acabou de escolher —
                    // não há legenda a fornecer.
                    <video src={localPreview} className="w-full rounded-lg" controls aria-label="Prévia do vídeo" />
                  ) : (
                    <img src={localPreview} alt="" className="w-full rounded-lg" />
                  )}
                  <Button
                    variant="secondary"
                    size="icon"
                    className="absolute -right-2 -top-2 h-6 w-6"
                    onClick={() => {
                      setFile(null);
                      if (localPreview) URL.revokeObjectURL(localPreview);
                      setLocalPreview(null);
                      setDims(null);
                    }}
                    aria-label="Remover arquivo"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {file && fmtBytes(file.size)}
                  {dims ? ` · ${dims.width}×${dims.height}` : ""}
                </p>
                {enviando && progress > 0 && (
                  <div className="mx-auto max-w-[260px]">
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full bg-primary transition-[width]" style={{ width: `${progress}%` }} />
                    </div>
                    <p className="mt-1 text-[10px] text-muted-foreground">{progress}% enviado</p>
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="mb-2 flex justify-center gap-2 text-muted-foreground">
                  <ImageIcon className="h-5 w-5" />
                  <Film className="h-5 w-5" />
                </div>
                <p className="text-sm">Arraste imagem ou vídeo aqui</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2 gap-1.5"
                  onClick={() => inputRef.current?.click()}
                  disabled={!storageReady}
                >
                  <Upload className="h-3.5 w-3.5" />
                  Escolher arquivo
                </Button>
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/*,video/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void aceitarArquivo(f);
                  }}
                />
                {!storageReady && (
                  <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-500">
                    Upload indisponível: bucket não configurado no servidor. Use o link abaixo.
                  </p>
                )}
              </>
            )}
          </div>

          {/* Link */}
          <div className="space-y-1.5">
            <Label htmlFor="swipe-url">
              Link {file ? "do anúncio original (opcional)" : "do anúncio"}
            </Label>
            <div className="flex gap-2">
              <Input
                id="swipe-url"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                onBlur={(e) => void buscarPreview(e.target.value)}
                placeholder="Post, Biblioteca de Anúncios do Meta, landing page..."
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => void buscarPreview(sourceUrl)}
                disabled={!sourceUrl.trim() || linkPreview.isPending}
                title="Buscar preview"
              >
                {linkPreview.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Link2 className="h-4 w-4" />
                )}
              </Button>
            </div>
            {preview && (
              <div className="flex gap-2 rounded-lg border border-border/40 p-2">
                {preview.image && (
                  <img src={preview.image} alt="" className="h-14 w-20 shrink-0 rounded object-cover" />
                )}
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium">{preview.title ?? "(sem título)"}</p>
                  <p className="line-clamp-2 text-[11px] text-muted-foreground">
                    {preview.description ?? preview.siteName}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="swipe-title">Título *</Label>
            <Input
              id="swipe-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Como o time vai reconhecer isso depois"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="swipe-notes">Por que salvamos</Label>
            <Textarea
              id="swipe-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="O gancho, a estrutura, o que dá pra roubar daqui..."
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <CampoComSugestoes
              id="swipe-brand" label="Marca" value={brand} onChange={setBrand}
              sugestoes={facets.brand} placeholder="De quem é o anúncio"
            />
            <CampoComSugestoes
              id="swipe-niche" label="Nicho" value={niche} onChange={setNiche}
              sugestoes={facets.niche} placeholder="Ex: finanças, saúde"
            />
            <CampoComSugestoes
              id="swipe-platform" label="Plataforma" value={platform} onChange={setPlatform}
              sugestoes={[...new Set([...facets.platform, ...PLATAFORMAS])]}
            />
            <CampoComSugestoes
              id="swipe-format" label="Formato" value={format} onChange={setFormat}
              sugestoes={[...new Set([...facets.format, ...FORMATOS])]}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="swipe-tags">Tags</Label>
            <div className="flex gap-2">
              <Input
                id="swipe-tags"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    addTag();
                  }
                }}
                placeholder="Enter pra adicionar"
              />
              <Button variant="outline" size="sm" onClick={addTag} disabled={!tagInput.trim()}>
                Add
              </Button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {tags.map((t) => (
                  <Badge key={t} variant="secondary" className="gap-1 text-[10px]">
                    {t}
                    <button type="button" onClick={() => setTags((p) => p.filter((x) => x !== t))} aria-label={`Remover ${t}`}>
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={enviando}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={!podeSalvar || enviando}>
            {enviando ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                {upload.isPending ? "Enviando..." : "Salvando..."}
              </>
            ) : (
              "Salvar na biblioteca"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
