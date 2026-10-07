"use client";

/**
 * Devolver ao Meta a faixa de cada lead — configurável por etapa.
 *
 * ## Por que isto muda o resultado da campanha
 *
 * O Meta otimiza para "lead", e lead é qualquer formulário preenchido — então
 * ele persegue o mais barato, que costuma ser o pior. Mandando de volta um
 * evento só para a faixa que importa, o algoritmo passa a perseguir ESSE: a
 * conta de mídia aprende o que a pesquisa descobriu.
 *
 * ## Por que começa desligado, e com simulação
 *
 * O que se manda ao Meta ensina o algoritmo, e ensinar errado custa caro e
 * demora a desfazer. Então: nasce desligado, tem "Simular" (conta o que sairia
 * sem mandar nada) e aceita o código de teste do Gerenciador, que faz o evento
 * aparecer em "Test Events" sem entrar na otimização.
 */

import { useEffect, useState } from "react";
import { Loader2, Send, Target, TestTube2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  useEnviarAoMeta,
  useEnvioAoMeta,
  useLeadsJaEnviados,
  useSalvarEnvioAoMeta,
  type ResumoDoEnvio,
} from "@/lib/hooks/use-lead-capi";

function Resumo({ r }: { r: ResumoDoEnvio }) {
  return (
    <div className="rounded-md border bg-muted/30 p-3 text-xs">
      <p className="mb-1 font-medium">
        {r.simulado ? "Simulação — nada foi enviado" : `Enviados: ${r.enviados ?? 0}`}
        {!r.simulado && r.recebidos != null ? ` · o Meta confirmou ${r.recebidos}` : ""}
      </p>
      <ul className="space-y-0.5 text-muted-foreground">
        <li>
          {r.candidatos} lead(s) nas faixas {r.faixas.join(", ") || "—"}
        {r.eventos && r.eventos.length > 0 ? ` · eventos: ${r.eventos.join(", ")}` : ""}
        </li>
        <li>{r.aEnviar} a enviar · {r.jaEnviados} já tinham ido</li>
        {/* Contado e dito: lead sem e-mail nem telefone não tem como ser casado
            no Meta, e some do envio — mas não pode sumir do relatório. */}
        {r.semIdentificador > 0 && (
          <li className="text-amber-600 dark:text-amber-500">
            {r.semIdentificador} sem e-mail nem telefone — o Meta não casaria com ninguém
          </li>
        )}
        {r.teste && <li className="text-sky-600 dark:text-sky-400">Modo teste ligado</li>}
      </ul>
    </div>
  );
}

export function EnvioAoMeta({
  projectId,
  funnelId,
  stageId,
  faixasDoModelo,
}: {
  projectId: string;
  funnelId: string;
  stageId: string;
  /** As faixas que o modelo define — A, B, C, D. */
  faixasDoModelo: string[];
}) {
  const { data, isLoading } = useEnvioAoMeta(projectId, funnelId, stageId);
  const salvar = useSalvarEnvioAoMeta(projectId, funnelId, stageId);
  const enviar = useEnviarAoMeta(projectId, funnelId, stageId);
  const jaEnviados = useLeadsJaEnviados(projectId, funnelId, stageId);

  const [datasetId, setDatasetId] = useState("");
  const [contaId, setContaId] = useState("");
  const [eventName, setEventName] = useState("LeadQualificado");
  const [eventosPorFaixa, setEventosPorFaixa] = useState<Record<string, string>>({});
  const [faixas, setFaixas] = useState<string[]>([]);
  const [testCode, setTestCode] = useState("");
  const [ativo, setAtivo] = useState(false);
  const [resumo, setResumo] = useState<ResumoDoEnvio | null>(null);

  useEffect(() => {
    const c = data?.config;
    if (!c) return;
    setDatasetId(c.datasetId);
    setContaId(c.metaAccountId ?? "");
    setEventName(c.eventName);
    setEventosPorFaixa(c.eventosPorFaixa ?? {});
    setFaixas(c.bands);
    setTestCode(c.testEventCode ?? "");
    setAtivo(c.ativo);
  }, [data?.config]);

  function alternarFaixa(f: string) {
    setFaixas((atuais) => (atuais.includes(f) ? atuais.filter((x) => x !== f) : [...atuais, f]));
  }

  function guardar() {
    salvar.mutate(
      {
        datasetId: datasetId.trim(),
        metaAccountId: contaId || null,
        eventName: eventName.trim() || "LeadQualificado",
        eventosPorFaixa,
        bands: faixas,
        testEventCode: testCode.trim() || null,
        ativo,
      },
      {
        onSuccess: () => toast.success("Configuração salva"),
        onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar"),
      },
    );
  }

  function disparar(simular: boolean) {
    setResumo(null);
    enviar.mutate(simular, {
      onSuccess: (r) => {
        setResumo(r);
        toast.success(simular ? "Simulação pronta" : `${r.enviados ?? 0} lead(s) enviados ao Meta`);
      },
      onError: (e) => toast.error(e instanceof Error ? e.message : "Erro no envio"),
    });
  }

  if (isLoading) return null;

  const faixasDisponiveis = faixasDoModelo.length > 0 ? faixasDoModelo : ["A", "B", "C", "D"];

  return (
    <section className="space-y-4 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Target className="h-4 w-4 text-primary" />
          Devolver a faixa para o Meta
        </h3>
        <div className="flex items-center gap-2">
          <Label htmlFor="capi-ativo" className="text-xs text-muted-foreground">
            {ativo ? "Ligado" : "Desligado"}
          </Label>
          <Switch id="capi-ativo" checked={ativo} onCheckedChange={setAtivo} />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        O Meta otimiza para “lead”, e lead é qualquer formulário preenchido — então ele
        persegue o mais barato, que costuma ser o pior. Mandando de volta um evento só para
        as faixas escolhidas, o algoritmo passa a perseguir essas.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="capi-dataset">Dataset (pixel)</Label>
          <Input
            id="capi-dataset"
            value={datasetId}
            onChange={(e) => setDatasetId(e.target.value)}
            placeholder="1234567890"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="capi-conta">Conta de anúncio (de onde sai o token)</Label>
          <select
            id="capi-conta"
            value={contaId}
            onChange={(e) => setContaId(e.target.value)}
            className="h-9 w-full rounded-md border bg-background px-2 text-sm"
          >
            <option value="">Escolha…</option>
            {data?.contas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="capi-evento">Nome do evento</Label>
          <Input
            id="capi-evento"
            value={eventName}
            onChange={(e) => setEventName(e.target.value)}
            placeholder="LeadQualificado"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="capi-teste" className="flex items-center gap-1.5">
            <TestTube2 className="h-3.5 w-3.5" />
            Código de teste (opcional)
          </Label>
          <Input
            id="capi-teste"
            value={testCode}
            onChange={(e) => setTestCode(e.target.value)}
            placeholder="TEST12345"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Faixas que viram evento</Label>
        <p className="text-[11px] text-muted-foreground">
          Cada faixa vira um evento <strong>separado</strong> no Meta — é o que permite uma
          campanha otimizar para lead A e outra para lead B. Com um evento só, as duas
          aprenderiam a mesma coisa.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {faixasDisponiveis.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => alternarFaixa(f)}
              className={`rounded-md border px-3 py-1 text-xs font-medium transition ${
                faixas.includes(f)
                  ? "border-primary bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent"
              }`}
            >
              Faixa {f}
            </button>
          ))}
        </div>
        {faixas.length === 0 && (
          <p className="text-[11px] text-muted-foreground">
            Nenhuma faixa escolhida — nada será enviado.
          </p>
        )}

        {faixas.length > 0 && (
          <div className="mt-2 space-y-1.5 rounded-md border p-2">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Nome do evento de cada faixa
            </p>
            {[...faixas].sort().map((f) => (
              <div key={f} className="flex items-center gap-2">
                <span className="w-16 shrink-0 text-xs">Faixa {f}</span>
                <Input
                  value={eventosPorFaixa[f] ?? ""}
                  onChange={(e) =>
                    setEventosPorFaixa((atuais) => ({ ...atuais, [f]: e.target.value }))
                  }
                  // O padrão aparece como placeholder: quem não quiser escolher
                  // nome nenhum não precisa, e vê exatamente o que vai sair.
                  placeholder={`${eventName.trim() || "LeadQualificado"}${f}`}
                  className="h-8 text-xs"
                />
              </div>
            ))}
            <p className="text-[11px] text-muted-foreground">
              Deixe em branco para usar o nome sugerido. É este nome que você escolhe como
              evento de otimização no Gerenciador do Meta.
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={guardar} disabled={salvar.isPending || !datasetId.trim()}>
          {salvar.isPending ? "Salvando…" : "Salvar"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => disparar(true)}
          disabled={enviar.isPending || !data?.config}
        >
          {enviar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Simular"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          onClick={() => disparar(false)}
          disabled={enviar.isPending || !data?.config?.ativo}
          title={data?.config?.ativo ? undefined : "Ligue o envio para mandar de verdade"}
        >
          <Send className="h-3.5 w-3.5" />
          Enviar agora
        </Button>
        {jaEnviados.data && jaEnviados.data.total > 0 && (
          <span className="text-xs text-muted-foreground">
            já foram {jaEnviados.data.total}:{" "}
            {jaEnviados.data.porFaixa.map((f) => `${f.total} na ${f.faixa}`).join(" · ")}
          </span>
        )}
      </div>

      {resumo && <Resumo r={resumo} />}
      {!resumo && data?.config?.ultimoResultado && (
        <div className="space-y-1">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Último envio</p>
          <Resumo r={data.config.ultimoResultado} />
        </div>
      )}
    </section>
  );
}
