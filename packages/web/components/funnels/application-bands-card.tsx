"use client";

/**
 * Faixas por formulário de aplicação.
 *
 * O gráfico de Aplicações por dia já separa as formas (ex.: "PAGINA A" e
 * "PAGINA B"), mas só responde volume. Aqui a mesma separação é quebrada por
 * faixa de qualificação e cruzada com quem comprou — que é o que diz se a
 * página traz lead MELHOR, não só mais lead.
 *
 * A faixa vem da coluna "Faixa 1" da própria aba do formulário quando existe;
 * senão, do cruzamento por e-mail/telefone com as pesquisas do funil. A
 * diferença importa e aparece no card: no cruzamento, boa parte de quem aplicou
 * direto na página nunca respondeu a pesquisa, então cai em "sem faixa" — que
 * continua visível, porque escondê-lo inflaria a conversão das faixas reais.
 */

import { Layers, AlertTriangle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useStageApplicationBands,
  type ApplicationBandForm,
  type ApplicationBandGroup,
  type ApplicationBandRow,
} from "@/lib/hooks/use-stage-applications";

interface Props {
  projectId: string;
  funnelId: string;
  stageId: string;
}

const BAND_COLORS: Record<string, string> = {
  A: "bg-emerald-500",
  B: "bg-blue-500",
  C: "bg-amber-500",
  D: "bg-red-500",
};

const nf = (n: number) => n.toLocaleString("pt-BR");
const money = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

function bandColor(band: string | null): string {
  if (!band) return "bg-muted-foreground/40";
  return BAND_COLORS[band] ?? "bg-primary/60";
}

export function ApplicationBandsCard({ projectId, funnelId, stageId }: Props) {
  const { data, isLoading } = useStageApplicationBands(projectId, funnelId, stageId);

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border/30 bg-card/60 p-5 space-y-3">
        <Skeleton className="h-5 w-56" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  // Funil sem formulário de aplicação: nada a separar — o card não existe.
  if (!data || data.semPlanilha || data.forms.length === 0) return null;

  return (
    <div className="rounded-xl border border-border/30 bg-card/60 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Layers className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Faixas por formulário</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        Aplicações de cada formulário quebradas por faixa, cruzadas com quem comprou o produto
        principal. A faixa sai da coluna <code className="font-mono text-[10px] bg-muted/50 px-1 rounded">Faixa 1</code> da
        própria aba do formulário; onde ela não existe, é buscada na pesquisa por e-mail/telefone.
        Leitura do lançamento inteiro — não acompanha o filtro de dias.
      </p>

      {data.semFaixa ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="text-xs font-medium">Nenhuma pesquisa deste funil tem coluna de faixa</p>
            <p className="text-[11px] text-muted-foreground">
              Mapeie a coluna de faixa (ex.: <code className="font-mono">Faixa 1</code>) na pesquisa
              de captação pra quebra por faixa aparecer aqui.
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {data.forms.map((f) => (
          <FormCard key={f.sheetId} form={f} />
        ))}
      </div>

      {/* Consolidado só faz sentido com mais de uma forma — com uma só, repetiria
          o card acima. Vem deduplicado por contato: quem aplicou nas duas
          páginas conta uma vez. */}
      {data.total && data.forms.length > 1 && (
        <div className="rounded-lg border border-border/30 bg-muted/10 p-3 space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-xs font-semibold">Consolidado</p>
            <p className="text-[11px] text-muted-foreground">
              contatos únicos entre as {data.forms.length} formas
            </p>
          </div>
          <GroupStats group={data.total} />
          <BandTable bands={data.total.bands} totalAplicacoes={data.total.aplicacoes} />
        </div>
      )}
    </div>
  );
}

function FormCard({ form }: { form: ApplicationBandForm }) {
  return (
    <div className="rounded-lg border border-border/30 p-3 space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-medium truncate">{form.label}</p>
        {/* Aplicou duas vezes não vira duas aplicações — mas o time precisa ver
            que a diferença existe antes de achar que o número está errado. */}
        {form.linhas > form.aplicacoes && (
          <span className="text-[10px] text-muted-foreground shrink-0">
            {nf(form.linhas)} envios
          </span>
        )}
      </div>

      {form.erro ? (
        <p className="text-xs text-destructive">
          Não foi possível ler a planilha desta forma (permissão ou aba renomeada).
        </p>
      ) : form.aplicacoes === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhuma aplicação com contato identificável.</p>
      ) : (
        <>
          <GroupStats group={form} />
          <BandTable bands={form.bands} totalAplicacoes={form.aplicacoes} />
          <FonteFaixaNota form={form} />
        </>
      )}
    </div>
  );
}

/**
 * Sem isto, uma forma sem coluna de faixa própria aparece quase toda como "sem
 * faixa" e o time lê como lead ruim — quando na verdade é o cruzamento que não
 * alcançou. A nota diz de onde veio a faixa e qual a cobertura real.
 */
function FonteFaixaNota({ form }: { form: ApplicationBandForm }) {
  if (form.fonteFaixa === null) {
    return (
      <p className="text-[10px] text-muted-foreground">
        Sem faixa pra esta forma — nem coluna própria na aba, nem casamento com a pesquisa.
      </p>
    );
  }

  if (form.fonteFaixa === "form") {
    return (
      <p className="text-[10px] text-muted-foreground">
        Faixa da própria aba do formulário · {nf(form.comFaixa)}/{nf(form.aplicacoes)} classificados.
      </p>
    );
  }

  const cobertura = form.aplicacoes > 0 ? (form.comFaixa / form.aplicacoes) * 100 : 0;
  return (
    <p className="text-[10px] text-muted-foreground">
      Faixa cruzada da pesquisa · {nf(form.comFaixa)}/{nf(form.aplicacoes)} classificados (
      <span className={cobertura < 50 ? "text-amber-600 dark:text-amber-400 font-medium" : ""}>
        {cobertura.toFixed(0)}%
      </span>
      ). Mapear <code className="font-mono">Faixa 1</code> nesta aba cobre o resto.
    </p>
  );
}

function GroupStats({ group }: { group: ApplicationBandGroup }) {
  return (
    <div className="grid grid-cols-4 gap-2">
      <Stat label="Aplicações" value={nf(group.aplicacoes)} />
      <Stat label="Compraram" value={nf(group.compradores)} />
      <Stat label="Conversão" value={`${group.conversao.toFixed(1)}%`} />
      <Stat label="Receita" value={money(group.receita)} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/20 bg-muted/10 px-2 py-1.5">
      <p className="text-[10px] text-muted-foreground truncate">{label}</p>
      <p className="text-sm font-semibold tabular-nums truncate">{value}</p>
    </div>
  );
}

function BandTable({
  bands,
  totalAplicacoes,
}: {
  bands: ApplicationBandRow[];
  totalAplicacoes: number;
}) {
  if (bands.length === 0) return null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-muted-foreground">
            <th className="text-left font-medium py-1">Faixa</th>
            <th className="text-right font-medium py-1">Aplic.</th>
            <th className="text-right font-medium py-1">Compras</th>
            <th className="text-right font-medium py-1">Conv.</th>
            <th className="text-right font-medium py-1">Receita</th>
          </tr>
        </thead>
        <tbody>
          {bands.map((b) => {
            const share = totalAplicacoes > 0 ? (b.aplicacoes / totalAplicacoes) * 100 : 0;
            return (
              <tr key={b.band ?? "sem-faixa"} className="border-t border-border/10">
                <td className="py-1.5">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`inline-flex items-center justify-center h-5 w-5 rounded-full ${bandColor(b.band)} text-white text-[10px] font-bold shrink-0`}
                    >
                      {b.band ?? "—"}
                    </span>
                    <span className="text-muted-foreground tabular-nums">
                      {share.toFixed(0)}%
                    </span>
                  </div>
                </td>
                <td className="text-right tabular-nums py-1.5">{nf(b.aplicacoes)}</td>
                <td className="text-right tabular-nums py-1.5">{nf(b.compradores)}</td>
                <td className="text-right tabular-nums py-1.5">
                  <span
                    className={
                      b.conversao >= 10
                        ? "text-emerald-600 dark:text-emerald-400 font-medium"
                        : b.conversao > 0
                          ? "text-foreground"
                          : "text-muted-foreground"
                    }
                  >
                    {b.conversao.toFixed(1)}%
                  </span>
                </td>
                <td className="text-right tabular-nums py-1.5">
                  {b.receita > 0 ? money(b.receita) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
