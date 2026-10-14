/**
 * As vendas da Kiwify no banco, e a Kiwify como fonte de vendas da etapa.
 *
 * ## Por que existe
 *
 * A planilha de vendas é uma **cópia** do que a Kiwify já sabe: atrasa, perde
 * coluna quando alguém mexe no cabeçalho, e depende de alguém arrastar fórmula.
 * Medido na conta DG & CPDF em 13/10/2026: das 574 vendas de 30 dias, **92,3%
 * já chegam com `utm_source`** da própria Kiwify. A origem que a planilha tenta
 * reconstruir à mão já vem junto da venda.
 *
 * ## Por que cache, e não consulta ao vivo
 *
 * `/v1/sales` exige `start_date`+`end_date` e tem **teto de 90 dias** por
 * consulta. Dois anos de perpétuo são ~8 chamadas paginadas; fazer isso a cada
 * abertura de tela é lento e estoura o rate limit. Então vale o padrão que o
 * Meta já usa aqui: a sincronização é a única que fala com a API, a tela lê o
 * banco.
 *
 * ## Por que o upsert é por `sale_id`
 *
 * A venda MUDA depois de criada: sai de `waiting_payment` para `paid`, e pode
 * ser reembolsada semanas depois. Com a chave `(project_id, sale_id)`, rodar a
 * mesma janela de novo **corrige** status e valor em vez de duplicar — e é por
 * isso que a sincronização pode ser burra e repetitiva sem causar dano.
 */

import { and, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import type { Database } from "../db/client.js";
import {
  kiwifyConnections,
  kiwifySales,
  kiwifyStageConfigs,
  stageSalesSpreadsheets,
} from "../db/schema.js";
import {
  decryptKiwifySecret,
  fetchSalesWindowed,
  getKiwifyToken,
  toYmd,
  type KiwifySale,
} from "./kiwify.js";
import { vendasComoPlanilha } from "./kiwify-como-planilha.js";

/** A oferta sem oferta. Precisa ser escolhível, senão some do recorte calado. */
export const SEM_OFERTA = "sem-oferta";

/** Data mais antiga que vale puxar quando ninguém disse de quando começar. */
const PADRAO_DIAS_PARA_TRAS = 365;

export class KiwifyIndisponivel extends Error {}

/**
 * A data que vale para recortar: a de APROVAÇÃO, senão a de criação.
 *
 * É a mesma regra de `dataDaVenda` no adaptador, de propósito. Se o corte
 * usasse `criada_em` e o agregador datasse pela aprovação, uma venda criada no
 * dia 30 e paga no dia 2 ficaria fora de uma etapa que começa no dia 1 — e
 * dentro do mês em que o dinheiro entrou. Duas regras para a mesma data é como
 * dois totais para a mesma pergunta aparecem.
 */
const DATA_DA_VENDA = sql`coalesce(${kiwifySales.aprovadaEm}, ${kiwifySales.criadaEm})`;

/** Só o que é venda de verdade. Reembolso e recusa não entram na conta. */
export const STATUS_QUE_VALEM = new Set(["paid", "approved"]);

function dataOuNulo(valor: string | null | undefined): Date | null {
  if (!valor) return null;
  const t = Date.parse(valor);
  return Number.isNaN(t) ? null : new Date(t);
}

/**
 * A venda da API virando linha do banco. Pura, para ser conferida sem rede.
 *
 * `null` quando a venda não tem id — sem ele não há chave, e gravar com id
 * inventado faria a próxima sincronização duplicar.
 */
export function paraLinhaDeCache(
  projectId: string,
  venda: KiwifySale,
): typeof kiwifySales.$inferInsert | null {
  const saleId = (venda.id ?? "").trim();
  if (!saleId) return null;
  const p = venda.product ?? {};
  const t = venda.tracking ?? {};
  const pg = venda.payment ?? {};
  const limpo = (v: string | null | undefined) => {
    const s = (v ?? "").trim();
    return s.length > 0 ? s : null;
  };
  return {
    projectId,
    saleId,
    productId: limpo(p.id),
    productName: limpo(p.name),
    offerId: limpo(p.offer_id),
    offerName: limpo(p.offer_name),
    status: limpo(venda.status)?.toLowerCase() ?? null,
    paymentMethod: limpo(venda.payment_method),
    // `charge_amount` é o que o cliente pagou; `net_amount` do topo é o que
    // sobra para o produtor. Ver o aviso no schema sobre não calcular à mão.
    brutoCentavos: pg.charge_amount ?? venda.net_amount ?? null,
    liquidoCentavos: venda.net_amount ?? pg.net_amount ?? null,
    taxaCentavos: pg.fee ?? null,
    currency: limpo(venda.currency) ?? "BRL",
    installments: venda.installments ?? null,
    parentOrderId: limpo(venda.parent_order_id),
    criadaEm: dataOuNulo(venda.created_at),
    aprovadaEm: dataOuNulo(venda.approved_date),
    reembolsadaEm: dataOuNulo(venda.refunded_at),
    customerEmail: limpo(venda.customer?.email)?.toLowerCase() ?? null,
    customerName: limpo(venda.customer?.name),
    utmSource: limpo(t.utm_source),
    utmMedium: limpo(t.utm_medium),
    utmCampaign: limpo(t.utm_campaign),
    utmContent: limpo(t.utm_content),
    utmTerm: limpo(t.utm_term),
    sck: limpo(t.sck),
    sincronizadaEm: new Date(),
  };
}

interface Credenciais {
  clientId: string;
  clientSecret: string;
  accountId: string;
  syncDe: string | null;
}

async function credenciais(db: Database, projectId: string): Promise<Credenciais | null> {
  const [c] = await db
    .select()
    .from(kiwifyConnections)
    .where(eq(kiwifyConnections.projectId, projectId))
    .limit(1);
  if (!c) return null;
  return {
    clientId: decryptKiwifySecret(c.clientIdEncrypted, c.clientIdIv),
    clientSecret: decryptKiwifySecret(c.clientSecretEncrypted, c.clientSecretIv),
    accountId: decryptKiwifySecret(c.accountIdEncrypted, c.accountIdIv),
    syncDe: c.vendasSyncDe,
  };
}

export interface ResultadoDaSincronizacao {
  de: string;
  ate: string;
  lidas: number;
  gravadas: number;
  semId: number;
}

/**
 * Puxa as vendas do período e grava.
 *
 * `desde` manda; sem ele, continua de onde a última sincronização parou e, na
 * primeira vez, pega um ano. A janela de 90 dias é cuidada por
 * `fetchSalesWindowed`.
 *
 * ## Por que re-puxa os últimos dias, sempre
 *
 * A venda muda depois de criada — aprova, reembolsa, estorna. Continuar
 * exatamente de onde parou deixaria essas mudanças para trás para sempre. O
 * recuo de 7 dias custa pouco (uma janela) e pega a quase totalidade das
 * transições, que acontecem nos primeiros dias.
 */
export async function sincronizarVendas(
  db: Database,
  projectId: string,
  opcoes: { desde?: string | null; ate?: string | null } = {},
): Promise<ResultadoDaSincronizacao> {
  const creds = await credenciais(db, projectId);
  if (!creds) throw new KiwifyIndisponivel("Kiwify não conectada neste projeto.");

  const hoje = toYmd(new Date());
  const recuo = (dias: number) => toYmd(new Date(Date.now() - dias * 86_400_000));
  const de = opcoes.desde?.trim() || (creds.syncDe ? recuoDe(creds.syncDe, 7) : recuo(PADRAO_DIAS_PARA_TRAS));
  const ate = opcoes.ate?.trim() || hoje;

  const token = await getKiwifyToken(creds.clientId, creds.clientSecret);
  const vendas = await fetchSalesWindowed(token, creds.accountId, {
    from: de,
    to: ate,
    fullDetails: true,
  });

  const linhas: (typeof kiwifySales.$inferInsert)[] = [];
  let semId = 0;
  for (const v of vendas) {
    const linha = paraLinhaDeCache(projectId, v);
    if (linha) linhas.push(linha);
    else semId += 1;
  }

  // Em blocos: um lançamento grande passa de mil vendas, e um INSERT único com
  // milhares de linhas estoura o limite de parâmetros do Postgres.
  const BLOCO = 500;
  for (let i = 0; i < linhas.length; i += BLOCO) {
    const bloco = linhas.slice(i, i + BLOCO);
    await db
      .insert(kiwifySales)
      .values(bloco)
      .onConflictDoUpdate({
        target: [kiwifySales.projectId, kiwifySales.saleId],
        set: {
          status: sql`excluded.status`,
          paymentMethod: sql`excluded.payment_method`,
          brutoCentavos: sql`excluded.bruto_centavos`,
          liquidoCentavos: sql`excluded.liquido_centavos`,
          taxaCentavos: sql`excluded.taxa_centavos`,
          aprovadaEm: sql`excluded.aprovada_em`,
          reembolsadaEm: sql`excluded.reembolsada_em`,
          offerId: sql`excluded.offer_id`,
          offerName: sql`excluded.offer_name`,
          productName: sql`excluded.product_name`,
          utmSource: sql`excluded.utm_source`,
          utmMedium: sql`excluded.utm_medium`,
          utmCampaign: sql`excluded.utm_campaign`,
          utmContent: sql`excluded.utm_content`,
          utmTerm: sql`excluded.utm_term`,
          sck: sql`excluded.sck`,
          sincronizadaEm: new Date(),
        },
      });
  }

  // `vendas_sync_de` só anda para TRÁS: guardar o início mais antigo já coberto
  // é o que permite o recuo de 7 dias sem reencolher a janela histórica.
  const deMaisAntigo = creds.syncDe && creds.syncDe < de ? creds.syncDe : de;
  await db
    .update(kiwifyConnections)
    .set({
      vendasSyncDe: deMaisAntigo,
      vendasSyncAte: ate,
      vendasSyncEm: new Date(),
      vendasSyncTotal: linhas.length,
      updatedAt: new Date(),
    })
    .where(eq(kiwifyConnections.projectId, projectId));

  return { de, ate, lidas: vendas.length, gravadas: linhas.length, semId };
}

/** `aaaa-mm-dd` recuado N dias. */
function recuoDe(ymd: string, dias: number): string {
  const t = Date.parse(`${ymd}T00:00:00Z`);
  if (Number.isNaN(t)) return ymd;
  return toYmd(new Date(t - dias * 86_400_000));
}

/**
 * As ofertas que existem nas vendas dos produtos escolhidos, com contagem.
 *
 * Sai das VENDAS porque `/v1/products` não lista ofertas — confirmado ao vivo.
 * A contagem vai junto de propósito: escolher oferta sem saber quantas vendas
 * cada uma tem é escolher no escuro, e foi assim que "(sem oferta)" passaria
 * desapercebida levando 91 vendas embora.
 */
export async function ofertasDosProdutos(
  db: Database,
  projectId: string,
  productIds: string[],
): Promise<
  {
    id: string;
    nome: string;
    produto: string | null;
    vendas: number;
    de: string | null;
    ate: string | null;
  }[]
> {
  const where = [eq(kiwifySales.projectId, projectId)];
  if (productIds.length > 0) where.push(inArray(kiwifySales.productId, productIds));

  const linhas = await db
    .select({
      offerId: kiwifySales.offerId,
      offerName: kiwifySales.offerName,
      produto: kiwifySales.productName,
      vendas: sql<number>`count(*)::int`,
      // O período de cada oferta é o que permite reconhecer qual delas é de
      // qual funil quando o mesmo produto vende em dois: "Lote 1" de setembro
      // e "Lote 1" de um relançamento em março não se distinguem pelo nome.
      de: sql<string | null>`min(${DATA_DA_VENDA})::date::text`,
      ate: sql<string | null>`max(${DATA_DA_VENDA})::date::text`,
    })
    .from(kiwifySales)
    .where(and(...where))
    .groupBy(kiwifySales.offerId, kiwifySales.offerName, kiwifySales.productName)
    .orderBy(sql`count(*) desc`);

  return linhas.map((l) => ({
    id: l.offerId ?? SEM_OFERTA,
    nome: l.offerName ?? "(sem oferta)",
    produto: l.produto,
    vendas: Number(l.vendas),
    de: l.de ?? null,
    ate: l.ate ?? null,
  }));
}

/**
 * As vendas do recorte de uma etapa.
 *
 * `offerIds` vazio = TODAS as ofertas dos produtos. Não é "nenhuma": ligar a
 * fonte sem escolher oferta zeraria a etapa, e o padrão tem de ser o que não
 * surpreende.
 *
 * ## Por que a janela importa tanto quanto a oferta
 *
 * A oferta separa bem quando existe — nenhum `offer_id` medido aparece em mais
 * de um produto. Mas 8 produtos vendem sem oferta nenhuma, e são os
 * reaproveitados em vários funis (Churrasco com Netão: 216 vendas em 92 dias).
 * Para esses, só a janela distingue um funil do outro.
 */
export interface RecorteDaEtapa {
  productIds: string[];
  offerIds: string[];
  startDate?: string | null;
  endDate?: string | null;
}

/**
 * As condições do recorte, separadas da execução para poderem ser conferidas
 * sem banco — é aqui que mora a decisão de qual venda é desta etapa.
 */
export function filtroDoRecorte(projectId: string, recorte: RecorteDaEtapa): SQL[] {
  const where: SQL[] = [eq(kiwifySales.projectId, projectId)];
  if (recorte.productIds.length > 0) {
    where.push(inArray(kiwifySales.productId, recorte.productIds));
  }
  if (recorte.offerIds.length > 0) {
    const ids = recorte.offerIds.filter((o) => o !== SEM_OFERTA);
    const querSemOferta = recorte.offerIds.includes(SEM_OFERTA);
    const condicoes: SQL[] = [];
    if (ids.length > 0) condicoes.push(inArray(kiwifySales.offerId, ids));
    // `sem-oferta` é uma escolha explícita e vira `IS NULL` — sem isto, as 91
    // vendas sem oferta não teriam como ser incluídas de jeito nenhum.
    if (querSemOferta) condicoes.push(isNull(kiwifySales.offerId) as unknown as SQL);
    if (condicoes.length === 1) where.push(condicoes[0]!);
    else if (condicoes.length > 1) where.push(or(...condicoes)!);
  }
  if (recorte.startDate) {
    where.push(sql`${DATA_DA_VENDA} >= ${`${recorte.startDate}T00:00:00Z`}`);
  }
  if (recorte.endDate) {
    // Fim INCLUSIVO: quem escreve 31/10 quer o dia 31 inteiro, então a
    // comparação é com o começo do dia seguinte.
    where.push(
      sql`${DATA_DA_VENDA} < ${`${recorte.endDate}T00:00:00Z`}::timestamptz + interval '1 day'`,
    );
  }
  return where;
}

/**
 * As vendas do recorte de uma etapa.
 *
 * `offerIds` vazio = TODAS as ofertas dos produtos. Não é "nenhuma": ligar a
 * fonte sem escolher oferta zeraria a etapa, e o padrão tem de ser o que não
 * surpreende.
 *
 * ## Por que a janela importa tanto quanto a oferta
 *
 * A oferta separa bem quando existe — nenhum `offer_id` medido aparece em mais
 * de um produto, e um produto com duas ofertas vendendo para dois funis se
 * resolve marcando a oferta certa aqui. Mas 8 produtos vendem sem oferta
 * nenhuma, e são os reaproveitados em vários funis (Churrasco com Netão: 216
 * vendas em 92 dias). Para esses, só a janela distingue um funil do outro.
 */
export async function vendasDoRecorte(
  db: Database,
  projectId: string,
  recorte: RecorteDaEtapa,
): Promise<(typeof kiwifySales.$inferSelect)[]> {
  return db
    .select()
    .from(kiwifySales)
    .where(and(...filtroDoRecorte(projectId, recorte)))
    .orderBy(kiwifySales.criadaEm);
}

// ============================================================
// A Kiwify no lugar da planilha
// ============================================================

/**
 * Uma fonte de vendas da etapa, planilha ou Kiwify.
 *
 * Tem a forma de uma linha de `stage_sales_spreadsheets` porque é assim que o
 * agregador já a consome — o que muda é `dados`: preenchido, as linhas já vêm
 * prontas e ninguém chama o Google Sheets.
 */
export type FonteDeVendas = typeof stageSalesSpreadsheets.$inferSelect & {
  /** Preenchido só na fonte Kiwify. `undefined` = ler do Google Sheets. */
  dados?: { headers: string[]; rows: string[][] };
  /** Vendas sem e-mail, descartadas pelo adaptador. Só na fonte Kiwify. */
  semEmail?: number;
  /** Recusadas e aguardando pagamento — não são venda. Só na fonte Kiwify. */
  naoSaoVenda?: number;
};

/**
 * A etapa está puxando as vendas da API da Kiwify?
 *
 * Para quem precisa saber a fonte sem ler as vendas — hoje a
 * `sales-conversion`, que não consegue cruzar captação × produto principal
 * quando a fonte é a Kiwify e precisa dizer isso em vez de mostrar 0%.
 */
export async function aFonteEhKiwify(db: Database, stageId: string): Promise<boolean> {
  const [cfg] = await db
    .select({ fonteDeVendas: kiwifyStageConfigs.fonteDeVendas })
    .from(kiwifyStageConfigs)
    .where(eq(kiwifyStageConfigs.stageId, stageId))
    .limit(1);
  return cfg?.fonteDeVendas === "kiwify";
}

/**
 * As fontes de venda da etapa: a Kiwify, quando ela é a fonte, senão as
 * planilhas que vierem.
 *
 * ## Por que a Kiwify SUBSTITUI, e não soma
 *
 * A planilha de vendas costuma ser um espelho da própria Kiwify. Somar as duas
 * contaria a mesma venda duas vezes e dobraria o faturamento — e deduplicar
 * entre elas depende de a planilha trazer o id da transação, o que nem sempre
 * acontece. Então ligar a Kiwify desliga a planilha, e a tela diz isso.
 *
 * ## Por que vive aqui e não em cada rota
 *
 * Três rotas leem as vendas da etapa por este caminho (`sales-data`,
 * `hot-cold-buyers`, `sales-data-daily`). Trocando a fonte em uma só, a mesma
 * tela mostraria faturamento da Kiwify e perfil da planilha — dois números
 * para a mesma pergunta.
 *
 * A quarta, `sales-conversion`, NÃO passa por aqui: ela cruza o comprador da
 * planilha de captação com o do produto principal da MESMA etapa, e para isso
 * precisa saber qual venda é de qual papel. O recorte da Kiwify é um só
 * (produtos + ofertas + janela da etapa), sem papel — colapsar as duas
 * planilhas numa fonte deixava um dos lados vazio e a taxa virava 0%. Ver o
 * comentário na própria rota.
 *
 * `subtypePedido` é o subtype que a rota pediu, e a planilha virtual o herda.
 * Antes ele era adivinhado pela primeira planilha da etapa, o que mentia nas
 * etapas que ainda não têm planilha nenhuma (2 das 8 Captações Pagas medidas
 * em 13/10/2026) — ali a virtual saía como `main_product` numa rota que havia
 * pedido `capture`.
 */
export async function fontesDeVendaDaEtapa(
  db: Database,
  projectId: string,
  stageId: string,
  planilhas: FonteDeVendas[],
  subtypePedido: string,
): Promise<FonteDeVendas[]> {
  const [cfg] = await db
    .select()
    .from(kiwifyStageConfigs)
    .where(eq(kiwifyStageConfigs.stageId, stageId))
    .limit(1);
  if (!cfg || cfg.fonteDeVendas !== "kiwify") return planilhas;

  const vendas = await vendasDoRecorte(db, projectId, {
    productIds: cfg.productIds ?? [],
    offerIds: cfg.offerIds ?? [],
    startDate: cfg.startDate,
    endDate: cfg.endDate,
  });
  const { headers, rows, mapping, semEmail, naoSaoVenda } = vendasComoPlanilha(vendas);

  // Um "subtype" só: o recorte da etapa é um, e multiplicá-lo por subtype faria
  // a mesma venda entrar em duas contas. Assume o subtype que a rota pediu para
  // ela não precisar saber que a fonte mudou.
  const modelo = planilhas[0];
  const subtype = subtypePedido;
  const agora = new Date();
  return [
    {
      // Campos herdados da planilha que a etapa já tinha, quando existe: o
      // agregador usa `orderBumpProducts` e `productTypes` para separar order
      // bump de produto principal, e isso é configuração do time — não tem
      // equivalente na Kiwify e não deve se perder ao trocar a fonte.
      orderBumpProducts: modelo?.orderBumpProducts ?? [],
      productTypes: modelo?.productTypes ?? {},
      createdAt: modelo?.createdAt ?? agora,
      updatedAt: agora,
      stageId,
      id: `kiwify:${stageId}`,
      spreadsheetId: "",
      spreadsheetName: "Kiwify",
      sheetName: "Kiwify",
      subtype,
      columnMapping: mapping as FonteDeVendas["columnMapping"],
      dados: { headers, rows },
      semEmail,
      naoSaoVenda,
    } as FonteDeVendas,
  ];
}
