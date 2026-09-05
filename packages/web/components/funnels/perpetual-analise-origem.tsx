"use client";

/**
 * Seção "Análise detalhada de origem" do Perpétuo — Story 29.68.
 *
 * Gêmea da [18.77] (Lançamento): mesma classificação (`classifyOrigem`,
 * `classifyCanal`, `classifyTemperatura`), quatro blocos, mesma leitura.
 *
 * **O que muda é o denominador.** No Lançamento a taxa é lead → venda; aqui não
 * há planilha de leads que o dashboard consuma, e o gestor decidiu
 * (2026-09-03): o denominador é **cliques no link** — a mesma `Tx Conversão` da
 * tabela de Detalhamento, para que dois números com o mesmo nome na mesma tela
 * batam.
 *
 * A consequência é uma assimetria que a tela precisa declarar: **o clique só
 * existe para tráfego pago**. Nos blocos orgânicos não há taxa, e isso é dito
 * com todas as letras — `0%` ali acusaria o canal orgânico de não converter.
 */

import { TrendingUp, Thermometer, Leaf, Megaphone, Info } from "lucide-react";
import { fmtCurrency, fmtInt, fmtPercent } from "@/lib/utils/format-number";
// O tipo vive no shared: a rota e a tela leem a MESMA definição, e um campo
// novo no backend passa a ser erro de compilação aqui em vez de sumir calado.
import type { LinhaDeOrigemPerpetuo, PerpetualSalesData } from "@loyola-x/shared";

type AnaliseDeOrigemPerpetuo = NonNullable<PerpetualSalesData["analiseDeOrigem"]>;

/** Blocos em que a taxa é computável: o clique só existe no tráfego pago. */
const TEM_DENOMINADOR = new Set(["porTipo", "fontesPagas"]);
/** E dentro de `porTipo`, só a linha "Pago". */
const LINHAS_PAGAS = new Set(["Pago", "Meta Ads", "Google Ads", "TikTok Ads"]);

function Bloco({
  titulo,
  icone: Icone,
  campo,
  linhas,
  a,
  faturamentoTotal,
}: {
  titulo: string;
  icone: typeof TrendingUp;
  campo: string;
  linhas: LinhaDeOrigemPerpetuo[];
  a: AnaliseDeOrigemPerpetuo;
  faturamentoTotal: number;
}) {
  const podeTaxa = TEM_DENOMINADOR.has(campo) && a.cliquesNoLink != null && a.cliquesNoLink > 0;

  return (
    <div className="rounded-xl border border-border/40 bg-card/40 p-4">
      <div className="mb-1 flex items-center gap-2">
        <Icone className="h-3.5 w-3.5 text-muted-foreground" />
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {titulo}
        </h4>
      </div>
      {/* AC2 — cada bloco declara o PRÓPRIO denominador. Dois blocos com
          denominadores diferentes lado a lado são lidos como comparáveis, e
          não são. */}
      {/*
        Gate @qa (QA-02) — Story 29.68, AC5.

        O AC pedia "a mesma base" que o donut "Públicos quente e frio". Não é o
        que acontece, e mudar a base DESTE bloco seria pior: 2a, 2c e 2d contam
        compradores, e trocar só o 2b para checkouts deixaria a seção
        contradizendo a si mesma.

        Medido em produção (2026-09-05): bloco 148 × donut 171 no bbe-fc1-a1,
        342 × 439 no pps1 (28%). A CLASSIFICAÇÃO não diverge — 0 de 2.093
        compradores caem em quente/frio aqui sem cair lá. O que difere é a
        unidade: comprador dedupado por e-mail aqui, checkout de captação lá.

        Então a diferença é DECLARADA. Dois números de quente/frio na mesma
        tela, com 28% de distância e sem explicação, é o que o AC5 existe para
        impedir — e dizer qual é qual resolve isso sem quebrar a seção.
      */}
      {campo === "porTemperatura" && (
        <p className="mb-2 text-[11px] leading-tight text-amber-600 dark:text-amber-400">
          Conta <strong>compradores</strong> (e-mails distintos), como o resto
          desta seção. O card &quot;Públicos quente e frio&quot; acima conta{" "}
          <strong>checkouts de captação</strong> — os dois números são certos e
          não batem.
        </p>
      )}
      <p className="mb-2 text-[11px] leading-tight text-muted-foreground">
        {podeTaxa
          ? `Tx = compradores ÷ ${fmtInt(a.cliquesNoLink)} cliques no link${
              a.janelaDoDenominador
                ? ` (${a.janelaDoDenominador.since} a ${a.janelaDoDenominador.until})`
                : ""
            }`
          : TEM_DENOMINADOR.has(campo)
            ? "Sem cliques no link no período — a taxa não é computável, então o bloco mostra o que tem."
            : "Sem taxa: o clique no link só existe para tráfego pago."}
      </p>

      {linhas.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">
          Nenhuma venda deste tipo no período.
        </p>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/40 text-[10px] uppercase tracking-wide text-muted-foreground">
              <th className="pb-1.5 text-left font-medium">Origem</th>
              <th className="pb-1.5 text-right font-medium">Compradores</th>
              <th className="pb-1.5 text-right font-medium">Faturamento</th>
              <th className="pb-1.5 text-right font-medium">AOV</th>
              <th className="pb-1.5 text-right font-medium">{podeTaxa ? "Tx" : "% do fat."}</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => {
              const amostraBaixa = l.compradores < a.pisoDeAmostra;
              const taxa =
                podeTaxa && LINHAS_PAGAS.has(l.nome)
                  ? (l.compradores / a.cliquesNoLink!) * 100
                  : null;
              const participacao =
                faturamentoTotal > 0 ? (l.faturamentoBruto / faturamentoTotal) * 100 : null;
              return (
                <tr key={l.nome} className="border-b border-border/20 last:border-0">
                  <td className="py-1.5 pr-2">{l.nome}</td>
                  <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                    {fmtInt(l.compradores)}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">
                    {fmtCurrency(l.faturamentoBruto)}
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                    {fmtCurrency(l.aov)}
                  </td>
                  <td
                    className={
                      amostraBaixa
                        ? "py-1.5 text-right tabular-nums text-muted-foreground"
                        : "py-1.5 text-right font-semibold tabular-nums"
                    }
                    // AC7 — a linha aparece, mas marcada: 2 compradores não é
                    // "a origem que mais converte" no mesmo sentido que 400.
                    title={
                      amostraBaixa
                        ? `Amostra baixa: ${fmtInt(l.compradores)} compradores (piso de ${a.pisoDeAmostra}).`
                        : undefined
                    }
                  >
                    {taxa != null ? fmtPercent(taxa) : fmtPercent(participacao)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function PerpetualAnaliseOrigem({
  analise,
  faturamentoTotal,
}: {
  analise: AnaliseDeOrigemPerpetuo | undefined;
  faturamentoTotal: number;
}) {
  if (!analise) return null;
  const vazio =
    analise.porTipo.length === 0 &&
    analise.porTemperatura.length === 0 &&
    analise.fontesPagas.length === 0;
  if (vazio) return null;

  return (
    <div className="space-y-3 pt-2">
      <div>
        <h3 className="text-sm font-semibold">Análise detalhada de origem</h3>
        <p className="text-xs text-muted-foreground">
          De onde vêm os compradores, e a que taxa cada origem paga converte.
        </p>
      </div>

      {/* AC3 — onde a taxa não é computável, a seção diz o motivo em vez de
          sumir ou mostrar 0%. */}
      {analise.cliquesNoLink == null && (
        <div className="flex items-start gap-2 rounded-lg border border-dashed border-border/50 px-4 py-2.5">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Sem denominador de cliques no link para este período — pode ser
            campanha não vinculada, cache da Meta ainda sem o dado, ou período
            sem recorte de datas. Os blocos mostram compradores, faturamento e
            AOV; a taxa fica de fora em vez de aparecer como 0%.
          </p>
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        <Bloco
          titulo="Por tipo"
          icone={TrendingUp}
          campo="porTipo"
          linhas={analise.porTipo}
          a={analise}
          faturamentoTotal={faturamentoTotal}
        />
        <Bloco
          titulo="Por temperatura"
          icone={Thermometer}
          campo="porTemperatura"
          linhas={analise.porTemperatura}
          a={analise}
          faturamentoTotal={faturamentoTotal}
        />
        <Bloco
          titulo="Fontes orgânicas"
          icone={Leaf}
          campo="fontesOrganicas"
          linhas={analise.fontesOrganicas}
          a={analise}
          faturamentoTotal={faturamentoTotal}
        />
        <Bloco
          titulo="Fontes pagas"
          icone={Megaphone}
          campo="fontesPagas"
          linhas={analise.fontesPagas}
          a={analise}
          faturamentoTotal={faturamentoTotal}
        />
      </div>
    </div>
  );
}
