"use client";

/**
 * Story 46.1 — o menu de abas da etapa, em dois níveis.
 *
 * ⚠️ Por que botões, e não `<TabsTrigger>`:
 *
 * Dois dos grupos ("Dados" e "Inácio") não têm aba própria — ativá-los abre o
 * primeiro filho. Um `TabsTrigger` precisa de um `value` que exista, e usar o
 * value do primeiro filho colocaria o MESMO value em dois gatilhos (o do pai e
 * o do filho no submenu), o que faz o Radix emitir ids duplicados no DOM.
 * Misturar `<button>` com `TabsTrigger` dentro de um `TabsPrimitive.List`
 * também quebra o roving focus, que assume que todo filho é um item.
 *
 * Então a navegação inteira é de botões, com o estado ativo calculado aqui, e o
 * `<Tabs>` continua governando só qual `<TabsContent>` aparece. As classes
 * abaixo são as mesmas de `components/ui/tabs.tsx` — o menu tem que continuar
 * parecendo o menu de antes.
 *
 * Débito conhecido: o `TabsContent` do Radix aponta `aria-labelledby` para um
 * gatilho que não existe mais. Registrado no Dev Record da 46.1.
 */

import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  abaPadraoDoGrupo,
  ehGrupoExpansivel,
  grupoDaAba,
  type GrupoDeAbas,
  type ItemDeAba,
} from "@/lib/utils/menu-de-abas";

/** Espelha o `TabsTrigger` de `components/ui/tabs.tsx`. */
const BOTAO_BASE =
  "relative inline-flex h-7 shrink-0 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-xs font-medium whitespace-nowrap text-foreground/60 transition-all hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring sm:h-8 sm:text-sm dark:text-muted-foreground dark:hover:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4";

const BOTAO_ATIVO =
  "bg-background text-foreground shadow-sm dark:border-input dark:bg-input/30 dark:text-foreground";

/**
 * AC8 — `overflow-x-auto` em vez de quebrar em várias linhas. Mesmo padrão de
 * `event-stage-view.tsx:341`. O fallback `<Select>` do `settings/layout.tsx`
 * foi descartado: ele teria de achatar pai e filho numa lista só, perdendo a
 * hierarquia que esta story acabou de criar.
 */
const LINHA = "flex w-full items-center justify-start gap-1 overflow-x-auto";

function Contador({ n }: { n: number }) {
  return <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px]">{n}</span>;
}

function rotuloDe(item: ItemDeAba, badges: Badges) {
  if (item.badge === "meta" && badges.meta > 0) return <Contador n={badges.meta} />;
  if (item.badge === "youtube" && badges.youtube > 0) return <Contador n={badges.youtube} />;
  return null;
}

type Badges = { meta: number; youtube: number };

export function StageTabsNav({
  menu,
  activeTab,
  onChange,
  badges,
}: {
  menu: GrupoDeAbas[];
  activeTab: string;
  onChange: (value: string) => void;
  badges: Badges;
}) {
  const grupoAtivo = grupoDaAba(menu, activeTab);

  return (
    <nav aria-label="Seções da etapa" className="flex flex-col gap-2">
      {/* Nível 1 */}
      <div className={cn(LINHA, "rounded-lg bg-muted p-1 sm:w-fit sm:p-[3px]")}>
        {menu.map((grupo) => {
          const Icone = grupo.icon;
          const ativo = grupoAtivo?.id === grupo.id;
          const expansivel = ehGrupoExpansivel(grupo);
          return (
            <button
              key={grupo.id}
              type="button"
              aria-current={ativo ? "page" : undefined}
              aria-expanded={expansivel ? ativo : undefined}
              // AC3 — ativar o pai carrega conteúdo E revela o submenu.
              //
              // Pai COM aba própria sempre volta para ela: é o caminho de volta
              // de quem entrou num filho. Sem isso, quem clica em "Meta Ads
              // TESTE" fica sem rota de retorno ao dashboard, porque o submenu
              // só lista os filhos.
              //
              // Pai SEM aba própria (Dados, Inácio) abre o primeiro filho — mas
              // só quando se está fora do grupo. Estando dentro, clicar no pai
              // não joga o usuário de volta à primeira aba: seria perder o
              // lugar sem ele ter pedido.
              onClick={() => {
                if (grupo.proprio) onChange(grupo.proprio.value);
                else if (!ativo) onChange(abaPadraoDoGrupo(grupo));
              }}
              className={cn(BOTAO_BASE, ativo && BOTAO_ATIVO)}
            >
              <Icone className={cn("h-3.5 w-3.5", grupo.iconClassName)} />
              {grupo.label}
              {grupo.proprio ? rotuloDe(grupo.proprio, badges) : null}
              {/* AC4 — só mostra a seta quem tem filho para mostrar. */}
              {expansivel && (
                <ChevronDown
                  className={cn(
                    "h-3 w-3 opacity-60 transition-transform",
                    ativo && "rotate-180",
                  )}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Nível 2 — só do grupo ativo, e só quando ele tem filhos. */}
      {grupoAtivo && ehGrupoExpansivel(grupoAtivo) && (
        <div className={cn(LINHA, "border-b px-1")}>
          {grupoAtivo.filhos.map((filho) => (
            <BotaoFilho
              key={filho.value}
              item={filho}
              ativo={activeTab === filho.value}
              onClick={() => onChange(filho.value)}
              badges={badges}
            />
          ))}
        </div>
      )}
    </nav>
  );
}

function BotaoFilho({
  item,
  ativo,
  onClick,
  badges,
}: {
  item: ItemDeAba;
  ativo: boolean;
  onClick: () => void;
  badges: Badges;
}) {
  const Icone = item.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={ativo ? "page" : undefined}
      className={cn(
        BOTAO_BASE,
        "rounded-none border-b-2 border-transparent",
        ativo && "border-foreground text-foreground",
      )}
    >
      <Icone className={cn("h-3.5 w-3.5", item.iconClassName)} />
      {item.label}
      {rotuloDe(item, badges)}
    </button>
  );
}
