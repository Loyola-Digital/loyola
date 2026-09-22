"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtCurrency, fmtInt } from "@/lib/utils/format-number";
import { BarraDeAtingimento, Moeda, pctPontos } from "@/components/funnels/planejamento-ui";
import { CANAIS_ORGANICOS, type CanalOrganico, type FontePaga } from "@loyola-x/shared/src/planejamento-cenarios";
import { INDICES_DAS_COMBINACOES, resumoFinal, type ResumoFinal } from "@loyola-x/shared/src/planejamento-combinacoes";
import { montarOrganicos, montarPagos } from "@/lib/utils/planejamento-montagem";
import { ROTULO_DO_CANAL } from "@/lib/utils/planejamento-organicos-form";
import { ROTULO_DA_FONTE } from "@/lib/utils/planejamento-pagos-form";
import {
  OPCOES_DE_ROTULO,
  estadoDaTela,
  lerRotulo,
  origensPendentes,
  paraFormularioRotulos,
  paraPayloadRotulos,
  rotulosAlterados,
  valorDaOrigem,
  type FormularioDosRotulos,
} from "@/lib/utils/planejamento-resumo-form";
import { usePlanejamentoInputs } from "@/lib/hooks/use-planejamento-inputs";
import { usePlanejamentoOrganicos } from "@/lib/hooks/use-planejamento-organicos";
import { usePlanejamentoPagos } from "@/lib/hooks/use-planejamento-pagos";
import { usePlanejamentoResumo, useSalvarPlanejamentoResumo } from "@/lib/hooks/use-planejamento-resumo";

// Story 48.5 — aba `[4] Simulador Cenários: Resumo Final`.
//
// Cinco cenários (colunas), cada um consolidando a Combinação k das abas 2 e
// 3: meta total, resumo financeiro (receitas, deduções com %, tráfego,
// margens com %) e resumo de marketing (orgânicos e pagos, por canal/fonte).
// Só leitura, salvo o RÓTULO do cenário (DV-017 = A: anotação, sem regra).
//
// Zero cálculo aqui (E4): a montagem das abas 2/3 é a mesma função pura dos
// componentes delas (`montarOrganicos`/`montarPagos`, AC12) e a consolidação
// é `resumoFinal` do shared. Tráfego repetido nas cinco colunas e linhas por
// canal/fonte abertas (PO-03).

type Cenario = ResumoFinal;

function TabelaDoResumo({
  cenarios,
  rotulos,
  organicosSalvos,
  pagosSalvos,
  podeEditar,
  onRotulo,
}: {
  cenarios: Cenario[];
  rotulos: FormularioDosRotulos;
  organicosSalvos: boolean;
  pagosSalvos: boolean;
  podeEditar: boolean;
  onRotulo: (k: number, rotulo: ReturnType<typeof lerRotulo>) => void;
}) {
  const th = (texto: string, recuo?: 1 | 2) => (
    <th className={`text-left py-1 pr-3 font-normal text-muted-foreground whitespace-nowrap sticky left-0 bg-card ${recuo === 1 ? "pl-4" : recuo === 2 ? "pl-8" : ""}`}>
      {texto}
    </th>
  );
  type Opts = { destaque?: boolean; recuo?: 1 | 2; origem?: "organicos" | "pagos" };
  const salva = (origem?: Opts["origem"]) => (origem === "organicos" ? organicosSalvos : origem === "pagos" ? pagosSalvos : organicosSalvos && pagosSalvos);
  const celulaMoeda = (valor: number | null, pct: number | null | undefined, destaque?: boolean) => (
    <span className="inline-flex items-baseline justify-end gap-2">
      {pct !== undefined && <span className="text-[11px] text-muted-foreground tabular-nums">{pctPontos(pct)}</span>}
      <Moeda valor={valor} destaque={destaque} />
    </span>
  );
  const linhaMoeda = (rotulo: string, valor: (c: Cenario) => number | null, opts?: Opts & { pct?: (c: Cenario) => number | null }) => (
    <tr className={opts?.destaque ? "border-t font-semibold" : ""}>
      {th(rotulo, opts?.recuo)}
      {cenarios.map((c) => (
        <td key={c.indice} className="text-right py-1 px-2 whitespace-nowrap">
          {celulaMoeda(valorDaOrigem(valor(c), salva(opts?.origem)), opts?.pct ? valorDaOrigem(opts.pct(c), salva(opts?.origem)) : undefined, opts?.destaque)}
        </td>
      ))}
    </tr>
  );
  const linhaTexto = (rotulo: string, valor: (c: Cenario) => number | null, fmt: (v: number | null) => string, opts?: Opts) => (
    <tr className={opts?.destaque ? "border-t font-semibold" : ""}>
      {th(rotulo, opts?.recuo)}
      {cenarios.map((c) => (
        <td key={c.indice} className="text-right py-1 px-2 tabular-nums">
          {fmt(valorDaOrigem(valor(c), salva(opts?.origem)))}
        </td>
      ))}
    </tr>
  );
  const secao = (texto: string) => (
    <tr>
      <td colSpan={cenarios.length + 1} className="pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {texto}
      </td>
    </tr>
  );
  const meta = cenarios[0]?.meta.meta ?? 0;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr>
            {th("")}
            {cenarios.map((c) => (
              <th key={c.indice} className="text-right py-1 px-2 whitespace-nowrap align-top">
                <div>Cenário {c.indice}</div>
                <select
                  aria-label={`Rótulo — Cenário ${c.indice}`}
                  value={rotulos[c.indice - 1] ?? ""}
                  onChange={(ev) => onRotulo(c.indice - 1, lerRotulo(ev.target.value))}
                  disabled={!podeEditar}
                  className="mt-1 h-7 rounded-md border border-input bg-background px-2 text-[11px] font-normal"
                >
                  <option value="">— sem rótulo —</option>
                  {OPCOES_DE_ROTULO.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {secao("Meta de margem de contribuição total")}
          {linhaMoeda(`Meta (${fmtCurrency(meta)})`, (c) => c.meta.meta)}
          <tr>
            {th("Atingimento da meta")}
            {cenarios.map((c) => (
              <td key={c.indice} className="py-1 px-2 min-w-32">
                <BarraDeAtingimento atingimento={valorDaOrigem(c.meta.atingimento, organicosSalvos && pagosSalvos)} />
              </td>
            ))}
          </tr>
          {linhaMoeda("Gap para a meta", (c) => c.meta.gap)}

          {secao("Resumo financeiro")}
          {linhaMoeda("Receita bruta total", (c) => c.receitas.total, { destaque: true })}
          {linhaMoeda("Receita Leads Orgânicos", (c) => c.receitas.organicos, { recuo: 1, origem: "organicos" })}
          {linhaMoeda("Receita Leads Pagos", (c) => c.receitas.pagos, { recuo: 1, origem: "pagos" })}
          {linhaMoeda("(−) Reembolso", (c) => c.cadeia.reembolso, { pct: (c) => c.cadeia.pctReembolso })}
          {linhaMoeda("Receita tributável total", (c) => c.cadeia.receitaTributavel, { destaque: true })}
          {linhaMoeda("(−) Marketplace", (c) => c.cadeia.deducoes.marketplace, { pct: (c) => c.cadeia.pctDeducoes.marketplace })}
          {linhaMoeda("(−) Imposto", (c) => c.cadeia.deducoes.imposto, { pct: (c) => c.cadeia.pctDeducoes.imposto })}
          {linhaMoeda("(−) Custo de Produto", (c) => c.cadeia.deducoes.custoProduto, { pct: (c) => c.cadeia.pctDeducoes.custoProduto })}
          {linhaMoeda("(−) Comissões", (c) => c.cadeia.deducoes.comissoes, { pct: (c) => c.cadeia.pctDeducoes.comissoes })}
          {linhaMoeda("(−) Outros Custos", (c) => c.cadeia.deducoes.outros, { pct: (c) => c.cadeia.pctDeducoes.outros })}
          {linhaMoeda("Receita líquida total", (c) => c.cadeia.receitaLiquidaTotal, { destaque: true })}
          {linhaMoeda("(−) Tráfego", (c) => c.trafego.total, { destaque: true, origem: "pagos", pct: (c) => c.trafego.pctDaReceitaTotal })}
          {linhaMoeda("Tráfego Meta Ads", (c) => c.trafego.meta, { recuo: 1, origem: "pagos" })}
          {linhaMoeda("Meta Ads · Público quente", (c) => c.trafego.porFonte.meta_quente, { recuo: 2, origem: "pagos" })}
          {linhaMoeda("Meta Ads · Público frio", (c) => c.trafego.porFonte.meta_frio, { recuo: 2, origem: "pagos" })}
          {linhaMoeda("Tráfego Google Ads", (c) => c.trafego.google, { recuo: 1, origem: "pagos" })}
          {linhaMoeda("Google Ads · Público quente", (c) => c.trafego.porFonte.google_quente, { recuo: 2, origem: "pagos" })}
          {linhaMoeda("Google Ads · Público frio", (c) => c.trafego.porFonte.google_frio, { recuo: 2, origem: "pagos" })}
          {linhaMoeda("Margem de Contribuição Total", (c) => c.mc.total, { destaque: true, pct: (c) => c.mc.pctTotal })}
          {linhaMoeda("Margem de Contribuição Leads Orgânicos", (c) => c.mc.organicos, { recuo: 1, origem: "organicos", pct: (c) => c.mc.pctOrganicos })}
          {linhaMoeda("Margem de Contribuição Leads Pagos", (c) => c.mc.pagos, { recuo: 1, origem: "pagos", pct: (c) => c.mc.pctPagos })}

          {secao("Resumo de marketing — leads orgânicos")}
          {linhaTexto("Nº de Vendas Totais Leads Orgânicos", (c) => c.organicos.vendas, fmtInt, { destaque: true, origem: "organicos" })}
          {CANAIS_ORGANICOS.map((canal: CanalOrganico) => (
            <Fragment key={`v-${canal}`}>{linhaTexto(`Nº de Vendas ${ROTULO_DO_CANAL[canal]}`, (c) => c.organicos.canais[canal].vendas, fmtInt, { recuo: 1, origem: "organicos" })}</Fragment>
          ))}
          {linhaTexto("Conversão Leads Orgânicos", (c) => c.organicos.conversao, pctPontos, { destaque: true, origem: "organicos" })}
          {CANAIS_ORGANICOS.map((canal: CanalOrganico) => (
            <Fragment key={`c-${canal}`}>{linhaTexto(`Conversão ${ROTULO_DO_CANAL[canal]}`, (c) => c.organicos.canais[canal].conversao, pctPontos, { recuo: 1, origem: "organicos" })}</Fragment>
          ))}
          {linhaTexto("Nº de Leads Orgânicos Total", (c) => c.organicos.leads, fmtInt, { destaque: true, origem: "organicos" })}
          {CANAIS_ORGANICOS.map((canal: CanalOrganico) => (
            <Fragment key={`l-${canal}`}>{linhaTexto(`Nº de Leads ${ROTULO_DO_CANAL[canal]}`, (c) => c.organicos.canais[canal].leads, fmtInt, { recuo: 1, origem: "organicos" })}</Fragment>
          ))}

          {secao("Resumo de marketing — leads pagos")}
          {linhaTexto("Nº de Vendas Totais Leads Pagos (4 públicos)", (c) => c.pagos.vendas, fmtInt, { destaque: true, origem: "pagos" })}
          {linhaTexto("Nº de Vendas Meta Ads (quente + frio)", (c) => c.pagos.meta.vendas, fmtInt, { recuo: 1, origem: "pagos" })}
          {linhaTexto("Meta Ads · Público quente", (c) => c.pagos.fontes.meta_quente.vendas, fmtInt, { recuo: 2, origem: "pagos" })}
          {linhaTexto("Meta Ads · Público frio", (c) => c.pagos.fontes.meta_frio.vendas, fmtInt, { recuo: 2, origem: "pagos" })}
          {linhaTexto("Nº de Vendas Google Ads (quente + frio)", (c) => c.pagos.google.vendas, fmtInt, { recuo: 1, origem: "pagos" })}
          {linhaTexto("Google Ads · Público quente", (c) => c.pagos.fontes.google_quente.vendas, fmtInt, { recuo: 2, origem: "pagos" })}
          {linhaTexto("Google Ads · Público frio", (c) => c.pagos.fontes.google_frio.vendas, fmtInt, { recuo: 2, origem: "pagos" })}
          {linhaTexto("Conversão Leads Pagos", (c) => c.pagos.conversao, pctPontos, { destaque: true, origem: "pagos" })}
          {linhaTexto("Conversão Meta Ads", (c) => c.pagos.meta.conversao, pctPontos, { recuo: 1, origem: "pagos" })}
          {linhaTexto("Meta Ads · Público quente", (c) => c.pagos.fontes.meta_quente.conversao, pctPontos, { recuo: 2, origem: "pagos" })}
          {linhaTexto("Meta Ads · Público frio", (c) => c.pagos.fontes.meta_frio.conversao, pctPontos, { recuo: 2, origem: "pagos" })}
          {linhaTexto("Conversão Google Ads", (c) => c.pagos.google.conversao, pctPontos, { recuo: 1, origem: "pagos" })}
          {linhaTexto("Google Ads · Público quente", (c) => c.pagos.fontes.google_quente.conversao, pctPontos, { recuo: 2, origem: "pagos" })}
          {linhaTexto("Google Ads · Público frio", (c) => c.pagos.fontes.google_frio.conversao, pctPontos, { recuo: 2, origem: "pagos" })}
          {linhaMoeda("Custo Por Lead tráfego pago", (c) => c.pagos.cpl, { destaque: true, origem: "pagos" })}
          {linhaMoeda("CPL Meta Ads (tráfego ÷ leads)", (c) => c.pagos.meta.cpl, { recuo: 1, origem: "pagos" })}
          {linhaMoeda("CPL máx. Meta Ads · Público quente", (c) => c.pagos.fontes.meta_quente.cpl, { recuo: 2, origem: "pagos" })}
          {linhaMoeda("CPL máx. Meta Ads · Público frio", (c) => c.pagos.fontes.meta_frio.cpl, { recuo: 2, origem: "pagos" })}
          {linhaMoeda("CPL Google Ads (tráfego ÷ leads)", (c) => c.pagos.google.cpl, { recuo: 1, origem: "pagos" })}
          {linhaMoeda("CPL máx. Google Ads · Público quente", (c) => c.pagos.fontes.google_quente.cpl, { recuo: 2, origem: "pagos" })}
          {linhaMoeda("CPL máx. Google Ads · Público frio", (c) => c.pagos.fontes.google_frio.cpl, { recuo: 2, origem: "pagos" })}
          {linhaTexto("Nº de Leads Pagos Totais", (c) => c.pagos.leads, fmtInt, { destaque: true, origem: "pagos" })}
          {linhaTexto("Nº de Leads Meta Ads", (c) => c.pagos.meta.leads, fmtInt, { recuo: 1, origem: "pagos" })}
          {(["meta_quente", "meta_frio"] as FontePaga[]).map((f) => (
            <Fragment key={`lm-${f}`}>{linhaTexto(ROTULO_DA_FONTE[f], (c) => c.pagos.fontes[f].leads, fmtInt, { recuo: 2, origem: "pagos" })}</Fragment>
          ))}
          {linhaTexto("Nº de Leads Google Ads", (c) => c.pagos.google.leads, fmtInt, { recuo: 1, origem: "pagos" })}
          {(["google_quente", "google_frio"] as FontePaga[]).map((f) => (
            <Fragment key={`lg-${f}`}>{linhaTexto(ROTULO_DA_FONTE[f], (c) => c.pagos.fontes[f].leads, fmtInt, { recuo: 2, origem: "pagos" })}</Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ------------------------------------------------------------------
// Seção
// ------------------------------------------------------------------

export function PlanejamentoResumoFinal({
  projectId,
  funnelId,
  podeEditar,
  irParaAba,
}: {
  projectId: string;
  funnelId: string;
  podeEditar: boolean;
  /** Troca de aba pelo callback da página (a página lê `?tab=` só na montagem — PO-04). */
  irParaAba: (aba: "inputs" | "organicos" | "pagos") => void;
}) {
  const inputs = usePlanejamentoInputs(projectId, funnelId);
  const organicos = usePlanejamentoOrganicos(projectId, funnelId);
  const pagos = usePlanejamentoPagos(projectId, funnelId);
  const resumo = usePlanejamentoResumo(projectId, funnelId);
  const salvar = useSalvarPlanejamentoResumo(projectId, funnelId);
  const [form, setForm] = useState<FormularioDosRotulos | null>(null);

  useEffect(() => {
    if (resumo.data && form === null) setForm(paraFormularioRotulos(resumo.data));
  }, [resumo.data, form]);

  const entradas = inputs.data?.inputs ?? null;
  const cenarios = useMemo(() => {
    if (!entradas || !organicos.data || !pagos.data) return null;
    const o = montarOrganicos(entradas, organicos.data);
    const p = montarPagos(entradas, pagos.data);
    return INDICES_DAS_COMBINACOES.map((indice, i) =>
      resumoFinal({ indice, organica: o.combinacoes[i], paga: p.combinacoes[i], metaMargemTotal: entradas.metaMargemTotal }),
    );
  }, [entradas, organicos.data, pagos.data]);

  const payload = useMemo(() => (form ? paraPayloadRotulos(form) : null), [form]);
  const alterado = useMemo(() => (payload && resumo.data ? rotulosAlterados(payload, resumo.data) : false), [payload, resumo.data]);

  const estadoAtual = estadoDaTela({
    isLoading: inputs.isLoading || organicos.isLoading || pagos.isLoading || resumo.isLoading,
    isError: inputs.isError || organicos.isError || pagos.isError || resumo.isError,
    temForm: form !== null,
  });
  if (estadoAtual === "erro") {
    const err = (inputs.error ?? organicos.error ?? pagos.error ?? resumo.error) as Error;
    return (
      <p role="alert" className="text-sm text-destructive">
        Não foi possível carregar o Resumo Final: {err.message}
      </p>
    );
  }
  if (estadoAtual === "carregando" || !form || !payload || !entradas || !cenarios) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  const inputsSalvos = inputs.data?.updatedAt !== null;
  const organicosSalvos = organicos.data?.updatedAt !== null;
  const pagosSalvos = pagos.data?.updatedAt !== null;
  const pendentes = origensPendentes({ inputsSalvos, organicosSalvos, pagosSalvos });

  const setRotulo = (k: number, rotulo: ReturnType<typeof lerRotulo>) => setForm((f) => (f ? f.map((r, i) => (i === k ? rotulo : r)) : f));

  async function onSalvar() {
    if (!payload) return;
    try {
      await salvar.mutateAsync(payload);
      toast.success("Rótulos dos cenários salvos");
    } catch (err) {
      toast.error(`Não salvou: ${(err as Error).message}`);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-muted-foreground">
          {resumo.data?.updatedAt ? `Rótulos salvos em ${new Date(resumo.data.updatedAt).toLocaleString("pt-BR")}` : "Rótulos nunca salvos"}
          {alterado && <span className="ml-2 font-medium text-amber-600">· alterações não salvas</span>}
        </p>
        {podeEditar && (
          <Button
            size="sm"
            onClick={onSalvar}
            disabled={!alterado || salvar.isPending || !inputsSalvos}
            title={!inputsSalvos ? "Salve os Inputs Financeiros antes" : undefined}
            className="gap-1.5"
          >
            {salvar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Salvar rótulos
          </Button>
        )}
      </div>

      {pendentes.map((p) => (
        <div key={p.origem} role="status" className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
          <div>
            <p className="font-medium">{p.titulo}</p>
            <p className="text-muted-foreground">{p.texto}</p>
            <Button variant="link" size="sm" className="h-auto p-0" onClick={() => irParaAba(p.aba)}>
              Ir para {p.aba === "inputs" ? "Inputs Financeiros" : p.aba === "organicos" ? "Leads Orgânicos" : "Leads Pagos"}
            </Button>
          </div>
        </div>
      ))}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cenários</CardTitle>
          <CardDescription>
            Cada cenário consolida a combinação de mesmo número das abas Leads Orgânicos e Leads Pagos: receita, deduções, tráfego, margem, atingimento da meta total e o resumo de marketing. O rótulo é uma anotação — nenhuma conta o lê.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TabelaDoResumo
            cenarios={cenarios}
            rotulos={form}
            organicosSalvos={organicosSalvos}
            pagosSalvos={pagosSalvos}
            podeEditar={podeEditar}
            onRotulo={setRotulo}
          />
        </CardContent>
      </Card>
    </div>
  );
}
