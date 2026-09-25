/**
 * Story 47.5 — campanhas LEGADAS do perpétuo: como reconhecê-las pelo nome
 * antigo e o que dá para sugerir dos nove campos a partir dele.
 *
 * Duas famílias de nome antigo convivem em produção (medido em 2026-09-09):
 *
 *   estruturado  bbe-a1-jul-26--venda--perpetuo--hot_cbo_estaticos[_lpX]
 *   texto livre  [VENDAS] [PERPETUO] [CPF] [FRIO] - Teste de criativos
 *
 * O filtro é por TOKEN: `a1`/`a2` com borda não alfanumérica dos dois lados e
 * sem dígito depois, ou `perpetuo`. Como substring, `a1` casaria `a10`, `ba1`
 * e trouxe +28 campanhas que não são perpétuo na medição. Story 47.17: também
 * a sigla colada ao funil entre colchetes (`[FZA1]`) — ver `FUNIL_ENTRE_COLCHETES`.
 *
 * A sugestão só devolve valores que EXISTEM no snapshot do dicionário — o
 * parser reconhece `vencedores` no nome, mas não é formato cadastrado, então
 * fica vazio para a pessoa decidir. Nunca inventa oferta.
 *
 * Módulo folha, sem imports (ver `nomenclatura-codigos.ts`).
 */

/**
 * Story 47.17 — a forma `[<sigla do expert>A<N>]` (`[FZA1]`, `[DGA1]`): sigla de
 * 2 a 4 letras (o formato de `naming_experts.code`) colada ao funil, entre
 * colchetes; o grupo 1 é o N (1–2 dígitos).
 *
 * UMA definição só, lida em três lugares: a fila de Legadas (dentro de
 * `REGEX_LEGADA_SQL`, no `~*` do Postgres e no `RegExp` do JS), a sugestão de
 * funil de `sugerirClassificacao` e a leitura de funil da 29.79
 * (`funil-e-oferta.ts`, que importa daqui). Por isso é texto válido nos DOIS
 * dialetos: `\[`/`\]` literais e `[0-9]` em vez de `\d`. Casa em minúsculas
 * — quem lê sem `i` precisa baixar a caixa antes.
 *
 * Mora aqui, e não na 29.79, porque este módulo é importado por VALOR no web
 * (subpath) e tem que continuar folha, sem imports.
 */
export const FUNIL_ENTRE_COLCHETES = "\\[[a-z]{2,4}a([0-9]{1,2})\\]";

/** A MESMA expressão que a consulta SQL usa (`~*`). Mudar aqui é mudar lá. */
export const REGEX_LEGADA_SQL = `(^|[^a-z0-9])(a1|a2)([^a-z0-9]|$)|perpetuo|perpétuo|${FUNIL_ENTRE_COLCHETES}`;
const REGEX_LEGADA = new RegExp(REGEX_LEGADA_SQL, "i");
const FUNIL_COLADO = new RegExp(FUNIL_ENTRE_COLCHETES);

export function ehCandidataALegada(nome: string | null | undefined): boolean {
  if (!nome) return false;
  return REGEX_LEGADA.test(nome);
}

export type CampoSugerido = "expert" | "product" | "funnel" | "offer" | "year" | "temperature" | "auction" | "format" | "lp";
export type Confianca = "alta" | "media";

export interface SugestaoDeClassificacao {
  campos: Partial<Record<CampoSugerido, string>>;
  confianca: Partial<Record<CampoSugerido, Confianca>>;
  /** O que o parser reconheceu mas não existe no dicionário — para a pessoa ver. */
  naoCadastrado: string[];
}

interface Snapshot {
  experts: { code: string; active: boolean }[];
  produtos: { expert: string; slug: string; active: boolean }[];
  funis: { expert: string; code: string; active: boolean }[];
  ofertas: { expert: string; code: string; active: boolean }[];
  lps: { expert: string; product: string; funnel: string; offer: string; code: string; active: boolean }[];
  valores: { type: "year" | "temperature" | "auction" | "format"; value: string; active: boolean }[];
}

const MES: Record<string, number> = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12 };

function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Sugere campos a partir do nome antigo. `expertHint` é o code do expert
 * deduzido do PROJETO (47.5 AC1) — quando vem, prevalece sobre o prefixo do
 * nome, porque o projeto é dado, o prefixo é convenção antiga.
 */
export function sugerirClassificacao(nomeAntigo: string, snapshot: Snapshot, expertHint?: string): SugestaoDeClassificacao {
  const nome = semAcento(String(nomeAntigo ?? "")).toLowerCase();
  const campos: SugestaoDeClassificacao["campos"] = {};
  const confianca: SugestaoDeClassificacao["confianca"] = {};
  const naoCadastrado: string[] = [];
  const ativos = <T extends { active: boolean }>(xs: T[]) => xs.filter((x) => x.active);
  const valor = (type: Snapshot["valores"][number]["type"], v: string) => ativos(snapshot.valores).some((x) => x.type === type && x.value === v);

  // expert: projeto > prefixo `bbe-`
  const prefixo = nome.match(/^([a-z]{2,4})-/)?.[1];
  const expert = expertHint ?? (prefixo && ativos(snapshot.experts).some((e) => e.code === prefixo) ? prefixo : undefined);
  if (expert) {
    campos.expert = expert;
    confianca.expert = expertHint ? "alta" : "media";
  } else if (prefixo) naoCadastrado.push(`expert ${prefixo}`);

  // funil: `-a1-` → a01; senão `[fza1]` → a01 (47.17). A forma delimitada vem
  // primeiro para que nenhum nome que já tinha sugestão mude de funil.
  const fun = nome.match(/(^|[^a-z0-9])a(\d)([^0-9]|$)/)?.[2] ?? nome.match(FUNIL_COLADO)?.[1];
  if (fun && expert) {
    const code = `a${fun.padStart(2, "0")}`; // `[fza10]` → a10, nunca a010
    if (ativos(snapshot.funis).some((f) => f.expert === expert && f.code === code)) {
      campos.funnel = code;
      confianca.funnel = "media";
    } else naoCadastrado.push(`funil ${code} de ${expert}`);
  }

  // produto: só quando o expert tem UM produto ativo (não há pista no nome antigo)
  if (expert) {
    const dele = ativos(snapshot.produtos).filter((p) => p.expert === expert);
    if (dele.length === 1) {
      campos.product = dele[0].slug;
      confianca.product = "media";
    }
  }

  // temperatura
  const temp = /(^|[^a-z])(hot|quente)([^a-z]|$)/.test(nome) ? "hot" : /(^|[^a-z])(cold|frio)([^a-z]|$)/.test(nome) ? "cold" : undefined;
  if (temp) {
    if (valor("temperature", temp)) { campos.temperature = temp; confianca.temperature = "alta"; } else naoCadastrado.push(`temperatura ${temp}`);
  }

  // leilão
  const leilao = nome.match(/(^|[^a-z])(cbo|abo)([^a-z]|$)/)?.[2];
  if (leilao) {
    if (valor("auction", leilao)) { campos.auction = leilao; confianca.auction = "alta"; } else naoCadastrado.push(`leilão ${leilao}`);
  }

  // formato: só o que o dicionário conhece; `vencedores` etc. vira aviso
  const formatos = ativos(snapshot.valores).filter((v) => v.type === "format").map((v) => v.value);
  const tokens = nome.split(/[^a-z0-9]+/).filter(Boolean);
  const formato = tokens.find((t) => formatos.includes(t));
  if (formato) { campos.format = formato; confianca.format = "alta"; }
  else {
    const suspeito = tokens.find((t) => ["vencedores", "carrossel", "imagens", "reels", "video", "estatico"].includes(t));
    if (suspeito) naoCadastrado.push(`formato ${suspeito}`);
  }

  // ano: `jul-26` → 2026 (só se existir)
  const mesAno = nome.match(/(^|[^a-z])(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)-(\d{2})([^0-9]|$)/);
  if (mesAno && MES[mesAno[2]]) {
    const ano = `20${mesAno[3]}`;
    if (valor("year", ano)) { campos.year = ano; confianca.year = "media"; } else naoCadastrado.push(`ano ${ano}`);
  }

  // LP: `lpX` no fim, se existir para expert+produto+funil (oferta ainda não se sabe)
  const lp = nome.match(/(^|[^a-z])(lp[a-z])([^a-z]|$)/)?.[2];
  if (lp && expert && campos.product && campos.funnel) {
    const existe = ativos(snapshot.lps).some((l) => l.expert === expert && l.product === campos.product && l.funnel === campos.funnel && l.code === lp);
    if (existe) { campos.lp = lp; confianca.lp = "media"; } else naoCadastrado.push(`LP ${lp}`);
  }

  return { campos, confianca, naoCadastrado };
}
