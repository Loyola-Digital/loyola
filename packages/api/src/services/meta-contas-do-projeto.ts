/**
 * Story 29.83 — um expert (projeto) pode ter N contas de anúncios Meta
 * (`meta_ads_account_projects` é N:N). Até esta story, o seletor de campanhas
 * e parte dos leitores pegavam UMA conta com `.limit(1)` sem `orderBy`: as
 * campanhas das outras contas não apareciam para seleção e, quando lidas ao
 * vivo, saíam zeradas — perguntadas à conta errada, sem erro na tela.
 *
 * Duas formas de ler N contas, e a diferença entre elas é deliberada:
 *
 *  - `lerDeCadaConta` — para o SELETOR. A falha de uma conta não esconde as
 *    outras: devolve o que leu e a lista de falhas, para a tela avisar com o
 *    nome da conta (AC3). Uma lista de campanhas pela metade, com aviso, ainda
 *    serve para escolher.
 *  - `lerDeTodasAsContas` — para NÚMEROS. Qualquer falha derruba a leitura:
 *    um investimento somado sem uma das contas é um número errado com cara de
 *    certo. Melhor a tela mostrar erro do que um total pela metade.
 *
 * Módulo puro (sem banco, sem rede): quem chama injeta a leitura por conta.
 */

export interface ContaMeta {
  /** Só os dígitos — o `act_` é acrescentado por quem monta a URL da Graph API. */
  metaAccountId: string;
  accessToken: string;
}

export interface ContaMetaDoProjeto extends ContaMeta {
  /** `meta_ads_accounts.id` (UUID). */
  id: string;
  /** Nome cadastrado em Configurações › Tráfego. */
  accountName: string;
}

export interface LeituraPorConta<C, T> {
  porConta: Array<{ conta: C; itens: T[] }>;
  falhas: Array<{ conta: C; erro: string }>;
}

/** Nome legível de uma conta para mensagens de erro. */
export function rotuloDaConta(conta: ContaMeta & { accountName?: string }): string {
  return conta.accountName ? `${conta.accountName} (act_${conta.metaAccountId})` : `act_${conta.metaAccountId}`;
}

function mensagemDoErro(motivo: unknown): string {
  return motivo instanceof Error ? motivo.message : String(motivo);
}

/** Ordem estável: nome da conta e, no empate, o id. Nunca a ordem do banco. */
export function ordenarContas<C extends ContaMetaDoProjeto>(contas: C[]): C[] {
  return [...contas].sort(
    (a, b) => a.accountName.localeCompare(b.accountName, "pt-BR") || a.id.localeCompare(b.id),
  );
}

/** Lê cada conta em paralelo; a falha de uma não apaga as outras. */
export async function lerDeCadaConta<C extends ContaMeta, T>(
  contas: C[],
  ler: (conta: C) => Promise<T[]>,
): Promise<LeituraPorConta<C, T>> {
  const resultados = await Promise.allSettled(contas.map((conta) => ler(conta)));
  const leitura: LeituraPorConta<C, T> = { porConta: [], falhas: [] };
  resultados.forEach((r, i) => {
    const conta = contas[i];
    if (r.status === "fulfilled") leitura.porConta.push({ conta, itens: r.value });
    else leitura.falhas.push({ conta, erro: mensagemDoErro(r.reason) });
  });
  return leitura;
}

/**
 * Lê todas as contas e junta. Se QUALQUER conta falhar, lança — e a mensagem
 * nomeia as contas que falharam.
 */
export async function lerDeTodasAsContas<C extends ContaMeta & { accountName?: string }, T>(
  contas: C[],
  ler: (conta: C) => Promise<T[]>,
): Promise<T[]> {
  const { porConta, falhas } = await lerDeCadaConta(contas, ler);
  if (falhas.length > 0) {
    const detalhe = falhas.map((f) => `${rotuloDaConta(f.conta)}: ${f.erro}`).join("; ");
    throw new Error(`Falha ao ler a Meta em ${falhas.length} de ${contas.length} conta(s) — ${detalhe}`);
  }
  return porConta.flatMap((p) => p.itens);
}

// ============================================================
// Seletor de campanhas (GET /api/projects/:projectId/meta-campaigns)
// ============================================================

export interface CampanhaDoSeletor {
  id: string;
  name: string;
  status: string;
  objective: string;
  /** Conta de origem — campanhas com o mesmo nome existem em contas diferentes. */
  accountId: string;
  accountName: string;
  metaAccountId: string;
}

export interface RespostaDoSeletor {
  campaigns: CampanhaDoSeletor[];
  accountLinked: boolean;
  /** Todas as contas vinculadas, na ordem em que o seletor as agrupa. */
  accounts: Array<{ id: string; accountName: string; metaAccountId: string }>;
  /** Contas que falharam — o seletor mostra o aviso no lugar do grupo (AC3). */
  accountErrors: Array<{ accountId: string; accountName: string; metaAccountId: string; error: string }>;
}

export function montarRespostaDoSeletor(
  contas: ContaMetaDoProjeto[],
  leitura: LeituraPorConta<
    ContaMetaDoProjeto,
    { id: string; name: string; status: string; objective: string }
  >,
): RespostaDoSeletor {
  return {
    campaigns: leitura.porConta.flatMap(({ conta, itens }) =>
      itens.map((c) => ({
        id: c.id,
        name: c.name,
        status: c.status,
        objective: c.objective,
        accountId: conta.id,
        accountName: conta.accountName,
        metaAccountId: conta.metaAccountId,
      })),
    ),
    accountLinked: contas.length > 0,
    accounts: contas.map((c) => ({ id: c.id, accountName: c.accountName, metaAccountId: c.metaAccountId })),
    accountErrors: leitura.falhas.map(({ conta, erro }) => ({
      accountId: conta.id,
      accountName: conta.accountName,
      metaAccountId: conta.metaAccountId,
      error: erro,
    })),
  };
}
