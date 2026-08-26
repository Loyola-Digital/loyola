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
import {
  Copy, Keyboard, Loader2, Maximize2, Minus, Pencil, Plus, RotateCcw, Save, Trash2, Undo2, Redo2, Unlink, X,
} from "lucide-react";
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
  GRADE, snap, useHistorico, useSelecao, useZoom,
} from "@/lib/hooks/use-canvas-ux";
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
  const selecao = useSelecao();
  const historico = useHistorico<AbaDoMapa[]>();
  const zoom = useZoom();
  const [ligando, setLigando] = useState<{ boxId: string; ponto: PontoDeConexao } | null>(null);
  const [sujo, setSujo] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; boxId: string } | null>(null);
  const [ajuda, setAjuda] = useState(false);
  const [marquee, setMarquee] = useState<{ ax: number; ay: number; bx: number; by: number } | null>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const nomeRef = useRef<HTMLInputElement>(null);
  const espaco = useRef(false);

  // O servidor manda o rascunho das etapas quando ninguém desenhou ainda; a
  // partir daí o estado é local, senão cada refetch desfaria o que está sendo
  // arrastado.
  useEffect(() => {
    if (data && abas === null) setAbas(data.tabs);
  }, [data, abas]);

  const aba = abas?.[abaAtiva];
  const blocos = useMemo(() => aba?.boxes ?? [], [aba]);

  /**
   * Ponto único de mutação do desenho — e por isso o lugar certo de gravar o
   * histórico. `semHistorico` existe pro arrasto: cada frame passa por aqui, e
   * empilhar todos encheria o desfazer com dezenas de entradas por gesto. O
   * arrasto registra uma vez no início e solta o resto.
   */
  const alterarAba = useCallback(
    (mudanca: (a: AbaDoMapa) => AbaDoMapa, semHistorico = false) => {
      setAbas((atuais) => {
        if (!atuais) return atuais;
        if (!semHistorico) historico.registrar(atuais);
        const copia = [...atuais];
        copia[abaAtiva] = mudanca(copia[abaAtiva]);
        return copia;
      });
      setSujo(true);
    },
    [abaAtiva, historico],
  );

  const desfazer = useCallback(() => {
    setAbas((atuais) => {
      if (!atuais) return atuais;
      const anterior = historico.desfazer(atuais);
      if (!anterior) return atuais;
      setSujo(true);
      return anterior;
    });
  }, [historico]);

  const refazer = useCallback(() => {
    setAbas((atuais) => {
      if (!atuais) return atuais;
      const proximo = historico.refazer(atuais);
      if (!proximo) return atuais;
      setSujo(true);
      return proximo;
    });
  }, [historico]);

  /**
   * Arrastar um bloco.
   *
   * Pointer capture em vez de listener no documento: o arrasto segue o dedo
   * mesmo saindo da caixa, e o navegador cuida de encerrar quando o toque
   * termina — inclusive no celular.
   */
  function iniciarArrasto(e: React.PointerEvent, bloco: BlocoDoMapa) {
    if (ligando || espaco.current) return;
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const inicioX = e.clientX;
    const inicioY = e.clientY;
    selecao.clicar(bloco.id, e.shiftKey);

    // Arrasta o GRUPO. As origens são fotografadas antes do gesto: acumular
    // delta sobre a posição corrente faria o erro do snap somar frame a frame.
    const alvos = selecao.ids.has(bloco.id) && !e.shiftKey ? [...selecao.ids] : [bloco.id];
    const origens = new Map(
      blocos.filter((b) => alvos.includes(b.id)).map((b) => [b.id, { x: b.x, y: b.y }]),
    );
    if (!origens.has(bloco.id)) origens.set(bloco.id, { x: bloco.x, y: bloco.y });

    let primeiro = true;
    const mover = (ev: PointerEvent) => {
      // Divide pelo zoom: sem isso, com o mapa a 50% o bloco anda o dobro do
      // que o ponteiro.
      const dx = (ev.clientX - inicioX) / zoom.valor;
      const dy = (ev.clientY - inicioY) / zoom.valor;
      alterarAba(
        (a) => ({
          ...a,
          boxes: a.boxes.map((b) => {
            const o = origens.get(b.id);
            if (!o) return b;
            // Trava no zero: bloco arrastado para fora à esquerda ou para cima
            // ficaria inalcançável, sem barra de rolagem que chegue lá.
            return { ...b, x: Math.max(0, snap(o.x + dx)), y: Math.max(0, snap(o.y + dy)) };
          }),
        }),
        // Uma entrada de histórico por gesto, gravada no primeiro frame.
        !primeiro,
      );
      primeiro = false;
    };
    const soltar = () => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
    };
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
  }

  /** Duplica os blocos selecionados, deslocados pra não nascer por baixo. */
  function duplicarSelecionados() {
    const alvos = blocos.filter((b) => selecao.ids.has(b.id));
    if (alvos.length === 0) return;
    const novos = alvos.map((b, i) => ({
      ...b,
      id: `b-${Date.now().toString(36)}-${i}-${Math.floor(Math.random() * 1e4).toString(36)}`,
      x: snap(b.x + GRADE * 2),
      y: snap(b.y + GRADE * 2),
    }));
    alterarAba((a) => ({ ...a, boxes: [...a.boxes, ...novos] }));
    selecao.definir(novos.map((b) => b.id));
    toast.success(novos.length > 1 ? `${novos.length} blocos duplicados` : "Bloco duplicado");
  }

  /** Remove os selecionados de uma vez, junto com os conectores órfãos. */
  function removerSelecionados() {
    const alvos = [...selecao.ids];
    if (alvos.length === 0) return;
    alterarAba((a) => ({
      ...a,
      boxes: a.boxes.filter((b) => !alvos.includes(b.id)),
      connectors: a.connectors.filter((c) => !alvos.includes(c.fromBox) && !alvos.includes(c.toBox)),
    }));
    selecao.limpar();
    toast.success(alvos.length > 1 ? `${alvos.length} blocos removidos` : "Bloco removido");
  }

  /** Solta as ligações do bloco sem apagar o bloco. */
  function desconectar(id: string) {
    alterarAba((a) => ({
      ...a,
      connectors: a.connectors.filter((c) => c.fromBox !== id && c.toBox !== id),
    }));
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
    selecao.definir([id]);
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
    selecao.limpar();
  }

  const arrastouMarquee = useRef(false);

  /**
   * Converte coordenada de tela pra coordenada do desenho.
   * O canvas rola (não translada), então entra o scroll; e escala, então entra
   * o zoom. Errar um dos dois faz a seleção por área pegar o bloco errado.
   */
  const paraDesenho = useCallback((cx: number, cy: number) => {
    const el = areaRef.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    return {
      x: (cx - r.left + el.scrollLeft) / zoom.valor,
      y: (cy - r.top + el.scrollTop) / zoom.valor,
    };
  }, [zoom.valor]);

  /** Seleção por área e mover a tela com Space/botão do meio. */
  function fundoPointerDown(e: React.PointerEvent) {
    if (e.button === 2 || ligando) return;
    setMenu(null);

    if (e.button === 1 || espaco.current) {
      const el = areaRef.current;
      if (!el) return;
      const sx = e.clientX;
      const sy = e.clientY;
      const l0 = el.scrollLeft;
      const t0 = el.scrollTop;
      const mover = (ev: PointerEvent) => {
        el.scrollLeft = l0 - (ev.clientX - sx);
        el.scrollTop = t0 - (ev.clientY - sy);
      };
      const soltar = () => {
        window.removeEventListener("pointermove", mover);
        window.removeEventListener("pointerup", soltar);
      };
      window.addEventListener("pointermove", mover);
      window.addEventListener("pointerup", soltar);
      return;
    }

    const ini = paraDesenho(e.clientX, e.clientY);
    arrastouMarquee.current = false;
    setMarquee({ ax: ini.x, ay: ini.y, bx: ini.x, by: ini.y });
    const base = e.shiftKey ? [...selecao.ids] : [];

    const mover = (ev: PointerEvent) => {
      const p = paraDesenho(ev.clientX, ev.clientY);
      // Só vira marquee depois de um limiar: sem isso, um clique trêmulo pra
      // limpar a seleção viraria uma área de 2px e não limparia nada.
      if (Math.abs(p.x - ini.x) > 4 || Math.abs(p.y - ini.y) > 4) arrastouMarquee.current = true;
      setMarquee({ ax: ini.x, ay: ini.y, bx: p.x, by: p.y });
    };
    const soltar = () => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      setMarquee((m) => {
        if (m && arrastouMarquee.current) {
          const x1 = Math.min(m.ax, m.bx);
          const x2 = Math.max(m.ax, m.bx);
          const y1 = Math.min(m.ay, m.by);
          const y2 = Math.max(m.ay, m.by);
          const pegos = blocos
            .filter((b) => b.x < x2 && b.x + b.width > x1 && b.y < y2 && b.y + b.height > y1)
            .map((b) => b.id);
          selecao.definir([...new Set([...base, ...pegos])]);
        }
        return null;
      });
      // Deixa o onClick do fundo rodar antes de liberar a trava.
      setTimeout(() => { arrastouMarquee.current = false; }, 0);
    };
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
  }

  /** ⌘ + roda dá zoom; roda sozinha continua rolando o canvas. */
  function fundoWheel(e: React.WheelEvent) {
    if (e.ctrlKey || e.metaKey) zoom.aplicar(e.deltaY < 0 ? 1.1 : 1 / 1.1);
  }

  function enquadrarTudo() {
    const el = areaRef.current;
    if (!el || blocos.length === 0) return;
    const w = Math.max(...blocos.map((b) => b.x + b.width)) + 80;
    const h = Math.max(...blocos.map((b) => b.y + b.height)) + 80;
    zoom.enquadrar({ w, h }, { w: el.clientWidth, h: el.clientHeight });
    el.scrollTo({ left: 0, top: 0 });
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

  // ---- Atalhos de teclado ------------------------------------------------
  useEffect(() => {
    function digitando(alvo: EventTarget | null): boolean {
      const el = alvo as HTMLElement | null;
      if (!el || !el.tagName) return false;
      return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable;
    }

    function onKey(e: KeyboardEvent) {
      if (digitando(e.target)) {
        // Esc devolve o foco pro canvas em vez de fechar o painel por baixo.
        if (e.key === "Escape") (e.target as HTMLElement).blur();
        return;
      }
      if (e.key === " ") { espaco.current = true; e.preventDefault(); return; }

      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) refazer(); else desfazer();
        return;
      }
      if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); salvarMapa(); return; }
      if (mod && e.key.toLowerCase() === "a") { e.preventDefault(); selecao.definir(blocos.map((b) => b.id)); return; }
      if (mod && e.key.toLowerCase() === "d") { e.preventDefault(); duplicarSelecionados(); return; }
      if (mod && (e.key === "=" || e.key === "+")) { e.preventDefault(); zoom.aumentar(); return; }
      if (mod && e.key === "-") { e.preventDefault(); zoom.diminuir(); return; }
      if (mod && e.key === "0") { e.preventDefault(); enquadrarTudo(); return; }

      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); removerSelecionados(); return; }
      if (e.key === "Escape") { selecao.limpar(); setLigando(null); setMenu(null); setAjuda(false); return; }
      if (e.key === "?") { e.preventDefault(); setAjuda((v) => !v); return; }
      if (e.key === "F2" && selecao.unico) { e.preventDefault(); nomeRef.current?.select(); return; }

      if (selecao.ids.size > 0 && e.key.startsWith("Arrow")) {
        e.preventDefault();
        const passo = (e.shiftKey ? 5 : 1) * GRADE;
        const dx = e.key === "ArrowLeft" ? -passo : e.key === "ArrowRight" ? passo : 0;
        const dy = e.key === "ArrowUp" ? -passo : e.key === "ArrowDown" ? passo : 0;
        if (dx === 0 && dy === 0) return;
        alterarAba((a) => ({
          ...a,
          boxes: a.boxes.map((b) =>
            selecao.ids.has(b.id)
              ? { ...b, x: Math.max(0, b.x + dx), y: Math.max(0, b.y + dy) }
              : b,
          ),
        }));
      }
    }
    function onKeyUp(e: KeyboardEvent) { if (e.key === " ") espaco.current = false; }

    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
    };
  });

  if (isLoading || !abas || !aba) return <Skeleton style={{ height: altura }} />;

  // O painel de propriedades só faz sentido com UM bloco: com vários, editar
  // "Nome" não teria alvo definido.
  const blocoSelecionado = blocos.find((b) => b.id === selecao.unico) ?? null;
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
          <div className="mr-1 inline-flex items-center rounded-md border border-border/50 p-0.5">
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={zoom.diminuir} aria-label="Diminuir zoom">
              <Minus className="h-3 w-3" />
            </Button>
            <span className="min-w-[38px] text-center font-mono text-[10px] tabular-nums text-muted-foreground">
              {Math.round(zoom.valor * 100)}%
            </span>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={zoom.aumentar} aria-label="Aumentar zoom">
              <Plus className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={enquadrarTudo} aria-label="Enquadrar tudo">
              <Maximize2 className="h-3 w-3" />
            </Button>
          </div>
          <Button
            variant="ghost" size="icon" className="h-6 w-6"
            onClick={desfazer} disabled={!historico.podeDesfazer} aria-label="Desfazer"
          >
            <Undo2 className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost" size="icon" className="h-6 w-6"
            onClick={refazer} disabled={!historico.podeRefazer} aria-label="Refazer"
          >
            <Redo2 className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setAjuda(true)} aria-label="Atalhos">
            <Keyboard className="h-3 w-3" />
          </Button>
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
          onWheel={fundoWheel}
          onPointerDown={fundoPointerDown}
          onClick={() => { if (!arrastouMarquee.current) { selecao.limpar(); setLigando(null); } }}
          onContextMenu={(e) => e.preventDefault()}
        >
          {/* O desenho escala por transform e o contêiner cresce junto, senão o
              scroll não alcança o que o zoom empurrou pra fora. */}
          <div style={{ width: largura * zoom.valor, height: alturaDoDesenho * zoom.valor }}>
          <div
            className="relative origin-top-left"
            style={{ width: largura, height: alturaDoDesenho, transform: `scale(${zoom.valor})` }}
          >
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
              const ativo = selecao.tem(b.id);
              return (
                <div
                  key={b.id}
                  onPointerDown={(e) => iniciarArrasto(e, b)}
                  onClick={(e) => { e.stopPropagation(); selecao.clicar(b.id, e.shiftKey); }}
                  onDoubleClick={(e) => { e.stopPropagation(); selecao.definir([b.id]); setTimeout(() => nomeRef.current?.select(), 0); }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!selecao.tem(b.id)) selecao.definir([b.id]);
                    setMenu({ x: e.clientX, y: e.clientY, boxId: b.id });
                  }}
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

            {marquee && (
              <div
                className="pointer-events-none absolute border border-primary bg-primary/10"
                style={{
                  left: Math.min(marquee.ax, marquee.bx),
                  top: Math.min(marquee.ay, marquee.by),
                  width: Math.abs(marquee.bx - marquee.ax),
                  height: Math.abs(marquee.by - marquee.ay),
                }}
              />
            )}
          </div>
          </div>
        </div>

        {/* Propriedades */}
        {blocoSelecionado && (
          <div className="w-56 shrink-0 space-y-2 rounded-lg border border-border/40 p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold">Bloco</p>
              <button type="button" onClick={() => selecao.limpar()} aria-label="Fechar">
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Nome</Label>
              <Input
                ref={nomeRef}
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

      {/* Menu de contexto do bloco */}
      {menu && (
        <>
          <div className="fixed inset-0 z-40" onPointerDown={() => setMenu(null)} />
          <div
            className="fixed z-50 min-w-[180px] overflow-hidden rounded-lg border border-border/60 bg-popover py-1 shadow-lg"
            style={{ left: menu.x, top: menu.y }}
          >
            <ItemDoMenu
              icon={Pencil}
              label="Renomear"
              atalho="F2"
              onClick={() => { selecao.definir([menu.boxId]); setMenu(null); setTimeout(() => nomeRef.current?.select(), 0); }}
            />
            <ItemDoMenu icon={Copy} label="Duplicar" atalho="⌘D" onClick={() => { duplicarSelecionados(); setMenu(null); }} />
            <ItemDoMenu icon={Unlink} label="Remover ligações" onClick={() => { desconectar(menu.boxId); setMenu(null); }} />
            <div className="my-1 h-px bg-border/60" />
            <ItemDoMenu icon={Trash2} label="Remover bloco" atalho="Del" destrutivo onClick={() => { removerSelecionados(); setMenu(null); }} />
          </div>
        </>
      )}

      {ajuda && <PainelDeAtalhos onClose={() => setAjuda(false)} />}

      {data?.rascunho && sujo && (
        <button
          type="button"
          onClick={() => { setAbas(data.tabs); setSujo(false); selecao.limpar(); historico.limpar(); }}
          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
        >
          <RotateCcw className="h-3 w-3" /> Voltar à sugestão das etapas
        </button>
      )}
    </section>
  );
}

// ============================================================
// Peças da camada de UX
// ============================================================

function ItemDoMenu({
  icon: Icon, label, atalho, onClick, destrutivo,
}: {
  icon: typeof Trash2;
  label: string;
  atalho?: string;
  onClick: () => void;
  destrutivo?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-muted ${
        destrutivo ? "text-destructive" : ""
      }`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="flex-1">{label}</span>
      {atalho && <span className="font-mono text-[10px] text-muted-foreground">{atalho}</span>}
    </button>
  );
}

const ATALHOS: { grupo: string; itens: [string, string][] }[] = [
  {
    grupo: "Seleção",
    itens: [
      ["Clique", "Seleciona o bloco"],
      ["Shift + clique", "Adiciona à seleção"],
      ["Arrastar no vazio", "Seleção por área"],
      ["⌘A", "Seleciona tudo"],
      ["Esc", "Limpa a seleção"],
    ],
  },
  {
    grupo: "Edição",
    itens: [
      ["Duplo clique", "Renomeia"],
      ["F2", "Renomeia"],
      ["⌘D", "Duplica"],
      ["Del", "Remove"],
      ["⌘Z / ⇧⌘Z", "Desfaz / refaz"],
      ["⌘S", "Salva o mapa"],
      ["Setas", "Move 20px (Shift = 100px)"],
    ],
  },
  {
    grupo: "Navegação",
    itens: [
      ["Space + arraste", "Move a tela"],
      ["Botão do meio", "Move a tela"],
      ["⌘ + roda", "Zoom"],
      ["⌘+ / ⌘−", "Zoom"],
      ["⌘0", "Enquadra tudo"],
      ["?", "Este painel"],
    ],
  },
  {
    grupo: "Ligações",
    itens: [
      ["Clique na bolinha", "Começa a ligação"],
      ["Clique na outra", "Fecha a ligação"],
      ["Botão direito", "Menu do bloco"],
    ],
  },
];

function PainelDeAtalhos({ onClose }: { onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-40 bg-background/40 backdrop-blur-[1px]" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-50 w-[min(680px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border/60 bg-popover p-5 shadow-xl">
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h3 className="text-sm font-semibold">Atalhos do mapa</h3>
            <p className="text-[11px] text-muted-foreground">Tecle ? a qualquer momento pra abrir e fechar</p>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} aria-label="Fechar">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
          {ATALHOS.map((g) => (
            <div key={g.grupo}>
              <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{g.grupo}</p>
              <dl className="space-y-1">
                {g.itens.map(([tecla, oque]) => (
                  <div key={tecla} className="flex items-baseline justify-between gap-3">
                    <dt className="shrink-0">
                      <kbd className="rounded border border-border/60 bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                        {tecla}
                      </kbd>
                    </dt>
                    <dd className="flex-1 text-right text-[11px] text-muted-foreground">{oque}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
