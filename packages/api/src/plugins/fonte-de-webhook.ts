/**
 * Liga o leitor de leads por webhook ao `readSheetData`.
 *
 * O desvio em si vive em `services/google-sheets.ts`; aqui só entregamos a ele
 * uma função que sabe falar com o banco. Sem este plugin, uma etapa com fonte
 * de webhook lança erro explícito em vez de devolver zero lead em silêncio.
 */
import fp from "fastify-plugin";
import { asc, eq } from "drizzle-orm";
import { webhookLeads } from "../db/schema.js";
import { registrarLeitorDeFonteVirtual } from "../services/google-sheets.js";
import { leadsComoPlanilha } from "../services/webhook-leads.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default fp(async function fonteDeWebhookPlugin(fastify) {
  registrarLeitorDeFonteVirtual(async (fonteId) => {
    if (!UUID_RE.test(fonteId)) {
      throw new Error(`Fonte de leads por webhook inválida: ${fonteId}`);
    }

    const linhas = await fastify.db
      .select({
        nome: webhookLeads.nome,
        email: webhookLeads.email,
        telefone: webhookLeads.telefone,
        utmSource: webhookLeads.utmSource,
        utmMedium: webhookLeads.utmMedium,
        utmCampaign: webhookLeads.utmCampaign,
        utmContent: webhookLeads.utmContent,
        utmTerm: webhookLeads.utmTerm,
        recebidoEm: webhookLeads.recebidoEm,
      })
      .from(webhookLeads)
      .where(eq(webhookLeads.sourceId, fonteId))
      // Mais antigo primeiro, como a planilha onde cada lead vira a próxima linha.
      .orderBy(asc(webhookLeads.recebidoEm));

    return leadsComoPlanilha(linhas);
  });
});
