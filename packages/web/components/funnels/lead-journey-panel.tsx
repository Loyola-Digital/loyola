"use client";

/**
 * Jornada do lead: tudo que um e-mail fez, em ordem cronológica.
 *
 * Varre planilhas de captação, aplicação, pesquisas, vendas (todas as etapas),
 * vendas manuais e cards do comercial. É a resposta para "esse comprador veio de
 * onde e por onde passou?".
 *
 * O escopo padrão é o FUNIL porque cada fonte custa uma leitura do Google
 * Sheets. "Todos os funis" fica atrás de um clique consciente — é o que responde
 * "esse lead já tinha aparecido num lançamento anterior?", mas varre tudo.
 */

import { useState } from "react";
import {
  Search, Route, ShoppingCart, ClipboardList, UserPlus, Handshake, FileText, Loader2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useLeadJourney, type JourneyEvent } from "@/lib/hooks/use-sales-journey";

function fmtDate(iso: string | null): string {
  if (!iso) return "sem data";
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

const ESTILO: Record<
  JourneyEvent["kind"],
  { label: string; Icon: typeof Route; cor: string }
> = {
  captacao: { label: "Captação", Icon: UserPlus, cor: "text-sky-600 dark:text-sky-400" },
  aplicacao: { label: "Aplicação", Icon: FileText, cor: "text-violet-600 dark:text-violet-400" },
  pesquisa: { label: "Pesquisa", Icon: ClipboardList, cor: "text-amber-600 dark:text-amber-400" },
  compra: { label: "Compra", Icon: ShoppingCart, cor: "text-emerald-600 dark:text-emerald-400" },
  venda_manual: { label: "Venda manual", Icon: ShoppingCart, cor: "text-emerald-600 dark:text-emerald-400" },
  comercial: { label: "Comercial", Icon: Handshake, cor: "text-cyan-600 dark:text-cyan-400" },
};

function Evento({ ev }: { ev: JourneyEvent }) {
  const [aberto, setAberto] = useState(false);
  const { label, Icon, cor } = ESTILO[ev.kind];
  const temCampos = ev.campos.length > 0;

  return (
    <li className="relative pl-7">
      {/* Marcador na linha do tempo. */}
      <span className="absolute left-0 top-1 flex h-5 w-5 items-center justify-center rounded-full border border-border/60 bg-card">
        <Icon className={`h-3 w-3 ${cor}`} />
      </span>

      <div className="rounded-lg border border-border/40 p-2.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{ev.titulo}</p>
            <p className="text-[11px] text-muted-foreground">
              {label}
              {ev.stageName ? ` · ${ev.stageName}` : ""} · {ev.funnelName}
              {ev.detalhe ? ` · ${ev.detalhe}` : ""}
            </p>
          </div>
          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
            {fmtDate(ev.date)}
          </span>
        </div>

        {temCampos && (
          <>
            <button
              type="button"
              onClick={() => setAberto((v) => !v)}
              className="mt-1.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
            >
              {aberto ? "Ocultar" : `Ver ${ev.campos.length} campo${ev.campos.length !== 1 ? "s" : ""}`}
            </button>
            {aberto && (
              <dl className="mt-1.5 space-y-1 border-t border-border/30 pt-1.5">
                {ev.campos.map((c, i) => (
                  <div key={i} className="flex gap-2 text-[11px]">
                    <dt className="w-40 shrink-0 truncate text-muted-foreground">{c.label}</dt>
                    <dd className="min-w-0 flex-1 break-words">{c.valor}</dd>
                  </div>
                ))}
              </dl>
            )}
          </>
        )}
      </div>
    </li>
  );
}

export function LeadJourneyPanel({
  projectId, funnelId, stageId,
}: { projectId: string; funnelId: string; stageId: string }) {
  const [rascunho, setRascunho] = useState("");
  const [buscado, setBuscado] = useState<string | null>(null);
  const [scope, setScope] = useState<"funnel" | "project">("funnel");
  const { data, isFetching } = useLeadJourney(projectId, funnelId, stageId, buscado, scope);

  function buscar() {
    const e = rascunho.trim().toLowerCase();
    if (e.length >= 3) setBuscado(e);
  }

  return (
    <div className="rounded-xl border border-border/40 bg-card p-4">
      <div className="mb-3">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <Route className="h-4 w-4 text-primary" />
          Jornada do lead
        </h3>
        <p className="text-[11px] text-muted-foreground">
          Digite um e-mail e veja tudo que ele fez — captação, aplicação, pesquisa, compra e comercial
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Input
          value={rascunho}
          onChange={(e) => setRascunho(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); buscar(); } }}
          placeholder="email@do-lead.com"
          className="h-8 min-w-[220px] flex-1 text-xs"
        />
        <Button size="sm" className="h-8 gap-1.5" onClick={buscar} disabled={rascunho.trim().length < 3}>
          {isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
          Buscar
        </Button>
        <div className="inline-flex rounded-md border border-border/50 p-0.5 text-xs">
          {([
            ["funnel", "Este funil"],
            ["project", "Todos os funis"],
          ] as const).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setScope(k)}
              className={`rounded px-2.5 py-1 transition-colors ${
                scope === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {scope === "project" && (
        <p className="mt-1.5 text-[10px] text-muted-foreground">
          Varrendo todos os funis do projeto — leva mais tempo, porque lê a planilha de cada um.
        </p>
      )}

      {!buscado ? null : isFetching && !data ? (
        <div className="mt-3 space-y-2">
          <Skeleton className="h-16 rounded-lg" />
          <Skeleton className="h-16 rounded-lg" />
        </div>
      ) : !data?.encontrado ? (
        <div className="mt-3 rounded-lg border border-dashed border-border/40 p-6 text-center">
          <p className="text-sm">Nenhum registro para <strong>{buscado}</strong></p>
          <p className="mt-1 text-xs text-muted-foreground">
            {scope === "funnel"
              ? "Tente “Todos os funis” — o lead pode ter vindo de um lançamento anterior."
              : "Esse e-mail não aparece em nenhuma planilha, pesquisa ou venda do projeto."}
          </p>
        </div>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap gap-4 border-y border-border/30 py-2.5">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Eventos
              </p>
              <p className="text-lg font-semibold leading-none">{data.resumo.total}</p>
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Compras
              </p>
              <p className="text-lg font-semibold leading-none">{data.resumo.compras}</p>
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Primeiro contato
              </p>
              <p className="text-lg font-semibold leading-none tabular-nums">
                {fmtDate(data.resumo.primeiroContato)}
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Funis
              </p>
              <div className="mt-0.5 flex flex-wrap gap-1">
                {data.resumo.funis.map((f) => (
                  <Badge key={f} variant="secondary" className="px-1.5 text-[10px]">{f}</Badge>
                ))}
              </div>
            </div>
          </div>

          {/* Linha do tempo. Eventos sem data vão pro fim, marcados como tal —
              existem de verdade, só não dá pra posicionar. */}
          <ol className="mt-3 space-y-2 border-l border-border/40 pl-2.5">
            {data.eventos.map((ev, i) => (
              <Evento key={i} ev={ev} />
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
