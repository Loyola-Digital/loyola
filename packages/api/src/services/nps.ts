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

/** Nível de interesse declarado pelo respondente (pra ordenar/status). */
export type NpsInterest = "quente" | "interessado" | "duvida" | "sem" | null;

export interface NpsRespondent {
  name: string | null;
  email: string | null;
  score: number | null;
  sentiment: NpsSentiment | null;
  positive: boolean;
  timestamp: string | null;
  /** Chave estável (Respondent ID do Tally, ou email/nome) — pra marcar o brinde. */
  key: string;
  /** Resposta crua da pergunta de interesse (se houver coluna). */
  interest: string | null;
  /** Status classificado do interesse. */
  interestStatus: NpsInterest;
  /** Rank de ordenação: menor = mais interessado (0 quente … 5 sem resposta). */
  interestRank: number;
  /** TODAS as colunas da linha do NPS (header -> valor) — pra ver as respostas. */
  fields: Record<string, string>;
}

export interface LoyolaRecord {
  email: string | null;
  name: string | null;
  /** telefone/WhatsApp da pessoa (se a planilha tiver a coluna). */
  phone: string | null;
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
  /** brinde já entregue (marcado no evento). */
  brindeDelivered: boolean;
  /** telefone da pessoa (do registro casado); null se não houver. Pro link wa.me. */
  phone: string | null;
  /** vendedor/closer atribuído no Mapa do Evento (por email); null se não houver. */
  assignedSeller: string | null;
  /** tipo da pessoa (coluna "Tipo" do registro casado): comprador/2 cadeira/iFood/… */
  tipo: string | null;
  /** nome de quem convidou (2ª cadeira — coluna "Convidado"); null se não houver. */
  inviterName: string | null;
  /** telefone de quem convidou (resolvido pela lista); null se não achado. */
  inviterPhone: string | null;
}

/** Pega o 1º field cujo header normalizado está em `keys` (não vazio). */
function pickField(fields: Record<string, string> | null, keys: string[]): string | null {
  if (!fields) return null;
  for (const [k, v] of Object.entries(fields)) {
    if (keys.includes(normKey(k)) && v.trim()) return v.trim();
  }
  return null;
}

/** Classifica a resposta de interesse em status + rank de ordenação. */
export function classifyInterest(raw: string | null): { status: NpsInterest; rank: number } {
  if (!raw) return { status: null, rank: 5 };
  const n = normKey(raw);
  if (n.includes("muito interesse")) return { status: "quente", rank: 0 };
  if (n.includes("nao tenho interesse") || n.includes("sem interesse") || n.includes("nenhum interesse"))
    return { status: "sem", rank: 3 };
  if (n.includes("duvida")) return { status: "duvida", rank: 2 };
  if (n.includes("interesse")) return { status: "interessado", rank: 1 };
  return { status: null, rank: 4 };
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
  // Chave estável do respondente (Respondent/Submission ID do Tally, se houver).
  const iKey = headers.findIndex((h) => {
    const n = normKey(h);
    return n === "respondent id" || n === "submission id";
  });
  // Coluna de interesse (header contém "interesse").
  const iInterest = headers.findIndex((h) => normKey(h).includes("interesse"));

  const out: NpsRespondent[] = [];
  for (const row of rows) {
    const cell = (i: number) => (i >= 0 ? (row[i] ?? "").trim() : "");
    const name = iName >= 0 ? cell(iName) || null : null;
    const email = iEmail >= 0 ? cell(iEmail) || null : null;
    // Pula linhas totalmente vazias.
    if (!name && !email && cell(iScore) === "") continue;
    const score = parseScore(cell(iScore));
    const sentiment = classifyNps(score);
    const interest = iInterest >= 0 ? cell(iInterest) || null : null;
    const { status, rank } = classifyInterest(interest);
    // Chave: Respondent ID > email > nome normalizado.
    const key = (iKey >= 0 ? cell(iKey) : "") || email || normKey(name) || "";
    // Todas as colunas da linha (pra exibir as respostas na expansão).
    const fields: Record<string, string> = {};
    headers.forEach((h, i) => { if (h) fields[h] = (row[i] ?? "").trim(); });
    out.push({
      name,
      email,
      score,
      sentiment,
      positive: sentiment === "promotor",
      timestamp: iTs >= 0 ? cell(iTs) || null : null,
      key,
      interest,
      interestStatus: status,
      interestRank: rank,
      fields,
    });
  }
  return out;
}

/** Tokens de um nome (>= 2 chars, sem acento/caixa). */
function nameTokens(s: string | null | undefined): string[] {
  return normKey(s).split(" ").filter((t) => t.length >= 2);
}
/** "primeiro último" — ignora nomes do meio. "" se < 2 tokens. */
function firstLast(s: string | null | undefined): string {
  const t = nameTokens(s);
  return t.length < 2 ? "" : `${t[0]} ${t[t.length - 1]}`;
}

/**
 * Detecta a coluna de NOME da pessoa por heurística: header contém "nome"/"name"
 * e não se refere a restaurante/empresa/negócio. Mais robusto que a lista fixa —
 * pega "Seu nome completo", "Qual é o seu nome", etc.
 */
export function findNameHeader(headers: string[]): string | undefined {
  const i = headers.findIndex((h) => {
    const n = normKey(h);
    return (
      (n.includes("nome") || n.includes("name")) &&
      !n.includes("restaurante") &&
      !n.includes("empresa") &&
      !n.includes("negocio") &&
      !n.includes("fantasia")
    );
  });
  return i >= 0 ? headers[i] : undefined;
}

export interface LoyolaIndex {
  byEmail: Map<string, LoyolaRecord>;
  byName: Map<string, LoyolaRecord>;
  /** null = firstLast ambíguo (2+ pessoas distintas). */
  byFirstLast: Map<string, LoyolaRecord | null>;
  /** match por subconjunto de tokens (deduplicado por nome exato). */
  fuzzy: { tokens: Set<string>; rec: LoyolaRecord }[];
}

/** Extrai os registros (email/nome/fields) de uma planilha do Loyola. */
export function sheetToLoyolaRecords(
  headers: string[],
  rows: string[][],
  emailHeader: string | undefined,
  nameHeader: string | undefined,
): LoyolaRecord[] {
  const iEmail = findCol(headers, emailHeader);
  const iName = findCol(headers, nameHeader);
  // Telefone/WhatsApp — detectado por header (pro link wa.me no NPS).
  const iPhone = headers.findIndex((h) => {
    const n = normKey(h);
    return n.includes("telefone") || n.includes("whatsapp") || n.includes("celular") || n.includes("fone") || n === "phone";
  });
  return rows.map((row) => {
    const fields: Record<string, string> = {};
    headers.forEach((h, i) => { fields[h] = (row[i] ?? "").trim(); });
    return {
      email: iEmail >= 0 ? (row[iEmail] ?? "").trim() || null : null,
      name: iName >= 0 ? (row[iName] ?? "").trim() || null : null,
      phone: iPhone >= 0 ? (row[iPhone] ?? "").trim() || null : null,
      fields,
    };
  });
}

/** Constrói o índice do Loyola (email + nome exato + primeiro/último + fuzzy). */
export function buildLoyolaIndex(records: LoyolaRecord[]): LoyolaIndex {
  const byEmail = new Map<string, LoyolaRecord>();
  const byName = new Map<string, LoyolaRecord>();
  for (const rec of records) {
    // Primeira ocorrência vence (não sobrescreve duplicatas).
    if (rec.email) { const k = normEmail(rec.email); if (k && !byEmail.has(k)) byEmail.set(k, rec); }
    if (rec.name) { const k = normKey(rec.name); if (k && !byName.has(k)) byName.set(k, rec); }
  }
  // firstLast/fuzzy a partir dos nomes ÚNICOS — evita falsa ambiguidade quando a
  // mesma pessoa aparece em várias planilhas (participantes + respostas).
  const byFirstLast = new Map<string, LoyolaRecord | null>();
  const fuzzy: { tokens: Set<string>; rec: LoyolaRecord }[] = [];
  for (const rec of byName.values()) {
    const fl = firstLast(rec.name);
    if (fl) byFirstLast.set(fl, byFirstLast.has(fl) ? null : rec);
    fuzzy.push({ tokens: new Set(nameTokens(rec.name)), rec });
  }
  return { byEmail, byName, byFirstLast, fuzzy };
}

/** Indexa uma única planilha do Loyola (compat/testes). */
export function indexLoyola(
  headers: string[],
  rows: string[][],
  emailHeader: string | undefined,
  nameHeader: string | undefined,
): LoyolaIndex {
  return buildLoyolaIndex(sheetToLoyolaRecords(headers, rows, emailHeader, nameHeader));
}

/**
 * Resolve um nome contra o índice: exato → primeiro/último (se único) →
 * subconjunto de tokens (se único). Cobre nome curto vs nome completo.
 */
export function resolveByName(name: string | null | undefined, idx: LoyolaIndex): LoyolaRecord | null {
  if (!name) return null;
  const exact = idx.byName.get(normKey(name));
  if (exact) return exact;
  const fl = firstLast(name);
  if (fl) {
    const r = idx.byFirstLast.get(fl);
    if (r) return r; // r === null → ambíguo, não chuta
  }
  const t = nameTokens(name);
  if (t.length >= 2) {
    const cand = idx.fuzzy.filter((x) => t.every((tk) => x.tokens.has(tk)));
    if (cand.length === 1) return cand[0].rec;
  }
  return null;
}

/**
 * Cruza respondentes do NPS com o índice do Loyola (e-mail > nome, com fuzzy).
 * sellerByEmail (email normalizado → vendedor) vem do Mapa do Evento pra anexar
 * o vendedor atribuído.
 */
export function crossNps(
  respondents: NpsRespondent[],
  idx: LoyolaIndex,
  sellerByEmail?: Map<string, string>,
): NpsCrossRow[] {
  return respondents.map((r) => {
    let match: LoyolaRecord | null | undefined;
    let matchedBy: "email" | "nome" | null = null;
    if (r.email) {
      match = idx.byEmail.get(normEmail(r.email));
      if (match) matchedBy = "email";
    }
    if (!match && r.name) {
      match = resolveByName(r.name, idx);
      if (match) matchedBy = "nome";
    }
    // Telefone e email de contato vêm do registro casado (o NPS não costuma ter).
    const phone = match?.phone ?? null;
    const contactEmail = match?.email ?? r.email ?? null;
    const assignedSeller =
      contactEmail && sellerByEmail ? sellerByEmail.get(normEmail(contactEmail)) ?? null : null;

    // Convidante (2ª cadeira): "Email da venda" / "Convidado" no registro casado.
    // Resolve o telefone dele buscando na própria lista (por email > nome).
    const fields = match ? match.fields : null;
    const inviterEmail = pickField(fields, ["email da venda"]);
    let inviterName = pickField(fields, ["convidado"]);
    let inviterPhone: string | null = null;
    let inviterRec: LoyolaRecord | null | undefined;
    if (inviterEmail) inviterRec = idx.byEmail.get(normEmail(inviterEmail));
    if (!inviterRec && inviterName) inviterRec = resolveByName(inviterName, idx);
    if (inviterRec) {
      inviterPhone = inviterRec.phone;
      if (!inviterName) inviterName = inviterRec.name;
    }

    return {
      ...r,
      matched: Boolean(match),
      matchedBy,
      loyola: fields,
      brindeDelivered: false, // preenchido na rota a partir do banco
      phone,
      assignedSeller,
      tipo: pickField(fields, ["tipo"]),
      inviterName,
      inviterPhone,
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
