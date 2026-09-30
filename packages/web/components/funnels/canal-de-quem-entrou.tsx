"use client";

/**
 * De onde veio quem entrou no grupo de WhatsApp da campanha.
 *
 * ## Por que existe
 *
 * O SendFlow sabe quem está no grupo (o número) e não sabe de onde a pessoa
 * veio. A planilha de captação sabe de onde cada lead veio (as UTMs) e não sabe
 * se ele entrou no grupo. O Loyola X guardava do grupo só o agregado — entraram
 * 879, saíram 247 — sem uma pessoa sequer.
 *
 * Cruzando os dois pelo telefone aparecem as duas perguntas que não tinham
 * resposta: quanto de cada canal virou ENTRADA no grupo (e não só lead), e de
 * que canal vem quem ABANDONA. Medido no dg-pg04: Meta Ads traz 265 das 907
 * entradas e perde 30,9% delas; WhatsApp traz 56 e perde 14,3%. Volume e
 * retenção não andam juntos.
 *
 * ## Por que a cobertura fica à vista
 *
 * O cruzamento casou 79,1% das pessoas no dg-pg04 e 65,0% no dg-pg02. O resto
 * entrou sem passar pela captação (link direto, lista antiga, convite) e vira
 * "Sem cadastro" — uma linha como as outras, porque esconder essas pessoas
 * faria os totais não fecharem com o grupo.
 */

import { Download, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSendflowCanais, type SendflowCanais } from "@/lib/hooks/use-sendflow";
import { fmtInt } from "@/lib/utils/format-number";

const pct = (parte: number, total: number) =>
  total > 0 ? `${((parte / total) * 100).toFixed(1)}%` : "—";

/** CSV com `;` e BOM: é o que o Excel em português abre sem assistente. */
function baixarCsv(d: SendflowCanais) {
  const linhas = [
    "Nome;Número;Canal;No grupo hoje",
    ...d.pessoas.map((p) =>
      [p.nome, p.numero, p.canal, p.saiu ? "Saiu" : "Está"]
        .map((c) => `"${c.replace(/"/g, '""')}"`)
        .join(";"),
    ),
  ];
  const blob = new Blob(["\uFEFF" + linhas.join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `canais-${d.campanha.name.replace(/[^\w-]+/g, "-")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function CanalDeQuemEntrou({
  projectId,
  funnelId,
}: {
  projectId: string;
  funnelId: string;
}) {
  const q = useSendflowCanais(projectId, funnelId);
  const d = q.data;
  const maior = d ? Math.max(...d.canais.map((c) => c.total), 1) : 1;

  return (
    <div className="rounded-md border border-border/40 bg-card/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h4 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <Radio className="h-3.5 w-3.5" />
          De onde veio quem entrou no grupo
        </h4>
        {d && (
          <span className="text-[11px] text-muted-foreground">
            {fmtInt(d.identificados)} de {fmtInt(d.total)} identificados (
            {pct(d.identificados, d.total)}) · {fmtInt(d.leadsCaptados)} leads
            captados
          </span>
        )}
      </div>

      {q.isLoading ? (
        <p className="mt-4 text-[13px] text-muted-foreground">
          Cruzando os participantes do grupo com as planilhas de captação — na
          primeira vez pode levar até um minuto.
        </p>
      ) : q.error ? (
        <p className="mt-3 text-[13px] text-destructive">
          {q.error instanceof Error
            ? q.error.message
            : "Não consegui cruzar os participantes com os leads."}
        </p>
      ) : d && d.total > 0 ? (
        <>
          <table className="mt-3 w-full text-xs">
            <thead>
              <tr className="border-b border-border/40 text-[10px] uppercase tracking-wide text-muted-foreground">
                <th className="pb-1.5 text-left font-medium">Canal</th>
                <th className="pb-1.5 text-right font-medium">Entraram</th>
                <th className="pb-1.5 text-right font-medium">Estão</th>
                <th className="pb-1.5 text-right font-medium">Saíram</th>
                <th className="pb-1.5 text-right font-medium">% saída</th>
              </tr>
            </thead>
            <tbody>
              {d.canais.map((c) => (
                <tr
                  key={c.canal}
                  className="border-b border-border/20 last:border-0"
                >
                  <td className="py-1.5 pr-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={
                          c.canal === "Sem cadastro"
                            ? "text-muted-foreground"
                            : undefined
                        }
                      >
                        {c.canal}
                      </span>
                      {/* A barra é o volume relativo: o olho pega a ordem antes
                          de ler os números. */}
                      <span
                        className="h-1 rounded-full bg-primary/40"
                        style={{ width: `${(c.total / maior) * 56}px` }}
                      />
                    </div>
                  </td>
                  <td className="py-1.5 text-right font-semibold tabular-nums">
                    {fmtInt(c.total)}
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                    {fmtInt(c.dentro)}
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                    {fmtInt(c.sairam)}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">
                    {pct(c.sairam, c.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
            {fmtInt(d.semCadastro)} pessoas entraram sem passar pela captação
            (link direto, lista antiga, convite) — por isso aparecem como “Sem
            cadastro”. O casamento é pelos últimos 8 dígitos do telefone: o
            SendFlow devolve o número com DDI e a planilha quase sempre sem. E o
            SendFlow não informa a data de entrada, então dá para ver de que
            canal a pessoa veio, não quando ela entrou.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3 h-8 gap-1.5"
            onClick={() => baixarCsv(d)}
          >
            <Download className="h-3.5 w-3.5" />
            Baixar lista (CSV)
          </Button>
        </>
      ) : (
        <p className="mt-3 text-[13px] text-muted-foreground">
          Ninguém passou pelos grupos desta campanha ainda.
        </p>
      )}
    </div>
  );
}
