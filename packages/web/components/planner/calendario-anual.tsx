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
import { ChevronLeft, ChevronRight, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  useAtualizarEsteira,
  useCriarEsteira,
  useCriarEsteirasIniciais,
  useExcluirEsteira,
  useGravarCelula,
  useMatrizAnual,
  type CelulaAnual,
  type EsteiraAnual,
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

/** Os três da lateral, na ordem em que aparecem. */
const GRUPOS = [
  { id: "organico", rotulo: "ORGÂNICO", cor: "#A32B1F" },
  { id: "trafego", rotulo: "TRÁFEGO", cor: "#5A7F3C" },
  { id: "ascensao", rotulo: "ASCENSÃO", cor: "#1F3864" },
] as const;

const LARGURA_ESTEIRA = 210;
const LARGURA_MES = 168;

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

  return (
    <div className="px-1 py-1" style={{ width: LARGURA_MES }}>
      <Texto
        valor={celula.frequencia ?? ""}
        onGravar={(v) => mudar("frequencia", v)}
        placeholder="quando…"
        className="mb-1 text-center text-[10.5px] text-muted-foreground"
      />
      <div className="space-y-0.5 rounded-md border border-border bg-card px-2 py-1.5">
        <Texto
          valor={celula.produto ?? ""}
          onGravar={(v) => mudar("produto", v)}
          placeholder="produto"
          className="text-[11px] font-medium"
        />
        <Escolha
          valor={celula.categoria ?? ""}
          opcoes={CATEGORIAS}
          onGravar={(v) => mudar("categoria", v)}
          placeholder="categoria"
        />
        <Escolha
          valor={celula.funil ?? ""}
          opcoes={FUNIS}
          onGravar={(v) => mudar("funil", v)}
          placeholder="funil"
        />
      </div>
    </div>
  );
}

function LinhaDaEsteira({
  esteira,
  primeiraDoGrupo,
  totalNoGrupo,
  cor,
  rotulo,
  onGravarCelula,
  onRenomear,
  onExcluir,
}: {
  esteira: EsteiraAnual;
  primeiraDoGrupo: boolean;
  totalNoGrupo: number;
  cor: string;
  rotulo: string;
  onGravarCelula: (mes: number, c: CelulaAnual) => void;
  onRenomear: (nome: string) => void;
  onExcluir: () => void;
}) {
  return (
    <div className="flex border-b border-border">
      {/* A faixa do grupo aparece UMA vez, na primeira linha dele: repetida em
          todas viraria uma parede de texto vertical. */}
      <div
        className="sticky left-0 z-10 flex shrink-0 items-stretch bg-background"
        style={{ width: LARGURA_ESTEIRA }}
      >
        <div className="w-6 shrink-0" style={{ backgroundColor: primeiraDoGrupo ? cor : cor }}>
          {primeiraDoGrupo && (
            <span
              className="flex h-full items-center justify-center text-[9px] font-bold tracking-[0.14em] text-white"
              style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
            >
              {totalNoGrupo > 0 ? rotulo : ""}
            </span>
          )}
        </div>
        <div className="group flex min-w-0 flex-1 items-center gap-1 px-2">
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
            className="grid h-6 w-6 shrink-0 place-items-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>

      {esteira.meses.map((m, i) => (
        <Celula key={i} celula={m} onGravar={(c) => onGravarCelula(i + 1, c)} />
      ))}
    </div>
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

  const rolagem = useRef<HTMLDivElement>(null);

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

        {GRUPOS.map((g) => (
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
          <div className="flex border-b border-border bg-muted/40">
            <div
              className="sticky left-0 z-20 shrink-0 bg-muted/40"
              style={{ width: LARGURA_ESTEIRA }}
            />
            {MESES.map((m) => (
              <div
                key={m}
                className="shrink-0 px-1 py-1.5 text-center text-[11px] font-semibold"
                style={{ width: LARGURA_MES }}
              >
                {m}
              </div>
            ))}
          </div>

          {GRUPOS.flatMap((g) => {
            const doGrupo = esteiras.filter((e) => e.grupo === g.id);
            return doGrupo.map((e, i) => (
              <LinhaDaEsteira
                key={e.id}
                esteira={e}
                primeiraDoGrupo={i === 0}
                totalNoGrupo={doGrupo.length}
                cor={g.cor}
                rotulo={g.rotulo}
                onGravarCelula={(mes, celula) => {
                  gravar.mutate(
                    { trackId: e.id, mes, celula },
                    {
                      onError: (err) =>
                        toast.error(err instanceof Error ? err.message : "Não consegui salvar"),
                    },
                  );
                }}
                onRenomear={(nome) => renomear.mutate({ id: e.id, nome })}
                onExcluir={() => {
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
            ));
          })}
        </div>
      </div>
    </div>
  );
}
