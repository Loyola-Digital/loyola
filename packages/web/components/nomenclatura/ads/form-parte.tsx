"use client";

/**
 * Story 47.12 — formulário de um hook ou body do vídeo, por expert. Molde
 * literal de `vsl/form-variavel.tsx`: código **sigla + NN sugerido** (`h01`,
 * `b01` — o menor livre do expert, inativos inclusos), travado quando usado
 * em anúncio (a 47.13 passa a contar), descrição OBRIGATÓRIA (é o que se lê
 * no select do gerador e "para verificarmos depois" — pedido do gestor),
 * "Salvar e adicionar outro" busca o próximo código.
 */

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { erroDaApi, useCriar, useEditar, useProximoCodigo, type ErroDaApi, type ParteDoVideo } from "@/lib/hooks/use-nomenclatura";
import { AVISO_DE_DESCRICAO_USADA } from "@/lib/utils/nomenclatura-cascata";
import { PLACEHOLDER_DA_PARTE_DO_VIDEO, PREFIXO_DA_PARTE_DO_VIDEO, ROTULO_DA_PARTE_DO_VIDEO, TIPO_DE_CODIGO_DA_PARTE_DO_VIDEO, type TipoDeParteDoVideo } from "@/lib/utils/nomenclatura-anuncio";
import { CampoImutavel } from "../campo-imutavel";
import { FormularioDialogo } from "../formulario-dialogo";
import { SeletorDeExpert } from "../seletor-de-expert";

export function FormParte(props: {
  aberto: boolean;
  tipo: TipoDeParteDoVideo;
  linha: ParteDoVideo | null;
  expertInicial?: string;
  onFechar: () => void;
  onSalvo?: (v: ParteDoVideo) => void;
}) {
  const { aberto, tipo, linha, expertInicial, onFechar, onSalvo } = props;
  const criar = useCriar("ads/partes");
  const editar = useEditar("ads/partes");
  const [erro, setErro] = useState<ErroDaApi | null>(null);
  const [expertId, setExpertId] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [avisoDescricao, setAvisoDescricao] = useState(false);
  const rotulo = ROTULO_DA_PARTE_DO_VIDEO[tipo];
  const sugestao = useProximoCodigo("ads/partes", { expertId, type: tipo }, aberto && !linha && Boolean(expertId));

  useEffect(() => {
    setExpertId(linha?.expertId ?? expertInicial ?? "");
    setCode(linha?.code ?? "");
    setDescription(linha?.description ?? "");
    setAvisoDescricao(false);
    setErro(null);
  }, [linha, aberto, expertInicial]);

  // Código sugerido preenche o campo vazio; se a pessoa já digitou, não sobrescreve.
  useEffect(() => {
    if (!linha && sugestao.data?.codigo && !code) setCode(sugestao.data.codigo);
  }, [sugestao.data?.codigo, linha]);

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
        // Busca o PRÓXIMO código explicitamente (a invalidação já refez a query com o campo ainda preenchido — armadilha da #836).
        setDescription("");
        setAvisoDescricao(false);
        const proximo = await sugestao.refetch();
        setCode(proximo.data?.codigo ?? "");
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
      descricao="A descrição é o que aparece no select do gerador de anúncio — escreva para quem vai escolher, e para quem for conferir depois."
      onSalvar={() => salvar(false)}
      onSalvarEOutra={linha ? undefined : () => salvar(true)}
      salvando={criar.isPending || editar.isPending}
      podeSalvar={Boolean(expertId && code.trim() && description.trim())}
      erro={erro}
    >
      <SeletorDeExpert valor={expertId} onChange={(v) => { setExpertId(v); setCode(""); }} travado={Boolean(linha) || Boolean(expertInicial)} id="parte-expert" />
      <CampoImutavel id="parte-code" label="Código" valor={code} onChange={setCode} tipo={TIPO_DE_CODIGO_DA_PARTE_DO_VIDEO[tipo]} usadoEm={linha?.usadoEm ?? 0} placeholder={PLACEHOLDER_DA_PARTE_DO_VIDEO[tipo].code} ajuda={!linha && sugestao.data?.codigo ? `Sugerido: ${sugestao.data.codigo} (próximo livre deste expert, contando inativos).` : `${PREFIXO_DA_PARTE_DO_VIDEO[tipo]} + dois dígitos, por expert. Entra no nome do vídeo exatamente assim.`} />
      <div className="space-y-1">
        <Label htmlFor="parte-desc">Descrição (obrigatória)</Label>
        <Textarea id="parte-desc" value={description} onChange={(e) => setDescription(e.target.value)} onFocus={() => setAvisoDescricao((linha?.usadoEm ?? 0) > 0)} rows={3} placeholder={PLACEHOLDER_DA_PARTE_DO_VIDEO[tipo].description} />
        {avisoDescricao ? <p className="text-xs text-warning">{AVISO_DE_DESCRICAO_USADA}</p> : null}
      </div>
    </FormularioDialogo>
  );
}
