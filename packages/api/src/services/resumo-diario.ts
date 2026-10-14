/**
 * O resumo diário dos funis, entregue como uma notificação só.
 *
 * É o contrário do alerta: o alerta fala quando algo saiu da faixa, o resumo
 * fala sempre — então ele é a parte que mais facilmente vira spam. Três
 * decisões vêm daí:
 *
 * 1. **É o dia de ONTEM, fechado.** Às 8h o dia de hoje está vazio; resumo de
 *    zeros é pior que resumo nenhum.
 * 2. **Uma notificação por pessoa**, com todos os projetos que ela segue
 *    dentro — não uma por projeto.
 * 3. **Dia parado não vira push.** Sem investimento e sem faturamento em
 *    nenhum projeto seguido, o resumo não sai: fim de semana de agência
 *    mandaria "R$ 0 → R$ 0" todo domingo, e é assim que a pessoa desliga.
 */

import { eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { notificationFollows, notificationPrefs, projects } from "../db/schema.js";
import { executarQuery, querySpecSchema } from "./bi/query.js";
import { enviarPush } from "./push.js";
import { hojeSaoPaulo, horaSaoPaulo, ultimoDiaComVenda } from "./alertas-de-funil.js";

const HORA_PADRAO = 8;

/** O dia de ontem em São Paulo (aaaa-mm-dd). */
export function ontemSaoPaulo(agora = new Date()): string {
  return hojeSaoPaulo(new Date(agora.getTime() - 86_400_000));
}

export interface LinhaDoResumo {
  projectId: string;
  nome: string;
  investimento: number;
  faturamento: number;
  roas: number | null;
}

/** Investimento, faturamento e ROAS de um projeto num dia. */
export async function lerDoDia(
  db: FastifyInstance["db"],
  projectId: string,
  dia: string,
): Promise<Omit<LinhaDoResumo, "projectId" | "nome">> {
  const spec = querySpecSchema.parse({
    entity: "faturamento",
    metrics: ["faturamento.investimento", "faturamento.bruto", "faturamento.roas"],
    filters: { "faturamento.date": { operator: "$between", value: [dia, dia] } },
  });
  const r = await executarQuery(spec, { db: db as never, projectIds: [projectId] });
  const linha = r.rows[0] ?? {};
  const num = (k: string) => {
    const v = linha[k];
    return typeof v === "number" ? v : v == null ? null : Number(v);
  };
  return {
    investimento: num("faturamento.investimento") ?? 0,
    faturamento: num("faturamento.bruto") ?? 0,
    roas: num("faturamento.roas"),
  };
}

const curto = (n: number) =>
  n >= 1000 ? `R$ ${(n / 1000).toFixed(1).replace(".", ",")}k` : `R$ ${n.toFixed(0)}`;

/**
 * O texto do resumo. Cabe numa notificação: título com o total, corpo com os
 * projetos — e, passando de quatro, só os maiores por investimento, porque o
 * sistema operacional corta o resto sem avisar.
 */
export function textoDoResumo(linhas: LinhaDoResumo[]): { titulo: string; corpo: string } {
  const investimento = linhas.reduce((s, l) => s + l.investimento, 0);
  const faturamento = linhas.reduce((s, l) => s + l.faturamento, 0);
  const geral = investimento > 0 ? faturamento / investimento : null;

  const ordenadas = [...linhas].sort((a, b) => b.investimento - a.investimento);
  const mostradas = ordenadas.slice(0, 4);
  const sobra = ordenadas.length - mostradas.length;

  const corpo = mostradas
    .map((l) => {
      const roas = l.roas == null ? "—" : `${l.roas.toFixed(2).replace(".", ",")}×`;
      return `${l.nome}: ${curto(l.investimento)} → ${curto(l.faturamento)} (${roas})`;
    })
    .concat(sobra > 0 ? [`e mais ${sobra} ${sobra === 1 ? "projeto" : "projetos"}`] : [])
    .join("\n");

  return {
    titulo: `Ontem: ${curto(investimento)} → ${curto(faturamento)}${
      geral == null ? "" : ` (${geral.toFixed(2).replace(".", ",")}×)`
    }`,
    corpo,
  };
}

export interface ResumoDoEnvio {
  pessoasConsideradas: number;
  resumosEnviados: number;
  erros: string[];
}

/**
 * Manda o resumo para quem ainda não recebeu hoje e já passou da hora dela.
 *
 * Nunca lança: erro de um projeto não pode calar o resumo das outras pessoas.
 */
export async function rodarResumoDiario(fastify: FastifyInstance): Promise<ResumoDoEnvio> {
  const hoje = hojeSaoPaulo();
  const ontem = ontemSaoPaulo();
  const hora = horaSaoPaulo();
  const saida: ResumoDoEnvio = { pessoasConsideradas: 0, resumosEnviados: 0, erros: [] };

  // Quem segue algum projeto é quem recebe. Linha de preferência é opcional:
  // sem ela valem os padrões, senão só receberia quem abriu a tela.
  const seguidores = await fastify.db
    .select({ userId: notificationFollows.userId, projectId: notificationFollows.projectId })
    .from(notificationFollows);
  if (seguidores.length === 0) return saida;

  const prefs = new Map(
    (await fastify.db.select().from(notificationPrefs)).map((p) => [p.userId, p]),
  );

  const porPessoa = new Map<string, string[]>();
  for (const s of seguidores) {
    porPessoa.set(s.userId, [...(porPessoa.get(s.userId) ?? []), s.projectId]);
  }

  const nomes = new Map(
    (
      await fastify.db
        .select({ id: projects.id, name: projects.name })
        .from(projects)
        .where(inArray(projects.id, [...new Set(seguidores.map((s) => s.projectId))]))
    ).map((p) => [p.id, p.name]),
  );

  // Uma leitura por projeto, não por pessoa: dois gestores do mesmo projeto não
  // devem custar duas consultas de BI.
  // `null` = a série de vendas do projeto ainda não alcançou ontem.
  const lidos = new Map<string, Omit<LinhaDoResumo, "projectId" | "nome"> | null>();

  for (const [userId, projetos] of porPessoa) {
    const pref = prefs.get(userId);
    if (pref && !pref.resumoAtivo) continue;
    if (pref?.lastDigestDate === hoje) continue;
    if (hora < (pref?.horaDoResumo ?? HORA_PADRAO)) continue;
    saida.pessoasConsideradas += 1;

    try {
      const linhas: LinhaDoResumo[] = [];
      for (const projectId of projetos) {
        if (!lidos.has(projectId)) {
          // Projeto cuja série de vendas ainda não alcançou ontem fica FORA do
          // resumo. O investimento vem do tráfego e chegaria sozinho, e a
          // linha diria "R$ 1,9k → R$ 0", que é falso: é ausência, não zero.
          const ultimo = await ultimoDiaComVenda(fastify.db, projectId);
          lidos.set(
            projectId,
            ultimo && ultimo >= ontem ? await lerDoDia(fastify.db, projectId, ontem) : null,
          );
        }
        const lido = lidos.get(projectId);
        if (!lido) continue;
        linhas.push({ projectId, nome: nomes.get(projectId) ?? "Projeto", ...lido });
      }

      const parado =
        linhas.length === 0 || linhas.every((l) => l.investimento === 0 && l.faturamento === 0);
      if (parado) {
        // Marca assim mesmo: senão o ciclo das 8h30 tentaria de novo, e de novo,
        // o dia inteiro, gastando consulta de BI por nada.
        await marcarEnviado(fastify, userId, hoje);
        continue;
      }

      await enviarPush(fastify, [userId], {
        ...textoDoResumo(linhas),
        url: "/bi",
        // Tag fixa: o resumo de hoje substitui o de ontem na bandeja.
        tag: "resumo-diario",
      });
      await marcarEnviado(fastify, userId, hoje);
      saida.resumosEnviados += 1;
    } catch (err) {
      saida.erros.push(`${userId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return saida;
}

async function marcarEnviado(
  fastify: FastifyInstance,
  userId: string,
  dia: string,
): Promise<void> {
  await fastify.db
    .insert(notificationPrefs)
    .values({ userId, lastDigestDate: dia })
    .onConflictDoUpdate({
      target: notificationPrefs.userId,
      set: { lastDigestDate: dia, updatedAt: new Date() },
    });
}

/** As preferências desta pessoa, com os padrões quando não há linha. */
export async function lerPreferencias(fastify: FastifyInstance, userId: string) {
  const [p] = await fastify.db
    .select()
    .from(notificationPrefs)
    .where(eq(notificationPrefs.userId, userId))
    .limit(1);
  return {
    resumoAtivo: p?.resumoAtivo ?? true,
    horaDoResumo: p?.horaDoResumo ?? HORA_PADRAO,
    lastDigestDate: p?.lastDigestDate ?? null,
  };
}
