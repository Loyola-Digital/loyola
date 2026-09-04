"use client";

/**
 * Seção "Análise detalhada de origem" — Story 18.77.
 *
 * Quatro blocos que respondem a mesma pergunta em cortes diferentes: **qual
 * origem converte**, não só qual traz volume.
 *
 * | Bloco | Corte |
 * |---|---|
 * | 2a Por tipo | Pago · Orgânico · Sem Track |
 * | 2b Por temperatura | Quente · Frio · Indefinido |
 * | 2c Fontes orgânicas | canais nomeados dentro de Orgânico |
 * | 2d Fontes pagas | canais nomeados dentro de Pago |
 *
 * Os blocos 2c e 2d são o motivo da story: até a 18.77 a API somava tudo por
 * BALDE antes de responder, e dentro de "Orgânico" cabiam Instagram, YouTube,
 * ManyChat, e-mail e WhatsApp. Medido no `dg-pg04` em 2026-09-04, o balde
 * inteiro convertia a 59,10% — e dentro dele os canais iam de **51,42%
 * (ManyChat) a 88,71% (E-mail)**. A diferença estava lá o tempo todo, somada.
 */

import { TrendingUp, Thermometer, Leaf, Megaphone, Info } from "lucide-react";
import type { BuyersOrigin, LinhaDeOrigem } from "@/lib/hooks/use-sales-journey";
import { fmtInt, fmtPercent } from "@/lib/utils/format-number";

const BLOCOS = [
  { key: "porTipo", titulo: "Por tipo", icone: TrendingUp, campo: "porTipo" },
  { key: "porTemperatura", titulo: "Por temperatura", icone: Thermometer, campo: "porTemperatura" },
  { key: "fontesOrganicas", titulo: "Fontes orgânicas", icone: Leaf, campo: "fontesOrganicas" },
  { key: "fontesPagas", titulo: "Fontes pagas", icone: Megaphone, campo: "fontesPagas" },
] as const;

function Bloco({
  titulo,
  icone: Icone,
  linhas,
  piso,
  total,
}: {
  titulo: string;
  icone: typeof TrendingUp;
  linhas: LinhaDeOrigem[];
  piso: number;
  total: { leads: number; compradores: number; taxa: number | null };
}) {
  return (
    <div className="rounded-xl border border-border/40 bg-card/40 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Icone className="h-3.5 w-3.5 text-muted-foreground" />
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {titulo}
        </h4>
      </div>

      {linhas.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">
          Nenhuma origem deste tipo no período.
        </p>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/40 text-[10px] uppercase tracking-wide text-muted-foreground">
              <th className="pb-1.5 text-left font-medium">Origem</th>
              <th className="pb-1.5 text-right font-medium">Leads</th>
              <th className="pb-1.5 text-right font-medium">Vendas</th>
              <th className="pb-1.5 text-right font-medium">Taxa</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.nome} className="border-b border-border/20 last:border-0">
                <td className="py-1.5 pr-2">{l.nome}</td>
                <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                  {fmtInt(l.leads)}
                </td>
                <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                  {fmtInt(l.compradores)}
                </td>
                <td className="py-1.5 text-right">
                  <span
                    className={
                      l.amostraBaixa
                        ? "tabular-nums text-muted-foreground"
                        : "font-semibold tabular-nums"
                    }
                    // Story 18.77 (AC6): a linha aparece, mas a marcação impede
                    // que "1 lead, 1 venda" seja lido como 100% de conversão ao
                    // lado de uma origem com 800 leads.
                    title={
                      l.amostraBaixa
                        ? `Amostra baixa: ${fmtInt(l.leads)} leads (piso de ${piso}). A taxa oscila muito com poucos casos.`
                        : undefined
                    }
                  >
                    {fmtPercent(l.taxa)}
                    {l.amostraBaixa && <span className="ml-1 text-[10px]">·</span>}
                  </span>
                </td>
              </tr>
            ))}
            {/* AC7 — a linha de total: o denominador do fechamento. */}
            <tr className="border-t border-border/60">
              <td className="pt-1.5 font-medium">Total da etapa</td>
              <td className="pt-1.5 text-right tabular-nums">{fmtInt(total.leads)}</td>
              <td className="pt-1.5 text-right tabular-nums">{fmtInt(total.compradores)}</td>
              <td className="pt-1.5 text-right font-semibold tabular-nums">
                {fmtPercent(total.taxa)}
              </td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}

export function AnaliseDeOrigem({
  data,
  denominadorDeOutraEtapa,
}: {
  data: BuyersOrigin | undefined;
  /**
   * Story 18.77 (AC9) — no Lançamento a venda e o lead não moram na mesma
   * etapa. Quando o denominador vem da captação, o bloco declara isso: sem a
   * frase, o leitor assume que os leads são da etapa que está vendo.
   */
  denominadorDeOutraEtapa?: string | null;
}) {
  const a = data?.analiseDeOrigem;
  if (!data || data.semDados || !a) return null;

  // AC3 — sem lead cruzável não há taxa a exibir. Mostrar 0% aqui seria
  // apresentar ausência de cruzamento como ausência de conversão.
  if (!a.cruzamentoPorPessoa) {
    return (
      <div className="space-y-3 pt-2">
        <h3 className="text-sm font-semibold">Análise detalhada de origem</h3>
        <div className="flex items-start gap-2 rounded-lg border border-dashed border-border/50 px-4 py-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="text-xs leading-relaxed text-muted-foreground">
            Não há planilha de leads conectada a este funil com coluna de e-mail, então
            não dá para cruzar comprador e lead pela mesma pessoa. As taxas por origem
            ficam de fora — comparar carimbos independentes daria um número com
            aparência de fato.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 pt-2">
      <div>
        <h3 className="text-sm font-semibold">Análise detalhada de origem</h3>
        <p className="text-xs text-muted-foreground">
          Taxa lead → venda por origem, cruzada por e-mail.{" "}
          {denominadorDeOutraEtapa
            ? `Os leads vêm da etapa ${denominadorDeOutraEtapa}.`
            : "Leads e vendas da mesma etapa."}
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {BLOCOS.map(({ key, titulo, icone, campo }) => (
          <Bloco
            key={key}
            titulo={titulo}
            icone={icone}
            linhas={a[campo]}
            piso={a.pisoDeAmostra}
            total={a.total}
          />
        ))}
      </div>
    </div>
  );
}
