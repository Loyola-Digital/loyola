/**
 * Traduz uma linha do histórico de alterações da Meta para uma entrada do Log de
 * Campanha, usando o MESMO vocabulário dos dropdowns manuais
 * (`campaign-log-options.ts` no web) — assim a entrada automática fica lado a
 * lado com a manual, com o mesmo badge e o mesmo filtro, em vez de virar uma
 * categoria à parte.
 *
 * A Meta já devolve `translated_event_type` no idioma da conta ("Orçamento da
 * campanha atualizado"), então este módulo não mantém dicionário de rótulos: ele
 * decide a CATEGORIA (que o log usa pra colorir/filtrar) e monta a observação
 * com o antes → depois, que é a informação que o time realmente lê.
 */

import type { MetaActivity } from "./meta-ads.js";

/** Evento do log — todo evento vindo da Meta é "ação no gerenciador". */
export const EVENTO_META = "Ação no gerenciador de anúncios";
export const APLICATIVO_META = "Meta Ads";

export interface MetaLogDraft {
  occurredAt: Date;
  categoria: string;
  notes: string;
  /** Nome de quem mexeu na Meta (vai pro campo `responsavel` do log). */
  responsavel: string;
  /** Dedup: estável por (objeto, tipo, instante). */
  sourceId: string;
  /** id do objeto tocado (campanha, conjunto ou anúncio) — usado pra achar o funil. */
  objectId: string | null;
  /** Nome do objeto — permite achar o funil pelo match_code quando o id não basta. */
  objectName: string | null;
  /** campaign_id quando a própria Meta informa no extra_data. */
  campaignIdHint: string | null;
}

/**
 * `extra_data` é um JSON string cujo formato varia por tipo de evento:
 *  - run_status:     { old_value: "Ativa", new_value: "Inativa" }
 *  - composite_data: { old_value: { type:"payment_amount", currency, old_value }, new_value: {...} }
 *  - targets_spec:   { old_value: [], new_value: [{content, children}] }
 * Tudo opcional — evento sem extra_data ainda vira entrada, só sem o "antes → depois".
 */
interface ExtraData {
  type?: string;
  old_value?: unknown;
  new_value?: unknown;
  campaign_id?: number | string;
  run_status?: { old_value?: number; new_value?: number };
}

function parseExtra(raw: string | undefined): ExtraData | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as ExtraData) : null;
  } catch {
    return null;
  }
}

/**
 * Valor monetário da Meta vem em CENTAVOS da moeda da conta
 * (`{ type:"payment_amount", currency:"BRL", new_value:30000 }` = R$ 300,00).
 * Devolve null quando o formato não é de dinheiro — aí o chamador cai no texto cru.
 */
function formatarDinheiro(valor: unknown): string | null {
  if (!valor || typeof valor !== "object") return null;
  const v = valor as Record<string, unknown>;
  if (v.type !== "payment_amount") return null;
  const bruto = v.new_value ?? v.old_value;
  const centavos = typeof bruto === "number" ? bruto : Number(bruto);
  if (!Number.isFinite(centavos)) return null;
  const moeda = typeof v.currency === "string" ? v.currency : "BRL";
  const texto = (centavos / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: moeda,
    maximumFractionDigits: 2,
  });
  // "Por dia" / "Vitalício" — a Meta manda no additional_value.
  const cadencia = typeof v.additional_value === "string" ? v.additional_value.trim() : "";
  return cadencia ? `${texto} (${cadencia.toLowerCase()})` : texto;
}

/** Texto curto de um lado do antes/depois. Objetos viram JSON compacto e truncado. */
function ladoLegivel(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;
  const dinheiro = formatarDinheiro(valor);
  if (dinheiro) return dinheiro;
  if (typeof valor === "string") return valor.trim() || null;
  if (typeof valor === "number" || typeof valor === "boolean") return String(valor);
  // Direcionamento vem como lista de blocos { content, children } — vira um
  // resumo de uma linha em vez de despejar o JSON inteiro na observação.
  if (Array.isArray(valor)) {
    if (valor.length === 0) return null;
    const partes = valor
      .map((item) => {
        if (item && typeof item === "object" && "content" in item) {
          const bloco = item as { content?: unknown; children?: unknown };
          const titulo = String(bloco.content ?? "").replace(/:$/, "");
          const filhos = Array.isArray(bloco.children) ? bloco.children.join(", ") : "";
          return filhos ? `${titulo}: ${filhos}` : titulo;
        }
        return typeof item === "string" ? item : null;
      })
      .filter((p): p is string => Boolean(p));
    return partes.length ? truncar(partes.join(" · "), 400) : null;
  }
  return truncar(JSON.stringify(valor), 300);
}

function truncar(texto: string, max: number): string {
  return texto.length > max ? `${texto.slice(0, max - 1)}…` : texto;
}

/**
 * Categoria do log. Os nomes batem exatamente com `LOG_CATEGORIAS` no web —
 * qualquer divergência aqui cria categoria órfã no filtro.
 */
function categoriaDe(eventType: string, extra: ExtraData | null): string {
  const t = eventType.toLowerCase();

  if (t.includes("budget") || t.includes("spend_cap") || t.includes("spend_limit")) {
    return "Ajuste de Budget";
  }
  if (t.includes("run_status")) {
    // "Ativa"/"Ativo" → ligada; qualquer outro destino (Inativa, Pausada,
    // Arquivada, Excluída) → desligada.
    const novo = typeof extra?.new_value === "string" ? extra.new_value.toLowerCase() : "";
    return novo.startsWith("ativ") ? "Campanha Ligada" : "Campanha Desligada";
  }
  if (t.includes("target") || t.includes("audience")) return "Ajuste de Público";
  if (t.includes("creative") || t.includes("image") || t === "create_ad" || t.includes("video")) {
    return "Publicação de Criativos";
  }
  if (t.startsWith("create_")) return "Campanha";
  if (t.includes("name")) return "Campanha";
  return "Outro";
}

/**
 * Eventos que NÃO viram entrada de log: são ruído de plataforma, não ação de
 * alguém do time. `first_delivery_event` é a Meta avisando que começou a
 * entregar, e `ad_account_billing_charge` é cobrança no cartão — nenhum dos dois
 * é "mudança na campanha".
 */
const IGNORADOS = new Set([
  "first_delivery_event",
  "ad_account_billing_charge",
  "ad_review_approved",
  "ad_account_update_spend_limit",
]);

export function ignorarEvento(eventType: string): boolean {
  return IGNORADOS.has(eventType);
}

/**
 * Converte a atividade em rascunho de entrada. Devolve null quando o evento é
 * ignorado ou não tem instante válido.
 */
export function mapearAtividade(activity: MetaActivity): MetaLogDraft | null {
  if (ignorarEvento(activity.event_type)) return null;

  const occurredAt = new Date(activity.event_time);
  if (isNaN(occurredAt.getTime())) return null;

  const extra = parseExtra(activity.extra_data);
  const categoria = categoriaDe(activity.event_type, extra);

  // Título: o rótulo traduzido pela Meta; sem ele, o event_type cru (melhor que
  // uma observação vazia).
  const titulo = activity.translated_event_type?.trim() || activity.event_type;
  const alvo = activity.object_name?.trim();

  const antes = ladoLegivel(extra?.old_value);
  const depois = ladoLegivel(extra?.new_value);
  const mudanca =
    antes && depois ? `${antes} → ${depois}` : depois ? `→ ${depois}` : antes ? `era ${antes}` : null;

  const partes = [titulo];
  if (alvo) partes.push(alvo);
  if (mudanca) partes.push(mudanca);

  const campaignIdHint =
    extra?.campaign_id !== undefined && extra.campaign_id !== null
      ? String(extra.campaign_id)
      : null;

  return {
    occurredAt,
    categoria,
    notes: truncar(partes.join(" · "), 1000),
    responsavel: activity.actor_name?.trim() || "Meta Ads (auto)",
    // object_id + tipo + instante identifica a alteração de forma estável: o
    // mesmo objeto pode ter dois eventos diferentes no mesmo segundo (ex.: verba
    // e status), e o mesmo evento pode reaparecer em janelas que se sobrepõem.
    sourceId: `meta-activity:${activity.object_id ?? "?"}:${activity.event_type}:${occurredAt.toISOString()}`,
    objectId: activity.object_id ?? null,
    objectName: alvo ?? null,
    campaignIdHint,
  };
}
