/**
 * Story 29.79 (AC1) — funil e oferta lidos do NOME da campanha, e o contrato do
 * filtro de funil/oferta do perpétuo (rota nova + `foraDoFiltro`).
 *
 * ## Por que o nome da CAMPANHA, e nunca a `utm_term`
 *
 * A `utm_term` das vendas traz `{{placement}}_{{campaign.name}}|{{adset.name}}|
 * {{ad.name}}` no momento do clique. "Contém aN" nela acha `a04` no nome do
 * ANÚNCIO (`adv04--fz-a1--h04--a04`), fica presa ao nome de antes de uma
 * renomeação (o DG vendeu em `a01/of01` e hoje gasta em `a02/of03`) e às vezes
 * nem foi resolvida (`{{campaign.name}}`). A leitura é do nome ATUAL da
 * campanha, e a venda chega nela pelo ID (`utm_campaign`) — ver a story.
 *
 * ## As duas formas de funil que existem em produção
 *
 * | forma | exemplo | lida como |
 * |---|---|---|
 * | token delimitado por início/fim/`_`/`-` | `bbe_a01_…`, `bbe-a1-jul-26--…` | `a01` |
 * | colada ao expert, entre colchetes | `[FZA1][FB/IG]…`, `[DGA1]` | `a01` |
 *
 * `a1` ≡ `a01` (decisão 6.2) — a saída é sempre o formato do dicionário
 * (`FORMATO_DO_CODIGO.funil`, `^a\d{2}$`). A oferta só tem a forma delimitada
 * (`of01`); `ofmix` é o valor especial do gerador (`OFMIX`) e NÃO é código.
 *
 * ## Nunca chuta
 *
 * Nada casado → `null` com "sem código no nome". Dois códigos DISTINTOS da
 * mesma dimensão (depois de normalizar) → `null` com "mais de um código no
 * nome" (PO-08): escolher um seria inventar a atribuição.
 *
 * ⚠️ Não é `sugerirClassificacao` (`nomenclatura-legado.ts`): aquele parser só
 * casa `a` + UM dígito, exige o snapshot do dicionário e, por desenho, nunca lê
 * oferta. A fila de Legadas depende dele como está (PO-12) — por isso este é
 * outro módulo, e aquele fica intocado.
 *
 * ## Módulo folha, sem imports
 *
 * Mesmo desenho de `nomenclatura-legado.ts`: a API importa pelo índice (bare),
 * o web por subpath (`@loyola-x/shared/src/funil-e-oferta`). Os dois caminhos
 * não são intercambiáveis — ver a tabela em `index.ts`.
 */

// ── motivos de uma dimensão ausente (AC2) ──────────────────────────────

export const MOTIVO_SEM_CODIGO = "sem código no nome" as const;
export const MOTIVO_MAIS_DE_UM_CODIGO = "mais de um código no nome" as const;
export const MOTIVO_OFERTA_MISTA = "oferta mista (ofmix)" as const;
/**
 * A campanha está na etapa, mas o cache de nomes (`meta_entity_names_cache`)
 * não tem o nome de HOJE dela — não há o que ler. Dizer "sem código no nome"
 * seria afirmar que lemos um nome que nunca vimos.
 */
export const MOTIVO_NOME_NAO_SINCRONIZADO = "nome atual não sincronizado" as const;

export type MotivoSemDimensao =
  | typeof MOTIVO_SEM_CODIGO
  | typeof MOTIVO_MAIS_DE_UM_CODIGO
  | typeof MOTIVO_OFERTA_MISTA
  | typeof MOTIVO_NOME_NAO_SINCRONIZADO;

export interface LeituraDeDimensao {
  /** `aNN` / `ofNN`, ou `null` quando não há UM código a atribuir. */
  codigo: string | null;
  /** Por que `codigo` é `null`; `null` quando há código. */
  motivo: MotivoSemDimensao | null;
}

/** `ofmix` — duplicado de `OFMIX` (`nomenclatura-de-campanha.ts`) porque este módulo é folha. */
const OFMIX = "ofmix";

/** `a1`/`a01` delimitado. O delimitador de ANTES é consumido; o de depois, não (dois tokens seguidos casam). */
const FUNIL_DELIMITADO = /(?:^|[_-])a(\d{1,2})(?=$|[_-])/g;
/** `[FZA1]`: sigla do expert (2–4 letras, o formato de `naming_experts.code`) colada ao `A<N>`. */
const FUNIL_COLADO = /\[[a-z]{2,4}a(\d{1,2})\]/g;
const OFERTA_DELIMITADA = /(?:^|[_-])of(\d{1,2}|mix)(?=$|[_-])/g;

const doisDigitos = (n: string) => n.padStart(2, "0");

function reduzir(achados: Set<string>): LeituraDeDimensao {
  if (achados.size === 0) return { codigo: null, motivo: MOTIVO_SEM_CODIGO };
  if (achados.size > 1) return { codigo: null, motivo: MOTIVO_MAIS_DE_UM_CODIGO };
  const [unico] = achados;
  if (unico === OFMIX) return { codigo: null, motivo: MOTIVO_OFERTA_MISTA };
  return { codigo: unico, motivo: null };
}

/** O funil do nome da campanha (`a01`), sem distinção de caixa. */
export function lerFunilDoNome(nome: string | null | undefined): LeituraDeDimensao {
  const n = String(nome ?? "").toLowerCase();
  const achados = new Set<string>();
  for (const m of n.matchAll(FUNIL_DELIMITADO)) achados.add(`a${doisDigitos(m[1])}`);
  for (const m of n.matchAll(FUNIL_COLADO)) achados.add(`a${doisDigitos(m[1])}`);
  return reduzir(achados);
}

/** A oferta do nome da campanha (`of01`). `ofmix` volta `null` com o motivo "oferta mista". */
export function lerOfertaDoNome(nome: string | null | undefined): LeituraDeDimensao {
  const n = String(nome ?? "").toLowerCase();
  const achados = new Set<string>();
  for (const m of n.matchAll(OFERTA_DELIMITADA)) {
    achados.add(m[1] === "mix" ? OFMIX : `of${doisDigitos(m[1])}`);
  }
  return reduzir(achados);
}

export function lerFunilEOfertaDoNome(nome: string | null | undefined): {
  funil: LeituraDeDimensao;
  oferta: LeituraDeDimensao;
} {
  return { funil: lerFunilDoNome(nome), oferta: lerOfertaDoNome(nome) };
}

// ── o contrato da rota `GET …/funnels/:funnelId/perpetual/funil-oferta` (AC3) ──

/** De onde saiu a dimensão: o nome atual vence; o vínculo da Nomenclatura só preenche o que o nome não traz. */
export type OrigemDaDimensao = "nome" | "vinculo";

export interface CampanhaComFunilEOferta {
  campaignId: string;
  /** O nome de HOJE na Meta (cache de nomes); `null` quando não sincronizado. */
  nome: string | null;
  funil: string | null;
  oferta: string | null;
  origemFunil: OrigemDaDimensao | null;
  origemOferta: OrigemDaDimensao | null;
  motivoSemFunil?: MotivoSemDimensao;
  motivoSemOferta?: MotivoSemDimensao;
  /** Investimento na janela, com o imposto Meta (mesma régua do painel). 0 quando não gastou. */
  gasto: number;
}

export interface OpcaoDoDicionario {
  codigo: string;
  descricao: string;
  /** `false` = desativado no dicionário, mas aparece em campanha do funil (PO-09). */
  ativo: boolean;
}

export interface CodigoNaoCadastrado {
  dimensao: "funil" | "oferta";
  codigo: string;
  campanhas: { campaignId: string; nome: string | null }[];
}

export interface CampanhaSemDimensao {
  campaignId: string;
  nome: string | null;
  gasto: number;
  motivo: MotivoSemDimensao;
}

export const MOTIVO_SEM_EXPERT = "projeto sem expert vinculado" as const;

export interface FunilOfertaDoFunil {
  /** O expert do projeto (`naming_experts.project_id`). `id` é o `?expertId=` dos links do Dicionário. */
  expert: { id: string; code: string; name: string } | null;
  motivoSemExpert: typeof MOTIVO_SEM_EXPERT | null;
  opcoes: { funis: OpcaoDoDicionario[]; ofertas: OpcaoDoDicionario[] };
  /** TODAS as campanhas da etapa do funil — a lista pela qual a tela estreita os `campaignIds`. */
  campanhas: CampanhaComFunilEOferta[];
  naoCadastrados: CodigoNaoCadastrado[];
  semFunil: CampanhaSemDimensao[];
  semOferta: CampanhaSemDimensao[];
  janela: { since: string; until: string };
}

// ── o que ficou de fora do filtro (AC5) ─────────────────────────────────

export const FORA_SEM_UTM_CAMPAIGN = "sem utm_campaign" as const;
export const FORA_MACRO_NAO_RESOLVIDA = "macro não resolvida" as const;
export const FORA_CAMPANHA_FORA_DA_ETAPA = "campanha fora da etapa" as const;
export const FORA_SEM_FUNIL = "campanha sem funil identificado" as const;
export const FORA_SEM_OFERTA = "campanha sem oferta identificada" as const;
export const FORA_PLANILHA_SEM_UTM = "planilha sem UTM — não filtrável" as const;

export type MotivoForaDoFiltro =
  | typeof FORA_SEM_UTM_CAMPAIGN
  | typeof FORA_MACRO_NAO_RESOLVIDA
  | typeof FORA_CAMPANHA_FORA_DA_ETAPA
  | typeof FORA_SEM_FUNIL
  | typeof FORA_SEM_OFERTA
  | typeof FORA_PLANILHA_SEM_UTM;

/**
 * Uma linha do aviso. As unidades são declaradas (PO-10): `compradores`
 * DISTINTOS pela chave do card (`chaveDeComprador`) e faturamento BRUTO — só
 * das linhas de status pago, as mesmas que entrariam no faturamento.
 */
export interface LinhaForaDoFiltro {
  motivo: MotivoForaDoFiltro;
  /** Para campanha sem funil/oferta: o motivo da dimensão ausente (AC2). */
  detalhe: MotivoSemDimensao | null;
  compradores: number;
  faturamentoBruto: number;
}

/** O filtro que a API APLICOU — ecoado na resposta; ausente quando não houve filtro. */
export interface FiltroAplicado {
  funil: string | null;
  oferta: string | null;
  /** As campanhas da etapa que casaram. `[]` = nenhuma: vendas e mídia ZERO, nunca o projeto inteiro. */
  campanhas: string[];
}
