"use client";

/**
 * O recorte que vale para o canvas inteiro.
 *
 * Período e slicers são **estado do dashboard**, não da tela: quem abre o link
 * precisa ver o mesmo recorte que quem salvou. Por isso cada mudança salva, e a
 * atualização das consultas passa pelo debounce em vez de sair a cada tecla.
 */

import { useEffect, useMemo, useState } from "react";
import { CalendarRange, Check, ChevronDown, Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useApiClient } from "@/lib/hooks/use-api-client";
import { cn } from "@/lib/utils";
import type { DateRange } from "@/lib/bi/tipos";

export interface Slicer {
  field: string;
  values: string[];
}

/** Os períodos com nome. Guardados como NOME, para não congelar no dia do save. */
const PRESETS: { id: string; label: string }[] = [
  { id: "hoje", label: "Hoje" },
  { id: "ontem", label: "Ontem" },
  { id: "last_7d", label: "Últimos 7 dias" },
  { id: "last_14d", label: "Últimos 14 dias" },
  { id: "last_30d", label: "Últimos 30 dias" },
  { id: "last_90d", label: "Últimos 90 dias" },
  { id: "this_month", label: "Mês atual" },
  { id: "last_month", label: "Mês passado" },
  { id: "this_year", label: "Ano atual" },
];

/** As dimensões que servem de slicer hoje — as que têm valores listáveis. */
const DIMENSOES = [
  { key: "trafego.campaign", label: "Campanha" },
  { key: "trafego.adset", label: "Conjunto" },
  { key: "trafego.ad", label: "Criativo" },
];

export function BarraDeFiltros({
  projectId,
  dateRange,
  periodo,
  slicers,
  onDateRange,
  onSlicers,
}: {
  projectId: string;
  dateRange: DateRange;
  periodo: { start: string; end: string };
  slicers: Slicer[];
  onDateRange: (novo: DateRange) => void;
  onSlicers: (novos: Slicer[]) => void;
}) {
  const [personalizado, setPersonalizado] = useState(false);
  const rotuloDoPeriodo =
    "preset" in dateRange
      ? (PRESETS.find((p) => p.id === dateRange.preset)?.label ?? dateRange.preset)
      : `${dateRange.start} → ${dateRange.end}`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5">
            <CalendarRange className="size-3.5" />
            {rotuloDoPeriodo}
            <ChevronDown className="size-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {PRESETS.map((p) => (
            <DropdownMenuItem
              key={p.id}
              onSelect={() => {
                setPersonalizado(false);
                onDateRange({ preset: p.id });
              }}
            >
              {p.label}
              {"preset" in dateRange && dateRange.preset === p.id && (
                <Check className="ml-auto size-3.5" />
              )}
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem onSelect={() => setPersonalizado(true)}>
            Personalizado…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {(personalizado || !("preset" in dateRange)) && (
        <div className="flex items-center gap-1">
          <Input
            type="date"
            defaultValue={periodo.start}
            className="h-8 w-[140px]"
            onChange={(e) =>
              e.target.value && onDateRange({ start: e.target.value, end: periodo.end })
            }
          />
          <span className="text-xs text-muted-foreground">até</span>
          <Input
            type="date"
            defaultValue={periodo.end}
            className="h-8 w-[140px]"
            onChange={(e) =>
              e.target.value && onDateRange({ start: periodo.start, end: e.target.value })
            }
          />
        </div>
      )}

      {DIMENSOES.map((d) => (
        <SlicerDeDimensao
          key={d.key}
          projectId={projectId}
          dimensao={d}
          selecionados={slicers.find((s) => s.field === d.key)?.values ?? []}
          onMudar={(values) => {
            const outros = slicers.filter((s) => s.field !== d.key);
            onSlicers(values.length ? [...outros, { field: d.key, values }] : outros);
          }}
        />
      ))}

      {slicers.length > 0 && (
        <Button variant="ghost" size="sm" onClick={() => onSlicers([])}>
          <X className="size-3.5" />
          Limpar filtros
        </Button>
      )}

      <span className="ml-auto text-xs text-muted-foreground">
        {periodo.start} → {periodo.end}
      </span>
    </div>
  );
}

function SlicerDeDimensao({
  projectId,
  dimensao,
  selecionados,
  onMudar,
}: {
  projectId: string;
  dimensao: { key: string; label: string };
  selecionados: string[];
  onMudar: (values: string[]) => void;
}) {
  const apiClient = useApiClient();
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [valores, setValores] = useState<string[]>([]);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    // Contador de sequência: com a busca por debounce, a resposta de "bb" pode
    // chegar depois da de "bbe" e repovoar a lista com o resultado antigo.
    let atual = true;
    const timer = setTimeout(async () => {
      setCarregando(true);
      try {
        const q = new URLSearchParams({
          projectId,
          dimension: dimensao.key,
          limit: "50",
          ...(busca ? { search: busca } : {}),
        });
        const r = await apiClient<{ values: { value: string }[] }>(`/api/bi/valores?${q}`);
        if (atual) setValores(r.values.map((v) => v.value));
      } catch {
        if (atual) setValores([]);
      } finally {
        if (atual) setCarregando(false);
      }
    }, 300);

    return () => {
      atual = false;
      clearTimeout(timer);
    };
  }, [aberto, busca, dimensao.key, projectId, apiClient]);

  const rotulo = useMemo(() => {
    if (selecionados.length === 0) return dimensao.label;
    if (selecionados.length === 1) return selecionados[0]!;
    return `${dimensao.label}: ${selecionados.length}`;
  }, [selecionados, dimensao.label]);

  function alternar(valor: string) {
    onMudar(
      selecionados.includes(valor)
        ? selecionados.filter((v) => v !== valor)
        : [...selecionados, valor],
    );
  }

  return (
    <DropdownMenu open={aberto} onOpenChange={setAberto}>
      <DropdownMenuTrigger asChild>
        <Button
          variant={selecionados.length ? "secondary" : "outline"}
          size="sm"
          className="max-w-[220px] gap-1.5"
        >
          <Filter className="size-3.5 shrink-0" />
          <span className="truncate">{rotulo}</span>
          <ChevronDown className="size-3 shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72 p-2">
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder={`Buscar ${dimensao.label.toLowerCase()}…`}
          className="mb-2 h-8"
        />
        {selecionados.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1">
            {selecionados.map((v) => (
              <Badge
                key={v}
                variant="secondary"
                className="max-w-full cursor-pointer gap-1"
                onClick={() => alternar(v)}
              >
                <span className="truncate">{v}</span>
                <X className="size-3 shrink-0" />
              </Badge>
            ))}
          </div>
        )}
        <ScrollArea className="h-56 pr-2">
          {carregando && <p className="p-2 text-xs text-muted-foreground">Carregando…</p>}
          {!carregando && valores.length === 0 && (
            <p className="p-2 text-xs text-muted-foreground">Nenhum valor no período.</p>
          )}
          {valores.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => alternar(v)}
              className={cn(
                "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-accent",
                selecionados.includes(v) && "bg-accent",
              )}
            >
              <span className="truncate">{v}</span>
              {selecionados.includes(v) && <Check className="ml-auto size-3.5 shrink-0" />}
            </button>
          ))}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
