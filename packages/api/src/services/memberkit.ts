// Story 19.11 — Service MemberKit (área de membros / matrícula).
//
// Auth: API key na QUERY STRING (?api_key=...) em TODA chamada. NÃO é header.
//   GET  https://memberkit.com.br/api/v1/classrooms?api_key=...
//   POST https://memberkit.com.br/api/v1/users?api_key=...   (upsert por email)
//
// SEGURANÇA: a key vai na URL → NUNCA logar a URL crua nem a key. Mensagens de
// erro carregam só status + detalhe do MemberKit (sem a query string).
//
// Integração OUTBOUND: ao lançar uma venda na etapa de Evento Presencial,
// chamamos enrollMember() para matricular o comprador na(s) turma(s) escolhida(s).

import { encrypt, decrypt } from "./encryption.js";
import type { MemberkitMemberStatus } from "@loyola-x/shared";

const API_BASE = "https://memberkit.com.br/api/v1";

// Timeout defensivo por request — a matrícula é efeito colateral; não pode
// segurar o response da venda indefinidamente.
const REQUEST_TIMEOUT_MS = 15_000;

// ============================================================
// Cripto (reusa services/encryption.ts — AES-256-GCM)
// ============================================================

export function encryptMemberkitKey(plaintext: string): { encrypted: string; iv: string } {
  return encrypt(plaintext);
}

export function decryptMemberkitKey(encrypted: string, iv: string): string {
  return decrypt(encrypted, iv);
}

// ============================================================
// Tipos da API
// ============================================================

export interface MemberkitClassroomApi {
  id: number;
  name: string;
  course_name?: string | null;
  master?: boolean;
}

export interface MemberkitCourseApi {
  id: number;
  name: string;
}

export interface EnrollMemberInput {
  fullName: string;
  email: string;
  status?: MemberkitMemberStatus;
  classroomIds: number[];
}

export interface EnrollMemberResult {
  ok: boolean;
  memberkitUserId?: string;
  error?: string;
}

// ============================================================
// Cliente HTTP — base v1, api_key na query
// ============================================================

/** Monta a URL com a api_key na query. NUNCA logar o retorno desta função. */
function buildUrl(path: string, apiKey: string, params?: Record<string, string | number | undefined>): string {
  const qs = new URLSearchParams();
  qs.set("api_key", apiKey);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null || v === "") continue;
      qs.set(k, String(v));
    }
  }
  return `${API_BASE}${path}?${qs.toString()}`;
}

async function memberkitFetch(
  path: string,
  apiKey: string,
  init?: RequestInit & { params?: Record<string, string | number | undefined> },
): Promise<Response> {
  const { params, ...rest } = init ?? {};
  const url = buildUrl(path, apiKey, params);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...rest,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(rest.body ? { "Content-Type": "application/json" } : {}),
        ...(rest.headers ?? {}),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Remove qualquer api_key=... de um texto (defesa contra eco da URL pelo upstream). */
function maskApiKey(text: string): string {
  return text.replace(/api_key=[^&\s"']+/gi, "api_key=***");
}

/** Extrai uma mensagem de erro legível do corpo SEM vazar a api_key. */
async function readError(res: Response): Promise<string> {
  let detail = "";
  try {
    const body = (await res.json()) as { message?: string; error?: string; errors?: unknown };
    detail = body?.message ?? body?.error ?? (body?.errors ? JSON.stringify(body.errors) : "");
  } catch {
    /* corpo não-JSON */
  }
  // O MemberKit pode (teoricamente) ecoar a request URL — que carrega ?api_key=
  // — no corpo de erro. Mascaramos antes de propagar pro cliente/log.
  return maskApiKey(`MemberKit API ${res.status}${detail ? `: ${detail}` : ""}`);
}

// ============================================================
// Operações
// ============================================================

/**
 * Valida a API key batendo num endpoint leve autenticado (GET /classrooms).
 * 2xx = ok. Lança Error legível em falha (sem a key na mensagem).
 */
export async function testMemberkitConnection(apiKey: string): Promise<boolean> {
  let res: Response;
  try {
    res = await memberkitFetch("/classrooms", apiKey, { method: "GET", params: { page: 1 } });
  } catch {
    throw new Error("Falha de rede ao conectar no MemberKit");
  }
  if (res.status === 401 || res.status === 403) {
    throw new Error("API key do MemberKit inválida (não autorizada)");
  }
  if (!res.ok) {
    throw new Error(await readError(res));
  }
  return true;
}

/** Lista turmas (classrooms) — alvo de matrícula (classroom_ids). */
export async function listClassrooms(apiKey: string): Promise<MemberkitClassroomApi[]> {
  const res = await memberkitFetch("/classrooms", apiKey, { method: "GET" });
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as MemberkitClassroomApi[] | { classrooms?: MemberkitClassroomApi[] };
  return Array.isArray(data) ? data : data.classrooms ?? [];
}

/** Lista cursos (para exibição/agrupamento na UI). */
export async function listCourses(apiKey: string): Promise<MemberkitCourseApi[]> {
  const res = await memberkitFetch("/courses", apiKey, { method: "GET" });
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as MemberkitCourseApi[] | { courses?: MemberkitCourseApi[] };
  return Array.isArray(data) ? data : data.courses ?? [];
}

/**
 * Matricula (upsert por email) um membro no MemberKit.
 *   POST /api/v1/users  body { full_name, email, status, classroom_ids }
 * O endpoint é upsert pela chave email → reenviar a mesma venda é idempotente
 * (não cria acesso duplicado). NÃO lança: retorna { ok, error } pra o caller
 * tratar como efeito colateral (a venda não pode falhar por causa disto).
 */
export async function enrollMember(apiKey: string, input: EnrollMemberInput): Promise<EnrollMemberResult> {
  const email = input.email.trim().toLowerCase();
  if (!email) return { ok: false, error: "Email obrigatório para matrícula no MemberKit" };
  if (input.classroomIds.length === 0) {
    return { ok: false, error: "Nenhuma turma (classroom) configurada para matrícula" };
  }

  const payload = {
    full_name: input.fullName,
    email,
    status: input.status ?? "active",
    classroom_ids: input.classroomIds,
  };

  let res: Response;
  try {
    res = await memberkitFetch("/users", apiKey, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  } catch {
    return { ok: false, error: "Falha de rede ao matricular no MemberKit" };
  }

  if (!res.ok) {
    return { ok: false, error: await readError(res) };
  }

  let memberkitUserId: string | undefined;
  try {
    const body = (await res.json()) as { id?: number | string };
    if (body?.id !== undefined && body?.id !== null) memberkitUserId = String(body.id);
  } catch {
    /* corpo não-JSON — matrícula ok mesmo assim */
  }
  return { ok: true, memberkitUserId };
}
