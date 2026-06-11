"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import type { HotmartProduct } from "@/lib/hooks/use-hotmart";

interface Props {
  products: HotmartProduct[];
  value: string | null;
  onChange: (productId: string) => void;
  loading?: boolean;
}

export function ProductPicker({ products, value, onChange, loading }: Props) {
  if (loading) {
    return <Skeleton className="h-9 w-[240px]" />;
  }

  return (
    <Select value={value ?? undefined} onValueChange={onChange} disabled={products.length === 0}>
      <SelectTrigger className="h-9 w-[240px] text-sm">
        <SelectValue placeholder="Selecionar produto…" />
      </SelectTrigger>
      <SelectContent>
        {products.map((p) => (
          <SelectItem key={p.id} value={p.id} className="text-sm">
            {p.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
