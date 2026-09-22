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
import { usePlanejamentoRealizado } from "@/lib/hooks/use-planejamento-realizado"; // Story 48.11
import { useStageSalesData } from "@/lib/hooks/use-stage-sales-data";
import { useBuyersOrigin } from "@/lib/hooks/use-sales-journey";
import {
  etapaDeVendasPadrao,
  etapasDeVendas,
  montarRealizado,
  type EtapaDaBase,
  type RealizadoDaBase,
} from "@/lib/utils/planejamento-realizado";
import { fmtPercent } from "@/lib/utils/format-number";

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

  // Story 48.11 — a camada B: o que a base ENTREGOU.
  //
  // Três leituras, todas do funil da BASE: o investimento Meta (rota nova), o
  // ticket médio e a conversão por canal (rotas de ETAPA que já existem — os
  // mesmos números do dashboard, não uma segunda conta).
  const baseRealizado = usePlanejamentoRealizado(baseId ? params.id : null, baseId);
  const vendasDaBase = etapasDeVendas(baseRealizado.data?.etapas);
  const [etapaDeVendasId, setEtapaDeVendasId] = useState<string | null>(null);
  // A escolha padrão segue a base: trocar de lançamento não pode deixar para
  // trás o `stageId` do anterior.
  useEffect(() => {
    setEtapaDeVendasId(etapaDeVendasPadrao(baseRealizado.data?.etapas)?.id ?? null);
  }, [baseRealizado.data]);
  const etapaEscolhida: EtapaDaBase | null = vendasDaBase.find((e) => e.id === etapaDeVendasId) ?? null;

  const vendasDaEtapa = useStageSalesData(
    etapaEscolhida ? params.id : null,
    etapaEscolhida ? baseId : null,
    etapaEscolhida?.id ?? null,
    "main_product,tmb",
  );
  // `buyers-origin` responde 403 a guest — pedir assim mesmo seria um erro
  // garantido no console a cada visita. Sem ela, o guest perde só a conversão
  // por canal; investimento e ticket médio continuam (aquelas rotas deixam o
  // convidado membro do projeto ler).
  const origemDaEtapa = useBuyersOrigin(
    params.id,
    baseId ?? "",
    etapaEscolhida?.id ?? "",
    undefined,
    !!baseId && !!etapaEscolhida && role !== null && role !== "guest",
  );

  const realizado: RealizadoDaBase | null = baseEscolhida
    ? montarRealizado({
        api: baseRealizado.data,
        etapaEscolhida,
        ticketMedioBruto: vendasDaEtapa.data?.ticketMedioBruto ?? null,
        fontesOrganicas: origemDaEtapa.data?.analiseDeOrigem?.fontesOrganicas,
        fontesPagasPorTemperatura: origemDaEtapa.data?.analiseDeOrigem?.fontesPagasPorTemperatura,
      })
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
              {vendasDaBase.length > 1 && (
                <select
                  aria-label="Etapa de vendas da base"
                  value={etapaDeVendasId ?? ""}
                  onChange={(ev) => setEtapaDeVendasId(ev.target.value === "" ? null : ev.target.value)}
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                >
                  {vendasDaBase.map((e) => (
                    <option key={e.id} value={e.id}>
                      Etapa de vendas: {e.nome}
                    </option>
                  ))}
                </select>
              )}
              <span className="text-xs text-muted-foreground">
                {referencia
                  ? "Os valores desse lançamento aparecem entre parênteses ao lado de cada campo — só como parâmetro; nada é preenchido nem salvo."
                  : "Escolha um lançamento anterior do mesmo tipo para ver os valores dele ao lado de cada campo."}
              </span>
            </>
          )}
          {/* Story 48.11 (AC8) — o que o `real:` cobre e o que ele NÃO cobre.
              Um número sem procedência ao lado de um campo é pior que nenhum:
              o gestor não tem como saber que o 100 % do Meta é ausência de
              Google, e não medição. */}
          {realizado && !baseRealizado.isPending && <DeclaracaoDoRealizado realizado={realizado} />}
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
          <PlanejamentoInputsFinanceiros projectId={params.id} funnelId={params.funnelId} podeEditar={role !== null && role !== "guest"} referencia={referencia} realizado={realizado} />
        </TabsContent>
        <TabsContent value="organicos" className="mt-4">
          <PlanejamentoLeadsOrganicos
            projectId={params.id}
            funnelId={params.funnelId}
            podeEditar={role !== null && role !== "guest"}
            irParaInputs={() => trocarAba("inputs")}
            referencia={referencia}
            realizado={realizado}
          />
        </TabsContent>
        <TabsContent value="pagos" className="mt-4">
          <PlanejamentoLeadsPagos
            projectId={params.id}
            funnelId={params.funnelId}
            podeEditar={role !== null && role !== "guest"}
            irParaInputs={() => trocarAba("inputs")}
            referencia={referencia}
            realizado={realizado}
          />
        </TabsContent>
        <TabsContent value="resumo" className="mt-4">
          <PlanejamentoResumoFinal projectId={params.id} funnelId={params.funnelId} podeEditar={role !== null && role !== "guest"} irParaAba={trocarAba} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/**
 * Story 48.11 (AC8) — a procedência do `real:`, em uma linha.
 *
 * Declara: a janela do gasto, quantas campanhas entraram, que o 0 % do Google
 * é ausência de lançamento (não medição), qual etapa de vendas alimentou o
 * ticket e a conversão, e quanto dos leads orgânicos ficou fora dos cinco
 * canais nomeados.
 */
function DeclaracaoDoRealizado({ realizado }: { realizado: RealizadoDaBase }) {
  const inv = realizado.investimentoMeta;

  // Falha NÃO é ausência: sem resposta, a tela diz que não conseguiu ler, em
  // vez de afirmar que o lançamento não tem etapa de vendas nem campanha.
  if (!realizado.temResposta) {
    return (
      <p className="basis-full text-xs text-muted-foreground">
        <strong>real:</strong> os valores realizados desse lançamento não puderam ser lidos agora — a API pode ainda não ter
        essa rota. Os valores <strong>planejados</strong> (base) seguem válidos.
      </p>
    );
  }

  const partes: string[] = [];

  if (inv && inv.campanhasComSpend > 0) {
    const janela = inv.janela.de && inv.janela.ate ? ` entre ${inv.janela.de} e ${inv.janela.ate}` : "";
    partes.push(`investimento de ${inv.campanhasComSpend} de ${inv.campanhasVinculadas} campanhas${janela}`);
    if (inv.indefinido > 0) {
      partes.push(
        `${fmtPercent((inv.indefinido / inv.total) * 100)} do gasto está em campanha sem quente/frio no nome e fica fora do "% em público quente"`,
      );
    }
  } else if (inv) {
    partes.push("nenhuma campanha com gasto registrado nesse lançamento");
  }

  if (realizado.googleCampanhasVinculadas > 0) {
    partes.push(
      `${realizado.googleCampanhasVinculadas} campanha(s) do Google vinculada(s) e sem insights no sistema — a divisão Meta/Google não pode ser medida`,
    );
  } else if (!realizado.googleTemFonte) {
    partes.push("Google aparece como 0 % por não haver campanha do Google vinculada — não é medição");
  }

  if (realizado.etapaDeVendas) {
    // O subtype pedido é `main_product,tmb`: o ticket médio traz o produto
    // principal COM order bump. Dizer isso evita o gestor comparar com um
    // ticket de produto puro e concluir que a medição está alta.
    partes.push(
      `ticket médio (produto principal + order bump) e conversão vêm da etapa "${realizado.etapaDeVendas.nome}"`,
    );
  } else {
    partes.push("esse lançamento não tem etapa de vendas — sem ticket médio nem conversão realizada");
  }

  const fora = realizado.foraDoMapeamento;
  if (fora.fracao !== null && fora.leads > 0) {
    partes.push(
      `${fmtPercent(fora.fracao * 100)} dos leads orgânicos ficaram fora dos cinco canais nomeados (Closer, Outros, Sem Track)`,
    );
  }

  return (
    <p className="basis-full text-xs text-muted-foreground">
      <strong>real:</strong> {partes.join(" · ")}.
    </p>
  );
}
