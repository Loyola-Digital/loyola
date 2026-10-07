"use client";

/**
 * Story 49.6 (AC11/AC12, + AC7 da 49.11) — "Gerar debriefing" na etapa
 * Debriefing, com o formulário da config (rotas da 49.1).
 *
 * Herdado do `launch-report-button.tsx` (41.5):
 *  1. o estado BLOQUEADO aparece antes do clique — o botão não é a 1ª notícia;
 *  2. erro da geração fica NA TELA (diálogo que só fecha pelo usuário), com
 *     código, detalhe e ação — nunca toast que some;
 *  3. durante a geração, o PASSO atual (não um spinner mudo).
 * Com a API atrás (rota inexistente), a frase padrão da 47.15 — nunca
 * "Not Found" cru. A lógica testável mora em `lib/utils/debriefing-config-form.ts`.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowDown, ArrowUp, CheckCircle2, FileBarChart, Loader2, Settings2, ShieldAlert, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useApiHealth } from "@/lib/hooks/use-api-health";
import { useFunnels } from "@/lib/hooks/use-funnels";
import { useFunnelStages } from "@/lib/hooks/use-funnel-stages";
import {
  useDebriefingConfig,
  useGerarDebriefing,
  useSalvarDebriefingConfig,
  useValidarDebriefingConfig,
} from "@/lib/hooks/use-debriefing-generate";
import {
  CONTRATO_DA_GERACAO,
  CONTRATO_DA_LISTA,
  DIMENSOES_DA_PESQUISA,
  DIMENSOES_DO_CRIATIVO,
  ESCOPO_DOS_FUNIS_DA_COMPARACAO,
  PAPEIS_DO_DEBRIEFING,
  PASSOS_DA_GERACAO,
  ROTULO_DO_PAPEL,
  corpoDoPut,
  erroDaGeracao,
  erroDaValidacao,
  faltantesDoForm,
  formDoGet,
  formVazio,
  motivoSemSegundoItem,
  nomeDoFunilDaComparacao,
  opcoesDaComparacao,
  removidosDoGet,
  type ErroDaGeracao,
  type FormDaConfig,
  type PapelDoDebriefing,
} from "@/lib/utils/debriefing-config-form";

interface Props {
  projectId: string;
  funnelId: string;
  stageId: string;
  /** Caminho da etapa, para o `?from=` do viewer. */
  from: string;
}

const ROTULO_DIMENSAO: Record<string, string> = {
  faixa: "Faixa (lead score)",
  idade: "Idade",
  sexo: "Sexo",
  estado_civil: "Estado civil",
  escolaridade: "Escolaridade",
  renda: "Renda",
  profissao: "Profissão",
  setor: "Setor",
  funcionarios: "Funcionários",
  religiao: "Religião",
};

const sel = "h-8 w-full rounded-md border border-input bg-background px-2 text-xs";

export function DebriefingGenerateButton({ projectId, funnelId, stageId, from }: Props) {
  const { data: cfg, error: erroCfg } = useDebriefingConfig(projectId, funnelId, stageId);
  const { data: health } = useApiHealth();
  const apiContrato = health?.contract;
  const gerar = useGerarDebriefing(projectId, funnelId, stageId);

  const [formAberto, setFormAberto] = useState(false);
  const [dialogo, setDialogo] = useState(false);
  const [erro, setErro] = useState<ErroDaGeracao | null>(null);
  const [gerado, setGerado] = useState<{ id: string; alertas: number } | null>(null);
  const [passo, setPasso] = useState(0);

  // Passos enquanto a geração roda — indicação honesta do que o servidor faz.
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (gerar.isPending) {
      setPasso(0);
      timer.current = setInterval(() => setPasso((p) => Math.min(p + 1, PASSOS_DA_GERACAO.length - 1)), 2500);
    } else if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [gerar.isPending]);

  // Motivo de bloqueio ANTES do clique.
  const apiSemGeracao = typeof apiContrato === "number" && apiContrato < CONTRATO_DA_GERACAO;
  const motivoBloqueio = erroCfg
    ? erroDaGeracao(erroCfg).detalhe
    : cfg?.bloqueio
      ? `${cfg.bloqueio.detalhe} — ${cfg.bloqueio.acao}`
      : apiSemGeracao
        ? `A API em uso (contrato ${apiContrato}) ainda não tem a geração do debriefing (contrato ${CONTRATO_DA_GERACAO}) — provavelmente está atrás do painel. Veja o aviso de versão no topo.`
        : null;

  function handleGerar() {
    setErro(null);
    setGerado(null);
    setDialogo(true);
    gerar.mutate(
      { investimentoOficial: null },
      {
        onSuccess: (r) => setGerado({ id: r.id, alertas: r.alertas.length }),
        onError: (e) => setErro(erroDaGeracao(e)),
      },
    );
  }

  return (
    <>
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setFormAberto(true)}>
            <Settings2 className="h-3.5 w-3.5" />
            Config. do gerador
          </Button>
          <Button size="sm" className="gap-1.5" onClick={handleGerar} disabled={!cfg || !!motivoBloqueio || gerar.isPending}>
            {gerar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileBarChart className="h-3.5 w-3.5" />}
            Gerar debriefing
          </Button>
        </div>
        {motivoBloqueio && (
          <p className="flex max-w-md items-start gap-1 text-right text-[11px] text-red-500">
            <ShieldAlert className="mt-0.5 h-3 w-3 shrink-0" />
            <span>Gerar bloqueado: {motivoBloqueio}</span>
          </p>
        )}
      </div>

      <Dialog open={dialogo} onOpenChange={(o) => !gerar.isPending && setDialogo(o)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Gerar debriefing</DialogTitle>
          </DialogHeader>
          {gerar.isPending && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {PASSOS_DA_GERACAO[passo]}
            </p>
          )}
          {erro && (
            <div className="space-y-1 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
              <p className="flex items-center gap-2 text-sm font-medium text-amber-600">
                <AlertTriangle className="h-4 w-4" />
                {erro.titulo}
              </p>
              {erro.codigo && <p className="text-[11px] font-mono text-muted-foreground">{erro.codigo}</p>}
              <p className="text-xs text-muted-foreground">{erro.detalhe}</p>
              <p className="text-xs text-muted-foreground">
                <strong>O que fazer:</strong> {erro.acao}
              </p>
              {erro.violacoes && erro.violacoes.length > 1 && (
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] text-muted-foreground">
                  {erro.violacoes.slice(1).map((v) => (
                    <li key={v.codigo}>
                      <strong>{v.codigo}</strong> — {v.detalhe}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {gerado && (
            <div className="space-y-2 rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-4">
              <p className="flex items-center gap-2 text-sm font-medium text-emerald-600">
                <CheckCircle2 className="h-4 w-4" />
                Debriefing gerado — já está na lista da etapa
              </p>
              {gerado.alertas > 0 && (
                <p className="text-xs text-muted-foreground">
                  {gerado.alertas} sinalização(ões) no banner do topo do documento (não bloqueiam).
                </p>
              )}
              <Link className="text-sm font-medium text-primary underline" href={`/debriefings/${gerado.id}?from=${encodeURIComponent(from)}`}>
                Abrir no viewer
              </Link>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Sheet open={formAberto} onOpenChange={setFormAberto}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>Configuração do gerador de debriefing</SheetTitle>
          </SheetHeader>
          {formAberto && (
            <FormularioDaConfig projectId={projectId} funnelId={funnelId} stageId={stageId} apiContrato={apiContrato} />
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

// ---------------------------------------------------------------------------
// Formulário (lê e grava pela 49.1)
// ---------------------------------------------------------------------------

function FormularioDaConfig({
  projectId,
  funnelId,
  stageId,
  apiContrato,
}: {
  projectId: string;
  funnelId: string;
  stageId: string;
  apiContrato: number | undefined;
}) {
  const { data: cfg, isLoading, error } = useDebriefingConfig(projectId, funnelId, stageId);
  // 49.13: ativos E arquivados (o servidor aceita arquivado como comparação).
  const { data: funis } = useFunnels(projectId, ESCOPO_DOS_FUNIS_DA_COMPARACAO);
  const { data: etapas } = useFunnelStages(projectId, funnelId);
  const salvar = useSalvarDebriefingConfig(projectId, funnelId, stageId);
  const validar = useValidarDebriefingConfig(projectId, funnelId, stageId);

  const [f, setF] = useState<FormDaConfig>(formVazio());
  const [carregado, setCarregado] = useState(false);
  const [erroSalvar, setErroSalvar] = useState<string[] | null>(null);
  const [erroValidar, setErroValidar] = useState<ErroDaGeracao | null>(null);
  useEffect(() => {
    if (cfg && !carregado) {
      setF(formDoGet(cfg));
      setCarregado(true);
    }
  }, [cfg, carregado]);

  const removidos = useMemo(() => (cfg?.config ? removidosDoGet(cfg.config) : []), [cfg]);
  const nomeDoFunil = (id: string) => nomeDoFunilDaComparacao(funis, id);
  const etapasDoFunil = (etapas ?? []).filter((e) => e.id !== stageId);
  const comPesquisa = (cfg?.perguntasDisponiveis ?? []).filter((e) => e.status === "ok");
  const falta = faltantesDoForm(
    f,
    comPesquisa.map((e) => ({ stageId: e.stageId, nome: e.stageName })),
  );
  const motivo2 = motivoSemSegundoItem(apiContrato);
  const vivos = f.comparacoes.filter((id) => !removidos.includes(id));

  if (isLoading) return <p className="p-4 text-sm text-muted-foreground">Carregando…</p>;
  if (error || !cfg) {
    const e = erroDaGeracao(error);
    return (
      <p className="p-4 text-sm text-red-500">
        {e.titulo}: {e.detalhe}
      </p>
    );
  }
  if (cfg.tipoDeFunil !== "launch") {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        {cfg.bloqueio ? `${cfg.bloqueio.detalhe} — ${cfg.bloqueio.acao}` : "A config de lançamento não se aplica a este tipo de funil."}
      </p>
    );
  }

  const set = (p: Partial<FormDaConfig>) => setF((x) => ({ ...x, ...p }));
  const mover = (i: number, d: -1 | 1) =>
    setF((x) => {
      const l = [...x.comparacoes];
      const j = i + d;
      if (j < 0 || j >= l.length) return x;
      [l[i], l[j]] = [l[j]!, l[i]!];
      return { ...x, comparacoes: l };
    });

  async function handleSalvar() {
    setErroSalvar(null);
    if (falta.length > 0) return;
    try {
      const r = await salvar.mutateAsync(corpoDoPut(f, { apiContrato, removidos }));
      setCarregado(false); // relê do servidor (a lista removida some)
      toast.success(r.validacaoResetada ? "Config salva — a validação da combinação foi zerada (premissa mudou)" : "Config salva");
    } catch (e) {
      const body = (e as { body?: { erros?: string[]; error?: string } }).body;
      setErroSalvar(body?.erros ?? [body?.error ?? (e as Error).message]);
    }
  }

  return (
    <div className="mt-4 space-y-6 pb-10 text-sm">
      {/* Estado do gate */}
      <section className="space-y-2 rounded-xl border p-3">
        <p className="font-medium">Estado do gerador</p>
        {cfg.bloqueio ? (
          <div className="text-xs text-red-500">
            <p className="font-medium">{cfg.bloqueio.erro}</p>
            <p>{cfg.bloqueio.detalhe}</p>
            <p className="text-muted-foreground">{cfg.bloqueio.acao}</p>
          </div>
        ) : (
          <p className="text-xs text-emerald-600">Liberado para gerar.</p>
        )}
        {cfg.config?.validado ? (
          <p className="text-xs text-muted-foreground">
            Combinação validada{cfg.config.validadoPorNome ? ` por ${cfg.config.validadoPorNome}` : ""}
            {cfg.config.validadoEm ? ` em ${new Date(cfg.config.validadoEm).toLocaleDateString("pt-BR")}` : ""}.
          </p>
        ) : (
          <Button
            size="sm"
            variant="outline"
            disabled={!cfg.config || validar.isPending}
            onClick={() => {
              setErroValidar(null);
              validar.mutate(undefined, {
                onSuccess: () => toast.success("Combinação marcada como validada"),
                // Erro fica NA TELA, com código/detalhe/ação (UX-496-2) — não em toast.
                onError: (e) => setErroValidar(erroDaValidacao(e)),
              });
            }}
          >
            Marcar combinação como validada
          </Button>
        )}
        {erroValidar && (
          <div role="alert" className="space-y-1 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="flex items-center gap-2 text-xs font-medium text-amber-600">
                <AlertTriangle className="h-3.5 w-3.5" />
                {erroValidar.titulo}
              </p>
              <button type="button" aria-label="Fechar o aviso" className="text-muted-foreground" onClick={() => setErroValidar(null)}>
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            {erroValidar.codigo && <p className="text-[11px] font-mono text-muted-foreground">{erroValidar.codigo}</p>}
            <p className="text-xs text-muted-foreground">{erroValidar.detalhe}</p>
            <p className="text-xs text-muted-foreground">
              <strong>O que fazer:</strong> {erroValidar.acao}
            </p>
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">
          Validar = alguém do time conferiu os números contra as fixtures do expert. Mudar uma premissa zera a validação.
        </p>
      </section>

      {/* Datas-chave */}
      <section className="space-y-3">
        <p className="font-medium">Datas-chave</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {(
            [
              ["inicioCaptacao", "Início da captação"],
              ["aberturaCarrinho", "Abertura do carrinho"],
              ["fimCarrinho", "Fim do carrinho"],
            ] as const
          ).map(([k, rot]) => (
            <div key={k} className="space-y-1">
              <Label className="text-xs">{rot}</Label>
              <Input type="date" value={f[k]} onChange={(e) => set({ [k]: e.target.value } as Partial<FormDaConfig>)} />
            </div>
          ))}
        </div>
        {(["reabertura", "downsell"] as const).map((k) => (
          <div key={k} className="space-y-1">
            <Label className="text-xs">{k === "reabertura" ? "Reabertura" : "Downsell"}</Label>
            <div className="flex flex-wrap items-center gap-3 text-xs">
              {[true, false].map((v) => (
                <label key={String(v)} className="flex items-center gap-1">
                  <input type="radio" name={k} checked={f[k].houve === v} onChange={() => set({ [k]: { ...f[k], houve: v } } as Partial<FormDaConfig>)} />
                  {v ? "Houve" : "Não houve"}
                </label>
              ))}
              {f[k].houve && (
                <>
                  <Input className="h-8 w-40" type="date" value={f[k].abertura} onChange={(e) => set({ [k]: { ...f[k], abertura: e.target.value } } as Partial<FormDaConfig>)} />
                  <span>a</span>
                  <Input className="h-8 w-40" type="date" value={f[k].fim} onChange={(e) => set({ [k]: { ...f[k], fim: e.target.value } } as Partial<FormDaConfig>)} />
                </>
              )}
            </div>
          </div>
        ))}
      </section>

      {/* Comparação — lista ordenada (49.11 AC7) */}
      <section className="space-y-2">
        <p className="font-medium">Lançamentos de comparação (opcional)</p>
        <p className="text-[11px] text-muted-foreground">
          Em ordem: o 1º é a comparação principal (Δ e título “A × B”); a série histórica vale só para as perguntas presentes em todos.
          Sem nenhum, o documento sai como edição única.
        </p>
        {cfg.avisos.map((a, i) => (
          <p key={i} className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-[11px] text-amber-700">
            <strong>{a.codigo}</strong> — {a.detalhe}. {a.acao}
          </p>
        ))}
        <ol className="space-y-1">
          {f.comparacoes.map((id, i) => {
            const removido = removidos.includes(id);
            const pos = vivos.indexOf(id);
            return (
              <li key={id} className="flex items-center gap-2 rounded-md border px-2 py-1 text-xs">
                <span className={removido ? "flex-1 text-muted-foreground line-through" : "flex-1"}>
                  {i + 1}. {nomeDoFunil(id)}
                  {!removido && pos === 0 && <span className="ml-2 rounded bg-primary/10 px-1.5 text-[10px] text-primary">comparação principal</span>}
                  {removido && <span className="ml-2 text-[10px] text-amber-600 no-underline">removido — sai ao salvar</span>}
                </span>
                <button aria-label="Subir" disabled={i === 0} onClick={() => mover(i, -1)}>
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button aria-label="Descer" disabled={i === f.comparacoes.length - 1} onClick={() => mover(i, 1)}>
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
                <button aria-label="Remover" onClick={() => set({ comparacoes: f.comparacoes.filter((x) => x !== id) })}>
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
        </ol>
        {vivos.length >= 1 && motivo2 ? (
          <p className="text-[11px] text-red-500">{motivo2}</p>
        ) : (
          <select
            className={sel}
            value=""
            onChange={(e) => e.target.value && set({ comparacoes: [...f.comparacoes, e.target.value] })}
          >
            <option value="">+ adicionar lançamento de comparação…</option>
            {opcoesDaComparacao(funis ?? [], funnelId, f.comparacoes).map((x) => (
              <option key={x.id} value={x.id}>
                {x.rotulo}
              </option>
            ))}
          </select>
        )}
      </section>

      {/* Etapas e papéis */}
      <section className="space-y-2">
        <p className="font-medium">Etapas do lançamento</p>
        {etapasDoFunil.map((e) => (
          <div key={e.id} className="grid grid-cols-2 items-center gap-2 text-xs">
            <span>{e.name}</span>
            <select
              className={sel}
              value={f.papeis[e.id] ?? ""}
              onChange={(ev) => {
                const papeis = { ...f.papeis };
                if (ev.target.value) papeis[e.id] = ev.target.value as PapelDoDebriefing;
                else delete papeis[e.id];
                set({ papeis });
              }}
            >
              <option value="">não compõe o lançamento</option>
              {PAPEIS_DO_DEBRIEFING.map((p) => (
                <option key={p} value={p}>
                  {ROTULO_DO_PAPEL[p]}
                </option>
              ))}
            </select>
          </div>
        ))}
      </section>

      {/* Perguntas da pesquisa por etapa */}
      <section className="space-y-3">
        <p className="font-medium">Perguntas da pesquisa (por etapa com pesquisa)</p>
        {(cfg.perguntasDisponiveis ?? [])
          .filter((e) => f.papeis[e.stageId])
          .map((e) => (
            <div key={e.stageId} className="space-y-2 rounded-md border p-2">
              <p className="text-xs font-medium">{e.stageName}</p>
              {e.status === "falha" && <p className="text-[11px] text-red-500">{e.motivo ?? "falha ao ler a pesquisa"}</p>}
              {e.status === "sem-pesquisa" && <p className="text-[11px] text-muted-foreground">Etapa sem pesquisa conectada.</p>}
              {e.status === "ok" &&
                DIMENSOES_DA_PESQUISA.map((d) => {
                  const atual = f.perguntas[e.stageId] ?? {};
                  const valor = d in atual ? (atual[d] === null ? "__null" : (atual[d] ?? "")) : "";
                  return (
                    <div key={d} className="grid grid-cols-2 items-center gap-2 text-xs">
                      <span>
                        {ROTULO_DIMENSAO[d]}
                        {d === "faixa" ? " *" : ""}
                      </span>
                      <select
                        className={sel}
                        value={valor}
                        onChange={(ev) => {
                          const v = ev.target.value;
                          const prox = { ...atual };
                          if (v === "") delete prox[d];
                          else prox[d] = v === "__null" ? null : v;
                          set({ perguntas: { ...f.perguntas, [e.stageId]: prox } });
                        }}
                      >
                        <option value="">{d === "faixa" ? "— responda —" : "não confirmada"}</option>
                        {d === "faixa" && <option value="__null">esta pesquisa não tem faixa</option>}
                        {e.perguntas.map((q) => (
                          <option key={q.key} value={q.key}>
                            {q.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
            </div>
          ))}
      </section>

      {/* Pesquisa de captação (49.11 AC7, R6-7) */}
      <section className="space-y-2">
        <p className="font-medium">Pesquisa de captação (vence o desempate sem data)</p>
        {typeof apiContrato !== "number" || apiContrato < CONTRATO_DA_LISTA ? (
          <p className="text-[11px] text-muted-foreground">Disponível quando a API estiver no contrato {CONTRATO_DA_LISTA} ou mais novo.</p>
        ) : cfg.pesquisasPorEtapaFalha ? (
          <p className="text-[11px] text-red-500">{cfg.pesquisasPorEtapaFalha}</p>
        ) : (
          Object.entries(cfg.pesquisasPorEtapa ?? {})
            .filter(([sid, ps]) => f.papeis[sid] && ps.length >= 2)
            .map(([sid, ps]) => (
              <div key={sid} className="grid grid-cols-2 items-center gap-2 text-xs">
                <span>{etapasDoFunil.find((e) => e.id === sid)?.name ?? sid}</span>
                <select
                  className={sel}
                  value={f.pesquisaDeCaptacao[sid] ?? ""}
                  onChange={(ev) => {
                    const m = { ...f.pesquisaDeCaptacao };
                    if (ev.target.value) m[sid] = ev.target.value;
                    else delete m[sid];
                    set({ pesquisaDeCaptacao: m });
                  }}
                >
                  <option value="">sem marca (desempate pela posição + lacuna)</option>
                  {ps.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.rotulo}
                    </option>
                  ))}
                </select>
              </div>
            ))
        )}
      </section>

      {/* Closer e criativo */}
      <section className="space-y-3">
        <p className="font-medium">Closer, atendimento e criativo</p>
        <div className="space-y-1 text-xs">
          <Label className="text-xs">utm_medium que marcam venda de closer</Label>
          <div className="flex flex-wrap items-center gap-3">
            {(["lista", "nenhum"] as const).map((v) => (
              <label key={v} className="flex items-center gap-1">
                <input type="radio" name="closer" checked={f.closerMediums.resposta === v} onChange={() => set({ closerMediums: { ...f.closerMediums, resposta: v } })} />
                {v === "lista" ? "Estes:" : "Nenhum"}
              </label>
            ))}
            {f.closerMediums.resposta === "lista" && (
              <Input className="h-8 w-60" placeholder="x1, comercial" value={f.closerMediums.texto} onChange={(e) => set({ closerMediums: { resposta: "lista", texto: e.target.value } })} />
            )}
          </div>
        </div>
        <div className="space-y-1 text-xs">
          <Label className="text-xs">Vendedor (seller_name) preenchido marca closer?</Label>
          <div className="flex gap-3">
            {[true, false].map((v) => (
              <label key={String(v)} className="flex items-center gap-1">
                <input type="radio" name="seller" checked={f.closerPorSellerName === v} onChange={() => set({ closerPorSellerName: v })} />
                {v ? "Sim" : "Não"}
              </label>
            ))}
          </div>
        </div>
        <div className="space-y-1 text-xs">
          <Label className="text-xs">Ferramentas de atendimento (utm_source)</Label>
          <div className="flex flex-wrap items-center gap-3">
            {(["lista", "nenhuma"] as const).map((v) => (
              <label key={v} className="flex items-center gap-1">
                <input type="radio" name="ferr" checked={f.ferramentas.resposta === v} onChange={() => set({ ferramentas: { ...f.ferramentas, resposta: v } })} />
                {v === "lista" ? "Estas:" : "Nenhuma"}
              </label>
            ))}
            {f.ferramentas.resposta === "lista" && (
              <Input className="h-8 w-60" placeholder="letalk, chatwoot" value={f.ferramentas.texto} onChange={(e) => set({ ferramentas: { resposta: "lista", texto: e.target.value } })} />
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 items-center gap-2 text-xs">
          <Label className="text-xs">Dimensão de criativo</Label>
          <select className={sel} value={f.dimensaoDeCriativo ?? ""} onChange={(e) => set({ dimensaoDeCriativo: (e.target.value || null) as FormDaConfig["dimensaoDeCriativo"] })}>
            <option value="">— responda —</option>
            {DIMENSOES_DO_CRIATIVO.map((d) => (
              <option key={d} value={d}>
                {d === "ia-humano" ? "IA × Humano" : d === "video-estatico" ? "Vídeo × Estático" : "Nenhuma"}
              </option>
            ))}
          </select>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Imposto da mídia: {(cfg.imposto.valor * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% (procedência: {cfg.imposto.origem}).
        </p>
      </section>

      {falta.length > 0 && (
        <div className="rounded-md border border-red-500/30 bg-red-500/5 p-2 text-[11px] text-red-600">
          <p className="font-medium">Falta responder para salvar (o gerador não presume nenhuma premissa):</p>
          <ul className="list-disc pl-4">
            {falta.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
      )}
      {erroSalvar && (
        <div className="rounded-md border border-red-500/30 bg-red-500/5 p-2 text-[11px] text-red-600">
          <p className="font-medium">A API recusou a config:</p>
          <ul className="list-disc pl-4">
            {erroSalvar.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
      )}
      <Button onClick={handleSalvar} disabled={falta.length > 0 || salvar.isPending}>
        {salvar.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
        Salvar configuração
      </Button>
    </div>
  );
}
