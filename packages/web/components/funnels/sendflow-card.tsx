"use client";

/**
 * Grupos de WhatsApp da campanha, ao lado do Log.
 *
 * Responde "quantas pessoas tem no grupo" e mostra o movimento diário
 * (entradas e saídas), que é o que o time olha durante o lançamento.
 *
 * O que o card NÃO mostra, e não é esquecimento: o texto das mensagens
 * disparadas. O SendFlow guarda só metadados do disparo — dizer "mensagem
 * enviada" sem o conteúdo é o máximo honesto que dá.
 */

import { useState } from "react";
import { MessageSquare, Users, TrendingUp, TrendingDown, MousePointerClick, Link2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useSendflowConnection,
  useSaveSendflowConnection,
  useSendflowSummary,
} from "@/lib/hooks/use-sendflow";

const nf = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("pt-BR"));

function Numero({
  icon: Icon,
  label,
  valor,
  sub,
  cor,
}: {
  icon: typeof Users;
  label: string;
  valor: string;
  sub?: string;
  cor?: string;
}) {
  return (
    <div>
      <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3 w-3" />
        {label}
      </p>
      <p className={`text-2xl font-semibold leading-none tabular-nums ${cor ?? ""}`}>{valor}</p>
      {sub && <p className="mt-1 text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function FormularioConexao({ projectId }: { projectId: string }) {
  const salvar = useSaveSendflowConnection(projectId);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [refreshToken, setRefreshToken] = useState("");

  return (
    <div className="space-y-2.5">
      <p className="text-xs text-muted-foreground">
        O SendFlow não emite chave de API: o servidor só aceita login por navegador
        (<code className="text-[10px]">authorization_code</code>). Autorize uma vez, cole aqui o
        <strong> refresh token</strong> e o Loyola X renova o acesso sozinho daí em diante.
      </p>
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="space-y-1">
          <Label className="text-[10px]">Client ID</Label>
          <Input value={clientId} onChange={(e) => setClientId(e.target.value)} className="h-7 text-xs" placeholder="mcp_client_…" />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px]">Client Secret</Label>
          <Input type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} className="h-7 text-xs" placeholder="mcp_secret_…" />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px]">Refresh Token</Label>
          <Input type="password" value={refreshToken} onChange={(e) => setRefreshToken(e.target.value)} className="h-7 text-xs" />
        </div>
      </div>
      <Button
        size="sm"
        className="h-7 text-xs"
        disabled={!clientId.trim() || !clientSecret.trim() || !refreshToken.trim() || salvar.isPending}
        onClick={() =>
          salvar.mutate(
            { clientId: clientId.trim(), clientSecret: clientSecret.trim(), refreshToken: refreshToken.trim() },
            {
              onSuccess: () => { toast.success("SendFlow conectado"); setClientSecret(""); setRefreshToken(""); },
              onError: (e) => toast.error(e instanceof Error ? e.message : "Não consegui conectar"),
            },
          )
        }
      >
        {salvar.isPending ? "Validando..." : "Conectar"}
      </Button>
      <p className="text-[10px] text-muted-foreground">
        As credenciais são validadas contra o SendFlow antes de gravar, e ficam criptografadas.
      </p>
    </div>
  );
}

export function SendflowCard({ projectId, funnelId }: { projectId: string; funnelId: string }) {
  const { data: conn, isLoading: carregandoConn } = useSendflowConnection(projectId);
  const { data, isLoading, error } = useSendflowSummary(projectId, funnelId, !!conn?.connected);

  if (carregandoConn) return <Skeleton className="h-40 rounded-xl" />;

  if (!conn?.connected) {
    return (
      <div className="rounded-xl border border-dashed border-border/40 bg-card p-4">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <MessageSquare className="h-4 w-4 text-emerald-600" />
          Grupos de WhatsApp (SendFlow)
        </h3>
        <p className="mb-3 mt-0.5 text-[11px] text-muted-foreground">
          Conecte para ver quantas pessoas estão nos grupos da campanha e trazer os disparos pro log.
        </p>
        <FormularioConexao projectId={projectId} />
      </div>
    );
  }

  if (isLoading) return <Skeleton className="h-40 rounded-xl" />;

  if (error) {
    return (
      <div className="rounded-xl border border-border/40 bg-card p-4">
        <h3 className="text-sm font-semibold">Grupos de WhatsApp (SendFlow)</h3>
        <p className="mt-1 text-xs text-amber-600 dark:text-amber-500">
          {error instanceof Error ? error.message : "Falha ao consultar o SendFlow."}
        </p>
      </div>
    );
  }
  if (!data) return null;

  if (data.semCampanha) {
    return (
      <div className="rounded-xl border border-dashed border-border/40 bg-card p-4">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          Grupos de WhatsApp (SendFlow)
        </h3>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Nenhuma campanha do SendFlow tem <strong>{data.tokenBuscado}</strong> no nome. O casamento
          usa o código do funil — ajuste o <em>match code</em> do funil ou o nome da campanha lá.
        </p>
        {data.campanhasDisponiveis.length > 0 && (
          <p className="mt-1.5 text-[10px] text-muted-foreground/80">
            Disponíveis: {data.campanhasDisponiveis.map((c) => c.name).join(" · ")}
          </p>
        )}
      </div>
    );
  }

  const disparosOk = data.disparos.filter((d) => d.tipo === "sendMessages");
  const ultimo = disparosOk[0]?.quando ?? null;

  return (
    <div className="rounded-xl border border-border/40 bg-card p-4">
      <div className="mb-3">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <MessageSquare className="h-4 w-4 text-emerald-600" />
          Grupos de WhatsApp
        </h3>
        <p className="text-[11px] text-muted-foreground">{data.campanha.name}</p>
      </div>

      <div className="mb-4 flex flex-wrap gap-5">
        <Numero
          icon={Users}
          label="Pessoas nos grupos"
          valor={nf(data.totalParticipantes)}
          sub={`${data.grupos.length} grupo${data.grupos.length !== 1 ? "s" : ""}`}
        />
        <Numero
          icon={TrendingUp}
          label="Entradas"
          valor={nf(data.entradas.total)}
          cor="text-emerald-600 dark:text-emerald-500"
          sub={data.entradas.porDia.length ? `${data.entradas.porDia.length} dias com entrada` : undefined}
        />
        <Numero
          icon={TrendingDown}
          label="Saídas"
          valor={nf(data.saidas.total)}
          cor="text-red-500"
        />
        <Numero icon={MousePointerClick} label="Cliques" valor={nf(data.cliques.total)} />
        <Numero
          icon={MessageSquare}
          label="Disparos"
          valor={nf(disparosOk.length)}
          sub={ultimo ? `último em ${ultimo.slice(0, 10).split("-").reverse().join("/")}` : undefined}
        />
      </div>

      <div className="space-y-1">
        {data.grupos.map((g) => (
          <div key={g.id} className="flex items-baseline justify-between gap-3 text-xs">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate text-muted-foreground">{g.name}</span>
              {g.cheio && (
                <span className="shrink-0 rounded bg-amber-500/15 px-1 text-[9px] font-medium text-amber-600 dark:text-amber-500">
                  cheio
                </span>
              )}
            </span>
            <span className="shrink-0 tabular-nums">
              <strong>{nf(g.participantes)}</strong>
              <span className="ml-1 text-[10px] text-muted-foreground">pessoas</span>
            </span>
          </div>
        ))}
      </div>

      {/* Limite honesto, à vista: o time perguntaria "cadê o texto?" e a
          resposta tem que estar aqui, não numa conversa. */}
      <p className="mt-3 flex items-start gap-1.5 border-t border-border/30 pt-2 text-[10px] text-muted-foreground">
        <Link2 className="mt-0.5 h-3 w-3 shrink-0" />
        Os disparos entram no log com data, hora e status. O SendFlow não expõe o texto da mensagem
        enviada, então o conteúdo não aparece aqui.
      </p>
    </div>
  );
}
