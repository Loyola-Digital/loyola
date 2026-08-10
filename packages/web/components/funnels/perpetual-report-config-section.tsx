"use client";

/**
 * Story 41.7 — Aba "Relatórios" do funil PERPÉTUO: config do botão 3.
 *
 * Mesma lógica de leitura da 41.1: a primeira coisa que a tela comunica é o
 * estado do gate — se o relatório está liberado e, quando não está, por quê.
 * Só depois vêm as premissas.
 *
 * A diferença conceitual em relação à aba de lançamento: aqui várias premissas
 * NÃO são editáveis porque já vivem no funil (conta Meta, campanhas vinculadas,
 * expert). Elas aparecem em leitura, para o usuário conferir sem duplicar.
 */

import { useEffect, useState } from "react";
import {
  FileBarChart2,
  ShieldCheck,
  ShieldAlert,
  Info,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { usePerpetualProducts } from "@/lib/hooks/use-perpetual-spreadsheet";
import {
  proporPremissas,
  aplicarProposta,
  detectarDivergencia,
} from "@/lib/utils/perpetual-premissas-produto";
import {
  usePerpetualReportConfig,
  useSavePerpetualReportConfig,
  useValidatePerpetualReportConfig,
  PERPETUAL_VALIDATION_CHECKLIST,
  type PerpetualConfigInput,
  type PerpetualRates,
  type RateOrigem,
} from "@/lib/hooks/use-perpetual-report-config";
import { PerpetualReportButton } from "@/components/funnels/perpetual-report-button";

interface Props {
  projectId: string;
  funnelId: string;
}

/** Fração → percentual legível. 0.0499 → "4,99%". */
function pct(n: number): string {
  return `${(n * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
}

/** Campo de taxa: aceita percentual na UI, guarda fração no banco. */
function RateField({
  label,
  value,
  placeholder,
  origem,
  onChange,
}: {
  label: string;
  value: number | null;
  placeholder: string;
  origem?: RateOrigem;
  onChange: (v: number | null) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs flex items-center gap-1.5">
        {label}
        {origem === "config" && (
          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-600">
            override
          </span>
        )}
      </Label>
      <div className="relative">
        <Input
          type="number"
          step="0.01"
          min="0"
          max="99"
          value={value === null ? "" : (value * 100).toString()}
          placeholder={placeholder}
          onChange={(e) => {
            const raw = e.target.value.trim();
            if (!raw) return onChange(null);
            const n = Number.parseFloat(raw);
            onChange(Number.isFinite(n) ? n / 100 : null);
          }}
          className="pr-7"
        />
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          %
        </span>
      </div>
    </div>
  );
}

/** Memorial das taxas (§C.3.4) — mostra a composição, não só o resultado. */
function RatesPreview({ rates, titulo, nota }: { rates: PerpetualRates; titulo: string; nota: string }) {
  return (
    <div className="rounded-lg border border-border/60 p-3 space-y-1.5">
      <p className="text-xs font-medium">{titulo}</p>
      <p className="text-[11px] text-muted-foreground">{nota}</p>
      <div className="space-y-0.5 pt-1 text-xs tabular-nums">
        <div className="flex justify-between text-red-500">
          <span>− Taxa de plataforma</span>
          <span>{pct(rates.plataforma)}</span>
        </div>
        <div className="flex justify-between text-red-500">
          <span>− Imposto</span>
          <span>{pct(rates.imposto)}</span>
        </div>
        <div className="flex justify-between text-red-500">
          <span>− Outros</span>
          <span>{pct(rates.outros)}</span>
        </div>
        {rates.reembolso > 0 && (
          <div className="flex justify-between text-red-500">
            <span>− Reembolso (estimado)</span>
            <span>{pct(rates.reembolso)}</span>
          </div>
        )}
        <div className="flex justify-between border-t border-border/40 pt-1 font-medium text-emerald-600">
          <span>= Receita líquida</span>
          <span>{pct(rates.receitaLiquidaPct)}</span>
        </div>
      </div>
    </div>
  );
}

/** Mesma quebra do `splitList` do formulário, disponível antes dele. */
function splitListPuro(s: string): string[] {
  return s.split(",").map((v) => v.trim()).filter(Boolean);
}

export function PerpetualReportConfigSection({ projectId, funnelId }: Props) {
  const { data, isLoading } = usePerpetualReportConfig(projectId, funnelId);
  const save = useSavePerpetualReportConfig(projectId, funnelId);
  const validate = useValidatePerpetualReportConfig(projectId, funnelId);

  const [form, setForm] = useState<PerpetualConfigInput>({});
  const [origensText, setOrigensText] = useState("meta");
  const [bumpsText, setBumpsText] = useState("");
  const [showChecklist, setShowChecklist] = useState(false);

  // Story 29.50 — a classificação da planilha (29.49) alimenta as premissas.
  // Antes disto, produto e bumps eram redigitados aqui, e um acento diferente
  // fazia o relatório calcular sobre um produto inexistente sem avisar.
  const { data: produtosData } = usePerpetualProducts(projectId, funnelId);
  const proposta = proporPremissas(produtosData?.products ?? []);
  // Marca o que ESTA sessão preencheu automaticamente — é o que o AC3 exige
  // mostrar. Sem isso o campo aparece preenchido do nada e o gestor reconfere
  // tudo à mão, anulando o ganho.
  const [origemAuto, setOrigemAuto] = useState({ produto: false, bumps: false });

  // Hidrata o formulário quando a config chega. `origensPagas` e order bumps são
  // listas — na UI viram texto separado por vírgula, que é como o usuário pensa.
  useEffect(() => {
    if (!data) return;
    const c = data.config;
    setForm({
      prefixoCampanha: c?.prefixoCampanha ?? null,
      produto: c?.produto ?? null,
      temSplitFormato: c?.temSplitFormato ?? false,
      inicioTrafego: c?.inicioTrafego ?? null,
      impostoPct: c?.impostoOrigem === "config" ? c.impostoPct : null,
      taxaPlataformaPct: c?.taxaPlataformaPct ?? null,
      taxaImpostoPct: c?.taxaImpostoPct ?? null,
      taxaOutrosPct: c?.taxaOutrosPct ?? null,
    });
    setOrigensText((c?.origensPagas ?? ["meta"]).join(", "));

    // AC1/AC4: a proposta SÓ age em campo vazio. Premissa que o gestor ajustou
    // de propósito não pode ser sobrescrita pela chegada desta story.
    const aplicado = aplicarProposta(
      { produto: c?.produto ?? null, produtosOrderBump: c?.produtosOrderBump ?? [] },
      proposta,
    );
    if (aplicado.preencheuProduto) {
      setForm((f) => ({ ...f, produto: aplicado.produto }));
    }
    setBumpsText(aplicado.produtosOrderBump.join(", "));
    setOrigemAuto({ produto: aplicado.preencheuProduto, bumps: aplicado.preencheuBumps });
    // `proposta` deriva de `produtosData`; incluí-la na lista faria a hidratação
    // reescrever o formulário a cada refetch, apagando edição em andamento.
    // eslint-disable-next-line
  }, [data, produtosData]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (!data) return null;

  const validado = data.config?.validado ?? false;

  // AC2: puxar não trava. O gestor sobrescreve, e a tela avisa da divergência
  // em vez de bloquear — comparando pela chave canônica, então acento e caixa
  // não disparam aviso (sinalizá-los treinaria o gestor a ignorá-lo).
  const divergencia = detectarDivergencia(
    { produto: form.produto ?? null, produtosOrderBump: splitListPuro(bumpsText) },
    proposta,
  );

  const splitList = (s: string) =>
    s
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);

  function handleSave() {
    const origens = splitList(origensText);
    if (origens.length === 0) {
      toast.error("Informe ao menos uma origem paga — sem isso nenhuma venda entra em CAC/ROAS");
      return;
    }
    save.mutate(
      { ...form, origensPagas: origens, produtosOrderBump: splitList(bumpsText) },
      {
        onSuccess: (res) => {
          toast.success(
            res.validadoResetado
              ? "Config salva. A validação foi resetada — as premissas mudaram."
              : "Config salva",
          );
        },
        onError: () => toast.error("Não foi possível salvar a config"),
      },
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <FileBarChart2 className="h-4 w-4 text-primary" />
          Relatórios — Funil Perpétuo
        </h3>
        <p className="text-xs text-muted-foreground">
          Premissas que o gerador usa para calcular este funil. Enquanto o funil não estiver
          validado, o relatório fica bloqueado.
        </p>
      </div>

      {/* Estado do gate — antes de qualquer campo */}
      {data.bloqueio ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 space-y-1">
          <p className="flex items-center gap-2 text-sm font-medium text-red-500">
            <ShieldAlert className="h-4 w-4" />
            Não validado — relatório bloqueado
          </p>
          <p className="text-xs text-muted-foreground">{data.bloqueio.detalhe}</p>
          <p className="text-xs text-muted-foreground">{data.bloqueio.acao}</p>
        </div>
      ) : (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-emerald-600">
            <ShieldCheck className="h-4 w-4" />
            Validado
            {data.config?.validadoEm
              ? ` em ${new Date(data.config.validadoEm).toLocaleDateString("pt-BR")}`
              : ""}
            {data.config?.validadoPorNome ? ` por ${data.config.validadoPorNome}` : ""}
          </p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ---- Coluna 1: premissas ---- */}
        <div className="space-y-4">
          <div className="rounded-xl border border-border/60 p-4 space-y-3">
            <p className="text-sm font-medium">Premissas do funil</p>

            <div className="space-y-1">
              <Label className="text-xs">Produto principal</Label>
              <Input
                value={form.produto ?? ""}
                placeholder="Nome do produto na plataforma de venda"
                onChange={(e) => {
                  setForm((f) => ({ ...f, produto: e.target.value || null }));
                  // Digitou: deixa de ser valor da planilha, e o rótulo some.
                  setOrigemAuto((o) => ({ ...o, produto: false }));
                }}
              />
              {/* AC3: dizer DE ONDE veio. Campo preenchido sozinho, sem
                  explicação, gera a dúvida oposta ("de onde saiu isso?") e faz
                  o gestor reconferir tudo à mão. */}
              {origemAuto.produto && (
                <p className="text-[11px] text-emerald-600">
                  Preenchido pela classificação da planilha.
                </p>
              )}
              {/* AC1: com mais de um principal, a tela NÃO escolhe. */}
              {proposta.ambiguo && (
                <p className="text-[11px] text-amber-600">
                  A planilha tem {proposta.candidatosPrincipal.length} produtos classificados como
                  principal ({proposta.candidatosPrincipal.join(", ")}). Escolha qual vale para o
                  relatório.
                </p>
              )}
              {divergencia.produto && (
                <p className="text-[11px] text-amber-600">
                  Diferente do que está classificado na planilha
                  {proposta.candidatosPrincipal.length === 1
                    ? ` (${proposta.candidatosPrincipal[0]})`
                    : ""}
                  .
                </p>
              )}
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Order bumps</Label>
              <Input
                value={bumpsText}
                placeholder="Nomes separados por vírgula (vazio se não há)"
                onChange={(e) => {
                  setBumpsText(e.target.value);
                  setOrigemAuto((o) => ({ ...o, bumps: false }));
                }}
              />
              <p className="text-[11px] text-muted-foreground">
                Contam no faturamento, mas não criam comprador novo — a oferta do perpétuo é
                única.
              </p>
              {origemAuto.bumps && (
                <p className="text-[11px] text-emerald-600">
                  Preenchidos pela classificação da planilha.
                </p>
              )}
              {divergencia.bumps && (
                <p className="text-[11px] text-amber-600">
                  Diferente do que está classificado na planilha
                  {proposta.produtosOrderBump.length > 0
                    ? ` (${proposta.produtosOrderBump.join(", ")})`
                    : " (nenhum produto marcado como order bump)"}
                  .
                </p>
              )}
              {/* AC4: sem classificação, o comportamento é o de sempre — e uma
                  dica de que classificar preencheria isto sozinho. */}
              {produtosData && !produtosData.productMapped && (
                <p className="text-[11px] text-muted-foreground">
                  Classifique os produtos na planilha do funil para preencher este campo
                  automaticamente.
                </p>
              )}
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Origens pagas (utm_source)</Label>
              <Input
                value={origensText}
                placeholder="meta, fb"
                onChange={(e) => setOrigensText(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                Venda de origem fora desta lista é tratada como orgânica e fica fora de CAC, ROAS
                e margem — reportada à parte.
              </p>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Prefixo de campanha (opcional)</Label>
              <Input
                value={form.prefixoCampanha ?? ""}
                placeholder="ex.: bbe-a1-jul-26"
                onChange={(e) =>
                  setForm((f) => ({ ...f, prefixoCampanha: e.target.value || null }))
                }
              />
              <p className="flex items-start gap-1.5 text-[11px] text-amber-600">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                <span>
                  O prefixo <strong>roda por ciclo</strong> (mês). Ele não é a fonte das
                  campanhas — serve só para avisar quando existe campanha que casa com ele e
                  ainda não foi vinculada ao funil.
                </span>
              </p>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 p-3">
              <div className="space-y-0.5">
                <Label className="text-xs">Split de formato</Label>
                <p className="text-[11px] text-muted-foreground">
                  Marque só se os nomes de campanha trazem <code>videos</code>/
                  <code>estaticos</code>. Desmarcado, a seção some do relatório — não vai zerada.
                </p>
              </div>
              <Switch
                checked={form.temSplitFormato ?? false}
                onCheckedChange={(v) => setForm((f) => ({ ...f, temSplitFormato: v }))}
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Início do tráfego (opcional)</Label>
              <Input
                type="date"
                value={form.inicioTrafego ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, inicioTrafego: e.target.value || null }))}
              />
            </div>
          </div>

          {/* Herdado do funil — leitura, para não duplicar config */}
          <div className="rounded-xl border border-border/60 p-4 space-y-2">
            <p className="flex items-center gap-1.5 text-sm font-medium">
              <Info className="h-3.5 w-3.5 text-muted-foreground" />
              Vem do funil
            </p>
            <div className="space-y-1 text-xs text-muted-foreground">
              <p>
                Conta Meta:{" "}
                <span className="text-foreground">
                  {data.herdado.metaAccountId ? "vinculada" : "não vinculada"}
                </span>
              </p>
              <p>
                Campanhas vinculadas:{" "}
                <span className="text-foreground">{data.herdado.campanhasVinculadas}</span>
              </p>
            </div>
            <p className="text-[11px] text-muted-foreground">
              As campanhas do relatório são as vinculadas no picker da aba Meta Ads — é esse o
              vínculo, não o prefixo. Campanha nova precisa ser adicionada lá.
            </p>
          </div>
        </div>

        {/* ---- Coluna 2: taxas + validação ---- */}
        <div className="space-y-4">
          <div className="rounded-xl border border-border/60 p-4 space-y-3">
            <div className="space-y-1">
              <p className="text-sm font-medium">Taxas</p>
              <p className="text-[11px] text-muted-foreground">
                Em branco = default da plataforma. Preencha só para sobrescrever.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <RateField
                label="Plataforma"
                value={form.taxaPlataformaPct ?? null}
                placeholder="4,99"
                origem={data.resolvido.comStatusReal.fonte.plataforma}
                onChange={(v) => setForm((f) => ({ ...f, taxaPlataformaPct: v }))}
              />
              <RateField
                label="Imposto (receita)"
                value={form.taxaImpostoPct ?? null}
                placeholder="11"
                origem={data.resolvido.comStatusReal.fonte.imposto}
                onChange={(v) => setForm((f) => ({ ...f, taxaImpostoPct: v }))}
              />
              <RateField
                label="Outros"
                value={form.taxaOutrosPct ?? null}
                placeholder="1"
                origem={data.resolvido.comStatusReal.fonte.outros}
                onChange={(v) => setForm((f) => ({ ...f, taxaOutrosPct: v }))}
              />
              <RateField
                label="Imposto de mídia"
                value={form.impostoPct ?? null}
                placeholder="12,15"
                origem={data.config?.impostoOrigem}
                onChange={(v) => setForm((f) => ({ ...f, impostoPct: v }))}
              />
            </div>

            <div className="space-y-2 pt-1">
              <RatesPreview
                rates={data.resolvido.comStatusReal}
                titulo="Planilha com coluna de status"
                nota="Reembolso é medido e já sai do bruto."
              />
              <RatesPreview
                rates={data.resolvido.semStatusReal}
                titulo="Planilha sem coluna de status"
                nota="Reembolso entra como estimativa da plataforma."
              />
            </div>
          </div>

          <div className="rounded-xl border border-border/60 p-4 space-y-3">
            <p className="text-sm font-medium">Validação</p>
            <p className="text-[11px] text-muted-foreground">
              Marcar como validado é afirmar que os números foram conferidos contra o painel.
              Toda mudança de premissa reseta essa afirmação.
            </p>

            {showChecklist && (
              <ul className="space-y-1.5 rounded-lg border border-border/60 p-3">
                {PERPETUAL_VALIDATION_CHECKLIST.map((item) => (
                  <li key={item} className="flex gap-2 text-[11px] text-muted-foreground">
                    <span className="text-primary">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={handleSave} disabled={save.isPending}>
                {save.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                Salvar config
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowChecklist((v) => !v)}
                disabled={!data.config}
              >
                {showChecklist ? "Ocultar checklist" : "Ver checklist"}
              </Button>
              {!validado && (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!data.config || validate.isPending}
                  onClick={() => {
                    if (!showChecklist) {
                      setShowChecklist(true);
                      toast.info("Confira o checklist antes de validar");
                      return;
                    }
                    validate.mutate(undefined, {
                      onSuccess: () => toast.success("Funil validado — relatório liberado"),
                      onError: () => toast.error("Não foi possível validar"),
                    });
                  }}
                >
                  {validate.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                  Marcar como validado
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Story 41.9 — o botão vive abaixo da config, na mesma aba: quem valida
          é quem gera, e o estado do gate já está visível acima. */}
      <div className="border-t border-border/60 pt-4">
        <PerpetualReportButton projectId={projectId} funnelId={funnelId} />
      </div>
    </div>
  );
}
