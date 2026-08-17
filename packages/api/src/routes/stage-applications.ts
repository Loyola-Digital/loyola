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
 * A comparação com o lançamento anterior (`compareFunnelId`, configurado no
 * funil) é AGREGADA: total do lançamento contra total do anterior, via
 * `aggregateForms`. Não é casada forma a forma — o cabeçalho afirmou isso por
 * um tempo, mas o código nunca fez (corrigido na 43.6, QA-43.6-02). Agregar é
 * também o que mantém a comparação estável agora que uma planilha pode virar
 * várias séries.
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
  acharColunaUtmTerm,
  agruparPorPagina,
  derivarPrefixos,
  ehNomeDePagina,
  acharColunaEmail,
  acharColunaNome,
  labelDaAbaDescoberta,
  letraDaLpNoUtmTerm,
  letraDaPagina,
  type LinhaParaAgrupar,
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
  /**
   * Story 43.6 — a série corresponde a uma página CONHECIDA?
   *
   * `false` para a série "Sem página identificada" e para a aba-base que não
   * conseguiu quebrar. É o que impede o aviso de LP órfã de afirmar mais do que
   * se sabe: enquanto houver aplicação sem página, ela pode ser da LP acusada.
   */
  ehPagina: boolean;
  /** Story 43.6 — a página veio do `utm_term` (a aba-base foi quebrada)? */
  veioDoUtmTerm: boolean;
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
  /** Story 43.6 — letras das séries que SÃO página (base do aviso, AC5). */
  letrasComForma: string[];
  /** Story 43.6 — aplicações que não deu para atribuir a nenhuma página. */
  semPagina: number;
  /**
   * Story 43.6 (QA-43.6-01) — alguma série de página nasceu da quebra da
   * aba-base?
   *
   * É o gatilho da explicação na tela. Antes eu usava `semPagina > 0` para
   * isso, e o @qa mostrou o furo: uma aba-base pode quebrar em três páginas
   * sem sobrar nenhuma órfã — os números mudam igual e a tela ficava calada.
   * São dois sinais diferentes e cada um responde a sua pergunta.
   */
  quebrouPorUtmTerm: boolean;
}

interface FormSeries {
  sheetId: string;
  label: string;
  points: DailyPoint[];
  total: number;
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
   * Lê TODAS as planilhas de aplicação de um funil e devolve, por planilha, a
   * contagem por data (calendário). O alinhamento em D-day é feito depois
   * (alignForms), no nível do lançamento.
   */
  async function rawFormsFor(funnelId: string): Promise<FormsResult> {
    // Story 43.7: a descoberta vive em `resolverAbas` para que a lista de
    // aplicações leia exatamente o mesmo conjunto de abas que o gráfico.
    const { abas: abasResolvidas, avisos } = await resolverAbas(funnelId);

    if (!abasResolvidas.length)
      return {
        forms: [],
        avisos,
        nomes: [],
        identificadores: [],
        letrasComForma: [],
        semPagina: 0,
        quebrouPorUtmTerm: false,
      };

    /**
     * Conta as linhas de UMA aba e devolve as séries que ela produz.
     *
     * Story 43.6: uma aba pode virar VÁRIAS séries. A aba-base é o formulário
     * genérico onde caem todas as páginas sem aba própria, então quem decide a
     * página é o `utm_term` da linha, não o nome do arquivo. Aba com sufixo
     * (`…-PaginaB`) continua produzindo uma série só.
     *
     * Devolve `[]` (com aviso) em vez de série zerada quando a aba não dá para
     * ler ou não tem a coluna de data — zerado mente, dizendo "essa página não
     * teve aplicação".
     */
    async function contar(
      sheetId: string,
      label: string,
      spreadsheetId: string,
      sheetName: string,
      dateCol: string | undefined,
    ): Promise<RawForm[]> {
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

      // AC7: a coluna PREENCHIDA, não a primeira homônima — a aba-base do
      // `dg-pg04` tem três colunas `utm_term` e só uma com dado.
      const idxUtm = acharColunaUtmTerm(data.headers, data.rows);

      const linhas: LinhaParaAgrupar[] = [];
      for (const row of data.rows) {
        const day = parseDay(row[idx]);
        // Linha sem data válida (arrasto no fim da planilha, célula em branco)
        // não entra: entraria como "hoje" e inflaria o último dia.
        if (!day) continue;
        linhas.push({ dia: day, identificador: idxUtm === null ? "" : (row[idxUtm] ?? "") });
      }

      return agruparPorPagina(sheetName, label, linhas).map((g) => ({
        // Id composto para as séries não colidirem quando uma aba gera várias.
        sheetId: g.chave === "todas" ? sheetId : `${sheetId}::${g.chave}`,
        label: g.label,
        sheetName,
        ehPagina: g.ehPagina,
        veioDoUtmTerm: g.veioDoUtmTerm,
        counts: g.counts,
        total: g.total,
      }));
    }

    const forms = (
      await Promise.all(
        abasResolvidas.map((a) => contar(a.id, a.label, a.spreadsheetId, a.sheetName, a.dateCol)),
      )
    ).flat();

    // Aba e label alimentam a porta de entrada do AC5: se NENHUM deles segue a
    // nomenclatura por página, este funil não fala a língua de "LPA/LPB" e o
    // aviso de LP órfã não faz sentido nele.
    const identificadores = forms.map((f) => [f.label, f.sheetName]);
    const nomes = identificadores.flat();

    // Story 43.6 — a prova de que uma página TEM aplicação passa a ser a série
    // do gráfico, não o label cadastrado à mão. Era o label "PAGINA A" da
    // aba-base que anulava a guarda da 43.1 e fazia o aviso acusar LPC–LPI.
    const letrasComForma = [
      ...new Set(
        forms
          .filter((f) => f.ehPagina)
          .map((f) => letraDaPagina(f.label) ?? letraDaPagina(f.sheetName))
          .filter((l): l is string => l !== null),
      ),
    ];
    const semPagina = forms.filter((f) => !f.ehPagina).reduce((n, f) => n + f.total, 0);

    const quebrouPorUtmTerm = forms.some((f) => f.veioDoUtmTerm);

    return {
      forms,
      avisos,
      nomes,
      identificadores,
      letrasComForma,
      semPagina,
      quebrouPorUtmTerm,
    };
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
    letrasComForma: string[],
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
    // Story 43.6 — a prova de que uma página tem aplicação é a SÉRIE do gráfico,
    // não o label cadastrado no banco.
    //
    // Antes vinha de `letrasDasFormas(identificadores)`, que lia labels. A
    // guarda dela — devolver `null` quando alguma forma não tem letra — existia
    // justamente para calar o aviso na dúvida, e foi anulada no `dg-pg04` por
    // alguém ter cadastrado a aba-base com o label "PAGINA A". Ler as séries
    // resolve na origem: a aba-base agora se declara por linha, via `utm_term`.
    //
    // `letrasDasFormas` continua exportada e testada — segue valendo para quem
    // precise da pergunta antiga, e mudá-la não é escopo desta story.
    const comForma = new Set(letrasComForma);

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
    // `ehPagina: false` — o agregado é a soma de TODAS as páginas, então ele não
    // é página nenhuma. Só existe para o total da comparação entre lançamentos;
    // não entra no cálculo do aviso de LP órfã.
    return {
      sheetId: "__total__",
      label: "Total",
      sheetName: "__total__",
      ehPagina: false,
      veioDoUtmTerm: false,
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
        : await lpsSemForma(
            projectId,
            atualRaw.nomes,
            atualRaw.identificadores,
            atualRaw.letrasComForma,
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
        })),
        comparison,
        currentTotal,
        deltaPercent,
        /** Story 43.1 — abas que ficaram de fora, e por quê (AC4). */
        avisos: atualRaw.avisos,
        /** Story 43.1 — LPs rodando na Meta sem forma no gráfico (AC5). */
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
         * Story 43.6 — a tela deve explicar que os números mudaram de forma.
         *
         * Separado de `aplicacoesSemPagina` porque a quebra acontece com ou sem
         * órfãs, e foi confundir os dois que produziu o QA-43.6-01.
         */
        paginasVieramDoUtmTerm: atualRaw.quebrouPorUtmTerm,
      };
    },
  );

  /**
   * Story 43.7 — a lista das aplicações, linha a linha.
   *
   * O gráfico responde "quantas por dia, por página"; esta rota responde "quem
   * aplicou, e de que página veio". A LP sai do mesmo `utm_term` e pela mesma
   * função da 43.6 — se as duas telas discordassem sobre a página de uma
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
      const paramsResult = paramsSchema.safeParse(request.params);
      if (!paramsResult.success) {
        return reply.code(400).send({ error: "Parâmetros inválidos" });
      }
      const { funnelId } = paramsResult.data;

      const { abas, avisos } = await resolverAbas(funnelId);
      if (!abas.length) return { semPlanilha: true, aplicacoes: [], avisos };

      const aplicacoes = (
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
            const iUtm = acharColunaUtmTerm(data.headers, data.rows);

            // A aba com sufixo declara a página (mesma regra da 43.6): ali o
            // `utm_term` não sobrepõe o que o nome já disse.
            const letraDaAba = letraDaPagina(aba.sheetName);

            const out = [];
            for (const row of data.rows) {
              const dia = parseDay(row[iData]);
              if (!dia) continue;
              const utmTerm = iUtm === null ? "" : (row[iUtm] ?? "").trim();
              const letra = letraDaAba ?? letraDaLpNoUtmTerm(utmTerm);
              out.push({
                data: dia,
                nome: iNome === null ? "" : (row[iNome] ?? "").trim(),
                email: iEmail === null ? "" : (row[iEmail] ?? "").trim(),
                utmTerm,
                lp: letra ? `PAGINA ${letra}` : null,
                aba: aba.label,
              });
            }
            return out;
          }),
        )
      ).flat();

      // Mais recente primeiro. `parseDay` normaliza para aaaa-mm-dd, então a
      // ordem lexicográfica é a cronológica — sem custo de Date por linha.
      aplicacoes.sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0));

      return { semPlanilha: false, aplicacoes, avisos };
    },
  );
});
