"use client";

import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useMetaFreshness } from "@/lib/hooks/use-traffic-analytics";

/**
 * Selo "Atualizado há X" para os painéis Meta. Mostra quando o sync de
 * performance Meta rodou pela última vez (os dados vêm do banco, não da Meta ao
 * vivo). Some quando ainda não houve nenhum sync bem-sucedido do projeto.
 */
export function MetaFreshnessBadge({ projectId }: { projectId: string }) {
  const { data } = useMetaFreshness(projectId);
  const lastSyncedAt = data?.lastSyncedAt;
  if (!lastSyncedAt) return null;

  const date = new Date(lastSyncedAt);
  return (
    <span
      className="text-xs text-muted-foreground whitespace-nowrap"
      title={`Dados Meta sincronizados em ${date.toLocaleString("pt-BR")}`}
    >
      Atualizado {formatDistanceToNow(date, { addSuffix: true, locale: ptBR })}
    </span>
  );
}
