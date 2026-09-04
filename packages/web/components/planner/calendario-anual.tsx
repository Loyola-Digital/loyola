"use client";

/**
 * Calendário anual — a matriz de esteiras × meses.
 *
 * ## O que esta tela é
 *
 * A escala macro do Planner. Cada linha é uma máquina que roda ao longo do ano
 * ("Webinar diário", "Reunião secreta 3x por mês"); cada coluna é um mês. Ao
 * lado do Gantt de campanhas, que trata do evento datado — um lançamento com
 * cinco fases não é a mesma coisa que algo que acontece todo mês, e tentar
 * desenhar os dois no mesmo eixo achata os dois.
 *
 * ## Salva ao SAIR do campo
 *
 * Mesmo critério do resto do Planner. Quem preenche a matriz atravessa dezenas
 * de campos em sequência; gravar por tecla seria uma requisição por letra.
 *
 * ## Doze colunas não cabem na tela
 *
 * A grade rola na horizontal com a coluna das esteiras congelada à esquerda —
 * sem ela, rolar até Outubro deixa quem lê sem saber de que linha é a célula.
 * É o mesmo desenho da planilha que o time já usava.
 */

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  useAtualizarEsteira,
  useAtualizarGrupo,
  useCriarEsteira,
  useCriarEsteirasIniciais,
  useExcluirEsteira,
  useGravarCelula,
  useMatrizAnual,
  type CelulaAnual,
  type EsteiraAnual,
  type GrupoAnual,
} from "@/lib/hooks/use-planner-anual";

const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
] as const;

const CATEGORIAS = ["Back-End", "Front-End"] as const;
const FUNIS = [
  "Lançamento",
  "DR - VSL",
  "Grupo de Conteúdo",
  "Reunião Secreta",
  "Webinar diário",
  "Time comercial",
] as const;

/**
 * Os três da lateral, na ordem em que aparecem.
 *
 * Fallback: o servidor devolve os nomes e cores que a empresa escolheu, mas a
 * tela precisa desenhar algo enquanto a matriz não chegou — e as chaves
 * (`organico`…) são fixas dos dois lados.
 */
const GRUPOS_PADRAO: GrupoAnual[] = [
  { id: "organico", rotulo: "ORGÂNICO", cor: "#A32B1F" },
  { id: "trafego", rotulo: "TRÁFEGO", cor: "#5A7F3C" },
  { id: "ascensao", rotulo: "ASCENSÃO", cor: "#1F3864" },
];

/**
 * Sugestões de cor para a faixa.
 *
 * As três da planilha do time mais tons que se distinguem delas à distância —
 * a faixa é lida de relance na lateral, e dois vermelhos parecidos fariam
 * ORGÂNICO e o grupo vizinho virarem a mesma coisa ao passar o olho.
 */
const CORES_SUGERIDAS = [
  "#A32B1F",
  "#5A7F3C",
  "#1F3864",
  "#B45309",
  "#7C3AED",
  "#0F766E",
  "#BE185D",
  "#3F3F46",
];

const LARGURA_FAIXA = 26;
const LARGURA_ESTEIRA = 200;
const LARGURA_MES = 158;
/**
 * Altura de cada campo dentro da célula.
 *
 * Fixa porque os rótulos da coluna da esquerda (Produto, Categoria, Funil)
 * precisam cair na MESMA linha do campo correspondente de todos os doze meses
 * — é o que a planilha faz, e o que transforma doze caixas soltas numa tabela
 * que se lê na horizontal.
 */
const ALTURA_CAMPO = 22;
const ALTURA_FREQUENCIA = 20;
const ALTURA_LINHA = ALTURA_FREQUENCIA + ALTURA_CAMPO * 3 + 14;

/** Um campo de texto que só avisa quando a pessoa sai dele. */
function Texto({
  valor,
  onGravar,
  placeholder,
  className = "",
}: {
  valor: string;
  onGravar: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [local, setLocal] = useState(valor);
  // Só reconcilia quando o valor de fora muda de verdade: sem isto, a resposta
  // do servidor sobrescreveria o que a pessoa digitou desde então.
  useEffect(() => setLocal(valor), [valor]);

  return (
    <input
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => local !== valor && onGravar(local)}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        // Esc devolve o valor gravado — a saída sem consequência de quem
        // começou a digitar na célula errada.
        if (e.key === "Escape") {
          setLocal(valor);
          e.currentTarget.blur();
        }
      }}
      placeholder={placeholder}
      className={`w-full min-w-0 border-0 bg-transparent p-0 outline-none placeholder:text-muted-foreground/50 focus:bg-primary/5 ${className}`}
    />
  );
}

function Escolha({
  valor,
  opcoes,
  onGravar,
  placeholder,
}: {
  valor: string;
  opcoes: readonly string[];
  onGravar: (v: string) => void;
  placeholder: string;
}) {
  return (
    <select
      value={valor}
      onChange={(e) => onGravar(e.target.value)}
      className={`w-full min-w-0 cursor-pointer truncate border-0 bg-transparent p-0 text-[11px] outline-none focus:bg-primary/5 ${
        valor ? "" : "text-muted-foreground/50"
      }`}
    >
      <option value="">{placeholder}</option>
      {opcoes.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

/**
 * Uma célula: a frequência acima da caixa, e dentro os três campos.
 *
 * A frequência fica FORA da moldura, como na planilha — ela responde "quando",
 * enquanto os de dentro respondem "o quê". Misturá-los na mesma caixa faz a
 * pessoa procurar a data entre os dropdowns.
 */
function Celula({
  celula,
  onGravar,
}: {
  celula: CelulaAnual;
  onGravar: (c: CelulaAnual) => void;
}) {
  const mudar = (campo: keyof CelulaAnual, v: string) =>
    onGravar({ ...celula, [campo]: v.trim() || null });

  // Célula vazia fica com a moldura apagada: numa grade de 12 meses, doze
  // caixas igualmente marcadas escondem quais têm plano de verdade.
  const vazia = !celula.produto && !celula.categoria && !celula.funil;

  return (
    <div
      className="shrink-0 border-r border-border/50 px-1.5 pb-1.5"
      style={{ width: LARGURA_MES, height: ALTURA_LINHA }}
    >
      <div style={{ height: ALTURA_FREQUENCIA }} className="flex items-center">
        <Texto
          valor={celula.frequencia ?? ""}
          onGravar={(v) => mudar("frequencia", v)}
          placeholder="—"
          className="text-center text-[10px] font-medium text-muted-foreground"
        />
      </div>
      <div
        className={`rounded-md border bg-card px-2 ${
          vazia ? "border-border/40" : "border-border"
        }`}
      >
        <div style={{ height: ALTURA_CAMPO }} className="flex items-center">
          <Texto
            valor={celula.produto ?? ""}
            onGravar={(v) => mudar("produto", v)}
            placeholder="—"
            className="text-[11px] font-medium"
          />
        </div>
        <div style={{ height: ALTURA_CAMPO }} className="flex items-center border-t border-border/30">
          <Escolha
            valor={celula.categoria ?? ""}
            opcoes={CATEGORIAS}
            onGravar={(v) => mudar("categoria", v)}
            placeholder="—"
          />
        </div>
        <div style={{ height: ALTURA_CAMPO }} className="flex items-center border-t border-border/30">
          <Escolha
            valor={celula.funil ?? ""}
            opcoes={FUNIS}
            onGravar={(v) => mudar("funil", v)}
            placeholder="—"
          />
        </div>
      </div>
    </div>
  );
}

/**
 * A coluna da esquerda de uma esteira: nome e os rótulos dos campos.
 *
 * Os rótulos existem porque, sem eles, os três campos da célula são três
 * caixas de texto sem nome — e "Back-End" sozinho não diz se é categoria ou
 * produto. Na planilha eles aparecem uma vez por linha, à esquerda, e é o que
 * permite ler os doze meses na horizontal sem reler o cabeçalho.
 */
function ColunaDaEsteira({
  esteira,
  onRenomear,
  onExcluir,
}: {
  esteira: EsteiraAnual;
  onRenomear: (nome: string) => void;
  onExcluir: () => void;
}) {
  return (
    <div
      className="group flex shrink-0 flex-col border-r border-border bg-background px-2 pb-1.5"
      style={{ width: LARGURA_ESTEIRA - LARGURA_FAIXA, height: ALTURA_LINHA }}
    >
      <div style={{ height: ALTURA_FREQUENCIA }} className="flex items-center gap-1">
        <Texto
          valor={esteira.nome}
          onGravar={onRenomear}
          placeholder="nome da esteira"
          className="text-[12px] font-semibold"
        />
        <button
          type="button"
          onClick={onExcluir}
          title="Excluir esteira"
          aria-label={`Excluir esteira ${esteira.nome || "sem nome"}`}
          className="grid h-5 w-5 shrink-0 place-items-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
      {/* Alinhados com os campos da célula pela mesma altura — ver ALTURA_CAMPO. */}
      {["Produto", "Categoria", "Funil"].map((r, i) => (
        <div
          key={r}
          style={{ height: ALTURA_CAMPO }}
          className={`flex items-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground ${
            i === 0 ? "" : "border-t border-border/30"
          }`}
        >
          {r}
        </div>
      ))}
    </div>
  );
}

/**
 * Um grupo inteiro — a faixa colorida e as esteiras dele.
 *
 * A faixa é UM elemento com a altura do grupo todo, e não um pedaço por linha.
 * Fatiada, o texto vertical ficava espremido dentro de uma linha de 90px e a
 * cor aparecia em blocos separados por borda — que era o "esticado" feio.
 * Inteira, ela se lê de uma vez, como na planilha.
 *
 * A coluna da esquerda inteira é `sticky`: rolar até Outubro sem ela deixa
 * quem lê sem saber de que esteira é a célula.
 */
function BlocoDoGrupo({
  grupo,
  esteiras,
  onGravarCelula,
  onRenomear,
  onExcluir,
  onEditarFaixa,
}: {
  grupo: GrupoAnual;
  esteiras: EsteiraAnual[];
  onGravarCelula: (esteiraId: string, mes: number, c: CelulaAnual) => void;
  onRenomear: (esteiraId: string, nome: string) => void;
  onExcluir: (esteira: EsteiraAnual) => void;
  /** Recebe o ponto do clique — o painel abre ancorado nele, ver o porquê lá. */
  onEditarFaixa: (clientX: number, clientY: number) => void;
}) {
  if (esteiras.length === 0) return null;

  return (
    <div className="flex border-b-2 border-border">
      <div
        className="sticky left-0 z-20 flex shrink-0 bg-background"
        style={{ width: LARGURA_ESTEIRA }}
      >
        {/* A faixa: cor do grupo e o nome girado, centralizado na altura toda.
            Clicar nela abre o painel de nome e cor — o lápis só aparece no
            hover para não competir com o rótulo, que é o que se lê aqui. */}
        <button
          type="button"
          onClick={(ev) => onEditarFaixa(ev.clientX, ev.clientY)}
          title={`Renomear ou trocar a cor de "${grupo.rotulo}"`}
          aria-label={`Editar a faixa ${grupo.rotulo}`}
          className="group/faixa relative flex shrink-0 items-center justify-center transition-[filter] hover:brightness-125"
          style={{ width: LARGURA_FAIXA, backgroundColor: grupo.cor }}
        >
          <Pencil className="absolute top-1.5 h-2.5 w-2.5 text-white/0 transition-colors group-hover/faixa:text-white/80" />
          <span
            className="whitespace-nowrap text-[9px] font-bold tracking-[0.18em] text-white"
            style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
          >
            {grupo.rotulo}
          </span>
        </button>

        <div className="flex min-w-0 flex-col">
          {esteiras.map((e) => (
            <ColunaDaEsteira
              key={e.id}
              esteira={e}
              onRenomear={(nome) => onRenomear(e.id, nome)}
              onExcluir={() => onExcluir(e)}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col">
        {esteiras.map((e) => (
          <div key={e.id} className="flex border-b border-border/40 last:border-b-0">
            {e.meses.map((m, i) => (
              <Celula key={i} celula={m} onGravar={(c) => onGravarCelula(e.id, i + 1, c)} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * O painel de nome e cor da faixa.
 *
 * Ancorado no PONTO DO CLIQUE e `fixed`, não dentro do bloco: a grade rola na
 * horizontal com `overflow`, e um painel filho dela seria recortado — ou pior,
 * esticaria a área de rolagem quando o grupo tem uma linha só.
 *
 * O nome grava ao SAIR do campo, como o resto do calendário. A cor grava no
 * clique do quadradinho; o seletor livre espera a mão parar, senão arrastar o
 * matiz vira uma requisição por tom.
 */
function PainelDaFaixa({
  grupo,
  x,
  y,
  onGravar,
  onFechar,
}: {
  grupo: GrupoAnual;
  x: number;
  y: number;
  onGravar: (dados: { rotulo?: string | null; cor?: string | null }) => void;
  onFechar: () => void;
}) {
  const [nome, setNome] = useState(grupo.rotulo);
  const [cor, setCor] = useState(grupo.cor);
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => void (espera.current && clearTimeout(espera.current)), []);

  const corAoVivo = (c: string) => {
    setCor(c);
    if (espera.current) clearTimeout(espera.current);
    espera.current = setTimeout(() => onGravar({ cor: c }), 300);
  };

  const LARGURA = 248;
  const esquerda = Math.min(Math.max(8, x + 10), window.innerWidth - LARGURA - 8);
  const topo = Math.min(Math.max(8, y - 20), window.innerHeight - 210);

  return (
    <>
      <div className="fixed inset-0 z-[59]" onClick={onFechar} />
      <div
        className="fixed z-[60] rounded-lg border border-border bg-popover p-3 shadow-xl"
        style={{ left: esquerda, top: topo, width: LARGURA }}
      >
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Faixa
        </p>
        <input
          autoFocus
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          onBlur={() => nome.trim() !== grupo.rotulo && onGravar({ rotulo: nome })}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              setNome(grupo.rotulo);
              onFechar();
            }
          }}
          maxLength={40}
          placeholder="nome da faixa"
          className="w-full rounded-md border border-border bg-transparent px-2 py-1 text-[12px] outline-none focus:border-primary"
        />

        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {CORES_SUGERIDAS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => {
                setCor(c);
                onGravar({ cor: c });
              }}
              aria-label={`Cor ${c}`}
              className={`h-5 w-5 rounded border transition-transform hover:scale-110 ${
                c === cor ? "border-foreground" : "border-transparent"
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
          {/* O seletor livre fica junto dos atalhos, e não escondido atrás de
              um "mais": quem quer a cor exata da marca vem direto para cá. */}
          <label
            className="grid h-5 w-5 cursor-pointer place-items-center rounded border border-dashed border-border text-[9px] text-muted-foreground hover:border-foreground"
            title="Escolher outra cor"
          >
            +
            <input
              type="color"
              value={cor}
              onChange={(e) => corAoVivo(e.target.value)}
              onBlur={(e) => onGravar({ cor: e.target.value })}
              className="sr-only"
            />
          </label>
        </div>

        <button
          type="button"
          onClick={() => {
            setNome("");
            onGravar({ rotulo: null, cor: null });
            onFechar();
          }}
          className="mt-2.5 text-[10px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Voltar ao nome e à cor originais
        </button>
      </div>
    </>
  );
}

export function CalendarioAnual({
  projectId,
  ano,
  onMudarAno,
}: {
  projectId: string | null;
  ano: number;
  onMudarAno: (a: number) => void;
}) {
  const { data, isLoading } = useMatrizAnual(projectId, ano);
  const gravar = useGravarCelula(projectId, ano);
  const criar = useCriarEsteira(projectId, ano);
  const iniciais = useCriarEsteirasIniciais(projectId, ano);
  const renomear = useAtualizarEsteira(projectId, ano);
  const excluir = useExcluirEsteira(projectId, ano);
  const mexerNaFaixa = useAtualizarGrupo(projectId, ano);

  const rolagem = useRef<HTMLDivElement>(null);
  /** Qual faixa está em edição e onde o painel abre. */
  const [editandoFaixa, setEditandoFaixa] = useState<{
    grupo: GrupoAnual;
    x: number;
    y: number;
  } | null>(null);

  if (!projectId) {
    return (
      <p className="rounded-xl border border-dashed border-border/40 p-10 text-center text-sm text-muted-foreground">
        Escolha uma empresa para ver o calendário anual dela.
      </p>
    );
  }

  if (isLoading) {
    return (
      <p className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando o ano…
      </p>
    );
  }

  const esteiras = data?.esteiras ?? [];
  // O servidor manda os três já com o nome e a cor da empresa aplicados; o
  // padrão local só cobre o instante entre o render e a resposta.
  const grupos = data?.grupos ?? GRUPOS_PADRAO;

  // Matriz sem linha nenhuma não ensina o que ela é: em vez de uma grade vazia,
  // o convite para começar com as esteiras que o time já usava.
  if (esteiras.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/40 p-10 text-center">
        <p className="text-sm font-medium">Nenhuma esteira nesta empresa</p>
        <p className="mx-auto mt-1 max-w-md text-[12px] text-muted-foreground">
          Uma esteira é o que roda ao longo do ano — lançamento, perpétuo, webinar diário. Comece
          com as seis do calendário que o time já usa e ajuste depois.
        </p>
        <button
          type="button"
          onClick={() =>
            iniciais
              .mutateAsync()
              .then(() => toast.success("Esteiras criadas"))
              .catch((e) => toast.error(e instanceof Error ? e.message : "Não consegui criar"))
          }
          disabled={iniciais.isPending}
          className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-foreground bg-foreground px-3 py-1.5 text-[12px] font-medium text-background disabled:opacity-50"
        >
          {iniciais.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plus className="h-3.5 w-3.5" />
          )}
          Criar as esteiras iniciais
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onMudarAno(ano - 1)}
          aria-label="Ano anterior"
          className="grid h-7 w-7 place-items-center rounded-md text-foreground/70 hover:bg-muted"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-base font-semibold tabular-nums">{ano}</span>
        <button
          type="button"
          onClick={() => onMudarAno(ano + 1)}
          aria-label="Próximo ano"
          className="grid h-7 w-7 place-items-center rounded-md text-foreground/70 hover:bg-muted"
        >
          <ChevronRight className="h-4 w-4" />
        </button>

        <div className="flex-1" />

        {grupos.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() =>
              criar
                .mutateAsync({ grupo: g.id })
                .catch((e) => toast.error(e instanceof Error ? e.message : "Não consegui criar"))
            }
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium hover:bg-muted"
          >
            <Plus className="h-3 w-3" style={{ color: g.cor }} />
            {g.rotulo}
          </button>
        ))}
      </div>

      <div ref={rolagem} className="overflow-x-auto rounded-xl border border-border">
        <div style={{ minWidth: LARGURA_ESTEIRA + 12 * LARGURA_MES }}>
          {/* Cabeçalho dos meses. A célula vazia da esquerda acompanha a coluna
              congelada, senão os nomes dos meses saem de alinhamento. */}
          <div className="flex border-b-2 border-border">
            <div
              className="sticky left-0 z-30 shrink-0 bg-background"
              style={{ width: LARGURA_ESTEIRA }}
            />
            {MESES.map((m, i) => (
              <div
                key={m}
                /* Alternado como na planilha: doze cabeçalhos iguais numa faixa
                   longa fazem perder a coluna ao percorrer com o olho. */
                className={`shrink-0 px-1 py-2 text-center text-[11px] font-bold uppercase tracking-wide ${
                  i % 2 === 0
                    ? "bg-foreground text-background"
                    : "bg-muted-foreground/70 text-background"
                }`}
                style={{ width: LARGURA_MES }}
              >
                {m}
              </div>
            ))}
          </div>

          {grupos.map((g) => (
            <BlocoDoGrupo
              key={g.id}
              grupo={g}
              esteiras={esteiras.filter((e) => e.grupo === g.id)}
              onEditarFaixa={(x, y) => setEditandoFaixa({ grupo: g, x, y })}
              onGravarCelula={(esteiraId, mes, celula) => {
                gravar.mutate(
                  { trackId: esteiraId, mes, celula },
                  {
                    onError: (err) =>
                      toast.error(err instanceof Error ? err.message : "Não consegui salvar"),
                  },
                );
              }}
              onRenomear={(id, nome) => renomear.mutate({ id, nome })}
              onExcluir={(e) => {
                excluir.mutate(e.id);
                toast.success(`"${e.nome || "Esteira"}" excluída`, {
                  // O ano inteiro daquela linha vai junto — vale dizer antes
                  // que a pessoa procure onde foi.
                  description: "As doze células dela saíram também.",
                  duration: 20_000,
                  action: {
                    label: "Desfazer",
                    onClick: () => {
                      void criar
                        .mutateAsync({ grupo: e.grupo, nome: e.nome })
                        .then(() =>
                          toast.success(
                            `"${e.nome || "Esteira"}" recriada — as células precisam ser preenchidas de novo.`,
                          ),
                        )
                        .catch(() => toast.error("Não consegui recriar"));
                    },
                  },
                });
              }}
            />
          ))}
        </div>
      </div>

      {editandoFaixa && (
        <PainelDaFaixa
          grupo={editandoFaixa.grupo}
          x={editandoFaixa.x}
          y={editandoFaixa.y}
          onGravar={(dados) =>
            mexerNaFaixa.mutate(
              { grupo: editandoFaixa.grupo.id, ...dados },
              {
                onError: (err) =>
                  toast.error(err instanceof Error ? err.message : "Não consegui salvar a faixa"),
              },
            )
          }
          onFechar={() => setEditandoFaixa(null)}
        />
      )}
    </div>
  );
}
