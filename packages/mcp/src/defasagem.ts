/**
 * A checagem de defasagem que o MCP não tinha.
 *
 * O bundle que roda no gateway não é atualizado pelo merge na `main`: alguém
 * precisa entrar lá, dar `git pull`, rodar o build e reiniciar o processo. Quando
 * isso não acontece, o servidor não quebra — ele serve MENOS tools, calado. Foi
 * assim que cinco tools de julho só apareceram para o Inácio em agosto.
 *
 * O aviso é entregue como TOOL, e não como log em stderr, porque o log do
 * gateway ninguém lê — e porque quem descobriu o problema das duas vezes foi
 * quem olhou o roster de tools. É lá que a falha precisa estar visível.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "./config.js";

/** O manifesto é acessório: um gateway sem rede não pode deixar de subir por isso. */
const TIMEOUT_MS = 4000;

export interface Manifesto {
  contract: number;
  tools: string[];
  total: number;
  builtAt: string | null;
}

export async function buscarManifesto(config: Config): Promise<Manifesto | null> {
  try {
    const res = await fetch(`${config.baseUrl}/api/public/v1/mcp-manifest`, {
      headers: { "X-API-Key": config.apiKey },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    // 404 é o caso do gateway MUITO velho: a API já tem a rota, mas se algum dia
    // ela sair, a ausência não pode virar erro de inicialização.
    if (!res.ok) return null;
    const d = (await res.json()) as Partial<Manifesto>;
    if (!Array.isArray(d.tools)) return null;
    return {
      contract: typeof d.contract === "number" ? d.contract : 0,
      tools: d.tools.filter((t): t is string => typeof t === "string"),
      total: typeof d.total === "number" ? d.total : d.tools.length,
      builtAt: typeof d.builtAt === "string" ? d.builtAt : null,
    };
  } catch {
    return null;
  }
}

function diasEntre(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return null;
  return Math.round(Math.abs(tb - ta) / 86_400_000);
}

export interface Diagnostico {
  atrasado: boolean;
  faltando: string[];
  /** Tool que este bundle serve e a main não conhece — bundle à frente, ou removida. */
  sobrando: string[];
  diasDeAtraso: number | null;
  mensagem: string;
}

export function compararComManifesto(
  registradas: string[],
  manifesto: Manifesto,
  bundleBuiltAt: string | null,
): Diagnostico {
  const tenho = new Set(registradas);
  const faltando = manifesto.tools.filter((t) => !tenho.has(t));
  const esperadas = new Set(manifesto.tools);
  const sobrando = registradas.filter((t) => !esperadas.has(t));
  const dias = diasEntre(bundleBuiltAt, manifesto.builtAt);

  const linhas = [
    `Este gateway serve ${registradas.length} tools; a main tem ${manifesto.total}.`,
  ];
  if (faltando.length > 0) {
    linhas.push(`FALTAM ${faltando.length}: ${faltando.join(", ")}.`);
  }
  if (sobrando.length > 0) {
    linhas.push(`Só aqui (removidas da main?): ${sobrando.join(", ")}.`);
  }
  if (dias !== null && dias > 0) {
    linhas.push(`O bundle é ~${dias} dia(s) mais antigo que a API.`);
  }
  linhas.push(
    "Para corrigir, NO GATEWAY: git pull origin main && pnpm --filter @loyola-x/mcp build && reinicie o processo do MCP.",
  );
  linhas.push(
    "O build não sobe sozinho no merge — packages/mcp/dist é gitignored e o pipeline da main não toca no gateway.",
  );

  return {
    atrasado: faltando.length > 0,
    faltando,
    sobrando,
    diasDeAtraso: dias,
    mensagem: linhas.join(" "),
  };
}

/**
 * Coloca o aviso no roster.
 *
 * O nome começa com `AVISO_` para ordenar junto e ser lido antes das demais. A
 * tool responde a mesma coisa que a descrição diz — quem estiver lendo o roster
 * já vê o problema sem precisar chamá-la, e quem chamar recebe o passo a passo.
 */
export function registrarAvisoDeDefasagem(server: McpServer, d: Diagnostico): void {
  server.registerTool(
    "AVISO_bundle_do_mcp_desatualizado",
    {
      title: "⚠️ Este gateway está atrás da main",
      description: `${d.mensagem} Enquanto isso, as tools que faltam simplesmente não existem aqui — não adianta tentar chamá-las.`,
      inputSchema: {},
    },
    async () => ({
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              atrasado: d.atrasado,
              faltando: d.faltando,
              sobrando: d.sobrando,
              diasDeAtraso: d.diasDeAtraso,
              comoCorrigir: [
                "cd <repo no gateway>",
                "git pull origin main",
                "pnpm --filter @loyola-x/mcp build",
                "reiniciar o processo do MCP",
              ],
            },
            null,
            2,
          ),
        },
      ],
    }),
  );
}

/**
 * Os nomes que ESTE bundle registrou.
 *
 * Precisa vir do registro real, não de uma lista escrita à mão: uma lista à mão
 * diria "tenho as 18" mesmo num bundle de julho, que é exatamente o erro que
 * esta checagem existe para pegar.
 *
 * O SDK não expõe as tools registradas por uma API pública, então envolvemos
 * `registerTool` para anotar cada nome de passagem. O cast é localizado e não
 * muda comportamento nenhum: a chamada original é repassada intacta.
 */
export function coletarNomesRegistrados(
  server: McpServer,
  registrar: (server: McpServer) => void,
): string[] {
  const nomes: string[] = [];
  const original = server.registerTool.bind(server);
  const espiao = (nome: string, ...resto: unknown[]) => {
    nomes.push(nome);
    return (original as unknown as (...a: unknown[]) => unknown)(nome, ...resto);
  };
  const alvo = server as unknown as { registerTool: unknown };
  alvo.registerTool = espiao;
  try {
    registrar(server);
  } finally {
    // Devolve o método: o aviso de defasagem é registrado depois, e deve passar
    // pelo caminho normal do SDK.
    alvo.registerTool = original;
  }
  return nomes;
}
