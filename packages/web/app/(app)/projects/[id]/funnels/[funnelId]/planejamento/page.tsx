"use client";

import { useEffect, useState } from "react";
import { useQueries } from "@tanstack/react-query";
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
import { useApiClient } from "@/lib/hooks/use-api-client";
import { planejamentoInputsQueryKey, type PlanejamentoInputsResponse } from "@/lib/hooks/use-planejamento-inputs";
import { planejamentoOrganicosQueryKey, type PlanejamentoOrganicosResponse } from "@/lib/hooks/use-planejamento-organicos";
import { planejamentoPagosQueryKey, type PlanejamentoPagosResponse } from "@/lib/hooks/use-planejamento-pagos";
import type { BuyersOrigin } from "@/lib/hooks/use-sales-journey";
import type { StageSalesData } from "@loyola-x/shared";
import {
  baseTemSimulador,
  fraseSemBase,
  montarReferencia,
  rotuloDaOpcaoDeBase,
  textoDoCabecalhoDasBases,
} from "@/lib/utils/planejamento-referencia"; // Story 48.13
import {
  etapaEscolhidaDaBase,
  etapasDeVendas,
  montarRealizado,
  type RealizadoDaApi,
} from "@/lib/utils/planejamento-realizado"; // Story 48.11
import {
  alternarBase,
  basesMarcadasNaOrdemDaLista,
  escolherEtapaDaBase,
  linhasDaDeclaracao,
  type ReferenciaDeBase,
} from "@/lib/utils/planejamento-bases"; // Story 48.14

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
  // lido pelas quatro abas. Os dados vêm das MESMAS rotas da aba, só que com o
  // funnelId do outro funil — nada novo a manter.
  //
  // Story 48.14 — VÁRIAS bases lado a lado (decisão 2 = (a) do Danilo). A lista
  // marcada é só leitura (AC6): não toca no formulário nem no "alterações não
  // salvas". A ordem em toda a tela é a da lista de `/bases`, não a da marcação.
  const [basesIds, setBasesIds] = useState<string[]>([]);
  const bases = usePlanejamentoBases(params.id, params.funnelId);
  const marcadas = basesMarcadasNaOrdemDaLista(bases.data?.bases ?? [], basesIds);
  const apiClient = useApiClient();
  const pid = params.id;

  // As leituras são feitas POR BASE MARCADA (AC7) — `useQueries`, porque hook
  // dentro de laço quebra a regra dos hooks. Cada entrada usa a MESMA
  // `queryKey`/rota do hook de uma base só (citado ao lado), para o cache valer
  // entre as duas formas; desmarcar uma base tira a entrada dela do array sem
  // mudar a chave das outras, então nada é lido de novo.
  //
  // Story 48.13 — base SEM Planejamento salvo: as três leituras do simulador
  // nem são pedidas (um simulador que não existe não vira `base:`).
  const comSimulador = marcadas.filter((b) => baseTemSimulador(b));
  const inputsQ = useQueries({
    queries: comSimulador.map((b) => ({
      queryKey: planejamentoInputsQueryKey(pid, b.funnelId), // = usePlanejamentoInputs
      queryFn: () => apiClient<PlanejamentoInputsResponse>(`/api/projects/${pid}/funnels/${b.funnelId}/planejamento/inputs`),
    })),
  });
  const organicosQ = useQueries({
    queries: comSimulador.map((b) => ({
      queryKey: planejamentoOrganicosQueryKey(pid, b.funnelId), // = usePlanejamentoOrganicos
      queryFn: () => apiClient<PlanejamentoOrganicosResponse>(`/api/projects/${pid}/funnels/${b.funnelId}/planejamento/organicos`),
    })),
  });
  const pagosQ = useQueries({
    queries: comSimulador.map((b) => ({
      queryKey: planejamentoPagosQueryKey(pid, b.funnelId), // = usePlanejamentoPagos
      queryFn: () => apiClient<PlanejamentoPagosResponse>(`/api/projects/${pid}/funnels/${b.funnelId}/planejamento/pagos`),
    })),
  });

  // Story 48.11 — a camada B: o que cada base ENTREGOU. O investimento Meta
  // (rota `/realizado`), o ticket médio e a conversão por canal (rotas de ETAPA
  // que já existem — os mesmos números do dashboard, não uma segunda conta).
  const realizadoQ = useQueries({
    queries: marcadas.map((b) => ({
      queryKey: ["planejamento-realizado", pid, b.funnelId], // = usePlanejamentoRealizado
      queryFn: () => apiClient<RealizadoDaApi>(`/api/projects/${pid}/funnels/${b.funnelId}/planejamento/realizado`),
      // Numa API ainda sem a rota, o 404 é resposta definitiva (48.11 AC9).
      retry: false,
      staleTime: 5 * 60 * 1000,
    })),
  });

  // Story 48.14 (AC3) — a "Etapa de vendas da base" é POR BASE: um mapa
  // funnelId → stageId. Sem escolha (ou escolha que não é etapa de vendas
  // daquela base), vale o padrão — a etapa que não é downsell.
  const [etapaPorBase, setEtapaPorBase] = useState<Record<string, string>>({});
  const etapasDasBases = marcadas.map((b, i) => etapaEscolhidaDaBase(realizadoQ[i]?.data?.etapas, etapaPorBase[b.funnelId]));

  const vendasQ = useQueries({
    queries: marcadas.map((b, i) => {
      const etapa = etapasDasBases[i];
      return {
        // = useStageSalesData(pid, funnelId, stageId, "main_product,tmb") — `days` ausente.
        queryKey: ["stage-sales-data", pid, b.funnelId, etapa?.id ?? null, "main_product,tmb", undefined],
        queryFn: () =>
          apiClient<StageSalesData>(
            `/api/projects/${pid}/funnels/${b.funnelId}/stages/${etapa?.id ?? ""}/sales-data?${new URLSearchParams({ subtype: "main_product,tmb", debug: "1" })}`,
          ),
        enabled: !!etapa,
        staleTime: 30 * 1000,
      };
    }),
  });
  // `buyers-origin` responde 403 a guest — pedir assim mesmo seria um erro
  // garantido no console a cada visita. Sem ela, o guest perde só a conversão
  // por canal; investimento e ticket médio continuam (aquelas rotas deixam o
  // convidado membro do projeto ler).
  const podeLerOrigem = role !== null && role !== "guest";
  const origemQ = useQueries({
    queries: marcadas.map((b, i) => {
      const etapa = etapasDasBases[i];
      return {
        queryKey: ["buyers-origin", pid, b.funnelId, etapa?.id ?? "", null], // = useBuyersOrigin
        queryFn: () => apiClient<BuyersOrigin>(`/api/projects/${pid}/funnels/${b.funnelId}/stages/${etapa?.id ?? ""}/buyers-origin`),
        enabled: !!etapa && podeLerOrigem,
        staleTime: 5 * 60 * 1000,
      };
    }),
  });

  const referencias: ReferenciaDeBase[] = marcadas.map((b, i) => {
    const iSim = comSimulador.indexOf(b);
    const leituras = {
      inputs: iSim >= 0 ? (inputsQ[iSim]?.data?.inputs ?? null) : null,
      organicos: iSim >= 0 ? (organicosQ[iSim]?.data ?? null) : null,
      pagos: iSim >= 0 ? (pagosQ[iSim]?.data ?? null) : null,
    };
    const origem = origemQ[i]?.data?.analiseDeOrigem;
    return {
      funnelId: b.funnelId,
      nome: b.nome,
      referencia: montarReferencia(b, leituras) ?? { nome: b.nome, ...leituras },
      realizado: montarRealizado({
        api: realizadoQ[i]?.data,
        etapaEscolhida: etapasDasBases[i],
        ticketMedioBruto: vendasQ[i]?.data?.ticketMedioBruto ?? null,
        fontesOrganicas: origem?.fontesOrganicas,
        fontesPagasPorTemperatura: origem?.fontesPagasPorTemperatura,
      }),
      lendoRealizado: realizadoQ[i]?.isPending ?? true,
    };
  });
  const linhasDoRealizado = linhasDaDeclaracao(referencias);

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
            <span className="text-xs text-muted-foreground">{fraseSemBase(bases.data)}</span>
          ) : (
            <>
              {/* Story 48.14 (AC1) — uma caixa por base, na ordem da lista. */}
              <fieldset aria-label="Selecionar campanhas anteriores" className="flex items-center gap-x-3 gap-y-1 flex-wrap">
                {bases.data.bases.map((b) => (
                  <label key={b.funnelId} className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={basesIds.includes(b.funnelId)}
                      onChange={() => setBasesIds((ids) => alternarBase(ids, b.funnelId))}
                      className="h-3.5 w-3.5 accent-emerald-600"
                    />
                    {rotuloDaOpcaoDeBase(b)}
                  </label>
                ))}
              </fieldset>
              {/* Story 48.14 (AC3) — o seletor da etapa de vendas é por base,
                  e só aparece para a base com mais de uma etapa `sales`. */}
              {marcadas.map((b, i) => {
                const vendas = etapasDeVendas(realizadoQ[i]?.data?.etapas);
                if (vendas.length <= 1) return null;
                return (
                  <select
                    key={b.funnelId}
                    aria-label={`Etapa de vendas da base ${b.nome}`}
                    value={etapasDasBases[i]?.id ?? ""}
                    onChange={(ev) => setEtapaPorBase((m) => escolherEtapaDaBase(m, b.funnelId, ev.target.value))}
                    className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                  >
                    {vendas.map((e) => (
                      <option key={e.id} value={e.id}>
                        {b.nome} · etapa de vendas: {e.nome}
                      </option>
                    ))}
                  </select>
                );
              })}
              <span className="text-xs text-muted-foreground">{textoDoCabecalhoDasBases(referencias.map((r) => r.referencia))}</span>
            </>
          )}
          {/* Story 48.11 (AC8) — o que o `real:` cobre e o que ele NÃO cobre.
              Um número sem procedência ao lado de um campo é pior que nenhum:
              o gestor não tem como saber que o 100 % do Meta é ausência de
              Google, e não medição. Story 48.14 (AC4) — uma linha por base,
              começando pelo nome; a falha de uma fica só na linha dela. */}
          {linhasDoRealizado.map((l) => (
            <p key={l.funnelId} className="basis-full text-xs text-muted-foreground">
              <strong>{l.nome}</strong>
              {l.avisoSemSimulador && <> · {l.avisoSemSimulador}</>} · <strong>real:</strong> {l.texto}
            </p>
          ))}
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
          <PlanejamentoInputsFinanceiros projectId={params.id} funnelId={params.funnelId} podeEditar={role !== null && role !== "guest"} bases={referencias} />
        </TabsContent>
        <TabsContent value="organicos" className="mt-4">
          <PlanejamentoLeadsOrganicos
            projectId={params.id}
            funnelId={params.funnelId}
            podeEditar={role !== null && role !== "guest"}
            irParaInputs={() => trocarAba("inputs")}
            bases={referencias}
          />
        </TabsContent>
        <TabsContent value="pagos" className="mt-4">
          <PlanejamentoLeadsPagos
            projectId={params.id}
            funnelId={params.funnelId}
            podeEditar={role !== null && role !== "guest"}
            irParaInputs={() => trocarAba("inputs")}
            bases={referencias}
          />
        </TabsContent>
        <TabsContent value="resumo" className="mt-4">
          <PlanejamentoResumoFinal projectId={params.id} funnelId={params.funnelId} podeEditar={role !== null && role !== "guest"} irParaAba={trocarAba} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
