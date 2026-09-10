"use client";

/**
 * Story 47.9 — formulário de uma variável de VSL (lead · mecanismo do problema
 * · mecanismo da solução), por expert. Mesmo molde de `FormFunilOuOferta`:
 * código com normalização ao vivo e travado quando usado, descrição
 * OBRIGATÓRIA (é o que se lê no select do gerador), "Salvar e adicionar outra".
 */

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { erroDaApi, useCriar, useEditar, type ErroDaApi, type VariavelDeVsl } from "@/lib/hooks/use-nomenclatura";
import { AVISO_DE_DESCRICAO_USADA } from "@/lib/utils/nomenclatura-cascata";
import { PLACEHOLDER_DA_VARIAVEL, ROTULO_DA_VARIAVEL, type TipoDeVariavel } from "@/lib/utils/nomenclatura-vsl";
import { CampoImutavel } from "../campo-imutavel";
import { FormularioDialogo } from "../formulario-dialogo";
import { SeletorDeExpert } from "../seletor-de-expert";

export function FormVariavel(props: {
  aberto: boolean;
  tipo: TipoDeVariavel;
  linha: VariavelDeVsl | null;
  expertInicial?: string;
  onFechar: () => void;
  onSalvo?: (v: VariavelDeVsl) => void;
}) {
  const { aberto, tipo, linha, expertInicial, onFechar, onSalvo } = props;
  const criar = useCriar("vsl/variaveis");
  const editar = useEditar("vsl/variaveis");
  const [erro, setErro] = useState<ErroDaApi | null>(null);
  const [expertId, setExpertId] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [avisoDescricao, setAvisoDescricao] = useState(false);
  const rotulo = ROTULO_DA_VARIAVEL[tipo];

  useEffect(() => {
    setExpertId(linha?.expertId ?? expertInicial ?? "");
    setCode(linha?.code ?? "");
    setDescription(linha?.description ?? "");
    setAvisoDescricao(false);
    setErro(null);
  }, [linha, aberto, expertInicial]);

  async function salvar(eOutra = false) {
    setErro(null);
    try {
      if (linha) {
        await editar.mutateAsync({ id: linha.id, dados: { code, description } });
        toast.success(`${rotulo} ${linha.code} atualizado.`);
        onFechar();
        return;
      }
      const criada = await criar.mutateAsync({ expertId, type: tipo, code, description });
      toast.success(`${rotulo} ${criada.code} criado.`);
      onSalvo?.(criada);
      if (eOutra) {
        setCode("");
        setDescription("");
        return;
      }
      onFechar();
    } catch (e) {
      setErro(erroDaApi(e));
    }
  }

  return (
    <FormularioDialogo
      aberto={aberto}
      onFechar={onFechar}
      titulo={linha ? `Editar ${rotulo.toLowerCase()} ${linha.code}` : `Novo ${rotulo.toLowerCase()}`}
      descricao="A descrição é o que aparece no select do gerador de VSL — escreva para quem vai escolher."
      onSalvar={() => salvar(false)}
      onSalvarEOutra={linha ? undefined : () => salvar(true)}
      salvando={criar.isPending || editar.isPending}
      podeSalvar={Boolean(expertId && code.trim() && description.trim())}
      erro={erro}
    >
      <SeletorDeExpert valor={expertId} onChange={(v) => { setExpertId(v); setCode(""); }} travado={Boolean(linha) || Boolean(expertInicial)} id="var-expert" />
      <CampoImutavel id="var-code" label="Código" valor={code} onChange={setCode} tipo="vsl" usadoEm={linha?.usadoEm ?? 0} placeholder={PLACEHOLDER_DA_VARIAVEL[tipo].code} ajuda="Até 20 caracteres em [a-z0-9-]. Entra no nome da VSL exatamente assim; único por expert e tipo." autoFocus={!linha} />
      <div className="space-y-1">
        <Label htmlFor="var-desc">Descrição (obrigatória)</Label>
        <Textarea id="var-desc" value={description} onChange={(e) => setDescription(e.target.value)} onFocus={() => setAvisoDescricao((linha?.usadoEm ?? 0) > 0)} rows={3} placeholder={PLACEHOLDER_DA_VARIAVEL[tipo].description} />
        {avisoDescricao ? <p className="text-xs text-warning">{AVISO_DE_DESCRICAO_USADA}</p> : null}
      </div>
    </FormularioDialogo>
  );
}
