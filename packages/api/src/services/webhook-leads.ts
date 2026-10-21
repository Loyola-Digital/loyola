/**
 * Leads que chegam por webhook, entrando no funil como se fossem uma planilha.
 *
 * ## Por que planilha virtual, e não uma segunda fonte de leads
 *
 * Tudo que o X faz com lead — scoring, origem por UTM, cobertura diária,
 * debriefing, envio ao CAPI, Grupo X — lê a MESMA forma: uma linha de
 * `funnel_spreadsheets` e um `readSheetData(spreadsheetId, sheetName)`. São 41
 * arquivos e 117 chamadas afinados contra dado real ao longo de dezenas de
 * stories.
 *
 * Um segundo caminho de leitura criaria dois números para a mesma pergunta, e
 * um dia eles divergiriam — do mesmo jeito que a Kiwify entra como planilha
 * (`kiwify-como-planilha.ts`) em vez de ganhar um agregador próprio. Então o
 * webhook vira uma planilha cujas linhas moram no Postgres: `spreadsheetId`
 * guarda `webhook:<id da fonte>` e o `readSheetData` desvia para cá.
 *
 * Módulo puro: sem DB, sem rede.
 */

/** O que marca uma fonte virtual no `spreadsheetId` da `funnel_spreadsheets`. */
export const PREFIXO_FONTE = "webhook:";

/** O id da fonte, ou `null` quando é planilha de verdade do Google. */
export function idDaFonte(spreadsheetId: string): string | null {
  if (!spreadsheetId.startsWith(PREFIXO_FONTE)) return null;
  const id = spreadsheetId.slice(PREFIXO_FONTE.length).trim();
  return id.length > 0 ? id : null;
}

/** `spreadsheetId` de uma fonte de webhook. */
export function fonteComoPlanilhaId(sourceId: string): string {
  return `${PREFIXO_FONTE}${sourceId}`;
}

/**
 * Os cabeçalhos da planilha virtual.
 *
 * São os nomes que `lead-origin-sync` já reconhece por alias ("data", "email",
 * "telefone", "utm_source"…), de modo que a fonte funciona mesmo que alguém
 * apague o mapeamento na tela.
 */
export const COLUNAS = [
  "data",
  "nome",
  "email",
  "telefone",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
] as const;

/** O mapeamento que a etapa grava: campo do funil → cabeçalho daqui. */
export const MAPEAMENTO = {
  date: "data",
  name: "nome",
  email: "email",
  phone: "telefone",
  utm_source: "utm_source",
  utm_medium: "utm_medium",
  utm_campaign: "utm_campaign",
  utm_content: "utm_content",
  utm_term: "utm_term",
} as const;

export interface LeadRecebido {
  nome: string | null;
  email: string | null;
  telefone: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
}

/** Como cada campo pode se chamar no corpo que o Mautic, o n8n ou a LP manda. */
const APELIDOS: Record<keyof LeadRecebido, string[]> = {
  nome: ["nome", "name", "fullname", "nomecompleto", "firstname", "primeironome", "leadname"],
  email: ["email", "emailaddress", "enderecodeemail", "mail", "emaillead"],
  telefone: ["telefone", "phone", "whatsapp", "celular", "fone", "tel", "whats", "mobile", "numero"],
  utmSource: ["utmsource", "source", "origem"],
  utmMedium: ["utmmedium", "medium", "midia"],
  utmCampaign: ["utmcampaign", "campaign", "campanha"],
  utmContent: ["utmcontent", "content", "conteudo", "criativo"],
  utmTerm: ["utmterm", "term", "termo"],
};

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function limpo(valor: unknown): string | null {
  if (valor == null) return null;
  // Número e booleano chegam quando o corpo é JSON; `[object Object]` não serve
  // de telefone, então objeto e array ficam de fora.
  if (typeof valor === "object") return null;
  const t = String(valor).trim();
  return t.length > 0 ? t : null;
}

/**
 * O corpo do webhook virando objeto, seja ele form-urlencoded ou JSON.
 *
 * Devolve `null` quando não dá para interpretar — o caller responde 200 e
 * descarta, porque não-2xx faz o remetente reenviar em laço.
 */
export function parseCorpoDeWebhook(
  bruto: unknown,
  contentType: string,
): Record<string, unknown> | null {
  if (bruto && typeof bruto === "object" && !Array.isArray(bruto)) {
    return bruto as Record<string, unknown>;
  }
  if (typeof bruto !== "string" || bruto.trim().length === 0) return null;

  if (contentType.includes("x-www-form-urlencoded")) {
    return Object.fromEntries(new URLSearchParams(bruto));
  }

  try {
    const json = JSON.parse(bruto) as unknown;
    // O n8n manda o nó inteiro às vezes: `[{ body: {...} }]`. Pegamos o
    // primeiro item e descemos em `body` quando existe — é o que chega de fato.
    const primeiro = Array.isArray(json) ? json[0] : json;
    if (!primeiro || typeof primeiro !== "object") return null;
    const obj = primeiro as Record<string, unknown>;
    const corpo = obj.body;
    if (corpo && typeof corpo === "object" && !Array.isArray(corpo)) {
      return corpo as Record<string, unknown>;
    }
    return obj;
  } catch {
    return null;
  }
}

/**
 * O corpo cru virando lead, ou `null` quando não há identificador nenhum.
 *
 * Sem e-mail nem telefone o lead não entra em "únicos" (o dedup do funil é por
 * e-mail, com os 8 últimos dígitos do telefone como reserva) e não dá para
 * mandar ao CAPI: é uma linha que só inflaria o total. O caller responde 200 e
 * descarta — webhook que devolve erro faz o Mautic reenviar em laço.
 */
export function normalizarLead(corpo: Record<string, unknown>): LeadRecebido | null {
  const porChave = new Map<string, unknown>();
  for (const [k, v] of Object.entries(corpo)) {
    const n = norm(k);
    // A primeira ocorrência ganha: `email` antes de `email_confirmacao`.
    if (!porChave.has(n)) porChave.set(n, v);
  }

  const pegar = (campo: keyof LeadRecebido): string | null => {
    for (const apelido of APELIDOS[campo]) {
      const v = limpo(porChave.get(apelido));
      if (v) return v;
    }
    return null;
  };

  const email = pegar("email");
  const telefone = pegar("telefone");
  if (!email && !telefone) return null;

  return {
    nome: pegar("nome"),
    email: email ? email.toLowerCase() : null,
    telefone,
    utmSource: pegar("utmSource"),
    utmMedium: pegar("utmMedium"),
    utmCampaign: pegar("utmCampaign"),
    utmContent: pegar("utmContent"),
    utmTerm: pegar("utmTerm"),
  };
}

const formatadorBr = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/**
 * `dd/mm/aaaa hh:mm:ss` no fuso do negócio — o formato que a planilha do Google
 * escreveria em pt-BR.
 *
 * Importa qual: os leitores de data do repo tratam `dd/mm/aaaa` como dia
 * literal e só convertem fuso quando a string é um instante com `Z`. Gravar ISO
 * com `Z` faria o lead de 21h de São Paulo cair no dia seguinte em quem
 * converte e no mesmo dia em quem não converte — duas contagens para o mesmo
 * lead.
 */
export function dataComoPlanilha(instante: Date): string {
  return formatadorBr.format(instante).replace(",", "");
}

export interface LinhaDeFonte extends LeadRecebido {
  recebidoEm: Date;
}

/** As linhas do banco na forma que o resto do sistema já sabe ler. */
export function leadsComoPlanilha(leads: LinhaDeFonte[]): {
  headers: string[];
  rows: string[][];
  totalRows: number;
} {
  const rows = leads.map((l) => [
    dataComoPlanilha(l.recebidoEm),
    l.nome ?? "",
    l.email ?? "",
    l.telefone ?? "",
    l.utmSource ?? "",
    l.utmMedium ?? "",
    l.utmCampaign ?? "",
    l.utmContent ?? "",
    l.utmTerm ?? "",
  ]);
  return { headers: [...COLUNAS], rows, totalRows: rows.length };
}
