"use client";

/**
 * Story 47.3 — "Validar um nome existente" (spec § 8): cola um nome criado
 * fora do sistema, vê os nove campos separados (coloridos por bloco) e os
 * erros. O servidor lê o snapshot COM inativos — nome antigo continua legível,
 * e vem com aviso.
 */

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { erroDaApi, useValidarNome } from "@/lib/hooks/use-nomenclatura";
import { CLASSE_DO_BLOCO } from "@/lib/utils/nomenclatura-gerador";
import { CAMPO, ORDEM_DOS_CAMPOS, type ParseResult } from "@loyola-x/shared/src/nomenclatura-de-campanha";

/** Story 47.5: a API acrescenta `legado` quando o nome antigo já foi classificado. */
type Resultado = ParseResult & { legado?: { campanhaId: string; name: string } };

export function ValidadorDeNome() {
  const [texto, setTexto] = useState("");
  const [resultados, setResultados] = useState<{ nome: string; r: Resultado | null; erro?: string }[]>([]);
  const validar = useValidarNome();

  async function rodar() {
    // Um nome por vez é o obrigatório (spec § 8); várias linhas, um resultado por linha, é a leitura natural da textarea.
    const nomes = texto.split("\n").map((l) => l.trim()).filter(Boolean);
    const out: typeof resultados = [];
    for (const nome of nomes) {
      try {
        out.push({ nome, r: await validar.mutateAsync(nome) });
      } catch (e) {
        out.push({ nome, r: null, erro: erroDaApi(e).mensagem });
      }
    }
    setResultados(out);
  }

  return (
    <div className="space-y-3">
      <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={4} placeholder={"bbe_churrasco_a01_of01_2026_hot_cbo_videos_lpa\n(um nome por linha)"} className="font-mono" />
      <Button type="button" onClick={() => void rodar()} disabled={!texto.trim() || validar.isPending}>
        {validar.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Validar
      </Button>
      <div className="space-y-3">
        {resultados.map(({ nome, r, erro }, i) => (
          <div key={`${nome}-${i}`} className="rounded-md border p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <code className="font-mono">{nome}</code>
              <span className={`text-xs font-semibold ${r?.valid ? "text-success" : "text-destructive"}`}>{r ? (r.valid ? "válido" : "inválido") : "erro"}</span>
            </div>
            {r && r.partes.length === 9 + (r.fields?.suffix ? 1 : 0) ? (
              <div className="mt-2 flex flex-wrap gap-1 font-mono text-xs">
                {r.partes.map((p, j) => {
                  const campo = ORDEM_DOS_CAMPOS[j];
                  const bloco = campo ? CAMPO[campo].bloco : "sufixo";
                  return (
                    <span key={j} className="rounded border px-1.5 py-0.5" title={campo ? `${CAMPO[campo].posicao} — ${CAMPO[campo].rotulo}` : "sufixo"}>
                      <span className="text-muted-foreground">{campo ? CAMPO[campo].posicao : "+"} </span>
                      <span className={CLASSE_DO_BLOCO[bloco]}>{p}</span>
                    </span>
                  );
                })}
              </div>
            ) : r ? (
              <p className="mt-1 font-mono text-xs text-muted-foreground">{r.partes.join(" · ")}</p>
            ) : null}
            {r?.legado ? (
              <p className="mt-2 rounded-md border px-2 py-1 text-xs">
                Legado classificado como <code className="font-mono">{r.legado.name}</code> — o nome no Meta continua este; o cruzamento usa o novo.
              </p>
            ) : null}
            {r?.errors.length && !r.legado ? <ul className="mt-2 list-disc pl-5 text-destructive">{r.errors.map((e) => <li key={e}>{e}</li>)}</ul> : null}
            {r?.avisos.length ? <ul className="mt-2 list-disc pl-5 text-warning">{r.avisos.map((a) => <li key={a}>{a}</li>)}</ul> : null}
            {erro ? <p className="mt-1 text-destructive">{erro}</p> : null}
          </div>
        ))}
      </div>
    </div>
  );
}
