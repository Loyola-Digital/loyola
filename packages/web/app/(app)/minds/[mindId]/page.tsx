"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useMind } from "@/lib/hooks/use-mind";
import { MindProfile } from "@/components/minds/mind-profile";
import { Skeleton } from "@/components/ui/skeleton";

export default function MindProfilePage() {
  const { mindId } = useParams<{ mindId: string }>();
  const { mind, isLoading, error } = useMind(mindId);

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-sm text-muted-foreground">
        <Link href="/minds" className="hover:text-foreground transition-colors">
          Minds
        </Link>
        <span>/</span>
        <span className="text-foreground">
          {isLoading ? <Skeleton className="h-4 w-24 inline-block" /> : mind?.name ?? "..."}
        </span>
      </nav>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <Skeleton className="h-16 w-16 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
          <Skeleton className="h-10 w-40" />
          <Skeleton className="h-px w-full" />
          <div className="space-y-2">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-20 w-full" />
          </div>
        </div>
      )}

      {/* Error */}
      {!isLoading && (error || !mind) && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-lg font-medium text-muted-foreground">
            Mind não encontrada
          </p>
          <Link
            href="/minds"
            className="mt-2 text-sm text-primary hover:underline"
          >
            Voltar ao catálogo
          </Link>
        </div>
      )}

      {/* Profile */}
      {!isLoading && mind && <MindProfile mind={mind} />}
    </div>
  );
}
