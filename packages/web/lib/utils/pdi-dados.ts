/**
 * Lê os dados do documento de PDI.
 *
 * O HTML que a liderança sobe não é um texto formatado: é uma página que se
 * desenha sozinha a partir de um `<script type="application/json">`. O dado
 * sempre esteve estruturado ali dentro — o que faltava era alguém lê-lo.
 *
 * Com isso o PDI deixa de precisar de iframe: em vez de embutir uma página
 * inteira (com o CSS dela, o script dela e uma barra de rolagem própria), o app
 * renderiza os mesmos campos com os componentes dele.
 *
 * Quem não casar com este formato continua indo pro iframe — o visualizador
 * decide por documento, então um PDI fora do padrão não some da tela.
 */

export interface AtributoDoPdi {
  label: string;
  /** Nota de 0 a 10 — é a escala que o próprio documento usa. */
  value: number;
}

export interface CicloDoPdi {
  label: string;
  monthOf: string;
  percent: number;
}

export interface PdiDados {
  eyebrow: string;
  levelBadge: string;
  name: string;
  role: string;
  company: string;
  motto: string;
  attributes: AtributoDoPdi[];
  strengths: string[];
  achievements: string[];
  improvements: string[];
  studies: string[];
  cycle: CicloDoPdi;
  goals: string[];
  issued: string;
  cardNumber: string;
  /** Retrato embutido no documento (data: URI). Fica fora do bloco JSON. */
  foto: string | null;
}

function texto(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function listaDeTextos(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map(texto).filter(Boolean);
}

function atributos(v: unknown): AtributoDoPdi[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((item) => {
      const o = item as { label?: unknown; value?: unknown };
      const label = texto(o?.label);
      const value = typeof o?.value === "number" ? o.value : Number(o?.value);
      if (!label || !Number.isFinite(value)) return null;
      // Prende na escala do documento: nota fora de 0–10 viraria barra estourada.
      return { label, value: Math.min(10, Math.max(0, value)) };
    })
    .filter((a): a is AtributoDoPdi => a !== null);
}

/**
 * O bloco JSON do documento.
 *
 * Pega o ÚLTIMO `application/json` do arquivo: o template põe os dados no fim,
 * e um documento que um dia carregue outro bloco antes (metadados, por
 * exemplo) não pode fazer a leitura casar com o bloco errado.
 */
function blocoJson(html: string): unknown | null {
  const re = /<script[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let ultimo: string | null = null;
  for (const m of html.matchAll(re)) ultimo = m[1];
  if (!ultimo) return null;
  try {
    return JSON.parse(ultimo);
  } catch {
    // JSON quebrado não é erro de programa: é documento fora do padrão, e o
    // visualizador tem o iframe como saída.
    return null;
  }
}

/**
 * O retrato do documento.
 *
 * Mora no markup (`<img>` dentro de `.portrait-wrap`), não no JSON — por isso
 * sai por outro caminho. Só `data:` é aceito: um `src` http faria o navegador
 * de quem abre buscar um recurso no servidor de quem montou o arquivo, e o
 * ganho de não ter HTML de terceiro rodando aqui iria embora junto.
 */
function retrato(html: string): string | null {
  const bloco = html.match(/class=["'][^"']*portrait-wrap[^"']*["'][\s\S]{0,400}?<img[^>]*>/i);
  const alvo = bloco ? bloco[0] : html.match(/<img[^>]*>/i)?.[0];
  if (!alvo) return null;
  const src = alvo.match(/src=["'](data:image\/[a-z+]+;base64,[A-Za-z0-9+/=\s]+)["']/i);
  return src ? src[1].replace(/\s+/g, "") : null;
}

export function extrairDadosDoPdi(html: string): PdiDados | null {
  const cru = blocoJson(html);
  if (!cru || typeof cru !== "object") return null;
  const d = cru as Record<string, unknown>;

  const nome = texto(d.name);
  const attrs = atributos(d.attributes);
  // Nome e atributos são o mínimo para a carta fazer sentido. Sem eles, o que
  // sairia é um card vazio com moldura bonita — pior que o iframe.
  if (!nome || attrs.length === 0) return null;

  const c = (d.cycle ?? {}) as Record<string, unknown>;
  const percent = typeof c.percent === "number" ? c.percent : Number(c.percent);

  return {
    eyebrow: texto(d.eyebrow) || "PDI",
    levelBadge: texto(d.levelBadge),
    name: nome,
    role: texto(d.role),
    company: texto(d.company),
    motto: texto(d.motto),
    attributes: attrs,
    strengths: listaDeTextos(d.strengths),
    achievements: listaDeTextos(d.achievements),
    improvements: listaDeTextos(d.improvements),
    studies: listaDeTextos(d.studies),
    cycle: {
      label: texto(c.label),
      monthOf: texto(c.monthOf),
      percent: Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) : 0,
    },
    goals: listaDeTextos(d.goals),
    issued: texto(d.issued),
    cardNumber: texto(d.cardNumber),
    foto: retrato(html),
  };
}
