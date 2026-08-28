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

import { useMemo } from "react";
import {
  Bot,
  CalendarClock,
  CircleDollarSign,
  Globe,
  Instagram,
  Mail,
  Megaphone,
  MessageCircle,
  Radio,
  Video,
  Youtube,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { CampaignLogEntry } from "@/lib/hooks/use-campaign-log";

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

function classificar(app: string | null) {
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

export function EventosDoDia({ entradas }: { entradas: CampaignLogEntry[] | undefined }) {
  const familias = useMemo(() => {
    if (!entradas || entradas.length === 0) return [];
    // Uma família = um ícone, com todas as suas entradas atrás.
    const porFamilia = new Map<string, { icone: Icone; cor: string; itens: CampaignLogEntry[] }>();
    for (const e of entradas) {
      const c = classificar(e.aplicativo);
      const atual = porFamilia.get(c.familia);
      if (atual) atual.itens.push(e);
      else porFamilia.set(c.familia, { icone: c.icone, cor: c.cor, itens: [e] });
    }
    return [...porFamilia.entries()];
  }, [entradas]);

  if (familias.length === 0) return null;

  return (
    // O provider é obrigatório: `Tooltip` aqui é só o Root do Radix, e sem ele
    // envolvido a tela quebra em runtime. Um só para os ícones do dia, com
    // abertura rápida — numa tabela a pessoa passa o mouse de linha em linha.
    <TooltipProvider delayDuration={150}>
      {/* Pilha: cada ícone cobre ~45% do anterior e a fila se abre no hover.
          Numa tabela densa, três ícones lado a lado empurrariam a coluna toda;
          empilhados ocupam pouco mais que um, e quem quiser olhar de perto
          passa o mouse. O `group` é o gatilho da expansão. */}
      <span className="group ml-1.5 inline-flex items-center align-middle">
        {familias.map(([familia, { icone: Icone, cor, itens }], i) => (
          <Tooltip key={familia}>
            <TooltipTrigger asChild>
              <span
                className={
                  "relative inline-flex h-[18px] w-[18px] shrink-0 cursor-help items-center justify-center " +
                  "rounded-full bg-background ring-1 ring-border/70 " +
                  "transition-[margin,transform] duration-200 ease-out hover:scale-110 " +
                  (i === 0 ? "" : "-ml-2 group-hover:ml-0.5 ") +
                  cor
                }
                // Empilhamento com o primeiro por cima: a fila fica com cara de
                // pilha, e não de sobreposição acidental.
                style={{ zIndex: familias.length - i }}
              >
                <Icone className="h-2.5 w-2.5" />
                {/* Ponto de "tem mais de uma ação aqui". O número não cabe em
                    18px sem virar borrão — a contagem exata está no tooltip. */}
                {itens.length > 1 && (
                  <span
                    className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-current ring-1 ring-background"
                    aria-hidden
                  />
                )}
              </span>
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-[340px]">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide opacity-70">
                {familia} · {itens.length} {itens.length === 1 ? "ação" : "ações"}
              </p>
              <ul className="space-y-1">
                {/* Teto de 6: o tooltip precisa caber na tela. O resto vira
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
                  <li className="text-[11px] opacity-70">
                    + {itens.length - 6} outra(s) — veja no Log de Campanha
                  </li>
                )}
              </ul>
            </TooltipContent>
          </Tooltip>
        ))}
      </span>
    </TooltipProvider>
  );
}
