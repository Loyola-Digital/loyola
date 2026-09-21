/**
 * Traz a agenda do Google para o Planner.
 *
 * Estava dentro da rota. Saiu porque agora tem dois chamadores: o botão
 * "Importar" da tela e o agendador que roda sozinho — e duas cópias da regra de
 * merge divergiriam no primeiro ajuste, com a versão automática apagando o que
 * a manual preserva.
 *
 * ## O que o merge protege
 *
 * Três grupos de fases, e cada um tem um dono diferente:
 *
 * - **Veio do Google** (`googleEventId`, sem pendência) — o Google manda. É
 *   atualizada a cada importação.
 * - **Feita à mão aqui** (sem `googleEventId`) — o Planner manda. A importação
 *   não encosta.
 * - **Editada aqui e não sincronizada** (`googleSyncPendente`) — o Planner
 *   manda, porque a versão local é mais nova que a do Google. Deixar o Google
 *   sobrescrever apagaria a edição de alguém sem aviso; é o risco que só
 *   aparece quando a importação passa a ser automática.
 */

import { eq } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { plannerCampaigns, plannerGoogleCalendars } from "../db/schema.js";
import { normalizarFase, type FaseDoPlanner } from "./planner.js";
import { chaveDoNome } from "../utils/chave-de-nome.js";
import {
  corParaCampanha,
  eventosDaAgenda,
  separarTitulo,
} from "./planner-google.js";

/**
 * O nome reduzido ao que identifica a campanha.
 *
 * Mora em `utils/chave-de-nome.ts` desde que o SendFlow passou a precisar dela
 * — uma segunda cópia começaria a divergir no primeiro ajuste. Re-exportada
 * aqui para quem já importava deste módulo.
 *
 * Medido nas agendas do time: unifica exatamente três pares, todos
 * inequívocos (`DG-PG02-MAR-26`/`DG-PG-02-MAR-26`, `BBE-PR2`/`BBEPR2`,
 * `BBE-Margem 3X`/`BBE Margem 3X`). Nenhuma campanha distinta colide.
 */
export { chaveDoNome };

/**
 * A fase, se o título começa com o nome INTEIRO da campanha. `null` se não.
 *
 * `separarTitulo` corta no primeiro hífen, e isso é ambíguo quando o nome da
 * campanha tem hífen: "DGL3 - BLACK CPDF - Prod. Captação" virava a campanha
 * "DGL3". Aqui o nome conhecido é que decide onde cortar.
 */
export function faseNoTitulo(titulo: string, nomeDaCampanha: string): string | null {
  const t = titulo.trim();
  const n = nomeDaCampanha.trim();
  if (!n || t.length <= n.length) return null;
  const inicio = t.slice(0, n.length + 2).toLowerCase();
  if (inicio === `[${n.toLowerCase()}]`) return t.slice(n.length + 2).trim() || n;
  if (t.slice(0, n.length).toLowerCase() !== n.toLowerCase()) return null;
  // O nome precisa acabar num separador: "PP" não é dona de "PPX - Fase".
  const resto = t.slice(n.length).match(/^\s+[-–—]\s+(.+)$/);
  return resto ? resto[1]!.trim() : null;
}

interface CampanhaExistente {
  id: string;
  name: string;
  googleCalendarId: string | null;
  phases: unknown;
}

/**
 * De qual campanha JÁ EXISTENTE é o evento. `null` = nenhuma.
 *
 * Em ordem: quem tem o vínculo (o id do evento numa fase), e depois quem tem o
 * nome inteiro no começo do título — o mais longo, para "PP - Perpétuo
 * Ansiedade" ganhar de "PP". Só vale campanha desta agenda: uma cópia antiga
 * apontava para eventos da agenda de outro expert.
 *
 * Existe porque o corte pelo primeiro hífen criava campanhas fantasmas com os
 * mesmos eventos da verdadeira (ver o teste `planner-dono-do-evento`).
 */
export function donoDoEvento<C extends CampanhaExistente>(
  evento: { id: string; titulo: string },
  campanhas: C[],
  calendarId: string,
): C | null {
  const daAgenda = campanhas.filter(
    (c) => !c.googleCalendarId || c.googleCalendarId === calendarId,
  );
  const temOTitulo = (c: C) => faseNoTitulo(evento.titulo, c.name) !== null;
  const maisLongoPrimeiro = (a: C, b: C) => b.name.length - a.name.length;

  const peloVinculo = daAgenda.filter((c) =>
    ((c.phases ?? []) as FaseDoPlanner[]).some((f) => f.googleEventId === evento.id),
  );
  if (peloVinculo.length > 0) {
    // Mais de uma com o mesmo id é cópia: a dona é a que o título aponta.
    return peloVinculo.filter(temOTitulo).sort(maisLongoPrimeiro)[0] ?? peloVinculo[0]!;
  }
  return daAgenda.filter(temOTitulo).sort(maisLongoPrimeiro)[0] ?? null;
}

/**
 * Fases "manuais" que na verdade são o mesmo evento que o Google está trazendo.
 *
 * ## O defeito que isto fecha
 *
 * A importação preserva toda fase SEM `googleEventId` (é do Planner) e soma
 * os eventos do Google por cima. Se uma fase perde o vínculo — criada aqui e o
 * id do evento não voltou, ou gravada de uma tela que não o tinha —, o evento
 * dela volta como fase NOVA e o card aparece duas vezes. Medido na BBEPR2
 * (18/09/2026): 4 fases duplicadas, o Google com os 6 eventos certos.
 *
 * Qualquer caminho que perca o vínculo acaba aqui, então é aqui que se fecha.
 *
 * ## Como reconhece
 *
 * 1. Pelo id: fase importada nasce com id `g` + começo do id do evento. Se
 *    ele bate, é o mesmo evento, mesmo com nome ou data mexidos.
 * 2. Por nome + início: fase criada aqui, cujo evento o Google criou mas o
 *    id se perdeu. Nome normalizado para "Prod. Captação" e "prod captacao"
 *    serem a mesma coisa.
 *
 * O Google fica com a versão dele: é o que o time vê na agenda e disse estar
 * certo. A órfã é a cópia que não chegou lá.
 */
export function semOrfas(
  preservadas: FaseDoPlanner[],
  doGoogle: FaseDoPlanner[],
): FaseDoPlanner[] {
  const idsDoGoogle = new Set(doGoogle.map((f) => f.id));
  const nomeEInicio = new Set(doGoogle.map((f) => `${chaveDoNome(f.name)}|${f.start}`));
  return preservadas.filter((f) => {
    // Pendente tem o vínculo e a versão boa: nunca é órfã.
    if (f.googleEventId) return true;
    if (idsDoGoogle.has(f.id)) return false;
    if (f.start && nomeEInicio.has(`${chaveDoNome(f.name)}|${f.start}`)) return false;
    return true;
  });
}

export interface ResultadoDaImportacao {
  lidos: number;
  ignoradosPorTerHora: number;
  campanhasCriadas: number;
  campanhasAtualizadas: number;
  fases: number;
}

export interface OpcoesDaImportacao {
  mesesAtras?: number;
  mesesAFrente?: number;
  /** Evento com HORA é reunião, não fase — fica de fora por padrão. */
  incluirComHora?: boolean;
  /** Quem fica como autor das campanhas criadas. `null` no agendador. */
  criadoPor?: string | null;
}

/** Uma cor por campanha, na ordem da paleta do Planner. */
export type Paleta = readonly string[];

export async function importarDaAgenda(
  db: Database,
  calendarId: string,
  paleta: Paleta,
  opcoes: OpcoesDaImportacao = {},
): Promise<ResultadoDaImportacao> {
  const mesesAtras = opcoes.mesesAtras ?? 6;
  const mesesAFrente = opcoes.mesesAFrente ?? 12;

  const de = new Date();
  de.setMonth(de.getMonth() - mesesAtras);
  const ate = new Date();
  ate.setMonth(ate.getMonth() + mesesAFrente);

  const eventos = await eventosDaAgenda(calendarId, de, ate);
  const aproveitados = eventos.filter(
    (e) => opcoes.incluirComHora || !e.temHora,
  );
  // Antes de agrupar: a dona de cada evento sai das campanhas que já existem.
  const existentes = await db.select().from(plannerCampaigns);
  /** Campanha existente de cada grupo, quando o grupo é dela. */
  const donaDoGrupo = new Map<string, (typeof existentes)[number]>();

  // Agrupa por campanha ANTES de tocar no banco: assim cada campanha é uma
  // escrita só, e não uma por fase.
  const porCampanha = new Map<string, FaseDoPlanner[]>();
  /**
   * A cor que a campanha tem NO GOOGLE.
   *
   * Vale a do primeiro evento que trouxe cor própria. Uma campanha com eventos
   * de cores diferentes existe — alguém pintou uma fase de vermelho para
   * destacar — mas a campanha tem UMA cor aqui, e a primeira é a mais estável:
   * os eventos vêm ordenados por data, então é a cor com que a campanha
   * começou, não a da última fase que alguém mexeu.
   */
  const corDaCampanha = new Map<string, string>();

  for (const e of aproveitados) {
    const dona = donoDoEvento(e, existentes, calendarId);
    const { campanha, fase } = dona
      ? {
          campanha: dona.name,
          fase: faseNoTitulo(e.titulo, dona.name) ?? separarTitulo(e.titulo).fase,
        }
      : separarTitulo(e.titulo);
    // O grupo da dona é pelo ID: duas campanhas com o mesmo nome existem
    // (há duas "PP - Perpétuo Ansiedade"), e pelo nome as duas se misturariam.
    const chave = dona ? `id:${dona.id}` : campanha || "Agenda";
    if (dona) donaDoGrupo.set(chave, dona);
    const lista = porCampanha.get(chave) ?? [];
    lista.push({
      id: `g${e.id.slice(0, 24)}`,
      name: fase,
      start: e.inicio,
      end: e.fim,
      googleEventId: e.id,
    });
    porCampanha.set(chave, lista);
    if (e.cor && !corDaCampanha.has(chave)) corDaCampanha.set(chave, e.cor);
  }

  let criadas = 0;
  let atualizadas = 0;
  let fasesTocadas = 0;

  for (const [chave, fasesDoGoogle] of porCampanha) {
    const atual =
      donaDoGrupo.get(chave) ??
      existentes.find((c) => chaveDoNome(c.name) === chaveDoNome(chave));
    const nome = chave;

    if (!atual) {
      await db.insert(plannerCampaigns).values({
        name: nome,
        /*
         * A cor do Google manda quando existe.
         *
         * `colorId` só vem quando alguém pintou o evento à mão lá — e quem
         * pintou já decidiu a cor daquele lançamento. Sobrescrever com um
         * palpite derivado do nome desfaria essa decisão, e as duas telas
         * voltariam a mostrar o mesmo lançamento de cores diferentes.
         *
         * Sem cor no evento, segue o sorteio estável por nome: o evento herdou
         * a cor do calendário, que a service account não enxerga.
         */
        color: corDaCampanha.get(nome) ?? corParaCampanha(nome, paleta),
        // A agenda de ORIGEM vira a de destino: o que for editado aqui depois
        // volta para o mesmo lugar de onde veio.
        googleCalendarId: calendarId,
        sortOrder: existentes.length + criadas,
        phases: fasesDoGoogle.map(normalizarFase),
        createdBy: opcoes.criadoPor ?? null,
      });
      criadas += 1;
      fasesTocadas += fasesDoGoogle.length;
      continue;
    }

    const fases = atual.phases as FaseDoPlanner[];

    // Ver o cabeçalho: manuais e pendentes ficam; o resto o Google manda.
    // `semOrfas` tira a fase que perdeu o vínculo mas é o MESMO evento que o
    // Google está devolvendo — sem isso, ela e o evento viravam dois cards.
    const preservadas = semOrfas(
      fases.filter((f) => !f.googleEventId || f.googleSyncPendente),
      fasesDoGoogle,
    );
    const pendentes = new Set(
      fases
        .filter((f) => f.googleSyncPendente && f.googleEventId)
        .map((f) => f.googleEventId),
    );
    const antesPorEvento = new Map(
      fases
        .filter((f) => f.googleEventId)
        .map((f) => [f.googleEventId as string, f]),
    );

    const novas = fasesDoGoogle
      .filter((f) => !pendentes.has(f.googleEventId))
      .map((f) => {
        // Preserva o id da fase quando ela já existia: a seleção na tela e o
        // desfazer apontam para ele.
        const antes = antesPorEvento.get(f.googleEventId!);
        return normalizarFase(antes ? { ...f, id: antes.id } : f);
      });

    await db
      .update(plannerCampaigns)
      .set({
        phases: [...preservadas, ...novas],
        // Campanha importada antes de a escrita existir não tinha agenda
        // gravada. A primeira reimportação preenche, e ela passa a espelhar.
        ...(atual.googleCalendarId ? {} : { googleCalendarId: calendarId }),
        updatedAt: new Date(),
      })
      .where(eq(plannerCampaigns.id, atual.id));
    atualizadas += 1;
    fasesTocadas += novas.length;
  }

  await db
    .update(plannerGoogleCalendars)
    .set({ lastImportedAt: new Date() })
    .where(eq(plannerGoogleCalendars.calendarId, calendarId));

  return {
    lidos: eventos.length,
    // A diferença entre lidos e importados é informação: dizer só "importei 20"
    // esconderia as reuniões que ficaram de fora de propósito.
    ignoradosPorTerHora: eventos.length - aproveitados.length,
    campanhasCriadas: criadas,
    campanhasAtualizadas: atualizadas,
    fases: fasesTocadas,
  };
}

/**
 * Tenta de novo as fases cuja escrita no Google falhou.
 *
 * Roda ANTES de cada importação automática, e a ordem é o ponto: a fase
 * pendente tem a versão boa aqui e a velha lá. Importar primeiro traria a
 * velha; reenviar primeiro faz as duas pontas concordarem, e aí a importação
 * que vem em seguida não tem nada para desfazer.
 *
 * É a retomada inteira do mecanismo — sem fila, sem tabela de trabalho, sem
 * repique exponencial. A marca na fase é o estado, e o próximo ciclo é a
 * tentativa seguinte.
 */
export async function reenviarPendentes(
  db: Database,
  escrever: (
    calendarId: string,
    eventId: string,
    fase: { titulo: string; inicio: string; fim: string },
  ) => Promise<string>,
  titulo: (campanha: string, fase: string) => string,
): Promise<{ tentadas: number; resolvidas: number }> {
  const campanhas = await db.select().from(plannerCampaigns);
  let tentadas = 0;
  let resolvidas = 0;

  for (const c of campanhas) {
    const fases = c.phases as FaseDoPlanner[];
    if (!c.googleCalendarId || !fases.some((f) => f.googleSyncPendente))
      continue;

    let mudou = false;
    const novas = [...fases];

    for (let i = 0; i < novas.length; i++) {
      const f = novas[i]!;
      if (!f.googleSyncPendente || !f.googleEventId || !f.start) continue;
      tentadas++;
      try {
        const id = await escrever(c.googleCalendarId, f.googleEventId, {
          titulo: titulo(c.name, f.name),
          inicio: f.start,
          fim: f.end,
        });
        // Remove `googleSyncPendente` do objeto sem criar a variável de
        // descarte que o `no-unused-vars` reprova.
        const limpa = { ...f };
        delete (limpa as { googleSyncPendente?: unknown }).googleSyncPendente;
        novas[i] = { ...limpa, googleEventId: id };
        resolvidas++;
        mudou = true;
      } catch {
        // Continua pendente. O ciclo seguinte tenta de novo; não há o que
        // registrar aqui que o próximo minuto não descubra sozinho.
      }
    }

    if (mudou) {
      await db
        .update(plannerCampaigns)
        .set({ phases: novas, updatedAt: new Date() })
        .where(eq(plannerCampaigns.id, c.id));
    }
  }

  return { tentadas, resolvidas };
}
