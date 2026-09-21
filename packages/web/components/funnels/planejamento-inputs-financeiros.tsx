"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtCurrency, fmtInt, fmtPercent } from "@/lib/utils/format-number";
import { derivarInputsFinanceiros, type DerivadosFinanceiros } from "@loyola-x/shared/src/planejamento-inputs-financeiros";
import {
  TIPO_DO_CAMPO,
  comoEntradas,
  estadoDaTela,
  formularioAlterado,
  paraEntradas,
  paraFormulario,
  validarEntradas,
  type CampoDosInputs,
  type FormularioDosInputs,
} from "@/lib/utils/planejamento-inputs-form";
import { usePlanejamentoInputs, useSalvarPlanejamentoInputs } from "@/lib/hooks/use-planejamento-inputs";

// Story 48.1 — seção "Inputs Financeiros" da aba 1 da planilha.
//
// Zero cálculo aqui (AC2): tudo que é 🔒 na planilha sai de
// `derivarInputsFinanceiros` a cada tecla; o que é ✏️ vive no formulário.
// Percentuais são digitados em PONTOS (4 = 4 %) e gravados como fração
// (0.04) — a API só conhece fração. Vazio é vazio (`null`), não zero (AC11).
// Os seis grupos e a ordem são os da planilha (AC14); os rótulos são os da
// coluna D da spec (§1.1 "Mapa de campos").

type Campo = CampoDosInputs;
type Formulario = FormularioDosInputs;
const TIPO = TIPO_DO_CAMPO;

const pctPontos = (fracao: number | null) => fmtPercent(fracao === null ? null : fracao * 100);

// ------------------------------------------------------------------
// Peças de UI
// ------------------------------------------------------------------

function CampoNumerico({
  campo,
  rotulo,
  valor,
  erro,
  onChange,
  readOnly,
  ariaLabel,
}: {
  campo: Campo;
  rotulo: string;
  valor: string;
  erro?: string;
  onChange: (v: string) => void;
  readOnly: boolean;
  /** Quando o rótulo visível está vazio (tabela de canais), o leitor de tela recebe este (MNT-003). */
  ariaLabel?: string;
}) {
  const tipo = TIPO[campo];
  const sufixo = tipo === "pct" ? "%" : tipo === "moeda" ? "R$" : "#";
  return (
    <div className="space-y-1">
      {rotulo && (
        <Label htmlFor={campo} className="text-xs text-muted-foreground">
          {rotulo}
        </Label>
      )}
      <div className="relative">
        <Input
          id={campo}
          inputMode="decimal"
          value={valor}
          onChange={(ev) => onChange(ev.target.value)}
          readOnly={readOnly}
          aria-label={rotulo ? undefined : ariaLabel}
          aria-invalid={!!erro}
          className={`pr-8 tabular-nums ${erro ? "border-destructive" : ""}`}
          placeholder="—"
        />
        <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-muted-foreground">{sufixo}</span>
      </div>
      {erro && <p className="text-[11px] text-destructive">{erro}</p>}
    </div>
  );
}

function Derivado({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className={`tabular-nums ${destaque ? "text-base font-semibold" : "text-sm"} ${valor.startsWith("-") ? "text-destructive" : ""}`}>{valor}</p>
    </div>
  );
}

const CANAIS: { chave: keyof DerivadosFinanceiros["canais"]; pct: Campo; base: Campo; rotulo: string }[] = [
  { chave: "whatsapp", pct: "pctOrgWhatsapp", base: "baseWhatsapp", rotulo: "WhatsApp" },
  { chave: "email", pct: "pctOrgEmail", base: "baseEmail", rotulo: "Email" },
  { chave: "instagram", pct: "pctOrgInstagram", base: "baseInstagram", rotulo: "Instagram" },
  { chave: "telegram", pct: "pctOrgTelegram", base: "baseTelegram", rotulo: "Telegram" },
  { chave: "youtube", pct: "pctOrgYoutube", base: "baseYoutube", rotulo: "YouTube" },
  { chave: "areaMembros", pct: "pctOrgAreaMembros", base: "baseAreaMembros", rotulo: "Área de Membros" },
];

// ------------------------------------------------------------------
// Seção
// ------------------------------------------------------------------

export function PlanejamentoInputsFinanceiros({
  projectId,
  funnelId,
  podeEditar,
}: {
  projectId: string;
  funnelId: string;
  /** `false` para guest: a API responde 403 no PUT; a tela nem oferece o botão. */
  podeEditar: boolean;
}) {
  const query = usePlanejamentoInputs(projectId, funnelId);
  const salvar = useSalvarPlanejamentoInputs(projectId, funnelId);
  const [form, setForm] = useState<Formulario | null>(null);

  // Carrega o formulário UMA vez por resposta da API; depois é o usuário que manda.
  useEffect(() => {
    if (query.data && form === null) setForm(paraFormulario(query.data.inputs));
  }, [query.data, form]);

  const entradas = useMemo(() => (form ? paraEntradas(form) : null), [form]);
  const erros = useMemo(() => (entradas ? validarEntradas(entradas) : {}), [entradas]);
  const derivados = useMemo(() => (entradas ? derivarInputsFinanceiros(comoEntradas(entradas)) : null), [entradas]);
  const alterado = useMemo(
    () => (entradas && query.data ? formularioAlterado(entradas, query.data.inputs) : false),
    [entradas, query.data],
  );
  const temErro = Object.keys(erros).length > 0;

  // Ordem decidida em `estadoDaTela` (REL-001): erro ANTES de carregando —
  // em falha da API o formulário nunca é preenchido, e `!form` primeiro
  // deixaria o skeleton na tela para sempre.
  const estadoAtual = estadoDaTela({ isLoading: query.isLoading, isError: query.isError, temForm: form !== null });
  if (estadoAtual === "erro") {
    return (
      <p role="alert" className="text-sm text-destructive">
        Não foi possível carregar os inputs financeiros: {(query.error as Error).message}
      </p>
    );
  }
  if (estadoAtual === "carregando" || !form || !derivados || !entradas) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  const set = (campo: Campo) => (v: string) => setForm((f) => (f ? { ...f, [campo]: v } : f));
  const campo = (c: Campo, rotulo: string, ariaLabel?: string) => (
    <CampoNumerico campo={c} rotulo={rotulo} valor={form[c]} erro={erros[c]} onChange={set(c)} readOnly={!podeEditar} ariaLabel={ariaLabel} />
  );
  const d = derivados;

  async function onSalvar() {
    if (temErro || !entradas) return;
    try {
      await salvar.mutateAsync(entradas);
      toast.success("Inputs financeiros salvos");
    } catch (err) {
      toast.error(`Não salvou: ${(err as Error).message}`);
    }
  }

  const estado = d.statusOrganicos.estado;
  const corDoStatus = estado === "ok" ? "text-emerald-600" : estado === "falta" ? "text-amber-600" : "text-destructive";

  return (
    <div className="space-y-6">
      {/* Barra de ação */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-muted-foreground">
          {query.data?.updatedAt
            ? `Salvo em ${new Date(query.data.updatedAt).toLocaleString("pt-BR")}`
            : "Nunca salvo — os campos abaixo começam vazios"}
          {alterado && <span className="ml-2 font-medium text-amber-600">· alterações não salvas</span>}
        </p>
        {podeEditar && (
          <Button size="sm" onClick={onSalvar} disabled={!alterado || temErro || salvar.isPending} className="gap-1.5">
            {salvar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Salvar
          </Button>
        )}
      </div>

      {/* 1. Custos variáveis */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Custos variáveis</CardTitle>
          <CardDescription>Percentuais sobre a receita bruta. O total define a margem-alvo dos leads orgânicos.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {campo("pctReembolso", "Reembolso")}
          {campo("pctMarketplace", "Marketplace (Plataforma de Pagamento)")}
          {campo("pctImposto", "Imposto")}
          {campo("pctCustoProduto", "Custos do Produto")}
          {campo("pctComissoes", "Comissões")}
          {campo("pctOutrosCustos", "Outros custos")}
          <Derivado rotulo="Total de custos" valor={pctPontos(d.pctCustosTotal)} destaque />
          <Derivado rotulo="Margem-alvo dos leads orgânicos (100 % − custos)" valor={pctPontos(d.mcAlvoOrganicos)} />
        </CardContent>
      </Card>

      {/* 2. Metas */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Metas</CardTitle>
          <CardDescription>A meta de margem é repartida entre leads pagos e orgânicos; a receita necessária é a meta dividida pela margem-alvo.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {campo("metaMargemTotal", "Meta de Margem de Contribuição Total")}
            {campo("ticketMedio", "Ticket Médio")}
            {campo("pctMargemPagos", "Representatividade da margem — leads pagos")}
            <Derivado rotulo="Representatividade da margem — leads orgânicos" valor={pctPontos(d.pctMargemOrganicos)} />
            {campo("mcAlvoPagos", "Meta de MC dos leads pagos")}
            <Derivado rotulo="Meta de MC dos leads orgânicos" valor={pctPontos(d.mcAlvoOrganicos)} />
            <Derivado rotulo="Meta de MC média" valor={pctPontos(d.mcAlvoMedia)} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="text-left py-1">Origem</th>
                  <th className="text-right py-1">Margem</th>
                  <th className="text-right py-1">Receita necessária</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                <tr>
                  <td className="py-1">Leads pagos</td>
                  <td className="text-right">{fmtCurrency(d.metaMargemPagos)}</td>
                  <td className="text-right">{fmtCurrency(d.receitaMetaPagos)}</td>
                </tr>
                <tr>
                  <td className="py-1">Leads orgânicos</td>
                  <td className="text-right">{fmtCurrency(d.metaMargemOrganicos)}</td>
                  <td className="text-right">{fmtCurrency(d.receitaMetaOrganicos)}</td>
                </tr>
                <tr className="font-semibold border-t">
                  <td className="py-1">Total</td>
                  <td className="text-right">{fmtCurrency(entradas.metaMargemTotal === null ? 0 : entradas.metaMargemTotal)}</td>
                  <td className="text-right">{fmtCurrency(d.receitaMetaTotal)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* 3. Investimento */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Investimento</CardTitle>
          <CardDescription>Repartido entre Meta e Google pela parte do Meta; dentro de cada plataforma, entre público quente e frio pela parte do quente.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {campo("investimentoAnuncios", "Investimento em Anúncios")}
          {campo("pctInvestMeta", "Investimento em Meta Ads")}
          <Derivado rotulo="Meta Ads" valor={fmtCurrency(d.investMeta)} />
          <Derivado rotulo={`Google Ads (${pctPontos(d.pctInvestGoogle)})`} valor={fmtCurrency(d.investGoogle)} />
          {campo("pctMetaQuente", "Público quente (sob Meta)")}
          <Derivado rotulo="Meta · quente" valor={fmtCurrency(d.investMetaQuente)} />
          <Derivado rotulo={`Meta · frio (${pctPontos(d.pctMetaFrio)})`} valor={fmtCurrency(d.investMetaFrio)} />
          <div />
          {campo("pctGoogleQuente", "Público quente (sob Google)")}
          <Derivado rotulo="Google · quente" valor={fmtCurrency(d.investGoogleQuente)} />
          <Derivado rotulo={`Google · frio (${pctPontos(d.pctGoogleFrio)})`} valor={fmtCurrency(d.investGoogleFrio)} />
        </CardContent>
      </Card>

      {/* 4. Metas financeiras — leads pagos */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Metas financeiras — leads pagos</CardTitle>
          <CardDescription>A meta de margem de cada fonte segue a repartição do investimento; a receita necessária de cada fonte é a meta dividida pela meta de MC dos leads pagos.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="text-left py-1">Fonte</th>
                <th className="text-right py-1">%</th>
                <th className="text-right py-1">Margem</th>
                <th className="text-right py-1">Receita necessária</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              <tr className="font-medium">
                <td className="py-1">Meta Ads</td>
                <td className="text-right">{pctPontos(entradas.pctInvestMeta ?? 0)}</td>
                <td className="text-right">{fmtCurrency(d.margemMetaAds)}</td>
                <td className="text-right">{fmtCurrency(d.receitaMetaAds)}</td>
              </tr>
              <tr>
                <td className="py-1 pl-4">Público quente</td>
                <td className="text-right">{pctPontos(entradas.pctMetaQuente ?? 0)}</td>
                <td className="text-right">{fmtCurrency(d.margemMetaQuente)}</td>
                <td className="text-right">{fmtCurrency(d.receitaMetaQuente)}</td>
              </tr>
              <tr>
                <td className="py-1 pl-4">Público frio</td>
                <td className="text-right">{pctPontos(d.pctMetaFrio)}</td>
                <td className="text-right">{fmtCurrency(d.margemMetaFrio)}</td>
                <td className="text-right">{fmtCurrency(d.receitaMetaFrio)}</td>
              </tr>
              <tr className="font-medium">
                <td className="py-1">Google Ads</td>
                <td className="text-right">{pctPontos(d.pctInvestGoogle)}</td>
                <td className="text-right">{fmtCurrency(d.margemGoogleAds)}</td>
                <td className="text-right">{fmtCurrency(d.receitaGoogleAds)}</td>
              </tr>
              <tr>
                <td className="py-1 pl-4">Público quente</td>
                <td className="text-right">{pctPontos(entradas.pctGoogleQuente ?? 0)}</td>
                <td className="text-right">{fmtCurrency(d.margemGoogleQuente)}</td>
                <td className="text-right">{fmtCurrency(d.receitaGoogleQuente)}</td>
              </tr>
              <tr>
                <td className="py-1 pl-4">Público frio</td>
                <td className="text-right">{pctPontos(d.pctGoogleFrio)}</td>
                <td className="text-right">{fmtCurrency(d.margemGoogleFrio)}</td>
                <td className="text-right">{fmtCurrency(d.receitaGoogleFrio)}</td>
              </tr>
              <tr className="font-semibold border-t">
                <td className="py-1">Leads pagos</td>
                <td className="text-right">100,00%</td>
                <td className="text-right">{fmtCurrency(d.metaMargemPagos)}</td>
                <td className="text-right">{fmtCurrency(d.receitaMetaPagosSoma)}</td>
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* 5. Metas financeiras — leads orgânicos */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Metas financeiras — leads orgânicos</CardTitle>
          <CardDescription>A meta de margem dos orgânicos é repartida por canal; os percentuais precisam fechar 100 %.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="text-left py-1">Canal</th>
                  <th className="text-right py-1 w-40">% da meta</th>
                  <th className="text-right py-1">Margem</th>
                  <th className="text-right py-1">Receita necessária</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {CANAIS.map((c) => (
                  <tr key={c.chave}>
                    <td className="py-1">{c.rotulo}</td>
                    <td className="text-right py-1">
                      <div className="ml-auto w-36">{campo(c.pct, "", `% da meta — ${c.rotulo}`)}</div>
                    </td>
                    <td className="text-right">{fmtCurrency(d.canais[c.chave].margem)}</td>
                    <td className="text-right">{fmtCurrency(d.canais[c.chave].receita)}</td>
                  </tr>
                ))}
                <tr className="font-semibold border-t">
                  <td className="py-1">Leads orgânicos</td>
                  <td className="text-right">{pctPontos(d.pctCheckOrganicos)}</td>
                  <td className="text-right">{fmtCurrency(d.metaMargemOrganicos)}</td>
                  <td className="text-right">{fmtCurrency(d.receitaMetaOrganicosSoma)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p role="status" className={`text-sm font-medium ${corDoStatus}`}>
            {d.statusOrganicos.texto}
          </p>
        </CardContent>
      </Card>

      {/* 6. Bases */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Bases</CardTitle>
          <CardDescription>Tamanho da audiência de cada canal orgânico — alimenta os leads esperados por campanha nos cenários.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {CANAIS.map((c) => (
            <div key={c.chave}>{campo(c.base, `Base ${c.rotulo}`)}</div>
          ))}
          <Derivado rotulo="Total das bases" valor={fmtInt(CANAIS.reduce((s, c) => s + (entradas[c.base] ?? 0), 0))} />
        </CardContent>
      </Card>
    </div>
  );
}
