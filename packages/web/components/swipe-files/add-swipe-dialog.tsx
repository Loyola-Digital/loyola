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
import { Upload, Link2, Loader2, X, ImageIcon, Film, FileText, Sparkles } from "lucide-react";
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
  useAnalisarSwipe, useCreateSwipeFile, useLinkPreview, useUploadToBucket, readMediaDimensions,
  type AssetKind, type LinkPreview, type SugestaoDeSwipe, type SwipeFacets,
} from "@/lib/hooks/use-swipe-files";

const MAX_BYTES = 200 * 1024 * 1024;

/** Sugestões que aparecem como chip — o time clica em vez de digitar. */
const PLATAFORMAS = ["Meta", "Google", "TikTok", "YouTube", "Kwai", "Outro"];
const FORMATOS = ["Reel", "Feed", "Story", "Carrossel", "VSL", "Landing page", "E-mail", "Criativo estático"];

/**
 * O que o modelo consegue enxergar — espelha `podeAnalisar` do servidor.
 *
 * Duplicado de propósito: o servidor recusa de qualquer forma, e aqui a lista
 * serve só para não oferecer um botão que vai falhar. Um `fetch` para descobrir
 * se cabe oferecer seria pior que a duplicação.
 */
function podeAnalisar(mime: string | undefined): boolean {
  if (!mime) return false;
  return mime.startsWith("image/") || mime === "application/pdf";
}

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

/**
 * Só os nomes das facetas.
 *
 * As facetas chegam contadas (`{ valor, n }`) porque os FILTROS ordenam por
 * uso. Aqui a contagem não serve: o campo só quer completar o que a pessoa
 * digita, e o que ordena a sugestão é o texto dela.
 */
const valores = (opcoes: { valor: string }[]) => opcoes.map((o) => o.valor);

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
  const analisar = useAnalisarSwipe();
  // O que a IA está fazendo agora. Um PDF leva de 20 a 60 s: um spinner mudo
  // durante um minuto é indistinguível de uma tela travada.
  const [passoDaIa, setPassoDaIa] = useState<string | null>(null);
  const linkPreview = useLinkPreview();
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  /** O que a IA sugeriu — para a tela dizer quais campos vieram dela. */
  const [sugeridos, setSugeridos] = useState<Set<string>>(new Set());
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

  /**
   * Preenche o que estiver VAZIO com o que a IA sugeriu.
   *
   * Só o vazio: quem já digitou alguma coisa decidiu, e sobrescrever seria a
   * ferramenta discordando de quem a acionou.
   */
  const aplicarSugestao = useCallback(
    (sug: SugestaoDeSwipe) => {
      const preenchidos = new Set<string>();
      const por = (
        atual: string,
        valor: string | null,
        set: (v: string) => void,
        campo: string,
      ) => {
        if (!atual.trim() && valor) {
          set(valor);
          preenchidos.add(campo);
        }
      };
      por(title, sug.titulo, setTitle, "titulo");
      por(notes, sug.anotacoes, setNotes, "anotacoes");
      por(brand, sug.marca, setBrand, "marca");
      por(niche, sug.nicho, setNiche, "nicho");
      por(platform, sug.plataforma, setPlatform, "plataforma");
      por(format, sug.formato, setFormat, "formato");
      if (tags.length === 0 && sug.tags.length > 0) {
        setTags(sug.tags.slice(0, 20));
        preenchidos.add("tags");
      }
      setSugeridos(preenchidos);
      return preenchidos.size;
    },
    [title, notes, brand, niche, platform, format, tags],
  );

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
      if (
        !f.type.startsWith("image/") &&
        !f.type.startsWith("video/") &&
        f.type !== "application/pdf"
      ) {
        toast.error("Só imagem, vídeo ou PDF. Pra outros formatos, use o link.");
        return;
      }
      setFile(f);
      setLocalPreview(URL.createObjectURL(f));
      // PDF não passa por `readMediaDimensions`: não é <img> nem <video>, e a
      // promessa nunca resolveria. Sem dimensão, o card usa a proporção padrão.
      setDims(f.type === "application/pdf" ? null : await readMediaDimensions(f));
      // Nome do arquivo vira título provisório — reduz a fricção de catalogar.
      if (!title) setTitle(f.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").slice(0, 200));
    },
    [storageReady, title],
  );

  /**
   * Pede à IA para catalogar o arquivo escolhido.
   *
   * Manual, não automático: analisar custa tempo e crédito, e quem já sabe o
   * que está subindo não precisa esperar. O botão fica ao lado do arquivo, onde
   * a decisão acontece.
   */
  async function pedirAnalise() {
    if (!file) return;
    setPassoDaIa("Enviando o arquivo…");
    try {
      const { sugestao } = await analisar.mutateAsync({
        file,
        origem: sourceUrl.trim() || undefined,
        onPasso: (p) => {
          if (p.tipo === "lendo") setPassoDaIa(`Lendo ${fmtBytes(p.bytes)}…`);
          if (p.tipo === "analisando") setPassoDaIa("A IA ainda está lendo…");
        },
      });
      const n = aplicarSugestao(sugestao);
      toast.success(
        n === 0
          ? "A IA olhou, mas não achou nada além do que você já preencheu."
          : `${n} campo${n > 1 ? "s" : ""} preenchido${n > 1 ? "s" : ""} — confira antes de salvar.`,
      );
    } catch (e) {
      // A pessoa acabou de escolher o arquivo: o pior seria achar que perdeu.
      toast.error(e instanceof Error ? e.message : "Não consegui analisar. Preencha à mão.");
    } finally {
      setPassoDaIa(null);
    }
  }

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

  const assetKind: AssetKind = !file
    ? "link"
    : file.type === "application/pdf"
      ? "pdf"
      : file.type.startsWith("video/")
        ? "video"
        : "image";

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
                  ) : assetKind === "pdf" ? (
                    // O PDF ainda é um Blob local: gerar miniatura exigiria uma
                    // biblioteca de render só para esta prévia. O nome e o
                    // tamanho já confirmam que é o arquivo certo.
                    <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-4 text-left">
                      <FileText className="h-8 w-8 shrink-0 text-rose-600" />
                      <span className="min-w-0 flex-1 truncate text-xs">{file?.name}</span>
                    </div>
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

                {podeAnalisar(file?.type) ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={pedirAnalise}
                    disabled={analisar.isPending || enviando}
                  >
                    {analisar.isPending ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        {passoDaIa ?? "Olhando a referência…"}
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-3.5 w-3.5" />
                        Preencher com IA
                      </>
                    )}
                  </Button>
                ) : (
                  file && (
                    // Vídeo não passa pelo modelo, e dizer isso é melhor que um
                    // botão que some sem explicação.
                    <p className="text-[11px] text-muted-foreground">
                      Vídeo não dá para analisar — preencha os campos abaixo.
                    </p>
                  )
                )}
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
                  <FileText className="h-5 w-5" />
                </div>
                <p className="text-sm">Arraste imagem, vídeo ou PDF aqui</p>
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
                  accept="image/*,video/*,application/pdf"
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
              id="swipe-brand" label={sugeridos.has("marca") ? "Marca ✨" : "Marca"}
              value={brand} onChange={setBrand}
              sugestoes={valores(facets.brand)} placeholder="De quem é o anúncio"
            />
            <CampoComSugestoes
              id="swipe-niche" label={sugeridos.has("nicho") ? "Nicho ✨" : "Nicho"}
              value={niche} onChange={setNiche}
              sugestoes={valores(facets.niche)} placeholder="Ex: finanças, saúde"
            />
            <CampoComSugestoes
              id="swipe-platform" label={sugeridos.has("plataforma") ? "Plataforma ✨" : "Plataforma"}
              value={platform} onChange={setPlatform}
              sugestoes={[...new Set([...valores(facets.platform), ...PLATAFORMAS])]}
            />
            <CampoComSugestoes
              id="swipe-format" label={sugeridos.has("formato") ? "Formato ✨" : "Formato"}
              value={format} onChange={setFormat}
              sugestoes={[...new Set([...valores(facets.format), ...FORMATOS])]}
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
