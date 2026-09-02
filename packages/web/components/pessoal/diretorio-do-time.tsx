"use client";

/**
 * O time inteiro — quem é quem.
 *
 * ## Para que serve
 *
 * Onboarding. Quem entra hoje precisa de uma coisa que não existia: uma tela
 * onde ver rosto, nome e função de todo mundo de uma vez. Perguntar "quem é o
 * designer?" no primeiro dia é o tipo de atrito que um diretório resolve.
 *
 * ## O recorte é do SERVIDOR
 *
 * Telefone, contato de emergência e saldo de férias nem chegam aqui — a rota
 * `/api/pessoal/time` devolve só nome, foto, cargo e entrada. Filtrar na tela
 * deixaria o dado trafegando de qualquer forma.
 *
 * ## Sem foto não é buraco
 *
 * Sete das quinze pessoas têm retrato (vem do PDI); as outras oito ficam com
 * as iniciais sobre uma cor derivada do nome. Uma silhueta cinza repetida oito
 * vezes não distingue ninguém — que é o oposto do que a tela existe para
 * fazer.
 */

import { useMemo, useState } from "react";
import { Search, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useDiretorioDoTime, type PessoaNoDiretorio } from "@/lib/hooks/use-pessoal";

/** Tira acento para a busca casar "Thyago" com "thiago" digitado sem cuidado. */
function semAcento(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** As iniciais que entram no lugar da foto: primeira e última palavra. */
function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0]!.slice(0, 2).toUpperCase();
  return (partes[0]![0]! + partes.at(-1)![0]!).toUpperCase();
}

/**
 * Uma cor estável para o avatar sem foto.
 *
 * Derivada do nome, então a mesma pessoa tem sempre a mesma cor — é o que
 * permite reconhecê-la de relance depois de duas ou três visitas, mesmo sem
 * retrato.
 */
const CORES = [
  "#6D5BD0", "#C2851B", "#2D7F8C", "#C4503F", "#4B8B3B",
  "#B0457B", "#3F6FB5", "#8A6A3C", "#9A3F8F", "#2F8F6E",
] as const;

function corDoNome(nome: string): string {
  let soma = 0;
  for (const c of nome) soma = (soma * 31 + c.charCodeAt(0)) % 100_000;
  return CORES[soma % CORES.length]!;
}

/** "2024-03-15" → "há 1 ano e 6 meses". Tempo de casa, não a data crua. */
function tempoDeCasa(iso: string | null): string | null {
  if (!iso) return null;
  const [a, m] = iso.split("-").map(Number);
  if (!a || !m) return null;
  const hoje = new Date();
  const meses = (hoje.getFullYear() - a) * 12 + (hoje.getMonth() + 1 - m);
  if (meses < 0) return null;
  if (meses < 1) return "entrou este mês";
  if (meses < 12) return `há ${meses} ${meses === 1 ? "mês" : "meses"}`;
  const anos = Math.floor(meses / 12);
  const resto = meses % 12;
  const parteAnos = `${anos} ${anos === 1 ? "ano" : "anos"}`;
  return resto === 0
    ? `há ${parteAnos}`
    : `há ${parteAnos} e ${resto} ${resto === 1 ? "mês" : "meses"}`;
}

function CartaoDaPessoa({ pessoa }: { pessoa: PessoaNoDiretorio }) {
  const [fotoQuebrou, setFotoQuebrou] = useState(false);
  const tempo = tempoDeCasa(pessoa.entradaEm);
  const cor = corDoNome(pessoa.nome);

  return (
    <article className="flex items-center gap-3 rounded-xl border border-border/50 bg-card p-3 transition-colors hover:bg-muted/30">
      {pessoa.foto && !fotoQuebrou ? (
        <img
          src={pessoa.foto}
          alt={pessoa.nome}
          onError={() => setFotoQuebrou(true)}
          className="h-12 w-12 shrink-0 rounded-full object-cover"
        />
      ) : (
        <span
          className="grid h-12 w-12 shrink-0 place-items-center rounded-full text-sm font-semibold text-white"
          style={{ backgroundColor: cor }}
          aria-hidden
        >
          {iniciais(pessoa.nome)}
        </span>
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold leading-tight">{pessoa.nome}</p>
        <p className="truncate text-xs text-muted-foreground">
          {/* Sem cargo aparece como falta, não como vazio: é um convite para
              alguém preencher, e não um campo que parece não existir. */}
          {pessoa.cargo ?? <span className="italic opacity-70">cargo não preenchido</span>}
        </p>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground/80">
          {pessoa.email}
          {tempo && ` · ${tempo}`}
        </p>
      </div>
    </article>
  );
}

export function DiretorioDoTime() {
  const { data, isLoading } = useDiretorioDoTime();
  const [busca, setBusca] = useState("");

  const pessoas = data?.pessoas ?? [];

  const filtradas = useMemo(() => {
    const alvo = semAcento(busca.trim());
    if (!alvo) return pessoas;
    return pessoas.filter((p) =>
      semAcento(`${p.nome} ${p.nomeCompleto ?? ""} ${p.cargo ?? ""} ${p.email}`).includes(alvo),
    );
  }, [pessoas, busca]);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Users className="h-4 w-4 text-primary" />
          O time
          {pessoas.length > 0 && (
            <span className="text-sm font-normal text-muted-foreground">({pessoas.length})</span>
          )}
        </h2>

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou cargo…"
            className="h-9 pl-8 text-sm"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[74px] rounded-xl" />
          ))}
        </div>
      ) : filtradas.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border/40 p-8 text-center text-sm text-muted-foreground">
          {busca ? "Ninguém com esse nome ou cargo." : "Ninguém no time ainda."}
        </p>
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {filtradas.map((p) => (
            <CartaoDaPessoa key={p.userId} pessoa={p} />
          ))}
        </div>
      )}
    </section>
  );
}
