"use client";

/**
 * Story 44.21 — o Panorama no topo da aba "Cadeia de CAC".
 *
 * ## Zero cálculo (AC8)
 *
 * Tudo chega pronto da Story 44.20. A única derivação local permitida é
 * **formatação** (R$, %, data), e a montagem da linha mora em
 * `lib/utils/panorama-view.ts` — que é onde os testes vivem, porque o runner do
 * `web` cobre só `lib/utils`, sem jsdom (Story 29.35).
 *
 * ## Índice, não segundo dashboard (AC3)
 *
 * Cinco colunas, sem gráfico, sem sparkline, sem card grande. O painel da etapa
 * já é denso; este bloco responde "em qual etapa eu mexo?" e sai da frente.
 */

import { AlertTriangle, Info } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { usePanorama } from "@/lib/hooks/use-panorama";
import {
  montarLinhasDoPanorama,
  montarPendencias,
  NOME_DA_METRICA,
  type LinhaDoPanorama,
} from "@/lib/utils/panorama-view";

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
const pct = (v: number) =>
  `${(v * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

/**
 * Story 45.1 — o colapso saiu daqui.
 *
 * A 44.21 tornou o bloco recolhível porque ele dividia a tela com a tabela da
 * Cadeia de CAC e obrigava a rolar por cima dele. Agora o Panorama é uma aba
 * própria: um botão que esconde a única coisa que a aba mostra não protege
 * ninguém de nada. Com ele saiu a chave `panorama-cac:aberto` do
 * `localStorage` — ela fica órfã nos navegadores de quem já usou, e NÃO deve
 * ser reaproveitada com outro sentido.
 */

function Linha({ l }: { l: LinhaDoPanorama }) {
  return (
    <tr
      className={`border-b last:border-0 ${l.ehAtual ? "bg-muted/40" : ""}`}
      aria-current={l.ehAtual ? "true" : undefined}
    >
      <td className="py-2 pr-4">
        <div className="flex items-center gap-1.5">
          {/* AC2: a etapa aberta é MARCADA, nunca removida da lista. */}
          {l.ehAtual && (
            <span
              className="rounded-sm bg-primary/15 px-1 py-0 text-[9px] font-medium uppercase tracking-wider text-primary"
              title="Etapa que você está vendo"
            >
              atual
            </span>
          )}
          <span className="font-medium">{l.stageName}</span>
        </div>
        <div className="text-xs text-muted-foreground">{l.funnelName}</div>
      </td>

      <td className="py-2 pr-4 whitespace-nowrap">
        {/* AC3: por GASTO medido, nunca por effectiveStatus. */}
        <span
          className="text-xs text-muted-foreground"
          title={
            l.noAr
              ? "Teve investimento nos últimos 7 dias (medido por gasto, não pelo status da campanha na Meta)"
              : "Sem investimento nos últimos 7 dias"
          }
        >
          {l.noAr ? "🟢 no ar" : "⚪ sem veiculação"}
        </span>
      </td>

      <td className="py-2 pr-4 tabular-nums whitespace-nowrap">
        <div>{brl(l.spendCurta)}</div>
        <div className="text-xs text-muted-foreground">{brl(l.spendLonga)}</div>
      </td>

      <td className="py-2 pr-4 tabular-nums whitespace-nowrap">
        {/* AC5: fora da aba mostra "—", com o motivo no tooltip. */}
        {l.rotuloDoResultado === null ? (
          <span className="text-muted-foreground" title={l.motivoForaDaAba ?? undefined}>
            —
          </span>
        ) : l.resultado !== null ? (
          <>
            <span className="text-xs text-muted-foreground">{l.rotuloDoResultado} </span>
            {brl(l.resultado)}
          </>
        ) : (
          <span className="text-muted-foreground" title={l.motivoDoResultado ?? undefined}>
            {l.rotuloDoResultado} —
          </span>
        )}
      </td>

      <td className="py-2 tabular-nums whitespace-nowrap">
        {l.gargalo === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <>
            <span className="text-xs text-muted-foreground">
              {NOME_DA_METRICA[l.gargalo.metrica] ?? l.gargalo.metrica}{" "}
            </span>
            {l.gargalo.queda !== null ? `−${pct(l.gargalo.queda)}` : "—"}
          </>
        )}
      </td>
    </tr>
  );
}

export function PanoramaDoProjeto({
  projectId,
  stageId,
}: {
  projectId: string;
  stageId: string;
}) {
  const { data, isLoading, error } = usePanorama(projectId);

  if (isLoading) return <Skeleton className="h-40 w-full" />;

  /**
   * ⚠️ AC7 — erro e ausência são FATOS DIFERENTES e não podem renderizar igual.
   * Três casos registrados no projeto tiveram a mesma causa: falha lida como
   * "sem dados". A falha vem primeiro, com a mensagem do erro.
   */
  if (error) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <span className="text-muted-foreground">
          Não foi possível carregar o panorama do expert: {(error as Error).message}
        </span>
      </div>
    );
  }
  if (!data) return null;

  const linhas = montarLinhasDoPanorama(data, stageId);
  const pendencias = montarPendencias(data);

  return (
    <div className="rounded-lg border">
      <div className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Panorama de {data.projectName}</span>
          <span className="text-xs text-muted-foreground">
            {data.totais.etapasNoAr} {data.totais.etapasNoAr === 1 ? "etapa" : "etapas"} no ar ·{" "}
            {brl(data.totais.spendCurta)} em {data.janelas.curta.dias} dias
          </span>
        </div>
      </div>

      <div className="border-t px-4 py-3">
          {linhas.length === 0 ? (
            /**
             * ⚠️ AC7 — afirmação, não tabela vazia. Isto NÃO é o estado de erro:
             * chegou resposta, e ela diz que não há etapa com campanha.
             */
            <p className="text-sm text-muted-foreground">
              Nenhuma etapa deste expert tem campanha vinculada.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Funil · Etapa</th>
                    <th className="pb-2 pr-4 font-medium">Estado</th>
                    <th className="pb-2 pr-4 font-medium">
                      Invest. {data.janelas.curta.dias}d · {data.janelas.longa.dias}d
                    </th>
                    <th className="pb-2 pr-4 font-medium">Resultado</th>
                    <th className="pb-2 font-medium">Gargalo</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l) => (
                    <Linha key={l.stageId} l={l} />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* AC4 — a mensagem que veio no payload, nunca uma reescrita. */}
          {pendencias.length > 0 && (
            <ul className="mt-3 space-y-1.5 border-t pt-3">
              {pendencias.map((p, i) => (
                <li key={`${p.stageId}-${p.codigo}-${i}`} className="flex items-start gap-2 text-xs">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-600" />
                  <span className="text-muted-foreground">
                    <span className="font-medium text-foreground">{p.stageName}</span>{" "}
                    {p.mensagem}
                    {/**
                     * ⚠️ AC4: os dois motivos derivados NÃO podem ser atribuídos
                     * ao backend. Quem procurar a frase deles no código da API
                     * não vai achar — ela nasce no panorama.
                     */}
                    {p.origem === "panorama" && (
                      <span className="ml-1 text-[10px] uppercase tracking-wider opacity-60">
                        (derivado do panorama)
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {/**
           * AC6 — as órfãs.
           *
           * ⚠️ `<OrphanCampaignsBanner>` foi avaliado e **não cabe**: ele busca
           * o próprio dado (`useOrphanCampaigns(projectId, funnelId)`), exige um
           * `funnelId` que o panorama não tem, e usa outra definição de órfã
           * (nome casando o `matchCode` do funil, Epic 25). A daqui é do payload
           * e é do PROJETO: gastou e não está em etapa nenhuma. Reusar traria a
           * definição errada junto.
           */}
          {data.campanhasOrfas.length > 0 && (
            <div className="mt-3 flex items-start gap-2 border-t pt-3 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-3 w-3 shrink-0" />
              <span>
                {data.campanhasOrfas.length}{" "}
                {data.campanhasOrfas.length === 1 ? "campanha gastou" : "campanhas gastaram"}{" "}
                {brl(data.totais.spendOrfas)} nos últimos{" "}
                {data.janelas.curta.dias} dias <strong>sem estar em nenhuma etapa</strong> — esse
                investimento não entra em nenhum CAC nem ROAS do painel:{" "}
                {data.campanhasOrfas.map((c) => c.campaignName ?? c.campaignId).join(" · ")}
              </span>
            </div>
          )}
      </div>
    </div>
  );
}
