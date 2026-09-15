/**
 * De onde vieram os participantes de uma campanha do SendFlow.
 *
 * ## Por que existe
 *
 * A página B do FZM3 não tem popup de cadastro: quem entra no grupo por ela
 * não deixa nome nem e-mail em lugar nenhum. O único rastro é o número dentro
 * do grupo — e o SendFlow entrega esses números pela `export-leads-action`.
 * Cruzando com um grupo antigo (o de Avisos, uma edição anterior) dá para
 * separar quem já era da base de quem chegou agora.
 *
 * ## Por que o CSV e não outra tool
 *
 * Das 92 tools do MCP, só a exportação devolve participante por participante.
 * `get-release-groups` dá a contagem; `get-analytics` dá entradas por dia, mas
 * nunca QUEM entrou. O CSV não traz nome (a coluna vem vazia) nem data de
 * entrada — então a ordem "estava no antigo antes de entrar no novo" não é
 * verificável, só a presença nos dois.
 */

import type { SendflowSession } from "./sendflow.js";
import { SendflowError } from "./sendflow.js";

export interface Participantes {
  /** Estão em pelo menos um grupo da campanha hoje. */
  atuais: Set<string>;
  /** Passaram pela campanha e não estão em grupo nenhum dela hoje. */
  sairam: Set<string>;
}

/** Separa uma linha `;` respeitando aspas (nome de grupo pode ter `;`). */
function campos(linha: string): string[] {
  const out: string[] = [];
  let atual = "";
  let aspas = false;
  for (let i = 0; i < linha.length; i++) {
    const ch = linha[i];
    if (aspas) {
      if (ch !== '"') atual += ch;
      else if (linha[i + 1] === '"') {
        atual += '"';
        i++;
      } else aspas = false;
    } else if (ch === '"') aspas = true;
    else if (ch === ";") {
      out.push(atual);
      atual = "";
    } else atual += ch;
  }
  out.push(atual);
  return out;
}

const PARECE_TELEFONE = /^\+?[\d\s().-]{8,}$/;

/**
 * Lê o CSV da exportação (`Posição;Grupo;Nome;Número;Saiu`).
 *
 * O número é achado pelo formato, da direita para a esquerda, e não pela
 * posição do cabeçalho: um `;` sem aspas no nome do grupo deslocaria todas as
 * colunas e trocaria o telefone pelo nome sem erro nenhum. `Saiu` é o campo
 * logo depois do número.
 */
export function lerExportDeLeads(csv: string): Participantes {
  const atuais = new Set<string>();
  const sairam = new Set<string>();
  for (const linha of csv.split(/\r?\n/)) {
    const c = campos(linha);
    let i = c.length - 1;
    while (i >= 0 && !PARECE_TELEFONE.test(c[i]!.trim())) i--;
    if (i < 0) continue; // cabeçalho ou linha vazia
    const numero = c[i]!.replace(/\D/g, "");
    if (numero.length < 8 || numero.length > 15) continue;
    const saiu = /^sim$/i.test((c[i + 1] ?? "").trim());
    (saiu ? sairam : atuais).add(numero);
  }
  // Saiu do grupo #1 mas está no #2: continua na campanha.
  for (const n of atuais) sairam.delete(n);
  return { atuais, sairam };
}

export interface ParticipanteDeOrigem {
  numero: string;
  /** Aparece na campanha antiga (dentro ou já tendo saído). */
  veioDaAntiga: boolean;
  /** Não está mais em grupo nenhum da campanha atual. */
  saiu: boolean;
}

export interface OrigemDosParticipantes {
  /** Todo mundo que passou pela campanha atual, inclusive quem já saiu. */
  total: number;
  vieramDaAntiga: number;
  novos: number;
  /** Dos que vieram da antiga: continuam lá. */
  aindaNaAntiga: number;
  /** Dos que vieram da antiga: já tinham saído dela. */
  tinhamSaidoDaAntiga: number;
  sairamDaCampanha: number;
  participantes: ParticipanteDeOrigem[];
}

export function cruzarOrigem(
  campanha: Participantes,
  antiga: Participantes,
): OrigemDosParticipantes {
  const todos = new Set([...campanha.atuais, ...campanha.sairam]);
  const participantes = [...todos].map((numero) => ({
    numero,
    veioDaAntiga: antiga.atuais.has(numero) || antiga.sairam.has(numero),
    saiu: campanha.sairam.has(numero),
  }));
  const vieram = participantes.filter((p) => p.veioDaAntiga);
  return {
    total: participantes.length,
    vieramDaAntiga: vieram.length,
    novos: participantes.length - vieram.length,
    aindaNaAntiga: vieram.filter((p) => antiga.atuais.has(p.numero)).length,
    tinhamSaidoDaAntiga: vieram.filter((p) => antiga.sairam.has(p.numero))
      .length,
    sairamDaCampanha: participantes.filter((p) => p.saiu).length,
    participantes,
  };
}

const VALIDADE_MS = 30 * 60_000;
const cache = new Map<string, { em: number; p: Promise<Participantes> }>();

/**
 * Participantes de uma campanha, com cache de 30 minutos.
 *
 * Cada exportação leva segundos, fica registrada no histórico de ações do
 * SendFlow e o grupo não muda de composição a cada F5 — o cache guarda a
 * PROMISE, então duas pessoas abrindo juntas disparam uma exportação só.
 *
 * ponytail: cache em memória do processo; some no deploy e não é dividido
 * entre réplicas. Basta enquanto a API roda numa instância só.
 */
export function participantesDaCampanha(
  s: SendflowSession,
  releaseId: string,
): Promise<Participantes> {
  const guardado = cache.get(releaseId);
  if (guardado && Date.now() - guardado.em < VALIDADE_MS) return guardado.p;

  const p = (async () => {
    const r = await s.chamar<{ success?: boolean; url?: string; error?: string }>(
      "export-leads-action",
      { releaseId, includeLeft: true, timeout: 120_000 },
      // Um pouco acima do timeout pedido ao SendFlow, para a resposta de
      // "demorou demais" dele chegar em vez de um abort nosso.
      130_000,
    );
    if (!r?.url) {
      throw new SendflowError(
        r?.error ?? "O SendFlow não devolveu a exportação dos participantes.",
        502,
        true,
      );
    }
    const res = await fetch(r.url, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) {
      throw new SendflowError(
        `Não consegui baixar a exportação (${res.status}).`,
        502,
        true,
      );
    }
    return lerExportDeLeads(await res.text());
  })();

  cache.set(releaseId, { em: Date.now(), p });
  // Falha não fica guardada: a próxima tentativa exporta de novo.
  p.catch(() => cache.delete(releaseId));
  return p;
}
