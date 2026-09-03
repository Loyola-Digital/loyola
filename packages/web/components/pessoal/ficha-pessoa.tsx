"use client";

/**
 * Dados pessoais da ficha.
 *
 * Admin edita; a própria pessoa lê. É o mesmo componente nos dois casos porque
 * a diferença é só `editavel` — duplicar a tela em "form" e "leitura" faria os
 * dois lados divergirem no primeiro campo novo.
 */

import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { prepararFoto } from "@/lib/utils/foto-pessoa";
import { useSalvarFicha, type EntradaDaFicha, type Ficha } from "@/lib/hooks/use-pessoal";

/** "2026-08-26" → "26/08/2026", sem passar por Date (que desloca fuso). */
export function dataBr(iso: string | null): string {
  if (!iso) return "—";
  const [a, m, d] = iso.split("-");
  return a && m && d ? `${d}/${m}/${a}` : iso;
}

/** Tempo de casa em anos e meses. */
export function tempoDeCasa(entrada: string | null): string {
  if (!entrada) return "—";
  const d = new Date(`${entrada}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "—";
  const hoje = new Date();
  let meses =
    (hoje.getUTCFullYear() - d.getUTCFullYear()) * 12 + (hoje.getUTCMonth() - d.getUTCMonth());
  if (hoje.getUTCDate() < d.getUTCDate()) meses -= 1;
  if (meses < 0) return "a começar";
  const anos = Math.floor(meses / 12);
  const resto = meses % 12;
  if (anos === 0) return `${resto} ${resto === 1 ? "mês" : "meses"}`;
  if (resto === 0) return `${anos} ${anos === 1 ? "ano" : "anos"}`;
  return `${anos}a ${resto}m`;
}

function Campo({
  rotulo,
  valor,
  onChange,
  editavel,
  tipo = "text",
  dica,
}: {
  rotulo: string;
  valor: string;
  onChange: (v: string) => void;
  editavel: boolean;
  tipo?: string;
  dica?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-muted-foreground">{rotulo}</Label>
      {editavel ? (
        <Input
          type={tipo}
          value={valor}
          placeholder={dica}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 text-sm"
        />
      ) : (
        <p className="text-sm">
          {tipo === "date" ? dataBr(valor || null) : valor || <span className="text-muted-foreground">—</span>}
        </p>
      )}
    </div>
  );
}

export function FichaPessoa({
  ficha,
  editavel,
  camposDeRh = true,
}: {
  ficha: Ficha;
  editavel: boolean;
  /**
   * Se os campos que só o RH mexe entram na edição.
   *
   * `false` quando é a pessoa editando a própria ficha. A data de entrada
   * alimenta o cálculo de saldo de férias — editável por quem a usa, vira
   * formulário de auto-aprovação. O servidor descarta esses campos de qualquer
   * forma; aqui é para não OFERECER um controle que não vai valer.
   */
  camposDeRh?: boolean;
}) {
  const salvar = useSalvarFicha(ficha.userId);
  const arquivoRef = useRef<HTMLInputElement>(null);
  const [processandoFoto, setProcessandoFoto] = useState(false);

  const [form, setForm] = useState<Record<string, string>>({});
  const [foto, setFoto] = useState<string | null>(ficha.foto);
  const [sujo, setSujo] = useState(false);

  // Recarrega quando troca de pessoa (o admin navega entre fichas sem
  // desmontar a tela) — sem isto o formulário mostraria os dados de quem
  // estava aberto antes.
  useEffect(() => {
    setForm({
      nomeCompleto: ficha.nomeCompleto ?? "",
      cargo: ficha.cargo ?? "",
      nascimento: ficha.nascimento ?? "",
      entradaEm: ficha.entradaEm ?? "",
      telefone: ficha.telefone ?? "",
      emailContato: ficha.emailContato ?? "",
      emergenciaNome: ficha.emergenciaNome ?? "",
      emergenciaTelefone: ficha.emergenciaTelefone ?? "",
      emergenciaParentesco: ficha.emergenciaParentesco ?? "",
      observacoes: ficha.observacoes ?? "",
    });
    setFoto(ficha.foto);
    setSujo(false);
  }, [ficha]);

  function mudar(campo: string, valor: string) {
    setForm((f) => ({ ...f, [campo]: valor }));
    setSujo(true);
  }

  async function escolherFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = "";
    if (!arquivo) return;
    setProcessandoFoto(true);
    try {
      const uri = await prepararFoto(arquivo);
      setFoto(uri);
      setSujo(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não consegui usar essa imagem");
    } finally {
      setProcessandoFoto(false);
    }
  }

  function gravar() {
    const dados: EntradaDaFicha = {
      nomeCompleto: form.nomeCompleto || null,
      cargo: form.cargo || null,
      nascimento: form.nascimento || null,
      telefone: form.telefone || null,
      emailContato: form.emailContato || null,
      emergenciaNome: form.emergenciaNome || null,
      emergenciaTelefone: form.emergenciaTelefone || null,
      emergenciaParentesco: form.emergenciaParentesco || null,
    };
    // Campos de RH só vão quando quem edita pode mudá-los. Mandá-los sempre
    // funcionaria — o servidor descarta —, mas uma requisição que carrega o
    // que vai ser jogado fora esconde a regra de quem lê o código depois.
    if (camposDeRh) {
      dados.entradaEm = form.entradaEm || null;
      dados.observacoes = form.observacoes || null;
    }
    // Só manda a foto se mudou: são dezenas de KB, e reenviar a cada gravação
    // de um telefone seria desperdício.
    if (foto !== ficha.foto) dados.foto = foto;
    salvar.mutate(dados, {
      onSuccess: () => {
        toast.success("Ficha salva");
        setSujo(false);
      },
      onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar"),
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start gap-4">
        <div className="relative">
          {foto ? (
            /* <img> puro: a origem é data: URI, não há o que o otimizador faça. */
            <img
              src={foto}
              alt={ficha.nome}
              className="h-20 w-20 rounded-full object-cover ring-2 ring-border"
            />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted text-2xl font-semibold text-muted-foreground">
              {ficha.nome.charAt(0).toUpperCase()}
            </div>
          )}
          {editavel && (
            <>
              <button
                type="button"
                onClick={() => arquivoRef.current?.click()}
                disabled={processandoFoto}
                className="absolute -bottom-1 -right-1 rounded-full border border-border bg-background p-1.5 shadow-sm transition-colors hover:bg-muted"
                aria-label="Trocar foto"
              >
                {processandoFoto ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Camera className="h-3.5 w-3.5" />
                )}
              </button>
              <input
                ref={arquivoRef}
                type="file"
                accept="image/*"
                onChange={escolherFoto}
                className="hidden"
              />
            </>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-lg font-semibold">{ficha.nomeCompleto || ficha.nome}</p>
          <p className="text-sm text-muted-foreground">
            {ficha.cargo || "Cargo não informado"} · {ficha.email}
          </p>
          {ficha.entradaEm && (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Na casa desde {dataBr(ficha.entradaEm)} · {tempoDeCasa(ficha.entradaEm)}
            </p>
          )}
          {ficha.fotoDoPdi && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Foto aproveitada do PDI — envie uma pela câmera para substituir.
            </p>
          )}
        </div>

        {editavel && (
          <Button size="sm" className="gap-1.5" disabled={!sujo || salvar.isPending} onClick={gravar}>
            {salvar.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            Salvar
          </Button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Nome completo" valor={form.nomeCompleto ?? ""} onChange={(v) => mudar("nomeCompleto", v)} editavel={editavel} dica={ficha.nome} />
        <Campo rotulo="Cargo" valor={form.cargo ?? ""} onChange={(v) => mudar("cargo", v)} editavel={editavel} />
        <Campo rotulo="Data de nascimento" valor={form.nascimento ?? ""} onChange={(v) => mudar("nascimento", v)} editavel={editavel} tipo="date" />
        <Campo rotulo="Data de entrada" valor={form.entradaEm ?? ""} onChange={(v) => mudar("entradaEm", v)} editavel={editavel && camposDeRh} tipo="date" />
        <Campo rotulo="Telefone" valor={form.telefone ?? ""} onChange={(v) => mudar("telefone", v)} editavel={editavel} dica="(11) 90000-0000" />
        <Campo rotulo="E-mail de contato" valor={form.emailContato ?? ""} onChange={(v) => mudar("emailContato", v)} editavel={editavel} dica={ficha.email} />
      </div>

      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Contato de emergência
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Campo rotulo="Nome" valor={form.emergenciaNome ?? ""} onChange={(v) => mudar("emergenciaNome", v)} editavel={editavel} />
          <Campo rotulo="Telefone" valor={form.emergenciaTelefone ?? ""} onChange={(v) => mudar("emergenciaTelefone", v)} editavel={editavel} />
          <Campo rotulo="Parentesco" valor={form.emergenciaParentesco ?? ""} onChange={(v) => mudar("emergenciaParentesco", v)} editavel={editavel} dica="Mãe, cônjuge…" />
        </div>
      </div>

      {/* Observações só existem para admin: o servidor nem manda o campo para
          a própria pessoa. */}
      {editavel && "observacoes" in ficha && (
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">
            Observações da liderança · não aparecem para a pessoa
          </Label>
          <Textarea
            value={form.observacoes ?? ""}
            onChange={(e) => mudar("observacoes", e.target.value)}
            rows={3}
            className="text-sm"
          />
        </div>
      )}
    </div>
  );
}
