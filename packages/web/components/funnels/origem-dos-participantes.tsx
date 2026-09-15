"use client";

/**
 * Origem dos participantes — quem do grupo da campanha já estava num grupo
 * antigo, e quem chegou agora.
 *
 * ## Por que existe
 *
 * A página B do FZM3 não tem popup de cadastro, então quem entra por ela não
 * deixa rastro fora do WhatsApp. O número no grupo é o único dado — e cruzar
 * com o grupo antigo diz quanto da audiência é base reaquecida e quanto é
 * gente nova. O botão de baixar existe porque o time vai AGIR sobre esses
 * números depois; um gráfico sem a lista não serviria para isso.
 *
 * ## Só campanhas do mesmo expert
 *
 * A conta do SendFlow é uma só para todos os experts, então a lista crua mistura
 * os grupos do Danilo com os da Fernanda. O que diz de quem é a campanha é a
 * CONTA de WhatsApp que opera os grupos (`accountIds`): o seletor mostra só as
 * campanhas que dividem conta com a do funil. Campanha arquivada perde as contas
 * no SendFlow e por isso não aparece — não há como dizer de quem ela era.
 *
 * ## A escolha do grupo antigo fica no navegador
 *
 * Cada funil lembra a última campanha comparada (localStorage). Não há como
 * adivinhar qual é "o antigo" — o de Avisos, a edição anterior, a lista de
 * alunos — e errar em silêncio seria pior que perguntar uma vez.
 */

import { useEffect, useState } from "react";
import { Download, History, Loader2 } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useSendflowCampanhas,
  useSendflowOrigem,
  type SendflowOrigem,
} from "@/lib/hooks/use-sendflow";

const COR_ANTIGO = "#a855f7";
const COR_NOVO = "#22c55e";

const fmt = (n: number) => n.toLocaleString("pt-BR");
const pct = (parte: number, total: number) =>
  total > 0 ? `${Math.round((parte / total) * 100)}%` : "—";

function chaveDoFunil(funnelId: string) {
  return `sendflow-origem:${funnelId}`;
}

/** CSV com `;` e BOM: é o que o Excel em português abre sem assistente. */
function baixarCsv(dados: SendflowOrigem, nomeDaAntiga: string) {
  const linhas = [
    "Número;Origem;No grupo hoje",
    ...dados.participantes.map((p) =>
      [
        p.numero,
        p.veioDaAntiga ? `Veio de ${nomeDaAntiga}` : "Novo",
        p.saiu ? "Saiu" : "Está",
      ]
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
  a.download = `origem-${dados.campanha.name.replace(/[^\w-]+/g, "-")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function Linha({
  cor,
  rotulo,
  valor,
  total,
  detalhe,
}: {
  cor: string;
  rotulo: string;
  valor: number;
  total: number;
  detalhe?: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span
        className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ background: cor }}
      />
      <div className="min-w-0">
        <div className="text-[13px]">
          <span className="font-semibold tabular-nums">{fmt(valor)}</span>{" "}
          <span className="text-muted-foreground">({pct(valor, total)})</span>{" "}
          {rotulo}
        </div>
        {detalhe && (
          <div className="text-[11px] text-muted-foreground">{detalhe}</div>
        )}
      </div>
    </div>
  );
}

export function OrigemDosParticipantes({
  projectId,
  funnelId,
  campanhaId,
}: {
  projectId: string;
  funnelId: string;
  campanhaId: string;
}) {
  const [comparar, setComparar] = useState<string | null>(null);

  useEffect(() => {
    try {
      setComparar(localStorage.getItem(chaveDoFunil(funnelId)));
    } catch {
      // Storage bloqueado: só não lembra a escolha.
    }
  }, [funnelId]);

  function escolher(id: string) {
    setComparar(id);
    try {
      localStorage.setItem(chaveDoFunil(funnelId), id);
    } catch {
      // idem
    }
  }

  const campanhas = useSendflowCampanhas(projectId);

  const todas = campanhas.data?.releases ?? [];
  const contasDoFunil = new Set(
    todas.find((c) => c.id === campanhaId)?.accountIds ?? [],
  );
  const opcoes = todas.filter(
    (c) =>
      c.id !== campanhaId &&
      (c.accountIds ?? []).some((a) => contasDoFunil.has(a)),
  );
  // Escolha salva que não é mais deste expert (ou de antes do filtro) não
  // dispara cruzamento: só vale o que está na lista.
  const escolhida = opcoes.some((c) => c.id === comparar) ? comparar : null;
  const nomeDaAntiga =
    opcoes.find((c) => c.id === escolhida)?.name ?? "grupo antigo";
  const origem = useSendflowOrigem(projectId, funnelId, escolhida);
  const d = origem.data;

  return (
    <div className="rounded-md border border-border/40 bg-card/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h4 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <History className="h-3.5 w-3.5" />
          Origem dos participantes
        </h4>
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-muted-foreground">Comparar com</span>
          <Select value={escolhida ?? undefined} onValueChange={escolher}>
            <SelectTrigger className="h-8 w-[240px] text-[12px]">
              <SelectValue
                placeholder={
                  campanhas.isLoading ? "Carregando…" : "Escolha o grupo antigo"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {opcoes.map((c) => (
                <SelectItem key={c.id} value={c.id} className="text-[12px]">
                  {c.name}
                  {c.archived ? " (arquivada)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {!campanhas.isLoading && opcoes.length === 0 ? (
        <p className="mt-3 text-[13px] text-muted-foreground">
          Nenhuma outra campanha usa a mesma conta de WhatsApp deste funil no
          SendFlow.
        </p>
      ) : !escolhida ? (
        <p className="mt-3 text-[13px] text-muted-foreground">
          Escolha a campanha antiga (o grupo de avisos, a edição anterior) para
          ver quantos participantes já vinham dela e quantos são novos.
        </p>
      ) : origem.isLoading ? (
        <p className="mt-4 flex items-center gap-2 text-[13px] text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cruzando os participantes no SendFlow — na primeira vez pode levar até
          um minuto.
        </p>
      ) : origem.error ? (
        <p className="mt-3 text-[13px] text-destructive">
          {origem.error instanceof Error
            ? origem.error.message
            : "Não consegui cruzar os participantes."}
        </p>
      ) : d ? (
        <div className="mt-3 flex flex-col items-center gap-6 sm:flex-row">
          <div className="relative h-[180px] w-[180px] shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={[
                    { nome: `Vieram de ${nomeDaAntiga}`, valor: d.vieramDaAntiga },
                    { nome: "Novos", valor: d.novos },
                  ]}
                  dataKey="valor"
                  nameKey="nome"
                  innerRadius={58}
                  outerRadius={84}
                  paddingAngle={d.vieramDaAntiga && d.novos ? 2 : 0}
                  stroke="none"
                  isAnimationActive={false}
                >
                  <Cell fill={COR_ANTIGO} />
                  <Cell fill={COR_NOVO} />
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(v, nome) => [fmt(Number(v)), nome]}
                />
              </PieChart>
            </ResponsiveContainer>
            {/* O total no furo do donut: é a base de todas as porcentagens. */}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold tabular-nums">
                {fmt(d.total)}
              </span>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                passaram
              </span>
            </div>
          </div>

          <div className="w-full min-w-0 space-y-3">
            <Linha
              cor={COR_ANTIGO}
              rotulo={`já estavam em ${nomeDaAntiga}`}
              valor={d.vieramDaAntiga}
              total={d.total}
              detalhe={`${fmt(d.aindaNaAntiga)} continuam lá · ${fmt(d.tinhamSaidoDaAntiga)} tinham saído`}
            />
            <Linha
              cor={COR_NOVO}
              rotulo="são novos"
              valor={d.novos}
              total={d.total}
              detalhe="não aparecem na campanha comparada"
            />
            <p className="text-[11px] text-muted-foreground">
              {fmt(d.sairamDaCampanha)} já saíram dos grupos de{" "}
              {d.campanha.name}. O SendFlow não informa a data de entrada de
              cada pessoa, então dá para ver que ela está nos dois, mas não em
              qual entrou primeiro.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5"
              onClick={() => baixarCsv(d, nomeDaAntiga)}
            >
              <Download className="h-3.5 w-3.5" />
              Baixar números (CSV)
            </Button>
          </div>
        </div>
      ) : null}

      {origem.isFetching && !origem.isLoading && (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Atualizando…
        </p>
      )}
    </div>
  );
}
