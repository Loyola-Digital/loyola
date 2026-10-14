"use client";

/**
 * De onde vêm as vendas desta etapa: a planilha ou a API da Kiwify.
 *
 * ## Por que vive na configuração da etapa
 *
 * É configuração, não leitura: fica na aba Planilhas, ao lado das planilhas
 * que ela substitui, porque é ali que se procura "de onde esse número vem".
 * Antes só existia atrás do botão "Ajustar" do cartão de conferência, no meio
 * do dashboard — quem queria LIGAR a Kiwify não achava.
 *
 * O cartão de conferência usa o mesmo formulário dentro do diálogo dele: um
 * form só, para as duas telas não divergirem.
 *
 * ## A ordem dos campos é o fluxo
 *
 * fonte → produto → oferta → janela. A oferta depende do produto (a lista sai
 * das vendas dos produtos MARCADOS, na hora, sem precisar salvar), e a janela
 * só importa de verdade quando o produto vende sem oferta nenhuma.
 */

import { useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { periodoCurto } from "@/lib/utils/periodo-da-oferta";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useDisableKiwifyStageConfig,
  useKiwifyOfertas,
  useKiwifyProducts,
  useKiwifyStageConfig,
  useSaveKiwifyStageConfig,
  useSincronizarVendasKiwify,
  type KiwifyStageConfig,
} from "@/lib/hooks/use-kiwify-reconciliation";

/** As duas fontes, com o que cada uma faz — o texto é parte da decisão. */
const FONTES = [
  { v: "planilha" as const, titulo: "Planilha", ajuda: "Como hoje. Só confere com a Kiwify." },
  { v: "kiwify" as const, titulo: "API da Kiwify", ajuda: "A planilha passa a ser ignorada." },
];

interface FormProps {
  projectId: string;
  funnelId: string;
  stageId: string;
  atual: KiwifyStageConfig | null;
  /** O diálogo fecha depois de salvar; a seção inline fica aberta. */
  onSalvo?: () => void;
  /** `true` enquanto o formulário está visível — segura as buscas de produto. */
  ativo?: boolean;
}

export function FonteDeVendasForm({
  projectId,
  funnelId,
  stageId,
  atual,
  onSalvo,
  ativo = true,
}: FormProps) {
  const produtos = useKiwifyProducts(projectId, ativo);
  const salvar = useSaveKiwifyStageConfig(projectId, funnelId, stageId);
  const desligar = useDisableKiwifyStageConfig(projectId, funnelId, stageId);
  const sincronizar = useSincronizarVendasKiwify(projectId);
  const [selecionados, setSelecionados] = useState<string[]>(atual?.productIds ?? []);
  const [data, setData] = useState(atual?.startDate ?? "");
  const [dataFim, setDataFim] = useState(atual?.endDate ?? "");
  const [fonte, setFonte] = useState<"planilha" | "kiwify">(atual?.fonteDeVendas ?? "planilha");
  const [ofertas, setOfertas] = useState<string[]>(atual?.offerIds ?? []);
  const [precoIngresso, setPrecoIngresso] = useState(
    atual?.ticketPrice != null ? String(atual.ticketPrice) : "",
  );
  const [busca, setBusca] = useState("");

  // As ofertas dos produtos MARCADOS agora — não dos salvos. Só busca na fonte
  // Kiwify e com produto marcado: elas saem das vendas sincronizadas, e
  // perguntar antes disso só traz lista vazia.
  const ofertasDisponiveis = useKiwifyOfertas(
    projectId,
    funnelId,
    stageId,
    ativo && fonte === "kiwify" && selecionados.length > 0,
    selecionados,
  );

  const lista = (produtos.data?.products ?? []).filter((p) =>
    busca.trim() ? p.name.toLowerCase().includes(busca.trim().toLowerCase()) : true,
  );

  // Oferta marcada de um produto que foi desmarcado não pode seguir no recorte:
  // ela sumiria da lista e continuaria filtrando em silêncio.
  function alternarProduto(id: string) {
    if (selecionados.includes(id)) {
      const idsQueFicam = new Set(
        (ofertasDisponiveis.data?.ofertas ?? [])
          .filter((o) => o.produtoId !== id)
          .map((o) => o.id),
      );
      setOfertas((marcadas) => marcadas.filter((x) => idsQueFicam.has(x)));
      setSelecionados((atuais) => atuais.filter((x) => x !== id));
      return;
    }
    setSelecionados((atuais) => [...atuais, id]);
  }

  return (
    <div className="space-y-3">
      {/* 1. De onde vêm as vendas. É a escolha que muda todo número da etapa. */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium">De onde vêm as vendas</Label>
        <div className="grid grid-cols-2 gap-2">
          {FONTES.map((o) => (
            <button
              key={o.v}
              type="button"
              onClick={() => setFonte(o.v)}
              className={cn(
                "flex flex-col gap-0.5 rounded-md border p-2 text-left text-xs transition-colors",
                fonte === o.v
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border hover:bg-muted",
              )}
            >
              <span className="font-medium">{o.titulo}</span>
              <span className="text-[11px] leading-tight text-muted-foreground">{o.ajuda}</span>
            </button>
          ))}
        </div>
        {fonte === "kiwify" && (
          <p className="text-[11px] text-muted-foreground">
            A venda já chega com UTM da própria Kiwify — na conta medida, <strong>92% delas</strong>.
            Recusada e aguardando pagamento ficam de fora da conta.
          </p>
        )}
      </div>

      {/* 2. O produto. Vem antes da oferta porque a oferta depende dele. */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium">
          Produtos{" "}
          {selecionados.length > 0 && (
            <span className="font-normal text-muted-foreground">
              ({selecionados.length} selecionado(s))
            </span>
          )}
        </Label>
        <Input
          placeholder="Buscar produto…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        {produtos.isLoading ? (
          <Skeleton className="h-40" />
        ) : lista.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">Nenhum produto encontrado.</p>
        ) : (
          <div className="max-h-56 space-y-0.5 overflow-y-auto rounded-md border border-border/40 p-1">
            {lista.map((p) => {
              const marcado = selecionados.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => alternarProduto(p.id)}
                  className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs transition-colors ${
                    marcado ? "bg-primary/10 font-medium" : "hover:bg-muted"
                  }`}
                >
                  <span
                    className={`h-3 w-3 shrink-0 rounded-sm border ${
                      marcado ? "border-primary bg-primary" : "border-border"
                    }`}
                  />
                  <span className="truncate" title={p.name}>
                    {p.name}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">
          A conta da Kiwify tem todos os produtos do expert — selecionar o errado traz venda que
          não é desta etapa.
        </p>
      </div>

      {/* 3. A oferta, só dos produtos marcados. */}
      {fonte === "kiwify" && (
        <div className="space-y-1.5 rounded-md border p-2">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs font-medium">
              Ofertas{" "}
              <span className="font-normal text-muted-foreground">
                {ofertas.length === 0 ? "(todas)" : `${ofertas.length} escolhida(s)`}
              </span>
            </Label>
            <Button
              size="sm"
              variant="outline"
              className="h-6 gap-1 text-[11px]"
              disabled={sincronizar.isPending}
              onClick={() =>
                sincronizar.mutate(
                  {},
                  {
                    onSuccess: (r) =>
                      toast.success(`${r.gravadas} venda(s) sincronizada(s) de ${r.de} a ${r.ate}`),
                    onError: (e) =>
                      toast.error(e instanceof Error ? e.message : "Falha ao sincronizar"),
                  },
                )
              }
            >
              {sincronizar.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
              Sincronizar
            </Button>
          </div>
          {/* A lista sai das VENDAS, não do catálogo: a API da Kiwify não lista
              as ofertas de um produto. Dizer isso evita que uma lista vazia
              pareça "este produto não tem oferta". */}
          {selecionados.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              Escolha um produto acima para ver as ofertas dele.
            </p>
          ) : ofertasDisponiveis.isLoading ? (
            <Skeleton className="h-20" />
          ) : (ofertasDisponiveis.data?.ofertas.length ?? 0) === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              {ofertasDisponiveis.data?.sincronizadoEm
                ? "Nenhuma venda sincronizada para os produtos escolhidos."
                : "Sincronize para ver as ofertas — elas saem das vendas, não do catálogo da Kiwify."}
            </p>
          ) : (
            <>
              <div className="max-h-40 space-y-0.5 overflow-y-auto">
                {ofertasDisponiveis.data?.ofertas.map((o) => (
                  <label
                    key={`${o.produto}:${o.id}`}
                    className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-[11px] hover:bg-muted"
                  >
                    <input
                      type="checkbox"
                      checked={ofertas.includes(o.id)}
                      onChange={(e) =>
                        setOfertas((atuais) =>
                          e.target.checked ? [...atuais, o.id] : atuais.filter((x) => x !== o.id),
                        )
                      }
                    />
                    <span className="font-medium">{o.nome}</span>
                    <span className="truncate text-muted-foreground">{o.produto}</span>
                    {/* O período é o que distingue duas ofertas do MESMO produto
                        que vendem para funis diferentes. */}
                    {o.de && (
                      <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">
                        {periodoCurto(o.de, o.ate)}
                      </span>
                    )}
                    <span
                      className={cn(
                        "shrink-0 tabular-nums text-muted-foreground",
                        !o.de && "ml-auto",
                      )}
                    >
                      {o.vendas}
                    </span>
                  </label>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Nenhuma marcada = <strong>todas</strong>. Marque só as ofertas deste funil — o
                mesmo produto pode vender por uma oferta aqui e por outra em outro funil. A data ao
                lado é o período em que cada uma vendeu, e o número, quantas vendas tem hoje —
                inclusive <strong>(sem oferta)</strong>, que existe de verdade e sumiria do recorte
                se não pudesse ser marcada.
              </p>
            </>
          )}
        </div>
      )}

      {/* 4. A janela. */}
      <div className="space-y-1.5">
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="kiwify-data" className="text-xs font-medium">
              Contar a partir de{" "}
              {fonte === "kiwify" && (
                <span className="font-normal text-muted-foreground">(opcional)</span>
              )}
            </Label>
            <Input
              id="kiwify-data"
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
            />
          </div>
          {/* O fim só aparece na fonte Kiwify: a conferência com a planilha
              compara até hoje, e um fim ali faria a divergência mudar de
              significado sem avisar. */}
          {fonte === "kiwify" && (
            <div className="space-y-1.5">
              <Label htmlFor="kiwify-data-fim" className="text-xs font-medium">
                até <span className="font-normal text-muted-foreground">(opcional)</span>
              </Label>
              <Input
                id="kiwify-data-fim"
                type="date"
                value={dataFim}
                min={data || undefined}
                onChange={(e) => setDataFim(e.target.value)}
              />
            </div>
          )}
        </div>
        {fonte === "kiwify" && !data && !dataFim && (
          <p className="text-[11px] text-muted-foreground">
            Em branco, a etapa pega tudo que já foi sincronizado. A <strong>conferência</strong> com
            a planilha, essa precisa da data de início.
          </p>
        )}
        {/* O fim importa quando o produto vende SEM oferta: ali não há o que
            marcar na lista acima, e só a janela separa um funil do outro. */}
        {fonte === "kiwify" && !dataFim && (
          <p className="text-[11px] text-muted-foreground">
            Sem fim, a janela segue aberta — se o produto for reaproveitado em outro funil depois, a
            venda de lá entra aqui.
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="kiwify-ingresso" className="text-xs font-medium">
          Preço de um ingresso <span className="font-normal text-muted-foreground">(opcional)</span>
        </Label>
        <Input
          id="kiwify-ingresso"
          type="number"
          step="0.01"
          min="0"
          value={precoIngresso}
          onChange={(e) => setPrecoIngresso(e.target.value)}
          placeholder="ex.: 1097"
        />
        <p className="text-[11px] text-muted-foreground">
          A Kiwify manda <strong>uma venda só</strong> quando a pessoa compra vários ingressos. Com
          o preço unitário, dá para descobrir quantos foram — o valor da compra é múltiplo dele. Sem
          isso, cada venda conta como um ingresso.
        </p>
      </div>

      <div className="flex items-center justify-between gap-2">
        {atual && (
          <Button
            variant="ghost"
            size="sm"
            className="text-[11px] text-muted-foreground hover:text-red-500"
            disabled={desligar.isPending}
            onClick={() =>
              desligar.mutate(undefined, {
                onSuccess: () => {
                  toast.success("Kiwify desligada nesta etapa");
                  onSalvo?.();
                },
              })
            }
          >
            Desligar
          </Button>
        )}
        <Button
          size="sm"
          className="ml-auto gap-1.5"
          disabled={salvar.isPending || selecionados.length === 0 || (fonte === "planilha" && !data)}
          onClick={() =>
            salvar.mutate(
              {
                productIds: selecionados,
                startDate: data || null,
                endDate: dataFim || null,
                fonteDeVendas: fonte,
                offerIds: ofertas,
                // Campo vazio significa "não sei o preço", e é diferente de
                // zero: manda `null` para cada venda voltar a contar 1.
                ticketPrice: precoIngresso.trim() ? Number(precoIngresso) : null,
              },
              {
                onSuccess: () => {
                  toast.success(
                    fonte === "kiwify"
                      ? "Vendas desta etapa agora vêm da Kiwify"
                      : "Conferência configurada",
                  );
                  onSalvo?.();
                },
                onError: (e) => toast.error(e instanceof Error ? e.message : "Não consegui salvar"),
              },
            )
          }
        >
          {salvar.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Salvar
        </Button>
      </div>
    </div>
  );
}

/**
 * A seção inline da aba Planilhas. Diferente do diálogo do cartão, aparece
 * SEMPRE — é por aqui que se liga a Kiwify numa etapa que nunca a usou.
 */
export function FonteDeVendasDaEtapa({
  projectId,
  funnelId,
  stageId,
}: {
  projectId: string;
  funnelId: string;
  stageId: string;
}) {
  const cfg = useKiwifyStageConfig(projectId, funnelId, stageId);

  // Backend numa versão anterior à do site: a rota não existe e o Fastify
  // responde 404. Sem o aviso a seção apenas sumiria.
  const rotaInexistente =
    cfg.isError && (cfg.error as { status?: number } | null)?.status === 404;

  const ligada = cfg.data?.config?.fonteDeVendas === "kiwify";

  return (
    <section className="space-y-3">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          De onde vêm as vendas
          {ligada && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
              API da Kiwify
            </span>
          )}
        </h3>
        <p className="text-xs text-muted-foreground">
          A etapa pode ler as vendas das planilhas abaixo ou puxá-las direto da API da Kiwify —
          escolhendo o produto e as ofertas deste funil.
        </p>
      </div>

      {rotaInexistente ? (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          O servidor está numa versão anterior à deste site — esta configuração aparece depois do
          próximo deploy.
        </p>
      ) : cfg.isLoading ? (
        <Skeleton className="h-32" />
      ) : cfg.data?.conectado === false ? (
        <p className="text-xs text-muted-foreground">
          A Kiwify não está conectada neste projeto. Conecte em{" "}
          <strong>Projeto → Assinaturas</strong> (Client ID, Client Secret e Account ID) e a
          configuração aparece aqui.
        </p>
      ) : (
        <FonteDeVendasForm
          projectId={projectId}
          funnelId={funnelId}
          stageId={stageId}
          atual={cfg.data?.config ?? null}
        />
      )}
    </section>
  );
}
