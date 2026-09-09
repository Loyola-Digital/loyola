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
import {
  corParaCampanha,
  eventosDaAgenda,
  separarTitulo,
} from "./planner-google.js";

/**
 * O nome reduzido ao que identifica a campanha.
 *
 * `BBE-Margem 3X`, `BBE Margem 3X` e `BBEMargem3X` são a MESMA campanha
 * escrita por três pessoas diferentes. Casar por nome literal criava uma
 * campanha nova a cada variação — e com a importação automática isso deixa de
 * ser um incômodo ocasional e vira uma cópia por hífen digitado.
 *
 * Medido nas agendas do time: unifica exatamente três pares, todos
 * inequívocos (`DG-PG02-MAR-26`/`DG-PG-02-MAR-26`, `BBE-PR2`/`BBEPR2`,
 * `BBE-Margem 3X`/`BBE Margem 3X`). Nenhuma campanha distinta colide.
 */
export function chaveDoNome(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
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
    const { campanha, fase } = separarTitulo(e.titulo);
    const chave = campanha || "Agenda";
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

  const existentes = await db.select().from(plannerCampaigns);
  let criadas = 0;
  let atualizadas = 0;
  let fasesTocadas = 0;

  for (const [nome, fasesDoGoogle] of porCampanha) {
    const atual = existentes.find(
      (c) => chaveDoNome(c.name) === chaveDoNome(nome),
    );

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
    const preservadas = fases.filter(
      (f) => !f.googleEventId || f.googleSyncPendente,
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
