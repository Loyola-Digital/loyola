"use client";

/**
 * As regras de alerta.
 *
 * Por padrão a regra vale para TODOS os projetos: "ROAS abaixo de 1" é a mesma
 * conta em qualquer funil, e recriá-la por projeto seria trabalho repetido que
 * envelhece mal. Escolher um projeto é a exceção, para quando um expert tem
 * número próprio.
 *
 * O que NÃO dá é regra por funil: o gasto de mídia não é registrado por funil
 * nem por etapa (o catálogo do BI diz isso no próprio ROAS), então o número não
 * existiria.
 */

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useAlertas,
  useExcluirRegra,
  useSalvarRegra,
  useTestarRegra,
  type EntradaDeRegra,
  type MetricaDeAlerta,
  type RegraDeAlerta,
  type Veredito,
} from "@/lib/hooks/use-alertas";

const METRICAS: Array<{ valor: MetricaDeAlerta; rotulo: string; ajuda: string }> = [
  {
    valor: "connect_rate",
    rotulo: "Connect rate",
    ajuda: "Quantos dos cliques no link viram visualização da página.",
  },
  { valor: "roas", rotulo: "ROAS", ajuda: "Faturamento bruto dividido pelo investimento em mídia." },
  {
    valor: "investiu_sem_vender",
    rotulo: "Investiu e não vendeu",
    ajuda: "Gastou o valor abaixo na janela e não entrou faturamento nenhum.",
  },
];

/** Cada métrica fala uma língua: porcentagem, múltiplo ou reais. */
const UNIDADE: Record<
  MetricaDeAlerta,
  { sufixo: string; passo: string; paraTela: (v: number) => number; daTela: (v: number) => number }
> = {
  connect_rate: { sufixo: "%", passo: "1", paraTela: (v) => v * 100, daTela: (v) => v / 100 },
  roas: { sufixo: "×", passo: "0.1", paraTela: (v) => v, daTela: (v) => v },
  investiu_sem_vender: { sufixo: "R$", passo: "50", paraTela: (v) => v, daTela: (v) => v },
};

const TODOS = "__todos__";

const VAZIA: EntradaDeRegra = {
  projectId: null,
  metrica: "roas",
  comparador: "menor",
  valor: 1,
  gastoMinimo: 300,
  janelaDias: 1,
  ativo: true,
};

const dinheiro = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

function descrever(regra: RegraDeAlerta): string {
  const janela = regra.janelaDias <= 1 ? "hoje" : `nos últimos ${regra.janelaDias} dias`;
  if (regra.metrica === "investiu_sem_vender") {
    return `Avisa quando passar de ${dinheiro(regra.valor)} investidos ${janela} sem nenhuma venda.`;
  }
  const alvo =
    regra.metrica === "connect_rate"
      ? `${(regra.valor * 100).toFixed(0)}%`
      : regra.valor.toLocaleString("pt-BR");
  const lado = regra.comparador === "menor" ? "abaixo de" : "acima de";
  const piso = regra.gastoMinimo ? ` (só com ${dinheiro(regra.gastoMinimo)} ou mais de gasto)` : "";
  return `Avisa quando ficar ${lado} ${alvo} ${janela}${piso}.`;
}

function textoDoVeredito(v: Veredito): string {
  if (v.estourou) return `Em ${v.projeto}, dispararia agora: "${v.previa.titulo}"`;
  if (v.motivo === "gasto_abaixo_do_piso")
    return `Em ${v.projeto}: quieto, só ${dinheiro(v.leitura.gasto)} investidos — abaixo do piso.`;
  if (v.motivo === "sem_dado") return `Em ${v.projeto}: quieto, sem dado nessa janela.`;
  return `Em ${v.projeto}: dentro da faixa (${dinheiro(v.leitura.gasto)} investidos).`;
}

export function RegrasDeAlerta({ projetos }: { projetos: Array<{ id: string; name: string }> }) {
  const { data, isLoading } = useAlertas();
  const salvar = useSalvarRegra();
  const excluir = useExcluirRegra();
  const testar = useTestarRegra();
  const [rascunho, setRascunho] = useState<(EntradaDeRegra & { id?: string }) | null>(null);
  const [vereditos, setVereditos] = useState<Record<string, string>>({});

  async function aoTestar(regra: RegraDeAlerta) {
    setVereditos((v) => ({ ...v, [regra.id]: "Conferindo…" }));
    try {
      const r = await testar.mutateAsync({ id: regra.id });
      setVereditos((v) => ({ ...v, [regra.id]: textoDoVeredito(r) }));
    } catch (err) {
      setVereditos((v) => ({
        ...v,
        [regra.id]: err instanceof Error ? err.message : "Não consegui ler a métrica.",
      }));
    }
  }

  if (isLoading) return <Skeleton className="h-24 w-full" />;

  const unidade = UNIDADE[rascunho?.metrica ?? "roas"];

  return (
    <div className="space-y-4">
      {data && data.projetosSeguidos === 0 && data.regras.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Estas regras não avisam ninguém ainda: nenhum projeto está sendo seguido.
        </p>
      )}

      <div className="space-y-3">
        {data?.regras.map((regra) => (
          <div key={regra.id} className="rounded-lg border p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium">
                  {regra.rotulo}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {regra.projeto ?? "todos os projetos"}
                  </span>
                  {!regra.ativo && (
                    <span className="ml-2 text-xs text-muted-foreground">(desligada)</span>
                  )}
                </p>
                <p className="text-sm text-muted-foreground">{descrever(regra)}</p>
                {vereditos[regra.id] && (
                  <p className="mt-1 text-sm text-muted-foreground">{vereditos[regra.id]}</p>
                )}
              </div>
              <div className="flex shrink-0 gap-1">
                <Button variant="ghost" size="sm" onClick={() => void aoTestar(regra)}>
                  Testar
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setRascunho({
                      id: regra.id,
                      projectId: regra.projectId,
                      metrica: regra.metrica,
                      comparador: regra.comparador,
                      valor: regra.valor,
                      gastoMinimo: regra.gastoMinimo,
                      janelaDias: regra.janelaDias,
                      ativo: regra.ativo,
                    })
                  }
                >
                  Editar
                </Button>
                <Button variant="ghost" size="sm" onClick={() => excluir.mutate(regra.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        ))}
        {data?.regras.length === 0 && !rascunho && (
          <p className="text-sm text-muted-foreground">Nenhuma regra ainda.</p>
        )}
      </div>

      {rascunho ? (
        <div className="space-y-4 rounded-lg border p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Vale para</Label>
              <Select
                value={rascunho.projectId ?? TODOS}
                onValueChange={(v) =>
                  setRascunho({ ...rascunho, projectId: v === TODOS ? null : v })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS}>Todos os projetos</SelectItem>
                  {projetos.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      Só {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Cada pessoa recebe só dos projetos que segue.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Métrica</Label>
              <Select
                value={rascunho.metrica}
                onValueChange={(v) => setRascunho({ ...rascunho, metrica: v as MetricaDeAlerta })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METRICAS.map((m) => (
                    <SelectItem key={m.valor} value={m.valor}>
                      {m.rotulo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {METRICAS.find((m) => m.valor === rascunho.metrica)?.ajuda}
              </p>
            </div>

            <div className="space-y-2">
              <Label>
                {rascunho.metrica === "investiu_sem_vender"
                  ? `Gasto que torna o silêncio grave (${unidade.sufixo})`
                  : `Limiar (${unidade.sufixo})`}
              </Label>
              <Input
                type="number"
                step={unidade.passo}
                value={unidade.paraTela(rascunho.valor)}
                onChange={(e) =>
                  setRascunho({ ...rascunho, valor: unidade.daTela(Number(e.target.value)) })
                }
              />
            </div>

            {rascunho.metrica !== "investiu_sem_vender" && (
              <div className="space-y-2">
                <Label>Dispara quando ficar</Label>
                <Select
                  value={rascunho.comparador}
                  onValueChange={(v) =>
                    setRascunho({ ...rascunho, comparador: v as "menor" | "maior" })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="menor">Abaixo do limiar</SelectItem>
                    <SelectItem value="maior">Acima do limiar</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>Janela</Label>
              <Select
                value={String(rascunho.janelaDias)}
                onValueChange={(v) => setRascunho({ ...rascunho, janelaDias: Number(v) })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Hoje</SelectItem>
                  <SelectItem value="7">Últimos 7 dias</SelectItem>
                  <SelectItem value="30">Últimos 30 dias</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {rascunho.metrica !== "investiu_sem_vender" && (
              <div className="space-y-2">
                <Label>Só com gasto a partir de (R$)</Label>
                <Input
                  type="number"
                  step="50"
                  value={rascunho.gastoMinimo ?? ""}
                  placeholder="sem piso"
                  onChange={(e) =>
                    setRascunho({
                      ...rascunho,
                      gastoMinimo: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Evita o alarme das 8h, quando o gasto já entrou e a venda ainda não.
                </p>
              </div>
            )}

            <div className="flex items-center gap-3">
              <Switch
                checked={rascunho.ativo}
                onCheckedChange={(v) => setRascunho({ ...rascunho, ativo: v })}
              />
              <Label>Ligada</Label>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={async () => {
                await salvar.mutateAsync(rascunho);
                setRascunho(null);
              }}
              disabled={salvar.isPending}
            >
              Salvar
            </Button>
            <Button variant="ghost" onClick={() => setRascunho(null)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setRascunho({ ...VAZIA })}>
          <Plus className="mr-2 h-4 w-4" />
          Nova regra
        </Button>
      )}
    </div>
  );
}
