"use client";

/**
 * O mapa do funil — blocos arrastáveis ligados por setas.
 *
 * A cadeia de etapas do Loyola X já diz "Captação Paga → Vendas → Debriefing",
 * mas um lançamento tem mais peças do que etapas: anúncio, LP, VSL, checkout,
 * order bump, e-mail, remarketing. Elas viviam em Figma ou na cabeça de quem
 * montou; aqui ficam ao lado dos números.
 *
 * ## Por que sem biblioteca de canvas
 *
 * React Flow resolveria, e traz ~100 KB e um modelo de dados próprio para um
 * uso que é: arrastar caixa, ligar caixa, salvar. Pointer events e um `<svg>`
 * dão conta, e o documento salvo continua sendo o nosso — sem tradutor no meio
 * quando a lib mudar de versão.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Icons from "lucide-react";
import { Loader2, Plus, RotateCcw, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CATEGORIAS,
  STATUS,
  ALTURA_PADRAO,
  LARGURA_PADRAO,
  metaDoTipo,
  type StatusBloco,
} from "@/lib/utils/funnel-map-palette";
import {
  useFunnelMap,
  useSaveFunnelMap,
  type AbaDoMapa,
  type BlocoDoMapa,
  type ConectorDoMapa,
  type PontoDeConexao,
} from "@/lib/hooks/use-funnel-map";

/** Ícone por nome, com fallback — nome errado não derruba o mapa. */
function IconePorNome({ nome, className }: { nome: string; className?: string }) {
  const Componente = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[nome];
  const Final = Componente ?? Icons.Square;
  return <Final className={className} />;
}

/** Onde fica, em pixels, um ponto de conexão do bloco. */
function pontoDoBloco(b: BlocoDoMapa, ponto: PontoDeConexao): { x: number; y: number } {
  switch (ponto) {
    case "top": return { x: b.x + b.width / 2, y: b.y };
    case "bottom": return { x: b.x + b.width / 2, y: b.y + b.height };
    case "left": return { x: b.x, y: b.y + b.height / 2 };
    case "right": return { x: b.x + b.width, y: b.y + b.height / 2 };
  }
}

/**
 * Curva de Bézier entre dois pontos.
 *
 * A alça sai na direção do lado de origem: seta que nasce à direita e vai para
 * a esquerda do próximo bloco desenha um "S" legível, em vez de cortar por cima
 * das caixas como faria uma reta.
 */
function caminhoDaSeta(de: { x: number; y: number }, dePonto: PontoDeConexao, para: { x: number; y: number }, paraPonto: PontoDeConexao): string {
  const forca = Math.max(40, Math.abs(para.x - de.x) / 2);
  const alca = (p: PontoDeConexao, base: { x: number; y: number }) => {
    switch (p) {
      case "right": return { x: base.x + forca, y: base.y };
      case "left": return { x: base.x - forca, y: base.y };
      case "top": return { x: base.x, y: base.y - forca };
      case "bottom": return { x: base.x, y: base.y + forca };
    }
  };
  const c1 = alca(dePonto, de);
  const c2 = alca(paraPonto, para);
  return `M ${de.x} ${de.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${para.x} ${para.y}`;
}

const PONTOS: PontoDeConexao[] = ["top", "right", "bottom", "left"];

interface Props {
  projectId: string;
  funnelId: string;
  stageId: string;
  /** Altura da área de desenho. A etapa dedicada usa a tela quase inteira. */
  altura?: number;
}

export function FunnelMapCanvas({ projectId, funnelId, stageId, altura = 520 }: Props) {
  const { data, isLoading } = useFunnelMap(projectId, funnelId, stageId);
  const salvar = useSaveFunnelMap(projectId, funnelId, stageId);

  const [abas, setAbas] = useState<AbaDoMapa[] | null>(null);
  // O seletor de abas ainda não tem UI (PR #603): `abaAtiva` é lido em três
  // pontos e o setter não é chamado em lugar nenhum, o que derruba o lint. Fica
  // só o valor até a UI existir — quando existir, o setter volta aqui.
  const [abaAtiva] = useState(0);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [ligando, setLigando] = useState<{ boxId: string; ponto: PontoDeConexao } | null>(null);
  const [sujo, setSujo] = useState(false);
  const areaRef = useRef<HTMLDivElement>(null);

  // O servidor manda o rascunho das etapas quando ninguém desenhou ainda; a
  // partir daí o estado é local, senão cada refetch desfaria o que está sendo
  // arrastado.
  useEffect(() => {
    if (data && abas === null) setAbas(data.tabs);
  }, [data, abas]);

  const aba = abas?.[abaAtiva];
  const blocos = useMemo(() => aba?.boxes ?? [], [aba]);

  const alterarAba = useCallback((mudanca: (a: AbaDoMapa) => AbaDoMapa) => {
    setAbas((atuais) => {
      if (!atuais) return atuais;
      const copia = [...atuais];
      copia[abaAtiva] = mudanca(copia[abaAtiva]);
      return copia;
    });
    setSujo(true);
  }, [abaAtiva]);

  /**
   * Arrastar um bloco.
   *
   * Pointer capture em vez de listener no documento: o arrasto segue o dedo
   * mesmo saindo da caixa, e o navegador cuida de encerrar quando o toque
   * termina — inclusive no celular.
   */
  function iniciarArrasto(e: React.PointerEvent, bloco: BlocoDoMapa) {
    if (ligando) return;
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const inicioX = e.clientX;
    const inicioY = e.clientY;
    const origemX = bloco.x;
    const origemY = bloco.y;
    setSelecionado(bloco.id);

    const mover = (ev: PointerEvent) => {
      const dx = ev.clientX - inicioX;
      const dy = ev.clientY - inicioY;
      alterarAba((a) => ({
        ...a,
        boxes: a.boxes.map((b) =>
          b.id === bloco.id
            // Trava no zero: bloco arrastado para fora à esquerda ou para cima
            // ficaria inalcançável, sem barra de rolagem que chegue lá.
            ? { ...b, x: Math.max(0, origemX + dx), y: Math.max(0, origemY + dy) }
            : b,
        ),
      }));
    };
    const soltar = () => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
    };
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
  }

  function adicionarBloco(tipo: string, cor: string, label: string) {
    const id = `b-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`;
    // Entra num espaço livre à direita do que já existe, para não nascer em
    // cima de outro bloco.
    const x = blocos.length === 0 ? 100 : Math.max(...blocos.map((b) => b.x)) + 280;
    alterarAba((a) => ({
      ...a,
      boxes: [
        ...a.boxes,
        { id, type: tipo, label, x, y: 160, width: LARGURA_PADRAO, height: ALTURA_PADRAO, color: cor, status: "construcao" as StatusBloco },
      ],
    }));
    setSelecionado(id);
  }

  function clicarNoPonto(boxId: string, ponto: PontoDeConexao) {
    if (!ligando) {
      setLigando({ boxId, ponto });
      return;
    }
    if (ligando.boxId === boxId) {
      // Ligar um bloco nele mesmo não significa nada no funil.
      setLigando(null);
      return;
    }
    const novo: ConectorDoMapa = {
      id: `c-${Date.now().toString(36)}`,
      fromBox: ligando.boxId,
      fromPoint: ligando.ponto,
      toBox: boxId,
      toPoint: ponto,
      type: "solid",
    };
    alterarAba((a) => ({ ...a, connectors: [...a.connectors, novo] }));
    setLigando(null);
  }

  function removerBloco(id: string) {
    alterarAba((a) => ({
      ...a,
      boxes: a.boxes.filter((b) => b.id !== id),
      // Conector órfão vira seta apontando para o nada — some junto.
      connectors: a.connectors.filter((c) => c.fromBox !== id && c.toBox !== id),
    }));
    setSelecionado(null);
  }

  function salvarMapa() {
    if (!abas) return;
    salvar.mutate(abas, {
      onSuccess: () => {
        setSujo(false);
        toast.success("Mapa salvo");
      },
      onError: (e) => toast.error(e instanceof Error ? e.message : "Não consegui salvar o mapa"),
    });
  }

  if (isLoading || !abas || !aba) return <Skeleton style={{ height: altura }} />;

  const blocoSelecionado = blocos.find((b) => b.id === selecionado) ?? null;
  const largura = Math.max(1200, ...blocos.map((b) => b.x + b.width + 200));
  const alturaDoDesenho = Math.max(altura, ...blocos.map((b) => b.y + b.height + 160));

  return (
    <section className="space-y-3 rounded-xl border border-border/40 bg-card/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">Mapa do funil</h3>
          <p className="text-[11px] text-muted-foreground">
            {data?.rascunho && !sujo
              ? "Sugestão a partir das etapas cadastradas — arraste, adicione e salve para tornar seu."
              : ligando
                ? "Clique em outro bloco para ligar. Clique no mesmo ponto para cancelar."
                : "Arraste os blocos; clique nas bolinhas da borda para ligar dois blocos."}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {ligando && (
            <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-[11px]" onClick={() => setLigando(null)}>
              <X className="h-3 w-3" /> Cancelar ligação
            </Button>
          )}
          {sujo && (
            <span className="mr-1 text-[11px] text-amber-600 dark:text-amber-400">alterações não salvas</span>
          )}
          <Button size="sm" className="h-7 gap-1.5 px-2 text-[11px]" onClick={salvarMapa} disabled={salvar.isPending || !sujo}>
            {salvar.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            Salvar
          </Button>
        </div>
      </div>

      <div className="flex gap-3">
        {/* Paleta */}
        <div className="hidden w-44 shrink-0 space-y-2 overflow-y-auto md:block" style={{ maxHeight: altura }}>
          {CATEGORIAS.map((cat) => (
            <div key={cat.name}>
              <p className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                <span className="h-2 w-2 rounded-sm" style={{ background: cat.color }} />
                {cat.name}
              </p>
              <div className="space-y-0.5">
                {cat.items.map((item) => (
                  <button
                    key={item.type}
                    type="button"
                    onClick={() => adicionarBloco(item.type, cat.color, item.label)}
                    className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-[11px] transition-colors hover:bg-muted"
                  >
                    <IconePorNome nome={item.icon} className="h-3 w-3 shrink-0" />
                    <span className="truncate">{item.label}</span>
                    <Plus className="ml-auto h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Canvas */}
        <div
          ref={areaRef}
          className="relative flex-1 overflow-auto rounded-lg border border-border/40 bg-[radial-gradient(circle,var(--color-border)_1px,transparent_1px)] [background-size:20px_20px]"
          style={{ height: altura }}
          onClick={() => { setSelecionado(null); setLigando(null); }}
        >
          <div className="relative" style={{ width: largura, height: alturaDoDesenho }}>
            <svg className="pointer-events-none absolute inset-0" width={largura} height={alturaDoDesenho}>
              <defs>
                <marker id="seta-mapa" markerWidth="9" markerHeight="9" refX="8" refY="3" orient="auto">
                  <path d="M0,0 L0,6 L8,3 z" fill="currentColor" className="text-muted-foreground" />
                </marker>
              </defs>
              {aba.connectors.map((c) => {
                const de = blocos.find((b) => b.id === c.fromBox);
                const para = blocos.find((b) => b.id === c.toBox);
                if (!de || !para) return null;
                return (
                  <path
                    key={c.id}
                    d={caminhoDaSeta(pontoDoBloco(de, c.fromPoint), c.fromPoint, pontoDoBloco(para, c.toPoint), c.toPoint)}
                    fill="none"
                    stroke="currentColor"
                    className="text-muted-foreground/60"
                    strokeWidth={2}
                    strokeDasharray={c.type === "dashed" ? "8 4" : undefined}
                    markerEnd="url(#seta-mapa)"
                  />
                );
              })}
            </svg>

            {blocos.map((b) => {
              const meta = metaDoTipo(b.type);
              const ativo = selecionado === b.id;
              return (
                <div
                  key={b.id}
                  onPointerDown={(e) => iniciarArrasto(e, b)}
                  onClick={(e) => { e.stopPropagation(); setSelecionado(b.id); }}
                  className={`absolute cursor-grab touch-none select-none rounded-lg border-2 bg-card p-2 shadow-sm transition-shadow active:cursor-grabbing ${
                    ativo ? "ring-2 ring-primary ring-offset-1" : ""
                  }`}
                  style={{ left: b.x, top: b.y, width: b.width, height: b.height, borderColor: b.color }}
                >
                  <div className="flex items-center gap-1.5">
                    <IconePorNome nome={meta.icon} className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate text-[11px] font-medium" title={b.label}>{b.label}</span>
                  </div>
                  <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{meta.label}</p>
                  <span
                    className="absolute bottom-1.5 right-2 flex items-center gap-1 text-[9px]"
                    style={{ color: STATUS[b.status]?.color }}
                    title={STATUS[b.status]?.label}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: STATUS[b.status]?.color }} />
                    {STATUS[b.status]?.label}
                  </span>
                  {/* Etapa de verdade do Loyola X: o mapa mostra quais blocos
                      têm dado atrás e quais são só plano. */}
                  {b.stageId && (
                    <span className="absolute left-1.5 top-[-8px] rounded bg-primary px-1 text-[8px] font-medium text-primary-foreground">
                      etapa
                    </span>
                  )}

                  {PONTOS.map((p) => {
                    const pos = pontoDoBloco({ ...b, x: 0, y: 0 }, p);
                    return (
                      <button
                        key={p}
                        type="button"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => { e.stopPropagation(); clicarNoPonto(b.id, p); }}
                        className={`absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border transition-colors ${
                          ligando?.boxId === b.id && ligando.ponto === p
                            ? "border-primary bg-primary"
                            : "border-border bg-background hover:bg-primary"
                        }`}
                        style={{ left: pos.x, top: pos.y }}
                        aria-label={`Conectar pelo lado ${p}`}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        {/* Propriedades */}
        {blocoSelecionado && (
          <div className="w-56 shrink-0 space-y-2 rounded-lg border border-border/40 p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold">Bloco</p>
              <button type="button" onClick={() => setSelecionado(null)} aria-label="Fechar">
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Nome</Label>
              <Input
                value={blocoSelecionado.label}
                onChange={(e) =>
                  alterarAba((a) => ({
                    ...a,
                    boxes: a.boxes.map((b) => (b.id === blocoSelecionado.id ? { ...b, label: e.target.value } : b)),
                  }))
                }
                className="h-7 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Status</Label>
              <div className="grid grid-cols-2 gap-1">
                {(Object.keys(STATUS) as StatusBloco[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() =>
                      alterarAba((a) => ({
                        ...a,
                        boxes: a.boxes.map((b) => (b.id === blocoSelecionado.id ? { ...b, status: s } : b)),
                      }))
                    }
                    className={`rounded border px-1 py-0.5 text-[10px] transition-colors ${
                      blocoSelecionado.status === s ? "border-transparent text-white" : "border-border/60 hover:bg-muted"
                    }`}
                    style={blocoSelecionado.status === s ? { background: STATUS[s].color } : undefined}
                  >
                    {STATUS[s].label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Link (opcional)</Label>
              <Input
                value={blocoSelecionado.url ?? ""}
                placeholder="https://…"
                onChange={(e) =>
                  alterarAba((a) => ({
                    ...a,
                    boxes: a.boxes.map((b) => (b.id === blocoSelecionado.id ? { ...b, url: e.target.value || null } : b)),
                  }))
                }
                className="h-7 text-xs"
              />
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="w-full gap-1.5 text-[11px] text-muted-foreground hover:text-red-500"
              onClick={() => removerBloco(blocoSelecionado.id)}
            >
              <Trash2 className="h-3 w-3" /> Remover bloco
            </Button>
          </div>
        )}
      </div>

      {/* Paleta no celular: a coluna lateral não cabe, então vira uma faixa. */}
      <div className="flex gap-1 overflow-x-auto pb-1 md:hidden">
        {CATEGORIAS.flatMap((c) => c.items.map((i) => ({ ...i, cor: c.color }))).map((item) => (
          <button
            key={item.type}
            type="button"
            onClick={() => adicionarBloco(item.type, item.cor, item.label)}
            className="flex shrink-0 items-center gap-1 rounded-full border border-border/50 px-2 py-1 text-[10px]"
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: item.cor }} />
            {item.label}
          </button>
        ))}
      </div>

      {data?.rascunho && sujo && (
        <button
          type="button"
          onClick={() => { setAbas(data.tabs); setSujo(false); setSelecionado(null); }}
          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
        >
          <RotateCcw className="h-3 w-3" /> Voltar à sugestão das etapas
        </button>
      )}
    </section>
  );
}
