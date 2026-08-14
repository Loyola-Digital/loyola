/**
 * Aplicações por dia — uma série por planilha de aplicação (forma) do funil, e a
 * comparação com o lançamento anterior por forma.
 *
 * O time pode ter MAIS DE UMA planilha de aplicação no mesmo lançamento (ex.:
 * "form com ticket" e "form sem ticket"). Cada planilha do tipo `applications`
 * vira uma série própria, nomeada pelo `label` da planilha — é o que aparece no
 * tooltip/legenda do gráfico.
 *
 * Alinhamento em D-day (dia relativo ao início do lançamento) porque a pergunta
 * é "estamos melhor ou pior que o lançamento passado NESTA altura?" — comparar
 * por data não responde isso, já que dois lançamentos começam em dias
 * diferentes. O D1 é definido no nível do LANÇAMENTO (menor data com aplicação
 * em qualquer forma), não por planilha: assim todas as formas do mesmo
 * lançamento compartilham o mesmo eixo e ficam comparáveis entre si.
 *
 * A comparação com o lançamento anterior (`compareFunnelId`, configurado no
 * funil) é casada FORMA A FORMA pelo nome (label): "form com ticket" do atual
 * compara com "form com ticket" do anterior.
 */

import { z } from "zod";
import { and, eq, gte } from "drizzle-orm";
import fp from "fastify-plugin";
import {
  funnelSpreadsheets,
  funnelStages,
  funnels,
  metaCampaignInsightsDaily,
  metaEntityNamesCache,
} from "../db/schema.js";
import { extractLPName } from "./lp-campaigns.js";
import { getSpreadsheetSheets, readSheetData } from "../services/google-sheets.js";
import {
  abasParaDescobrir,
  derivarPrefixos,
  ehNomeDePagina,
  labelDaAbaDescoberta,
  letrasDasFormas,
} from "../services/application-sheets.js";

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
  /** Nomes (aba + label) considerados, para a porta de entrada do AC5. */
  nomes: string[];
  /**
   * Por forma, os nomes que podem identificá-la como página (label e aba).
   *
   * É uma lista por forma, e não um conjunto achatado, porque o AC5 precisa
   * saber se ALGUMA forma ficou sem letra identificável — ver `lpsSemForma`.
   */
  identificadores: string[][];
}

interface FormSeries {
  sheetId: string;
  label: string;
  points: DailyPoint[];
  total: number;
}

export default fp(async function stageApplicationsRoutes(fastify) {
  /**
   * Lê TODAS as planilhas de aplicação de um funil e devolve, por planilha, a
   * contagem por data (calendário). O alinhamento em D-day é feito depois
   * (alignForms), no nível do lançamento.
   */
  async function rawFormsFor(funnelId: string): Promise<FormsResult> {
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

    if (!sheets.length) return { forms: [], avisos: [], nomes: [], identificadores: [] };

    const avisos: AvisoForma[] = [];

    /**
     * Conta as linhas de UMA aba. Devolve `null` (com aviso) em vez de forma
     * zerada quando a aba não dá para ler ou não tem a coluna de data — zerado
     * mente, dizendo "essa página não teve aplicação".
     */
    async function contar(
      sheetId: string,
      label: string,
      spreadsheetId: string,
      sheetName: string,
      dateCol: string | undefined,
    ): Promise<RawForm | null> {
      if (!dateCol) {
        avisos.push({ aba: sheetName, motivo: `a planilha "${label}" está sem coluna de data mapeada` });
        return null;
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
        return null;
      }

      const idx = data.headers.indexOf(dateCol);
      if (idx === -1) {
        avisos.push({ aba: sheetName, motivo: `a aba não tem a coluna "${dateCol}"` });
        return null;
      }

      const counts = new Map<string, number>();
      let total = 0;
      for (const row of data.rows) {
        const day = parseDay(row[idx]);
        // Linha sem data válida (arrasto no fim da planilha, célula em branco)
        // não entra: entraria como "hoje" e inflaria o último dia.
        if (!day) continue;
        counts.set(day, (counts.get(day) ?? 0) + 1);
        total++;
      }
      return { sheetId, label, sheetName, counts, total };
    }

    // ── Cadastradas ────────────────────────────────────────────────────────
    const cadastradas = await Promise.all(
      sheets.map((s) => contar(s.id, s.label, s.spreadsheetId, s.sheetName, s.columnMapping?.date)),
    );

    // ── Descobertas (AC1) ──────────────────────────────────────────────────
    // Varre cada arquivo já vinculado atrás de abas do mesmo grupo que ainda
    // não foram cadastradas. É o que faz uma página nova aparecer sozinha.
    const porArquivo = new Map<string, typeof sheets>();
    for (const s of sheets) {
      const lista = porArquivo.get(s.spreadsheetId) ?? [];
      lista.push(s);
      porArquivo.set(s.spreadsheetId, lista);
    }

    const descobertas: (RawForm | null)[] = [];
    for (const [spreadsheetId, doArquivo] of porArquivo) {
      const prefixos = derivarPrefixos(doArquivo.map((s) => s.sheetName));
      // Mapping herdado do grupo — as planilhas de um mesmo arquivo usam o mesmo
      // formulário, então as colunas coincidem. O AC2 exige validar antes de
      // contar: `contar()` já devolve aviso se a coluna não existir na aba nova.
      const dateColHerdada = doArquivo.find((s) => s.columnMapping?.date)?.columnMapping?.date;

      let abas: { title: string }[];
      try {
        abas = (await getSpreadsheetSheets(spreadsheetId)).sheets;
      } catch (error) {
        fastify.log.warn({ err: error, spreadsheetId }, "[43.1] falha ao listar abas");
        avisos.push({
          aba: spreadsheetId,
          motivo: "não foi possível listar as abas da planilha — páginas novas podem estar faltando no gráfico",
        });
        continue;
      }

      const alvos = abasParaDescobrir(
        abas.map((a) => a.title),
        doArquivo.map((s) => s.sheetName),
        prefixos,
      );
      // Em paralelo, como as cadastradas: em série, cada aba nova somava um
      // round-trip ao Google no primeiro carregamento — que é exatamente quando
      // o gestor está olhando a tela.
      descobertas.push(
        ...(await Promise.all(
          alvos.map(({ aba, prefixo }) =>
            contar(
              `descoberta:${spreadsheetId}:${aba}`,
              labelDaAbaDescoberta(aba, prefixo),
              spreadsheetId,
              aba,
              dateColHerdada,
            ),
          ),
        )),
      );
    }

    const forms = [...cadastradas, ...descobertas].filter((f): f is RawForm => f !== null);
    // Aba e label alimentam a porta de entrada do AC5: se NENHUM deles segue a
    // nomenclatura por página, este funil não fala a língua de "LPA/LPB" e o
    // aviso de LP órfã não faz sentido nele.
    const identificadores = forms.map((f) => [f.label, f.sheetName]);
    const nomes = identificadores.flat();
    return { forms, avisos, nomes, identificadores };
  }

  /**
   * Alinha todas as formas no MESMO eixo D-day: D1 = menor data com aplicação em
   * qualquer forma; a série vai até a maior data. Dias sem aplicação viram 0 (um
   * buraco no meio da curva é informação — fim de semana, campanha pausada) e
   * omiti-los distorceria o D-day dos dias seguintes.
   */
  function alignForms(forms: RawForm[]): FormSeries[] {
    const dates = new Set<string>();
    for (const f of forms) for (const k of f.counts.keys()) dates.add(k);
    const sorted = [...dates].sort();

    if (!sorted.length) {
      return forms.map((f) => ({ sheetId: f.sheetId, label: f.label, points: [], total: f.total }));
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
      return { sheetId: f.sheetId, label: f.label, points, total: f.total };
    });
  }

  /**
   * AC5 — LPs que estão rodando na Meta mas não têm forma no gráfico.
   *
   * Lê do BANCO, não da API da Meta: campanhas com investimento nos últimos 30
   * dias (evidência de entrega, mais confiável que um `effective_status` que
   * pode estar desatualizado) e o nome resolvido pelo cache de entidades.
   * Chamar `fetchAllAdInsights` aqui — como faz `lp-campaigns` — colocaria uma
   * requisição pesada à Meta no caminho de um gráfico aberto o dia inteiro,
   * exatamente o que o AC8 manda evitar.
   */
  async function lpsSemForma(
    projectId: string,
    nomes: string[],
    identificadores: string[][],
  ): Promise<string[]> {
    // Porta de entrada: funil que nomeia as formas por formulário ("form com
    // ticket") não fala a língua de LPA/LPB. Ali, "a LPA não tem aba" não
    // significa nada — e um aviso que aparece com tudo certo ensina o time a
    // ignorar avisos, matando o valor do AC4.
    if (!nomes.some(ehNomeDePagina)) return [];

    // Segunda guarda (QA-17). A aba-base de um grupo — a que não tem sufixo,
    // como `Pesquisa-Aplicacao-Comercial` — NÃO carrega letra nem no nome nem
    // no label quando vem pela descoberta. Ela é a "Página A" só por convenção
    // do time, e cravar essa convenção no código seria inventar semântica.
    //
    // Enquanto existir uma forma que não sabemos identificar, não dá para
    // afirmar que uma LP está órfã: essa forma pode ser exatamente a página em
    // questão. Silêncio aqui é um falso negativo; o contrário seria acusar erro
    // com a página na tela — a mesma armadilha que a porta de entrada acima
    // evita, e a única que o gate anterior deixou passar.
    const letras = letrasDasFormas(identificadores);
    if (letras === null) return [];
    const comForma = new Set(letras);

    const desde = new Date();
    desde.setDate(desde.getDate() - 30);
    const desdeStr = desde.toISOString().slice(0, 10);

    const ativas = await fastify.db
      .selectDistinct({ nome: metaEntityNamesCache.entityName })
      .from(metaCampaignInsightsDaily)
      .innerJoin(
        metaEntityNamesCache,
        and(
          eq(metaEntityNamesCache.projectId, metaCampaignInsightsDaily.projectId),
          eq(metaEntityNamesCache.entityId, metaCampaignInsightsDaily.campaignId),
          eq(metaEntityNamesCache.entityType, "campaign"),
        ),
      )
      .where(
        and(
          eq(metaCampaignInsightsDaily.projectId, projectId),
          gte(metaCampaignInsightsDaily.dateStart, desdeStr),
        ),
      );

    const faltando = new Set<string>();
    for (const { nome } of ativas) {
      const lp = extractLPName(nome); // REUSE — mesma definição da Story 18.44
      if (!lp) continue;
      const letra = lp.replace(/^LP/i, "").toUpperCase();
      if (!comForma.has(letra)) faltando.add(lp.toUpperCase());
    }
    return [...faltando].sort();
  }

  /** Soma todas as planilhas de aplicação de um lançamento numa forma única. */
  function aggregateForms(forms: RawForm[]): RawForm {
    const counts = new Map<string, number>();
    let total = 0;
    for (const f of forms) {
      for (const [k, v] of f.counts) counts.set(k, (counts.get(k) ?? 0) + v);
      total += f.total;
    }
    return { sheetId: "__total__", label: "Total", sheetName: "__total__", counts, total };
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

      const atualRaw = await rawFormsFor(funnelId);
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
            aggregateForms((await rawFormsFor(ctx.compareFunnelId)).forms),
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
        : await lpsSemForma(projectId, atualRaw.nomes, atualRaw.identificadores);

      return {
        funnelName: ctx.funnelName,
        compareFunnelName,
        semPlanilha,
        forms: atual.map((f) => ({
          sheetId: f.sheetId,
          label: f.label,
          total: f.total,
          points: f.points,
        })),
        comparison,
        currentTotal,
        deltaPercent,
        /** Story 43.1 — abas que ficaram de fora, e por quê (AC4). */
        avisos: atualRaw.avisos,
        /** Story 43.1 — LPs rodando na Meta sem forma no gráfico (AC5). */
        lpsOrfas,
      };
    },
  );
});
