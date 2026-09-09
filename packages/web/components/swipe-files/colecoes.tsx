"use client";

/**
 * As coleções do Swipe Files — a organização feita à mão.
 *
 * ## Por que existe, se já há filtros
 *
 * Filtro responde "me mostre tudo de marca X". Coleção responde "o que eu
 * separei para o lançamento de outubro" — um critério que não está em campo
 * nenhum e que só a pessoa conhece. A biblioteca precisa das duas coisas: uma
 * para procurar, outra para pousar o olho.
 *
 * ## Coleção, e não pasta
 *
 * Uma peça está em várias ao mesmo tempo. Chamar de pasta prometeria que o
 * arquivo mora num lugar só, e a primeira vez que alguém precisasse do
 * contrário faria uma cópia.
 */

import { useState } from "react";
import {
  ChevronRight,
  FolderOpen,
  FolderPlus,
  Loader2,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  useColecoes,
  useAtualizarColecao,
  useCriarColecao,
  useExcluirColecao,
  type ColecaoDoSwipe,
} from "@/lib/hooks/use-swipe-files";

function quando(iso: string | null): string {
  if (!iso) return "";
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (dias <= 0) return "hoje";
  if (dias === 1) return "ontem";
  if (dias < 30) return `há ${dias} dias`;
  if (dias < 365) return `há ${Math.floor(dias / 30)} meses`;
  return `há ${Math.floor(dias / 365)} ano${dias >= 730 ? "s" : ""}`;
}

/**
 * O card de coleção, que é ao mesmo tempo o que se arrasta e onde se solta.
 *
 * Os dois papéis no mesmo nó porque é o que a pasta promete: qualquer uma pode
 * entrar em qualquer outra. Separar em "arrastáveis" e "alvos" obrigaria a
 * escolher, na hora de desenhar, quais pastas podem receber — e a resposta é
 * todas menos as que criariam ciclo, que só o servidor sabe.
 */
function CardArrastavel({
  id,
  arrastando,
  children,
}: {
  id: string;
  arrastando: boolean;
  children: React.ReactNode;
}) {
  const solta = useDroppable({ id: `alvo-${id}`, data: { colecaoId: id } });
  const pega = useDraggable({ id: `arrasta-${id}`, data: { colecaoId: id } });

  // `isOver` só destaca se NÃO for a própria: soltar em si mesma não faz nada,
  // e a moldura acesa prometeria que faria.
  const realce = solta.isOver && !arrastando;

  return (
    <div
      ref={(no) => {
        solta.setNodeRef(no);
        pega.setNodeRef(no);
      }}
      {...pega.listeners}
      {...pega.attributes}
      className={`group relative rounded-xl border bg-card transition-colors ${
        arrastando
          ? "border-border/60 opacity-40"
          : realce
            ? "border-primary ring-2 ring-primary/30"
            : "border-border/60 hover:border-foreground/25"
      }`}
    >
      {children}
    </div>
  );
}

/**
 * O degrau do rastro que aceita receber — é como se TIRA de dentro.
 *
 * Sem ele, arrastar só afunda: dá para pôr uma coleção dentro de outra e nunca
 * mais para fora, e o único jeito de desfazer seria apagar e refazer. Soltar
 * em "Coleções" devolve para a raiz.
 */
function DegrauQueRecebe({
  id,
  paraOnde,
  children,
}: {
  id: string;
  paraOnde: string | null;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id,
    data: { colecaoId: paraOnde, ehDegrau: true },
  });
  return (
    <span
      ref={setNodeRef}
      className={`rounded px-1 py-0.5 transition-colors ${
        isOver ? "bg-primary/15 ring-1 ring-primary/40" : ""
      }`}
    >
      {children}
    </span>
  );
}

export function GradeDeColecoes({
  onAbrir,
  paiAtual,
  onEntrar,
}: {
  /** Abrir a coleção — mostra as REFERÊNCIAS dela na grade. */
  onAbrir: (colecao: ColecaoDoSwipe) => void;
  /** Em que nível estamos. `null` = raiz. */
  paiAtual: ColecaoDoSwipe | null;
  /** Descer um nível — mostra as SUBCOLEÇÕES. */
  onEntrar: (colecao: ColecaoDoSwipe | null) => void;
}) {
  const { data, isLoading } = useColecoes();
  const criar = useCriarColecao();
  const excluir = useExcluirColecao();
  const mover = useAtualizarColecao();

  /** Qual coleção está na mão agora — some da grade e vira a prévia flutuante. */
  const [arrastando, setArrastando] = useState<string | null>(null);

  /*
   * O card inteiro arrasta, e ele tem botões dentro.
   *
   * Sem a distância mínima, todo clique em "Abrir as subcoleções" viraria um
   * arrasto de zero pixel e o botão nunca dispararia. Cinco pixels é menos que
   * o tremor de mão num clique e mais que zero.
   */
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );
  const [criando, setCriando] = useState(false);
  const [nome, setNome] = useState("");
  const [menuAberto, setMenuAberto] = useState<string | null>(null);
  /** Qual coleção está esperando confirmação do apagar-com-tudo. */
  const [confirmandoTudo, setConfirmandoTudo] = useState<ColecaoDoSwipe | null>(
    null,
  );

  const todas = data?.colecoes ?? [];
  /**
   * Só as filhas do nível atual.
   *
   * Antes a grade listava TODAS de uma vez, e uma subcoleção aparecia como
   * card solto ao lado da mãe — o que fez parecer que subir a pasta tinha
   * criado as subpastas fora da coleção escolhida. Elas estavam no lugar
   * certo; a tela é que não mostrava a hierarquia que o banco já tinha.
   */
  const colecoes = todas.filter(
    (c) => (c.parentId ?? null) === (paiAtual?.id ?? null),
  );
  /** Quantas subcoleções cada uma tem — o card precisa anunciar que dá para entrar. */
  const filhasPorPai = new Map<string, number>();
  for (const c of todas) {
    if (!c.parentId) continue;
    filhasPorPai.set(c.parentId, (filhasPorPai.get(c.parentId) ?? 0) + 1);
  }

  /** O caminho até aqui, para o rastro de navegação. */
  const trilha: ColecaoDoSwipe[] = [];
  {
    let atual = paiAtual;
    const vistos = new Set<string>();
    while (atual && !vistos.has(atual.id)) {
      vistos.add(atual.id);
      trilha.unshift(atual);
      atual = todas.find((c) => c.id === atual!.parentId) ?? null;
    }
  }

  function aoSoltar(e: DragEndEvent) {
    setArrastando(null);
    const id = e.active.data.current?.colecaoId as string | undefined;
    if (!id || !e.over) return;

    const destino = (e.over.data.current?.colecaoId ?? null) as string | null;
    if (destino === id) return; // soltou em si mesma

    const atual = todas.find((c) => c.id === id);
    if (!atual) return;
    // Já está lá: um PATCH que não muda nada ainda assim invalidaria a
    // listagem e faria a grade piscar sem motivo.
    if ((atual.parentId ?? null) === destino) return;

    const nomeDoDestino = destino
      ? todas.find((c) => c.id === destino)?.nome
      : null;
    mover
      .mutateAsync({ id, parentId: destino })
      .then(() =>
        toast.success(
          nomeDoDestino
            ? `“${atual.nome}” foi para dentro de “${nomeDoDestino}”`
            : `“${atual.nome}” voltou para a raiz`,
        ),
      )
      /*
       * O erro que importa é o ciclo, e ele vem do servidor com a frase certa.
       * Repetir a checagem aqui daria duas fontes de verdade para a mesma
       * regra — e a do cliente ficaria desatualizada primeiro.
       */
      .catch((err) =>
        toast.error(err instanceof Error ? err.message : "Não consegui mover"),
      );
  }

  function confirmarCriacao() {
    const n = nome.trim();
    if (!n) {
      setCriando(false);
      return;
    }
    criar
      // Nasce DENTRO de onde a pessoa está: criar sempre na raiz obrigaria a
      // arrastar depois, e "dentro" é o que o breadcrumb acima promete.
      .mutateAsync({ nome: n, parentId: paiAtual?.id ?? null })
      .then((c) => {
        // O nome pode voltar diferente: repetido ganha sufixo em vez de ser
        // recusado, e quem digitou precisa saber com o que ficou.
        toast.success(
          c.nome === n
            ? `“${c.nome}” criada`
            : `Já existia uma — criei “${c.nome}”`,
        );
        setNome("");
        setCriando(false);
      })
      .catch((e) =>
        toast.error(e instanceof Error ? e.message : "Não consegui criar"),
      );
  }

  if (isLoading) {
    return (
      <p className="flex items-center justify-center gap-2 p-12 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando as coleções…
      </p>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(e) =>
        setArrastando((e.active.data.current?.colecaoId as string) ?? null)
      }
      onDragCancel={() => setArrastando(null)}
      onDragEnd={aoSoltar}
    >
      <div className="space-y-3">
        {/* O rastro de onde estamos. Sem ele, entrar numa subcoleção e ver a
          grade trocar não diz para onde se foi nem como voltar. */}
        {trilha.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 text-[12px]">
            <DegrauQueRecebe id="degrau-raiz" paraOnde={null}>
              <button
                type="button"
                onClick={() => onEntrar(null)}
                className="text-muted-foreground hover:text-foreground hover:underline"
              >
                Coleções
              </button>
            </DegrauQueRecebe>
            {trilha.map((c, i) => (
              <span key={c.id} className="flex items-center gap-1">
                <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
                {i === trilha.length - 1 ? (
                  <span className="font-medium">{c.nome}</span>
                ) : (
                  <DegrauQueRecebe id={`degrau-${c.id}`} paraOnde={c.id}>
                    <button
                      type="button"
                      onClick={() => onEntrar(c)}
                      className="text-muted-foreground hover:text-foreground hover:underline"
                    >
                      {c.nome}
                    </button>
                  </DegrauQueRecebe>
                )}
              </span>
            ))}
          </div>
        )}

        {criando ? (
          <div className="flex gap-2">
            <Input
              autoFocus
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmarCriacao();
                if (e.key === "Escape") {
                  setNome("");
                  setCriando(false);
                }
              }}
              placeholder="Nome da coleção — ex: Black Friday 2026"
              className="h-9 max-w-sm"
            />
            <Button
              size="sm"
              className="h-9"
              onClick={confirmarCriacao}
              disabled={criar.isPending}
            >
              {criar.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                "Criar"
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-9"
              onClick={() => setCriando(false)}
            >
              Cancelar
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5"
            onClick={() => setCriando(true)}
          >
            <FolderPlus className="h-3.5 w-3.5" />
            Nova coleção
          </Button>
        )}

        {colecoes.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/40 p-10 text-center">
            {paiAtual ? (
              <>
                <p className="text-sm font-medium">Sem subcoleções aqui</p>
                <p className="mx-auto mt-1 max-w-md text-[12px] text-muted-foreground">
                  “{paiAtual.nome}” tem {paiAtual.pecas}{" "}
                  {paiAtual.pecas === 1 ? "referência" : "referências"} e
                  nenhuma subcoleção.
                </p>
                <button
                  type="button"
                  onClick={() => onAbrir(paiAtual)}
                  className="mt-3 text-[12px] text-primary hover:underline"
                >
                  Ver as referências
                </button>
              </>
            ) : (
              <>
                <p className="text-sm font-medium">Nenhuma coleção ainda</p>
                <p className="mx-auto mt-1 max-w-md text-[12px] text-muted-foreground">
                  Coleção é o recorte que os filtros não fazem: “o que separei
                  para o lançamento”, “o que mandei pro cliente”. Uma peça pode
                  estar em várias.
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {colecoes.map((c) => (
              <CardArrastavel
                key={c.id}
                id={c.id}
                arrastando={arrastando === c.id}
              >
                <button
                  type="button"
                  onClick={() => onAbrir(c)}
                  className="flex w-full flex-col gap-1 p-4 text-left"
                >
                  <span className="truncate pr-6 text-[14px] font-semibold">
                    {c.nome}
                  </span>
                  <span className="text-[12px] text-muted-foreground">
                    {c.pecas} {c.pecas === 1 ? "referência" : "referências"}
                    {(filhasPorPai.get(c.id) ?? 0) > 0 &&
                      ` · ${filhasPorPai.get(c.id)} ${
                        filhasPorPai.get(c.id) === 1
                          ? "subcoleção"
                          : "subcoleções"
                      }`}
                    {c.mexidaEm ? ` · ${quando(c.mexidaEm)}` : ""}
                  </span>
                  {c.descricao && (
                    <span className="mt-0.5 line-clamp-2 text-[12px] text-muted-foreground">
                      {c.descricao}
                    </span>
                  )}
                </button>

                {/* Entrar é uma ação SEPARADA de abrir: uma mostra o que tem
                  dentro, a outra mostra as referências. Num card só, o mesmo
                  clique teria de adivinhar qual das duas a pessoa quis. */}
                {(filhasPorPai.get(c.id) ?? 0) > 0 && (
                  <button
                    type="button"
                    onClick={() => onEntrar(c)}
                    className="flex w-full items-center gap-1 border-t border-border/40 px-4 py-1.5 text-left text-[11px] text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
                  >
                    <FolderOpen className="h-3 w-3" />
                    Abrir as subcoleções
                  </button>
                )}

                <button
                  type="button"
                  onClick={() =>
                    setMenuAberto(menuAberto === c.id ? null : c.id)
                  }
                  aria-label={`Opções de ${c.nome}`}
                  className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-muted focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>

                {menuAberto === c.id && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setMenuAberto(null)}
                    />
                    <div className="absolute right-2 top-8 z-50 w-52 rounded-lg border border-border bg-popover p-1 shadow-lg">
                      {/*
                      Duas ações, não uma com caixinha.

                      "Apagar a coleção" e "apagar tudo" têm consequências
                      diferentes e irreversíveis em graus diferentes — uma
                      caixa de seleção acima de um botão vermelho é fácil de
                      não ler, e a diferença entre as duas é justamente o que
                      a pessoa precisa notar.
                    */}
                      <button
                        type="button"
                        onClick={() => {
                          setMenuAberto(null);
                          excluir.mutate(
                            { id: c.id },
                            {
                              onSuccess: () =>
                                toast.success(`“${c.nome}” apagada`, {
                                  description:
                                    "As referências continuam na biblioteca.",
                                }),
                              onError: () => toast.error("Não consegui apagar"),
                            },
                          );
                        }}
                        className="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-[12px] text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <Trash2 className="mt-0.5 h-3 w-3 shrink-0" />
                        <span>
                          Apagar só a coleção
                          <span className="block text-[10px] opacity-70">
                            As referências continuam na biblioteca.
                          </span>
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setMenuAberto(null);
                          setConfirmandoTudo(c);
                        }}
                        className="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-[12px] text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="mt-0.5 h-3 w-3 shrink-0" />
                        <span>
                          Apagar com as referências
                          <span className="block text-[10px] opacity-70">
                            Some da biblioteca e do armazenamento.
                          </span>
                        </span>
                      </button>
                    </div>
                  </>
                )}
              </CardArrastavel>
            ))}
          </div>
        )}

        {/*
        A confirmação do apagar-com-tudo.

        Diz o NÚMERO de referências, não "as referências": um "apagar 28
        arquivos" faz pensar; um "apagar as referências" passa batido. E avisa
        do caso que surpreende — a peça que também está em outra coleção
        sobrevive, e quem esperava limpar tudo precisa saber disso antes.
      */}
        <AlertDialog
          open={!!confirmandoTudo}
          onOpenChange={(aberto) => !aberto && setConfirmandoTudo(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Apagar “{confirmandoTudo?.nome}” e as referências dela?
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2">
                  <p>
                    {confirmandoTudo?.pecas ?? 0}{" "}
                    {confirmandoTudo?.pecas === 1
                      ? "referência sai"
                      : "referências saem"}{" "}
                    da biblioteca e{" "}
                    {confirmandoTudo?.pecas === 1
                      ? "o arquivo é apagado"
                      : "os arquivos são apagados"}{" "}
                    do armazenamento. Não dá pra desfazer.
                  </p>
                  <p className="text-[12px]">
                    As subcoleções vão junto, com as referências delas. O que
                    também estiver em outra coleção <strong>fica</strong> — foi
                    separado para dois usos, e um deles continua valendo.
                  </p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  const alvo = confirmandoTudo;
                  if (!alvo) return;
                  setConfirmandoTudo(null);
                  excluir.mutate(
                    { id: alvo.id, comAsPecas: true },
                    {
                      onSuccess: (r) =>
                        toast.success(`“${alvo.nome}” apagada`, {
                          description: `${r.pecasApagadas} ${
                            r.pecasApagadas === 1
                              ? "referência saiu"
                              : "referências saíram"
                          } da biblioteca.`,
                        }),
                      onError: () => toast.error("Não consegui apagar"),
                    },
                  );
                }}
              >
                Apagar tudo
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/*
        A prévia que segue o cursor.

        Sem ela o card só some da grade e nada acompanha o gesto — a pessoa
        arrasta o vazio e não sabe se pegou a coleção certa. O nome basta:
        o card inteiro flutuando taparia justamente o alvo que se quer mirar.
      */}
      <DragOverlay dropAnimation={null}>
        {arrastando ? (
          <span className="pointer-events-none rounded-lg border border-primary/60 bg-popover px-2.5 py-1.5 text-[12px] font-medium shadow-lg">
            {todas.find((c) => c.id === arrastando)?.nome ?? "Coleção"}
          </span>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
