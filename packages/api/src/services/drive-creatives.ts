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
  pastaIds: string[];
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
async function acharComEdicao(paiId: string, profundidade = 3): Promise<string[]> {
  const achadas: string[] = [];
  const porConter = NOMES.comEdicao.map(normalizar);
  const porIgualdade = NOMES.ads.map(normalizar);
  async function descer(id: string, resta: number): Promise<void> {
    const filhas = await listar(`'${id}' in parents and mimeType='${MIME_PASTA}' and trashed=false`, "id,name,mimeType");
    for (const f of filhas) {
      const n = normalizar(f.name);
      // "Ads" por IGUALDADE: `includes` casaria "ads-feio" e qualquer pasta com
      // "ads" no meio do nome. "Com edição" por conteúdo, porque vem numerada
      // ("2. Com edição").
      if (porConter.some((a) => n.includes(a)) || porIgualdade.includes(n)) {
        achadas.push(f.id);
        // Não desce mais neste ramo: subpasta de "Com edição" é organização
        // interna, e varrer tudo traria material que não é anúncio.
        continue;
      }
      if (resta > 0) await descer(f.id, resta - 1);
    }
  }
  await descer(paiId, profundidade);
  return achadas;
}

/**
 * Desce a árvore até "COM EDICAO".
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
        pastaIds: [],
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
          ? await subpastaPorPrefixo(atual, alvoDoNivel)
          : await subpasta(atual, alvoDoNivel);
      passos.push({
        nivel,
        procurado: typeof alvoDoNivel === "string" ? `${alvoDoNivel}…` : alvoDoNivel[0],
        achado: achada?.name ?? null,
      });
      if (!achada) return { ok: false, pastaIds: [], passos };
      atual = achada.id;
    }

    // "Com edição" pode estar a até três níveis abaixo da etapa.
    const comEdicao = await acharComEdicao(atual);
    passos.push({
      nivel: "COM EDICAO",
      procurado: "COM EDICAO",
      achado: comEdicao.length ? `${comEdicao.length} pasta(s)` : null,
    });
    if (comEdicao.length === 0) return { ok: false, pastaIds: [], passos };
    return { ok: true, pastaIds: comEdicao, passos };
  } catch (err) {
    return {
      ok: false,
      pastaIds: [],
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
  return (
    arquivos.find((f) => semExt(f.name) === alvo) ??
    arquivos.find((f) => semExt(f.name).startsWith(alvo)) ??
    arquivos.find((f) => alvo.startsWith(semExt(f.name)) && semExt(f.name).length > 8) ??
    null
  );
}
