"use client";

/**
 * Story 47.12 — Nome Ads › Hooks e bodies (pedido do gestor, 15/09/2026:
 * "precisamos cadastrar o hook e body com descrição para verificarmos
 * depois"). Filtro por expert (obrigatório — h01 é o 1º hook DO expert) e
 * duas seções na mesma tela, Hook · Body, cada uma com a `TabelaDoDicionario`
 * e o botão Novo já com o expert preenchido. Molde literal de
 * `vsl/aba-variaveis.tsx`. Os códigos entram no nome do vídeo na 47.13.
 */

import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { erroDaApi, useAlternarAtivo, useListaDe, type ParteDoVideo } from "@/lib/hooks/use-nomenclatura";
import { ROTULO_DA_PARTE_DO_VIDEO, TIPOS_DE_PARTE_DO_VIDEO, type TipoDeParteDoVideo } from "@/lib/utils/nomenclatura-anuncio";
import { DialogoDeExclusao, type AlvoDaExclusao } from "../dialogo-de-exclusao";
import { SeletorDeExpert } from "../seletor-de-expert";
import { TabelaDoDicionario } from "../tabela-do-dicionario";
import { FormParte } from "./form-parte";

function mensagemDeErro(e: unknown) {
  if (!e) return null;
  const err = erroDaApi(e);
  if (err.status === 404) return "A API ainda não tem as rotas de hooks e bodies — provavelmente está atrás do painel. Veja o aviso de versão no topo.";
  if (err.status === 500) return "Erro interno na API ao ler hooks e bodies. Se este ambiente ainda não recebeu a migration 0148, é isso — não é dado zerado.";
  return err.mensagem;
}

export function AbaHooksEBodies({ podeEditar }: { podeEditar: boolean }) {
  const [expertId, setExpertId] = useState("");
  return (
    <div className="space-y-6">
      <div className="max-w-sm">
        <SeletorDeExpert valor={expertId} onChange={setExpertId} id="filtro-expert-partes" label="Expert" />
        {!expertId ? <p className="mt-1 text-xs text-muted-foreground">Hooks e bodies são por expert. Escolha um para ver e cadastrar.</p> : null}
      </div>
      {expertId ? (
        <div className="space-y-8">
          {TIPOS_DE_PARTE_DO_VIDEO.map((tipo) => (
            <SecaoDePartes key={tipo} tipo={tipo} expertId={expertId} podeEditar={podeEditar} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SecaoDePartes({ tipo, expertId, podeEditar }: { tipo: TipoDeParteDoVideo; expertId: string; podeEditar: boolean }) {
  const [inativos, setInativos] = useState(false);
  const [form, setForm] = useState<{ aberto: boolean; linha: ParteDoVideo | null }>({ aberto: false, linha: null });
  const [alvo, setAlvo] = useState<AlvoDaExclusao | null>(null);
  const lista = useListaDe("ads/partes", { inativos, expertId, type: tipo });
  const alternar = useAlternarAtivo("ads/partes");
  const rotulo = ROTULO_DA_PARTE_DO_VIDEO[tipo];

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
      <TabelaDoDicionario<ParteDoVideo>
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
        onExcluir={(l) => setAlvo({ recurso: "ads/partes", id: l.id, rotulo: `${tipo}/${l.code}` })}
        onAlternar={(l, ativo) => (ativo ? void reativar(l.id, l.code) : setAlvo({ recurso: "ads/partes", id: l.id, rotulo: `${tipo}/${l.code}`, soDesativar: true }))}
        podeEditar={podeEditar}
        rotuloDoNovo={`Novo ${rotulo.toLowerCase()}`}
        vazio={`nenhum ${rotulo.toLowerCase()} cadastrado para este expert — inclua o primeiro`}
      />
      <FormParte aberto={form.aberto} tipo={tipo} linha={form.linha} expertInicial={expertId} onFechar={() => setForm({ aberto: false, linha: null })} />
      <DialogoDeExclusao alvo={alvo} onFechar={() => setAlvo(null)} />
    </section>
  );
}
