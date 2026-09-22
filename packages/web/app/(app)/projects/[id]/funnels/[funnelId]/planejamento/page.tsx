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

// Story 48.1 — sub-página "Planejamento" do funil de LANÇAMENTO (Epic 48).
//
// Sub-página + cartão na página do funil, no molde do Log de Campanha (decisão
// A6 do @architect / PO-02 do Danilo): a página do funil não tem abas; a da
// etapa tem. Aqui as quatro abas do simulador vivem em `?tab=` com `value`s
// fixos — regra não-negociável do Epic 46: o `value` é contrato de URL.
//
// A 48.1 entregou `inputs`; a 48.3 liga `organicos`. As outras aparecem
// desabilitadas até as stories 48.4 (pagos) e 48.5 (resumo).

/** Contrato de URL (Epic 46): nunca renomear. */
const ABAS = [
  { value: "inputs", rotulo: "Inputs Financeiros", pronta: true },
  { value: "organicos", rotulo: "Leads Orgânicos", pronta: true }, // Story 48.3
  { value: "pagos", rotulo: "Leads Pagos", pronta: false },
  { value: "resumo", rotulo: "Resumo Final", pronta: false },
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

  if (funnelData.funnelType !== "launch") {
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

      <Tabs value={aba} onValueChange={trocarAba}>
        <TabsList>
          {ABAS.map((a) => (
            <TabsTrigger key={a.value} value={a.value} disabled={!a.pronta} title={a.pronta ? undefined : "Em breve"}>
              {a.rotulo}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="inputs" className="mt-4">
          <PlanejamentoInputsFinanceiros projectId={params.id} funnelId={params.funnelId} podeEditar={role !== null && role !== "guest"} />
        </TabsContent>
        <TabsContent value="organicos" className="mt-4">
          <PlanejamentoLeadsOrganicos
            projectId={params.id}
            funnelId={params.funnelId}
            podeEditar={role !== null && role !== "guest"}
            irParaInputs={() => trocarAba("inputs")}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
