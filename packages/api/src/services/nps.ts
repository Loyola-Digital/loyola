// Epic 38 — Cruzamento de NPS com respostas da pesquisa do funil (puro/testável).
//
// A lista de NPS e as respostas do Loyola vêm de planilhas (headers + rows). Este
// módulo: classifica a nota (promotor/neutro/detrator), indexa as respostas do
// Loyola por e-mail (e por nome, fallback) e cruza cada respondente do NPS com a
// pessoa correspondente, anexando todas as infos dela.
//
// Join: e-mail (normalizado) tem precedência; se a planilha de NPS não tiver
// e-mail (ou não casar), tenta por NOME normalizado. matched=false quando não acha.

export type NpsSentiment = "promotor" | "neutro" | "detrator";

export interface NpsColumnMapping {
  name?: string;
  email?: string;
  score?: string;
  timestamp?: string;
}

export interface NpsRespondent {
  name: string | null;
  email: string | null;
  score: number | null;
  sentiment: NpsSentiment | null;
  positive: boolean;
  timestamp: string | null;
}

export interface LoyolaRecord {
  email: string | null;
  name: string | null;
  /** todas as colunas da resposta do Loyola (header -> valor). */
  fields: Record<string, string>;
}

export interface NpsCrossRow extends NpsRespondent {
  /** casou com alguém nas respostas do Loyola? */
  matched: boolean;
  /** como casou: "email" | "nome" | null. */
  matchedBy: "email" | "nome" | null;
  /** infos da pessoa no Loyola (ou null se não casou). */
  loyola: Record<string, string> | null;
}

// ---- normalização ----

export function normKey(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ");
}

export function normEmail(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().trim();
}

/** Extrai uma nota 0..10 de uma célula ("9", "9,0", "Nota 10"...). null se inválida. */
export function parseScore(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const m = String(raw).replace(",", ".").match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = Math.round(Number(m[0]));
  if (!Number.isFinite(n) || n < 0 || n > 10) return null;
  return n;
}

/** Promotor 9–10 · Neutro 7–8 · Detrator 0–6. null se nota inválida. */
export function classifyNps(score: number | null): NpsSentiment | null {
  if (score == null) return null;
  if (score >= 9) return "promotor";
  if (score >= 7) return "neutro";
  return "detrator";
}

// ---- planilhas ----

/** Índice de uma coluna pelo nome do header (case-insensitive, acento-insensitive). */
export function findCol(headers: string[], colName: string | undefined): number {
  if (!colName) return -1;
  const target = normKey(colName);
  for (let i = 0; i < headers.length; i++) {
    if (normKey(headers[i]) === target) return i;
  }
  return -1;
}

/** Primeiro header que casar com algum dos candidatos (case/acento-insensitive). */
export function pickHeader(headers: string[], candidates: string[]): string | undefined {
  for (const c of candidates) {
    const i = findCol(headers, c);
    if (i >= 0) return headers[i];
  }
  return undefined;
}

/** Candidatos comuns de coluna "nome" no lado do Loyola (para o fallback por nome). */
export const NAME_HEADER_CANDIDATES = [
  "nome",
  "nome completo",
  "seu nome",
  "qual o seu nome",
  "qual seu nome",
  "name",
  "full name",
];

/** Constrói os respondentes do NPS a partir da planilha + mapeamento de colunas. */
export function mapNpsRows(
  headers: string[],
  rows: string[][],
  mapping: NpsColumnMapping,
): NpsRespondent[] {
  const iName = findCol(headers, mapping.name);
  const iEmail = findCol(headers, mapping.email);
  const iScore = findCol(headers, mapping.score);
  const iTs = findCol(headers, mapping.timestamp);

  const out: NpsRespondent[] = [];
  for (const row of rows) {
    const cell = (i: number) => (i >= 0 ? (row[i] ?? "").trim() : "");
    const name = iName >= 0 ? cell(iName) || null : null;
    const email = iEmail >= 0 ? cell(iEmail) || null : null;
    // Pula linhas totalmente vazias.
    if (!name && !email && cell(iScore) === "") continue;
    const score = parseScore(cell(iScore));
    const sentiment = classifyNps(score);
    out.push({
      name,
      email,
      score,
      sentiment,
      positive: sentiment === "promotor",
      timestamp: iTs >= 0 ? cell(iTs) || null : null,
    });
  }
  return out;
}

/** Indexa respostas do Loyola por e-mail e por nome. emailHeader/nameHeader = nomes das colunas. */
export function indexLoyola(
  headers: string[],
  rows: string[][],
  emailHeader: string | undefined,
  nameHeader: string | undefined,
): { byEmail: Map<string, LoyolaRecord>; byName: Map<string, LoyolaRecord> } {
  const iEmail = findCol(headers, emailHeader);
  const iName = findCol(headers, nameHeader);
  const byEmail = new Map<string, LoyolaRecord>();
  const byName = new Map<string, LoyolaRecord>();

  for (const row of rows) {
    const fields: Record<string, string> = {};
    headers.forEach((h, i) => { fields[h] = (row[i] ?? "").trim(); });
    const email = iEmail >= 0 ? (row[iEmail] ?? "").trim() || null : null;
    const name = iName >= 0 ? (row[iName] ?? "").trim() || null : null;
    const rec: LoyolaRecord = { email, name, fields };
    // Primeira ocorrência vence (não sobrescreve duplicatas).
    if (email) { const k = normEmail(email); if (!byEmail.has(k)) byEmail.set(k, rec); }
    if (name) { const k = normKey(name); if (k && !byName.has(k)) byName.set(k, rec); }
  }
  return { byEmail, byName };
}

/** Cruza respondentes do NPS com o índice do Loyola (e-mail > nome). */
export function crossNps(
  respondents: NpsRespondent[],
  index: { byEmail: Map<string, LoyolaRecord>; byName: Map<string, LoyolaRecord> },
): NpsCrossRow[] {
  return respondents.map((r) => {
    let match: LoyolaRecord | undefined;
    let matchedBy: "email" | "nome" | null = null;
    if (r.email) {
      match = index.byEmail.get(normEmail(r.email));
      if (match) matchedBy = "email";
    }
    if (!match && r.name) {
      match = index.byName.get(normKey(r.name));
      if (match) matchedBy = "nome";
    }
    return {
      ...r,
      matched: Boolean(match),
      matchedBy,
      loyola: match ? match.fields : null,
    };
  });
}

export interface NpsCrossSummary {
  total: number;
  promotores: number;
  neutros: number;
  detratores: number;
  semNota: number;
  matched: number;
  /** NPS = %promotores − %detratores (−100..100), considerando notas válidas. */
  npsScore: number;
}

/** Resumo agregado do cruzamento (contagens + NPS clássico). */
export function summarizeNps(rows: NpsCrossRow[]): NpsCrossSummary {
  let promotores = 0, neutros = 0, detratores = 0, semNota = 0, matched = 0;
  for (const r of rows) {
    if (r.matched) matched++;
    if (r.sentiment === "promotor") promotores++;
    else if (r.sentiment === "neutro") neutros++;
    else if (r.sentiment === "detrator") detratores++;
    else semNota++;
  }
  const validos = promotores + neutros + detratores;
  const npsScore = validos > 0 ? Math.round(((promotores - detratores) / validos) * 100) : 0;
  return { total: rows.length, promotores, neutros, detratores, semNota, matched, npsScore };
}
