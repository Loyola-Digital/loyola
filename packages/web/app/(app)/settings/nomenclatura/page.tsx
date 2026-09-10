"use client";

/**
 * Configurações → Nomenclatura (Epic 47 / Story 47.2).
 *
 * O dicionário de onde sai cada um dos nove campos do nome de campanha do
 * perpétuo (`bbe_churrasco_a01_of01_2026_hot_cbo_videos_lpa`): experts,
 * produtos, funis, ofertas, LPs e valores fixos — e a seção Campanhas (Story
 * 47.3): gerador de nome, listagem e validador de nome existente.
 *
 * Seção e aba vivem na URL (`?secao=&aba=`) — regra 1 do Epic 46. A árvore é
 * dado em `lib/utils/nomenclatura-abas.ts`; aqui só se desenha. "Slug de LP"
 * é seção própria sem sub-abas (Story 47.7).
 *
 * Permissões (D3): `guest` nem chega aqui (o middleware redireciona rotas
 * globais); todo outro papel edita.
 */

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useUserRole } from "@/lib/hooks/use-user-role";
import { ABAS_DE_CAMPANHAS, ABAS_DO_DICIONARIO, SECOES, abaAtiva, hrefDaSecao, hrefDe } from "@/lib/utils/nomenclatura-abas";
import { AbaExperts, AbaFunisOuOfertas, AbaLps, AbaProdutos, AbaValoresFixos } from "@/components/nomenclatura/abas";
import { GeradorDeCampanha } from "@/components/nomenclatura/gerador-de-campanha";
import { ListaDeCampanhas } from "@/components/nomenclatura/lista-de-campanhas";
import { ValidadorDeNome } from "@/components/nomenclatura/validador-de-nome";
import { GeradorDeSlug } from "@/components/nomenclatura/gerador-de-slug";
import { Legadas } from "@/components/nomenclatura/legadas";

export default function NomenclaturaPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <Nomenclatura />
    </Suspense>
  );
}

function Nomenclatura() {
  const params = useSearchParams();
  const ativa = abaAtiva(params);
  const role = useUserRole();
  const podeEditar = role !== null && role !== "guest";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Nomenclatura de campanhas</CardTitle>
          <CardDescription>
            O nome de cada campanha do perpétuo tem nove campos separados por <code className="font-mono">_</code>:{" "}
            <code className="font-mono">expert_produto_funil_oferta_ano_temp_leilao_formato_lp</code>. Aqui fica o dicionário de onde cada campo sai. Código não muda de significado nem é reaproveitado — desative em vez de excluir.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Seções */}
          <nav aria-label="Seções" className="flex gap-1 border-b">
            {SECOES.map((s) =>
              s.disponivel ? (
                <Link
                  key={s.value}
                  href={hrefDaSecao(s.value)}
                  className={cn(
                    "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                    ativa.secao === s.value ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {s.label}
                </Link>
              ) : (
                <span key={s.value} className="-mb-px cursor-not-allowed border-b-2 border-transparent px-3 py-2 text-sm font-medium text-muted-foreground/60" title="Em breve">
                  {s.label} <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide">Em breve</span>
                </span>
              ),
            )}
          </nav>

          {/* Abas da seção — a seção Slug de LP não tem sub-abas (47.7) */}
          {ativa.secao === "slug" ? null : ativa.secao === "dicionario" ? (
            <nav aria-label="Abas do dicionário" className="flex flex-wrap gap-1">
              {ABAS_DO_DICIONARIO.map((a) => (
                <Link
                  key={a.value}
                  href={hrefDe("dicionario", a.value)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm transition-colors",
                    ativa.aba === a.value ? "bg-accent text-accent-foreground font-medium" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                  )}
                >
                  {a.label}
                </Link>
              ))}
            </nav>
          ) : (
            <nav aria-label="Abas de campanhas" className="flex flex-wrap gap-1">
              {ABAS_DE_CAMPANHAS.map((a) => (
                <Link
                  key={a.value}
                  href={hrefDe("campanhas", a.value)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm transition-colors",
                    ativa.aba === a.value ? "bg-accent text-accent-foreground font-medium" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                  )}
                >
                  {a.label}
                </Link>
              ))}
            </nav>
          )}

          {ativa.secao === "slug" ? (
            <GeradorDeSlug podeEditar={podeEditar} />
          ) : ativa.secao === "campanhas" ? (
            ativa.aba === "lista" ? (
              <ListaDeCampanhas />
            ) : ativa.aba === "validar" ? (
              <ValidadorDeNome />
            ) : ativa.aba === "legadas" ? (
              <Legadas podeEditar={podeEditar} />
            ) : (
              <GeradorDeCampanha
                key={`${params.get("editar") ?? ""}|${params.get("duplicar") ?? ""}`}
                modo={params.get("editar") ? { tipo: "editar", id: params.get("editar")! } : params.get("duplicar") ? { tipo: "duplicar", id: params.get("duplicar")! } : { tipo: "nova" }}
              />
            )
          ) : ativa.aba === "experts" ? (
            <AbaExperts podeEditar={podeEditar} />
          ) : ativa.aba === "produtos" ? (
            <AbaProdutos podeEditar={podeEditar} />
          ) : ativa.aba === "funis" ? (
            <AbaFunisOuOfertas recurso="funis" podeEditar={podeEditar} />
          ) : ativa.aba === "ofertas" ? (
            <AbaFunisOuOfertas recurso="ofertas" podeEditar={podeEditar} />
          ) : ativa.aba === "lps" ? (
            <AbaLps podeEditar={podeEditar} />
          ) : (
            <AbaValoresFixos podeEditar={podeEditar} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
