"use client";

/**
 * Story 47.9 — aba Variáveis: filtro por expert (obrigatório — as variáveis
 * são por expert) e três seções na mesma tela, Lead · Mecanismo do problema ·
 * Mecanismo da solução, cada uma com a `TabelaDoDicionario` e o botão Novo já
 * com o expert preenchido. Molde: `AbaValoresFixos`, trocando "global" por
 * "por expert". A oferta (pitch) é cadastrada no Dicionário › Ofertas.
 */

import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { erroDaApi, useAlternarAtivo, useListaDe, type VariavelDeVsl } from "@/lib/hooks/use-nomenclatura";
import { ROTULO_DA_VARIAVEL, TIPOS_DE_VARIAVEL, type TipoDeVariavel } from "@/lib/utils/nomenclatura-vsl";
import { DialogoDeExclusao, type AlvoDaExclusao } from "../dialogo-de-exclusao";
import { SeletorDeExpert } from "../seletor-de-expert";
import { TabelaDoDicionario } from "../tabela-do-dicionario";
import { FormVariavel } from "./form-variavel";

function mensagemDeErro(e: unknown) {
  if (!e) return null;
  const err = erroDaApi(e);
  if (err.status === 404) return "A API ainda não tem as rotas de VSL — provavelmente está atrás do painel. Veja o aviso de versão no topo.";
  if (err.status === 500) return "Erro interno na API ao ler as variáveis de VSL. Se este ambiente ainda não recebeu a migration 0144, é isso — não é dado zerado.";
  return err.mensagem;
}

export function AbaVariaveisDeVsl({ podeEditar }: { podeEditar: boolean }) {
  const [expertId, setExpertId] = useState("");
  return (
    <div className="space-y-6">
      <div className="max-w-sm">
        <SeletorDeExpert valor={expertId} onChange={setExpertId} id="filtro-expert-vsl" label="Expert" />
        {!expertId ? <p className="mt-1 text-xs text-muted-foreground">As variáveis de VSL são por expert. Escolha um para ver e cadastrar.</p> : null}
      </div>
      {expertId ? (
        <div className="space-y-8">
          {TIPOS_DE_VARIAVEL.map((tipo) => (
            <SecaoDeVariaveis key={tipo} tipo={tipo} expertId={expertId} podeEditar={podeEditar} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SecaoDeVariaveis({ tipo, expertId, podeEditar }: { tipo: TipoDeVariavel; expertId: string; podeEditar: boolean }) {
  const [inativos, setInativos] = useState(false);
  const [form, setForm] = useState<{ aberto: boolean; linha: VariavelDeVsl | null }>({ aberto: false, linha: null });
  const [alvo, setAlvo] = useState<AlvoDaExclusao | null>(null);
  const lista = useListaDe("vsl/variaveis", { inativos, expertId, type: tipo });
  const alternar = useAlternarAtivo("vsl/variaveis");
  const rotulo = ROTULO_DA_VARIAVEL[tipo];

  async function reativar(id: string, code: string) {
    try {
      await alternar.mutateAsync({ id, ativo: true });
      toast.success(`${code} reativado.`);
    } catch (e) {
      toast.error(erroDaApi(e).mensagem);
    }
  }

  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        {rotulo} <Badge variant="outline" className="font-mono font-normal">{tipo}</Badge>
      </h3>
      <TabelaDoDicionario<VariavelDeVsl>
        linhas={lista.data}
        carregando={lista.isLoading}
        erro={mensagemDeErro(lista.error)}
        colunas={[
          { chave: "code", titulo: "Código", mono: true },
          { chave: "description", titulo: "Descrição", className: "max-w-[420px]" },
        ]}
        buscaEm={["code", "description"]}
        ordenarPor="code"
        inativos={inativos}
        onInativos={setInativos}
        onNovo={() => setForm({ aberto: true, linha: null })}
        onEditar={(l) => setForm({ aberto: true, linha: l })}
        onExcluir={(l) => setAlvo({ recurso: "vsl/variaveis", id: l.id, rotulo: `${tipo}/${l.code}` })}
        onAlternar={(l, ativo) => (ativo ? void reativar(l.id, l.code) : setAlvo({ recurso: "vsl/variaveis", id: l.id, rotulo: `${tipo}/${l.code}`, soDesativar: true }))}
        podeEditar={podeEditar}
        rotuloDoNovo={`Novo ${rotulo.toLowerCase()}`}
        vazio={`Nenhum ${rotulo.toLowerCase()} cadastrado para este expert ainda.`}
      />
      <FormVariavel aberto={form.aberto} tipo={tipo} linha={form.linha} expertInicial={expertId} onFechar={() => setForm({ aberto: false, linha: null })} />
      <DialogoDeExclusao alvo={alvo} onFechar={() => setAlvo(null)} />
    </section>
  );
}
