"use client";

/**
 * Story 29.80 — a apresentação dos filtros de Funil e Oferta do perpétuo.
 *
 * Nada aqui decide: o que aparece, o que vai para a API, qual lista de
 * campanhas cada bloco recebe e o que entra no aviso vêm de
 * `lib/utils/filtro-funil-oferta.ts` (puro e testado). Este arquivo desenha.
 */

import Link from "next/link";
import type { FunilOfertaDoFunil, LinhaForaDoFiltro } from "@loyola-x/shared";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  FRASE_NENHUMA_CAMPANHA,
  NAO_FILTRADO,
  montarAvisoDoFiltro,
  sinalizacoesDoCadastro,
  type FiltroFunilOferta,
  type PlanoDoFiltro,
  type Sinalizacao,
} from "@/lib/utils/filtro-funil-oferta";

/** Radix Select não aceita `value=""`: "Todos" vai por sentinela. */
const TODOS = "__todos__";

export function FiltrosDeFunilEOferta({
  plano,
  dados,
  pedido,
  onChange,
}: {
  plano: PlanoDoFiltro;
  dados: FunilOfertaDoFunil | undefined;
  pedido: FiltroFunilOferta;
  onChange: (f: FiltroFunilOferta) => void;
}) {
  if (!plano.mostrar) return null;
  const desabilitado = plano.desabilitado !== null;
  const funis = dados?.opcoes.funis ?? [];
  const ofertas = dados?.opcoes.ofertas ?? [];
  return (
    <div className="flex items-center gap-1.5" title={plano.desabilitado ?? undefined}>
      <Select
        value={pedido.funil ?? TODOS}
        onValueChange={(v) => onChange({ ...pedido, funil: v === TODOS ? null : v })}
        disabled={desabilitado}
      >
        <SelectTrigger className="w-[190px] h-8 text-xs" aria-label="Filtro de funil">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={TODOS}>Todos os funis</SelectItem>
          {funis.map((o) => (
            <SelectItem key={o.codigo} value={o.codigo}>
              {o.codigo} — {o.descricao}
              {o.ativo ? "" : " (inativo)"}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={pedido.oferta ?? TODOS}
        onValueChange={(v) => onChange({ ...pedido, oferta: v === TODOS ? null : v })}
        disabled={desabilitado}
      >
        <SelectTrigger className="w-[190px] h-8 text-xs" aria-label="Filtro de oferta">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={TODOS}>Todas as ofertas</SelectItem>
          {ofertas.map((o) => (
            <SelectItem key={o.codigo} value={o.codigo}>
              {o.codigo} — {o.descricao}
              {o.ativo ? "" : " (inativo)"}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {plano.desabilitado && <span className="text-[11px] text-muted-foreground">{plano.desabilitado}</span>}
    </div>
  );
}

function LinhaDeSinalizacao({ s }: { s: Sinalizacao }) {
  return (
    <li className="text-[11px] text-amber-600 dark:text-amber-400">
      {s.texto}
      {s.acao && (
        <>
          {" "}
          {s.href ? (
            <Link href={s.href} className="underline underline-offset-2 hover:text-amber-500">
              {s.acao}
            </Link>
          ) : (
            <span className="text-muted-foreground">({s.acao} — peça a quem administra o projeto)</span>
          )}
        </>
      )}
    </li>
  );
}

/** Selo dos blocos que o filtro não alcança (AC3). Só aparece com filtro ativo. */
export function SeloNaoFiltrado({ ativo, motivo }: { ativo: boolean; motivo: string }) {
  if (!ativo) return null;
  return (
    <p className="text-[11px] text-amber-600 dark:text-amber-400">
      <span className="rounded border border-amber-500/40 px-1 py-0.5 font-medium">não filtrado</span> {motivo}
    </p>
  );
}

/**
 * As sinalizações do cadastro (sempre) e, com filtro ativo, o aviso
 * expansível do que ficou de fora (AC4) — com a regra "tudo separado" e as
 * unidades de cada número declaradas.
 */
export function PainelDoFiltroFunilOferta({
  plano,
  dados,
  foraDoFiltro,
  vendasRespeitaramOFiltro,
  comLink,
  formatarMoeda,
}: {
  plano: PlanoDoFiltro;
  dados: FunilOfertaDoFunil | undefined;
  foraDoFiltro: LinhaForaDoFiltro[] | undefined;
  vendasRespeitaramOFiltro: boolean;
  comLink: boolean;
  formatarMoeda: (v: number) => string;
}) {
  if (!plano.mostrar || !dados) return null;
  const sinalizacoes = sinalizacoesDoCadastro(dados, comLink);
  const filtro = plano.filtro;
  const aviso = filtro ? montarAvisoDoFiltro({ filtro, foraDoFiltro, campanhas: dados.campanhas, comLink }) : null;

  if (sinalizacoes.length === 0 && !aviso) return null;
  return (
    <div className="rounded-lg border border-border/30 bg-card/40 px-3 py-2 space-y-2">
      {sinalizacoes.length > 0 && <ul className="space-y-0.5">{sinalizacoes.map((s) => <LinhaDeSinalizacao key={s.chave} s={s} />)}</ul>}

      {filtro && aviso && (
        <div className="space-y-1.5">
          <p className="text-xs">
            <span className="font-medium">
              Filtro: {filtro.funil ?? "todos os funis"} · {filtro.oferta ?? "todas as ofertas"}
            </span>
            {plano.midia.tipo === "vazio" && (
              <span className="ml-2 text-amber-600 dark:text-amber-400">— {FRASE_NENHUMA_CAMPANHA}: investimento e mídia zerados.</span>
            )}
          </p>
          {!vendasRespeitaramOFiltro && (
            <p className="text-[11px] text-red-500">
              A API não confirmou o filtro nas vendas — os números de vendas abaixo podem estar sem filtro.
            </p>
          )}
          <SeloNaoFiltrado ativo={plano.vendasNaoFiltraveis} motivo={`Vendas e faturamento: ${NAO_FILTRADO.planilhaSemUtm}.`} />
          <details className="text-[11px]">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              O que ficou de fora: {aviso.totalCompradoresFora} comprador{aviso.totalCompradoresFora === 1 ? "" : "es"} ·{" "}
              {formatarMoeda(aviso.totalFaturamentoFora)} em vendas · {formatarMoeda(aviso.gastoSemDimensao)} de investimento em{" "}
              {aviso.campanhas.length} campanha{aviso.campanhas.length === 1 ? "" : "s"} sem a dimensão
            </summary>
            <div className="mt-2 space-y-2">
              <p className="text-muted-foreground">{aviso.unidades}</p>
              {aviso.vendas.length > 0 ? (
                <ul className="space-y-0.5">
                  {aviso.vendas.map((v) => (
                    <li key={v.rotulo}>
                      {v.rotulo}: {v.compradores} comprador{v.compradores === 1 ? "" : "es"} · {formatarMoeda(v.faturamentoBruto)} bruto
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">Nenhuma venda paga ficou fora sem motivo conhecido.</p>
              )}
              {aviso.campanhas.length > 0 && (
                <>
                  <p className="text-muted-foreground">Investimento (com imposto) de campanhas da etapa sem a dimensão escolhida:</p>
                  <ul className="space-y-1">
                    {aviso.campanhas.map((c) => (
                      <li key={c.campaignId}>
                        <span className="font-mono">{c.nome}</span> — {formatarMoeda(c.gasto)} · {c.motivo}
                        <ul className="ml-3">
                          <LinhaDeSinalizacao s={c.sinalizacao} />
                        </ul>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <p className="text-muted-foreground">{aviso.regra}</p>
              <p className="text-muted-foreground">
                Não filtrados: Ascensão ({NAO_FILTRADO.ascensao}); comparativo com outro funil ({NAO_FILTRADO.comparativo}); seção
                Vendas ({NAO_FILTRADO.vendasDaEtapa}).
              </p>
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
