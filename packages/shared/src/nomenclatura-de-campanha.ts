/**
 * Story 47.3 — o NOME da campanha do perpétuo: como nasce e como se lê.
 *
 *   expert_produto_funil_oferta_ano_temp_leilao_formato_lp[_vNN]
 *   bbe_churrasco_a01_of01_2026_hot_cbo_videos_lpa            (46 caracteres)
 *
 * Duas funções puras, usadas pelo servidor (gravar e validar) e pela prévia do
 * gerador no navegador (spec § 8):
 *
 * - `buildCampaignName(fields)` monta o nome. Lança se qualquer valor violar o
 *   formato — nunca produz um nome que a planilha não consegue quebrar.
 * - `parseCampaignName(name, dicionario)` quebra e valida CONTRA O DICIONÁRIO
 *   que recebeu. O núcleo é puro: quem carrega o dicionário do banco é a API
 *   (`snapshotDoDicionario`); a prévia usa o que os selects já carregaram.
 *   Cadastrar `carrossel` em Formato torna o nome válido sem deploy porque o
 *   snapshot é lido a cada chamada, não na compilação (spec § 8, AC 13).
 *
 * ## Duas leituras do dicionário, de propósito
 *
 * | operação             | snapshot     | por quê                                     |
 * |----------------------|--------------|---------------------------------------------|
 * | gravar campanha      | só ativos    | regra 8: valor fora do dicionário vigente é erro |
 * | validar nome antigo  | com inativos | regra 4: código desativado não perdeu o significado |
 *
 * `parseCampaignName` aceita inativos e devolve `avisos` — quem chama decide
 * o snapshot. `buildCampaignName` não olha dicionário nenhum: só formato.
 *
 * ## Módulo folha, sem imports
 *
 * Mesmo desenho de `nomenclatura-codigos.ts` (Story 47.1). Web importa por
 * `@loyola-x/shared/src/nomenclatura-de-campanha`; API por bare import via
 * `index.ts`. Não são intercambiáveis (Story 19.14).
 *
 * ⚠️ Não é o `campaign-name.ts` da 44.4 — aquele agrupa nomes que a Meta
 * devolve; este define como o nome NASCE.
 */

export const SEPARADOR = "_";
export const OFMIX = "ofmix";
export const LPMIX = "lpmix";
export const NA = "na";

export type CampoDoNome =
  | "expert"
  | "product"
  | "funnel"
  | "offer"
  | "year"
  | "temperature"
  | "auction"
  | "format"
  | "lp";

/** Ordem posicional — a planilha quebra o nome nesta ordem. Nunca muda. */
export const ORDEM_DOS_CAMPOS: readonly CampoDoNome[] = [
  "expert",
  "product",
  "funnel",
  "offer",
  "year",
  "temperature",
  "auction",
  "format",
  "lp",
];

export type BlocoDoNome = "identidade" | "ano" | "segmentacao";

/** Rótulo (pt-BR, para mensagens) e bloco de cor (spec § 2) de cada campo. */
export const CAMPO: Record<CampoDoNome, { posicao: number; rotulo: string; bloco: BlocoDoNome }> = {
  expert: { posicao: 1, rotulo: "expert", bloco: "identidade" },
  product: { posicao: 2, rotulo: "produto", bloco: "identidade" },
  funnel: { posicao: 3, rotulo: "funil", bloco: "identidade" },
  offer: { posicao: 4, rotulo: "oferta", bloco: "identidade" },
  year: { posicao: 5, rotulo: "ano", bloco: "ano" },
  temperature: { posicao: 6, rotulo: "temperatura", bloco: "segmentacao" },
  auction: { posicao: 7, rotulo: "leilão", bloco: "segmentacao" },
  format: { posicao: 8, rotulo: "formato", bloco: "segmentacao" },
  lp: { posicao: 9, rotulo: "lp", bloco: "segmentacao" },
};

export interface CampaignFields {
  expert: string;
  product: string;
  funnel: string;
  /** `offers.code` ou `ofmix`. */
  offer: string;
  year: string;
  temperature: string;
  auction: string;
  format: string;
  /** `landing_pages.code`, `lpmix` ou `na`. */
  lp: string;
  /** `vNN`, só para distinguir campanhas idênticas no mesmo ano. Entra no fim. */
  suffix?: string;
}

const VALOR_DE_CAMPO = /^[a-z0-9-]+$/;
const SUFIXO = /^v\d{2}$/;

/**
 * Monta o nome. Lança `Error` nomeando o campo se algum valor estiver vazio,
 * fora de `[a-z0-9-]`, ou se o sufixo não for `vNN`.
 */
export function buildCampaignName(fields: CampaignFields): string {
  const partes = ORDEM_DOS_CAMPOS.map((campo) => {
    const valor = fields[campo];
    if (!valor) throw new Error(`campo ${CAMPO[campo].posicao} (${CAMPO[campo].rotulo}): vazio`);
    if (!VALOR_DE_CAMPO.test(valor)) {
      throw new Error(`campo ${CAMPO[campo].posicao} (${CAMPO[campo].rotulo}): "${valor}" fora de [a-z0-9-]`);
    }
    return valor;
  });
  if (fields.suffix !== undefined && fields.suffix !== "") {
    if (!SUFIXO.test(fields.suffix)) throw new Error(`sufixo: "${fields.suffix}" não é vNN`);
    partes.push(fields.suffix);
  }
  return partes.join(SEPARADOR);
}

/** O que a prévia precisa para colorir: cada pedaço com o bloco dele. */
export interface PedacoDoNome {
  campo: CampoDoNome | "suffix";
  valor: string;
  bloco: BlocoDoNome | "sufixo";
  /** `true` quando o campo ainda não foi escolhido — a prévia mostra `…`. */
  faltando: boolean;
}

/** Pedaços do nome, aceitando campos vazios (prévia parcial, spec § 7). */
export function pedacosDoNome(fields: Partial<CampaignFields>): PedacoDoNome[] {
  const pedacos: PedacoDoNome[] = ORDEM_DOS_CAMPOS.map((campo) => ({
    campo,
    valor: fields[campo] ?? "",
    bloco: CAMPO[campo].bloco,
    faltando: !fields[campo],
  }));
  if (fields.suffix) pedacos.push({ campo: "suffix", valor: fields.suffix, bloco: "sufixo", faltando: false });
  return pedacos;
}

// ─────────────────────────── parse ───────────────────────────

export interface DicionarioSnapshot {
  experts: { code: string; active: boolean }[];
  produtos: { expert: string; slug: string; active: boolean }[];
  funis: { expert: string; code: string; active: boolean }[];
  ofertas: { expert: string; code: string; active: boolean }[];
  lps: { expert: string; product: string; funnel: string; offer: string; code: string; active: boolean }[];
  valores: { type: "year" | "temperature" | "auction" | "format"; value: string; active: boolean }[];
}

export interface ParseResult {
  valid: boolean;
  fields?: CampaignFields;
  /** Os pedaços brutos, mesmo quando inválido — o validador mostra o que conseguiu quebrar. */
  partes: string[];
  errors: string[];
  /** Válido, mas com valor inativo — nome antigo que continua legível (regra 4). */
  avisos: string[];
}

const erroDe = (campo: CampoDoNome, motivo: string) => `campo ${CAMPO[campo].posicao} (${CAMPO[campo].rotulo}): ${motivo}`;

/**
 * Quebra um nome em nove campos (+ sufixo) e valida cada um contra o
 * dicionário recebido. Erros apontam campo e motivo; um erro estrutural
 * (contagem, caractere) interrompe antes da validação semântica — não faz
 * sentido dizer que "a oferta não existe" quando os campos estão deslocados.
 */
export function parseCampaignName(name: string, dicionario: DicionarioSnapshot): ParseResult {
  const bruto = String(name ?? "").trim();
  const partes = bruto === "" ? [] : bruto.split(SEPARADOR);
  const errors: string[] = [];
  const avisos: string[] = [];

  if (bruto === "") return { valid: false, partes, errors: ["nome vazio"], avisos };
  if (bruto !== bruto.toLowerCase()) errors.push("o nome tem maiúscula — a convenção é toda minúscula");

  let suffix: string | undefined;
  if (partes.length === 10 && SUFIXO.test(partes[9])) suffix = partes.pop();
  if (partes.length !== 9) {
    errors.push(`esperados 8 separadores "_" (9 campos), encontrados ${partes.length - 1} (${partes.length} campos)`);
    return { valid: false, partes: suffix ? [...partes, suffix] : partes, errors, avisos };
  }

  partes.forEach((p, i) => {
    const campo = ORDEM_DOS_CAMPOS[i];
    if (p === "") errors.push(erroDe(campo, "vazio (dois _ seguidos?)"));
    else if (!VALOR_DE_CAMPO.test(p)) errors.push(erroDe(campo, `"${p}" fora de [a-z0-9-]`));
  });
  if (errors.length) return { valid: false, partes: suffix ? [...partes, suffix] : partes, errors, avisos };

  const [expert, product, funnel, offer, year, temperature, auction, format, lp] = partes;

  const e = dicionario.experts.find((x) => x.code === expert);
  if (!e) errors.push(erroDe("expert", `"${expert}" não está cadastrado`));
  else if (!e.active) avisos.push(erroDe("expert", `${expert} está inativo`));

  const prod = dicionario.produtos.find((x) => x.expert === expert && x.slug === product);
  if (e && !prod) errors.push(erroDe("product", `"${product}" não está cadastrado para ${expert}`));
  else if (prod && !prod.active) avisos.push(erroDe("product", `${product} está inativo`));

  const fun = dicionario.funis.find((x) => x.expert === expert && x.code === funnel);
  if (e && !fun) errors.push(erroDe("funnel", `"${funnel}" não está cadastrado para ${expert}`));
  else if (fun && !fun.active) avisos.push(erroDe("funnel", `${funnel} está inativo`));

  const ehOfmix = offer === OFMIX;
  const of = ehOfmix ? null : dicionario.ofertas.find((x) => x.expert === expert && x.code === offer);
  if (e && !ehOfmix && !of) errors.push(erroDe("offer", `"${offer}" não está cadastrada para ${expert}`));
  else if (of && !of.active) avisos.push(erroDe("offer", `${offer} está inativa`));

  const valorFixo = (campo: "year" | "temperature" | "auction" | "format", valor: string) => {
    const v = dicionario.valores.find((x) => x.type === campo && x.value === valor);
    if (!v) errors.push(erroDe(campo, `"${valor}" não está no dicionário de ${CAMPO[campo].rotulo}`));
    else if (!v.active) avisos.push(erroDe(campo, `${valor} está inativo`));
  };
  valorFixo("year", year);
  valorFixo("temperature", temperature);
  valorFixo("auction", auction);
  valorFixo("format", format);

  if (lp !== LPMIX && lp !== NA) {
    // Com ofmix, a LP pode ser de qualquer oferta do mesmo expert+produto+funil (spec § 7).
    const candidatas = dicionario.lps.filter(
      (x) => x.expert === expert && x.product === product && x.funnel === funnel && (ehOfmix || x.offer === offer) && x.code === lp,
    );
    if (e && prod && fun && (ehOfmix || of)) {
      if (candidatas.length === 0) {
        errors.push(erroDe("lp", `"${lp}" não está cadastrada para ${expert}/${product}/${funnel}/${offer}`));
      } else if (candidatas.every((c) => !c.active)) {
        avisos.push(erroDe("lp", `${lp} está inativa`));
      }
    }
  }

  const fields: CampaignFields = { expert, product, funnel, offer, year, temperature, auction, format, lp, ...(suffix ? { suffix } : {}) };
  return { valid: errors.length === 0, fields: errors.length === 0 ? fields : undefined, partes: suffix ? [...partes, suffix] : partes, errors, avisos };
}
