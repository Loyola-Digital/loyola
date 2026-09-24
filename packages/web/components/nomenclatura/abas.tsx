"use client";

/**
 * Story 47.2 — as seis abas do Dicionário (spec § 6), cada uma sobre a mesma
 * `TabelaDoDicionario` e o mesmo `DialogoDeExclusao`, com o formulário certo.
 */

import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { erroDaApi, useAlternarAtivo, useListaDe, type Expert, type FunilOuOferta, type Lp, type Produto, type TipoDeValor, type ValorFixo } from "@/lib/hooks/use-nomenclatura";
import { CASCATA_VAZIA, type Cascata } from "@/lib/utils/nomenclatura-cascata";
import { expertInicialDaUrl } from "@/lib/utils/nomenclatura-abas";
import { DialogoDeExclusao, type AlvoDaExclusao } from "./dialogo-de-exclusao";
import { CascataDeSelects, FormExpert, FormFunilOuOferta, FormLp, FormProduto, FormValorFixo, ROTULO_DO_TIPO } from "./forms";
import { SeletorDeExpert } from "./seletor-de-expert";
import { TabelaDoDicionario } from "./tabela-do-dicionario";
import { toast } from "sonner";

/** Estado comum: inativos, formulário aberto (novo/editar), alvo de exclusão. */
function useAba<T extends { id: string; active: boolean }>() {
  const [inativos, setInativos] = useState(false);
  const [form, setForm] = useState<{ aberto: boolean; linha: T | null }>({ aberto: false, linha: null });
  const [alvo, setAlvo] = useState<AlvoDaExclusao | null>(null);
  return { inativos, setInativos, form, setForm, alvo, setAlvo, abrirNovo: () => setForm({ aberto: true, linha: null }), abrirEdicao: (l: T) => setForm({ aberto: true, linha: l }), fechar: () => setForm({ aberto: false, linha: null }) };
}

/** Reativar é direto; desativar passa pelo diálogo (expert tem cascata). */
function useReativar(recurso: Parameters<typeof useAlternarAtivo>[0]) {
  const alternar = useAlternarAtivo(recurso);
  return async (id: string, rotulo: string) => {
    try {
      await alternar.mutateAsync({ id, ativo: true });
      toast.success(`${rotulo} reativado.`);
    } catch (e) {
      toast.error(erroDaApi(e).mensagem);
    }
  };
}

const mensagemDeErro = (e: unknown) => {
  if (!e) return null;
  const err = erroDaApi(e);
  if (err.status === 404) return "A API ainda não tem as rotas da nomenclatura — provavelmente está atrás do painel. Veja o aviso de versão no topo.";
  // 503 `migration-pendente` já vem com a frase certa da API; 500 genérico ganha a pista de ambiente.
  if (err.status === 500) return "Erro interno na API ao ler a nomenclatura. Se este ambiente ainda não recebeu a migration 0142, é isso — não é dado zerado.";
  return err.mensagem;
};

export function AbaExperts({ podeEditar }: { podeEditar: boolean }) {
  const aba = useAba<Expert>();
  const lista = useListaDe("experts", { inativos: aba.inativos });
  const reativar = useReativar("experts");
  return (
    <>
      <TabelaDoDicionario<Expert>
        linhas={lista.data}
        carregando={lista.isLoading}
        erro={mensagemDeErro(lista.error)}
        colunas={[
          { chave: "code", titulo: "Sigla", mono: true },
          { chave: "name", titulo: "Nome" },
          { chave: "produtos", titulo: "Produtos", className: "text-right" },
          { chave: "funis", titulo: "Funis", className: "text-right" },
          { chave: "ofertas", titulo: "Ofertas", className: "text-right" },
        ]}
        buscaEm={["code", "name"]}
        ordenarPor="code"
        inativos={aba.inativos}
        onInativos={aba.setInativos}
        onNovo={aba.abrirNovo}
        onEditar={aba.abrirEdicao}
        onExcluir={(l) => aba.setAlvo({ recurso: "experts", id: l.id, rotulo: l.code })}
        onAlternar={(l, ativo) => (ativo ? void reativar(l.id, l.code) : aba.setAlvo({ recurso: "experts", id: l.id, rotulo: l.code, soDesativar: true }))}
        podeEditar={podeEditar}
        rotuloDoNovo="Novo expert"
      />
      <FormExpert aberto={aba.form.aberto} linha={aba.form.linha} onFechar={aba.fechar} />
      <DialogoDeExclusao alvo={aba.alvo} onFechar={() => aba.setAlvo(null)} />
    </>
  );
}

export function AbaProdutos({ podeEditar }: { podeEditar: boolean }) {
  const aba = useAba<Produto>();
  const [expertId, setExpertId] = useState("");
  const lista = useListaDe("produtos", { inativos: aba.inativos, expertId: expertId || undefined });
  const experts = useListaDe("experts", { inativos: true });
  const reativar = useReativar("produtos");
  const codeDo = (id: string) => experts.data?.find((e) => e.id === id)?.code ?? "?";
  return (
    <>
      <TabelaDoDicionario<Produto>
        linhas={lista.data}
        carregando={lista.isLoading}
        erro={mensagemDeErro(lista.error)}
        colunas={[
          { chave: "expertId", titulo: "Expert", mono: true, render: (l) => codeDo(l.expertId) },
          { chave: "slug", titulo: "Slug", mono: true },
          { chave: "name", titulo: "Nome" },
          { chave: "description", titulo: "Descrição", className: "max-w-[320px] truncate" },
        ]}
        buscaEm={["slug", "name", "description"]}
        ordenarPor="slug"
        inativos={aba.inativos}
        onInativos={aba.setInativos}
        onNovo={aba.abrirNovo}
        onEditar={aba.abrirEdicao}
        onExcluir={(l) => aba.setAlvo({ recurso: "produtos", id: l.id, rotulo: l.slug })}
        onAlternar={(l, ativo) => (ativo ? void reativar(l.id, l.slug) : aba.setAlvo({ recurso: "produtos", id: l.id, rotulo: l.slug, soDesativar: true }))}
        podeEditar={podeEditar}
        filtros={<SeletorDeExpert valor={expertId} onChange={setExpertId} permitirTodos id="filtro-expert" />}
        rotuloDoNovo="Novo produto"
      />
      <FormProduto aberto={aba.form.aberto} linha={aba.form.linha} expertInicial={expertId || undefined} onFechar={aba.fechar} />
      <DialogoDeExclusao alvo={aba.alvo} onFechar={() => aba.setAlvo(null)} />
    </>
  );
}

export function AbaFunisOuOfertas({ recurso, podeEditar, expertInicial }: { recurso: "funis" | "ofertas"; podeEditar: boolean; expertInicial?: string | null }) {
  const ehFunil = recurso === "funis";
  const aba = useAba<FunilOuOferta>();
  const [expertId, setExpertId] = useState("");
  const lista = useListaDe(recurso, { inativos: aba.inativos, expertId: expertId || undefined });
  const experts = useListaDe("experts", { inativos: true });
  // Story 29.80 (AC6) — o `?expertId=` dos links do painel do perpétuo ("Cadastrar
  // funis do …", "{código} não está no Dicionário — cadastrar"). Mesmo padrão da
  // 47.14 em Hooks e bodies: a lista de experts é assíncrona, então o parâmetro é
  // aplicado quando ela chega, UMA vez por valor — depois a pessoa troca à vontade.
  const aplicado = useRef<string | null>(null);
  useEffect(() => {
    if (!expertInicial || aplicado.current === expertInicial || !experts.data) return;
    aplicado.current = expertInicial;
    setExpertId(expertInicialDaUrl(expertInicial, experts.data));
  }, [expertInicial, experts.data]);
  const reativar = useReativar(recurso);
  const codeDo = (id: string) => experts.data?.find((e) => e.id === id)?.code ?? "?";
  return (
    <>
      <TabelaDoDicionario<FunilOuOferta>
        linhas={lista.data}
        carregando={lista.isLoading}
        erro={mensagemDeErro(lista.error)}
        colunas={[
          { chave: "expertId", titulo: "Expert", mono: true, render: (l) => codeDo(l.expertId) },
          { chave: "code", titulo: "Código", mono: true },
          { chave: "description", titulo: "Descrição", className: "max-w-[420px]" },
          { chave: "startedAt", titulo: "Início", render: (l) => new Date(`${l.startedAt.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR") },
        ]}
        buscaEm={["code", "description"]}
        ordenarPor="code"
        inativos={aba.inativos}
        onInativos={aba.setInativos}
        onNovo={aba.abrirNovo}
        onEditar={aba.abrirEdicao}
        onExcluir={(l) => aba.setAlvo({ recurso, id: l.id, rotulo: `${codeDo(l.expertId)}/${l.code}` })}
        onAlternar={(l, ativo) => (ativo ? void reativar(l.id, l.code) : aba.setAlvo({ recurso, id: l.id, rotulo: `${codeDo(l.expertId)}/${l.code}`, soDesativar: true }))}
        podeEditar={podeEditar}
        filtros={<SeletorDeExpert valor={expertId} onChange={setExpertId} permitirTodos id="filtro-expert" />}
        rotuloDoNovo={ehFunil ? "Novo funil" : "Nova oferta"}
        vazio={expertId ? `Este expert ainda não tem ${ehFunil ? "funis" : "ofertas"}. O botão Novo já vem com o código sugerido.` : undefined}
      />
      <FormFunilOuOferta recurso={recurso} aberto={aba.form.aberto} linha={aba.form.linha} expertInicial={expertId || undefined} onFechar={aba.fechar} />
      <DialogoDeExclusao alvo={aba.alvo} onFechar={() => aba.setAlvo(null)} />
    </>
  );
}

export function AbaLps({ podeEditar }: { podeEditar: boolean }) {
  const aba = useAba<Lp>();
  const [cascata, setCascata] = useState<Cascata>(CASCATA_VAZIA);
  const lista = useListaDe("lps", { inativos: aba.inativos, expertId: cascata.expertId || undefined, productId: cascata.productId || undefined, funnelId: cascata.funnelId || undefined, offerId: cascata.offerId || undefined });
  const reativar = useReativar("lps");
  return (
    <>
      <TabelaDoDicionario<Lp>
        linhas={lista.data}
        carregando={lista.isLoading}
        erro={mensagemDeErro(lista.error)}
        colunas={[
          { chave: "code", titulo: "Código", mono: true },
          { chave: "slug", titulo: "Slug", mono: true },
          { chave: "url", titulo: "URL", render: (l) => (l.url ? <a href={l.url} target="_blank" rel="noreferrer" className="underline underline-offset-2 break-all">{l.url}</a> : "—"), className: "max-w-[280px]" },
          { chave: "description", titulo: "Descrição", className: "max-w-[260px] truncate" },
        ]}
        buscaEm={["code", "slug", "url", "description"]}
        ordenarPor="slug"
        inativos={aba.inativos}
        onInativos={aba.setInativos}
        onNovo={aba.abrirNovo}
        onEditar={aba.abrirEdicao}
        onExcluir={(l) => aba.setAlvo({ recurso: "lps", id: l.id, rotulo: l.slug })}
        onAlternar={(l, ativo) => (ativo ? void reativar(l.id, l.slug) : aba.setAlvo({ recurso: "lps", id: l.id, rotulo: l.slug, soDesativar: true }))}
        podeEditar={podeEditar}
        filtros={<CascataDeSelects valor={cascata} onChange={setCascata} compacto />}
        rotuloDoNovo="Nova LP"
      />
      <FormLp aberto={aba.form.aberto} linha={aba.form.linha} cascataInicial={cascata} onFechar={aba.fechar} />
      <DialogoDeExclusao alvo={aba.alvo} onFechar={() => aba.setAlvo(null)} />
    </>
  );
}

const TIPOS: TipoDeValor[] = ["year", "temperature", "auction", "format"];

export function AbaValoresFixos({ podeEditar }: { podeEditar: boolean }) {
  return (
    <div className="space-y-8">
      {TIPOS.map((tipo) => (
        <SecaoDeValores key={tipo} tipo={tipo} podeEditar={podeEditar} />
      ))}
    </div>
  );
}

/** Uma tabelinha de um tipo de valor fixo — reaproveitada pela seção Nome Ads (Story 47.10). */
export function SecaoDeValores({ tipo, podeEditar }: { tipo: TipoDeValor; podeEditar: boolean }) {
  const aba = useAba<ValorFixo>();
  const lista = useListaDe("dicionario", { inativos: aba.inativos, type: tipo });
  const reativar = useReativar("dicionario");
  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        {ROTULO_DO_TIPO[tipo]} <Badge variant="outline" className="font-mono font-normal">{tipo}</Badge>
      </h3>
      <TabelaDoDicionario<ValorFixo>
        linhas={lista.data}
        carregando={lista.isLoading}
        erro={mensagemDeErro(lista.error)}
        colunas={[
          { chave: "sortOrder", titulo: "Ordem", className: "w-[70px] text-right" },
          { chave: "value", titulo: "Valor", mono: true },
          { chave: "description", titulo: "Descrição" },
        ]}
        buscaEm={["value", "description"]}
        ordenarPor="sortOrder"
        inativos={aba.inativos}
        onInativos={aba.setInativos}
        onNovo={aba.abrirNovo}
        onEditar={aba.abrirEdicao}
        onExcluir={(l) => aba.setAlvo({ recurso: "dicionario", id: l.id, rotulo: `${tipo}/${l.value}` })}
        onAlternar={(l, ativo) => (ativo ? void reativar(l.id, l.value) : aba.setAlvo({ recurso: "dicionario", id: l.id, rotulo: `${tipo}/${l.value}`, soDesativar: true }))}
        podeEditar={podeEditar}
        rotuloDoNovo="Novo"
      />
      <FormValorFixo aberto={aba.form.aberto} tipo={tipo} linha={aba.form.linha} onFechar={aba.fechar} />
      <DialogoDeExclusao alvo={aba.alvo} onFechar={() => aba.setAlvo(null)} />
    </section>
  );
}
