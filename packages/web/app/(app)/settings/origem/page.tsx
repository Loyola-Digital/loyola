"use client";

/**
 * Match de origem — as regras que valem para todos os projetos.
 *
 * ## Por que é global, e não por etapa
 *
 * O caso que motivou: um link mal montado entrega `{whatsapp}` — a macro com
 * as chaves literais, sem substituição. Isso não é problema de um projeto nem
 * de uma etapa; é do formato do link, e acontece igual em qualquer campanha.
 * Cadastrar a mesma correção projeto a projeto seria trabalho repetido e
 * fatalmente desatualizado num deles.
 *
 * ## Nada aqui altera a planilha
 *
 * A regra é aplicada na LEITURA. O lead antigo passa a ter origem na hora, o
 * lead de amanhã com o mesmo padrão já entra classificado, e apagar a regra
 * devolve o dado exatamente ao que a planilha diz.
 *
 * ## O testador no lugar do diagnóstico
 *
 * A aba antiga vivia dentro da etapa de Vendas e mostrava "46 leads sem
 * origem" com a quebra por campo. Aqui não há etapa, então esse número não
 * existe. O que responde a mesma pergunta é colar `{whatsapp}` e ver no que
 * ele vira — antes de gravar, e sem depender de um recorte.
 */

import { useState } from "react";
import { Globe, Loader2, Plus, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useUserRole } from "@/lib/hooks/use-user-role";
import {
  montarOrigem,
  useCriarRegraGlobal,
  useRegrasGlobais,
  useRemoverRegraGlobal,
  useTestarRegraGlobal,
  type OperadorDeRegra,
} from "@/lib/hooks/use-source-match";

/** Os campos que costumam carregar a origem. Texto livre segue permitido. */
const CAMPOS_SUGERIDOS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];

const ROTULO_DO_OPERADOR: Record<OperadorDeRegra, string> = {
  igual: "é igual a",
  contem: "contém",
  comeca_com: "começa com",
  vazio: "está vazio",
};

export default function RegrasDeOrigemPage() {
  const role = useUserRole();
  const ehAdmin = role === "admin";

  const { data, isLoading } = useRegrasGlobais();
  const criar = useCriarRegraGlobal();
  const remover = useRemoverRegraGlobal();
  const testar = useTestarRegraGlobal();

  const [campo, setCampo] = useState("utm_source");
  const [operador, setOperador] = useState<OperadorDeRegra>("contem");
  const [valor, setValor] = useState("");
  const [tipo, setTipo] = useState<"pago" | "organico">("organico");
  const [canal, setCanal] = useState("");

  const [campoTeste, setCampoTeste] = useState("utm_source");
  const [valorTeste, setValorTeste] = useState("");
  const [resultado, setResultado] = useState<{ origem: string | null; casou: boolean } | null>(
    null,
  );

  const previa = canal.trim() ? montarOrigem(tipo, canal) : null;
  const podeCriar = ehAdmin && canal.trim() && (operador === "vazio" || valor.trim());

  async function gravar() {
    try {
      await criar.mutateAsync({
        campo: campo.trim(),
        operador,
        valor: operador === "vazio" ? "" : valor.trim(),
        origem: montarOrigem(tipo, canal),
      });
      setValor("");
      setCanal("");
      toast.success("Regra criada — vale para todos os projetos.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui criar");
    }
  }

  async function rodarTeste() {
    try {
      const r = await testar.mutateAsync({ campo: campoTeste.trim(), valor: valorTeste });
      setResultado(r);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui testar");
    }
  }

  const regras = data?.regras ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <Globe className="h-5 w-5" />
          Match de origem
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Traduz o que chega na planilha para uma origem legível — <code>{"{whatsapp}"}</code> vira{" "}
          <code>organic_whatsapp</code>. As regras valem para <strong>todos os projetos</strong> e
          são aplicadas na leitura: nada é escrito na planilha, e apagar a regra devolve o dado
          como estava.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Testar</CardTitle>
          <CardDescription>
            Cole um valor como ele chega e veja no que vira, antes de criar a regra.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Campo</Label>
              <Input
                value={campoTeste}
                onChange={(e) => setCampoTeste(e.target.value)}
                className="h-9 w-44"
              />
            </div>
            <div className="min-w-[200px] flex-1 space-y-1">
              <Label className="text-xs">Valor</Label>
              <Input
                value={valorTeste}
                onChange={(e) => setValorTeste(e.target.value)}
                placeholder="{whatsapp}"
                className="h-9"
              />
            </div>
            <Button onClick={rodarTeste} disabled={testar.isPending} size="sm" className="gap-1.5">
              {testar.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Wand2 className="h-3.5 w-3.5" />
              )}
              Testar
            </Button>
          </div>

          {resultado && (
            <p className="text-sm">
              {resultado.casou ? (
                <>
                  vira <Badge variant="secondary">{resultado.origem}</Badge>
                </>
              ) : (
                // "Nenhuma regra casou" e "sem origem" são coisas diferentes:
                // a segunda afirmaria um resultado que ninguém apurou.
                <span className="text-muted-foreground">
                  Nenhuma regra casou — o valor continua como veio.
                </span>
              )}
            </p>
          )}
        </CardContent>
      </Card>

      {ehAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Nova regra</CardTitle>
            <CardDescription>
              Quando o campo casar, a origem vira o que estiver aqui.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Campo</Label>
                <Input
                  value={campo}
                  onChange={(e) => setCampo(e.target.value)}
                  list="campos-sugeridos"
                  className="h-9 w-44"
                />
                <datalist id="campos-sugeridos">
                  {CAMPOS_SUGERIDOS.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Condição</Label>
                <select
                  value={operador}
                  onChange={(e) => setOperador(e.target.value as OperadorDeRegra)}
                  className="h-9 rounded-md border border-border bg-background px-2 text-sm"
                >
                  {(Object.keys(ROTULO_DO_OPERADOR) as OperadorDeRegra[]).map((o) => (
                    <option key={o} value={o}>
                      {ROTULO_DO_OPERADOR[o]}
                    </option>
                  ))}
                </select>
              </div>

              {operador !== "vazio" && (
                <div className="min-w-[160px] flex-1 space-y-1">
                  <Label className="text-xs">Valor</Label>
                  <Input
                    value={valor}
                    onChange={(e) => setValor(e.target.value)}
                    placeholder="whatsapp"
                    className="h-9"
                  />
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Tipo</Label>
                <select
                  value={tipo}
                  onChange={(e) => setTipo(e.target.value as "pago" | "organico")}
                  className="h-9 rounded-md border border-border bg-background px-2 text-sm"
                >
                  <option value="organico">Orgânico</option>
                  <option value="pago">Pago</option>
                </select>
              </div>

              <div className="min-w-[160px] flex-1 space-y-1">
                <Label className="text-xs">Canal</Label>
                <Input
                  value={canal}
                  onChange={(e) => setCanal(e.target.value)}
                  placeholder="whatsapp"
                  className="h-9"
                />
              </div>

              <Button onClick={gravar} disabled={!podeCriar || criar.isPending} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" />
                Criar
              </Button>
            </div>

            {previa && (
              // O prefixo é aplicado pelo servidor, não digitado: um erro de
              // digitação em `paid_`/`organic_` criaria uma categoria nova e
              // silenciosa. A prévia mostra o que vai ser gravado.
              <p className="text-[11px] text-muted-foreground">
                Vai gravar como <Badge variant="secondary">{previa}</Badge>
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Regras ativas {regras.length > 0 && `(${regras.length})`}
          </CardTitle>
          <CardDescription>Aplicadas na ordem em que aparecem — a primeira que casa vence.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : regras.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhuma regra ainda. A primeira costuma ser <code>utm_source</code> contém{" "}
              <code>whatsapp</code>.
            </p>
          ) : (
            <div className="space-y-1.5">
              {regras.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center gap-2 rounded-md border border-border/40 p-2 text-sm"
                >
                  <code className="text-xs">{r.campo}</code>
                  <span className="text-xs text-muted-foreground">
                    {ROTULO_DO_OPERADOR[r.operador]}
                  </span>
                  {r.operador !== "vazio" && <code className="text-xs">{r.valor}</code>}
                  <span className="text-muted-foreground">→</span>
                  <Badge variant="secondary">{r.origem}</Badge>

                  {ehAdmin && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto h-7 px-2 text-muted-foreground hover:text-destructive"
                      onClick={async () => {
                        await remover.mutateAsync(r.id);
                        toast.success("Regra removida.");
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
