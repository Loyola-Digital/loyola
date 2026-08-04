/**
 * Object storage S3-compatível (Cloudflare R2).
 *
 * Por que URL assinada e não upload pela API:
 * - o `@fastify/multipart` do app tem teto global de 10MB, e vídeo de anúncio
 *   passa disso com folga;
 * - o arquivo não ocupa memória nem banda do container — o browser fala direto
 *   com o bucket;
 * - o disco do container é efêmero (Dockerfile sem volume, Coolify recria a
 *   imagem a cada deploy), então gravar local perderia tudo no próximo deploy.
 *
 * R2 é preferível a S3 aqui por não cobrar egress — a biblioteca serve vídeo
 * repetidamente pro time.
 */

import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
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
  };
  return map[mime] ?? "bin";
}

export interface PresignResult {
  /** PUT aqui, com o mesmo Content-Type informado. Expira em 10 min. */
  uploadUrl: string;
  /** URL pública definitiva — é o que vai pro banco. */
  publicUrl: string;
  /** Caminho no bucket — guardado pra permitir o delete depois. */
  key: string;
}

/**
 * Gera a URL assinada de upload.
 *
 * A chave é gerada no servidor a partir de um UUID: nome de arquivo vindo do
 * cliente é entrada não confiável (path traversal, colisão, caractere exótico)
 * e não tem por que virar caminho no bucket.
 */
export async function presignUpload(
  cfg: StorageConfig,
  input: { mime: string; prefix?: string },
): Promise<PresignResult> {
  if (!isStorageConfigured(cfg)) {
    throw new Error("Object storage não configurado no servidor.");
  }
  if (!isAllowedMime(input.mime)) {
    throw new Error(`Tipo de arquivo não permitido: ${input.mime}`);
  }

  const prefix = (input.prefix ?? "swipe").replace(/[^a-z0-9-]/gi, "");
  const key = `${prefix}/${randomUUID()}.${extFor(input.mime)}`;

  const uploadUrl = await getSignedUrl(
    client(cfg),
    new PutObjectCommand({
      Bucket: cfg.bucket as string,
      Key: key,
      ContentType: input.mime,
    }),
    { expiresIn: 600 },
  );

  const base = (cfg.publicUrl ?? "").replace(/\/+$/, "");
  return { uploadUrl, publicUrl: `${base}/${key}`, key };
}

/** Remove o objeto. Falha aqui não deve derrubar o delete do registro. */
export async function deleteObject(cfg: StorageConfig, key: string): Promise<void> {
  if (!isStorageConfigured(cfg)) return;
  await client(cfg).send(
    new DeleteObjectCommand({ Bucket: cfg.bucket as string, Key: key }),
  );
}
