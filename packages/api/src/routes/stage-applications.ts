/**
 * Aplicações por dia — uma série por PÁGINA, e a comparação com o lançamento
 * anterior.
 *
 * O time pode ter mais de uma planilha de aplicação no mesmo lançamento (ex.:
 * "form com ticket" e "form sem ticket").
 *
 * Story 43.6 — uma planilha pode virar VÁRIAS séries. A aba-base é o formulário
 * genérico onde caem todas as páginas que não ganharam aba própria; ali quem
 * decide a página é a LP do `utm_term` da linha, não o nome do arquivo nem o
 * label cadastrado. Aba com sufixo (`…-PaginaB`) continua produzindo uma série
 * só, porque o nome já declarou a página.
 *
 * Alinhamento em D-day (dia relativo ao início do lançamento) porque a pergunta
 * é "estamos melhor ou pior que o lançamento passado NESTA altura?" — comparar
 * por data não responde isso, já que dois lançamentos começam em dias
 * diferentes. O D1 é definido no nível do LANÇAMENTO (menor data com aplicação
 * em qualquer forma), não por planilha: assim todas as formas do mesmo
 * lançamento compartilham o mesmo eixo e ficam comparáveis entre si.
 *
 * Story 18.84 — a página é o LINK DO ANÚNCIO de onde a aplicação veio (a página
 * de vendas, decisão 7.10): `utm_content → ad_id → meta_ad_creatives_cache →
 * normalizeLpUrl`, a mesma cadeia da 18.83. O nome da aba e a letra do
 * `utm_term` deixaram de ser chave; aplicação sem anúncio de origem vai para
 * "Sem link resolvido", com a causa. Ver `agruparPorLink`.
 *
 * A comparação com o lançamento anterior (`compareFunnelId`, configurado no
 * funil) é AGREGADA: total do lançamento contra total do anterior, via
 * `aggregateForms`. Não é casada forma a forma — o cabeçalho afirmou isso por
 * um tempo, mas o código nunca fez (corrigido na 43.6, QA-43.6-02). Agregar é
 * também o que mantém a comparação estável agora que uma planilha pode virar
 * várias séries.
 */

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import fp from "fastify-plugin";
import { funnelSpreadsheets, funnelStages, funnels } from "../db/schema.js";
import { getSpreadsheetSheets, readSheetData } from "../services/google-sheets.js";
import { origemDaLinha, regrasDoProjeto } from "../services/source-rules-store.js";
import {
  abasParaDescobrir,
  acharColunaUtmContent,
  acharColunaUtmTerm,
  agruparPorLink,
  anuncioDaAplicacao,
  avisoDeOrfasSeAplica,
  causaDaAplicacao,
  derivarPrefixos,
  acharColunaEmail,
  acharColunaNome,
  acharColunaUtmSource,
  labelDaAbaDescoberta,
  paginasOrfas,
  type LinhaPorLink,
  type SemLinkDaAplicacao,
} from "../services/application-sheets.js";
import {
  lerAnunciosComGasto,
  lerLinksDosAnuncios,
  type LinkDoAnuncio,
} from "../services/lp-do-anuncio.js";

/**
 * A linha da planilha como objeto `{cabeçalho: valor}`.
 *
 * As regras de origem observam a linha por NOME de coluna — é o que faz uma
 * regra sobreviver a alguém reordenar o formulário.
 */
function linhaComoObjeto(headers: string[], row: string[]): Record<string, string> {
  const saida: Record<string, string> = {};
  for (const [i, h] of headers.entries()) {
    // Primeira preenchida vence: colunas homônimas são a regra nestas
    // planilhas, e a segunda costuma vir vazia.
    if (h && !saida[h]) saida[h] = (row[i] ?? "").trim();
  }
  return saida;
}

const paramsSchema = z.object({
  projectId: z.string().uuid(),
  funnelId: z.string().uuid(),
  stageId: z.string().uuid(),
});

export interface DailyPoint {
  /** Dia relativo: 1 = primeiro dia com aplicação do lançamento. */
  dia: number;
  /** Data real daquele dia — o tooltip mostra, senão D12 não diz nada. */
  date: string;
  aplicacoes: number;
  /** Soma corrida — é o que revela se o ritmo está acima ou abaixo. */
  acumulado: number;
}

/** dd/mm/aaaa, aaaa-mm-dd e ISO. Devolve a data local em aaaa-mm-dd. */
function parseDay(raw: string | undefined): string | null {
  if (!raw) return null;
  const t = String(raw).trim();
  if (!t) return null;

  const br = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) {
    return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  }
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const d = new Date(t);
  if (isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface RawForm {
  sheetId: string;
  label: string;
  /** Nome da aba de origem — identifica a página quando o label não identifica. */
  sheetName: string;
  /**
   * A série corresponde a uma página CONHECIDA? Story 18.84: só as séries de
   * URL. A "Sem link resolvido" não prova forma para página nenhuma (AC4).
   */
  ehPagina: boolean;
  /** Story 18.84: `href` da série (URL do anúncio). `null` = sem link. */
  url: string | null;
  /** Story 18.84: por que a série "Sem link resolvido" existe (AC2). */
  semLink?: SemLinkDaAplicacao;
  /** data (aaaa-mm-dd) -> nº de aplicações naquele dia. */
  counts: Map<string, number>;
  total: number;
}

/**
 * Story 43.1 — problema que impediu uma forma de entrar no gráfico.
 *
 * Antes, tudo isso virava uma série zerada (ou sumia), e zerado é
 * indistinguível de "página sem aplicação". Uma página faltando COM aviso é um
 * problema que alguém resolve; sem aviso, é uma decisão errada que ninguém
 * rastreia.
 */
interface AvisoForma {
  aba: string;
  motivo: string;
}

/** Resultado de `rawFormsFor`: as formas legíveis + o que ficou de fora. */
interface FormsResult {
  forms: RawForm[];
  avisos: AvisoForma[];
  /** Story 18.84 — URLs das séries que SÃO página (base do aviso, AC4). */
  urlsComForma: string[];
  /** Aplicações que chegaram a uma URL — a outra porta de entrada do aviso. */
  aplicacoesComLink: number;
  /** Aplicações em "Sem link resolvido" (antes: sem página identificada). */
  semPagina: number;
}

interface FormSeries {
  sheetId: string;
  label: string;
  points: DailyPoint[];
  total: number;
  url: string | null;
  semLink?: SemLinkDaAplicacao;
}

/**
 * Story 43.7 — uma aba a ler: cadastrada no banco ou descoberta na varredura.
 *
 * Existe para que a lista de aplicações e o gráfico leiam EXATAMENTE o mesmo
 * conjunto de abas. Duplicar a descoberta produziria duas verdades sobre "o que
 * conta como aplicação neste funil", e a divergência só apareceria como número
 * que não bate entre a tabela e o gráfico logo acima dela.
 */
interface AbaResolvida {
  id: string;
  label: string;
  spreadsheetId: string;
  sheetName: string;
  dateCol: string | undefined;
}

export default fp(async function stageApplicationsRoutes(fastify) {
  /**
   * Descobre quais abas entram — cadastradas + as do mesmo grupo que ainda não
   * foram vinculadas (Story 43.1). Não lê conteúdo: só resolve a lista.
   */
  async function resolverAbas(
    funnelId: string,
  ): Promise<{ abas: AbaResolvida[]; avisos: AvisoForma[] }> {
    const sheets = await fastify.db
      .select({
        id: funnelSpreadsheets.id,
        label: funnelSpreadsheets.label,
        spreadsheetId: funnelSpreadsheets.spreadsheetId,
        sheetName: funnelSpreadsheets.sheetName,
        columnMapping: funnelSpreadsheets.columnMapping,
      })
      .from(funnelSpreadsheets)
      .where(
        and(eq(funnelSpreadsheets.funnelId, funnelId), eq(funnelSpreadsheets.type, "applications")),
      );

    const avisos: AvisoForma[] = [];
    if (!sheets.length) return { abas: [], avisos };

    const abas: AbaResolvida[] = sheets.map((s) => ({
      id: s.id,
      label: s.label,
      spreadsheetId: s.spreadsheetId,
      sheetName: s.sheetName,
      dateCol: s.columnMapping?.date,
    }));

    const porArquivo = new Map<string, typeof sheets>();
    for (const s of sheets) {
      const lista = porArquivo.get(s.spreadsheetId) ?? [];
      lista.push(s);
      porArquivo.set(s.spreadsheetId, lista);
    }

    for (const [spreadsheetId, doArquivo] of porArquivo) {
      const prefixos = derivarPrefixos(doArquivo.map((s) => s.sheetName));
      // Mapping herdado do grupo — as planilhas de um mesmo arquivo usam o mesmo
      // formulário, então as colunas coincidem.
      const dateColHerdada = doArquivo.find((s) => s.columnMapping?.date)?.columnMapping?.date;

      let doGoogle: { title: string }[];
      try {
        doGoogle = (await getSpreadsheetSheets(spreadsheetId)).sheets;
      } catch (error) {
        fastify.log.warn({ err: error, spreadsheetId }, "[43.1] falha ao listar abas");
        avisos.push({
          aba: spreadsheetId,
          motivo:
            "não foi possível listar as abas da planilha — páginas novas podem estar faltando no gráfico",
        });
        continue;
      }

      for (const { aba, prefixo } of abasParaDescobrir(
        doGoogle.map((a) => a.title),
        doArquivo.map((s) => s.sheetName),
        prefixos,
      )) {
        abas.push({
          id: `descoberta:${spreadsheetId}:${aba}`,
          label: labelDaAbaDescoberta(aba, prefixo),
          spreadsheetId,
          sheetName: aba,
          dateCol: dateColHerdada,
        });
      }
    }

    return { abas, avisos };
  }

  /**
   * Lê TODAS as planilhas de aplicação de um funil e devolve as séries por
   * PÁGINA, com a contagem por data (calendário). O alinhamento em D-day é
   * feito depois (alignForms), no nível do lançamento.
   *
   * Story 18.84: a página é o link do anúncio de origem, resolvido no cache de
   * criativos do `projectId` da rota — sempre o projeto validado na cadeia
   * etapa → funil → projeto, nunca `ad_id` solto. `projectId: null` (a
   * comparação com o lançamento anterior, que só usa o TOTAL) pula a leitura
   * do cache: tudo cai numa série só e o agregado não muda.
   */
  async function rawFormsFor(funnelId: string, projectId: string | null): Promise<FormsResult> {
    // Story 43.7: a descoberta vive em `resolverAbas` para que a lista de
    // aplicações leia exatamente o mesmo conjunto de abas que o gráfico.
    const { abas: abasResolvidas, avisos } = await resolverAbas(funnelId);

    if (!abasResolvidas.length)
      return { forms: [], avisos, urlsComForma: [], aplicacoesComLink: 0, semPagina: 0 };

    /**
     * Lê as linhas de UMA aba. Devolve `[]` (com aviso) quando a aba não dá
     * para ler ou não tem a coluna de data — uma página faltando COM aviso é
     * problema que alguém resolve; zerada, mente.
     */
    async function lerLinhas(
      label: string,
      spreadsheetId: string,
      sheetName: string,
      dateCol: string | undefined,
    ): Promise<LinhaPorLink[]> {
      if (!dateCol) {
        avisos.push({ aba: sheetName, motivo: `a planilha "${label}" está sem coluna de data mapeada` });
        return [];
      }

      let data: { headers: string[]; rows: string[][] };
      try {
        data = await readSheetData(spreadsheetId, sheetName);
      } catch (error) {
        // Mensagem crua da API do Google ("PERMISSION_DENIED") não diz ao time o
        // que fazer. Traduz para ação; o detalhe técnico fica no log.
        fastify.log.warn({ err: error, sheetName }, "[43.1] aba de aplicação ilegível");
        avisos.push({
          aba: sheetName,
          motivo: "não foi possível ler a aba — verifique permissão de leitura e se ela não foi renomeada",
        });
        return [];
      }

      const idx = data.headers.indexOf(dateCol);
      if (idx === -1) {
        avisos.push({ aba: sheetName, motivo: `a aba não tem a coluna "${dateCol}"` });
        return [];
      }

      // PO-08: a coluna PREENCHIDA, não a primeira homônima (como o utm_term).
      const idxConteudo = acharColunaUtmContent(data.headers, data.rows);

      const linhas: LinhaPorLink[] = [];
      for (const row of data.rows) {
        const day = parseDay(row[idx]);
        // Linha sem data válida (arrasto no fim da planilha, célula em branco)
        // não entra: entraria como "hoje" e inflaria o último dia.
        if (!day) continue;
        linhas.push({
          dia: day,
          adId: idxConteudo === null ? null : anuncioDaAplicacao(row[idxConteudo]),
        });
      }
      return linhas;
    }

    const linhas = (
      await Promise.all(
        abasResolvidas.map((a) => lerLinhas(a.label, a.spreadsheetId, a.sheetName, a.dateCol)),
      )
    ).flat();

    // Um lote só para o cache, com o projeto da rota (sem chamada à Meta).
    const links: Map<string, LinkDoAnuncio> = projectId
      ? await lerLinksDosAnuncios(
          fastify.db,
          projectId,
          linhas.map((l) => l.adId).filter((id): id is string => !!id),
        )
      : new Map();

    const forms: RawForm[] = agruparPorLink(linhas, links).map((g) => ({
      sheetId: `link:${g.chave}`,
      label: g.label,
      sheetName: g.label,
      ehPagina: g.ehPagina,
      url: g.url,
      ...(g.semLink ? { semLink: g.semLink } : {}),
      counts: g.counts,
      total: g.total,
    }));

    const urlsComForma = forms.filter((f) => f.ehPagina).map((f) => f.label);
    const aplicacoesComLink = forms.filter((f) => f.ehPagina).reduce((n, f) => n + f.total, 0);
    const semPagina = forms.filter((f) => !f.ehPagina).reduce((n, f) => n + f.total, 0);

    return { forms, avisos, urlsComForma, aplicacoesComLink, semPagina };
  }

  /**
   * Alinha todas as formas no MESMO eixo D-day: D1 = menor data com aplicação em
   * qualquer forma; a série vai até a maior data. Dias sem aplicação viram 0 (um
   * buraco no meio da curva é informação — fim de semana, campanha pausada) e
   * omiti-los distorceria o D-day dos dias seguintes.
   */
  function alignForms(forms: RawForm[]): FormSeries[] {
    const extras = (f: RawForm) => ({ url: f.url, ...(f.semLink ? { semLink: f.semLink } : {}) });
    const dates = new Set<string>();
    for (const f of forms) for (const k of f.counts.keys()) dates.add(k);
    const sorted = [...dates].sort();

    if (!sorted.length) {
      return forms.map((f) => ({ sheetId: f.sheetId, label: f.label, points: [], total: f.total, ...extras(f) }));
    }

    const inicio = new Date(`${sorted[0]}T00:00:00Z`);
    const fim = new Date(`${sorted[sorted.length - 1]}T00:00:00Z`);

    return forms.map((f) => {
      const points: DailyPoint[] = [];
      let acumulado = 0;
      let i = 1;
      for (let d = new Date(inicio); d <= fim; d.setUTCDate(d.getUTCDate() + 1)) {
        const key = d.toISOString().slice(0, 10);
        const n = f.counts.get(key) ?? 0;
        acumulado += n;
        points.push({ dia: i, date: key, aplicacoes: n, acumulado });
        i++;
      }
      return { sheetId: f.sheetId, label: f.label, points, total: f.total, ...extras(f) };
    });
  }

  /**
   * Story 18.84 (AC4) — páginas de VENDA com gasto recente e nenhuma aplicação.
   *
   * Lê do BANCO, não da API da Meta: anúncios com gasto nos últimos 30 dias
   * (evidência de entrega) nas campanhas da ETAPA de Vendas (`stageCampaigns`,
   * PO-05) e a URL de cada um no cache de criativos. Nem o projeto inteiro (a
   * 43.1 acusava página de outro funil) nem o funil (acusaria as capturas).
   * A janela de 30 dias segue a da 43.1 — mudar a régua não é escopo.
   */
  async function paginasSemAplicacao(
    projectId: string,
    stageCampaigns: string[],
    urlsComForma: string[],
    aplicacoesComLink: number,
  ): Promise<string[]> {
    if (!avisoDeOrfasSeAplica(stageCampaigns.length, aplicacoesComLink)) return [];

    const desde = new Date();
    desde.setDate(desde.getDate() - 30);
    const desdeStr = desde.toISOString().slice(0, 10);

    const adIds = await lerAnunciosComGasto(fastify.db, projectId, stageCampaigns, desdeStr);
    const links = await lerLinksDosAnuncios(fastify.db, projectId, adIds);
    const comGasto = [...links.values()].map((l) => l.chave).filter((c): c is string => !!c);
    return paginasOrfas(comGasto, urlsComForma);
  }

  /** Soma todas as planilhas de aplicação de um lançamento numa forma única. */
  function aggregateForms(forms: RawForm[]): RawForm {
    const counts = new Map<string, number>();
    let total = 0;
    for (const f of forms) {
      for (const [k, v] of f.counts) counts.set(k, (counts.get(k) ?? 0) + v);
      total += f.total;
    }
    // `ehPagina: false` — o agregado é a soma de TODAS as páginas, então ele não
    // é página nenhuma. Só existe para o total da comparação entre lançamentos;
    // não entra no cálculo do aviso de LP órfã.
    return {
      sheetId: "__total__",
      label: "Total",
      sheetName: "__total__",
      ehPagina: false,
      url: null,
      counts,
      total,
    };
  }

  /** Soma séries JÁ alinhadas (mesmo eixo D-day) num total por dia. */
  function totalOfAligned(forms: FormSeries[]): DailyPoint[] {
    const len = forms.reduce((m, f) => Math.max(m, f.points.length), 0);
    const out: DailyPoint[] = [];
    let acumulado = 0;
    for (let i = 0; i < len; i++) {
      let aplicacoes = 0;
      let date = "";
      for (const f of forms) {
        const p = f.points[i];
        if (p) {
          aplicacoes += p.aplicacoes;
          date = p.date;
        }
      }
      acumulado += aplicacoes;
      out.push({ dia: i + 1, date, aplicacoes, acumulado });
    }
    return out;
  }

  fastify.get(
    "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/applications-daily",
    async (request, reply) => {
      if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
      const params = paramsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
      const { projectId, funnelId, stageId } = params.data;

      const [ctx] = await fastify.db
        .select({
          funnelName: funnels.name,
          compareFunnelId: funnels.compareFunnelId,
          // Story 18.84 (PO-05): as campanhas da ETAPA — base do aviso de órfã.
          stageCampaigns: funnelStages.campaigns,
        })
        .from(funnelStages)
        .innerJoin(funnels, eq(funnels.id, funnelStages.funnelId))
        .where(
          and(
            eq(funnelStages.id, stageId),
            eq(funnelStages.funnelId, funnelId),
            eq(funnels.projectId, projectId),
          ),
        )
        .limit(1);
      if (!ctx) return reply.code(404).send({ error: "Etapa não encontrada" });

      const atualRaw = await rawFormsFor(funnelId, projectId);
      const atual = alignForms(atualRaw.forms);

      // Comparação com o lançamento anterior é AGREGADA (total vs total), não
      // forma a forma: cada lançamento nomeia suas planilhas do seu jeito, então
      // casar por nome quebrava a comparação (some quando os nomes diferem). A
      // pergunta é "estamos à frente do lançamento passado NO TOTAL, nesta
      // altura?" — soma todas as planilhas de aplicação de cada lançamento.
      let compareFunnelName: string | null = null;
      let comparison: { points: DailyPoint[]; total: number } | null = null;
      if (ctx.compareFunnelId) {
        const [cmpFunnel] = await fastify.db
          .select({ id: funnels.id, name: funnels.name })
          .from(funnels)
          .where(eq(funnels.id, ctx.compareFunnelId))
          .limit(1);
        if (cmpFunnel) {
          compareFunnelName = cmpFunnel.name;
          const prevTotal = alignForms([
            aggregateForms((await rawFormsFor(ctx.compareFunnelId, null)).forms),
          ]);
          const p = prevTotal[0];
          if (p && p.points.length) comparison = { points: p.points, total: p.total };
        }
      }

      // Total do lançamento atual (soma das formas, já no mesmo eixo D-day).
      const currentTotalPoints = totalOfAligned(atual);
      const currentTotal = atual.reduce((s, f) => s + f.total, 0);

      // Delta na MESMA altura: acumulado total do atual vs. o do anterior no
      // mesmo D-day. Comparar com o total FINAL do anterior diria que estamos
      // sempre perdendo até o último dia — leitura inútil.
      let deltaPercent: number | null = null;
      const ultimoDia = currentTotalPoints.length;
      if (ultimoDia > 0 && comparison && comparison.points.length) {
        const base = comparison.points.find((pt) => pt.dia === ultimoDia)?.acumulado;
        const meu = currentTotalPoints[ultimoDia - 1].acumulado;
        if (base && base > 0) deltaPercent = +(((meu - base) / base) * 100).toFixed(1);
      }

      // Sem nenhuma planilha vinculada não há o que avisar: é etapa que ainda
      // não tem comercial rodando, e o empty state já explica o que fazer.
      const semPlanilha = atualRaw.forms.length === 0 && atualRaw.avisos.length === 0;
      const lpsOrfas = semPlanilha
        ? []
        : await paginasSemAplicacao(
            projectId,
            (ctx.stageCampaigns ?? []).map((c) => c.id),
            atualRaw.urlsComForma,
            atualRaw.aplicacoesComLink,
          );

      return {
        funnelName: ctx.funnelName,
        compareFunnelName,
        semPlanilha,
        forms: atual.map((f) => ({
          sheetId: f.sheetId,
          label: f.label,
          total: f.total,
          points: f.points,
          // Story 18.84 (AC1/AC2): o link da série e as causas da sem link.
          url: f.url,
          ...(f.semLink ? { semLink: f.semLink } : {}),
        })),
        comparison,
        currentTotal,
        deltaPercent,
        /** Story 43.1 — abas que ficaram de fora, e por quê (AC4). */
        avisos: atualRaw.avisos,
        /**
         * Story 18.84 (AC4) — URLs de página de VENDA com gasto recente nas
         * campanhas da etapa e nenhuma aplicação atribuída.
         */
        lpsOrfas,
        /**
         * Story 43.6 — aplicações que entraram no gráfico sem página conhecida.
         *
         * Vai junto com `lpsOrfas` de propósito: enquanto este número for > 0,
         * "a LPD não tem aplicação" é uma afirmação com ressalva — alguma
         * dessas linhas pode ser dela. A tela precisa poder dizer isso.
         */
        aplicacoesSemPagina: atualRaw.semPagina,
        /**
         * Story 43.6 — a tela explicava que as páginas vinham do `utm_term`.
         *
         * Story 18.84: a quebra pelo `utm_term` não existe mais — o campo vai
         * sempre `false`, para o web ANTERIOR não afirmar uma regra que deixou
         * de valer. O sinal da regra nova é `paginasPeloLinkDoAnuncio`.
         */
        paginasVieramDoUtmTerm: false,
        /**
         * Story 18.84 — as séries são o link do anúncio de origem. É o gatilho
         * da explicação na tela (os números mudam: a aba e a letra deixaram de
         * ser chave). `false` só quando não há série nenhuma.
         */
        paginasPeloLinkDoAnuncio: atual.length > 0,
      };
    },
  );

  /**
   * Story 43.7 — a lista das aplicações, linha a linha.
   *
   * O gráfico responde "quantas por dia, por página"; esta rota responde "quem
   * aplicou, e de que página veio". Story 18.84: a página sai do mesmo link do
   * anúncio (`utm_content → ad_id → URL`) e pela mesma função do gráfico
   * (`causaDaAplicacao`) — se as duas telas discordassem sobre a página de uma
   * aplicação, nenhuma das duas serviria.
   *
   * Sem paginação no servidor de propósito: são dezenas de linhas por
   * lançamento (70 no maior funil de produção hoje), e paginar aqui obrigaria
   * um round-trip ao Google a cada troca de página — para dado que já está todo
   * em memória. A tela pagina o que recebe.
   */
  fastify.get(
    "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/applications-list",
    async (request, reply) => {
      // As duas verificações abaixo são as mesmas do `applications-daily`, e
      // aqui pesam MAIS: aquele devolve contagens por dia, este devolve nome e
      // e-mail de pessoas reais.
      //
      // O guest-guard global (middleware/guest-guard.ts) NÃO cobre isto: ele
      // valida a membership do guest no projeto da URL e retorna cedo para
      // qualquer outro papel. Sem a query de vínculo, um usuário do projeto A
      // passaria o funnelId do projeto B na própria URL de A e receberia os
      // dados de B — a membership que o guard confere seria a de A, que ele tem.
      if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });

      const paramsResult = paramsSchema.safeParse(request.params);
      if (!paramsResult.success) {
        return reply.code(400).send({ error: "Parâmetros inválidos" });
      }
      const { projectId, funnelId, stageId } = paramsResult.data;

      // Prova que etapa, funil e projeto formam a mesma cadeia. `projectId` e
      // `stageId` existiam na rota sem serem usados — validar o vínculo é a
      // única razão de eles estarem na URL.
      const [ctx] = await fastify.db
        .select({ funnelName: funnels.name })
        .from(funnelStages)
        .innerJoin(funnels, eq(funnels.id, funnelStages.funnelId))
        .where(
          and(
            eq(funnelStages.id, stageId),
            eq(funnelStages.funnelId, funnelId),
            eq(funnels.projectId, projectId),
          ),
        )
        .limit(1);
      if (!ctx) return reply.code(404).send({ error: "Etapa não encontrada" });

      const { abas, avisos } = await resolverAbas(funnelId);
      if (!abas.length) return { semPlanilha: true, aplicacoes: [], avisos };

      // Uma leitura por request, não uma por linha: as regras mudam uma vez por
      // mês e a lista tem centenas de linhas.
      const regrasDeOrigem = await regrasDoProjeto(fastify.db as never, projectId);

      const aplicacoesLidas = (
        await Promise.all(
          abas.map(async (aba) => {
            if (!aba.dateCol) return [];
            let data: { headers: string[]; rows: string[][] };
            try {
              data = await readSheetData(aba.spreadsheetId, aba.sheetName);
            } catch (error) {
              fastify.log.warn({ err: error, aba: aba.sheetName }, "[43.7] aba ilegível");
              return [];
            }

            const iData = data.headers.indexOf(aba.dateCol);
            if (iData === -1) return [];

            // Colunas homônimas são a regra nestas planilhas, não a exceção: a
            // aba-base do dg-pg04 tem três `name`, três `email` e três
            // `utm_term`, com dado só na primeira. Escolher pela PREENCHIDA
            // sobrevive à próxima versão do formulário.
            const iNome = acharColunaNome(data.headers, data.rows);
            const iEmail = acharColunaEmail(data.headers, data.rows);
            // O `utm_term` continua sendo lido e vai na resposta (dado da
            // linha), mas a página NÃO sai mais dele (18.84): sai do
            // `utm_content`, pela coluna preenchida (PO-08).
            const iUtm = acharColunaUtmTerm(data.headers, data.rows);
            const iConteudo = acharColunaUtmContent(data.headers, data.rows);
            const iSource = acharColunaUtmSource(data.headers, data.rows);
            const nomeDaColunaDeOrigem = iSource === null ? null : data.headers[iSource]!;

            const out = [];
            for (const row of data.rows) {
              const dia = parseDay(row[iData]);
              if (!dia) continue;
              const utmTerm = iUtm === null ? "" : (row[iUtm] ?? "").trim();
              out.push({
                data: dia,
                nome: iNome === null ? "" : (row[iNome] ?? "").trim(),
                email: iEmail === null ? "" : (row[iEmail] ?? "").trim(),
                // A regra de origem do projeto entra AQUI, e não só na tela que
                // a criou: classificar uma vez precisa valer em toda leitura,
                // senão esta tabela e o BI dizem coisas diferentes sobre a
                // mesma pessoa.
                utmSource: origemDaLinha(
                  linhaComoObjeto(data.headers, row),
                  regrasDeOrigem,
                  nomeDaColunaDeOrigem ?? undefined,
                ),
                utmTerm,
                // Story 18.84: o anúncio de origem — a página sai dele, abaixo.
                adId: iConteudo === null ? null : anuncioDaAplicacao(row[iConteudo]),
                aba: aba.label,
              });
            }
            return out;
          }),
        )
      ).flat();

      // Story 18.84 (AC3): a página de cada aplicação pelo link do anúncio, num
      // lote só para o cache do projeto da rota (sem Meta). Mesma regra do
      // gráfico — `causaDaAplicacao` decide "tem página" e "por que não tem".
      const links = await lerLinksDosAnuncios(
        fastify.db,
        projectId,
        aplicacoesLidas.map((a) => a.adId).filter((id): id is string => !!id),
      );
      const aplicacoes = aplicacoesLidas.map((a) => {
        const causa = causaDaAplicacao(a.adId, links);
        const link = a.adId ? links.get(a.adId) : undefined;
        return {
          ...a,
          adId: a.adId ?? "",
          lp: causa ? null : (link?.chave ?? null),
          lpUrl: causa ? null : (link?.url ?? null),
          lpCausa: causa,
        };
      });

      // Mais recente primeiro. `parseDay` normaliza para aaaa-mm-dd, então a
      // ordem lexicográfica é a cronológica — sem custo de Date por linha.
      aplicacoes.sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0));

      return { semPlanilha: false, aplicacoes, avisos };
    },
  );
});
