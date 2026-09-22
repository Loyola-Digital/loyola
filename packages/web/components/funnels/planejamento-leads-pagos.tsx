"use client";

import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtCurrency, fmtInt } from "@/lib/utils/format-number";
import { BarraDeAtingimento, CampoNumerico, LegendaDasFaixas, Moeda, pctPontos } from "@/components/funnels/planejamento-ui";
import { FONTES_PAGAS, CENARIOS, NIVEIS_PAGOS, type FontePaga, type GradePaga } from "@loyola-x/shared/src/planejamento-cenarios";
import type { CombinacaoPaga, OrigemDaFonteNaAba1 } from "@loyola-x/shared/src/planejamento-combinacoes";
import { montarPagos } from "@/lib/utils/planejamento-montagem";
import {
  CAMPOS_DE_TEXTO_DO_BLOCO_PAGO,
  ROTULO_DA_FONTE,
  TIPO_DO_CAMPO_PAGO,
  blocoPagoComoEntradas,
  classeDaCelulaDeCpl,
  diagnosticoDaAba1Pagos,
  estadoDaTela,
  lerSelecao,
  pagosAlterados,
  paraFormularioPagos,
  paraPayloadPagos,
  temErrosPagos,
  validarPagos,
  valorDaGrade,
  type CampoDeTextoDoBlocoPago,
  type FormularioDosPagos,
} from "@/lib/utils/planejamento-pagos-form";
import { usePlanejamentoInputs } from "@/lib/hooks/use-planejamento-inputs";
import { usePlanejamentoPagos, useSalvarPlanejamentoPagos } from "@/lib/hooks/use-planejamento-pagos";

// Story 48.4 — aba `[3] Simulador Cenários: Leads Pagos`.
//
// Mesma organização da aba 2 (48.3), com três diferenças (spec §3): o
// TRÁFEGO (verba das quatro fontes, da 48.1) entra na conta e é o mesmo nas
// cinco combinações; a grade é de CPL MÁXIMO além de leads; e as fontes se
// agrupam em duas plataformas no resumo. Zero cálculo aqui (E4): grade =
// `gradePaga` (48.2); combinação = `combinacaoPaga` (48.4); receitas, verbas e
// percentuais = `derivarInputsFinanceiros` (48.1).

type Form = FormularioDosPagos;

const ROTULO_DO_PARAMETRO: Record<CampoDeTextoDoBlocoPago, string> = {
  pctCaptacao: "Parte da verba para captação",
  conversaoMedia: "Conversão média em vendas",
  variacaoConversao: "Variação cenários conversão",
  variacaoReceita: "Variação cenários de receita 1 → 10",
  cplMedioHistorico: "CPL médio histórico",
  faixaVariacao: "Faixa de variação de preço do CPL",
  fracaoCenario1: "Cenário 1 = % da receita necessária",
};

const CENARIOS_LISTA = Array.from({ length: CENARIOS }, (_, i) => i + 1);
const NIVEIS_LISTA = Array.from({ length: NIVEIS_PAGOS }, (_, i) => i + 1);

// ------------------------------------------------------------------
// Bloco de uma fonte
// ------------------------------------------------------------------

function BlocoDaFonte({
  fonte,
  form,
  grade,
  origem,
  cplMedio,
  erros,
  podeEditar,
  onCampo,
  onNivel,
}: {
  fonte: FontePaga;
  form: Form["blocos"][FontePaga];
  grade: GradePaga;
  origem: OrigemDaFonteNaAba1;
  cplMedio: number | null;
  erros: Partial<Record<string, string>>;
  podeEditar: boolean;
  onCampo: (campo: CampoDeTextoDoBlocoPago, v: string) => void;
  onNivel: (nivel: number | null) => void;
}) {
  const rotulo = ROTULO_DA_FONTE[fonte];
  // REQ-001 da 48.3 vale aqui: meta de receita null (margem-alvo dos pagos sem base) → "—" na grade.
  const meta = origem.metaReceita;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{rotulo}</CardTitle>
        <CardDescription>
          Meta de receita <Moeda valor={meta} /> · Verba <Moeda valor={origem.verba} /> · Captação{" "}
          <span className="tabular-nums font-medium text-foreground">{fmtCurrency(grade.captacao)}</span> · Remarketing{" "}
          <span className="tabular-nums">{fmtCurrency(grade.remarketing)}</span> (informativo)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {CAMPOS_DE_TEXTO_DO_BLOCO_PAGO.map((k) => (
            <CampoNumerico
              key={k}
              id={`${fonte}-${k}`}
              rotulo={ROTULO_DO_PARAMETRO[k]}
              valor={form.campos[k]}
              erro={erros[k]}
              placeholder={k === "fracaoCenario1" ? "70" : undefined}
              sufixo={TIPO_DO_CAMPO_PAGO[k] === "pct" ? "%" : "R$"}
              onChange={(v) => onCampo(k, v)}
              readOnly={!podeEditar}
            />
          ))}
        </div>
        <LegendaDasFaixas limites={grade.limites} referencia={cplMedio} grandeza="cpl" />
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-muted-foreground">
              <tr>
                <th className="text-left py-1 pr-2 whitespace-nowrap" colSpan={2}>
                  Cenário
                </th>
                {CENARIOS_LISTA.map((n) => (
                  <th key={n} className="text-right py-1 px-1">
                    {n}
                  </th>
                ))}
              </tr>
              <tr>
                <th className="text-left py-1 pr-2 whitespace-nowrap" colSpan={2}>
                  Receita
                </th>
                {grade.receita.map((r, i) => (
                  <th key={i} className="text-right py-1 px-1 tabular-nums font-normal whitespace-nowrap">
                    {fmtCurrency(valorDaGrade(r, meta))}
                  </th>
                ))}
              </tr>
              <tr className="border-b">
                <th className="text-left py-1 pr-2 whitespace-nowrap" colSpan={2}>
                  Vendas
                </th>
                {grade.vendas.map((v, i) => (
                  <th key={i} className="text-right py-1 px-1 tabular-nums font-normal">
                    {fmtInt(valorDaGrade(v, meta))}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {NIVEIS_LISTA.map((nivel) => {
                const i = nivel - 1;
                const marcado = form.nivelAssumido === nivel;
                return (
                  <tr key={nivel} className={marcado ? "font-semibold" : ""}>
                    <td className="py-0.5 pr-1 w-6">
                      <input
                        type="radio"
                        name={`nivel-${fonte}`}
                        checked={marcado}
                        onChange={() => onNivel(nivel)}
                        disabled={!podeEditar}
                        aria-label={`Nível ${nivel} assumido — ${rotulo}`}
                      />
                    </td>
                    <td className="py-0.5 pr-2 whitespace-nowrap text-muted-foreground">{pctPontos(grade.escada[i])}</td>
                    {grade.cpl[i].map((cpl, j) => (
                      <td key={j} className={`text-right py-0.5 px-1 ${meta === null ? "" : classeDaCelulaDeCpl(grade.faixas[i][j], cplMedio)}`}>
                        <span className="block">{fmtCurrency(valorDaGrade(cpl, meta))}</span>
                        <span className="block text-[10px] text-muted-foreground">{fmtInt(valorDaGrade(grade.leads[i][j], meta))} leads</span>
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            {form.nivelAssumido === null
              ? "Nenhum nível assumido — sem ele, CPL máximo, leads e conversão desta fonte ficam “—” nas combinações."
              : `Nível assumido: ${form.nivelAssumido} (${pctPontos(grade.escada[form.nivelAssumido - 1] ?? null)})`}
          </span>
          {podeEditar && form.nivelAssumido !== null && (
            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => onNivel(null)}>
              Limpar nível
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------------
// Combinações
// ------------------------------------------------------------------

function TabelaDeCombinacoesPagas({
  combinacoes,
  selecoes,
  podeEditar,
  onSelecao,
}: {
  combinacoes: CombinacaoPaga[];
  selecoes: Form["combinacoes"];
  podeEditar: boolean;
  onSelecao: (k: number, fonte: FontePaga, sel: number | null) => void;
}) {
  const th = (texto: string, recuo?: boolean) => (
    <th className={`text-left py-1 pr-3 font-normal text-muted-foreground whitespace-nowrap sticky left-0 bg-card ${recuo ? "pl-4" : ""}`}>{texto}</th>
  );
  const linhaMoeda = (rotulo: string, valor: (c: CombinacaoPaga) => number | null, opts?: { destaque?: boolean; recuo?: boolean }) => (
    <tr className={opts?.destaque ? "border-t font-semibold" : ""}>
      {th(rotulo, opts?.recuo)}
      {combinacoes.map((c) => (
        <td key={c.indice} className="text-right py-1 px-2">
          <Moeda valor={valor(c)} destaque={opts?.destaque} />
        </td>
      ))}
    </tr>
  );
  const linhaTexto = (rotulo: string, valor: (c: CombinacaoPaga) => string, opts?: { destaque?: boolean; recuo?: boolean }) => (
    <tr className={opts?.destaque ? "border-t font-semibold" : ""}>
      {th(rotulo, opts?.recuo)}
      {combinacoes.map((c) => (
        <td key={c.indice} className="text-right py-1 px-2 tabular-nums">
          {valor(c)}
        </td>
      ))}
    </tr>
  );
  const secao = (texto: string) => (
    <tr>
      <td colSpan={combinacoes.length + 1} className="pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {texto}
      </td>
    </tr>
  );
  const linhaSelecao = (fonte: FontePaga) => (
    <tr key={fonte}>
      {th(ROTULO_DA_FONTE[fonte], true)}
      {combinacoes.map((c, k) => (
        <td key={c.indice} className="py-1 px-2 text-right">
          <div className="flex items-center justify-end gap-2">
            <select
              aria-label={`Cenário — ${ROTULO_DA_FONTE[fonte]} — Combinação ${c.indice}`}
              value={selecoes[k][fonte] ?? ""}
              onChange={(ev) => onSelecao(k, fonte, lerSelecao(ev.target.value))}
              disabled={!podeEditar}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
            >
              <option value="">—</option>
              {CENARIOS_LISTA.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <Moeda valor={c.receitas[fonte]} />
          </div>
        </td>
      ))}
    </tr>
  );
  const fonteResumo = (fonte: FontePaga) => (
    <Fragment key={fonte}>
      {linhaTexto(`Nº de Vendas ${ROTULO_DA_FONTE[fonte]}`, (c) => fmtInt(c.fontes[fonte].vendas), { recuo: true })}
      {linhaMoeda(`CPL máx. ${ROTULO_DA_FONTE[fonte]}`, (c) => c.fontes[fonte].cpl, { recuo: true })}
      {linhaTexto(`Nº de Leads ${ROTULO_DA_FONTE[fonte]}`, (c) => fmtInt(c.fontes[fonte].leads), { recuo: true })}
      {linhaTexto(`Conversão ${ROTULO_DA_FONTE[fonte]}`, (c) => pctPontos(c.fontes[fonte].conversao), { recuo: true })}
    </Fragment>
  );
  const meta = combinacoes[0]?.meta.meta ?? 0;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr>
            {th("")}
            {combinacoes.map((c) => (
              <th key={c.indice} className="text-right py-1 px-2 whitespace-nowrap">
                Combinação {c.indice}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {secao("Cenário escolhido por fonte")}
          {linhaMoeda("Receita Meta Ads", (c) => c.receitaMeta, { destaque: true })}
          {linhaSelecao("meta_quente")}
          {linhaSelecao("meta_frio")}
          {linhaMoeda("Receita Google Ads", (c) => c.receitaGoogle, { destaque: true })}
          {linhaSelecao("google_quente")}
          {linhaSelecao("google_frio")}
          {linhaMoeda("Receita bruta leads pagos", (c) => c.cadeia.receitaBruta, { destaque: true })}
          {secao("Deduções")}
          {linhaMoeda("(−) Reembolso", (c) => c.cadeia.reembolso)}
          {linhaMoeda("Receita tributável", (c) => c.cadeia.receitaTributavel, { destaque: true })}
          {linhaMoeda("(−) Marketplace", (c) => c.cadeia.deducoes.marketplace)}
          {linhaMoeda("(−) Imposto", (c) => c.cadeia.deducoes.imposto)}
          {linhaMoeda("(−) Custo de Produto", (c) => c.cadeia.deducoes.custoProduto)}
          {linhaMoeda("(−) Comissões", (c) => c.cadeia.deducoes.comissoes)}
          {linhaMoeda("(−) Outros Custos", (c) => c.cadeia.deducoes.outros)}
          {linhaMoeda("Receita líquida", (c) => c.receitaLiquida, { destaque: true })}
          {secao("Tráfego (verba da aba 1 — igual nas cinco combinações)")}
          {linhaMoeda("(−) Tráfego", (c) => c.trafego.total, { destaque: true })}
          {linhaMoeda("Tráfego Meta Ads", (c) => c.trafego.meta)}
          {linhaMoeda("Meta Ads · Público quente", (c) => c.trafego.porFonte.meta_quente, { recuo: true })}
          {linhaMoeda("Meta Ads · Público frio", (c) => c.trafego.porFonte.meta_frio, { recuo: true })}
          {linhaMoeda("Tráfego Google Ads", (c) => c.trafego.google)}
          {linhaMoeda("Google Ads · Público quente", (c) => c.trafego.porFonte.google_quente, { recuo: true })}
          {linhaMoeda("Google Ads · Público frio", (c) => c.trafego.porFonte.google_frio, { recuo: true })}
          {linhaTexto("(−) Tráfego (% da receita bruta)", (c) => pctPontos(c.trafego.pctDaReceita))}
          {secao("Margem de contribuição")}
          {linhaMoeda("Margem de Contribuição Leads Pagos", (c) => c.mc.pagos, { destaque: true })}
          {linhaTexto("Margem de Contribuição Leads Pagos (%)", (c) => pctPontos(c.mc.pagosPct))}
          {linhaMoeda("Margem de Contribuição Meta Ads", (c) => c.mc.meta.mc)}
          {linhaTexto("Margem Meta Ads (% da receita Meta)", (c) => pctPontos(c.mc.meta.pct), { recuo: true })}
          {linhaMoeda("Margem de Contribuição Google Ads", (c) => c.mc.google.mc)}
          {linhaTexto("Margem Google Ads (% da receita Google)", (c) => pctPontos(c.mc.google.pct), { recuo: true })}
          {secao("Meta de margem de contribuição dos leads pagos")}
          {linhaMoeda(`Meta (${fmtCurrency(meta)})`, (c) => c.meta.meta)}
          <tr>
            {th("Atingimento da meta")}
            {combinacoes.map((c) => (
              <td key={c.indice} className="py-1 px-2 min-w-32">
                <BarraDeAtingimento atingimento={c.meta.atingimento} />
              </td>
            ))}
          </tr>
          {linhaMoeda("Gap para a meta", (c) => c.meta.gap)}
          {secao("Resumo de marketing")}
          {linhaTexto("Nº de Vendas Totais Leads Pagos (4 públicos)", (c) => fmtInt(c.totais.vendas), { destaque: true })}
          {linhaTexto("Nº de Leads Pagos Totais", (c) => fmtInt(c.totais.leads), { destaque: true })}
          {linhaTexto("Nº de Vendas Meta Ads (quente + frio)", (c) => fmtInt(c.totais.meta.vendas), { destaque: true })}
          {linhaTexto("Nº de Leads Meta Ads", (c) => fmtInt(c.totais.meta.leads))}
          {linhaTexto("Conversão Meta Ads", (c) => pctPontos(c.totais.meta.conversao))}
          {fonteResumo("meta_quente")}
          {fonteResumo("meta_frio")}
          {linhaTexto("Nº de Vendas Google Ads (quente + frio)", (c) => fmtInt(c.totais.google.vendas), { destaque: true })}
          {linhaTexto("Nº de Leads Google Ads", (c) => fmtInt(c.totais.google.leads))}
          {linhaTexto("Conversão Google Ads", (c) => pctPontos(c.totais.google.conversao))}
          {fonteResumo("google_quente")}
          {fonteResumo("google_frio")}
        </tbody>
      </table>
    </div>
  );
}

// ------------------------------------------------------------------
// Seção
// ------------------------------------------------------------------

export function PlanejamentoLeadsPagos({
  projectId,
  funnelId,
  podeEditar,
  irParaInputs,
}: {
  projectId: string;
  funnelId: string;
  podeEditar: boolean;
  irParaInputs: () => void;
}) {
  const inputs = usePlanejamentoInputs(projectId, funnelId);
  const pagos = usePlanejamentoPagos(projectId, funnelId);
  const salvar = useSalvarPlanejamentoPagos(projectId, funnelId);
  const [form, setForm] = useState<Form | null>(null);

  useEffect(() => {
    if (pagos.data && form === null) setForm(paraFormularioPagos(pagos.data));
  }, [pagos.data, form]);

  const payload = useMemo(() => (form ? paraPayloadPagos(form) : null), [form]);
  const erros = useMemo(() => (payload ? validarPagos(payload) : {}), [payload]);
  const entradas = inputs.data?.inputs ?? null;
  // Story 48.5 (AC12): a montagem grades → combinações é a mesma função pura da aba 4.
  const montagem = useMemo(() => (payload && entradas ? montarPagos(entradas, payload) : null), [payload, entradas]);
  const derivados = montagem?.derivados ?? null;
  const origens: Record<FontePaga, OrigemDaFonteNaAba1> | null = montagem?.origens ?? null;
  const grades: Record<FontePaga, GradePaga> | null = montagem?.grades ?? null;
  const combinacoes = montagem?.combinacoes ?? null;

  const alterado = useMemo(() => (payload && pagos.data ? pagosAlterados(payload, pagos.data) : false), [payload, pagos.data]);
  const temErro = temErrosPagos(erros);

  const estadoAtual = estadoDaTela({
    isLoading: inputs.isLoading || pagos.isLoading,
    isError: inputs.isError || pagos.isError,
    temForm: form !== null,
  });
  if (estadoAtual === "erro") {
    const err = (inputs.error ?? pagos.error) as Error;
    return (
      <p role="alert" className="text-sm text-destructive">
        Não foi possível carregar os cenários dos leads pagos: {err.message}
      </p>
    );
  }
  if (estadoAtual === "carregando" || !form || !payload || !entradas || !derivados || !grades || !origens || !combinacoes) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const inputsNuncaSalvos = inputs.data?.updatedAt === null;
  const faltas = diagnosticoDaAba1Pagos(entradas, derivados);

  const setCampo = (fonte: FontePaga, campo: CampoDeTextoDoBlocoPago, v: string) =>
    setForm((f) => (f ? { ...f, blocos: { ...f.blocos, [fonte]: { ...f.blocos[fonte], campos: { ...f.blocos[fonte].campos, [campo]: v } } } } : f));
  const setNivel = (fonte: FontePaga, nivel: number | null) =>
    setForm((f) => (f ? { ...f, blocos: { ...f.blocos, [fonte]: { ...f.blocos[fonte], nivelAssumido: nivel } } } : f));
  const setSelecao = (k: number, fonte: FontePaga, sel: number | null) =>
    setForm((f) => (f ? { ...f, combinacoes: f.combinacoes.map((s, i) => (i === k ? { ...s, [fonte]: sel } : s)) } : f));

  async function onSalvar() {
    if (temErro || !payload) return;
    try {
      await salvar.mutateAsync(payload);
      toast.success("Cenários dos leads pagos salvos");
    } catch (err) {
      toast.error(`Não salvou: ${(err as Error).message}`);
    }
  }

  const aviso = (titulo: string, corpo: ReactNode) => (
    <div role="status" className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
      <div>
        <p className="font-medium">{titulo}</p>
        {corpo}
        <Button variant="link" size="sm" className="h-auto p-0" onClick={irParaInputs}>
          Ir para Inputs Financeiros
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-muted-foreground">
          {pagos.data?.updatedAt
            ? `Salvo em ${new Date(pagos.data.updatedAt).toLocaleString("pt-BR")}`
            : "Nunca salvo — os parâmetros abaixo começam vazios"}
          {alterado && <span className="ml-2 font-medium text-amber-600">· alterações não salvas</span>}
        </p>
        {podeEditar && (
          <Button
            size="sm"
            onClick={onSalvar}
            disabled={!alterado || temErro || salvar.isPending || inputsNuncaSalvos}
            title={inputsNuncaSalvos ? "Salve os Inputs Financeiros antes" : undefined}
            className="gap-1.5"
          >
            {salvar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Salvar
          </Button>
        )}
      </div>

      {inputsNuncaSalvos
        ? aviso(
            "Preencha os Inputs Financeiros",
            <p className="text-muted-foreground">As metas de receita, as verbas e o ticket vêm de lá. Sem eles as grades ficam zeradas e a aba 3 não pode ser salva.</p>,
          )
        : faltas.length > 0
          ? aviso(
              "Faltam nos Inputs Financeiros:",
              <ul className="list-disc pl-5 text-muted-foreground">
                {faltas.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>,
            )
          : null}

      {FONTES_PAGAS.map((fonte) => (
        <BlocoDaFonte
          key={fonte}
          fonte={fonte}
          form={form.blocos[fonte]}
          grade={grades[fonte]}
          origem={origens[fonte]}
          cplMedio={blocoPagoComoEntradas(payload.blocos[fonte]).cplMedioHistorico}
          erros={erros[fonte] ?? {}}
          podeEditar={podeEditar}
          onCampo={(campo, v) => setCampo(fonte, campo, v)}
          onNivel={(nivel) => setNivel(fonte, nivel)}
        />
      ))}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Combinações</CardTitle>
          <CardDescription>
            Cinco combinações independentes: escolha um cenário por fonte e veja a receita por plataforma, a cadeia de deduções, o tráfego, a margem por plataforma, o atingimento da meta e o CPL máximo, os leads e a conversão de cada fonte no nível assumido.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TabelaDeCombinacoesPagas combinacoes={combinacoes} selecoes={form.combinacoes} podeEditar={podeEditar} onSelecao={setSelecao} />
        </CardContent>
      </Card>
    </div>
  );
}
