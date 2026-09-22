"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Calculator } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useFunnel } from "@/lib/hooks/use-funnels";
import { useUserRole } from "@/lib/hooks/use-user-role";
import { PlanejamentoInputsFinanceiros } from "@/components/funnels/planejamento-inputs-financeiros";
import { PlanejamentoLeadsOrganicos } from "@/components/funnels/planejamento-leads-organicos"; // Story 48.3
import { PlanejamentoLeadsPagos } from "@/components/funnels/planejamento-leads-pagos"; // Story 48.4
import { PlanejamentoResumoFinal } from "@/components/funnels/planejamento-resumo-final"; // Story 48.5
import { temPainelDePlanejamento } from "@/lib/utils/planejamento-entrada"; // Story 48.7
import { usePlanejamentoBases } from "@/lib/hooks/use-planejamento-bases"; // Story 48.9
import { usePlanejamentoInputs } from "@/lib/hooks/use-planejamento-inputs";
import { usePlanejamentoOrganicos } from "@/lib/hooks/use-planejamento-organicos";
import { usePlanejamentoPagos } from "@/lib/hooks/use-planejamento-pagos";
import type { BaseDeReferencia } from "@/lib/utils/planejamento-referencia";

// Story 48.1 — sub-página "Planejamento" do funil de LANÇAMENTO (Epic 48).
//
// Sub-página + cartão na página do funil, no molde do Log de Campanha (decisão
// A6 do @architect / PO-02 do Danilo): a página do funil não tem abas; a da
// etapa tem. Aqui as quatro abas do simulador vivem em `?tab=` com `value`s
// fixos — regra não-negociável do Epic 46: o `value` é contrato de URL.
//
// A 48.1 entregou `inputs`; a 48.3 ligou `organicos`; a 48.4 `pagos`; a 48.5
// liga `resumo` — as quatro abas do simulador estão no ar.

/** Contrato de URL (Epic 46): nunca renomear. */
const ABAS = [
  { value: "inputs", rotulo: "Inputs Financeiros", pronta: true },
  { value: "organicos", rotulo: "Leads Orgânicos", pronta: true }, // Story 48.3
  { value: "pagos", rotulo: "Leads Pagos", pronta: true }, // Story 48.4
  { value: "resumo", rotulo: "Resumo Final", pronta: true }, // Story 48.5
] as const;
type Aba = (typeof ABAS)[number]["value"];

function resolverAba(pedida: string | null): Aba {
  const aba = ABAS.find((a) => a.value === pedida && a.pronta);
  return aba ? aba.value : "inputs";
}

export default function PlanejamentoPage() {
  const params = useParams<{ id: string; funnelId: string }>();
  const { data: funnelData, isLoading } = useFunnel(params.id, params.funnelId);
  const role = useUserRole();

  // `?tab=` lido de `window.location` no efeito, não de `useSearchParams` —
  // mesmo mecanismo e mesmo motivo da página da etapa (Story 46.1).
  const [aba, setAba] = useState<Aba>("inputs");
  useEffect(() => {
    setAba(resolverAba(new URLSearchParams(window.location.search).get("tab")));
  }, [params.funnelId]);

  function trocarAba(value: string) {
    const nova = resolverAba(value);
    setAba(nova);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("tab", nova);
    window.history.replaceState(null, "", url);
  }

  // Story 48.9 — a BASE: um lançamento anterior do mesmo expert e mesmo tipo,
  // escolhido uma vez e lido pelas quatro abas. Os dados vêm das MESMAS rotas
  // da aba, só que com o funnelId do outro funil — nada novo a manter.
  const [baseId, setBaseId] = useState<string | null>(null);
  const bases = usePlanejamentoBases(params.id, params.funnelId);
  const baseEscolhida = bases.data?.bases.find((b) => b.funnelId === baseId) ?? null;
  const baseInputs = usePlanejamentoInputs(baseId ? params.id : null, baseId);
  const baseOrganicos = usePlanejamentoOrganicos(baseId ? params.id : null, baseId);
  const basePagos = usePlanejamentoPagos(baseId ? params.id : null, baseId);
  const referencia: BaseDeReferencia | null = baseEscolhida
    ? {
        nome: baseEscolhida.nome,
        inputs: baseInputs.data?.inputs ?? null,
        organicos: baseOrganicos.data ?? null,
        pagos: basePagos.data ?? null,
      }
    : null;

  const voltar = `/projects/${params.id}/funnels/${params.funnelId}`;

  if (isLoading || !funnelData) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-10 w-full max-w-lg" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!temPainelDePlanejamento(funnelData.funnelType)) {
    return (
      <div className="p-6 space-y-3">
        <Button variant="ghost" size="sm" className="-ml-2" asChild>
          <Link href={voltar}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            {funnelData.funnel.name}
          </Link>
        </Button>
        <p role="alert" className="text-sm text-muted-foreground">
          O Painel de Planejamento existe só para funis de <strong>lançamento</strong>. Este funil é{" "}
          {funnelData.funnelType === "perpetual" ? "perpétuo" : "mobile"}.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="min-w-0">
        <Button variant="ghost" size="sm" className="mb-1 -ml-2" asChild>
          <Link href={voltar}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            {funnelData.funnel.name}
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <Calculator className="h-5 w-5 text-emerald-600" />
          <h1 className="text-2xl font-bold">Planejamento</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Simulador de cenários do lançamento — metas, custos, investimento e, nas próximas abas, quantos leads captar e a que CPL máximo.
        </p>
      </div>

      {/* Story 48.9 — seletor da base. Fica acima das abas porque a escolha
          vale para as quatro; o que cada aba faz com ela é mostrar o valor
          entre parênteses no rótulo — nunca preencher sozinha. */}
      {bases.data && (
        <div className="flex items-center gap-2 flex-wrap rounded-md border border-border/50 bg-muted/30 px-3 py-2">
          <span className="text-sm font-medium">Base de referência</span>
          {bases.data.bases.length === 0 ? (
            <span className="text-xs text-muted-foreground">
              {bases.data.tipo === null
                ? "Sem histórico anterior — o nome deste funil não identifica o tipo de lançamento (pago, gratuito, meteórico ou presencial)."
                : "Sem histórico anterior — nenhum lançamento anterior do mesmo tipo tem o Planejamento preenchido."}
            </span>
          ) : (
            <>
              <select
                aria-label="Selecionar campanha anterior"
                value={baseId ?? ""}
                onChange={(ev) => setBaseId(ev.target.value === "" ? null : ev.target.value)}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs"
              >
                <option value="">Selecionar campanha anterior…</option>
                {bases.data.bases.map((b) => (
                  <option key={b.funnelId} value={b.funnelId}>
                    {b.nome} · {b.rotuloDoTipo}
                  </option>
                ))}
              </select>
              <span className="text-xs text-muted-foreground">
                {referencia
                  ? "Os valores desse lançamento aparecem entre parênteses ao lado de cada campo — só como parâmetro; nada é preenchido nem salvo."
                  : "Escolha um lançamento anterior do mesmo tipo para ver os valores dele ao lado de cada campo."}
              </span>
            </>
          )}
        </div>
      )}

      <Tabs value={aba} onValueChange={trocarAba}>
        <TabsList>
          {ABAS.map((a) => (
            <TabsTrigger key={a.value} value={a.value} disabled={!a.pronta} title={a.pronta ? undefined : "Em breve"}>
              {a.rotulo}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="inputs" className="mt-4">
          <PlanejamentoInputsFinanceiros projectId={params.id} funnelId={params.funnelId} podeEditar={role !== null && role !== "guest"} referencia={referencia} />
        </TabsContent>
        <TabsContent value="organicos" className="mt-4">
          <PlanejamentoLeadsOrganicos
            projectId={params.id}
            funnelId={params.funnelId}
            podeEditar={role !== null && role !== "guest"}
            irParaInputs={() => trocarAba("inputs")}
            referencia={referencia}
          />
        </TabsContent>
        <TabsContent value="pagos" className="mt-4">
          <PlanejamentoLeadsPagos
            projectId={params.id}
            funnelId={params.funnelId}
            podeEditar={role !== null && role !== "guest"}
            irParaInputs={() => trocarAba("inputs")}
            referencia={referencia}
          />
        </TabsContent>
        <TabsContent value="resumo" className="mt-4">
          <PlanejamentoResumoFinal projectId={params.id} funnelId={params.funnelId} podeEditar={role !== null && role !== "guest"} irParaAba={trocarAba} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
