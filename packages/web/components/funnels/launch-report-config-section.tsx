"use client";

/**
 * Story 41.1 — Bloco "Relatórios (Resumão / Comparativo)" no Sheet de
 * Configurações da Etapa.
 *
 * O Sheet é estreito (sm:max-w-md) e já denso, então o bloco é recolhível e
 * abre fechado. O que ele precisa comunicar antes de qualquer campo é UMA
 * coisa: se os botões de relatório estão liberados nesta etapa, e por que não.
 */

import { useEffect, useState } from "react";
import { ChevronDown, FileBarChart2, ShieldCheck, ShieldAlert, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useStageSalesSpreadsheets } from "@/lib/hooks/use-stage-sales-spreadsheets";
import {
  useLaunchReportConfig,
  useLaunchReportSurveyQuestions,
  useSaveLaunchReportConfig,
  useValidateLaunchReportConfig,
  useSaveExpertReportConfig,
  LAUNCH_REPORT_TIPOS,
  LAUNCH_REPORT_ETAPAS,
  LAUNCH_REPORT_ENTIDADES,
  SURVEY_CANONICAL_FIELDS,
  type LaunchReportTipo,
  type LaunchReportEtapa,
  type LaunchReportEntidade,
  type SurveyCanonicalField,
} from "@/lib/hooks/use-launch-report-config";

/** Checklist do §12.7 — mostrado no ato de validar, não escondido na doc. */
const CHECKLIST_VALIDACAO = [
  "Config preenchida: tipo, etapa e entidade de captura",
  "Mapa de campos da pesquisa preenchido para este expert",
  "Alíquota de imposto confirmada (não assumir 12,15%)",
  "Prefixos de campanha do expert conferidos",
  "Definido quais seções do Resumão se aplicam",
  "Conferido manualmente contra o painel: investimento, unidades, faturamento",
];

interface Props {
  projectId: string;
  funnelId: string;
  stageId: string;
  /** Abre a aba de Planilhas — origem da classificação captação × order bump. */
  onOpenSpreadsheets?: () => void;
}

export function LaunchReportConfigSection({
  projectId,
  funnelId,
  stageId,
  onOpenSpreadsheets,
}: Props) {
  const [open, setOpen] = useState(false);
  const [confirmingValidation, setConfirmingValidation] = useState(false);

  const { data, isLoading } = useLaunchReportConfig(projectId, funnelId, stageId);
  const { data: sheets } = useStageSalesSpreadsheets(projectId, funnelId, stageId);
  const { data: survey } = useLaunchReportSurveyQuestions(projectId, funnelId, stageId, open);

  const saveStage = useSaveLaunchReportConfig(projectId, funnelId, stageId);
  const validate = useValidateLaunchReportConfig(projectId, funnelId, stageId);
  const saveExpert = useSaveExpertReportConfig(projectId, funnelId, stageId);

  const [tipo, setTipo] = useState<LaunchReportTipo>("pago");
  const [etapa, setEtapa] = useState<LaunchReportEtapa>("vendas-captacao");
  const [entidade, setEntidade] = useState<LaunchReportEntidade>("vendas");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [impostoStage, setImpostoStage] = useState("");
  const [campos, setCampos] = useState<Partial<Record<SurveyCanonicalField, string>>>({});

  // Hidrata o formulário quando a config chega. Só depende de `data` — não
  // sobrescreve o que o usuário está digitando a cada render.
  useEffect(() => {
    if (!data) return;
    if (data.stage) {
      setTipo(data.stage.tipo);
      setEtapa(data.stage.etapa);
      setEntidade(data.stage.entidadeCaptura);
      setDataInicio(data.stage.dataInicio ?? "");
      setDataFim(data.stage.dataFim ?? "");
    }
    if (data.resolvido.impostoOrigem === "stage") {
      setImpostoStage(String(data.resolvido.impostoPct * 100));
    }
    setCampos(data.expert.camposPesquisa ?? {});
  }, [data]);

  const bloqueado = !!data?.bloqueio;
  const validado = data?.stage?.validado ?? false;
  const orderBumps = (sheets ?? []).flatMap((s) => s.orderBumpProducts ?? []);

  // Mudar qualquer uma das três premissas invalida a conferência anterior — o
  // backend reseta, e o aviso aqui evita que a pessoa descubra depois.
  const premissaMudou =
    !!data?.stage &&
    (data.stage.tipo !== tipo ||
      data.stage.etapa !== etapa ||
      data.stage.entidadeCaptura !== entidade);

  function parseImposto(): number | null {
    const raw = impostoStage.trim().replace(",", ".");
    if (!raw) return null;
    const pct = Number.parseFloat(raw);
    if (!Number.isFinite(pct) || pct < 0 || pct >= 99) return null;
    return pct / 100;
  }

  function handleSaveStage() {
    if (impostoStage.trim() && parseImposto() === null) {
      toast.error("Alíquota inválida — informe em %, ex.: 12,15");
      return;
    }
    saveStage.mutate(
      {
        tipo,
        etapa,
        entidadeCaptura: entidade,
        dataInicio: dataInicio || null,
        dataFim: dataFim || null,
        impostoPct: parseImposto(),
      },
      {
        onSuccess: (res) => {
          toast.success(
            res.validacaoResetada
              ? "Config salva — validação resetada (a premissa mudou)"
              : "Config de relatório salva",
          );
          setConfirmingValidation(false);
        },
        onError: () => toast.error("Não foi possível salvar a config"),
      },
    );
  }

  function handleSaveCampos(next: Partial<Record<SurveyCanonicalField, string>>) {
    setCampos(next);
    saveExpert.mutate(
      { camposPesquisa: next },
      { onError: () => toast.error("Não foi possível salvar o mapa de campos") },
    );
  }

  function handleValidate() {
    validate.mutate(undefined, {
      onSuccess: () => {
        toast.success("Combinação marcada como validada");
        setConfirmingValidation(false);
      },
      onError: () => toast.error("Salve a config antes de validar"),
    });
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="space-y-2">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between rounded-md border border-border/50 px-3 py-2 text-left hover:bg-muted/50"
        >
          <span className="flex items-center gap-2 text-sm font-medium">
            <FileBarChart2 className="h-4 w-4 text-primary" />
            Relatórios (Resumão / Comparativo)
          </span>
          <span className="flex items-center gap-2">
            {!isLoading && (
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  bloqueado
                    ? "bg-red-500/10 text-red-500 border border-red-500/30"
                    : "bg-emerald-500/10 text-emerald-600 border border-emerald-500/30"
                }`}
              >
                {bloqueado ? "Bloqueado" : "Liberado"}
              </span>
            )}
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
            />
          </span>
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent className="space-y-4 rounded-md border border-border/40 p-3">
        {/* Estado do gate — a primeira coisa que a pessoa precisa entender */}
        {data?.bloqueio ? (
          <div className="rounded-md border border-red-500/30 bg-red-500/5 p-3 space-y-1">
            <p className="flex items-center gap-1.5 text-xs font-medium text-red-500">
              <ShieldAlert className="h-3.5 w-3.5" />
              Não validado — botões de relatório bloqueados
            </p>
            <p className="text-[11px] text-muted-foreground">{data.bloqueio.detalhe}</p>
            <p className="text-[11px] text-muted-foreground">{data.bloqueio.acao}</p>
          </div>
        ) : (
          data && (
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3">
              <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                <ShieldCheck className="h-3.5 w-3.5" />
                {validado
                  ? `Validado${
                      data.stage?.validadoEm
                        ? ` em ${new Date(data.stage.validadoEm).toLocaleDateString("pt-BR")}`
                        : ""
                    }${data.stage?.validadoPorNome ? ` por ${data.stage.validadoPorNome}` : ""}`
                  : `Combinação de referência (${data.escopoValidado.tipo}/${data.escopoValidado.etapa}) — liberado`}
              </p>
            </div>
          )
        )}

        {/* Premissas */}
        <div className="space-y-2">
          <Label className="text-xs">Tipo de lançamento</Label>
          <Select value={tipo} onValueChange={(v) => setTipo(v as LaunchReportTipo)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LAUNCH_REPORT_TIPOS.map((t) => (
                <SelectItem key={t.value} value={t.value} className="text-xs">
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Etapa (prefixo da campanha)</Label>
          <Select value={etapa} onValueChange={(v) => setEtapa(v as LaunchReportEtapa)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LAUNCH_REPORT_ETAPAS.map((e) => (
                <SelectItem key={e.value} value={e.value} className="text-xs">
                  {e.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Entidade de captura</Label>
          <Select value={entidade} onValueChange={(v) => setEntidade(v as LaunchReportEntidade)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LAUNCH_REPORT_ENTIDADES.map((e) => (
                <SelectItem key={e.value} value={e.value} className="text-xs">
                  {e.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {premissaMudou && (
          <p className="rounded bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-600">
            Mudar tipo/etapa/entidade reseta a validação — a conferência anterior deixa de valer.
          </p>
        )}

        {/* Período */}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Início</Label>
            <Input
              type="date"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Fim</Label>
            <Input
              type="date"
              value={dataFim}
              onChange={(e) => setDataFim(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Vazio = derivado automaticamente: início na 1ª conversão registrada, fim no último dia
          com investimento. Evita contar o período com spend e sem conversão.
        </p>

        {/* Imposto */}
        <div className="space-y-1">
          <Label className="text-xs">Imposto sobre mídia (%)</Label>
          <Input
            inputMode="decimal"
            placeholder="12,15"
            value={impostoStage}
            onChange={(e) => setImpostoStage(e.target.value)}
            className="h-8 text-xs"
          />
          {data && (
            <p className="text-[11px] text-muted-foreground">
              Em uso: <strong>{(data.resolvido.impostoPct * 100).toFixed(2).replace(".", ",")}%</strong>{" "}
              (
              {data.resolvido.impostoOrigem === "stage"
                ? "override desta etapa"
                : data.resolvido.impostoOrigem === "project"
                  ? "override do projeto"
                  : "padrão do sistema"}
              )
            </p>
          )}
        </div>

        <Button size="sm" className="w-full" onClick={handleSaveStage} disabled={saveStage.isPending}>
          {saveStage.isPending ? "Salvando..." : "Salvar config"}
        </Button>

        {/* Produtos — leitura, fonte é o wizard de planilhas */}
        <div className="space-y-1 border-t border-border/30 pt-3">
          <Label className="text-xs">Classificação de produtos</Label>
          {orderBumps.length > 0 ? (
            <p className="text-[11px] text-muted-foreground">
              <strong>{orderBumps.length}</strong> produto(s) marcados como order bump:{" "}
              {orderBumps.slice(0, 4).join(", ")}
              {orderBumps.length > 4 ? `, +${orderBumps.length - 4}` : ""}. Todo produto não
              listado conta como ingresso da captação.
            </p>
          ) : (
            <p className="text-[11px] text-amber-600">
              Nenhum order bump marcado — todo produto será contado como ingresso da captação.
            </p>
          )}
          {onOpenSpreadsheets && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-[11px]"
              onClick={onOpenSpreadsheets}
            >
              <ExternalLink className="h-3 w-3" />
              Editar em Planilhas
            </Button>
          )}
        </div>

        {/* Mapa de campos da pesquisa (por expert) */}
        <div className="space-y-2 border-t border-border/30 pt-3">
          <Label className="text-xs">Campos da pesquisa (deste expert)</Label>
          {survey?.semPesquisa ? (
            <p className="text-[11px] text-muted-foreground">
              Nenhuma pesquisa com respostas vinculada a esta etapa — o bloco de qualificação do
              Resumão fica de fora até existir uma.
            </p>
          ) : (
            <div className="space-y-2">
              {SURVEY_CANONICAL_FIELDS.map((f) => (
                <div key={f.value} className="grid grid-cols-[90px_1fr] items-center gap-2">
                  <span className="text-[11px] text-muted-foreground">
                    {f.label}
                    {f.required && <span className="text-red-500"> *</span>}
                  </span>
                  <Select
                    value={campos[f.value] ?? "__none__"}
                    onValueChange={(v) => {
                      const next = { ...campos };
                      if (v === "__none__") delete next[f.value];
                      else next[f.value] = v;
                      handleSaveCampos(next);
                    }}
                  >
                    <SelectTrigger className="h-7 text-[11px]">
                      <SelectValue placeholder="não mapeado" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__" className="text-[11px]">
                        não mapeado
                      </SelectItem>
                      {(survey?.questions ?? []).map((q) => (
                        <SelectItem key={q.key} value={q.key} className="text-[11px]">
                          {q.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
              <p className="text-[11px] text-muted-foreground">
                Campo não mapeado é omitido do Resumão — não é erro.
              </p>
            </div>
          )}
        </div>

        {/* Validação */}
        <div className="space-y-2 border-t border-border/30 pt-3">
          {!confirmingValidation ? (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => setConfirmingValidation(true)}
              disabled={!data?.stage || validado}
            >
              {validado ? "Já validado" : "Marcar como validado"}
            </Button>
          ) : (
            <div className="space-y-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5">
              <p className="text-[11px] font-medium text-amber-600">
                Confirme que cada item foi feito — validar libera números para decisão:
              </p>
              <ul className="space-y-0.5">
                {CHECKLIST_VALIDACAO.map((item) => (
                  <li key={item} className="text-[11px] text-muted-foreground">
                    • {item}
                  </li>
                ))}
              </ul>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="h-7 flex-1 text-[11px]"
                  onClick={handleValidate}
                  disabled={validate.isPending}
                >
                  {validate.isPending ? "Validando..." : "Confirmo, validar"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[11px]"
                  onClick={() => setConfirmingValidation(false)}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
