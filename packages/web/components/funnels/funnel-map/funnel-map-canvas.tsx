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
  ChevronDown, ChevronRight, ClipboardCopy, Copy, FileDown, Keyboard, Loader2, Maximize2, Minimize2, Minus, Spline, Waypoints,
  PanelLeftClose, PanelLeftOpen, Pencil, Plus, RotateCcw, Save, Scan, Search,
  StickyNote, Trash2, Type, Undo2, Redo2, Unlink, X,
} from "lucide-react";
import { toast } from "sonner";
import { imagemDoEvento, useSubirImagemDoMapa } from "@/lib/hooks/use-mapa-imagem";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CATEGORIAS,
  CORES_BLOCO,
  CORES_NOTA,
  ICONES_GENERICOS,
  NOTA_ALTURA,
  NOTA_LARGURA,
  TAMANHO_DO_ESTILO,
  TEXTO_ALTURA,
  TEXTO_LARGURA,
  TIPO_GENERICO,
  IMAGEM_ALTURA,
  IMAGEM_LARGURA,
  TIPO_IMAGEM,
  TIPO_NOTA,
  TIPO_TEXTO,
  ALTURA_PADRAO,
  LARGURA_PADRAO,
  metaDoTipo,
  type StatusBloco,
} from "@/lib/utils/funnel-map-palette";
import { exportarMapaEmPdf } from "@/lib/utils/funnel-map-pdf";
import {
  GRADE, snap, useHistorico, useSelecao, useZoom,
} from "@/lib/hooks/use-canvas-ux";
import {
  useMapaPorEndereco,
  useSalvarMapaPorEndereco,
  type EnderecoDoMapa,
  type AbaDoMapa,
  type BlocoDoMapa,
  type ConectorDoMapa,
  type PontoDeConexao,
} from "@/lib/hooks/use-funnel-map";

/** Ícone por nome, com fallback — nome errado não derruba o mapa. */
function IconePorNome({
  nome,
  className,
  style,
}: {
  nome: string;
  className?: string;
  /** Usado para tingir o ícone com a cor do tipo do bloco. */
  style?: React.CSSProperties;
}) {
  const Componente = (
    Icons as unknown as Record<
      string,
      React.ComponentType<{ className?: string; style?: React.CSSProperties }>
    >
  )[nome];
  const Final = Componente ?? Icons.Square;
  return <Final className={className} style={style} />;
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
/**
 * Caminho em angulos retos, no lugar da curva.
 *
 * Sai perpendicular a ancora, dobra no meio e chega perpendicular a outra —
 * o desenho de fluxograma. Num mapa com muitas ligacoes paralelas, as curvas
 * de Bezier se cruzam e vira dificil seguir qual sai de onde; as retas se
 * empilham e continuam legiveis.
 *
 * O raio de 8px nas dobras evita o canto vivo, que fica duro na tela.
 */
function caminhoRetoDaSeta(
  de: { x: number; y: number },
  dePonto: PontoDeConexao,
  para: { x: number; y: number },
  paraPonto: PontoDeConexao,
): string {
  const SAIDA = 24;
  const sai = (p: PontoDeConexao, base: { x: number; y: number }) => {
    switch (p) {
      case "right": return { x: base.x + SAIDA, y: base.y };
      case "left": return { x: base.x - SAIDA, y: base.y };
      case "top": return { x: base.x, y: base.y - SAIDA };
      case "bottom": return { x: base.x, y: base.y + SAIDA };
    }
  };
  const a = sai(dePonto, de);
  const b = sai(paraPonto, para);

  // Horizontal quando a saida e por um lado; vertical quando por cima/baixo.
  const horizontal = dePonto === "left" || dePonto === "right";
  const meio = horizontal ? (a.x + b.x) / 2 : (a.y + b.y) / 2;
  const pontos = horizontal
    ? [de, a, { x: meio, y: a.y }, { x: meio, y: b.y }, b, para]
    : [de, a, { x: a.x, y: meio }, { x: b.x, y: meio }, b, para];

  return pontos
    .map((pt, i) => `${i === 0 ? "M" : "L"} ${pt.x} ${pt.y}`)
    .join(" ");
}

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

/**
 * Uma seção da paleta, recolhível.
 *
 * `visivel` existe por causa da busca: a seção some inteira quando nenhum item
 * dela casa, em vez de virar um cabeçalho órfão sobre o vazio.
 */
function Secao({
  titulo, chave, cor, fechada, alternar, visivel, children,
}: {
  titulo: string;
  chave: string;
  cor?: string;
  fechada: Set<string>;
  alternar: (chave: string) => void;
  visivel: boolean;
  children: React.ReactNode;
}) {
  if (!visivel) return null;
  const aberta = !fechada.has(chave);
  return (
    <div>
      <button
        type="button"
        onClick={() => alternar(chave)}
        className="mb-1 flex w-full items-center gap-1 rounded text-[10px] font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
      >
        {aberta ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
        {cor && <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: cor }} />}
        <span className="truncate">{titulo}</span>
      </button>
      {aberta && children}
    </div>
  );
}

interface Props {
  /**
   * Onde este mapa mora.
   *
   * Os três juntos endereçam o mapa que é etapa de um funil. O mapa avulso não
   * tem nenhum deles e vem por `mapId` — ver `EnderecoDoMapa`.
   */
  projectId?: string;
  funnelId?: string;
  stageId?: string;
  /** Mapa avulso, criado do Global sem funil. */
  mapId?: string;
  /** Altura da área de desenho. A etapa dedicada usa a tela quase inteira. */
  /** Px, ou qualquer expressao CSS de altura. */
  altura?: number | string;
}

export function FunnelMapCanvas({ projectId, funnelId, stageId, mapId, altura = 520 }: Props) {
  const endereco: EnderecoDoMapa =
    mapId && !stageId
      ? { tipo: "avulso", mapId }
      : { tipo: "funil", projectId: projectId!, funnelId: funnelId!, stageId: stageId! };
  const { data, isLoading } = useMapaPorEndereco(endereco);
  const salvar = useSalvarMapaPorEndereco(endereco);

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
  /**
   * Curva ou reta, para o mapa inteiro.
   *
   * Preferencia de quem desenha, nao propriedade da ligacao: um mapa com
   * metade das setas curvas e metade retas fica sujo, e ninguem escolhe isso
   * de proposito seta a seta. Fica no `localStorage` porque acompanha a
   * pessoa, nao o documento.
   */
  const [setasRetas, setSetasRetas] = useState(false);
  /** Escrevendo o texto de uma ligação. `null` = ninguém editando. */
  const [rotulando, setRotulando] = useState<{ id: string; valor: string } | null>(null);
  useEffect(() => {
    try { setSetasRetas(localStorage.getItem("mapa:setas") === "retas"); } catch { /* ignora */ }
  }, []);
  function alternarSetas() {
    setSetasRetas((v) => {
      const novo = !v;
      try { localStorage.setItem("mapa:setas", novo ? "retas" : "curvas"); } catch { /* ignora */ }
      return novo;
    });
  }
  /**
   * O seletor que abre no duplo clique de uma bolinha.
   *
   * Guarda de ONDE saiu (bloco e âncora) e a posição na tela, porque o popup
   * é desenhado fora do quadro — em coordenada de janela, não de desenho.
   */
  const [criarDoPonto, setCriarDoPonto] = useState<{
    boxId: string;
    ponto: PontoDeConexao;
    x: number;
    y: number;
  } | null>(null);
  const [buscaDoPonto, setBuscaDoPonto] = useState("");
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
  /** O nó que contém blocos e conectores — é ele que a exportação fotografa. */
  const desenhoRef = useRef<HTMLDivElement>(null);
  const espaco = useRef(false);
  /**
   * Deslocamento do desenho, em px de TELA.
   *
   * Antes o "mover a tela" mexia no scroll do contêiner — e por isso não
   * funcionava: com o desenho cabendo na área visível não há o que rolar, e o
   * Space parecia morto. Com translate a tela move sempre.
   */
  const [pan, setPan] = useState({ x: 0, y: 0 });

  // ---- Paleta: aberta/fechada, busca e seções recolhidas -------------------
  // A preferência é de quem está usando e vale por navegador; guardar no banco
  // faria uma pessoa mudar a barra da outra.
  const [paletaAberta, setPaletaAberta] = useState(true);
  const subirImagem = useSubirImagemDoMapa();
  /** Realce enquanto um arquivo paira sobre o canvas. */
  const [arrastandoArquivo, setArrastandoArquivo] = useState(false);
  const [busca, setBusca] = useState("");
  const [fechadas, setFechadas] = useState<Set<string>>(new Set());
  useEffect(() => {
    try {
      setPaletaAberta(localStorage.getItem("mapa:paleta") !== "0");
      const cru = localStorage.getItem("mapa:secoes");
      if (cru) setFechadas(new Set(JSON.parse(cru) as string[]));
    } catch {
      /* modo privado ou storage bloqueado: fica no padrão */
    }
  }, []);
  function alternarPaleta() {
    setPaletaAberta((v) => {
      try { localStorage.setItem("mapa:paleta", v ? "0" : "1"); } catch { /* ignora */ }
      return !v;
    });
  }
  function alternarSecao(chave: string) {
    setFechadas((atual) => {
      const nova = new Set(atual);
      if (nova.has(chave)) nova.delete(chave); else nova.add(chave);
      try { localStorage.setItem("mapa:secoes", JSON.stringify([...nova])); } catch { /* ignora */ }
      return nova;
    });
  }
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
            // Sem trava no zero. Ela existia quando a área rolava e nada
            // acima do topo era alcançável; hoje o mapa é panorâmico e o
            // ⌘0 enquadra tudo, então o único efeito da trava era impedir
            // de subir — e ACHATAR a seleção múltipla contra o topo, porque
            // o bloco que batia em 0 parava enquanto os outros seguiam.
            return {
              ...b,
              x: snap(o.x + dx) + ajusteX,
              y: snap(o.y + dy) + ajusteY,
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
   * Redimensionar pelo canto.
   *
   * O mínimo é por tipo. O card do funil precisa de espaço para rótulo e selo;
   * já um bloco de TEXTO de uma linha tem 28px de altura, e obrigá-lo a 60
   * faria a alça "empurrar" o bloco para cima do próprio tamanho na primeira
   * mexida. Abaixo desses valores o bloco vira um ponto impossível de pegar de
   * volta.
   */
  function minimoDoTipo(tipo: string): { w: number; h: number } {
    if (tipo === TIPO_TEXTO) return { w: 80, h: 28 };
    if (tipo === TIPO_NOTA) return { w: 100, h: 80 };
    if (tipo === TIPO_IMAGEM) return { w: 220, h: 150 };
    return { w: 120, h: 60 };
  }

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
              ? {
                  ...x,
                  width: Math.max(minimoDoTipo(b.type).w, snap(w0 + dw)),
                  height: Math.max(minimoDoTipo(b.type).h, snap(h0 + dh)),
                }
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
    // Quem estava selecionado vira a origem da ligação — ver `ligarAoAnterior`.
    const anterior = selecao.unico;
    const blocoAnterior = anterior ? (blocos.find((b) => b.id === anterior) ?? null) : null;
    const id = `b-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`;
    // Encadeando, nasce a frente do anterior; solto, no centro da tela.
    const p = blocoAnterior ? posicaoAFrente(blocoAnterior) : proximaPosicao();
    alterarAba((a) => ({
      ...a,
      boxes: [
        ...a.boxes,
        { id, type: tipo, label, ...p, width: LARGURA_PADRAO, height: ALTURA_PADRAO, color: cor, status: "ativo" as StatusBloco },
      ],
    }));
    // Lido ANTES de trocar a seleção: `selecao.definir` já aponta para o novo.
    ligarAoAnterior(anterior, id);
    selecao.definir([id]);
  }

  /**
   * Onde um elemento novo nasce: no meio do que está visível.
   *
   * Antes ia para a direita de tudo que já existia — com um mapa grande, o
   * bloco nascia longe da vista e a pessoa tinha que sair procurando para
   * confirmar que foi criado. Nascer no centro da tela dispensa mover a câmera:
   * o elemento aparece onde o olho já está.
   */
  /**
   * Ponto da TELA para coordenada do quadro.
   *
   * Descontar o pan e dividir pelo zoom é o que faz a imagem nascer sob o
   * cursor: sem isso, largar um arquivo com o quadro deslocado ou ampliado
   * põe o bloco longe de onde a pessoa soltou.
   */
  function posicaoNoQuadro(clientX: number, clientY: number): { x: number; y: number } {
    const el = areaRef.current;
    if (!el) return { x: 200, y: 200 };
    const r = el.getBoundingClientRect();
    const z = zoom.valor;
    return {
      x: snap((clientX - r.left - pan.x) / z - IMAGEM_LARGURA / 2),
      y: snap((clientY - r.top - pan.y) / z - IMAGEM_ALTURA / 2),
    };
  }

  /**
   * O lugar do bloco que continua outro: logo a frente dele.
   *
   * Encadear e um gesto espacial — a peca seguinte fica onde o olho ja esta,
   * e nao no centro da tela. Nascer no centro obrigava a arrastar de volta a
   * cada bloco, o que anulava boa parte do ganho de ja nascer ligado.
   *
   * Quando o espaco a frente esta ocupado, DESCE em vez de empilhar por cima:
   * e o que acontece ao ramificar o mesmo bloco duas vezes (um upsell e um
   * downsell saindo do mesmo checkout).
   */
  /**
   * Perto do bloco selecionado, ou no centro quando não há nenhum.
   *
   * Vale para o que NÃO encadeia — nota, texto, imagem. Eles não ganham seta
   * (uma anotação não é etapa do funil), mas aparecer no centro da tela quando
   * a pessoa está trabalhando num canto obriga a arrastar de volta do mesmo
   * jeito que os blocos obrigavam.
   */
  function pertoDoSelecionado(w: number, h: number): { x: number; y: number } {
    const alvo = selecao.unico ? blocos.find((b) => b.id === selecao.unico) : null;
    return alvo ? posicaoAFrente(alvo, "right", w, h) : proximaPosicao(w, h);
  }

  function posicaoAFrente(
    origem: BlocoDoMapa,
    lado: PontoDeConexao = "right",
    w = LARGURA_PADRAO,
    h = ALTURA_PADRAO,
  ): { x: number; y: number } {
    const AFASTAMENTO = 90;
    const base: Record<PontoDeConexao, { x: number; y: number }> = {
      right: { x: origem.x + origem.width + AFASTAMENTO, y: origem.y },
      left: { x: origem.x - w - AFASTAMENTO, y: origem.y },
      bottom: { x: origem.x, y: origem.y + origem.height + AFASTAMENTO },
      top: { x: origem.x, y: origem.y - h - AFASTAMENTO },
    };
    const { x } = base[lado];
    let { y } = base[lado];
    const ocupado = () =>
      blocos.some(
        (b) => b.id !== origem.id && Math.abs(b.x - x) < w * 0.8 && Math.abs(b.y - y) < h * 0.8,
      );
    for (let i = 0; i < 20 && ocupado(); i += 1) y += h + 40;
    return { x: snap(x), y: snap(y) };
  }

  function proximaPosicao(w = LARGURA_PADRAO, h = ALTURA_PADRAO): { x: number; y: number } {
    const el = areaRef.current;
    const z = zoom.valor;
    const centro = el
      ? { x: (el.clientWidth / 2 - pan.x) / z, y: (el.clientHeight / 2 - pan.y) / z }
      : { x: 200, y: 200 };
    let x = snap(centro.x - w / 2);
    let y = snap(centro.y - h / 2);
    // Desvia em cascata enquanto o lugar estiver ocupado: nascer exatamente em
    // cima de outro bloco esconderia o novo, que é o problema de origem.
    const ocupado = () =>
      blocos.some((b) => Math.abs(b.x - x) < GRADE && Math.abs(b.y - y) < GRADE);
    for (let i = 0; i < 40 && ocupado(); i += 1) {
      x += GRADE * 2;
      y += GRADE * 2;
    }
    return { x, y };
  }

  function novoId(prefixo: string): string {
    return `${prefixo}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`;
  }

  /** Nota adesiva: texto solto, sem status nem conexão. */
  function adicionarNota() {
    const id = novoId("n");
    // Perto do bloco selecionado, mas SEM ligação: a nota comenta a etapa, e
    // uma seta saindo dela diria que o funil passa por um post-it.
    const p = pertoDoSelecionado(NOTA_LARGURA, NOTA_ALTURA);
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

  /**
   * Sobe a imagem e põe o bloco no mapa.
   *
   * O bloco entra ANTES do upload terminar, com `imageUrl` vazio: subir um
   * print de dois megabytes leva segundos, e uma tela que não responde nesse
   * tempo faz a pessoa colar de novo. O bloco mostra que está carregando e
   * recebe a URL quando ela chega.
   *
   * `posicao` vem do arrastar (onde soltou); colando, cai no fluxo normal.
   */
  async function adicionarImagem(arquivo: File, posicao?: { x: number; y: number }) {
    const id = novoId("img");
    // Arrastado, vale onde soltou. Colado ou escolhido, entra perto do bloco
    // selecionado — costuma ser o print DAQUELA página.
    const p = posicao ?? pertoDoSelecionado(IMAGEM_LARGURA, IMAGEM_ALTURA);
    alterarAba((a) => ({
      ...a,
      boxes: [
        ...a.boxes,
        {
          id, type: TIPO_IMAGEM, label: arquivo.name.slice(0, 120), ...p,
          width: IMAGEM_LARGURA, height: IMAGEM_ALTURA,
          color: "#64748b", status: "ativo" as StatusBloco,
          imageUrl: null, imageKey: null,
        },
      ],
    }));
    selecao.definir([id]);

    try {
      const r = await subirImagem.mutateAsync(arquivo);
      alterarAba((a) => ({
        ...a,
        boxes: a.boxes.map((b) =>
          b.id === id ? { ...b, imageUrl: r.url, imageKey: r.key } : b,
        ),
      }));
    } catch (e) {
      // Sem a imagem o bloco é um retângulo vazio que ninguém sabe o que é —
      // melhor tirá-lo e deixar a pessoa tentar de novo.
      alterarAba((a) => ({ ...a, boxes: a.boxes.filter((b) => b.id !== id) }));
      toast.error(e instanceof Error ? e.message : "Não consegui subir a imagem");
    }
  }

  /**
   * Abre o seletor de arquivo do sistema.
   *
   * Um `<input type=file>` criado na hora, sem elemento escondido no JSX: ele
   * não é reaproveitado, e um input pendurado no DOM teria de ser limpo entre
   * usos para permitir escolher o MESMO arquivo duas vezes seguidas.
   */
  function escolherImagem() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => {
      const f = input.files?.[0];
      if (f) void adicionarImagem(f);
    };
    input.click();
  }

  /** Bloco de texto: título ou parágrafo solto no board. */
  function adicionarTexto(estilo: "h1" | "h2" | "h3" | "corpo") {
    const id = novoId("t");
    const p = pertoDoSelecionado(TEXTO_LARGURA, TEXTO_ALTURA);
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

  /** Bloco livre com ícone — o "quadradinho" pra qualquer coisa. */
  function adicionarGenerico(icone: string, rotulo: string) {
    const id = novoId("g");
    const anterior = selecao.unico;
    const blocoAnterior = anterior ? (blocos.find((b) => b.id === anterior) ?? null) : null;
    const p = blocoAnterior ? posicaoAFrente(blocoAnterior) : proximaPosicao();
    alterarAba((a) => ({
      ...a,
      boxes: [
        ...a.boxes,
        {
          // Nasce com o nome do próprio ícone, não com um "Novo bloco": o
          // genérico é a FORMA, e um card sem rótulo útil obriga quem lê o
          // mapa depois a abrir um por um pra saber o que é.
          id, type: TIPO_GENERICO, label: rotulo, ...p,
          width: LARGURA_PADRAO, height: ALTURA_PADRAO,
          color: CORES_BLOCO[0].cor, status: "ativo" as StatusBloco,
          icone,
        },
      ],
    }));
    ligarAoAnterior(anterior, id);
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
  /**
   * Liga o bloco recem-criado ao que estava selecionado.
   *
   * Montar um funil e uma sequencia: captura, VSL, checkout. Sem isto, cada
   * bloco novo exige um segundo gesto so para dizer o que ja era obvio pela
   * ordem em que foram criados.
   *
   * So encadeia a partir de UM bloco selecionado. Com varios selecionados nao
   * ha "o anterior", e clicar no vazio antes de criar quebra a corrente de
   * proposito — e o gesto natural de "esse aqui comeca outra coisa".
   */
  function ligarAoAnterior(anteriorId: string | null, novoId: string) {
    if (!anteriorId || anteriorId === novoId) return;
    alterarAba((a) => {
      // Nao repete uma ligacao que ja existe: criar, desfazer e criar de novo
      // no mesmo lugar renderia duas setas sobrepostas.
      if (a.connectors.some((c) => c.fromBox === anteriorId && c.toBox === novoId)) return a;
      return {
        ...a,
        connectors: [
          ...a.connectors,
          {
            id: `c-${Date.now().toString(36)}`,
            fromBox: anteriorId,
            fromPoint: "right",
            toBox: novoId,
            toPoint: "left",
            type: "solid",
          } as ConectorDoMapa,
        ],
      };
    });
  }

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

  /**
   * Arrasta a PONTA de uma ligacao existente para outro bloco.
   *
   * Antes so dava para apagar e refazer: dois gestos e a perda da ponta que
   * estava certa. Aqui a extremidade solta segue o ponteiro e, ao soltar sobre
   * um bloco, a ligacao reaponta — a ancora e recalculada pelo lado mais
   * proximo, como no arrasto da bolinha.
   *
   * `qual` diz que ponta se move: `to` e a da seta, `from` e a da origem.
   */
  function arrastarPontaDaLigacao(
    e: React.PointerEvent,
    conector: ConectorDoMapa,
    qual: "from" | "to",
  ) {
    e.stopPropagation();
    e.preventDefault();
    const fixoId = qual === "to" ? conector.fromBox : conector.toBox;
    const fixo = blocos.find((b) => b.id === fixoId);
    if (!fixo) return;

    setConectorSel(conector.id);
    // Reaproveita a previa do arrasto da bolinha: a linha tracejada que sai do
    // lado fixo ate o ponteiro e exatamente o mesmo desenho.
    setLigando({
      boxId: fixoId,
      ponto: qual === "to" ? conector.fromPoint : conector.toPoint,
    });

    const mover = (ev: PointerEvent) => setPreviaLigacao(paraDesenho(ev.clientX, ev.clientY));
    const soltar = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      setPreviaLigacao(null);
      setLigando(null);

      const alvo = blocoSob(ev.clientX, ev.clientY);
      // Soltar no vazio ou no proprio bloco do outro lado nao muda nada: a
      // ligacao volta para onde estava, e ninguem perde o trabalho por um
      // arrasto que escorregou.
      if (!alvo || alvo.id === fixoId) return;

      const ancora = ancoraMaisProxima(alvo, ev.clientX, ev.clientY);
      alterarAba((a) => ({
        ...a,
        connectors: a.connectors.map((c) =>
          c.id !== conector.id
            ? c
            : qual === "to"
              ? { ...c, toBox: alvo.id, toPoint: ancora }
              : { ...c, fromBox: alvo.id, fromPoint: ancora },
        ),
      }));
    };
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
  }

  /**
   * Cria um bloco JÁ ligado, a partir de uma bolinha.
   *
   * O gesto que faltava: montando um funil, a próxima peça quase sempre sai
   * de onde a anterior termina. Antes eram três passos — criar na paleta,
   * arrastar até o lugar, ligar.
   *
   * O bloco nasce ao lado da âncora de onde saiu: pela direita vai para a
   * direita, por baixo desce. Cair sempre no centro da tela obrigaria a
   * arrastá-lo de volta.
   */
  function criarLigadoAoPonto(tipo: string, cor: string, label: string) {
    const alvo = criarDoPonto;
    if (!alvo) return;
    const origem = blocos.find((b) => b.id === alvo.boxId);
    if (!origem) return;

    // Mesma conta do encadeamento pela paleta: uma copia aqui divergiria no
    // primeiro ajuste de afastamento.
    const pos = posicaoAFrente(origem, alvo.ponto);
    // A âncora oposta é a que encara a origem: saindo pela direita, a seta
    // chega pela esquerda do novo bloco.
    const oposto: Record<PontoDeConexao, PontoDeConexao> = {
      right: "left",
      left: "right",
      bottom: "top",
      top: "bottom",
    };

    const id = novoId("b");
    alterarAba((a) => ({
      ...a,
      boxes: [
        ...a.boxes,
        {
          id,
          type: tipo,
          label,
          x: pos.x,
          y: pos.y,
          width: LARGURA_PADRAO,
          height: ALTURA_PADRAO,
          color: cor,
          status: "ativo" as StatusBloco,
        },
      ],
      connectors: [
        ...a.connectors,
        {
          id: `c-${Date.now().toString(36)}`,
          fromBox: alvo.boxId,
          fromPoint: alvo.ponto,
          toBox: id,
          toPoint: oposto[alvo.ponto],
          type: "solid",
        } as ConectorDoMapa,
      ],
    }));

    selecao.definir([id]);
    setCriarDoPonto(null);
    setBuscaDoPonto("");
  }

  /** Grava o texto da ligação. Vazio APAGA o rótulo, não guarda "". */
  function confirmarRotulo() {
    const r = rotulando;
    setRotulando(null);
    if (!r) return;
    const texto = r.valor.trim().slice(0, 60);
    alterarAba((a) => ({
      ...a,
      connectors: a.connectors.map((c) =>
        c.id === r.id ? { ...c, label: texto || null } : c,
      ),
    }));
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

  /**
   * A inversa de `paraDesenho`: coordenada do quadro → ponto na tela.
   *
   * Usada por controles que vivem FORA do `<svg>` mas precisam aparecer sobre
   * um ponto do desenho — o campo do rótulo da ligação. Dentro do SVG eles
   * herdariam o zoom e ficariam minúsculos com o mapa afastado.
   */
  const paraTela = useCallback(
    (x: number, y: number) => {
      const el = areaRef.current;
      if (!el) return { x: 0, y: 0 };
      const r = el.getBoundingClientRect();
      return {
        x: x * zoom.valor + pan.x + r.left,
        y: y * zoom.valor + pan.y + r.top,
      };
    },
    [zoom.valor, pan],
  );

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

  const [exportando, setExportando] = useState(false);

  /**
   * Espera o React pintar a troca de aba antes de fotografar.
   *
   * O `setTimeout` não é redundância defensiva: em aba de segundo plano o
   * navegador não dispara quadro nenhum, e sem a saída pelo tempo a exportação
   * ficaria parada aqui até a pessoa voltar para a aba.
   */
  function proximoQuadro(): Promise<void> {
    return new Promise((resolve) => {
      let pronto = false;
      const terminar = () => {
        if (pronto) return;
        pronto = true;
        resolve();
      };
      requestAnimationFrame(() => requestAnimationFrame(terminar));
      setTimeout(terminar, 200);
    });
  }

  /**
   * Exporta o desenho em PDF — um print, não um redesenho.
   *
   * Percorre as abas trocando a que está visível, porque só a ativa existe no
   * DOM. O estado é restaurado no `finally`: uma falha no meio não pode deixar
   * a pessoa numa aba que ela não abriu.
   */
  async function exportarPdf() {
    const abasAgora = abasRef.current;
    if (!abasAgora || abasAgora.length === 0 || !desenhoRef.current) return;
    const voltarPara = abaAtiva;
    setExportando(true);
    try {
      const areas = [];
      for (let i = 0; i < abasAgora.length; i += 1) {
        if (i !== abaAtiva) {
          setAbaAtiva(i);
          await proximoQuadro();
        }
        const no = desenhoRef.current;
        if (!no) continue;
        const bs = abasRef.current?.[i]?.boxes ?? [];
        // Recorta pelo que EXISTE, não pelo tamanho do mundo.
        //
        // O mundo tem no mínimo 1200px de largura e a altura da área visível —
        // usar isso deixaria metade da folha em branco num mapa de três blocos,
        // e ainda cobraria o tempo de rasterizar o vazio. A margem cobre a
        // curva dos conectores, que sai um pouco fora dos blocos.
        //
        // Calculado por aba: o recorte da aba ativa cortaria as outras.
        const MARGEM = 60;
        const temBloco = bs.length > 0;
        areas.push({
          no,
          nome: abasAgora[i].name,
          origemX: (temBloco ? Math.min(...bs.map((b) => b.x)) : 0) - MARGEM,
          origemY: (temBloco ? Math.min(...bs.map((b) => b.y)) : 0) - MARGEM,
          fimX: (temBloco ? Math.max(...bs.map((b) => b.x + b.width)) : 800) + MARGEM,
          fimY: (temBloco ? Math.max(...bs.map((b) => b.y + b.height)) : 600) + MARGEM,
        });
      }
      // A cor vem da tela: no tema escuro, fundo branco deixaria o texto claro
      // ilegível no papel.
      const fundo =
        (areaRef.current && getComputedStyle(areaRef.current).backgroundColor) || "#ffffff";
      await exportarMapaEmPdf({ areas, titulo: "Mapa do funil", fundo });
      toast.success(areas.length > 1 ? `PDF gerado — ${areas.length} abas` : "PDF gerado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui gerar o PDF");
    } finally {
      setAbaAtiva(voltarPara);
      setExportando(false);
    }
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

  // Espelho das abas para a exportação: ela troca de aba dentro de um `await`,
  // e a closure enxergaria o valor do render em que começou.
  const abasRef = useRef(abas);
  useEffect(() => { abasRef.current = abas; }, [abas]);

  /**
   * Traz o conteúdo para dentro da tela ao abrir a aba.
   *
   * Com o pan em 0,0 a área mostra o mundo a partir de 0,0 — então um bloco
   * que alguém arrastou para cima (y negativo) ficaria fora do campo de visão
   * ao recarregar, dando a impressão de que sumiu. Ajusta uma vez por aba, e
   * só quando há coordenada negativa: quem nunca arrastou para além do topo
   * não percebe diferença nenhuma.
   */
  const abasEnquadradas = useRef(new Set<number>());
  useEffect(() => {
    if (blocos.length === 0 || abasEnquadradas.current.has(abaAtiva)) return;
    abasEnquadradas.current.add(abaAtiva);
    const minX = Math.min(...blocos.map((b) => b.x));
    const minY = Math.min(...blocos.map((b) => b.y));
    if (minX >= 0 && minY >= 0) return;
    const z = zoomRef.current;
    const FOLGA = 40;
    setPan((p) => ({
      x: minX < 0 ? FOLGA - minX * z : p.x,
      y: minY < 0 ? FOLGA - minY * z : p.y,
    }));
  }, [blocos, abaAtiva]);

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
      /**
       * O V NÃO é tratado aqui — ver o listener de `paste` abaixo.
       *
       * `preventDefault` num keydown de Ctrl+V cancela a ação padrão, e com
       * ela o próprio evento `paste`. Como só o `paste` carrega o
       * `clipboardData`, tratar o atalho aqui tornaria impossível colar um
       * print no mapa: a imagem nunca chegaria.
       */
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
      if (e.key === "Escape") { selecao.limpar(); setConectorSel(null); setLigando(null); setMenu(null); setAjuda(false); setRenomeando(null); setRotulando(null); return; }
      /**
       * T cria um bloco de texto.
       *
       * Sem modificador de proposito: e a tecla que todo editor de quadro usa
       * para isso. Os `return` acima ja tiraram do caminho quem esta digitando
       * num campo — aqui a tecla so chega com o foco no quadro.
       */
      if (!mod && !e.altKey && e.key.toLowerCase() === "t") {
        e.preventDefault();
        adicionarTexto("corpo");
        return;
      }
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
              ? { ...b, x: b.x + dx, y: b.y + dy }
              : b,
          ),
        }));
      }
    }
    function onKeyUp(e: KeyboardEvent) { if (e.key === " ") espaco.current = false; }

    /**
     * Colar: imagem da área de transferência, ou os blocos copiados aqui.
     *
     * Os dois usos disputam o mesmo Ctrl+V, e a imagem ganha quando existe —
     * quem acabou de dar print numa página quer ela no mapa, não os blocos
     * que copiou dez minutos atrás.
     */
    function aoColar(e: ClipboardEvent) {
      const alvo = e.target as HTMLElement | null;
      // Dentro de um campo de texto, colar é colar texto.
      if (alvo && (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA" || alvo.isContentEditable)) {
        return;
      }
      const arquivo = imagemDoEvento(e.clipboardData);
      if (arquivo) {
        e.preventDefault();
        void adicionarImagem(arquivo);
        return;
      }
      colar();
    }

    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("paste", aoColar);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("paste", aoColar);
    };
  });

  if (isLoading || !abas || !aba) return <Skeleton style={{ height: altura }} />;

  // O painel de propriedades só faz sentido com UM bloco: com vários, editar
  // "Nome" não teria alvo definido.
  const blocoSelecionado = blocos.find((b) => b.id === selecao.unico) ?? null;
  const largura = Math.max(1200, ...blocos.map((b) => b.x + b.width + 200));
  /**
   * Altura do CONTEÚDO rolável — não a da janela.
   *
   * Quando `altura` vem como expressão CSS (`calc(100vh - …)`), não há número
   * para comparar: o piso vira uma constante. O desenho cresce a partir dela
   * conforme os blocos descem, que é o que essa conta sempre fez.
   */
  const pisoDoDesenho = typeof altura === "number" ? altura : 600;
  const alturaDoDesenho = Math.max(pisoDoDesenho, ...blocos.map((b) => b.y + b.height + 160));
  // Origem do desenho. Os blocos podem ficar em coordenada negativa (arrastar
  // para cima/esquerda é livre), e o <svg> recorta no próprio box — sem
  // esticá-lo para trás, os conectores que passam acima de zero sumiriam.
  // ---- Filtro da paleta ----------------------------------------------------
  // Normaliza acento: quem digita "trafego" tem que achar "Tráfego".
  const alvoDaBusca = busca.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const casa = (texto: string) =>
    !alvoDaBusca ||
    texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").includes(alvoDaBusca);

  /** Casa ignorando caixa e acento — "trafego" acha "Tráfego". */
  function casaComBusca(texto: string, alvo: string): boolean {
    const n = (t: string) =>
      t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    return !alvo.trim() || n(texto).includes(n(alvo.trim()));
  }

  const SECOES_LIVRES = [
    { chave: "nota", rotulo: "Nota", acao: adicionarNota },
    // Terceiro caminho da imagem, ao lado de colar e arrastar: é o que a
    // pessoa procura quando o arquivo está no disco e não na área de
    // transferência.
    { chave: "imagem", rotulo: "Imagem", acao: escolherImagem },
    ...(["h1", "h2", "h3", "corpo"] as const).map((e) => ({
      chave: e,
      rotulo: e === "corpo" ? "Texto" : e.toUpperCase(),
      acao: () => adicionarTexto(e),
    })),
  ];
  const filtroLivres = SECOES_LIVRES.filter((l) => casa(l.rotulo) || casa("anotar") || casa("print"));
  // Ícone casa pelo grupo OU pelo próprio rótulo — o emoji antigo só dava pra
  // achar pelo grupo, porque não tinha nome nenhum.
  const filtrarIcones = (g: { grupo: string; itens: { icone: string; rotulo: string }[] }) =>
    casa(g.grupo) ? g.itens : g.itens.filter((i) => casa(i.rotulo));
  const filtrarItens = (cat: { name: string; items: { type: string; label: string; icon: string }[] }) =>
    casa(cat.name) ? cat.items : cat.items.filter((i) => casa(i.label));
  const semResultado =
    !!alvoDaBusca &&
    filtroLivres.length === 0 &&
    ICONES_GENERICOS.every((g) => filtrarIcones(g).length === 0) &&
    CATEGORIAS.every((c) => filtrarItens(c).length === 0);

  /** Mesma altura do canvas: a coluna acompanha a área de desenho. */
  /**
   * `altura` aceita numero (px) ou expressao CSS.
   *
   * A tela global precisa que o mapa OCUPE o que sobra da janela: com um
   * numero fixo, sempre havia uma faixa vazia embaixo em monitor alto e
   * scroll em monitor baixo. Uma expressao (`calc(100vh - …)`) resolve os
   * dois sem a tela ter de medir nada.
   */
  const alturaDaArea = telaCheia ? "calc(100vh - 190px)" : altura;

  const origemX = Math.min(0, ...blocos.map((b) => b.x - 200));
  const origemY = Math.min(0, ...blocos.map((b) => b.y - 160));

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
            onClick={alternarSetas}
            aria-label={setasRetas ? "Setas curvas" : "Setas retas"}
            title={setasRetas ? "Usar setas curvas" : "Usar setas retas"}
          >
            {setasRetas ? <Spline className="h-3 w-3" /> : <Waypoints className="h-3 w-3" />}
          </Button>
          <Button
            variant="ghost" size="icon" className="h-6 w-6"
            onClick={alternarTelaCheia}
            aria-label={telaCheia ? "Sair da tela cheia" : "Tela cheia"}
            title={telaCheia ? "Sair da tela cheia" : "Tela cheia"}
          >
            {telaCheia ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
          </Button>
          <Button
            variant="ghost" size="icon" className="hidden h-6 w-6 md:inline-flex"
            onClick={alternarPaleta}
            aria-label={paletaAberta ? "Ocultar barra lateral" : "Mostrar barra lateral"}
            title={paletaAberta ? "Ocultar barra lateral" : "Mostrar barra lateral"}
          >
            {paletaAberta ? <PanelLeftClose className="h-3 w-3" /> : <PanelLeftOpen className="h-3 w-3" />}
          </Button>
          <Button
            variant="ghost" size="icon" className="h-6 w-6"
            onClick={exportarPdf} disabled={exportando}
            aria-label="Exportar em PDF" title="Exportar em PDF"
          >
            {exportando ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileDown className="h-3 w-3" />}
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
        {paletaAberta && (
        <div className="hidden w-48 shrink-0 flex-col gap-2 md:flex" style={{ maxHeight: alturaDaArea }}>
          <div className="relative shrink-0">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar elemento"
              className="h-7 pl-7 text-[11px]"
            />
          </div>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-0.5">
          {SECOES_LIVRES.length > 0 && (
            <Secao titulo="Anotar" chave="anotar" fechada={fechadas} alternar={alternarSecao} visivel={!!filtroLivres.length}>
              <div className="space-y-0.5">
                {filtroLivres.map((l) => (
                  <button
                    key={l.chave}
                    type="button"
                    onClick={l.acao}
                    className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-[11px] transition-colors hover:bg-muted"
                  >
                    {l.chave === "nota" ? <StickyNote className="h-3 w-3 shrink-0" /> : <Type className="h-3 w-3 shrink-0" />}
                    {l.rotulo}
                  </button>
                ))}
              </div>
            </Secao>
          )}

          {/* Genéricos: o "quadradinho" pra qualquer coisa que o funil tenha. */}
          {ICONES_GENERICOS.map((g) => {
            const itens = filtrarIcones(g);
            return (
              <Secao key={g.grupo} titulo={g.grupo} chave={`e:${g.grupo}`} fechada={fechadas} alternar={alternarSecao} visivel={itens.length > 0}>
                <div className="grid grid-cols-4 gap-0.5">
                  {itens.map((i) => (
                    <button
                      key={i.icone}
                      type="button"
                      onClick={() => adicionarGenerico(i.icone, i.rotulo)}
                      title={i.rotulo}
                      aria-label={`Bloco ${i.rotulo}`}
                      className="flex h-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <IconePorNome nome={i.icone} className="h-3.5 w-3.5" />
                    </button>
                  ))}
                </div>
              </Secao>
            );
          })}

          {CATEGORIAS.map((cat) => {
            const itens = filtrarItens(cat);
            return (
              <Secao
                key={cat.name}
                titulo={cat.name}
                chave={`c:${cat.name}`}
                cor={cat.color}
                fechada={fechadas}
                alternar={alternarSecao}
                visivel={itens.length > 0}
              >
                <div className="space-y-0.5">
                  {itens.map((item) => (
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
              </Secao>
            );
          })}

          {semResultado && (
            <p className="px-1 py-4 text-center text-[11px] text-muted-foreground">
              Nada com “{busca}”.
            </p>
          )}
          </div>
        </div>
        )}

        {/* Canvas */}
        <div
          ref={areaRef}
          /**
           * Arrastar um arquivo para cá cria o bloco ONDE soltou.
           *
           * `preventDefault` no `dragOver` é o que impede o navegador de abrir
           * a imagem numa aba nova — sem ele, largar um print sobre o mapa faz
           * a página inteira ser substituída pelo arquivo.
           */
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes("Files")) return;
            e.preventDefault();
            setArrastandoArquivo(true);
          }}
          onDragLeave={(e) => {
            // Só quando o ponteiro sai da área de verdade: `dragleave` também
            // dispara ao cruzar a borda de qualquer filho, e o realce piscaria.
            if (e.currentTarget.contains(e.relatedTarget as Node)) return;
            setArrastandoArquivo(false);
          }}
          onDrop={(e) => {
            const arquivo = imagemDoEvento(e.dataTransfer);
            if (!arquivo) return;
            e.preventDefault();
            setArrastandoArquivo(false);
            void adicionarImagem(arquivo, posicaoNoQuadro(e.clientX, e.clientY));
          }}
          className={`relative flex-1 touch-none overflow-hidden rounded-lg border ${
            arrastandoArquivo ? "border-primary ring-2 ring-primary/40" : "border-border/40"
          }`}
          style={{
            height: alturaDaArea,
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
            ref={desenhoRef}
            className="absolute left-0 top-0 origin-top-left"
            style={{
              width: largura,
              height: alturaDoDesenho,
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom.valor})`,
            }}
          >
            <svg
              className="pointer-events-none absolute"
              style={{ left: origemX, top: origemY }}
              width={largura - origemX}
              height={alturaDoDesenho - origemY}
              viewBox={`${origemX} ${origemY} ${largura - origemX} ${alturaDoDesenho - origemY}`}
            >
              <defs>
                <marker id="seta-mapa" markerWidth="9" markerHeight="9" refX="8" refY="3" orient="auto">
                  <path d="M0,0 L0,6 L8,3 z" fill="currentColor" className="text-muted-foreground" />
                </marker>
              </defs>
              {aba.connectors.map((c) => {
                const de = blocos.find((b) => b.id === c.fromBox);
                const para = blocos.find((b) => b.id === c.toBox);
                if (!de || !para) return null;
                const inicio = pontoDoBloco(de, c.fromPoint);
                const fim = pontoDoBloco(para, c.toPoint);
                const d = setasRetas
                  ? caminhoRetoDaSeta(inicio, c.fromPoint, fim, c.toPoint)
                  : caminhoDaSeta(inicio, c.fromPoint, fim, c.toPoint);
                // Meio do trecho, para o rotulo. Aproximacao boa o bastante:
                // medir o caminho real exigiria `getTotalLength`, que so
                // funciona com o elemento ja no DOM.
                const meio = { x: (inicio.x + fim.x) / 2, y: (inicio.y + fim.y) / 2 };
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
                      /* Duplo clique ESCREVE o rótulo, não apaga mais a
                         ligação: apagar por duplo clique num alvo de 16px é
                         fácil de fazer sem querer, e agora há a tecla Delete
                         com a ligação selecionada — que pede a seleção antes,
                         então não acontece por acidente. */
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        setConectorSel(c.id);
                        setRotulando({ id: c.id, valor: c.label ?? "" });
                      }}
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

                    {/* O texto da ligação — "Sim", "Não", "se comprou".
                        Uma seta sem rótulo num mapa com ramificação obriga a
                        adivinhar qual caminho é qual. Fica sobre um retângulo
                        da cor do fundo para não se perder em cima da linha. */}
                    {c.label && (
                      <g
                        className="pointer-events-auto cursor-pointer"
                        onClick={(e) => { e.stopPropagation(); setConectorSel(c.id); }}
                        onDoubleClick={(e) => { e.stopPropagation(); setRotulando({ id: c.id, valor: c.label ?? "" }); }}
                      >
                        <rect
                          x={meio.x - (c.label.length * 3.4 + 6)}
                          y={meio.y - 9}
                          width={c.label.length * 6.8 + 12}
                          height={18}
                          rx={4}
                          className="fill-background"
                        />
                        <text
                          x={meio.x}
                          y={meio.y + 4}
                          textAnchor="middle"
                          className={`text-[11px] font-medium ${ativa ? "fill-primary" : "fill-foreground/70"}`}
                        >
                          {c.label}
                        </text>
                      </g>
                    )}

                    {/* Alças de reapontar — só na ligação selecionada.
                        Visíveis o tempo todo, cada seta do mapa carregaria dois
                        pontos extras e o desenho viraria uma nuvem de bolinhas
                        que competem com as âncoras dos blocos. */}
                    {ativa &&
                      (
                        [
                          ["from", pontoDoBloco(de, c.fromPoint)],
                          ["to", pontoDoBloco(para, c.toPoint)],
                        ] as const
                      ).map(([qual, pos]) => (
                        <circle
                          key={qual}
                          cx={pos.x}
                          cy={pos.y}
                          r={5}
                          className="pointer-events-auto cursor-grab fill-background stroke-primary"
                          strokeWidth={2}
                          onPointerDown={(ev) => arrastarPontaDaLigacao(ev, c, qual)}
                        />
                      ))}
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
                  x1={g.eixo === "x" ? g.valor : origemX}
                  y1={g.eixo === "x" ? origemY : g.valor}
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

              // A imagem é o conteúdo: moldura de bloco por cima disputaria
              // com ela justamente o que se quer ver.
              if (b.type === TIPO_IMAGEM) {
                return (
                  <div
                    key={b.id}
                    onPointerDown={(e) => iniciarArrasto(e, b)}
                    onClick={(e) => e.stopPropagation()}
                    className={`absolute overflow-hidden rounded-md ${
                      ativo ? "ring-2 ring-primary" : "ring-1 ring-border/60"
                    }`}
                    style={{ left: b.x, top: b.y, width: b.width, height: b.height }}
                  >
                    {b.imageUrl ? (
                      <img
                        src={b.imageUrl}
                        alt={b.label || "imagem do mapa"}
                        draggable={false}
                        /* `contain` e não `cover`: um print de página cortado
                           ao meio perde exatamente a dobra que motivou salvá-lo. */
                        className="pointer-events-none h-full w-full bg-muted/40 object-contain"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-muted/40 text-[11px] text-muted-foreground">
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        subindo…
                      </div>
                    )}
                    {ativo && (
                      <span
                        role="presentation"
                        onPointerDown={(ev) => iniciarResize(ev, b)}
                        onClick={(ev) => ev.stopPropagation()}
                        className="absolute -bottom-1 -right-1 z-20 h-3 w-3 cursor-nwse-resize touch-none rounded-sm border border-primary bg-background"
                      />
                    )}
                  </div>
                );
              }

              // Nota e texto têm desenho próprio: sem selo de status, sem card
              // de peça do funil. Compartilham só o gesto de arrastar.
              if (b.type === TIPO_NOTA || b.type === TIPO_TEXTO) {
                const ehNota = b.type === TIPO_NOTA;
                const tamanho = b.fonte ?? TAMANHO_DO_ESTILO[b.estilo ?? "corpo"] ?? 14;
                return (
                  <div
                    key={b.id}
                    onPointerDown={(e) => iniciarArrasto(e, b)}
                    // Sem isto o clique sobe até o fundo do canvas, que limpa a
                    // seleção — era o motivo de a nota "deselecionar sozinha" ao
                    // ser clicada, e de o painel de cor/tamanho sumir no meio da
                    // digitação (o clique dentro do textarea também subia).
                    onClick={(e) => {
                      e.stopPropagation();
                      if (editando?.id !== b.id) selecao.clicar(b.id, e.shiftKey);
                    }}
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

                    {/* Mesma alça do card do funil: nota e texto também se
                        redimensionam pelo canto. Aparece só no selecionado —
                        em cima de cada nota do quadro viraria ruído. */}
                    {ativo && (
                      <span
                        role="presentation"
                        onPointerDown={(ev) => iniciarResize(ev, b)}
                        onClick={(ev) => ev.stopPropagation()}
                        className="absolute -bottom-1 -right-1 z-20 h-3 w-3 cursor-nwse-resize touch-none rounded-sm border border-primary bg-background"
                      />
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
                  className={`absolute cursor-grab touch-none select-none rounded-xl border-2 bg-card p-2 shadow-sm transition-shadow active:cursor-grabbing ${
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
                    /**
                      O conteúdo do bloco: ícone e nome, e mais nada.
                      Antes havia DUAS linhas — o nome e, embaixo, o tipo vindo
                      da paleta. Num bloco criado pela paleta as duas dizem a
                      mesma palavra ("Checkout" sobre "Checkout"), e a segunda
                      não era editável: ocupava metade do card para repetir o
                      que já estava escrito acima.
                      O ícone ganhou um quadrado de fundo na cor do tipo, e o
                      conjunto foi para o centro — a leitura de relance passa a
                      ser o ícone, e o nome logo ao lado.
                    */
                    <div className="flex h-full w-full items-center justify-center gap-2 px-1">
                      {b.emoji ? (
                        // Bloco criado antes da troca por ícone: mantém o que
                        // a pessoa escolheu em vez de sumir com o desenho.
                        <span className="shrink-0 text-lg leading-none">{b.emoji}</span>
                      ) : (
                        <span
                          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg"
                          // A cor do tipo, bem clara: o ícone precisa de um
                          // fundo que o destaque sem competir com a borda.
                          style={{ background: `${b.color}24` }}
                        >
                          <IconePorNome
                            nome={b.icone ?? meta.icon}
                            className="h-4 w-4"
                            style={{ color: b.color }}
                          />
                        </span>
                      )}
                      <span
                        className="min-w-0 truncate text-[13px] font-semibold leading-tight"
                        title={b.label}
                      >
                        {b.label}
                      </span>
                    </div>
                  )}
                  {/* O selo de status saiu do bloco.
                      "Em construção", "Otimizar" e "Pausado" nunca foram
                      usados, e todo bloco novo nascia marcado como "Em
                      construção" — o mapa inteiro exibia um aviso que não
                      queria dizer nada, roubando a linha de baixo do card e
                      competindo com o rótulo, que é o que se lê.
                      O campo continua no dado; só não aparece nem se edita. */}
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
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          // O primeiro clique do par já armou `ligando`; deixá-lo
                          // armado faria o próximo clique em qualquer bloco criar
                          // uma ligação que ninguém pediu.
                          setLigando(null);
                          setPreviaLigacao(null);
                          setCriarDoPonto({ boxId: b.id, ponto: p, x: e.clientX, y: e.clientY });
                          setBuscaDoPonto("");
                        }}
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
      {/*
        Escrevendo o texto de uma ligação.
        Fica FORA do <svg>: campo de formulário dentro de SVG exige
        `foreignObject`, que herda o zoom do quadro — o input encolheria junto
        com o mapa afastado e ficaria impossível de acertar.
      */}
      {rotulando && (() => {
        const c = aba?.connectors.find((x) => x.id === rotulando.id);
        const de = c && blocos.find((b) => b.id === c.fromBox);
        const para = c && blocos.find((b) => b.id === c.toBox);
        if (!c || !de || !para) return null;
        const i = pontoDoBloco(de, c.fromPoint);
        const f = pontoDoBloco(para, c.toPoint);
        const centro = paraTela((i.x + f.x) / 2, (i.y + f.y) / 2);
        return (
          <>
            <div className="fixed inset-0 z-40" onClick={confirmarRotulo} />
            <div
              className="fixed z-50 w-40"
              style={{ left: centro.x - 80, top: centro.y - 14 }}
            >
              <Input
                autoFocus
                value={rotulando.valor}
                onChange={(e) => setRotulando({ id: rotulando.id, valor: e.target.value })}
                onBlur={confirmarRotulo}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); confirmarRotulo(); }
                  // Esc descarta a edição e mantém o rótulo que estava lá.
                  if (e.key === "Escape") { e.preventDefault(); setRotulando(null); }
                }}
                onFocus={(e) => e.currentTarget.select()}
                placeholder="Sim, Não, se comprou…"
                className="h-7 text-center text-[12px] shadow-lg"
              />
            </div>
          </>
        );
      })()}

      {/*
        O seletor do duplo clique na bolinha.
        Fixo na janela e não dentro do quadro: dentro, ele herdaria o zoom e o
        pan — a lista encolheria com o mapa afastado e sairia de vista ao
        arrastar o fundo.
      */}
      {criarDoPonto && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setCriarDoPonto(null)}
            onContextMenu={(e) => { e.preventDefault(); setCriarDoPonto(null); }}
          />
          <div
            className="fixed z-50 w-56 overflow-hidden rounded-lg border border-border bg-popover shadow-lg"
            style={{
              // Não deixa o popup sair pela borda: perto da direita ou do fim
              // da tela ele abre para dentro.
              left: Math.min(criarDoPonto.x + 8, window.innerWidth - 240),
              top: Math.min(criarDoPonto.y + 8, window.innerHeight - 340),
            }}
          >
            <div className="border-b border-border p-1.5">
              <Input
                autoFocus
                value={buscaDoPonto}
                onChange={(e) => setBuscaDoPonto(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setCriarDoPonto(null);
                  // Enter cria o primeiro da lista: digitar "check" e apertar
                  // Enter é mais rápido do que mirar o item com o mouse.
                  if (e.key === "Enter") {
                    const primeiro = CATEGORIAS.flatMap((c) =>
                      c.items.filter((i) => casaComBusca(i.label, buscaDoPonto)).map((i) => ({ i, cor: c.color })),
                    )[0];
                    if (primeiro) criarLigadoAoPonto(primeiro.i.type, primeiro.cor, primeiro.i.label);
                  }
                }}
                placeholder="Que bloco entra aqui?"
                className="h-7 text-[12px]"
              />
            </div>
            <div className="max-h-64 overflow-y-auto p-1">
              {CATEGORIAS.map((cat) => {
                const itens = cat.items.filter((i) => casaComBusca(i.label, buscaDoPonto));
                if (itens.length === 0) return null;
                return (
                  <div key={cat.name}>
                    <p className="px-1.5 pb-0.5 pt-1.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {cat.name}
                    </p>
                    {itens.map((i) => (
                      <button
                        key={i.type}
                        type="button"
                        onClick={() => criarLigadoAoPonto(i.type, cat.color, i.label)}
                        className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-[11px] hover:bg-muted"
                      >
                        <span
                          className="h-2 w-2 shrink-0 rounded-sm"
                          style={{ background: cat.color }}
                        />
                        <IconePorNome nome={i.icon} className="h-3 w-3 shrink-0" />
                        <span className="truncate">{i.label}</span>
                      </button>
                    ))}
                  </div>
                );
              })}
              {CATEGORIAS.every((c) => c.items.every((i) => !casaComBusca(i.label, buscaDoPonto))) && (
                <p className="px-1.5 py-4 text-center text-[11px] text-muted-foreground">
                  Nada com “{buscaDoPonto}”.
                </p>
              )}
            </div>
          </div>
        </>
      )}

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
