/**
 * Story 18.83 (AC9) — a atribuição do mini-funil da LP, pela URL do anúncio.
 *
 * A tabela de LPs do lançamento passou a identificar a página pela URL de
 * destino do anúncio; o card que expande dentro dela tem de falar da MESMA
 * página, senão o card da linha `…/captura-d` contaria as pessoas da "LPD" do
 * nome da campanha — que no `bbe-pr2` não é a mesma coisa (leva03).
 *
 * ## A cadeia, nesta ordem (cada pessoa é classificada uma vez)
 *
 *  1. **UTM própria**: `utm_content → ad_id → URL` do criativo (cache do
 *     projeto; correção manual por campanha para o que o cache não resolve).
 *     O mini-funil NÃO lia `utm_content` antes (PO-09): a cadeia era a letra do
 *     `utm_term` e do `utm_campaign`. Linha só com a letra e sem `utm_content`
 *     não tem URL e vai para o passo 2 ou para `semLp`.
 *  2. **Herança** pelo e-mail (telefone como reserva) do lead de captação — a
 *     precedência de hoje.
 *
 * ## Aplicação: SÓ herança (PO-17)
 *
 * Pela decisão 7.10, o link próprio de toda aplicação é a página de VENDAS, que
 * não é linha desta tabela (de captura). Contar a aplicação pelo link próprio
 * esvaziaria o degrau "aplicações" de todo card de captura por construção.
 * Nem o `utm_content` nem a letra da própria linha contam: só a pessoa, pela
 * herança. Sem herança, `semLp`.
 *
 * Quem não casa em nada NÃO é rateado entre as páginas: vai para `semLp`.
 *
 * Pura e sem I/O: a rota lê as planilhas e o cache e entrega aqui.
 */

export type EtapaLp = "leads" | "aplicacoes" | "pesquisas";

/** Uma pessoa numa planilha: a primeira linha do contato vence (rota). */
export interface PessoaDaPlanilha {
  email: string;
  phone: string;
  /** `utmContentEfetivo` da linha — `""` quando não há. */
  adId: string;
}

export interface CompraDaPlanilha {
  email: string;
  /** `utmContentEfetivo` do `co=` da venda — `""` quando não há. */
  adId: string;
  bruto: number;
}

export type FonteDaAtribuicao = "anuncio" | "heranca";

export interface LinhaDoLpFunnel {
  /** A URL normalizada — a MESMA chave da linha da tabela. */
  lp: string;
  /** Mantido por compatibilidade de forma; URL não tem variante de rótulo. */
  variantes: string[];
  leads: number;
  aplicacoes: number;
  pesquisas: number;
  compras: number;
  receita: number;
}

export interface ResultadoDoLpFunnel {
  lps: LinhaDoLpFunnel[];
  semLp: { leads: number; aplicacoes: number; pesquisas: number; compras: number };
  /**
   * `term` e `campanha` ficam em 0: a cadeia nova não os usa, e o campo
   * continua existindo para o web anterior à 18.83 (que soma os três).
   */
  cobertura: { term: number; campanha: number; anuncio: number; heranca: number; semLp: number };
}

export function atribuirLpFunnel(args: {
  porEtapa: Record<EtapaLp, PessoaDaPlanilha[]>;
  compras: CompraDaPlanilha[];
  /** `ad_id → URL normalizada`, já com a correção manual por campanha. */
  urlDoAnuncio: (adId: string) => string | null;
}): ResultadoDoLpFunnel {
  const { porEtapa, compras, urlDoAnuncio } = args;
  const propria = (adId: string): string | null => (adId ? urlDoAnuncio(adId) : null);

  // --- Índice de herança: a página que o contato tinha na CAPTAÇÃO ---
  const porEmail = new Map<string, string>();
  const porTelefone = new Map<string, string>();
  for (const p of porEtapa.leads) {
    const url = propria(p.adId);
    if (!url) continue;
    if (p.email && !porEmail.has(p.email)) porEmail.set(p.email, url);
    if (p.phone && !porTelefone.has(p.phone)) porTelefone.set(p.phone, url);
  }
  const herdar = (email: string, phone: string): string | null =>
    (email ? porEmail.get(email) : undefined) ?? (phone ? porTelefone.get(phone) : undefined) ?? null;

  type Acc = LinhaDoLpFunnel;
  const acc = new Map<string, Acc>();
  const pegar = (url: string): Acc => {
    let a = acc.get(url);
    if (!a) {
      a = { lp: url, variantes: [], leads: 0, aplicacoes: 0, pesquisas: 0, compras: 0, receita: 0 };
      acc.set(url, a);
    }
    return a;
  };

  const semLp = { leads: 0, aplicacoes: 0, pesquisas: 0, compras: 0 };
  const cobertura = { term: 0, campanha: 0, anuncio: 0, heranca: 0, semLp: 0 };

  const registrar = (
    etapa: EtapaLp | "compras",
    url: string | null,
    fonte: FonteDaAtribuicao | null,
  ): Acc | null => {
    if (!url || !fonte) {
      semLp[etapa]++;
      cobertura.semLp++;
      return null;
    }
    cobertura[fonte]++;
    const a = pegar(url);
    a[etapa]++;
    return a;
  };

  for (const p of porEtapa.leads) {
    const url = propria(p.adId);
    registrar("leads", url, url ? "anuncio" : null);
  }
  for (const p of porEtapa.pesquisas) {
    const url = propria(p.adId);
    if (url) {
      registrar("pesquisas", url, "anuncio");
      continue;
    }
    const h = herdar(p.email, p.phone);
    registrar("pesquisas", h, h ? "heranca" : null);
  }
  // PO-17: o link próprio da aplicação é a página de VENDAS — não conta aqui.
  for (const p of porEtapa.aplicacoes) {
    const h = herdar(p.email, p.phone);
    registrar("aplicacoes", h, h ? "heranca" : null);
  }

  // Compras: dedup por e-mail — quem aparece duas vezes é uma pessoa; a
  // receita soma, a página é a da primeira linha (mesma regra de antes).
  const compradores = new Map<string, { url: string | null; fonte: FonteDaAtribuicao | null; receita: number }>();
  for (const c of compras) {
    if (!c.email) continue;
    const existente = compradores.get(c.email);
    if (existente) {
      existente.receita += c.bruto;
      continue;
    }
    const url = propria(c.adId);
    if (url) {
      compradores.set(c.email, { url, fonte: "anuncio", receita: c.bruto });
      continue;
    }
    const h = herdar(c.email, "");
    compradores.set(c.email, { url: h, fonte: h ? "heranca" : null, receita: c.bruto });
  }
  for (const c of compradores.values()) {
    const a = registrar("compras", c.url, c.fonte);
    if (a) a.receita += c.receita;
  }

  const lps = [...acc.values()]
    .map((a) => ({ ...a, receita: +a.receita.toFixed(2) }))
    // Ordena pelo topo do funil: é o número que dá escala à página.
    .sort((x, y) => y.leads - x.leads || y.compras - x.compras);

  return { lps, semLp, cobertura };
}
