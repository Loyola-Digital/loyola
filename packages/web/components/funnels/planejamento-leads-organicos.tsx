"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtCurrency, fmtInt } from "@/lib/utils/format-number";
import { BarraDeAtingimento, CampoNumerico, LegendaDasFaixas, Moeda, pctPontos } from "@/components/funnels/planejamento-ui";
import { CANAIS_ORGANICOS, CENARIOS, NIVEIS_ORGANICOS, gradeOrganica, type CanalOrganico, type GradeOrganica } from "@loyola-x/shared/src/planejamento-cenarios";
import { derivarInputsFinanceiros } from "@loyola-x/shared/src/planejamento-inputs-financeiros";
import {
  INDICES_DAS_COMBINACOES,
  combinacaoOrganica,
  origemDoCanalNaAba1,
  parametrosDoBloco,
  type CombinacaoOrganica,
} from "@loyola-x/shared/src/planejamento-combinacoes";
import {
  CAMPOS_DE_FRACAO_DO_BLOCO,
  ROTULO_DO_CANAL,
  blocoComoEntradas,
  classeDaCelulaDeLeads,
  diagnosticoDaAba1,
  estadoDaTela,
  lerSelecao,
  organicosAlterados,
  paraFormularioOrganicos,
  paraPayloadOrganicos,
  temErros,
  validarOrganicos,
  valorDaGrade,
  type CampoDeFracaoDoBloco,
  type FormularioDosOrganicos,
} from "@/lib/utils/planejamento-organicos-form";
import { usePlanejamentoInputs } from "@/lib/hooks/use-planejamento-inputs";
import { usePlanejamentoOrganicos, useSalvarPlanejamentoOrganicos } from "@/lib/hooks/use-planejamento-organicos";

// Story 48.3 — aba `[2] Simulador Cenários: Leads Orgânicos`.
//
// Duas regiões, como a planilha: seis BLOCOS (um card por canal, com os
// parâmetros, a grade 8 níveis × 10 cenários e o radio do nível assumido) e o
// resumo de cinco COMBINAÇÕES (cenário por canal, receita, cadeia de
// deduções, MC, atingimento da meta, vendas/leads/conversão por canal).
//
// Zero cálculo aqui (E4): grade = `gradeOrganica` (48.2); combinação =
// `combinacaoOrganica` (48.3); receitas e percentuais = `derivarInputsFinanceiros`
// (48.1). Percentuais digitados em PONTOS (4 = 4 %), gravados como fração.
// Vazio é vazio (`null`), e "—" é "sem base" (D3), nunca zero disfarçado.

type Form = FormularioDosOrganicos;

const ROTULO_DO_PARAMETRO: Record<CampoDeFracaoDoBloco, string> = {
  conversaoMedia: "Conversão média em vendas",
  variacaoConversao: "Variação cenários conversão em vendas",
  variacaoReceita: "Variação cenários 1 → 10",
  taxaCaptacao: "Taxa de captação média da base",
  faixaVariacao: "Faixa de variação de leads captados",
  fracaoCenario1: "Cenário 1 = % da receita necessária",
};

const CENARIOS_LISTA = Array.from({ length: CENARIOS }, (_, i) => i + 1);
const NIVEIS_LISTA = Array.from({ length: NIVEIS_ORGANICOS }, (_, i) => i + 1);

// Peças de UI compartilhadas com a 48.4: `components/funnels/planejamento-ui.tsx`.

// ------------------------------------------------------------------
// Bloco de um canal
// ------------------------------------------------------------------

function BlocoDoCanal({
  canal,
  form,
  grade,
  origem,
  erros,
  podeEditar,
  onFracao,
  onNivel,
}: {
  canal: CanalOrganico;
  form: Form["blocos"][CanalOrganico];
  grade: GradeOrganica;
  origem: { metaReceita: number | null; base: number | null | undefined };
  erros: Partial<Record<string, string>>;
  podeEditar: boolean;
  onFracao: (campo: CampoDeFracaoDoBloco, v: string) => void;
  onNivel: (nivel: number | null) => void;
}) {
  const rotulo = ROTULO_DO_CANAL[canal];
  // REQ-001: meta de receita null (margem-alvo sem base na 48.1) → "—" na grade, não "0".
  const meta = origem.metaReceita;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{rotulo}</CardTitle>
        <CardDescription>
          Meta de receita <Moeda valor={origem.metaReceita} /> · Base {fmtInt(origem.base ?? null)} · Leads esperados por campanha{" "}
          <span className="tabular-nums font-medium text-foreground">{fmtInt(grade.leadsEsperados)}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {CAMPOS_DE_FRACAO_DO_BLOCO.map((k) => (
            <CampoNumerico
              key={k}
              id={`${canal}-${k}`}
              rotulo={ROTULO_DO_PARAMETRO[k]}
              valor={form.fracoes[k]}
              erro={erros[k]}
              placeholder={k === "fracaoCenario1" ? "70" : undefined}
              sufixo="%"
              onChange={(v) => onFracao(k, v)}
              readOnly={!podeEditar}
            />
          ))}
        </div>
        <LegendaDasFaixas limites={grade.limites} referencia={grade.leadsEsperados} grandeza="leads" />
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
                        name={`nivel-${canal}`}
                        checked={marcado}
                        onChange={() => onNivel(nivel)}
                        disabled={!podeEditar}
                        aria-label={`Nível ${nivel} assumido — ${rotulo}`}
                      />
                    </td>
                    <td className="py-0.5 pr-2 whitespace-nowrap text-muted-foreground">{pctPontos(grade.escada[i])}</td>
                    {grade.leads[i].map((leads, j) => (
                      <td key={j} className={`text-right py-0.5 px-1 ${meta === null ? "" : classeDaCelulaDeLeads(grade.faixas[i][j], grade.leadsEsperados)}`}>
                        {fmtInt(valorDaGrade(leads, meta))}
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
              ? "Nenhum nível assumido — sem ele, leads e conversão deste canal ficam “—” nas combinações."
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

function TabelaDeCombinacoes({
  combinacoes,
  selecoes,
  podeEditar,
  onSelecao,
}: {
  combinacoes: CombinacaoOrganica[];
  selecoes: Form["combinacoes"];
  podeEditar: boolean;
  onSelecao: (k: number, canal: CanalOrganico, sel: number | null) => void;
}) {
  const th = (texto: string) => (
    <th className="text-left py-1 pr-3 font-normal text-muted-foreground whitespace-nowrap sticky left-0 bg-card">{texto}</th>
  );
  const linhaMoeda = (rotulo: string, valor: (c: CombinacaoOrganica) => number | null, destaque?: boolean) => (
    <tr className={destaque ? "border-t font-semibold" : ""}>
      {th(rotulo)}
      {combinacoes.map((c) => (
        <td key={c.indice} className="text-right py-1 px-2">
          <Moeda valor={valor(c)} destaque={destaque} />
        </td>
      ))}
    </tr>
  );
  const linhaTexto = (rotulo: string, valor: (c: CombinacaoOrganica) => string, destaque?: boolean) => (
    <tr className={destaque ? "border-t font-semibold" : ""}>
      {th(rotulo)}
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
          {secao("Cenário escolhido por canal")}
          {CANAIS_ORGANICOS.map((canal) => (
            <tr key={canal}>
              {th(ROTULO_DO_CANAL[canal])}
              {combinacoes.map((c, k) => (
                <td key={c.indice} className="py-1 px-2 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <select
                      aria-label={`Cenário — ${ROTULO_DO_CANAL[canal]} — Combinação ${c.indice}`}
                      value={selecoes[k][canal] ?? ""}
                      onChange={(ev) => onSelecao(k, canal, lerSelecao(ev.target.value))}
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
                    <Moeda valor={c.receitas[canal]} />
                  </div>
                </td>
              ))}
            </tr>
          ))}
          {linhaMoeda("Receita bruta leads orgânicos", (c) => c.cadeia.receitaBruta, true)}
          {secao("Deduções")}
          {linhaMoeda("(−) Reembolso", (c) => c.cadeia.reembolso)}
          {linhaMoeda("Receita tributável", (c) => c.cadeia.receitaTributavel, true)}
          {linhaMoeda("(−) Marketplace", (c) => c.cadeia.deducoes.marketplace)}
          {linhaMoeda("(−) Imposto", (c) => c.cadeia.deducoes.imposto)}
          {linhaMoeda("(−) Custo de Produto", (c) => c.cadeia.deducoes.custoProduto)}
          {linhaMoeda("(−) Comissões", (c) => c.cadeia.deducoes.comissoes)}
          {linhaMoeda("(−) Outros Custos", (c) => c.cadeia.deducoes.outros)}
          {linhaMoeda("Margem de Contribuição Leads Orgânicos", (c) => c.cadeia.mc, true)}
          {linhaTexto("Margem de Contribuição (%)", (c) => pctPontos(c.cadeia.mcPct))}
          {secao("Meta de margem de contribuição orgânica")}
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
          {secao("Vendas, leads e conversão")}
          {linhaTexto("Nº de Vendas Totais Leads Orgânicos", (c) => fmtInt(c.totais.vendas), true)}
          {linhaTexto("Nº de Leads Orgânicos Totais", (c) => fmtInt(c.totais.leads), true)}
          {CANAIS_ORGANICOS.map((canal) => (
            <Fragment key={canal}>
              {linhaTexto(`Nº de Vendas ${ROTULO_DO_CANAL[canal]}`, (c) => fmtInt(c.canais[canal].vendas))}
              {linhaTexto(`Nº de Leads ${ROTULO_DO_CANAL[canal]}`, (c) => fmtInt(c.canais[canal].leads))}
              {linhaTexto(`Conversão ${ROTULO_DO_CANAL[canal]}`, (c) => pctPontos(c.canais[canal].conversao))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ------------------------------------------------------------------
// Seção
// ------------------------------------------------------------------

export function PlanejamentoLeadsOrganicos({
  projectId,
  funnelId,
  podeEditar,
  irParaInputs,
}: {
  projectId: string;
  funnelId: string;
  /** `false` para guest: a API responde 403 no PUT; a tela nem oferece o botão. */
  podeEditar: boolean;
  /** Troca para a aba `inputs` (a página é dona do `?tab=`). */
  irParaInputs: () => void;
}) {
  const inputs = usePlanejamentoInputs(projectId, funnelId);
  const organicos = usePlanejamentoOrganicos(projectId, funnelId);
  const salvar = useSalvarPlanejamentoOrganicos(projectId, funnelId);
  const [form, setForm] = useState<Form | null>(null);

  useEffect(() => {
    if (organicos.data && form === null) setForm(paraFormularioOrganicos(organicos.data));
  }, [organicos.data, form]);

  const payload = useMemo(() => (form ? paraPayloadOrganicos(form) : null), [form]);
  const erros = useMemo(() => (payload ? validarOrganicos(payload) : {}), [payload]);
  const entradas = inputs.data?.inputs ?? null;
  const derivados = useMemo(() => (entradas ? derivarInputsFinanceiros(entradas) : null), [entradas]);

  const grades = useMemo(() => {
    if (!payload || !entradas || !derivados) return null;
    const g = {} as Record<CanalOrganico, GradeOrganica>;
    for (const c of CANAIS_ORGANICOS) {
      g[c] = gradeOrganica(parametrosDoBloco(blocoComoEntradas(payload.blocos[c]), origemDoCanalNaAba1(entradas, derivados, c)));
    }
    return g;
  }, [payload, entradas, derivados]);

  const combinacoes = useMemo(() => {
    if (!payload || !entradas || !derivados || !grades) return null;
    const niveis = {} as Record<CanalOrganico, number | null>;
    for (const c of CANAIS_ORGANICOS) niveis[c] = payload.blocos[c].nivelAssumido;
    return INDICES_DAS_COMBINACOES.map((indice, i) =>
      combinacaoOrganica({
        indice,
        grades,
        selecoes: payload.combinacoes[i].selecoes,
        niveis,
        percentuais: entradas,
        metaMargemOrganicos: derivados.metaMargemOrganicos,
      }),
    );
  }, [payload, entradas, derivados, grades]);

  const alterado = useMemo(() => (payload && organicos.data ? organicosAlterados(payload, organicos.data) : false), [payload, organicos.data]);
  const temErro = temErros(erros);

  // Ordem decidida em `estadoDaTela` (REL-001 da 48.1): erro ANTES de carregando.
  const estadoAtual = estadoDaTela({
    isLoading: inputs.isLoading || organicos.isLoading,
    isError: inputs.isError || organicos.isError,
    temForm: form !== null,
  });
  if (estadoAtual === "erro") {
    const err = (inputs.error ?? organicos.error) as Error;
    return (
      <p role="alert" className="text-sm text-destructive">
        Não foi possível carregar os cenários dos leads orgânicos: {err.message}
      </p>
    );
  }
  if (estadoAtual === "carregando" || !form || !payload || !entradas || !derivados || !grades || !combinacoes) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const inputsNuncaSalvos = inputs.data?.updatedAt === null;
  const faltas = diagnosticoDaAba1(entradas, derivados);

  const setFracao = (canal: CanalOrganico, campo: CampoDeFracaoDoBloco, v: string) =>
    setForm((f) => (f ? { ...f, blocos: { ...f.blocos, [canal]: { ...f.blocos[canal], fracoes: { ...f.blocos[canal].fracoes, [campo]: v } } } } : f));
  const setNivel = (canal: CanalOrganico, nivel: number | null) =>
    setForm((f) => (f ? { ...f, blocos: { ...f.blocos, [canal]: { ...f.blocos[canal], nivelAssumido: nivel } } } : f));
  const setSelecao = (k: number, canal: CanalOrganico, sel: number | null) =>
    setForm((f) => (f ? { ...f, combinacoes: f.combinacoes.map((s, i) => (i === k ? { ...s, [canal]: sel } : s)) } : f));

  async function onSalvar() {
    if (temErro || !payload) return;
    try {
      await salvar.mutateAsync(payload);
      toast.success("Cenários dos leads orgânicos salvos");
    } catch (err) {
      toast.error(`Não salvou: ${(err as Error).message}`);
    }
  }

  return (
    <div className="space-y-6">
      {/* Barra de ação */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-muted-foreground">
          {organicos.data?.updatedAt
            ? `Salvo em ${new Date(organicos.data.updatedAt).toLocaleString("pt-BR")}`
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

      {/* AC13 — a aba 1 ainda não foi salva, ou falta um input que deixa a aba 2 sem base */}
      {inputsNuncaSalvos ? (
        <div role="status" className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
          <div>
            <p className="font-medium">Preencha os Inputs Financeiros</p>
            <p className="text-muted-foreground">
              As metas de receita, as bases e o ticket vêm de lá. Sem eles as grades ficam zeradas e a aba 2 não pode ser salva.
            </p>
            <Button variant="link" size="sm" className="h-auto p-0" onClick={irParaInputs}>
              Ir para Inputs Financeiros
            </Button>
          </div>
        </div>
      ) : faltas.length > 0 ? (
        <div role="status" className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
          <div>
            <p className="font-medium">Faltam nos Inputs Financeiros:</p>
            <ul className="list-disc pl-5 text-muted-foreground">
              {faltas.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            <Button variant="link" size="sm" className="h-auto p-0" onClick={irParaInputs}>
              Ir para Inputs Financeiros
            </Button>
          </div>
        </div>
      ) : null}

      {/* Blocos por canal */}
      {CANAIS_ORGANICOS.map((canal) => (
        <BlocoDoCanal
          key={canal}
          canal={canal}
          form={form.blocos[canal]}
          grade={grades[canal]}
          origem={origemDoCanalNaAba1(entradas, derivados, canal)}
          erros={erros[canal] ?? {}}
          podeEditar={podeEditar}
          onFracao={(campo, v) => setFracao(canal, campo, v)}
          onNivel={(nivel) => setNivel(canal, nivel)}
        />
      ))}

      {/* Combinações */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Combinações</CardTitle>
          <CardDescription>
            Cinco combinações independentes: escolha um cenário por canal e veja a receita, a cadeia de deduções, a margem, o atingimento da meta e quantos leads cada canal precisa no nível assumido.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TabelaDeCombinacoes combinacoes={combinacoes} selecoes={form.combinacoes} podeEditar={podeEditar} onSelecao={setSelecao} />
        </CardContent>
      </Card>
    </div>
  );
}
