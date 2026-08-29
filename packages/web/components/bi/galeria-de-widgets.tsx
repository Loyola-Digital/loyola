"use client";

/**
 * A galeria de widgets prontos.
 *
 * É a peça que faz o dashboard ser útil no primeiro dia: a pessoa escolhe
 * "Investimento por campanha" de uma lista com nome, em vez de montar uma
 * consulta. Preset que ainda não funciona aparece **desabilitado com o motivo** —
 * some da lista seria esconder o roadmap; inserir mesmo assim seria entregar um
 * card que erra toda vez.
 */

import { useMemo, useState } from "react";
import { BarChart3, Hash, LineChart, PieChart, Table2, Lock, Filter } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { PresetNaGaleria } from "@/lib/hooks/use-bi";

const ICONE = {
  kpi: Hash,
  linha: LineChart,
  barra: BarChart3,
  pizza: PieChart,
  tabela: Table2,
  funil: Filter,
} as const;

/** Normaliza para busca: sem acento e sem caixa, senão "trafego" não acha "tráfego". */
function chave(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function GaleriaDeWidgets({
  presets,
  onInserir,
  inserindo,
}: {
  presets: PresetNaGaleria[];
  onInserir: (preset: PresetNaGaleria) => void;
  inserindo?: string | null;
}) {
  const [busca, setBusca] = useState("");

  const porCategoria = useMemo(() => {
    const termo = chave(busca.trim());
    const filtrados = termo
      ? presets.filter((p) =>
          chave(`${p.nome} ${p.descricao} ${p.categoria} ${p.metricas.join(" ")}`).includes(termo),
        )
      : presets;

    const mapa = new Map<string, PresetNaGaleria[]>();
    for (const p of filtrados) {
      const lista = mapa.get(p.categoria) ?? [];
      lista.push(p);
      mapa.set(p.categoria, lista);
    }
    return [...mapa.entries()];
  }, [presets, busca]);

  return (
    <div className="flex h-full flex-col gap-3">
      <Input
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Buscar widget…"
        className="h-9"
      />

      <ScrollArea className="min-h-0 flex-1 pr-3">
        {porCategoria.length === 0 && (
          <p className="px-1 py-6 text-center text-sm text-muted-foreground">
            Nenhum widget com esse nome.
          </p>
        )}

        <div className="space-y-5">
          {porCategoria.map(([categoria, lista]) => (
            <section key={categoria} className="space-y-2">
              <h4 className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {categoria}
              </h4>
              <div className="space-y-1.5">
                {lista.map((p) => {
                  const Icone = ICONE[p.tipo];
                  const travado = Boolean(p.bloqueado);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      disabled={travado || inserindo === p.id}
                      onClick={() => onInserir(p)}
                      title={p.bloqueado ?? p.descricao}
                      className={cn(
                        "flex w-full items-start gap-3 rounded-lg border p-2.5 text-left transition",
                        travado
                          ? "cursor-not-allowed opacity-55"
                          : "hover:border-primary/50 hover:bg-accent",
                        inserindo === p.id && "opacity-60",
                      )}
                    >
                      <span className="mt-0.5 shrink-0 rounded-md bg-muted p-1.5">
                        {travado ? (
                          <Lock className="size-3.5 text-muted-foreground" />
                        ) : (
                          <Icone className="size-3.5" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">{p.nome}</span>
                          <Badge variant="outline" className="shrink-0 text-[10px]">
                            {p.tipo}
                          </Badge>
                        </span>
                        <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                          {/* Bloqueado mostra o MOTIVO no lugar da descrição: a
                              pergunta de quem clica e não acontece nada é "por
                              quê", e a resposta precisa estar ali. */}
                          {p.bloqueado ?? p.descricao}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
