/**
 * Story 29.83 — o seletor de campanhas agrupa por conta de anúncios quando o
 * expert tem 2+ contas. O mesmo nome de campanha existe nas duas contas do
 * Danilo Gato (`dg_a02_..._hot_abo_videos_lpa`); sem o grupo, não se distingue.
 *
 * Regras:
 *  - Com 0 ou 1 conta, um grupo só e SEM título — o seletor fica como era.
 *  - A ordem dos grupos é a de `accounts` (a API já ordena por nome da conta).
 *  - A conta que falhou vira um grupo com `erro` e sem campanhas: o aviso
 *    aparece no lugar das campanhas dela, não some (AC3).
 *  - Conta sem nenhuma campanha (após a busca) e sem erro não gera grupo.
 *  - API anterior ao contrato v52 (campanhas sem `accountId`): um grupo só,
 *    sem título.
 */

export interface CampanhaComConta {
  id: string;
  name: string;
  objective: string;
  accountId?: string;
  accountName?: string;
}

export interface ContaDoSeletor {
  id: string;
  accountName: string;
  metaAccountId: string;
}

export interface FalhaDeContaDoSeletor {
  accountId: string;
  accountName: string;
  metaAccountId: string;
  error: string;
}

export interface GrupoDeCampanhas<C> {
  chave: string;
  /** `null` = sem título (uma conta só). */
  titulo: string | null;
  campanhas: C[];
  erro: string | null;
}

export function agruparCampanhasPorConta<C extends CampanhaComConta>(
  campanhas: C[],
  contas: ContaDoSeletor[],
  falhas: FalhaDeContaDoSeletor[],
): GrupoDeCampanhas<C>[] {
  const multiConta = contas.length >= 2 && campanhas.every((c) => c.accountId);
  if (!multiConta) {
    const unico: GrupoDeCampanhas<C>[] =
      campanhas.length > 0 ? [{ chave: "todas", titulo: null, campanhas, erro: null }] : [];
    // Com uma conta só, se ela falhou a API devolve 502 — não chega aqui. Mas
    // se vier falha, ela aparece (nunca some).
    return [
      ...unico,
      ...falhas.map((f) => ({
        chave: f.accountId,
        titulo: f.accountName,
        campanhas: [] as C[],
        erro: f.error,
      })),
    ];
  }

  const erroPorConta = new Map(falhas.map((f) => [f.accountId, f.error]));
  const grupos: GrupoDeCampanhas<C>[] = [];
  for (const conta of contas) {
    const daConta = campanhas.filter((c) => c.accountId === conta.id);
    const erro = erroPorConta.get(conta.id) ?? null;
    if (daConta.length === 0 && !erro) continue;
    grupos.push({ chave: conta.id, titulo: conta.accountName, campanhas: daConta, erro });
  }
  return grupos;
}

/** Busca do seletor: nome, objetivo ou nome da conta. */
export function campanhaCasaComBusca(c: CampanhaComConta, busca: string): boolean {
  if (!busca) return true;
  const q = busca.toLowerCase();
  return (
    c.name.toLowerCase().includes(q) ||
    c.objective.toLowerCase().includes(q) ||
    (c.accountName?.toLowerCase().includes(q) ?? false)
  );
}
