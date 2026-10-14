/**
 * Alertas de funil: a regra olha o número do BI e avisa quando ele sai da faixa.
 *
 * Três decisões moram aqui, e cada uma existe para o alerta não virar spam:
 *
 * 1. **O número vem do BI, não de SQL próprio.** Cada métrica vira uma
 *    `QuerySpec` e roda no `executarQuery`. O alerta e o painel mostram o mesmo
 *    valor — a alternativa é uma segunda conta que diverge com o tempo e
 *    ninguém sabe qual está certa.
 * 2. **Gasto mínimo antes de julgar.** Campanha com R$ 12 no dia tem ROAS zero
 *    quase sempre; sem o piso o alerta dispara todo dia e a pessoa desliga tudo.
 * 3. **Um aviso por regra por dia** (`last_sent_date`, dia de São Paulo). Mesmo
 *    molde do alerta de pagamento: rodar o ciclo várias vezes é inofensivo, o
 *    que cobre restart e deploy.
 */

import { eq, inArray, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { alertRuleState, alertRules, notificationFollows, projects } from "../db/schema.js";
import { executarQuery, querySpecSchema, type QuerySpec } from "./bi/query.js";
import { enviarPush } from "./push.js";

const SP = "America/Sao_Paulo";

/** Data local de São Paulo como aaaa-mm-dd (o container roda em UTC). */
export function hojeSaoPaulo(agora = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SP,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(agora);
}

export function horaSaoPaulo(agora = new Date()): number {
  return Number(
    new Intl.DateTimeFormat("en-US", { timeZone: SP, hour: "numeric", hour12: false }).format(agora),
  );
}

/** `dias` dias atrás, em data de São Paulo. */
function diasAtras(dias: number, agora = new Date()): string {
  return hojeSaoPaulo(new Date(agora.getTime() - dias * 86_400_000));
}

/** `dias` dias antes de uma data aaaa-mm-dd, sem passar por fuso. */
export function antesDe(dia: string, dias: number): string {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

export const METRICAS = ["connect_rate", "roas", "investiu_sem_vender"] as const;
export type Metrica = (typeof METRICAS)[number];

export const ROTULO_DA_METRICA: Record<Metrica, string> = {
  connect_rate: "Connect rate",
  roas: "ROAS",
  investiu_sem_vender: "Investiu e não vendeu",
};

/**
 * A `QuerySpec` de cada métrica.
 *
 * `trafego` e `faturamento` são entidades diferentes de propósito: o connect
 * rate é só de mídia, enquanto ROAS cruza faturamento com investimento — e é a
 * entidade `faturamento` que sabe fazer esse cruzamento.
 *
 * CPL ficou de fora: `trafego.cpl_geral` existe no catálogo mas o executor
 * recusa ("Ainda não sei calcular"), porque depende do cruzamento lead↔criativo.
 */
function specDaMetrica(metrica: Metrica, de: string, ate: string): QuerySpec {
  const janela = (campo: string) => ({
    [campo]: { operator: "$between" as const, value: [de, ate] },
  });
  if (metrica === "connect_rate") {
    return querySpecSchema.parse({
      entity: "trafego",
      metrics: ["trafego.connect_rate", "trafego.spend"],
      filters: janela("trafego.date"),
    });
  }
  return querySpecSchema.parse({
    entity: "faturamento",
    metrics: ["faturamento.roas", "faturamento.investimento", "faturamento.bruto"],
    filters: janela("faturamento.date"),
  });
}

export interface Leitura {
  /** O valor que a regra julga. `null` = sem dado na janela. */
  valor: number | null;
  gasto: number;
  faturamento: number | null;
}

/**
 * O último dia que a série de vendas do projeto cobre.
 *
 * A série é de dias FECHADOS: o dia corrente nunca está lá (medido em
 * 14/10/2026 — cache recalculado às 20:45 e último dia 13/10 nos quatro
 * projetos). Só que o INVESTIMENTO vem do tráfego, que é intraday — então
 * "hoje" devolve gasto real e faturamento zero, e um alerta de ROAS com janela
 * de hoje dispararia todo dia sem que nada estivesse errado.
 *
 * Zero não é ausência. É por isso que a janela das métricas de faturamento
 * para aqui.
 */
export async function ultimoDiaComVenda(
  db: FastifyInstance["db"],
  projectId: string,
): Promise<string | null> {
  const r = await db.execute(sql`
    SELECT MAX(d->>'date') AS dia
    FROM public_metrics_cache pmc,
         LATERAL jsonb_array_elements(pmc.payload->'byDay') d
    WHERE pmc.scope = 'sales-daily'
      AND pmc.project_id = ${projectId}::uuid
      AND jsonb_typeof(pmc.payload->'byDay') = 'array'
  `);
  const linhas = (r as unknown as { rows?: Array<{ dia: string | null }> }).rows ?? [];
  return linhas[0]?.dia ?? null;
}

export async function lerMetrica(
  db: FastifyInstance["db"],
  projectId: string,
  metrica: Metrica,
  janelaDias: number,
  agora = new Date(),
): Promise<Leitura> {
  const hoje = hojeSaoPaulo(agora);
  let ate = hoje;
  let de = janelaDias <= 1 ? hoje : diasAtras(janelaDias - 1, agora);

  if (metrica !== "connect_rate") {
    // A janela de faturamento é ancorada no último dia FECHADO, não em hoje:
    // janela 1 = esse dia, janela 7 = os sete até ele. Ancorar em hoje faria
    // a janela de 1 dia nunca ter dado nenhum, e a de 7 dias misturar seis
    // dias reais com um dia de venda zero.
    const ultimo = await ultimoDiaComVenda(db, projectId);
    if (!ultimo) return { valor: null, gasto: 0, faturamento: null };
    ate = ultimo;
    de = janelaDias <= 1 ? ultimo : antesDe(ultimo, janelaDias - 1);
  }

  // `as never` é o mesmo que as rotas do BI fazem: o executor declara um `Db`
  // estrutural mínimo que o tipo do Drizzle não satisfaz nominalmente.
  const r = await executarQuery(specDaMetrica(metrica, de, ate), {
    db: db as never,
    projectIds: [projectId],
  });
  const linha = r.rows[0] ?? {};
  const num = (k: string) => {
    const v = linha[k];
    return typeof v === "number" ? v : v == null ? null : Number(v);
  };

  if (metrica === "connect_rate") {
    return {
      valor: num("trafego.connect_rate"),
      gasto: num("trafego.spend") ?? 0,
      faturamento: null,
    };
  }
  const gasto = num("faturamento.investimento") ?? 0;
  const bruto = num("faturamento.bruto");
  return {
    // "Investiu e não vendeu" julga o FATURAMENTO contra zero; ROAS, a razão.
    valor: metrica === "roas" ? num("faturamento.roas") : bruto,
    gasto,
    faturamento: bruto,
  };
}

export interface Regra {
  id: string;
  /** Nulo = vale para todos os projetos que alguém siga. */
  projectId: string | null;
  metrica: string;
  comparador: string;
  valor: string;
  gastoMinimo: string | null;
  janelaDias: number;
}

export interface Veredito {
  estourou: boolean;
  /** Por que não disparou — serve ao "testar agora" da tela, não ao log. */
  motivo?: "sem_dado" | "gasto_abaixo_do_piso" | "dentro_da_faixa" | "ja_avisou_hoje";
  leitura: Leitura;
}

/**
 * `ultimoAviso` é o dia do último disparo DESTA regra NESTE projeto — a mesma
 * regra global dispara em projetos diferentes, e guardar o dia na regra
 * calaria todos os outros depois do primeiro aviso.
 */
export function julgar(
  regra: Regra,
  leitura: Leitura,
  hoje: string,
  ultimoAviso: string | null = null,
): Veredito {
  if (ultimoAviso === hoje) return { estourou: false, motivo: "ja_avisou_hoje", leitura };
  // O piso de gasto vem primeiro: sem ele, dia que mal começou dispara tudo.
  const piso = regra.gastoMinimo == null ? null : Number(regra.gastoMinimo);
  if (piso != null && leitura.gasto < piso) {
    return { estourou: false, motivo: "gasto_abaixo_do_piso", leitura };
  }
  if (leitura.valor == null) return { estourou: false, motivo: "sem_dado", leitura };

  const limiar = Number(regra.valor);
  const estourou =
    regra.metrica === "investiu_sem_vender"
      ? // Aqui o `valor` da regra é o gasto que torna o silêncio grave, e o que
        // se julga é o faturamento: gastou isso e não entrou nada.
        leitura.gasto >= limiar && (leitura.faturamento ?? 0) <= 0
      : regra.comparador === "menor"
        ? leitura.valor < limiar
        : leitura.valor > limiar;

  return estourou
    ? { estourou: true, leitura }
    : { estourou: false, motivo: "dentro_da_faixa", leitura };
}

const dinheiro = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/** O texto que chega na tela do celular. Curto: é notificação, não relatório. */
export function textoDoAlerta(
  regra: Regra,
  leitura: Leitura,
  nomeDoProjeto: string,
): { titulo: string; corpo: string } {
  // Faturamento só existe por dia fechado — dizer "hoje" num alerta de ROAS
  // mandaria a pessoa procurar na tela um número que ainda não existe.
  const umDia = regra.metrica === "connect_rate" ? "hoje" : "no último dia fechado";
  const janela = regra.janelaDias <= 1 ? umDia : `nos últimos ${regra.janelaDias} dias`;
  if (regra.metrica === "investiu_sem_vender") {
    return {
      titulo: `${nomeDoProjeto}: ${dinheiro(leitura.gasto)} sem venda`,
      corpo: `Investimento ${janela} e nenhum faturamento registrado.`,
    };
  }
  if (regra.metrica === "connect_rate") {
    const pct = ((leitura.valor ?? 0) * 100).toFixed(1).replace(".", ",");
    const alvo = (Number(regra.valor) * 100).toFixed(0);
    return {
      titulo: `${nomeDoProjeto}: connect rate em ${pct}%`,
      corpo: `Abaixo de ${alvo}% ${janela}, com ${dinheiro(leitura.gasto)} investidos.`,
    };
  }
  const roas = (leitura.valor ?? 0).toFixed(2).replace(".", ",");
  return {
    titulo: `${nomeDoProjeto}: ROAS em ${roas}`,
    corpo: `${dinheiro(leitura.gasto)} investidos ${janela} e ${dinheiro(leitura.faturamento ?? 0)} de faturamento.`,
  };
}

export interface ResumoDoCiclo {
  regrasAvaliadas: number;
  alertasEnviados: number;
  erros: string[];
}

/** Quem pediu para receber notificação deste projeto. */
export async function seguidoresDoProjeto(
  db: FastifyInstance["db"],
  projectId: string,
): Promise<string[]> {
  const linhas = await db
    .select({ userId: notificationFollows.userId })
    .from(notificationFollows)
    .where(eq(notificationFollows.projectId, projectId));
  return linhas.map((l) => l.userId);
}

/**
 * Um ciclo: avalia as regras ativas e dispara o que estourou.
 *
 * Nunca lança — erro numa regra (projeto sem dado de mídia, por exemplo) não
 * pode impedir as outras de rodar.
 */
export async function rodarAlertas(fastify: FastifyInstance): Promise<ResumoDoCiclo> {
  const hoje = hojeSaoPaulo();
  const resumo: ResumoDoCiclo = { regrasAvaliadas: 0, alertasEnviados: 0, erros: [] };

  const regras = await fastify.db.select().from(alertRules).where(eq(alertRules.ativo, true));
  if (regras.length === 0) return resumo;

  // Projeto sem ninguém seguindo não é avaliado: a consulta de BI custaria para
  // um alerta que não teria destinatário.
  const seguidos = await fastify.db
    .select({ projectId: notificationFollows.projectId })
    .from(notificationFollows);
  const comSeguidor = [...new Set(seguidos.map((s) => s.projectId))];
  if (comSeguidor.length === 0) return resumo;

  const nomes = new Map(
    (
      await fastify.db
        .select({ id: projects.id, name: projects.name })
        .from(projects)
        .where(inArray(projects.id, comSeguidor))
    ).map((p) => [p.id, p.name]),
  );

  const estados = new Map(
    (await fastify.db.select().from(alertRuleState)).map((e) => [
      `${e.ruleId}|${e.projectId}`,
      e.lastSentDate,
    ]),
  );

  // Uma leitura por (projeto, métrica, janela): regra global e regra de projeto
  // costumam perguntar a mesma coisa, e cada pergunta é uma consulta de BI.
  const lidas = new Map<string, Leitura>();

  for (const regra of regras) {
    // Regra sem projeto vale em todo projeto que alguém siga.
    const alvos = regra.projectId ? [regra.projectId] : comSeguidor;

    for (const projectId of alvos) {
      if (!nomes.has(projectId)) continue;
      resumo.regrasAvaliadas += 1;
      try {
        if (estados.get(`${regra.id}|${projectId}`) === hoje) continue;

        const chave = `${projectId}|${regra.metrica}|${regra.janelaDias}`;
        if (!lidas.has(chave)) {
          lidas.set(
            chave,
            await lerMetrica(fastify.db, projectId, regra.metrica as Metrica, regra.janelaDias),
          );
        }
        const leitura = lidas.get(chave)!;
        if (!julgar(regra as Regra, leitura, hoje, null).estourou) continue;

        const seguidores = await seguidoresDoProjeto(fastify.db, projectId);
        if (seguidores.length === 0) continue;

        const texto = textoDoAlerta(regra as Regra, leitura, nomes.get(projectId) ?? "Projeto");
        await enviarPush(fastify, seguidores, {
          ...texto,
          url: `/projects/${projectId}`,
          // Tag por regra E projeto: alerta novo substitui o anterior do mesmo
          // par na bandeja, mas não engole o de outro projeto.
          tag: `alerta-${regra.id}-${projectId}`,
        });

        // Marca mesmo que o push falhe para todo mundo: o alerta é um aviso,
        // não uma entrega garantida, e insistir no mesmo dia é o que vira spam.
        await fastify.db
          .insert(alertRuleState)
          .values({ ruleId: regra.id, projectId, lastSentDate: hoje })
          .onConflictDoUpdate({
            target: [alertRuleState.ruleId, alertRuleState.projectId],
            set: { lastSentDate: hoje, updatedAt: new Date() },
          });
        resumo.alertasEnviados += 1;
      } catch (err) {
        resumo.erros.push(
          `${regra.id}/${projectId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  return resumo;
}
