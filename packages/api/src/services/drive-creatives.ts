/**
 * Criativos dos anúncios lidos do Google Drive, por CONVENÇÃO de pastas.
 *
 * ## Por que sair do preview da Meta
 *
 * O preview da Meta some quando a campanha é desligada — e é exatamente aí que
 * alguém vai olhar o histórico. No Drive o arquivo continua lá.
 *
 * ## A convenção (nada disso é configurado por campanha)
 *
 *   {Drive do expert}            ex.: "DG | GERAL"
 *     CAMPANHAS
 *       {CAMPANHA}               ex.: "DG-PG04-JUN-26"
 *         MATERIAIS
 *           CRIATIVOS VIDEO | CRIATIVOS ESTATICO
 *             {ETAPA}            ex.: "VENDAS" | "CAPTACAO"
 *               COM EDICAO       ← sempre esta
 *                 arquivos com a MESMA nomenclatura da Meta
 *
 * Cada nível é resolvido por comparação tolerante (sem acento, sem caixa, sem
 * pontuação), porque o mundo real escreve "CRIATIVOS ESTÁTICO", "Criativos
 * Estaticos" e "COM EDIÇÃO" na mesma árvore.
 *
 * ## Acesso
 *
 * Usa a mesma conta de serviço das planilhas, que já tem `drive.readonly`. Mas
 * a conta precisa ser MEMBRO do drive compartilhado do expert — compartilhar
 * arquivo por arquivo não basta pra navegar a árvore.
 */

import { readFileSync } from "node:fs";
import { createSign } from "node:crypto";

const DRIVE = "https://www.googleapis.com/drive/v3";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/drive.readonly";
const MIME_PASTA = "application/vnd.google-apps.folder";

/** Comparação tolerante: sem acento, sem caixa, sem pontuação nem espaço. */
export function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

// ============================================================
// Auth (mesma conta de serviço das planilhas)
// ============================================================

let cache: { token: string; expira: number } | null = null;

function chave(): { client_email: string; private_key: string } {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY não configurado");
  return JSON.parse(raw.trim().startsWith("{") ? raw : readFileSync(raw, "utf8"));
}

/** E-mail da conta de serviço — a tela mostra pra quem precisa dar acesso. */
export function emailDaContaDeServico(): string | null {
  try {
    return chave().client_email;
  } catch {
    return null;
  }
}

async function token(): Promise<string> {
  if (cache && cache.expira > Date.now() + 60_000) return cache.token;
  const k = chave();
  const agora = Math.floor(Date.now() / 1000);
  const cab = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const corpo = Buffer.from(
    JSON.stringify({ iss: k.client_email, scope: SCOPE, aud: TOKEN_URL, exp: agora + 3600, iat: agora }),
  ).toString("base64url");
  const assinatura = createSign("RSA-SHA256")
    .update(`${cab}.${corpo}`)
    .sign(k.private_key, "base64url");

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${cab}.${corpo}.${assinatura}`,
    }),
  });
  const d = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!d.access_token) throw new Error("Google recusou o token da conta de serviço");
  cache = { token: d.access_token, expira: Date.now() + (d.expires_in ?? 3600) * 1000 };
  return d.access_token;
}

// ============================================================
// Drive
// ============================================================

export interface ArquivoDoDrive {
  id: string;
  name: string;
  mimeType: string;
  /** Link direto pra miniatura. Expira, então nunca persistimos. */
  thumbnailLink?: string | null;
  webViewLink?: string | null;
}

async function listar(q: string, campos = "id,name,mimeType,thumbnailLink,webViewLink"): Promise<ArquivoDoDrive[]> {
  const t = await token();
  const url =
    `${DRIVE}/files?q=${encodeURIComponent(q)}` +
    `&supportsAllDrives=true&includeItemsFromAllDrives=true` +
    `&fields=${encodeURIComponent(`files(${campos})`)}&pageSize=200`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${t}` } });
  if (!res.ok) throw new Error(`Drive respondeu ${res.status}`);
  const d = (await res.json()) as { files?: ArquivoDoDrive[] };
  return d.files ?? [];
}

export interface DriveCompartilhado {
  id: string;
  name: string;
}

export async function drivesCompartilhados(): Promise<DriveCompartilhado[]> {
  const t = await token();
  const res = await fetch(`${DRIVE.replace("/files", "")}/drives?pageSize=100&fields=drives(id,name)`, {
    headers: { Authorization: `Bearer ${t}` },
  });
  if (!res.ok) throw new Error(`Drive respondeu ${res.status}`);
  const d = (await res.json()) as { drives?: DriveCompartilhado[] };
  return d.drives ?? [];
}

/**
 * Subpasta cujo nome casa com um dos apelidos.
 *
 * Igualdade primeiro, depois "contém". O drive real numera e enfeita as pastas
 * pra ordenar na interface — " 📢 - Campanhas", "1 - MATERIAIS" — então exigir
 * igualdade exata faria a árvore falhar já no segundo degrau.
 */
async function subpasta(paiId: string, apelidos: string[]): Promise<ArquivoDoDrive | null> {
  const filhas = await listar(`'${paiId}' in parents and mimeType='${MIME_PASTA}' and trashed=false`, "id,name,mimeType");
  const alvos = apelidos.map(normalizar);
  const exata = filhas.find((f) => alvos.includes(normalizar(f.name)));
  if (exata) return exata;
  // Apelido mais LONGO primeiro: "criativosestatico" antes de "estatico", pra
  // não casar a pasta errada quando as duas existem lado a lado.
  for (const alvo of [...alvos].sort((a, b) => b.length - a.length)) {
    const achada = filhas.find((f) => normalizar(f.name).includes(alvo));
    if (achada) return achada;
  }
  return null;
}

/**
 * Subpasta da campanha.
 *
 * O nome real é "16 - DG-PG04-JUN-26": prefixo numérico de ordenação na frente
 * e sufixo de mês atrás. Nem `startsWith` nem igualdade servem — o que
 * identifica é o token do meio.
 */
async function subpastaPorPrefixo(paiId: string, prefixo: string): Promise<ArquivoDoDrive | null> {
  const filhas = await listar(`'${paiId}' in parents and mimeType='${MIME_PASTA}' and trashed=false`, "id,name,mimeType");
  const alvo = normalizar(prefixo);
  const candidatas = filhas.filter((f) => normalizar(f.name).includes(alvo));
  // Mais curta primeiro: entre "dgpg04jun26" e "dgpg04jun26copia", a primeira é
  // a pasta e a segunda é sobra.
  candidatas.sort((a, b) => normalizar(a.name).length - normalizar(b.name).length);
  return candidatas[0] ?? null;
}

/**
 * A pasta da campanha — que pode estar um degrau abaixo do esperado.
 *
 * Nem todo drive guarda as campanhas soltas dentro de "Campanhas". Medido no
 * drive da BBE: elas estão separadas por natureza primeiro —
 * `Campanhas / ♾️PERPÉTUO / 01 - BBE-FC1-MAI/26`, e o mesmo para
 * `🚀 LANÇAMENTOS` e `🎤EVENTOS PRESENCIAIS`. Procurando só no nível direto, o
 * drive inteiro da BBE nunca resolveu, e o sintoma era a galeria vazia sem
 * explicação.
 *
 * Procura no nível direto primeiro: um drive que segue a convenção não paga
 * chamada extra nenhuma, e uma pasta no nível certo continua ganhando de outra
 * de nome parecido escondida numa categoria.
 */
async function acharPastaDaCampanha(
  paiId: string,
  /** Do mais específico ao mais genérico: ["BBE-FC1-A2", "BBE-FC1"]. */
  alvos: string[],
): Promise<ArquivoDoDrive | null> {
  const categorias = await listar(
    `'${paiId}' in parents and mimeType='${MIME_PASTA}' and trashed=false`,
    "id,name,mimeType",
  );

  // Por ALVO e depois por nível — não o contrário. O código mais específico
  // deve ganhar mesmo que a pasta dele esteja uma categoria abaixo, senão o
  // genérico do nível direto sempre venceria e o `matchCode` não valeria de
  // nada.
  for (const alvo of alvos) {
    const direta = await subpastaPorPrefixo(paiId, alvo);
    if (direta) return direta;
    for (const cat of categorias) {
      const dentro = await subpastaPorPrefixo(cat.id, alvo);
      if (dentro) return dentro;
    }
  }
  return null;
}

// ============================================================
// A convenção
// ============================================================

export type TipoDeCriativo = "video" | "estatico";
export type EtapaDoCriativo = "vendas" | "captacao";

const NOMES = {
  campanhas: ["CAMPANHAS", "CAMPANHA"],
  materiais: ["MATERIAIS", "MATERIAL"],
  video: ["CRIATIVOS VIDEO", "CRIATIVOS VIDEOS", "CRIATIVO VIDEO", "VIDEOS", "VIDEO"],
  estatico: ["CRIATIVOS ESTATICO", "CRIATIVOS ESTATICOS", "CRIATIVO ESTATICO", "ESTATICOS", "ESTATICO"],
  vendas: ["VENDAS", "VENDA"],
  captacao: ["CAPTACAO", "CAPTAÇÃO", "CAPTURA"],
  /**
   * Onde moram os arquivos de ANÚNCIO no fim da árvore.
   *
   * Não é uma pasta só: medido no drive real, vídeo guarda em "2. Com edição"
   * e estático guarda em "Ads" — às vezes direto na etapa, às vezes dentro de
   * "LOTE N". As irmãs "Wpp" e "Orgânico" ficam de fora de propósito: são
   * criativos de WhatsApp e orgânico, não anúncios, e entrariam como ruído na
   * galeria de ads.
   */
  comEdicao: ["COM EDICAO", "COM EDIÇÃO", "COM-EDICAO", "EDITADOS"],
  ads: ["ADS"],
  /**
   * Pastas que NUNCA entram, por mais que o resto da regra as alcance.
   *
   * "Sem edição" guarda o corte cru do mesmo anúncio — e a regra do time é
   * explícita: sempre a versão editada. Sem esta barreira, bastaria alguém
   * criar uma "Ads" dentro de "Sem edição" pro material cru entrar na galeria.
   */
  nunca: ["SEM EDICAO", "SEM EDIÇÃO", "BRUTO", "BRUTOS", "RAW"],
} as const;

/** Cada degrau da árvore, pra tela poder dizer ONDE parou. */
export interface PassoDaBusca {
  nivel: string;
  procurado: string;
  achado: string | null;
}

export interface ResolucaoDePasta {
  ok: boolean;
  /**
   * TODAS as pastas "Com edição" abaixo da etapa.
   *
   * Plural porque a árvore real não é uniforme: em Vendas/vídeo ela é filha
   * direta, em Captação/estático está dentro de cada "LOTE N", e em
   * Vendas/estático dentro de "Ads"/"Whatsapp"/"Orgânico". Pegar só a primeira
   * deixaria criativos de fora sem avisar.
   */
  pastas: { id: string; nome: string; editada: boolean }[];
  passos: PassoDaBusca[];
  /** Preenchido quando falha por acesso, não por convenção. */
  erro?: string;
}

/**
 * Procura "Com edição" abaixo de `paiId`, descendo até `profundidade` níveis.
 *
 * Existe porque o time organiza o miolo como quiser — por lote, por canal — e
 * exigir que "Com edição" fosse filha direta da etapa faria a integração
 * funcionar em um ramo de quatro.
 */
/**
 * Toda a subárvore da etapa, exceto os ramos de material cru.
 *
 * A regra anterior exigia que a pasta se CHAMASSE "Com edição" ou "Ads" — e a
 * árvore real não colabora. Medido em DG-PG04/Captação: além dos "LOTE N /
 * 2. Com edição", há uma pasta "Danilo" com 7 anúncios e um "LOTE 00" com 11
 * arquivos soltos. Dezoito criativos invisíveis, e nenhum nome de pasta que dê
 * pra catalogar: o próximo vira "Reedição pra Ads - 23 JUL" ou o nome de quem
 * editou. Catalogar apelidos é a configuração manual que queríamos evitar.
 *
 * Então o critério inverteu: entra tudo, MENOS o que é proibido. Quem decide
 * se um arquivo é anúncio é o casamento com o nome vindo da Meta — um vídeo
 * orgânico simplesmente não casa com nenhum.
 *
 * `editada` deixou de ser filtro e virou só prioridade: quando o mesmo nome
 * existe em duas pastas, a versão editada continua vencendo.
 */
async function pastasDeCriativos(
  etapaId: string,
  nomeDaEtapa: string,
  profundidade = 4,
): Promise<{ id: string; nome: string; editada: boolean }[]> {
  const porConter = NOMES.comEdicao.map(normalizar);
  const porIgualdade = NOMES.ads.map(normalizar);
  const proibidas = NOMES.nunca.map(normalizar);
  // A própria etapa entra: em várias campanhas os anúncios ficam soltos nela,
  // sem subpasta nenhuma.
  const achadas = [{ id: etapaId, nome: nomeDaEtapa, editada: false }];

  async function descer(id: string, resta: number, herdouEditada: boolean): Promise<void> {
    const filhas = await listar(
      `'${id}' in parents and mimeType='${MIME_PASTA}' and trashed=false`,
      "id,name,mimeType",
    );
    for (const f of filhas) {
      const n = normalizar(f.name);
      // Barreira: nem entra, nem desce. O que estiver embaixo de "Sem edição" é
      // material cru, independente de como a subpasta se chame — é o caso real
      // de "1. Sem edição / 1. ADS - HENRIQUE".
      if (proibidas.some((x) => n.includes(x))) continue;
      // "Ads" por IGUALDADE: `includes` casaria qualquer pasta com "ads" no
      // meio do nome. "Com edição" por conteúdo, porque vem numerada.
      const editada = herdouEditada || porConter.some((a) => n.includes(a)) || porIgualdade.includes(n);
      achadas.push({ id: f.id, nome: f.name, editada });
      if (resta > 0) await descer(f.id, resta - 1, editada);
    }
  }

  await descer(etapaId, profundidade, false);
  // Editada primeiro: quem indexa por último vence, e a versão editada tem que
  // vencer o arquivo de mesmo nome que estiver numa pasta qualquer.
  achadas.sort((a, b) => Number(b.editada) - Number(a.editada));
  return achadas;
}

/**
 * Desce a árvore até a etapa e varre o que houver embaixo dela.
 *
 * Devolve o caminho percorrido mesmo quando falha — sem isso, "não achei o
 * criativo" não diz se o problema é o drive, o nome da campanha ou a etapa, e
 * alguém perde a tarde adivinhando.
 */
export async function resolverPastaDeCriativos(opts: {
  /** Nome do drive do expert, ex. "DG | GERAL". */
  drive: string;
  /** Prefixo da campanha, ex. "DG-PG04". */
  campanha: string;
  /**
   * Códigos alternativos, do mais específico ao mais genérico.
   *
   * Existe porque o `matchCode` do funil nem sempre nomeia a PASTA DA
   * CAMPANHA. Medido na BBE: `bbe-fc1-a2` nomeia uma REMESSA dentro de
   * `01 - BBE-FC1-MAI/26`. Tentar só o específico não acharia campanha
   * nenhuma; tentar só o genérico ignoraria o código que o time declarou.
   */
  alternativos?: string[];
  tipo: TipoDeCriativo;
  etapa: EtapaDoCriativo;
}): Promise<ResolucaoDePasta> {
  const passos: PassoDaBusca[] = [];
  try {
    const drives = await drivesCompartilhados();
    const alvo = normalizar(opts.drive);
    const dr =
      drives.find((d) => normalizar(d.name) === alvo) ??
      drives.find((d) => normalizar(d.name).startsWith(alvo)) ??
      null;
    passos.push({ nivel: "Drive do expert", procurado: opts.drive, achado: dr?.name ?? null });
    if (!dr) {
      return {
        ok: false,
        pastas: [],
        passos,
        erro:
          drives.length === 0
            ? "A conta de serviço não é membro de nenhum drive compartilhado."
            : `Drives visíveis: ${drives.map((d) => d.name).join(", ")}`,
      };
    }

    let atual = dr.id;
    const degraus: [string, string[] | string][] = [
      ["CAMPANHAS", [...NOMES.campanhas]],
      ["Campanha", opts.campanha],
      ["MATERIAIS", [...NOMES.materiais]],
      [opts.tipo === "video" ? "CRIATIVOS VIDEO" : "CRIATIVOS ESTATICO", [...NOMES[opts.tipo]]],
      [opts.etapa === "vendas" ? "VENDAS" : "CAPTACAO", [...NOMES[opts.etapa]]],
    ];

    for (const [nivel, alvoDoNivel] of degraus) {
      const achada =
        typeof alvoDoNivel === "string"
          ? // A campanha é o único degrau que aceita estar uma pasta abaixo e
            // que tenta mais de um código — ver `acharPastaDaCampanha`.
            await acharPastaDaCampanha(atual, [
              alvoDoNivel,
              ...(opts.alternativos ?? []),
            ])
          : await subpasta(atual, alvoDoNivel);
      passos.push({
        nivel,
        procurado: typeof alvoDoNivel === "string" ? `${alvoDoNivel}…` : alvoDoNivel[0],
        achado: achada?.name ?? null,
      });
      if (!achada) return { ok: false, pastas: [], passos };
      atual = achada.id;
    }

    const nomeDaEtapa = passos[passos.length - 1]?.achado ?? "etapa";
    const encontradas = await pastasDeCriativos(atual, nomeDaEtapa);
    passos.push({
      nivel: "Pastas de criativos",
      procurado: "tudo sob a etapa, menos material cru",
      achado: `${encontradas.length} pasta(s): ${encontradas.map((p) => p.nome).slice(0, 8).join(", ")}`,
    });
    return { ok: true, pastas: encontradas, passos };
  } catch (err) {
    return {
      ok: false,
      pastas: [],
      passos,
      erro: err instanceof Error ? err.message : "Falha ao falar com o Drive",
    };
  }
}

/** Arquivos da pasta resolvida, já indexados pelo nome normalizado. */
export async function criativosDaPasta(pastaId: string): Promise<ArquivoDoDrive[]> {
  return listar(`'${pastaId}' in parents and mimeType!='${MIME_PASTA}' and trashed=false`);
}

/**
 * Casa o nome do anúncio da Meta com o arquivo.
 *
 * Igualdade exata primeiro; depois "o nome do arquivo começa com o do anúncio",
 * que cobre o sufixo de extensão e variações tipo `_v2`. Sem o fallback, um
 * `.mp4` a mais faria o match falhar em tudo.
 */
export function acharCriativo(arquivos: ArquivoDoDrive[], nomeDoAnuncio: string): ArquivoDoDrive | null {
  const alvo = normalizar(nomeDoAnuncio);
  if (!alvo) return null;
  const semExt = (n: string) => normalizar(n.replace(/\.[a-z0-9]{2,5}$/i, ""));
  // Só igualdade e "o arquivo começa com o nome do anúncio" (cobre a extensão
  // e sufixos tipo _v2). A regra inversa — o ANÚNCIO começar com o nome do
  // arquivo — foi removida: ela deixava um arquivo de nome curto casar com
  // vários anúncios diferentes, e um match errado é pior que nenhum.
  return (
    arquivos.find((f) => semExt(f.name) === alvo) ??
    arquivos.find((f) => semExt(f.name).startsWith(alvo)) ??
    null
  );
}
