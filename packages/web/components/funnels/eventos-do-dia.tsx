"use client";

/**
 * Os ícones do que aconteceu no dia, ao lado da data.
 *
 * As tabelas diárias respondem "quanto entrou e quanto custou". A pergunta que
 * vem logo depois — "por que este dia foi diferente?" — mora no Log de
 * Campanha, em outra tela. Cruzar as duas à mão, dia a dia, é o trabalho que
 * estes ícones eliminam: o dia em que o CPL dobrou passa a mostrar, ali mesmo,
 * que houve ajuste de budget e um disparo.
 *
 * Ícone por APLICATIVO, e não por evento: é a leitura que a pessoa faz de
 * relance ("teve coisa da Meta hoje"). O detalhe do que foi feito aparece ao
 * passar o mouse.
 */

import { useMemo, useState } from "react";
import {
  Bot,
  CalendarClock,
  CircleDollarSign,
  Globe,
  Instagram,
  Mail,
  Megaphone,
  MessageCircle,
  ImagePlus,
  Radio,
  Video,
  Youtube,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { CampaignLogEntry } from "@/lib/hooks/use-campaign-log";
import { CATEGORIA_EM_DESTAQUE } from "@/lib/campaign-log-options";

type Icone = typeof Megaphone;

/**
 * Aplicativo → símbolo e cor.
 *
 * Agrupado por FAMÍLIA: sete ferramentas de WhatsApp viram um ícone de
 * conversa. Um símbolo diferente para cada uma transformaria a coluna num
 * mosaico ilegível, que é o oposto do que se quer numa tabela densa.
 */
const POR_APLICATIVO: { casa: (app: string) => boolean; icone: Icone; cor: string; familia: string }[] = [
  {
    casa: (a) => a === "Meta Ads" || a === "Google Ads",
    icone: Megaphone,
    cor: "text-amber-600 dark:text-amber-400",
    familia: "Anúncios",
  },
  {
    casa: (a) => ["SendFlow", "Letalk", "Z-API", "Devzapp", "Manychat", "Ligueleads", "Chatwoot"].includes(a),
    icone: MessageCircle,
    cor: "text-emerald-600 dark:text-emerald-400",
    familia: "WhatsApp",
  },
  {
    casa: (a) => a === "ActiveCampaign" || a === "Mautic",
    icone: Mail,
    cor: "text-sky-600 dark:text-sky-400",
    familia: "E-mail",
  },
  {
    casa: (a) => a === "Instagram" || a === "Facebook" || a === "TikTok" || a === "Threads",
    icone: Instagram,
    cor: "text-fuchsia-600 dark:text-fuchsia-400",
    familia: "Social",
  },
  { casa: (a) => a === "YouTube", icone: Youtube, cor: "text-red-600 dark:text-red-400", familia: "YouTube" },
  {
    casa: (a) => ["Zoom", "Google Meet", "StreamYard"].includes(a),
    icone: Video,
    cor: "text-rose-600 dark:text-rose-400",
    familia: "Ao vivo",
  },
  {
    casa: (a) => a === "Make" || a === "N8N",
    icone: Bot,
    cor: "text-violet-600 dark:text-violet-400",
    familia: "Automação",
  },
  {
    casa: (a) => a === "Hotmart" || a === "Kiwify",
    icone: CircleDollarSign,
    cor: "text-green-600 dark:text-green-400",
    familia: "Checkout",
  },
  {
    casa: (a) => ["Tally", "Google Forms", "Calendly"].includes(a),
    icone: CalendarClock,
    cor: "text-teal-600 dark:text-teal-400",
    familia: "Formulários",
  },
  {
    casa: (a) => ["Wordpress", "Webflow", "Hospedagem", "Domínio"].includes(a),
    icone: Globe,
    cor: "text-slate-600 dark:text-slate-400",
    familia: "Site",
  },
];

/** Sem aplicativo declarado — a entrada existe e não pode sumir da coluna. */
const OUTROS = { icone: Radio, cor: "text-muted-foreground", familia: "Outros" };

/**
 * Categorias que valem mais que o aplicativo.
 *
 * O ícone sai do app porque é ele que diz ONDE a ação aconteceu — e isso serve
 * para quase tudo. Criativo novo é a exceção: no Meta Ads ele ficava com o
 * mesmo megafone de um ajuste de budget ou de uma campanha pausada, e é
 * justamente o evento que se procura ao investigar uma virada na curva.
 *
 * Consultado ANTES do aplicativo, e só para o que merece: uma tabela grande
 * aqui devolveria o mosaico de símbolos que o agrupamento por família existe
 * para evitar.
 */
const POR_CATEGORIA: Record<string, { icone: Icone; cor: string; familia: string }> = Object.
  fromEntries(
    Object.entries(CATEGORIA_EM_DESTAQUE).map(([categoria, d]) => [
      categoria,
      // O nome do ícone vem da fonte única; o componente é resolvido aqui,
      // porque `campaign-log-options` é dado e não deve importar React.
      { icone: ImagePlus, cor: "text-indigo-600 dark:text-indigo-400", familia: d.rotulo },
    ]),
  );

function classificar(app: string | null, categoria?: string | null) {
  const daCategoria = categoria ? POR_CATEGORIA[categoria] : undefined;
  if (daCategoria) return daCategoria;
  if (!app) return OUTROS;
  return POR_APLICATIVO.find((p) => p.casa(app)) ?? OUTROS;
}

/** "2026-08-28T14:30:00Z" → "2026-08-28", no fuso de quem lê. */
function diaLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function hora(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Agrupa as entradas do log por dia.
 *
 * Feito uma vez pela tabela inteira, não por linha: com 90 dias na tela, filtrar
 * a lista inteira dentro de cada linha seria trabalho quadrático à toa.
 */
export function agruparPorDia(entries: CampaignLogEntry[] | undefined): Map<string, CampaignLogEntry[]> {
  const mapa = new Map<string, CampaignLogEntry[]>();
  for (const e of entries ?? []) {
    const dia = diaLocal(e.occurredAt);
    if (!dia) continue;
    const lista = mapa.get(dia);
    if (lista) lista.push(e);
    else mapa.set(dia, [e]);
  }
  return mapa;
}

/** Dia ISO (`2026-08-28`) escrito por extenso, para o título do modal. */
function diaPorExtenso(dia: string): string {
  const [a, m, d] = dia.split("-").map(Number);
  if (!a || !m || !d) return dia;
  return new Date(a, m - 1, d).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
}

/**
 * Tudo que aconteceu no dia, sem corte.
 *
 * O balão existe para a leitura de relance, e por isso precisa caber na tela:
 * seis itens, anotação em 120 caracteres. Quando o dia foi movimentado é
 * exatamente o que interessa que fica de fora — e a alternativa era abrir o Log
 * de Campanha em outra tela e procurar o dia à mão.
 *
 * Aqui não há teto. A ordem é CRONOLÓGICA e não por família: a pergunta que
 * traz alguém a este modal é "o que houve neste dia", e a resposta se lê na
 * ordem em que as coisas aconteceram.
 */
function TudoDoDia({
  dia,
  entradas,
  aberto,
  onFechar,
}: {
  dia: string | undefined;
  entradas: CampaignLogEntry[];
  aberto: boolean;
  onFechar: () => void;
}) {
  const emOrdem = useMemo(
    () => [...entradas].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)),
    [entradas],
  );

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">
            {dia ? diaPorExtenso(dia) : "O que aconteceu"}
          </DialogTitle>
          <DialogDescription>
            {emOrdem.length} {emOrdem.length === 1 ? "ação registrada" : "ações registradas"} no log
            de campanha.
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-3">
          {emOrdem.map((e) => {
            const c = classificar(e.aplicativo, e.categoria);
            const Icone = c.icone;
            return (
              <li key={e.id} className="flex gap-2.5">
                <span
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted ${c.cor}`}
                >
                  <Icone className="h-3 w-3" />
                </span>

                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-baseline gap-x-1.5 text-sm">
                    <span className="font-mono text-xs opacity-60">{hora(e.occurredAt)}</span>
                    <span className="font-medium">{e.evento}</span>
                  </p>

                  {(e.aplicativo || e.categoria) && (
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {[e.aplicativo, e.categoria].filter(Boolean).join(" · ")}
                    </p>
                  )}

                  {/* Inteira, e com as quebras de linha que a pessoa digitou:
                      é o texto que não cabia no balão, e reformatá-lo aqui
                      desfaria o motivo de abrir o modal. */}
                  {e.notes && (
                    <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                      {e.notes}
                    </p>
                  )}

                  {e.responsavel && (
                    <p className="mt-1 text-[11px] text-muted-foreground">por {e.responsavel}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

export function EventosDoDia({
  entradas,
  dia,
}: {
  entradas: CampaignLogEntry[] | undefined;
  /** Dia ISO da linha — só o título do modal usa. */
  dia?: string;
}) {
  // Qual balão está aberto. Existe por causa do celular — ver o comentário no
  // `Tooltip` abaixo.
  const [aberto, setAberto] = useState<string | null>(null);
  const [modalAberto, setModalAberto] = useState(false);

  const familias = useMemo(() => {
    if (!entradas || entradas.length === 0) return [];
    // Uma família = um ícone, com todas as suas entradas atrás.
    const porFamilia = new Map<string, { icone: Icone; cor: string; itens: CampaignLogEntry[] }>();
    for (const e of entradas) {
      const c = classificar(e.aplicativo, e.categoria);
      const atual = porFamilia.get(c.familia);
      if (atual) atual.itens.push(e);
      else porFamilia.set(c.familia, { icone: c.icone, cor: c.cor, itens: [e] });
    }
    return [...porFamilia.entries()];
  }, [entradas]);

  if (familias.length === 0) return null;

  return (
    // O provider é obrigatório: `Tooltip` aqui é só o Root do Radix, e sem ele
    // envolvido a tela quebra em runtime.
    <TooltipProvider delayDuration={150}>
      {/* Pilha: cada ícone cobre ~45% do anterior e a fila se abre quando o
          mouse entra — ou quando alguém TOCA num deles, no celular. Numa
          tabela densa, três ícones lado a lado empurrariam a coluna;
          empilhados ocupam pouco mais que um. */}
      <span
        className="group ml-1.5 inline-flex items-center align-middle"
        data-aberto={aberto ? "sim" : "nao"}
      >
        {familias.map(([familia, { icone: Icone, cor, itens }], i) => (
          <Tooltip
            key={familia}
            // Controlado por causa do TOQUE: o Radix abre no hover e no foco,
            // mas fecha no `pointerdown` — no celular o balão apareceria e
            // sumiria no mesmo gesto. Com o estado aqui, o toque manda.
            open={aberto === familia}
            onOpenChange={(o) => setAberto(o ? familia : null)}
          >
            <TooltipTrigger asChild>
              <button
                type="button"
                // <button> e não <span>: no touch é o que recebe foco e o que
                // o leitor de tela anuncia como acionável.
                aria-label={`${familia}: ${itens.length} ${itens.length === 1 ? "ação" : "ações"} neste dia. Abrir tudo.`}
                // O clique abre o MODAL, não alterna o balão. O balão continua
                // no hover, para a leitura de relance; quem clica quer
                // justamente o que não cabia nele.
                //
                // No toque isso também melhora: o modal não some no mesmo
                // gesto que o abriu — o problema que o estado controlado do
                // tooltip resolvia à força.
                onClick={() => setModalAberto(true)}
                className={
                  "relative inline-flex h-[18px] w-[18px] shrink-0 cursor-help items-center justify-center " +
                  "rounded-full bg-background ring-1 ring-border/70 touch-manipulation " +
                  "transition-[margin,transform] duration-200 ease-out hover:scale-110 " +
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary " +
                  // Abre com o mouse OU quando um balão está aberto (o caminho
                  // do toque, que não tem hover).
                  (i === 0 ? "" : "-ml-2 group-hover:ml-0.5 group-data-[aberto=sim]:ml-0.5 ") +
                  cor
                }
                // Empilhamento com o primeiro por cima.
                style={{ zIndex: familias.length - i }}
              >
                <Icone className="h-2.5 w-2.5" />
                {/* Ponto de "tem mais de uma ação aqui". O número não cabe em
                    18px sem virar borrão — a contagem exata vai no balão. */}
                {itens.length > 1 && (
                  <span
                    className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-current ring-1 ring-background"
                    aria-hidden
                  />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent
              // "top" e não "right": a coluna da data fica no começo de uma
              // tabela larga e com rolagem horizontal, e o balão à direita
              // abria fora do campo de visão no celular. Para cima ele fica
              // sobre a própria tabela, que é área visível por definição.
              side="top"
              align="start"
              sideOffset={6}
              // Margem da borda da tela: sem isso o Radix encosta o balão no
              // limite exato da viewport e o texto fica colado na borda.
              collisionPadding={8}
              className="max-w-[min(340px,calc(100vw-24px))]"
            >
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide opacity-70">
                {familia} · {itens.length} {itens.length === 1 ? "ação" : "ações"}
              </p>
              <ul className="space-y-1">
                {/* Teto de 6: o balão precisa caber na tela. O resto vira
                    contagem, e o Log de Campanha tem a lista inteira. */}
                {itens.slice(0, 6).map((e) => (
                  <li key={e.id} className="text-[11px] leading-snug">
                    <span className="font-mono opacity-70">{hora(e.occurredAt)}</span>{" "}
                    <span className="font-medium">{e.evento}</span>
                    {e.categoria ? <span className="opacity-70"> · {e.categoria}</span> : null}
                    {e.notes ? (
                      <span className="block opacity-70">
                        {e.notes.length > 120 ? `${e.notes.slice(0, 120)}…` : e.notes}
                      </span>
                    ) : null}
                  </li>
                ))}
                {itens.length > 6 && (
                  <li className="text-[11px] opacity-70">+ {itens.length - 6} outra(s)</li>
                )}
              </ul>
              {/* O balão corta por necessidade — então o convite para ver o
                  resto precisa estar onde o corte acontece. */}
              <p className="mt-1.5 border-t border-border/40 pt-1 text-[10px] opacity-60">
                Clique para ver tudo do dia
              </p>
            </TooltipContent>
          </Tooltip>
        ))}
      </span>

      <TudoDoDia
        dia={dia}
        entradas={entradas ?? []}
        aberto={modalAberto}
        onFechar={() => setModalAberto(false)}
      />
    </TooltipProvider>
  );
}
