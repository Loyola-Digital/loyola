import fp from "fastify-plugin";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

const SUPPORTED_MIMES = new Set([
  "text/plain",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/pdf",
]);

const MAX_EXTRACTED_TEXT_BYTES = 200 * 1024; // 200KB

async function extractText(
  buffer: Buffer,
  mimeType: string,
): Promise<string> {
  switch (mimeType) {
    case "text/plain":
      return buffer.toString("utf-8");

    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    }

    case "application/pdf": {
      const pdf = new PDFParse({ data: new Uint8Array(buffer) });
      const result = await pdf.getText();
      const text = result.text;
      await pdf.destroy();
      return text;
    }

    default:
      throw new Error(`Unsupported MIME type: ${mimeType}`);
  }
}

export default fp(async function uploadRoutes(fastify) {
  fastify.post(
    "/api/upload",
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: "1 minute",
        },
      },
    },
    async (request, reply) => {
      const file = await request.file();

      if (!file) {
        reply.code(400);
        return { error: "No file provided" };
      }

      const mimeType = file.mimetype;

      if (!SUPPORTED_MIMES.has(mimeType)) {
        reply.code(400);
        return {
          error: "Unsupported file type. Accepted: .txt, .docx, .pdf",
        };
      }

      let buffer: Buffer;
      try {
        buffer = await file.toBuffer();
      } catch {
        reply.code(413);
        return { error: "File too large. Maximum size: 10MB" };
      }

      let extractedText: string;
      try {
        extractedText = await extractText(buffer, mimeType);
      } catch {
        reply.code(422);
        return { error: "Could not extract text from file" };
      }

      // Truncate if extracted text exceeds 200KB
      let truncated = false;
      if (Buffer.byteLength(extractedText, "utf-8") > MAX_EXTRACTED_TEXT_BYTES) {
        // Truncate by characters (approximate) to stay under byte limit
        const encoder = new TextEncoder();
        let charLimit = extractedText.length;
        while (
          encoder.encode(extractedText.slice(0, charLimit)).length >
          MAX_EXTRACTED_TEXT_BYTES
        ) {
          charLimit = Math.floor(charLimit * 0.9);
        }
        extractedText =
          extractedText.slice(0, charLimit) +
          "\n\n[Documento truncado — exibindo primeiros 200KB de texto]";
        truncated = true;
      }

      return {
        filename: file.filename,
        mimeType,
        textLength: extractedText.length,
        extractedText,
        truncated,
      };
    },
  );
});
