"use client";

/**
 * Story 41.1 — Aba "Relatórios" da etapa: config do gerador de Resumão/Comparativo.
 *
 * A primeira coisa que a tela precisa comunicar não é um campo, é um estado:
 * se os botões de relatório estão liberados nesta etapa e, quando não estão,
 * por quê e o que fazer. Só depois vêm as premissas.
 */

import { useEffect, useState } from "react";
import { FileBarChart2, ShieldCheck, ShieldAlert, ExternalLink, Info } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useStageSalesSpreadsheets } from "@/lib/hooks/use-stage-sales-spreadsheets";
import { LaunchReportButton } from "@/components/funnels/launch-report-button";
import { LaunchComparativoButton } from "@/components/funnels/launch-comparativo-button";
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
  /** Leva à aba de Planilhas — origem da classificação captação × order bump. */
  onOpenSpreadsheets?: () => void;
}

export function LaunchReportConfigSection({
  projectId,
  funnelId,
  stageId,
  onOpenSpreadsheets,
}: Props) {
  const [confirmingValidation, setConfirmingValidation] = useState(false);

  const { data, isLoading } = useLaunchReportConfig(projectId, funnelId, stageId);
  const { data: sheets } = useStageSalesSpreadsheets(projectId, funnelId, stageId);
  const { data: survey } = useLaunchReportSurveyQuestions(projectId, funnelId, stageId, true);

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

  // Hidrata o formulário quando a config chega do servidor.
  useEffect(() => {
    if (!data) return;
    if (data.stage) {
      setTipo(data.stage.tipo);
      setEtapa(data.stage.etapa);
      setEntidade(data.stage.entidadeCaptura);
    }
    // Período: valor salvo manda; sem ele, entra a sugestão derivada do dado
    // (1ª conversão / último dia com investimento). Deixar em branco obrigava o
    // usuário a ir garimpar as datas em outra tela.
    setDataInicio(data.stage?.dataInicio ?? data.sugestaoPeriodo?.dataInicio ?? "");
    setDataFim(data.stage?.dataFim ?? data.sugestaoPeriodo?.dataFim ?? "");
    // Alíquota sempre visível — inclusive quando é a padrão. Campo vazio parecia
    // "sem imposto", quando na verdade valia 12,15%.
    setImpostoStage(
      (data.resolvido.impostoPct * 100).toFixed(2).replace(/\.?0+$/, "").replace(".", ","),
    );
    setCampos(data.expert.camposPesquisa ?? {});
  }, [data]);

  const validado = data?.stage?.validado ?? false;
  const orderBumps = (sheets ?? []).flatMap((s) => s.orderBumpProducts ?? []);

  // Mudar qualquer uma das três premissas invalida a conferência anterior.
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
        // A mensagem do servidor vai junto: "Não foi possível salvar" sozinho
        // não diz se faltou campo, se o período está inválido ou se é permissão.
        onError: (e: unknown) =>
          toast.error(`Não foi possível salvar a config: ${(e as Error)?.message ?? "erro desconhecido"}`),
      },
    );
  }

  function handleSaveCampos(next: Partial<Record<SurveyCanonicalField, string>>) {
    setCampos(next);
    saveExpert.mutate(
      { camposPesquisa: next },
      {
        onError: (e: unknown) =>
          toast.error(
            `Não foi possível salvar o mapa de campos: ${(e as Error)?.message ?? "erro desconhecido"}`,
          ),
      },
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

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 rounded-xl" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <FileBarChart2 className="h-4 w-4 text-primary" />
          Relatórios — Resumão e Comparativo
        </h3>
        <p className="text-xs text-muted-foreground">
          Configuração que o gerador usa para calcular esta etapa. Enquanto a combinação não
          estiver liberada, os botões de relatório ficam bloqueados.
        </p>
      </div>

      {/* Estado do gate — antes de qualquer campo */}
      {data?.bloqueio ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 space-y-1">
          <p className="flex items-center gap-2 text-sm font-medium text-red-500">
            <ShieldAlert className="h-4 w-4" />
            Não validado — botões de relatório bloqueados
          </p>
          <p className="text-xs text-muted-foreground">{data.bloqueio.detalhe}</p>
          <p className="text-xs text-muted-foreground">{data.bloqueio.acao}</p>
        </div>
      ) : (
        data && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
            <p className="flex items-center gap-2 text-sm font-medium text-emerald-600">
              <ShieldCheck className="h-4 w-4" />
              {validado
                ? `Validado${
                    data.stage?.validadoEm
                      ? ` em ${new Date(data.stage.validadoEm).toLocaleDateString("pt-BR")}`
                      : ""
                  }${data.stage?.validadoPorNome ? ` por ${data.stage.validadoPorNome}` : ""}`
                : `Combinação de referência (${data.escopoValidado.tipo} / ${data.escopoValidado.etapa}) — liberado`}
            </p>
          </div>
        )
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ---- Premissas do lançamento ---- */}
        <div className="space-y-4 rounded-xl border border-border/40 bg-card/40 p-4">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Premissas do lançamento
          </h4>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Tipo</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as LaunchReportTipo)}>
                <SelectTrigger className="h-9 text-xs">
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

            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">Etapa (prefixo da campanha)</Label>
              <Select value={etapa} onValueChange={(v) => setEtapa(v as LaunchReportEtapa)}>
                <SelectTrigger className="h-9 text-xs">
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
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Entidade de captura</Label>
            <Select value={entidade} onValueChange={(v) => setEntidade(v as LaunchReportEntidade)}>
              <SelectTrigger className="h-9 text-xs">
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
            <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-600">
              Mudar tipo, etapa ou entidade reseta a validação — a conferência anterior deixa de
              valer.
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Início do período</Label>
              <Input
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
                className="h-9 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Fim do período</Label>
              <Input
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
                className="h-9 text-xs"
              />
            </div>
          </div>
          <p className="flex gap-1.5 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3 w-3 shrink-0" />
            Pré-preenchido com o período derivado do dado: início na 1ª conversão registrada, fim
            no último dia com investimento. Ajuste se precisar — evita contar dias com spend e sem
            conversão.
          </p>

          <div className="space-y-1.5">
            <Label className="text-xs">Imposto sobre mídia — Meta Ads 2026 (%)</Label>
            <Input
              inputMode="decimal"
              placeholder="12,15"
              value={impostoStage}
              onChange={(e) => setImpostoStage(e.target.value)}
              className="h-9 max-w-[160px] text-xs"
            />
            {data && (
              <p className="text-xs text-muted-foreground">
                Em uso:{" "}
                <strong className="text-foreground">
                  {(data.resolvido.impostoPct * 100).toFixed(2).replace(".", ",")}%
                </strong>{" "}
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

          <Button size="sm" onClick={handleSaveStage} disabled={saveStage.isPending}>
            {saveStage.isPending ? "Salvando..." : "Salvar config"}
          </Button>

          {/* Produtos — leitura; a fonte é o wizard de Planilhas */}
          <div className="space-y-1.5 border-t border-border/30 pt-4">
            <Label className="text-xs">Classificação de produtos</Label>
            {orderBumps.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                <strong className="text-foreground">{orderBumps.length}</strong> produto(s)
                marcados como order bump: {orderBumps.slice(0, 6).join(", ")}
                {orderBumps.length > 6 ? `, +${orderBumps.length - 6}` : ""}. Todo produto não
                listado conta como ingresso da captação.
              </p>
            ) : (
              <p className="text-xs text-amber-600">
                Nenhum order bump marcado — todo produto será contado como ingresso da captação.
              </p>
            )}
            {onOpenSpreadsheets && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
                onClick={onOpenSpreadsheets}
              >
                <ExternalLink className="h-3 w-3" />
                Editar em Planilhas
              </Button>
            )}
          </div>
        </div>

        {/* ---- Pesquisa + validação ---- */}
        <div className="space-y-4 rounded-xl border border-border/40 bg-card/40 p-4">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Campos da pesquisa (deste expert)
          </h4>

          {survey?.semPesquisa ? (
            <p className="text-xs text-muted-foreground">
              Nenhuma pesquisa com respostas vinculada a esta etapa — o bloco de qualificação do
              Resumão fica de fora até existir uma.
            </p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                Cada expert tem formulário próprio. Ligue o campo que o Resumão espera à pergunta
                real deste formulário. Campo não mapeado é omitido — não é erro.
              </p>
              <div className="space-y-2">
                {SURVEY_CANONICAL_FIELDS.map((f) => (
                  <div
                    key={f.value}
                    className="grid grid-cols-[130px_1fr] items-center gap-3"
                  >
                    <span className="text-xs text-muted-foreground">
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
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="não mapeado" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__" className="text-xs">
                          não mapeado
                        </SelectItem>
                        {(survey?.questions ?? []).map((q) => (
                          <SelectItem key={q.key} value={q.key} className="text-xs">
                            {q.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Validação */}
          <div className="space-y-2 border-t border-border/30 pt-4">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Validação da combinação
            </h4>
            {!confirmingValidation ? (
              <>
                <p className="text-xs text-muted-foreground">
                  Marcar como validado afirma que os números desta etapa foram conferidos contra o
                  painel. É o que libera os botões para combinações fora da referência.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmingValidation(true)}
                  disabled={!data?.stage || validado}
                >
                  {validado ? "Já validado" : "Marcar como validado"}
                </Button>
              </>
            ) : (
              <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                <p className="text-xs font-medium text-amber-600">
                  Confirme que cada item foi feito — validar libera números para decisão:
                </p>
                <ul className="space-y-1">
                  {CHECKLIST_VALIDACAO.map((item) => (
                    <li key={item} className="text-xs text-muted-foreground">
                      • {item}
                    </li>
                  ))}
                </ul>
                <div className="flex gap-2 pt-1">
                  <Button size="sm" onClick={handleValidate} disabled={validate.isPending}>
                    {validate.isPending ? "Validando..." : "Confirmo, validar"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmingValidation(false)}
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Story 41.5 — o gerador mora na MESMA aba da config, e não no topo do
          dashboard como a AC7 previa: a 41.1 moveu a config para aba própria, e
          separar os dois faria o usuário validar num lugar e gerar em outro. É
          também o padrão que o perpétuo (41.9) já segue. */}
      <div className="border-t border-border/60 pt-6">
        <LaunchReportButton projectId={projectId} funnelId={funnelId} stageId={stageId} />
      </div>

      {/* Story 41.6 — o Comparativo depende do Resumão (mesmo motor, mesmas
          guardas), então vem depois dele na mesma aba. */}
      <div className="border-t border-border/60 pt-6">
        <LaunchComparativoButton projectId={projectId} funnelId={funnelId} stageId={stageId} />
      </div>
    </div>
  );
}
