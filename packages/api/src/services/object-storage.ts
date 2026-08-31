/**
 * Object storage S3-compatível.
 *
 * Escrito para o Cloudflare R2 e hoje apontado para o **Supabase Storage** em
 * produção — o `STORAGE_ENDPOINT` decide, e os dois falam o mesmo protocolo.
 *
 * Por que URL assinada e não upload pela API:
 * - o `@fastify/multipart` do app tem teto global de 10MB, e vídeo de anúncio
 *   passa disso com folga;
 * - o arquivo não ocupa memória nem banda do container — o browser fala direto
 *   com o bucket;
 * - o disco do container é efêmero (Dockerfile sem volume, Coolify recria a
 *   imagem a cada deploy), então gravar local perderia tudo no próximo deploy.
 *
 * O R2 não cobra egress, o que importa numa biblioteca que serve o mesmo vídeo
 * várias vezes para o time. A produção hoje usa Supabase; a troca é de env, não
 * de código.
 */

import { DeleteObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import type { Readable } from "node:stream";
import { randomUUID } from "node:crypto";

export interface StorageConfig {
  /** Endpoint S3 do provedor. Ver STORAGE_ENDPOINT no env pros formatos. */
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  bucket?: string;
  /** Base pública do bucket, sem barra final — é o que vai pro banco. */
  publicUrl?: string;
  /**
   * Região. O R2 ignora e aceita "auto"; Supabase e S3 exigem a real
   * (`sa-east-1`, `us-east-1`...) e recusam a assinatura se não bater.
   */
  region?: string;
  /**
   * Path-style (`endpoint/bucket/key`) em vez de virtual-hosted
   * (`bucket.endpoint/key`). Supabase e MinIO precisam; R2 e S3 não.
   */
  forcePathStyle?: boolean;
}

/** Tipos aceitos. Lista fechada: o que entra aqui é servido publicamente. */
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  // PDF entra na lista porque criativo de anúncio muitas vezes chega assim:
  // carrossel exportado, apresentação de oferta, página de vendas impressa.
  "application/pdf",
]);

/** 200MB — cabe vídeo de anúncio; acima disso é arquivo errado pra swipe file. */
export const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;

export function isStorageConfigured(cfg: StorageConfig): boolean {
  return Boolean(cfg.accessKeyId && cfg.secretAccessKey && cfg.bucket && cfg.endpoint && cfg.publicUrl);
}

export function isAllowedMime(mime: string): boolean {
  return ALLOWED_MIME.has(mime);
}

function client(cfg: StorageConfig): S3Client {
  return new S3Client({
    /**
     * Sem isto, NENHUM upload funciona fora da AWS.
     *
     * Desde a v3.729 o SDK inclui um checksum CRC32 por padrão. Numa URL
     * assinada isso é fatal: na hora de assinar não existe corpo, então o
     * parâmetro sai como `x-amz-checksum-crc32=AAAAAA==` — o CRC32 do VAZIO —
     * e vai colado na assinatura. Quando o navegador faz o PUT com o arquivo
     * de verdade, o provedor calcula o CRC32 do corpo real, compara com o do
     * vazio e recusa.
     *
     * O Supabase devolve **500** nesse caso, não 400, o que faz parecer
     * problema do servidor deles. Foi o que segurou o upload deste app desde
     * sempre: a tabela `swipe_files` nunca teve uma linha.
     *
     * `WHEN_REQUIRED` mantém o checksum onde a API exige (ex.: DeleteObjects)
     * e o tira do PutObject, que é onde ele quebra.
     */
    requestChecksumCalculation: "WHEN_REQUIRED",
    endpoint: cfg.endpoint,
    // "auto" serve pro R2; Supabase/S3 precisam da região real, senão a
    // assinatura não confere e o PUT volta 403.
    region: cfg.region || "auto",
    forcePathStyle: cfg.forcePathStyle ?? false,
    credentials: {
      accessKeyId: cfg.accessKeyId as string,
      secretAccessKey: cfg.secretAccessKey as string,
    },
  });
}

/** Extensão a partir do MIME — nunca do nome enviado pelo cliente. */
function extFor(mime: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/avif": "avif",
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "video/webm": "webm",
    "application/pdf": "pdf",
  };
  return map[mime] ?? "bin";
}


/** Remove o objeto. Falha aqui não deve derrubar o delete do registro. */
export async function deleteObject(cfg: StorageConfig, key: string): Promise<void> {
  if (!isStorageConfigured(cfg)) return;
  await client(cfg).send(
    new DeleteObjectCommand({ Bucket: cfg.bucket as string, Key: key }),
  );
}

/**
 * Sobe o arquivo PELO SERVIDOR, em vez de por URL assinada.
 *
 * ## Por que existe, se já havia o presign
 *
 * O presign é mais barato — o navegador fala direto com o bucket e o container
 * nem vê o arquivo. Mas o Supabase Storage responde **500** ao `PUT` assinado,
 * e um erro que não é nosso, não tem corpo útil e acontece no navegador de
 * quem está trabalhando não é algo que se conserta com paciência.
 *
 * Aqui o SDK fala com o bucket a partir do servidor, exatamente como já faz
 * para apagar objeto — caminho que funciona hoje.
 *
 * ## Stream, não buffer
 *
 * `Upload` do `lib-storage` consome o stream e fatia em partes de 5 MB, então
 * um vídeo de 200 MB nunca fica inteiro na memória do container. Ler para
 * `Buffer` seria mais simples e derrubaria o processo no primeiro vídeo grande.
 */
export async function uploadDireto(
  cfg: StorageConfig,
  entrada: { corpo: Readable; mime: string; prefix?: string },
): Promise<{ publicUrl: string; key: string }> {
  if (!isStorageConfigured(cfg)) {
    throw new Error("Object storage não configurado no servidor.");
  }
  if (!isAllowedMime(entrada.mime)) {
    throw new Error(`Tipo de arquivo não permitido: ${entrada.mime}`);
  }

  const prefix = (entrada.prefix ?? "swipe").replace(/[^a-z0-9-]/gi, "");
  const key = `${prefix}/${randomUUID()}.${extFor(entrada.mime)}`;

  const envio = new Upload({
    client: client(cfg),
    params: {
      Bucket: cfg.bucket as string,
      Key: key,
      Body: entrada.corpo,
      ContentType: entrada.mime,
    },
    // 5 MB é o mínimo que o protocolo aceita por parte. Duas partes em voo:
    // suficiente para não serializar a rede, longe de encher a memória.
    partSize: 5 * 1024 * 1024,
    queueSize: 2,
  });

  await envio.done();

  const base = (cfg.publicUrl ?? "").replace(/\/+$/, "");
  return { publicUrl: `${base}/${key}`, key };
}

/**
 * O que o provedor respondeu, em palavras.
 *
 * Um erro do SDK carrega bem mais que `message`: `name` traz o código do S3
 * (`NoSuchBucket`, `AccessDenied`, `SignatureDoesNotMatch`) e `$metadata` traz
 * o status HTTP. Só a `message` — que foi o que a tela mostrou — vira
 * "Internal Server Error", que não distingue bucket inexistente de credencial
 * errada, e essas duas coisas se resolvem de formas opostas.
 */
export function explicarErroDeStorage(erro: unknown): {
  mensagem: string;
  codigo: string | null;
  status: number | null;
} {
  const e = erro as {
    name?: string;
    message?: string;
    Code?: string;
    $metadata?: { httpStatusCode?: number };
  };
  const codigo = e?.Code ?? e?.name ?? null;
  const status = e?.$metadata?.httpStatusCode ?? null;

  const dicionario: Record<string, string> = {
    NoSuchBucket: "O bucket não existe no provedor. Crie-o ou corrija STORAGE_BUCKET.",
    AccessDenied: "A credencial não tem permissão de escrita neste bucket.",
    InvalidAccessKeyId: "STORAGE_ACCESS_KEY_ID não é reconhecida pelo provedor.",
    SignatureDoesNotMatch:
      "A assinatura não confere — verifique STORAGE_SECRET_ACCESS_KEY e STORAGE_REGION.",
    NotFound: "O provedor não achou o bucket. Verifique STORAGE_BUCKET e STORAGE_ENDPOINT.",
    Forbidden: "O provedor recusou a credencial para este bucket.",
  };

  const conhecido = codigo ? dicionario[codigo] : undefined;
  if (conhecido) return { mensagem: conhecido, codigo, status };

  // Sem código conhecido, o que se tem é o que veio — mas com o código junto,
  // que é o que permite procurar.
  const cru = e?.message || "Falha ao falar com o bucket.";
  return {
    mensagem: codigo && codigo !== "Error" ? `${cru} (${codigo})` : cru,
    codigo,
    status,
  };
}

/**
 * Testa a ligação com o bucket sem subir nada.
 *
 * `HeadBucket` responde se o bucket existe e se a credencial o alcança — as
 * duas perguntas que separam "configuração errada" de "arquivo problemático",
 * e que hoje só dá para responder tentando um upload de verdade.
 */
export async function checarStorage(cfg: StorageConfig): Promise<{
  ok: boolean;
  bucket: string | null;
  endpoint: string | null;
  erro?: { mensagem: string; codigo: string | null; status: number | null };
}> {
  const base = { bucket: cfg.bucket ?? null, endpoint: cfg.endpoint ?? null };
  if (!isStorageConfigured(cfg)) {
    return {
      ok: false,
      ...base,
      erro: {
        mensagem: "Faltam variáveis de STORAGE_* no servidor.",
        codigo: "NOT_CONFIGURED",
        status: null,
      },
    };
  }

  try {
    await client(cfg).send(new HeadBucketCommand({ Bucket: cfg.bucket as string }));
    return { ok: true, ...base };
  } catch (erro) {
    return { ok: false, ...base, erro: explicarErroDeStorage(erro) };
  }
}

/**
 * Sobe um objeto minúsculo e o apaga.
 *
 * O `HeadBucket` prova leitura; este prova ESCRITA, que é o que o upload faz.
 * Uma credencial pode enxergar o bucket e não poder gravar nele, e a diferença
 * só aparece na hora errada.
 */
export async function testarEscrita(cfg: StorageConfig): Promise<{
  ok: boolean;
  erro?: { mensagem: string; codigo: string | null; status: number | null };
}> {
  const chave = `_diagnostico/${randomUUID()}.txt`;
  try {
    await client(cfg).send(
      new PutObjectCommand({
        Bucket: cfg.bucket as string,
        Key: chave,
        Body: "loyola-x",
        ContentType: "text/plain",
      }),
    );
    await deleteObject(cfg, chave).catch(() => {});
    return { ok: true };
  } catch (erro) {
    return { ok: false, erro: explicarErroDeStorage(erro) };
  }
}
