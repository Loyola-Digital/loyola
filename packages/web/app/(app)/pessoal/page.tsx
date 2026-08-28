"use client";

/**
 * Pessoal (RH).
 *
 * Admin vê o time e abre a ficha de qualquer um; as demais pessoas caem direto
 * na própria ficha, em leitura. É a mesma tela porque o conteúdo é o mesmo — o
 * que muda é quem pode escrever, e isso o servidor já decide.
 *
 * O PDI entra como aba em vez de link para outra página: quando alguém está
 * olhando a ficha de uma pessoa, o plano de desenvolvimento dela faz parte do
 * assunto.
 */

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertCircle, ArrowLeft, CalendarDays, Search, Settings2, Target, UserRound, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AusenciasPessoa } from "@/components/pessoal/ausencias-pessoa";
import { FichaPessoa, dataBr, tempoDeCasa } from "@/components/pessoal/ficha-pessoa";
import { PdiViewer } from "@/components/pdi/pdi-viewer";
import { useMeuPdi, usePdiLista, usePdiPorId } from "@/lib/hooks/use-pdi";
import {
  useMinhaFicha,
  usePessoa,
  usePessoas,
  type Ficha,
  type PessoaNaLista,
} from "@/lib/hooks/use-pessoal";
import { useUserRole } from "@/lib/hooks/use-user-role";

const semAcento = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/**
 * Lê a aba pedida na URL.
 *
 * Componente separado e sob <Suspense> porque `useSearchParams` obriga a isso
 * no Next — sem a fronteira, o build falha ao pré-renderizar a página.
 *
 * Existe para o redirecionamento de `/pdi`: quem tinha o PDI como tela inicial
 * continua caindo direto nele, agora dentro da ficha.
 */
function AbaDaUrl({ onAba }: { onAba: (aba: string) => void }) {
  const params = useSearchParams();
  const aba = params.get("aba");
  useEffect(() => {
    if (aba === "pdi" || aba === "ausencias" || aba === "dados") onAba(aba);
  }, [aba, onAba]);
  return null;
}

/** O PDI de outra pessoa: acha o documento dela na lista e carrega o HTML. */
function PdiDaPessoa({ userId }: { userId: string }) {
  const { data: lista, isLoading: carregandoLista } = usePdiLista();
  const doc = lista?.documentos.find((d) => d.userId === userId) ?? null;
  const { data, isLoading } = usePdiPorId(doc?.id ?? null);

  if (carregandoLista || (doc && isLoading)) return <Skeleton className="h-96 rounded-xl" />;
  if (!doc) return <SemPdi />;
  return data?.pdi ? <PdiViewer html={data.pdi.html} titulo={data.pdi.title} /> : <SemPdi />;
}

/** O PDI de quem está olhando. */
function MeuPdi() {
  const { data, isLoading } = useMeuPdi();
  if (isLoading) return <Skeleton className="h-96 rounded-xl" />;
  if (!data?.pdi) return <SemPdi />;
  return <PdiViewer html={data.pdi.html} titulo={data.pdi.title} />;
}

function SemPdi() {
  return (
    <div className="rounded-xl border border-dashed border-border/50 p-8 text-center">
      <Target className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
      <p className="text-sm font-medium">Sem PDI atribuído</p>
      <p className="mt-1 text-xs text-muted-foreground">
        O Plano de Desenvolvimento Individual é atribuído em PDI → Gerenciar.
      </p>
    </div>
  );
}

/** Ficha completa, com as três abas. */
function Detalhe({
  ficha,
  ausencias,
  saldo,
  pessoas,
  editavel,
  ehPropria,
  aba,
  onAba,
}: {
  ficha: Ficha;
  ausencias: React.ComponentProps<typeof AusenciasPessoa>["ausencias"];
  saldo: React.ComponentProps<typeof AusenciasPessoa>["saldo"];
  pessoas: { userId: string; nome: string }[];
  editavel: boolean;
  ehPropria: boolean;
  aba: string;
  onAba: (v: string) => void;
}) {
  return (
    <Tabs value={aba} onValueChange={onAba}>
      <TabsList>
        <TabsTrigger value="dados" className="gap-1.5 text-xs">
          <UserRound className="h-3.5 w-3.5" />
          Dados pessoais
        </TabsTrigger>
        <TabsTrigger value="ausencias" className="gap-1.5 text-xs">
          <CalendarDays className="h-3.5 w-3.5" />
          Férias e ausências
        </TabsTrigger>
        <TabsTrigger value="pdi" className="gap-1.5 text-xs">
          <Target className="h-3.5 w-3.5" />
          PDI
        </TabsTrigger>
      </TabsList>
      <TabsContent value="dados" className="mt-4">
        <FichaPessoa ficha={ficha} editavel={editavel} />
      </TabsContent>
      <TabsContent value="ausencias" className="mt-4">
        <AusenciasPessoa
          userId={ficha.userId}
          ausencias={ausencias}
          saldo={saldo}
          pessoas={pessoas}
          editavel={editavel}
        />
      </TabsContent>
      <TabsContent value="pdi" className="mt-4">
        {ehPropria ? <MeuPdi /> : <PdiDaPessoa userId={ficha.userId} />}
      </TabsContent>
    </Tabs>
  );
}

function CartaoDaPessoa({ p, onAbrir }: { p: PessoaNaLista; onAbrir: () => void }) {
  return (
    <button
      type="button"
      onClick={onAbrir}
      className="flex items-center gap-3 rounded-xl border border-border/40 bg-card/60 p-3 text-left transition-colors hover:border-primary/40 hover:bg-card"
    >
      {p.foto ? (
        /* <img> puro: data: URI, nada a otimizar. */
        <img src={p.foto} alt={p.nome} className="h-11 w-11 shrink-0 rounded-full object-cover" />
      ) : (
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted font-semibold text-muted-foreground">
          {p.nome.charAt(0).toUpperCase()}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-medium">{p.nome}</p>
          {p.ausenteAgora && (
            <Badge className="shrink-0 bg-amber-500/15 text-[10px] text-amber-600 dark:text-amber-400">
              fora
            </Badge>
          )}
          {!p.temFicha && (
            <Badge variant="outline" className="shrink-0 text-[10px] text-muted-foreground">
              sem ficha
            </Badge>
          )}
        </div>
        <p className="truncate text-[11px] text-muted-foreground">
          {p.cargo || "cargo não informado"}
          {p.entradaEm ? ` · ${tempoDeCasa(p.entradaEm)} de casa` : ""}
        </p>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
          {p.saldo.disponivel} {p.saldo.disponivel === 1 ? "dia" : "dias"} de férias
          {p.proxima ? ` · próx. ${dataBr(p.proxima.inicio)}` : ""}
        </p>
      </div>
    </button>
  );
}

export default function PessoalPage() {
  const role = useUserRole();
  const ehAdmin = role === "admin";
  const { data: lista, isLoading: carregandoLista } = usePessoas(ehAdmin);
  const { data: minha, isLoading: carregandoMinha } = useMinhaFicha(!ehAdmin);
  const [aberta, setAberta] = useState<string | null>(null);
  const { data: detalhe, isLoading: carregandoDetalhe } = usePessoa(aberta);
  const [busca, setBusca] = useState("");
  // Aba da ficha. Controlada porque o redirecionamento de /pdi pede uma
  // específica pela URL.
  const [aba, setAba] = useState("dados");

  const pessoas = useMemo(
    () => (lista?.pessoas ?? []).map((p) => ({ userId: p.userId, nome: p.nome })),
    [lista],
  );

  const filtradas = useMemo(() => {
    const alvo = semAcento(busca.trim());
    if (!alvo) return lista?.pessoas ?? [];
    return (lista?.pessoas ?? []).filter((p) =>
      semAcento(`${p.nome} ${p.cargo ?? ""} ${p.email}`).includes(alvo),
    );
  }, [lista, busca]);

  if (role === "guest") {
    return (
      <div className="rounded-xl border border-dashed border-border/40 p-12 text-center">
        <AlertCircle className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          O painel Pessoal é restrito à equipe interna.
        </p>
      </div>
    );
  }

  // ---- Quem não é admin vê a própria ficha, e só ----
  if (!ehAdmin) {
    if (carregandoMinha) return <Skeleton className="h-96 rounded-xl" />;
    if (!minha) return null;
    return (
      <div className="space-y-6">
        <Suspense fallback={null}>
          <AbaDaUrl onAba={setAba} />
        </Suspense>
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <UserRound className="h-6 w-6 text-primary" />
            Minha ficha
          </h1>
          <p className="text-sm text-muted-foreground">
            Seus dados, suas férias e seu PDI. Para corrigir algo, fale com a liderança.
          </p>
        </div>
        <Detalhe
          ficha={minha.ficha}
          ausencias={minha.ausencias}
          saldo={minha.saldo}
          pessoas={[]}
          editavel={false}
          ehPropria
          aba={aba}
          onAba={setAba}
        />
      </div>
    );
  }

  // ---- Admin: ficha aberta ----
  if (aberta) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2" onClick={() => setAberta(null)}>
          <ArrowLeft className="h-3.5 w-3.5" />
          Todo o time
        </Button>
        {carregandoDetalhe || !detalhe ? (
          <Skeleton className="h-96 rounded-xl" />
        ) : (
          <Detalhe
            ficha={detalhe.ficha}
            ausencias={detalhe.ausencias}
            saldo={detalhe.saldo}
            pessoas={pessoas}
            editavel
            ehPropria={false}
            aba={aba}
            onAba={setAba}
          />
        )}
      </div>
    );
  }

  // ---- Admin: o time ----
  const foraHoje = (lista?.pessoas ?? []).filter((p) => p.ausenteAgora);

  return (
    <div className="space-y-6">
      <Suspense fallback={null}>
        <AbaDaUrl onAba={setAba} />
      </Suspense>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Users className="h-6 w-6 text-primary" />
            Pessoal
          </h1>
          <p className="text-sm text-muted-foreground">
            Ficha, férias e PDI de cada pessoa do time.
          </p>
        </div>
        {/* Atribuir PDI continua em tela própria: é upload de documento, não
            edição de ficha. O caminho até ela é que passa por aqui agora. */}
        <Button asChild variant="outline" size="sm" className="gap-1.5">
          <Link href="/pdi/gerenciar">
            <Settings2 className="h-3.5 w-3.5" />
            Gerenciar PDIs
          </Link>
        </Button>
      </div>

      {foraHoje.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
            Fora hoje
          </p>
          <p className="mt-1 text-sm">
            {foraHoje.map((p) => p.nome).join(", ")}
          </p>
        </div>
      )}

      <div className="relative max-w-xs">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome, cargo ou e-mail"
          className="h-8 pl-8 text-sm"
        />
      </div>

      {carregandoLista ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : filtradas.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/50 p-10 text-center">
          <p className="text-sm text-muted-foreground">
            {(lista?.pessoas ?? []).length === 0 ? "Ninguém no time ainda." : "Ninguém com esse termo."}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtradas.map((p) => (
            <CartaoDaPessoa key={p.userId} p={p} onAbrir={() => setAberta(p.userId)} />
          ))}
        </div>
      )}
    </div>
  );
}
