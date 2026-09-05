"use client";

/**
 * Os filtros da biblioteca.
 *
 * ## Por que não é só uma linha de chips
 *
 * Era. E funcionava com quatro plataformas e oito formatos — mas a biblioteca
 * chegou a 291 referências com **118 nichos, 113 marcas e 781 tags**, e o
 * painel passou a despejar mais de mil chips numa div. Além de ilegível, a
 * ordem alfabética punha na frente justamente as opções que menos servem:
 * `acesso-vitalicio` (1 referência) antes de `escassez` (66).
 *
 * Então o grupo se adapta ao tamanho da lista:
 *
 * - até doze opções, a linha de chips de sempre — é o caso de Plataforma e
 *   Formato, e trocar isso por um menu seria esconder o que já cabia na tela;
 * - acima disso, as mais usadas à vista, busca própria e um "ver todas" que
 *   abre a cauda longa dentro de uma área com rolagem, sem esticar a página.
 *
 * ## A contagem fica visível
 *
 * `escassez 66` e `quiz-funil 1` são coisas diferentes, e só o número separa
 * as duas. Sem ele, a pessoa clica num filtro esperando um recorte e recebe
 * um item — três vezes, até desistir do painel.
 */

import { useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";

export interface OpcaoDeFiltro {
  valor: string;
  n: number;
}

/** Acima disto, a lista ganha busca em vez de virar parede de chips. */
const CABE_EM_CHIPS = 12;
/** Quantas aparecem antes do "ver todas". */
const VISIVEIS = 12;

/** Chip de filtro — clicar de novo limpa. Compartilhado com a barra de cima. */
export function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
        active
          ? "border-primary bg-primary/10 font-medium text-primary"
          : "border-border/50 text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

/** O chip de uma opção, com a contagem em tom mais fraco. */
function ChipDeOpcao({
  opcao,
  ativo,
  onClick,
}: {
  opcao: OpcaoDeFiltro;
  ativo: boolean;
  onClick: () => void;
}) {
  return (
    <Chip active={ativo} onClick={onClick}>
      {opcao.valor}
      <span className={`ml-1 tabular-nums ${ativo ? "opacity-70" : "opacity-50"}`}>{opcao.n}</span>
    </Chip>
  );
}

export function GrupoDeFiltro({
  rotulo,
  opcoes,
  ativo,
  onEscolher,
}: {
  rotulo: string;
  opcoes: OpcaoDeFiltro[];
  ativo: string | undefined;
  onEscolher: (valor: string) => void;
}) {
  const [busca, setBusca] = useState("");
  const [tudo, setTudo] = useState(false);

  if (opcoes.length === 0) return null;

  const Rotulo = (
    <span className="w-[74px] shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
      {rotulo}
    </span>
  );

  if (opcoes.length <= CABE_EM_CHIPS) {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {Rotulo}
        {opcoes.map((o) => (
          <ChipDeOpcao
            key={o.valor}
            opcao={o}
            ativo={ativo === o.valor}
            onClick={() => onEscolher(o.valor)}
          />
        ))}
      </div>
    );
  }

  const filtradas = busca.trim()
    ? opcoes.filter((o) => o.valor.toLowerCase().includes(busca.trim().toLowerCase()))
    : opcoes;
  const mostrar = busca.trim() || tudo ? filtradas : filtradas.slice(0, VISIVEIS);

  // O escolhido sempre aparece, mesmo fora das mais usadas e fora da busca —
  // senão o filtro em vigor some da tela e não há como desligá-lo daqui.
  const escolhido = ativo && !mostrar.some((o) => o.valor === ativo)
    ? opcoes.find((o) => o.valor === ativo)
    : undefined;

  return (
    <div className="flex items-start gap-1.5">
      <div className="pt-1.5">{Rotulo}</div>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="relative max-w-[280px]">
          <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder={`Buscar entre ${opcoes.length} ${rotulo.toLowerCase()}...`}
            className="h-7 pl-7 pr-6 text-[11px]"
          />
          {busca && (
            <button
              type="button"
              onClick={() => setBusca("")}
              aria-label="Limpar a busca do filtro"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Rolagem própria: a cauda longa não pode empurrar a galeria para
            fora da tela — é a galeria que a pessoa veio ver. */}
        <div className="flex max-h-[132px] flex-wrap items-center gap-1.5 overflow-y-auto">
          {escolhido && (
            <ChipDeOpcao opcao={escolhido} ativo onClick={() => onEscolher(escolhido.valor)} />
          )}
          {mostrar.map((o) => (
            <ChipDeOpcao
              key={o.valor}
              opcao={o}
              ativo={ativo === o.valor}
              onClick={() => onEscolher(o.valor)}
            />
          ))}

          {mostrar.length === 0 && (
            <span className="text-[11px] text-muted-foreground">Nada com “{busca}”.</span>
          )}

          {!busca.trim() && filtradas.length > VISIVEIS && (
            <button
              type="button"
              onClick={() => setTudo((v) => !v)}
              className="rounded-full px-2 py-1 text-[11px] text-primary hover:underline"
            >
              {tudo ? "mostrar menos" : `ver todas (${filtradas.length})`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
