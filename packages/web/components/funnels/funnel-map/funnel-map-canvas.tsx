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
  ClipboardCopy, Copy, Keyboard, Loader2, Maximize2, Minimize2, Minus, Pencil, Plus, RotateCcw, Save, Scan,
  StickyNote, Trash2, Type, Undo2, Redo2, Unlink, X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CATEGORIAS,
  CORES_BLOCO,
  CORES_NOTA,
  EMOJIS_GENERICOS,
  NOTA_ALTURA,
  NOTA_LARGURA,
  STATUS,
  TAMANHO_DO_ESTILO,
  TEXTO_ALTURA,
  TEXTO_LARGURA,
  TIPO_GENERICO,
  TIPO_NOTA,
  TIPO_TEXTO,
  ehBlocoLivre,
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

/** Distância em px (na escala do desenho) para o alinhamento "colar". */
const IMA = 6;

export interface Guia { eixo: "x" | "y"; valor: number }

/**
 * Alinhamento com os blocos vizinhos.
 *
 * Compara as três referências que a pessoa enxerga — início, centro e fim — nos
 * dois eixos, e devolve o ajuste que "cola" mais perto. Só o snap de grade não
 * resolve isto: dois blocos de larguras diferentes podem estar ambos na grade e
 * ainda assim visivelmente desalinhados pelo centro.
 */
function calcularGuias(
  movido: { x: number; y: number; width: number; height: number },
  outros: { x: number; y: number; width: number; height: number }[],
): { dx: number; dy: number; guias: Guia[] } {
  const refsX = (b: { x: number; width: number }) => [b.x, b.x + b.width / 2, b.x + b.width];
  const refsY = (b: { y: number; height: number }) => [b.y, b.y + b.height / 2, b.y + b.height];

  let dx = 0;
  let dy = 0;
  let melhorX = IMA;
  let melhorY = IMA;
  const guias: Guia[] = [];

  for (const o of outros) {
    for (const a of refsX(movido)) {
      for (const b of refsX(o)) {
        const d = Math.abs(a - b);
        if (d <= melhorX) { melhorX = d; dx = b - a; }
      }
    }
    for (const a of refsY(movido)) {
      for (const b of refsY(o)) {
        const d = Math.abs(a - b);
        if (d <= melhorY) { melhorY = d; dy = b - a; }
      }
    }
  }

  // Só desenha a guia onde houve encaixe — linha sem colagem confunde.
  if (melhorX < IMA) {
    for (const a of refsX({ x: movido.x + dx, width: movido.width })) {
      for (const o of outros) if (refsX(o).some((b) => Math.abs(a - b) < 0.5)) guias.push({ eixo: "x", valor: a });
    }
  }
  if (melhorY < IMA) {
    for (const a of refsY({ y: movido.y + dy, height: movido.height })) {
      for (const o of outros) if (refsY(o).some((b) => Math.abs(a - b) < 0.5)) guias.push({ eixo: "y", valor: a });
    }
  }
  return { dx: melhorX < IMA ? dx : 0, dy: melhorY < IMA ? dy : 0, guias };
}

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
  const [abaAtiva, setAbaAtiva] = useState(0);
  const selecao = useSelecao();
  const historico = useHistorico<AbaDoMapa[]>();
  const zoom = useZoom();
  const [ligando, setLigando] = useState<{ boxId: string; ponto: PontoDeConexao } | null>(null);
  const [sujo, setSujo] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; boxId: string } | null>(null);
  /** Seta selecionada — permite apagar UMA ligação, sem levar as outras junto. */
  const [conectorSel, setConectorSel] = useState<string | null>(null);
  /** Ponta solta da linha enquanto se arrasta de uma bolinha até outro bloco. */
  const [previaLigacao, setPreviaLigacao] = useState<{ x: number; y: number } | null>(null);
  const [ajuda, setAjuda] = useState(false);
  const [marquee, setMarquee] = useState<{ ax: number; ay: number; bx: number; by: number } | null>(null);
  /** Linhas de alinhamento mostradas durante o arrasto. */
  const [guias, setGuias] = useState<Guia[]>([]);
  /** Bloco em renomeação no próprio card (não no painel lateral). */
  const [renomeando, setRenomeando] = useState<{ id: string; valor: string } | null>(null);
  /** Nota/texto em edição — conteúdo vai em `texto`, não em `label`. */
  const [editando, setEditando] = useState<{ id: string; valor: string } | null>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const espaco = useRef(false);
  /**
   * Deslocamento do desenho, em px de TELA.
   *
   * Antes o "mover a tela" mexia no scroll do contêiner — e por isso não
   * funcionava: com o desenho cabendo na área visível não há o que rolar, e o
   * Space parecia morto. Com translate a tela move sempre.
   */
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [telaCheia, setTelaCheia] = useState(false);
  const secaoRef = useRef<HTMLElement>(null);
  /** Zoom corrente pra ler DEPOIS do render, quando o estado ainda não chegou. */
  const zoomRef = useRef(1);
  const acabouDeArrastar = useRef(false);
  const areaTransferencia = useRef<{ boxes: BlocoDoMapa[]; connectors: ConectorDoMapa[] } | null>(null);

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
      // Guia só quando se move UM bloco: com vários, "alinhar" não tem uma
      // referência única e as linhas viram ruído.
      let ajusteX = 0;
      let ajusteY = 0;
      let guiasAtivas: Guia[] = [];
      if (origens.size === 1) {
        const alvo = { x: snap(origens.get(bloco.id)!.x + dx), y: snap(origens.get(bloco.id)!.y + dy), width: bloco.width, height: bloco.height };
        const r = calcularGuias(alvo, blocos.filter((o) => o.id !== bloco.id));
        ajusteX = r.dx;
        ajusteY = r.dy;
        guiasAtivas = r.guias;
      }
      setGuias(guiasAtivas);

      alterarAba(
        (a) => ({
          ...a,
          boxes: a.boxes.map((b) => {
            const o = origens.get(b.id);
            if (!o) return b;
            // Trava no zero: bloco arrastado para fora à esquerda ou para cima
            // ficaria inalcançável, sem barra de rolagem que chegue lá.
            return {
              ...b,
              x: Math.max(0, snap(o.x + dx) + ajusteX),
              y: Math.max(0, snap(o.y + dy) + ajusteY),
            };
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
      setGuias([]);
    };
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
  }

  /**
   * Copiar/colar.
   *
   * A área de transferência é um ref local, não a do sistema: colar aqui tem
   * que trazer blocos COM as ligações internas, e o clipboard do navegador só
   * carregaria texto — além de exigir permissão que o navegador nega em parte
   * dos contextos.
   */
  function copiarSelecionados() {
    const alvos = blocos.filter((b) => selecao.ids.has(b.id));
    if (alvos.length === 0) return;
    const ids = new Set(alvos.map((b) => b.id));
    areaTransferencia.current = {
      boxes: alvos.map((b) => ({ ...b })),
      // Só as ligações entre os copiados: uma seta apontando pra fora da
      // seleção não teria destino do outro lado.
      connectors: (aba?.connectors ?? []).filter((c) => ids.has(c.fromBox) && ids.has(c.toBox)),
    };
    toast.success(alvos.length > 1 ? `${alvos.length} blocos copiados` : "Bloco copiado");
  }

  function colar() {
    const area = areaTransferencia.current;
    if (!area || area.boxes.length === 0) return;
    const sufixo = `${Date.now().toString(36)}`;
    // Mapa id-antigo → id-novo pra reapontar as ligações copiadas.
    const novoId = new Map(area.boxes.map((b, i) => [b.id, `b-${sufixo}-${i}`]));
    const blocosNovos = area.boxes.map((b) => ({
      ...b,
      id: novoId.get(b.id)!,
      x: snap(b.x + GRADE * 2),
      y: snap(b.y + GRADE * 2),
    }));
    const conectoresNovos = area.connectors.map((c, i) => ({
      ...c,
      id: `c-${sufixo}-${i}`,
      fromBox: novoId.get(c.fromBox)!,
      toBox: novoId.get(c.toBox)!,
    }));
    alterarAba((a) => ({
      ...a,
      boxes: [...a.boxes, ...blocosNovos],
      connectors: [...a.connectors, ...conectoresNovos],
    }));
    // Cola sobre si mesmo em sequência: colar duas vezes não empilha no mesmo
    // ponto, porque a área guarda a posição já deslocada.
    areaTransferencia.current = { boxes: blocosNovos, connectors: conectoresNovos };
    selecao.definir(blocosNovos.map((b) => b.id));
    toast.success(blocosNovos.length > 1 ? `${blocosNovos.length} blocos colados` : "Bloco colado");
  }

  /**
   * Redimensionar pelo canto. O bloco tem tamanho mínimo porque abaixo disso o
   * rótulo e o selo de status não cabem — e um bloco de 10px é impossível de
   * pegar de volta.
   */
  function iniciarResize(e: React.PointerEvent, b: BlocoDoMapa) {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const x0 = e.clientX;
    const y0 = e.clientY;
    const w0 = b.width;
    const h0 = b.height;
    let primeiro = true;
    const mover = (ev: PointerEvent) => {
      const dw = (ev.clientX - x0) / zoom.valor;
      const dh = (ev.clientY - y0) / zoom.valor;
      alterarAba(
        (a) => ({
          ...a,
          boxes: a.boxes.map((x) =>
            x.id === b.id
              ? { ...x, width: Math.max(120, snap(w0 + dw)), height: Math.max(60, snap(h0 + dh)) }
              : x,
          ),
        }),
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

  /** Grava o conteúdo da nota / bloco de texto. */
  function confirmarTexto() {
    if (!editando) return;
    const alvo = editando.id;
    const valor = editando.valor;
    setEditando(null);
    alterarAba((a) => ({
      ...a,
      boxes: a.boxes.map((b) => (b.id === alvo ? { ...b, texto: valor } : b)),
    }));
  }

  /** Muda um atributo do bloco selecionado (cor, estilo, negrito…). */
  function ajustarBloco(id: string, mudanca: Partial<BlocoDoMapa>) {
    alterarAba((a) => ({ ...a, boxes: a.boxes.map((b) => (b.id === id ? { ...b, ...mudanca } : b)) }));
  }

  /** Grava o nome digitado no próprio bloco. */
  function confirmarRename() {
    if (!renomeando) return;
    const nome = renomeando.valor.trim();
    const alvo = renomeando.id;
    const atual = blocos.find((b) => b.id === alvo);
    setRenomeando(null);
    if (!nome || !atual || nome === atual.label) return;
    alterarAba((a) => ({ ...a, boxes: a.boxes.map((b) => (b.id === alvo ? { ...b, label: nome } : b)) }));
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

  /** Posição livre à direita do que já existe, pra não nascer por cima. */
  function proximaPosicao(): { x: number; y: number } {
    return {
      x: blocos.length === 0 ? 100 : Math.max(...blocos.map((b) => b.x)) + 280,
      y: 160,
    };
  }

  function novoId(prefixo: string): string {
    return `${prefixo}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`;
  }

  /** Nota adesiva: texto solto, sem status nem conexão. */
  function adicionarNota() {
    const id = novoId("n");
    const p = proximaPosicao();
    alterarAba((a) => ({
      ...a,
      boxes: [
        ...a.boxes,
        {
          id, type: TIPO_NOTA, label: "", ...p,
          width: NOTA_LARGURA, height: NOTA_ALTURA,
          color: CORES_NOTA[0].cor, status: "ativo" as StatusBloco,
          texto: "", estilo: "corpo" as const,
        },
      ],
    }));
    selecao.definir([id]);
    setEditando({ id, valor: "" });
  }

  /** Bloco de texto: título ou parágrafo solto no board. */
  function adicionarTexto(estilo: "h1" | "h2" | "h3" | "corpo") {
    const id = novoId("t");
    const p = proximaPosicao();
    alterarAba((a) => ({
      ...a,
      boxes: [
        ...a.boxes,
        {
          id, type: TIPO_TEXTO, label: "", ...p,
          width: TEXTO_LARGURA,
          height: estilo === "h1" ? 56 : estilo === "h2" ? 46 : TEXTO_ALTURA,
          color: "transparent", status: "ativo" as StatusBloco,
          texto: "", estilo,
        },
      ],
    }));
    selecao.definir([id]);
    setEditando({ id, valor: "" });
  }

  /** Bloco genérico com emoji — o "quadradinho" pra qualquer coisa. */
  function adicionarGenerico(emoji: string) {
    const id = novoId("g");
    const p = proximaPosicao();
    alterarAba((a) => ({
      ...a,
      boxes: [
        ...a.boxes,
        {
          id, type: TIPO_GENERICO, label: "Novo bloco", ...p,
          width: LARGURA_PADRAO, height: ALTURA_PADRAO,
          color: CORES_BLOCO[0].cor, status: "construcao" as StatusBloco,
          emoji,
        },
      ],
    }));
    selecao.definir([id]);
  }

  function clicarNoPonto(boxId: string, ponto: PontoDeConexao) {
    if (acabouDeArrastar.current) return;
    if (!ligando) {
      setLigando({ boxId, ponto });
      return;
    }
    if (ligando.boxId === boxId) {
      // Ligar um bloco nele mesmo não significa nada no funil.
      setLigando(null);
      return;
    }

    conectarOuDesligar(ligando.boxId, ligando.ponto, boxId, ponto);
    setLigando(null);
  }

  /**
   * Liga dois blocos — ou desliga, se já estavam ligados nesse sentido.
   *
   * Compara só o PAR e o sentido, ignorando de qual bolinha saiu: quem quer
   * desfazer mira "estes dois blocos", não o mesmo par de âncoras de antes.
   * Exigir as mesmas âncoras faria o desligar funcionar às vezes — pior que
   * não existir.
   */
  function conectarOuDesligar(
    origem: string,
    pontoOrigem: PontoDeConexao,
    destino: string,
    pontoDestino: PontoDeConexao,
  ) {
    if (origem === destino) return;
    const jaLigado = aba?.connectors.some((c) => c.fromBox === origem && c.toBox === destino);
    if (jaLigado) {
      alterarAba((a) => ({
        ...a,
        connectors: a.connectors.filter((c) => !(c.fromBox === origem && c.toBox === destino)),
      }));
      setConectorSel(null);
      toast.success("Ligação removida");
      return;
    }
    alterarAba((a) => ({
      ...a,
      connectors: [
        ...a.connectors,
        {
          id: `c-${Date.now().toString(36)}`,
          fromBox: origem,
          fromPoint: pontoOrigem,
          toBox: destino,
          toPoint: pontoDestino,
          type: "solid",
        } as ConectorDoMapa,
      ],
    }));
  }

  /** Bloco sob o ponteiro, em coordenadas de tela. */
  function blocoSob(cx: number, cy: number): BlocoDoMapa | null {
    const p = paraDesenho(cx, cy);
    // De trás pra frente: o último desenhado é o que está por cima.
    for (let i = blocos.length - 1; i >= 0; i--) {
      const b = blocos[i];
      if (p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height) return b;
    }
    return null;
  }

  /** Âncora do bloco mais perto de onde a linha chegou — a seta cai natural. */
  function ancoraMaisProxima(b: BlocoDoMapa, cx: number, cy: number): PontoDeConexao {
    const p = paraDesenho(cx, cy);
    let melhor: PontoDeConexao = "left";
    let dist = Infinity;
    for (const nome of PONTOS) {
      const a = pontoDoBloco(b, nome);
      const d = (a.x - p.x) ** 2 + (a.y - p.y) ** 2;
      if (d < dist) { dist = d; melhor = nome; }
    }
    return melhor;
  }

  /**
   * Arrastar da bolinha até outro bloco.
   *
   * O mesmo pointerdown serve aos dois gestos: se o ponteiro andou, é arrasto e
   * fecha a ligação onde soltar; se não andou, foi clique e cai no fluxo
   * clicar-clicar, que continua existindo porque é o que funciona no toque.
   */
  function pontoPointerDown(e: React.PointerEvent, b: BlocoDoMapa, ponto: PontoDeConexao) {
    // Sem preventDefault: ele suprime os eventos de mouse de compatibilidade,
    // e junto o `click` de que o fluxo clicar-clicar depende. A seleção de
    // texto já é barrada por `touch-none`/`select-none` no bloco.
    e.stopPropagation();
    const x0 = e.clientX;
    const y0 = e.clientY;
    let arrastou = false;
    setLigando({ boxId: b.id, ponto });

    const mover = (ev: PointerEvent) => {
      if (!arrastou && (Math.abs(ev.clientX - x0) > 4 || Math.abs(ev.clientY - y0) > 4)) arrastou = true;
      if (arrastou) setPreviaLigacao(paraDesenho(ev.clientX, ev.clientY));
    };
    const soltar = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      setPreviaLigacao(null);
      // Não arrastou: mantém `ligando` armado e deixa o clique no outro bloco
      // fechar a ligação.
      if (!arrastou) return;
      // O `click` ainda vai disparar nesta bolinha depois do arrasto; sem esta
      // trava ele rearmaria `ligando` e o próximo clique em qualquer lugar
      // criaria uma ligação fantasma.
      acabouDeArrastar.current = true;
      setTimeout(() => { acabouDeArrastar.current = false; }, 0);
      const alvo = blocoSob(ev.clientX, ev.clientY);
      if (alvo && alvo.id !== b.id) {
        conectarOuDesligar(b.id, ponto, alvo.id, ancoraMaisProxima(alvo, ev.clientX, ev.clientY));
      }
      setLigando(null);
    };
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
  }

  /** Apaga uma seta específica — a que estiver selecionada. */
  function removerConector(id: string) {
    alterarAba((a) => ({ ...a, connectors: a.connectors.filter((c) => c.id !== id) }));
    setConectorSel(null);
    toast.success("Ligação removida");
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
      x: (cx - r.left - pan.x) / zoom.valor,
      y: (cy - r.top - pan.y) / zoom.valor,
    };
  }, [zoom.valor, pan]);

  /** Seleção por área e mover a tela com Space/botão do meio. */
  function fundoPointerDown(e: React.PointerEvent) {
    if (e.button === 2 || ligando) return;
    setMenu(null);

    if (e.button === 1 || espaco.current) {
      const sx = e.clientX;
      const sy = e.clientY;
      const p0 = { ...pan };
      const mover = (ev: PointerEvent) => {
        setPan({ x: p0.x + (ev.clientX - sx), y: p0.y + (ev.clientY - sy) });
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
    const minX = Math.min(...blocos.map((b) => b.x));
    const minY = Math.min(...blocos.map((b) => b.y));
    const maxX = Math.max(...blocos.map((b) => b.x + b.width));
    const maxY = Math.max(...blocos.map((b) => b.y + b.height));
    const pad = 60;
    zoom.enquadrar(
      { w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 },
      { w: el.clientWidth, h: el.clientHeight },
    );
    // O zoom novo só vale no próximo render; centraliza com ele já aplicado.
    requestAnimationFrame(() => {
      const z = zoomRef.current;
      setPan({
        x: el.clientWidth / 2 - ((minX + maxX) / 2) * z,
        y: el.clientHeight / 2 - ((minY + maxY) / 2) * z,
      });
    });
  }

  /** Tela cheia de verdade (Fullscreen API), não só "enquadrar". */
  async function alternarTelaCheia() {
    const el = secaoRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await el.requestFullscreen();
    } catch {
      toast.error("O navegador recusou a tela cheia");
    }
  }

  // ---- Abas do mapa ------------------------------------------------------
  // O modelo sempre teve várias abas (um lançamento tem o funil principal, o de
  // remarketing, o de upsell); faltava a interface.

  function adicionarAba() {
    const nova: AbaDoMapa = {
      id: `t-${Date.now().toString(36)}`,
      name: `Aba ${(abas?.length ?? 0) + 1}`,
      boxes: [],
      connectors: [],
    };
    setAbas((atuais) => {
      if (!atuais) return atuais;
      historico.registrar(atuais);
      return [...atuais, nova];
    });
    setAbaAtiva(abas?.length ?? 0);
    selecao.limpar();
    setSujo(true);
  }

  function renomearAba(indice: number, nome: string) {
    setAbas((atuais) => {
      if (!atuais) return atuais;
      const copia = [...atuais];
      copia[indice] = { ...copia[indice], name: nome };
      return copia;
    });
    setSujo(true);
  }

  function removerAba(indice: number) {
    // Uma aba tem que sobrar: sem nenhuma, o canvas não teria onde desenhar e
    // o `abaAtiva` apontaria pro vazio.
    if ((abas?.length ?? 0) <= 1) {
      toast.error("O mapa precisa de pelo menos uma aba");
      return;
    }
    setAbas((atuais) => {
      if (!atuais) return atuais;
      historico.registrar(atuais);
      return atuais.filter((_, i) => i !== indice);
    });
    setAbaAtiva((a) => (a >= indice && a > 0 ? a - 1 : a));
    selecao.limpar();
    setSujo(true);
  }

  /**
   * Auto-save.
   *
   * Dispara 2s depois da última alteração, não a cada mudança: arrastar um
   * bloco emite dezenas de frames e viraria dezenas de PUTs. O botão Salvar
   * continua existindo pra quem quer gravar na hora — e some do caminho quando
   * não há nada pendente.
   */
  const salvarRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!sujo || !abas) return;
    const t = setTimeout(() => salvarRef.current?.(), 2000);
    return () => clearTimeout(t);
  }, [sujo, abas]);

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
  // O efeito acima chama a versão mais recente sem se re-agendar a cada render.
  salvarRef.current = salvarMapa;

  useEffect(() => { zoomRef.current = zoom.valor; }, [zoom.valor]);

  // O navegador pode sair da tela cheia por fora (Esc, gesto do SO) — sem
  // escutar, o botão ficaria mentindo sobre o estado.
  useEffect(() => {
    const aoMudar = () => setTelaCheia(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", aoMudar);
    return () => document.removeEventListener("fullscreenchange", aoMudar);
  }, []);

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
      if (mod && e.key.toLowerCase() === "c") { e.preventDefault(); copiarSelecionados(); return; }
      if (mod && e.key.toLowerCase() === "v") { e.preventDefault(); colar(); return; }
      if (mod && (e.key === "=" || e.key === "+")) { e.preventDefault(); zoom.aumentar(); return; }
      if (mod && e.key === "-") { e.preventDefault(); zoom.diminuir(); return; }
      if (mod && e.key === "0") { e.preventDefault(); enquadrarTudo(); return; }

      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        // Seta selecionada tem prioridade: quem acabou de clicar numa ligação
        // espera apagar ELA, não os blocos que ainda estavam selecionados.
        if (conectorSel) removerConector(conectorSel);
        else removerSelecionados();
        return;
      }
      if (e.key === "Escape") { selecao.limpar(); setConectorSel(null); setLigando(null); setMenu(null); setAjuda(false); setRenomeando(null); return; }
      if (e.key === "?") { e.preventDefault(); setAjuda((v) => !v); return; }
      if (e.key.toLowerCase() === "f" && !mod) { e.preventDefault(); void alternarTelaCheia(); return; }
      if ((e.key === "F2" || e.key === "Enter") && selecao.unico) {
        e.preventDefault();
        const b = blocos.find((x) => x.id === selecao.unico);
        if (b) setRenomeando({ id: b.id, valor: b.label });
        return;
      }

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
    <section
      ref={secaoRef}
      className="space-y-3 rounded-xl border border-border/40 bg-card/60 p-4 data-[cheia=true]:rounded-none"
      data-cheia={telaCheia}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">Mapa do funil</h3>
          <p className="text-[11px] text-muted-foreground">
            {data?.rascunho && !sujo
              ? "Sugestão a partir das etapas cadastradas — arraste, adicione e salve para tornar seu."
              : ligando
                ? "Solte em cima de outro bloco para ligar — ou clique nele. Esc cancela."
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
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={enquadrarTudo} aria-label="Enquadrar tudo" title="Enquadrar tudo (⌘0)">
              <Scan className="h-3 w-3" />
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
          <Button
            variant="ghost" size="icon" className="h-6 w-6"
            onClick={alternarTelaCheia}
            aria-label={telaCheia ? "Sair da tela cheia" : "Tela cheia"}
            title={telaCheia ? "Sair da tela cheia" : "Tela cheia"}
          >
            {telaCheia ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setAjuda(true)} aria-label="Atalhos">
            <Keyboard className="h-3 w-3" />
          </Button>
          {ligando && (
            <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-[11px]" onClick={() => setLigando(null)}>
              <X className="h-3 w-3" /> Cancelar ligação
            </Button>
          )}
          {(sujo || salvar.isPending) && (
            <span className="mr-1 text-[11px] text-muted-foreground">
              {salvar.isPending ? "salvando…" : "salva sozinho"}
            </span>
          )}
          <Button size="sm" className="h-7 gap-1.5 px-2 text-[11px]" onClick={salvarMapa} disabled={salvar.isPending || !sujo}>
            {salvar.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            Salvar
          </Button>
        </div>
      </div>

      {/* Abas do mapa. Aparece a partir de duas — com uma só, a barra seria
          uma linha de cromo sem função. O "+" fica sempre visível. */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-border/40 pb-1">
        {(abas ?? []).map((t, i) => (
          <div key={t.id} className="group/aba flex shrink-0 items-center">
            <button
              type="button"
              onClick={() => { setAbaAtiva(i); selecao.limpar(); setConectorSel(null); }}
              onDoubleClick={() => {
                const nome = window.prompt("Nome da aba", t.name);
                if (nome && nome.trim()) renomearAba(i, nome.trim());
              }}
              className={`rounded-t px-2.5 py-1 text-[11px] transition-colors ${
                i === abaAtiva
                  ? "border-b-2 border-primary font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title="Duplo clique renomeia"
            >
              {t.name}
            </button>
            {(abas?.length ?? 0) > 1 && (
              <button
                type="button"
                onClick={() => removerAba(i)}
                aria-label={`Remover aba ${t.name}`}
                className="ml-0.5 text-muted-foreground/40 opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover/aba:opacity-100"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={adicionarAba}
          className="shrink-0 rounded px-1.5 py-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Nova aba"
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>

      <div className="flex gap-3">
        {/* Paleta */}
        <div className="hidden w-44 shrink-0 space-y-2 overflow-y-auto md:block" style={{ maxHeight: altura }}>
          {/* Blocos livres: anotar e organizar, não peças do funil. */}
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Anotar
            </p>
            <div className="space-y-0.5">
              <button
                type="button"
                onClick={adicionarNota}
                className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-[11px] transition-colors hover:bg-muted"
              >
                <StickyNote className="h-3 w-3 shrink-0" />
                Nota
              </button>
              {(["h1", "h2", "h3", "corpo"] as const).map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => adicionarTexto(e)}
                  className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-[11px] transition-colors hover:bg-muted"
                >
                  <Type className="h-3 w-3 shrink-0" />
                  {e === "corpo" ? "Texto" : e.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Genéricos: o "quadradinho" pra qualquer coisa que o funil tenha. */}
          {EMOJIS_GENERICOS.map((g) => (
            <div key={g.grupo}>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {g.grupo}
              </p>
              <div className="flex flex-wrap gap-0.5">
                {g.itens.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => adicionarGenerico(emoji)}
                    title={`Bloco ${emoji}`}
                    className="rounded px-1 py-0.5 text-sm transition-colors hover:bg-muted"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          ))}

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
          className="relative flex-1 touch-none overflow-hidden rounded-lg border border-border/40"
          style={{
            height: telaCheia ? "calc(100vh - 190px)" : altura,
            cursor: espaco.current ? "grab" : "default",
            // A grade acompanha o pan e o zoom — é a referência visual de que a
            // tela está se movendo.
            backgroundImage: "radial-gradient(circle, var(--color-border) 1px, transparent 1px)",
            backgroundSize: `${20 * zoom.valor}px ${20 * zoom.valor}px`,
            backgroundPosition: `${pan.x}px ${pan.y}px`,
          }}
          onWheel={fundoWheel}
          onPointerDown={fundoPointerDown}
          onClick={() => { if (!arrastouMarquee.current) { selecao.limpar(); setConectorSel(null); setLigando(null); } }}
          onContextMenu={(e) => e.preventDefault()}
        >
          <div
            className="absolute left-0 top-0 origin-top-left"
            style={{
              width: largura,
              height: alturaDoDesenho,
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom.valor})`,
            }}
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
                const d = caminhoDaSeta(pontoDoBloco(de, c.fromPoint), c.fromPoint, pontoDoBloco(para, c.toPoint), c.toPoint);
                const ativa = conectorSel === c.id;
                return (
                  <g key={c.id}>
                    {/* Trilha invisível e grossa: acertar uma linha de 2px com o
                        mouse é quase impossível, então o alvo de clique é bem
                        maior que o traço que se vê. */}
                    <path
                      d={d}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={16}
                      className="pointer-events-auto cursor-pointer"
                      onClick={(e) => { e.stopPropagation(); setConectorSel(c.id); selecao.limpar(); }}
                      onDoubleClick={(e) => { e.stopPropagation(); removerConector(c.id); }}
                    />
                    <path
                      d={d}
                      fill="none"
                      stroke="currentColor"
                      className={`pointer-events-none ${ativa ? "text-primary" : "text-muted-foreground/60"}`}
                      strokeWidth={ativa ? 3 : 2}
                      strokeDasharray={c.type === "dashed" ? "8 4" : undefined}
                      markerEnd="url(#seta-mapa)"
                    />
                  </g>
                );
              })}

              {/* Linha solta enquanto se arrasta da bolinha até o alvo. */}
              {ligando && previaLigacao && (() => {
                const de = blocos.find((b) => b.id === ligando.boxId);
                if (!de) return null;
                const origem = pontoDoBloco(de, ligando.ponto);
                return (
                  <path
                    d={`M ${origem.x} ${origem.y} L ${previaLigacao.x} ${previaLigacao.y}`}
                    fill="none"
                    stroke="currentColor"
                    className="pointer-events-none text-primary"
                    strokeWidth={2}
                    strokeDasharray="6 4"
                  />
                );
              })()}

              {/* Guias de alinhamento — some assim que o bloco é solto. */}
              {guias.map((g, i) => (
                <line
                  key={`${g.eixo}-${g.valor}-${i}`}
                  x1={g.eixo === "x" ? g.valor : 0}
                  y1={g.eixo === "x" ? 0 : g.valor}
                  x2={g.eixo === "x" ? g.valor : largura}
                  y2={g.eixo === "x" ? alturaDoDesenho : g.valor}
                  stroke="currentColor"
                  className="pointer-events-none text-primary/70"
                  strokeWidth={1}
                  strokeDasharray="4 4"
                />
              ))}
            </svg>

            {blocos.map((b) => {
              const meta = metaDoTipo(b.type);
              const ativo = selecao.tem(b.id);

              // Nota e texto têm desenho próprio: sem selo de status, sem card
              // de peça do funil. Compartilham só o gesto de arrastar.
              if (b.type === TIPO_NOTA || b.type === TIPO_TEXTO) {
                const ehNota = b.type === TIPO_NOTA;
                const tamanho = b.fonte ?? TAMANHO_DO_ESTILO[b.estilo ?? "corpo"] ?? 14;
                return (
                  <div
                    key={b.id}
                    onPointerDown={(e) => iniciarArrasto(e, b)}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      selecao.definir([b.id]);
                      setEditando({ id: b.id, valor: b.texto ?? "" });
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (!selecao.tem(b.id)) selecao.definir([b.id]);
                      setMenu({ x: e.clientX, y: e.clientY, boxId: b.id });
                    }}
                    className={`absolute cursor-grab touch-none select-none active:cursor-grabbing ${
                      ehNota ? "rounded-sm p-2 shadow-md" : "p-1"
                    } ${ativo ? "ring-2 ring-primary ring-offset-1" : ""}`}
                    style={{
                      left: b.x, top: b.y, width: b.width, height: b.height,
                      background: ehNota ? b.color : "transparent",
                      // Nota tem cor de papel clara sempre: texto escuro nela é
                      // legível nos dois temas, e herdar o foreground do tema
                      // deixaria branco-no-amarelo no dark.
                      color: ehNota ? "#1f2937" : undefined,
                    }}
                  >
                    {editando?.id === b.id ? (
                      <textarea
                        autoFocus
                        value={editando.valor}
                        onChange={(ev) => setEditando({ id: b.id, valor: ev.target.value })}
                        onBlur={confirmarTexto}
                        onKeyDown={(ev) => {
                          if (ev.key === "Escape") { ev.preventDefault(); setEditando(null); }
                          // Enter quebra linha; ⌘/Ctrl+Enter fecha a edição.
                          if (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey)) { ev.preventDefault(); confirmarTexto(); }
                        }}
                        onPointerDown={(ev) => ev.stopPropagation()}
                        className="h-full w-full resize-none bg-transparent outline-none"
                        style={{
                          fontSize: tamanho,
                          fontWeight: b.negrito ? 700 : ehNota ? 400 : 600,
                          fontStyle: b.italico ? "italic" : "normal",
                          color: ehNota ? "#1f2937" : "var(--color-foreground)",
                        }}
                      />
                    ) : (
                      <div
                        className="h-full w-full overflow-hidden whitespace-pre-wrap break-words"
                        style={{
                          fontSize: tamanho,
                          fontWeight: b.negrito ? 700 : ehNota ? 400 : 600,
                          fontStyle: b.italico ? "italic" : "normal",
                          lineHeight: 1.25,
                          color: ehNota ? "#1f2937" : "var(--color-foreground)",
                        }}
                      >
                        {b.texto || (
                          <span className="opacity-40">
                            {ehNota ? "Duplo clique pra escrever" : "Texto"}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <div
                  key={b.id}
                  onPointerDown={(e) => iniciarArrasto(e, b)}
                  onClick={(e) => { e.stopPropagation(); selecao.clicar(b.id, e.shiftKey); }}
                  onDoubleClick={(e) => { e.stopPropagation(); selecao.definir([b.id]); setRenomeando({ id: b.id, valor: b.label }); }}
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
                  {/* Editando: o input SUBSTITUI o conteúdo do card.
                      Antes ele flutuava por cima e o nome antigo continuava
                      aparecendo atrás — parecia bug. */}
                  {renomeando?.id === b.id ? (
                    <div onPointerDown={(ev) => ev.stopPropagation()}>
                      <Input
                        autoFocus
                        value={renomeando.valor}
                        onChange={(ev) => setRenomeando({ id: b.id, valor: ev.target.value })}
                        onBlur={confirmarRename}
                        onKeyDown={(ev) => {
                          if (ev.key === "Enter") { ev.preventDefault(); confirmarRename(); }
                          if (ev.key === "Escape") { ev.preventDefault(); setRenomeando(null); }
                        }}
                        onFocus={(ev) => ev.currentTarget.select()}
                        className="h-6 px-1 text-[11px]"
                      />
                      <p className="mt-1 text-[9px] text-muted-foreground">Enter salva · Esc cancela</p>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-1.5">
                        {b.emoji ? (
                          <span className="shrink-0 text-sm leading-none">{b.emoji}</span>
                        ) : (
                          <IconePorNome nome={meta.icon} className="h-3.5 w-3.5 shrink-0" />
                        )}
                        <span className="truncate text-[11px] font-medium" title={b.label}>{b.label}</span>
                      </div>
                      <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{meta.label}</p>
                    </>
                  )}
                  {renomeando?.id !== b.id && (
                  <span
                    className="absolute bottom-1.5 right-2 flex items-center gap-1 text-[9px]"
                    style={{ color: STATUS[b.status]?.color }}
                    title={STATUS[b.status]?.label}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: STATUS[b.status]?.color }} />
                    {STATUS[b.status]?.label}
                  </span>
                  )}
                  {/* Etapa de verdade do Loyola X: o mapa mostra quais blocos
                      têm dado atrás e quais são só plano. */}
                  {b.stageId && (
                    <span className="absolute left-1.5 top-[-8px] rounded bg-primary px-1 text-[8px] font-medium text-primary-foreground">
                      etapa
                    </span>
                  )}

                  {/* Alça de redimensionar — só no bloco selecionado, senão
                      vira ruído em cima de cada card. */}
                  {ativo && (
                    <span
                      role="presentation"
                      onPointerDown={(ev) => iniciarResize(ev, b)}
                      className="absolute -bottom-1 -right-1 z-20 h-3 w-3 cursor-nwse-resize touch-none rounded-sm border border-primary bg-background"
                    />
                  )}

                  {PONTOS.map((p) => {
                    const pos = pontoDoBloco({ ...b, x: 0, y: 0 }, p);
                    return (
                      <button
                        key={p}
                        type="button"
                        onPointerDown={(e) => pontoPointerDown(e, b, p)}
                        onClick={(e) => { e.stopPropagation(); clicarNoPonto(b.id, p); }}
                        className={`absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 cursor-crosshair touch-none rounded-full border transition-colors ${
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
            {/* Cor da caixa (item 8). Nota usa a paleta de papel; o resto usa
                as cores de elemento. */}
            <div className="space-y-1">
              <Label className="text-[10px]">Cor</Label>
              <div className="flex flex-wrap gap-1">
                {(blocoSelecionado.type === TIPO_NOTA ? CORES_NOTA : CORES_BLOCO).map((c) => (
                  <button
                    key={c.cor}
                    type="button"
                    title={c.nome}
                    onClick={() => ajustarBloco(blocoSelecionado.id, { color: c.cor })}
                    className={`h-5 w-5 rounded border transition-transform hover:scale-110 ${
                      blocoSelecionado.color === c.cor ? "ring-2 ring-primary ring-offset-1" : "border-border/60"
                    }`}
                    style={{ background: c.cor }}
                  />
                ))}
              </div>
            </div>

            {/* Formatação — só faz sentido em nota e texto. */}
            {(blocoSelecionado.type === TIPO_NOTA || blocoSelecionado.type === TIPO_TEXTO) && (
              <div className="space-y-1">
                <Label className="text-[10px]">Texto</Label>
                <div className="flex flex-wrap gap-1">
                  {(["h1", "h2", "h3", "corpo"] as const).map((e) => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => ajustarBloco(blocoSelecionado.id, { estilo: e, fonte: null })}
                      className={`rounded border px-1.5 py-0.5 text-[10px] transition-colors ${
                        (blocoSelecionado.estilo ?? "corpo") === e
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border/60 hover:bg-muted"
                      }`}
                    >
                      {e === "corpo" ? "Normal" : e.toUpperCase()}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => ajustarBloco(blocoSelecionado.id, { negrito: !blocoSelecionado.negrito })}
                    className={`rounded border px-1.5 py-0.5 text-[10px] font-bold transition-colors ${
                      blocoSelecionado.negrito ? "border-primary bg-primary/10 text-primary" : "border-border/60 hover:bg-muted"
                    }`}
                  >
                    B
                  </button>
                  <button
                    type="button"
                    onClick={() => ajustarBloco(blocoSelecionado.id, { italico: !blocoSelecionado.italico })}
                    className={`rounded border px-1.5 py-0.5 text-[10px] italic transition-colors ${
                      blocoSelecionado.italico ? "border-primary bg-primary/10 text-primary" : "border-border/60 hover:bg-muted"
                    }`}
                  >
                    I
                  </button>
                </div>
                <div className="flex items-center gap-1.5 pt-0.5">
                  <span className="text-[10px] text-muted-foreground">Tamanho</span>
                  <input
                    type="range"
                    min={10}
                    max={64}
                    value={blocoSelecionado.fonte ?? TAMANHO_DO_ESTILO[blocoSelecionado.estilo ?? "corpo"] ?? 14}
                    onChange={(e) => ajustarBloco(blocoSelecionado.id, { fonte: Number(e.target.value) })}
                    className="h-1 flex-1"
                  />
                  <span className="w-6 text-right font-mono text-[10px] text-muted-foreground">
                    {blocoSelecionado.fonte ?? TAMANHO_DO_ESTILO[blocoSelecionado.estilo ?? "corpo"] ?? 14}
                  </span>
                </div>
              </div>
            )}

            {/* Status não se aplica a anotação — é atributo de peça do funil. */}
            {!ehBlocoLivre(blocoSelecionado.type) && (
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
            )}
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
              onClick={() => {
                const b = blocos.find((x) => x.id === menu.boxId);
                selecao.definir([menu.boxId]);
                setMenu(null);
                if (b) setRenomeando({ id: b.id, valor: b.label });
              }}
            />
            <ItemDoMenu icon={Copy} label="Duplicar" atalho="⌘D" onClick={() => { duplicarSelecionados(); setMenu(null); }} />
            <ItemDoMenu icon={ClipboardCopy} label="Copiar" atalho="⌘C" onClick={() => { copiarSelecionados(); setMenu(null); }} />
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
      ["Duplo clique", "Renomeia (ou edita nota/texto)"],
      ["F2 / Enter", "Renomeia no bloco"],
      ["⌘D", "Duplica"],
      ["⌘C / ⌘V", "Copia / cola (com ligações)"],
      ["Arrastar o canto", "Redimensiona"],
      ["Del", "Remove"],
      ["⌘Z / ⇧⌘Z", "Desfaz / refaz"],
      ["⌘S", "Salva agora (salva sozinho também)"],
      ["Setas", "Move 20px (Shift = 100px)"],
    ],
  },
  {
    grupo: "Navegação",
    itens: [
      ["Space + arraste", "Move a tela"],
      ["F", "Tela cheia"],
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
      ["Arrastar da bolinha", "Liga até onde soltar"],
      ["Clique na bolinha", "Começa; clique no alvo fecha"],
      ["Repetir a ligação", "Desliga os dois blocos"],
      ["Clique na seta", "Seleciona (Del apaga)"],
      ["Duplo clique na seta", "Apaga a ligação"],
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
