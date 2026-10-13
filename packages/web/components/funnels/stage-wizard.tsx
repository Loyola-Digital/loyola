"use client";

/**
 * Criar uma etapa inteira de uma vez — nome, tipo, código de match, campanhas
 * e (opcional) planilha.
 *
 * ## Por que um wizard, e não o diálogo de antes
 *
 * O diálogo pedia nome e tipo, criava a etapa no fim da lista e deixava o resto
 * para quem entrasse nela depois. Pior: o atalho da sidebar pedia só o nome, e
 * a etapa nascia `free` por omissão, sem ninguém escolher. A configuração que
 * de fato faz a etapa funcionar — quais campanhas são dela — ficava para um
 * segundo momento que às vezes não vinha.
 *
 * ## O código de match é o passo que não existia
 *
 * Sem ele, a etapa casa campanha pelo código do FUNIL combinado com um sufixo
 * de fase adivinhado do nome (`leads`, `vendas-captacao`, `vendas-principal`).
 * Essa adivinhação não se aplica a funil perpétuo, a etapa de CPL ou evento,
 * nem a nome fora do padrão — e aí nada casa, **em silêncio**. É a origem do
 * "criei a campanha e ela não aparece na etapa".
 *
 * Aqui o código é um campo, e o passo 2 mostra, antes de salvar, quantas
 * campanhas ele pega. Configuração que você vê funcionando não é configuração
 * que você descobre errada três dias depois.
 *
 * Ver `codigoDaEtapa` em `services/funnel-match-code.ts` (API) e a migration
 * 0169.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileSpreadsheet,
  Loader2,
  Target,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { CampaignSelector } from "@/components/funnels/campaign-selector";
import { FunnelSpreadsheetWizardDialog } from "@/components/funnels/funnel-spreadsheet-wizard-dialog";
import { useCreateStage } from "@/lib/hooks/use-funnel-stages";
import { useCampaignPicker } from "@/lib/hooks/use-funnels";
import { rotuloDoTipoDeEtapa } from "@/lib/utils/rotulos-de-etapa";
import {
  TIPOS_CRIAVEIS,
  campanhasQueCasam,
  type TipoCriavel,
} from "@/lib/utils/codigo-da-etapa";
import type { FunnelCampaign } from "@loyola-x/shared";

const PASSOS = ["Nome & tipo", "Campanhas", "Planilha"] as const;

const slide = {
  enter: (dir: number) => ({ x: dir > 0 ? 200 : -200, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir < 0 ? 200 : -200, opacity: 0 }),
};

interface StageWizardProps {
  projectId: string;
  funnelId: string;
  /** Define o placeholder de nome (`free` muda de rótulo em funil perpétuo). */
  funnelType?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** true = navega para a etapa criada ao fechar. A sidebar quer isso. */
  irParaAEtapa?: boolean;
}

export function StageWizard({
  projectId,
  funnelId,
  funnelType,
  open,
  onOpenChange,
  irParaAEtapa = false,
}: StageWizardProps) {
  const router = useRouter();
  const createStage = useCreateStage(projectId, funnelId);
  const { data: campaignData } = useCampaignPicker(open ? projectId : null);

  const [passo, setPasso] = useState(0);
  const [direcao, setDirecao] = useState(0);
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<TipoCriavel>("free");
  const [codigo, setCodigo] = useState("");
  const [campanhas, setCampanhas] = useState<FunnelCampaign[]>([]);
  const [tocouCampanhas, setTocouCampanhas] = useState(false);
  /** A etapa criada — o passo da planilha precisa do id dela. */
  const [criada, setCriada] = useState<{ id: string; name: string } | null>(null);
  const [planilhaAberta, setPlanilhaAberta] = useState(false);

  const todasAsCampanhas = campaignData?.campaigns ?? [];
  const casando = useMemo(
    () => campanhasQueCasam(todasAsCampanhas, codigo),
    [todasAsCampanhas, codigo],
  );

  // Ao chegar no passo das campanhas, pré-seleciona o que o código pega. Enquanto
  // a pessoa não mexer na seleção à mão, mudar o código refaz a sugestão — ela
  // volta para o passo 1, corrige o código e vê o resultado. Depois de mexer,
  // a escolha dela manda.
  useEffect(() => {
    if (passo !== 1 || tocouCampanhas) return;
    setCampanhas(casando.map((c) => ({ id: c.id, name: c.name })));
  }, [passo, casando, tocouCampanhas]);

  function reiniciar() {
    setPasso(0);
    setDirecao(0);
    setNome("");
    setTipo("free");
    setCodigo("");
    setCampanhas([]);
    setTocouCampanhas(false);
    setCriada(null);
  }

  function fechar(valor: boolean) {
    if (!valor) {
      const id = criada?.id;
      reiniciar();
      if (id && irParaAEtapa) {
        router.push(`/projects/${projectId}/funnels/${funnelId}/stages/${id}`);
      }
    }
    onOpenChange(valor);
  }

  async function criar() {
    if (!nome.trim()) return;
    try {
      const etapa = await createStage.mutateAsync({
        name: nome.trim(),
        stageType: tipo,
        matchCode: codigo.trim() || null,
        campaigns: campanhas,
      });
      setCriada({ id: etapa.id, name: etapa.name });
      toast.success("Etapa criada");
      setDirecao(1);
      setPasso(2);
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Erro ao criar etapa");
    }
  }

  const podeAvancar = nome.trim().length > 0;

  return (
    <>
      <Dialog open={open} onOpenChange={fechar}>
        <DialogContent className="sm:max-w-[540px]">
          <DialogHeader>
            <DialogTitle>Nova etapa</DialogTitle>
          </DialogHeader>

          <div className="flex justify-center gap-2 py-2">
            {PASSOS.map((p, i) => (
              <div
                key={p}
                className={cn(
                  "h-2 w-2 rounded-full transition-colors",
                  i === passo ? "bg-primary" : i < passo ? "bg-primary/50" : "bg-muted",
                )}
              />
            ))}
          </div>

          <div className="relative min-h-[320px] overflow-hidden">
            <AnimatePresence mode="wait" custom={direcao}>
              <motion.div
                key={passo}
                custom={direcao}
                variants={slide}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.2, ease: "easeInOut" }}
                className="space-y-4"
              >
                {passo === 0 && (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor="etapa-nome">Nome da etapa</Label>
                      <Input
                        id="etapa-nome"
                        autoFocus
                        value={nome}
                        onChange={(e) => setNome(e.target.value)}
                        placeholder={rotuloDoTipoDeEtapa(tipo, funnelType).placeholder}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="etapa-codigo" className="flex items-center gap-1.5">
                        <Target className="h-3.5 w-3.5" />
                        Código de match <span className="text-muted-foreground">(opcional)</span>
                      </Label>
                      <Input
                        id="etapa-codigo"
                        value={codigo}
                        onChange={(e) => {
                          setCodigo(e.target.value);
                          setTocouCampanhas(false);
                        }}
                        placeholder="ex: fz-a1"
                      />
                      <p className="text-[11px] text-muted-foreground">
                        É por ele que a campanha encontra esta etapa:{" "}
                        <code className="rounded bg-muted px-1">fz-a1</code> pega{" "}
                        <code className="rounded bg-muted px-1">fz-a1-2026</code> e não pega{" "}
                        <code className="rounded bg-muted px-1">fz-a2-2026</code>. Em branco, a
                        etapa tenta casar pelo código do funil mais uma fase deduzida do nome —
                        o que não funciona em funil perpétuo nem em etapa de CPL ou evento.
                      </p>
                      {codigo.trim().length > 0 && (
                        <p className="text-[11px] font-medium text-primary">
                          {casando.length === 0
                            ? "Nenhuma campanha com esse código hoje — vale para as que vierem."
                            : `${casando.length} campanha${casando.length > 1 ? "s" : ""} com esse código.`}
                        </p>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <Label>Tipo</Label>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {TIPOS_CRIAVEIS.map((t) => {
                          const rotulo = rotuloDoTipoDeEtapa(t, funnelType);
                          return (
                            <button
                              key={t}
                              type="button"
                              onClick={() => setTipo(t)}
                              className={cn(
                                "flex flex-col items-center justify-center gap-0.5 rounded-md border p-2 text-sm transition-colors",
                                tipo === t
                                  ? "border-primary bg-primary/5 text-primary"
                                  : "border-border hover:bg-muted",
                              )}
                            >
                              <span className="font-medium">{rotulo.titulo}</span>
                              <span className="text-[11px] leading-tight text-muted-foreground">
                                {rotulo.descricao}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}

                {passo === 1 && (
                  <div className="space-y-3">
                    <Label>Campanhas Meta Ads</Label>
                    <p className="text-xs text-muted-foreground">
                      {codigo.trim()
                        ? `Pré-selecionadas pelo código "${codigo.trim()}". Ajuste se precisar.`
                        : "Sem código de match — escolha à mão, ou volte e preencha o código."}
                    </p>
                    <CampaignSelector
                      campaigns={todasAsCampanhas}
                      accountLinked={campaignData?.accountLinked ?? false}
                      value={campanhas}
                      onChange={(v) => {
                        setTocouCampanhas(true);
                        setCampanhas(v);
                      }}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Opcional. Campanha nova que casar com o código aparece depois no aviso de
                      campanhas órfãs desta etapa.
                    </p>
                  </div>
                )}

                {passo === 2 && (
                  <div className="space-y-4">
                    <div className="rounded-lg border p-4">
                      <p className="flex items-center gap-2 font-medium">
                        <Check className="h-4 w-4 text-primary" />
                        {criada?.name}
                      </p>
                      <div className="mt-2 space-y-0.5 text-sm text-muted-foreground">
                        <p>Tipo: {rotuloDoTipoDeEtapa(tipo, funnelType).titulo}</p>
                        <p>Código: {codigo.trim() || "— (casa pelo funil)"}</p>
                        <p>
                          Campanhas:{" "}
                          {campanhas.length > 0 ? campanhas.length : "nenhuma (vincular depois)"}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="flex items-center gap-1.5">
                        <FileSpreadsheet className="h-3.5 w-3.5" />
                        Planilha <span className="text-muted-foreground">(opcional)</span>
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Leads, vendas, pesquisa. Dá para conectar agora ou nunca — a etapa já
                        existe e funciona sem.
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => setPlanilhaAberta(true)}
                      >
                        <FileSpreadsheet className="h-3.5 w-3.5" />
                        Mapear planilha
                      </Button>
                    </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="flex justify-between pt-2">
            {/* No passo 3 a etapa já existe: voltar atrás não desfaria nada e
                só confundiria. O caminho de lá é fechar. */}
            <Button
              variant="outline"
              onClick={() => {
                setDirecao(-1);
                setPasso((p) => p - 1);
              }}
              disabled={passo === 0 || passo === 2}
            >
              <ArrowLeft className="mr-1 h-4 w-4" />
              Voltar
            </Button>

            {passo === 0 && (
              <Button
                onClick={() => {
                  setDirecao(1);
                  setPasso(1);
                }}
                disabled={!podeAvancar}
              >
                Próximo
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            )}

            {passo === 1 && (
              <Button onClick={criar} disabled={createStage.isPending}>
                {createStage.isPending ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <Check className="mr-1 h-4 w-4" />
                )}
                Criar etapa
              </Button>
            )}

            {passo === 2 && <Button onClick={() => fechar(false)}>Concluir</Button>}
          </div>
        </DialogContent>
      </Dialog>

      {/* O wizard de planilha que já existia, apontado para a etapa recém-criada. */}
      {criada && (
        <FunnelSpreadsheetWizardDialog
          projectId={projectId}
          funnelId={funnelId}
          stageId={criada.id}
          open={planilhaAberta}
          onOpenChange={setPlanilhaAberta}
        />
      )}
    </>
  );
}
