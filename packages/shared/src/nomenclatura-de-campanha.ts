/**
 * Story 47.3 / 47.8 — o NOME da campanha do perpétuo: como nasce e como se lê.
 *
 *   expert_funil_produto_oferta_perpetuo_ano_temp_leilao_formato_lp[_vNN]
 *   bbe_a01_churrasco_of01_perpetuo_2026_hot_cbo_videos_lpa          (55 caracteres)
 *
 * ## Template v2 (Story 47.8, pedido do dono em 2026-09-10)
 *
 * Dez campos, nove `_`. O funil vem colado no expert ("bbe a01" é como a
 * operação fala), o produto desce para a 3ª posição, e o campo 5 é a
 * CONSTANTE `perpetuo` — este dicionário é só de perpétuo, então não há
 * segundo valor a escolher (D12). `CampaignFields` continua com os nove
 * campos que alguém escolhe; a constante entra só no texto.
 *
 * O v1 (`expert_produto_funil_oferta_ano_…`, 9 campos) rodou de 2026-09-09
 * a 2026-09-10. Nome publicado no Meta não muda (regra 6); o validador
 * reconhece a contagem antiga e diz de onde ela vem, mas não converte (D14).
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
/** Campo 5, constante (Story 47.8, D12): este dicionário é só de perpétuo. */
export const PERPETUO = "perpetuo";

/** Os nove campos que alguém ESCOLHE. A constante `perpetuo` não está aqui. */
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

/** Uma posição do nome: um campo escolhido ou a constante (`kind` = `perpetuo`). */
export type PosicaoDoNome = CampoDoNome | "kind";

/**
 * Ordem posicional do NOME — dez posições. A planilha quebra o nome nesta
 * ordem. Mudou UMA vez (v1 → v2, Story 47.8); não muda por conveniência.
 */
export const ORDEM_DO_NOME: readonly PosicaoDoNome[] = [
  "expert",
  "funnel",
  "product",
  "offer",
  "kind",
  "year",
  "temperature",
  "auction",
  "format",
  "lp",
];

/** Só os campos escolhidos, na ordem em que aparecem no nome (sem a constante). */
export const ORDEM_DOS_CAMPOS: readonly CampoDoNome[] = ORDEM_DO_NOME.filter((p): p is CampoDoNome => p !== "kind");

export const TOTAL_DE_CAMPOS = ORDEM_DO_NOME.length;
export const TOTAL_DE_SEPARADORES = TOTAL_DE_CAMPOS - 1;

export type BlocoDoNome = "identidade" | "ano" | "segmentacao";

/** Rótulo (pt-BR, para mensagens) e bloco de cor (spec § 2) de cada posição. */
export const CAMPO: Record<PosicaoDoNome, { posicao: number; rotulo: string; bloco: BlocoDoNome }> = {
  expert: { posicao: 1, rotulo: "expert", bloco: "identidade" },
  funnel: { posicao: 2, rotulo: "funil", bloco: "identidade" },
  product: { posicao: 3, rotulo: "produto", bloco: "identidade" },
  offer: { posicao: 4, rotulo: "oferta", bloco: "identidade" },
  kind: { posicao: 5, rotulo: "tipo", bloco: "identidade" },
  year: { posicao: 6, rotulo: "ano", bloco: "ano" },
  temperature: { posicao: 7, rotulo: "temperatura", bloco: "segmentacao" },
  auction: { posicao: 8, rotulo: "leilão", bloco: "segmentacao" },
  format: { posicao: 9, rotulo: "formato", bloco: "segmentacao" },
  lp: { posicao: 10, rotulo: "lp", bloco: "segmentacao" },
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

/** O valor de uma posição: o campo escolhido, ou a constante. */
function valorDaPosicao(fields: Partial<CampaignFields>, posicao: PosicaoDoNome): string | undefined {
  return posicao === "kind" ? PERPETUO : fields[posicao];
}

/**
 * Monta o nome. Lança `Error` nomeando o campo se algum valor estiver vazio,
 * fora de `[a-z0-9-]`, ou se o sufixo não for `vNN`.
 */
export function buildCampaignName(fields: CampaignFields): string {
  const partes = ORDEM_DO_NOME.map((posicao) => {
    const valor = valorDaPosicao(fields, posicao);
    if (!valor) throw new Error(`campo ${CAMPO[posicao].posicao} (${CAMPO[posicao].rotulo}): vazio`);
    if (!VALOR_DE_CAMPO.test(valor)) {
      throw new Error(`campo ${CAMPO[posicao].posicao} (${CAMPO[posicao].rotulo}): "${valor}" fora de [a-z0-9-]`);
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
  campo: PosicaoDoNome | "suffix";
  valor: string;
  bloco: BlocoDoNome | "sufixo";
  /** `true` quando o campo ainda não foi escolhido — a prévia mostra `…`. A constante nunca falta. */
  faltando: boolean;
}

/** Pedaços do nome, aceitando campos vazios (prévia parcial, spec § 7). Dez pedaços (+ sufixo). */
export function pedacosDoNome(fields: Partial<CampaignFields>): PedacoDoNome[] {
  const pedacos: PedacoDoNome[] = ORDEM_DO_NOME.map((posicao) => {
    const valor = valorDaPosicao(fields, posicao) ?? "";
    return { campo: posicao, valor, bloco: CAMPO[posicao].bloco, faltando: !valor };
  });
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

const erroDe = (campo: PosicaoDoNome, motivo: string) => `campo ${CAMPO[campo].posicao} (${CAMPO[campo].rotulo}): ${motivo}`;

/** Contagem do template v1 (9 campos) — só para a dica do validador (Story 47.8, AC2). */
const CAMPOS_DO_V1 = 9;
export const DICA_DO_PADRAO_ANTIGO = `parece o padrão anterior (${CAMPOS_DO_V1} campos, funil na 3ª posição) — o padrão atual tem ${TOTAL_DE_CAMPOS} campos, com "${PERPETUO}" na 5ª (Story 47.8)`;

/**
 * Quebra um nome em dez campos (+ sufixo) e valida cada um contra o
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
  const ultimo = partes[partes.length - 1];
  if (partes.length === TOTAL_DE_CAMPOS + 1 && SUFIXO.test(ultimo)) suffix = partes.pop();
  // v1 com sufixo tem exatamente dez pedaços e o último é vNN — mas o 5º não é `perpetuo`
  // (um `vNN` nunca é código de LP). Tira o sufixo para a contagem acusar o padrão antigo.
  else if (partes.length === TOTAL_DE_CAMPOS && SUFIXO.test(ultimo) && partes[4] !== PERPETUO) suffix = partes.pop();
  if (partes.length !== TOTAL_DE_CAMPOS) {
    errors.push(
      `esperados ${TOTAL_DE_SEPARADORES} separadores "_" (${TOTAL_DE_CAMPOS} campos), encontrados ${partes.length - 1} (${partes.length} campos)`,
    );
    if (partes.length === CAMPOS_DO_V1) errors.push(DICA_DO_PADRAO_ANTIGO);
    return { valid: false, partes: suffix ? [...partes, suffix] : partes, errors, avisos };
  }

  partes.forEach((p, i) => {
    const campo = ORDEM_DO_NOME[i];
    if (p === "") errors.push(erroDe(campo, "vazio (dois _ seguidos?)"));
    else if (!VALOR_DE_CAMPO.test(p)) errors.push(erroDe(campo, `"${p}" fora de [a-z0-9-]`));
  });
  if (errors.length) return { valid: false, partes: suffix ? [...partes, suffix] : partes, errors, avisos };

  const [expert, funnel, product, offer, kind, year, temperature, auction, format, lp] = partes;

  if (kind !== PERPETUO) errors.push(erroDe("kind", `"${kind}" — o único valor é "${PERPETUO}"`));

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
