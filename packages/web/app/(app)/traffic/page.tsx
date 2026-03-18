"use client";

import { TrendingUp, Settings, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useMetaAdsAccounts } from "@/lib/hooks/use-meta-ads";

export default function TrafficPage() {
  const { data: accounts, isLoading } = useMetaAdsAccounts();

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-border/30 bg-gradient-to-br from-card via-card/80 to-brand/5 px-8 py-8">
        <div className="relative z-10">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand/60 mb-1">
            Loyola X · Tráfego
          </p>
          <h1 className="text-2xl font-bold tracking-tight">
            Meta Ads
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-md">
            Contas de anúncios conectadas. Gerencie contas em{" "}
            <Link href="/settings/traffic" className="text-brand hover:underline inline-flex items-center gap-0.5">
              Settings <Settings className="h-3 w-3" />
            </Link>
          </p>
        </div>
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-brand/5 blur-3xl" />
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && (!accounts || accounts.length === 0) && (
        <div className="rounded-2xl border border-border/30 bg-card/60 p-12 text-center">
          <TrendingUp className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
          <p className="font-medium text-lg">Nenhuma conta de anúncios</p>
          <p className="text-sm text-muted-foreground mt-1 mb-4">
            Conecte uma conta Meta Ads para começar a acompanhar campanhas.
          </p>
          <Link
            href="/settings/traffic"
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-foreground hover:bg-brand/90 transition-colors"
          >
            <Settings className="h-4 w-4" />
            Ir para Settings
          </Link>
        </div>
      )}

      {/* Account cards */}
      {accounts && accounts.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {accounts.map((account) => (
            <div
              key={account.id}
              className="group relative rounded-2xl border border-border/40 bg-card/60 p-5 transition-all duration-300 hover:border-brand/40 hover:shadow-[0_8px_32px_-8px_hsl(47_98%_54%/0.15)] hover:-translate-y-0.5"
            >
              <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                <ArrowUpRight className="h-3.5 w-3.5 text-brand/60" />
              </div>

              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/10 text-brand shrink-0">
                  <TrendingUp className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold text-sm truncate">{account.accountName}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    act_{account.metaAccountId}
                  </p>
                </div>
              </div>

              {account.projects.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {account.projects.map((p) => (
                    <Badge key={p.projectId} variant="outline" className="text-[10px]">
                      {p.projectName}
                    </Badge>
                  ))}
                </div>
              )}

              {account.projects.length === 0 && (
                <p className="text-xs text-muted-foreground/60 mt-3 italic">
                  Sem projetos vinculados
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
