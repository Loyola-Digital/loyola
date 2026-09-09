"use client";

import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useListaDe } from "@/lib/hooks/use-nomenclatura";

/** Select de experts ATIVOS. Com `permitirTodos`, a opção vazia é "Todos os experts" (filtro de topo). */
export function SeletorDeExpert(props: {
  valor: string;
  onChange: (id: string) => void;
  travado?: boolean;
  permitirTodos?: boolean;
  id?: string;
  label?: string;
}) {
  const { valor, onChange, travado, permitirTodos, id = "expert", label = "Expert" } = props;
  const { data } = useListaDe("experts");
  const TODOS = "__todos__";
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className={permitirTodos ? "text-xs text-muted-foreground" : undefined}>
        {label}
      </Label>
      <Select value={valor || (permitirTodos ? TODOS : "")} onValueChange={(v) => onChange(v === TODOS ? "" : v)} disabled={travado}>
        <SelectTrigger id={id} className="min-w-[200px]">
          <SelectValue placeholder="Escolha o expert" />
        </SelectTrigger>
        <SelectContent>
          {permitirTodos ? <SelectItem value={TODOS}>Todos os experts</SelectItem> : null}
          {(data ?? []).map((e) => (
            <SelectItem key={e.id} value={e.id}>
              <span className="font-mono">{e.code}</span> — {e.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
