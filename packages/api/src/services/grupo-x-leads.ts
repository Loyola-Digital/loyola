/**
 * De que canal veio cada pessoa que entrou no grupo de WhatsApp da campanha.
 *
 * ## Por que existe
 *
 * O SendFlow sabe QUEM está no grupo (o número) e não sabe de onde a pessoa
 * veio. A planilha de captação sabe de onde cada lead veio (as UTMs) e não
 * sabe se ele entrou no grupo. Ninguém nunca encostou os dois: o que o Loyola X
 * guardava do grupo era só o agregado (`funnel_group_snapshots`: entraram 879,
 * saíram 247), sem uma pessoa sequer.
 *
 * Juntando, aparecem as duas perguntas que não tinham resposta: quanto de cada
 * canal virou ENTRADA no grupo (e não só lead), e — porque a exportação marca
 * quem saiu — de que canal vem quem abandona.
 *
 * ## A chave é o telefone, e são os ÚLTIMOS 8 DÍGITOS
 *
 * O SendFlow só devolve número; e-mail não existe do lado dele. E o número
 * chega como WhatsApp, sempre com o DDI 55 — enquanto na planilha de captação
 * do dg-pg04 só 296 das 1.688 linhas têm o 55. Comparar a string inteira de
 * dígitos (que é o que `sendflow-origem.ts` faz entre dois grupos) não casaria
 * quase nada aqui, e não casaria em silêncio.
 *
 * `phoneTail` (os últimos 8) atravessa DDI, DDD e o 9º dígito. O preço está
 * medido: no dg-pg04, 36 dos 1.799 telefones distintos (2,0%) aparecem ligados
 * a mais de um e-mail. É o teto de ruído deste cruzamento.
 */

import { eq, and } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { funnelSpreadsheets } from "../db/schema.js";
import { readSheetData } from "./google-sheets.js";
import { ALIASES, resolveColIdx } from "./lead-origin-sync.js";
import {
  classifyCanal,
  classifyOrigem,
  phoneTail,
  type Canal,
  type Origem,
} from "../utils/lead-origin.js";
import type { Participantes } from "./sendflow-origem.js";

const NOMES_DE_NOME = ["nome", "name", "nome completo", "primeiro nome"];

export interface LeadCaptado {
  nome: string;
  canal: Canal;
  origem: Origem;
}

export interface PessoaNoGrupo {
  numero: string;
  nome: string;
  canal: Canal | "Sem cadastro";
  saiu: boolean;
}

export interface CanalNoGrupo {
  canal: Canal | "Sem cadastro";
  dentro: number;
  sairam: number;
  total: number;
}

export interface GrupoPorCanal {
  /** Todo mundo que passou pelo grupo, inclusive quem já saiu. */
  total: number;
  dentro: number;
  sairam: number;
  /** Casaram com um lead da planilha — destes sabemos o canal. */
  identificados: number;
  /** Entraram e não estão em planilha nenhuma de captação do funil. */
  semCadastro: number;
  canais: CanalNoGrupo[];
  pessoas: PessoaNoGrupo[];
}

/**
 * Cruza os participantes do grupo com os leads captados.
 *
 * "Sem cadastro" é um canal como qualquer outro na saída, de propósito: quem
 * entrou no grupo sem passar pela captação (link direto, lista antiga, convite)
 * é informação sobre o funil, não sujeira a esconder — e sumir com essas
 * pessoas faria os totais não fecharem com o snapshot.
 */
export function cruzarGrupoComLeads(
  grupo: Participantes,
  leads: Map<string, LeadCaptado>,
): GrupoPorCanal {
  const pessoas: PessoaNoGrupo[] = [];
  for (const [numeros, saiu] of [
    [grupo.atuais, false],
    [grupo.sairam, true],
  ] as const) {
    for (const numero of numeros) {
      // Sem os 8 dígitos não há chave: buscar `""` casaria a pessoa com
      // qualquer lead que também não tenha telefone legível.
      const tail = phoneTail(numero);
      const lead = tail ? leads.get(tail) : undefined;
      pessoas.push({
        numero,
        nome: lead?.nome ?? "",
        canal: lead?.canal ?? "Sem cadastro",
        saiu,
      });
    }
  }

  const porCanal = new Map<string, CanalNoGrupo>();
  for (const p of pessoas) {
    const c = porCanal.get(p.canal) ?? {
      canal: p.canal,
      dentro: 0,
      sairam: 0,
      total: 0,
    };
    if (p.saiu) c.sairam++;
    else c.dentro++;
    c.total++;
    porCanal.set(p.canal, c);
  }

  const identificados = pessoas.filter((p) => p.canal !== "Sem cadastro").length;
  return {
    total: pessoas.length,
    dentro: grupo.atuais.size,
    sairam: grupo.sairam.size,
    identificados,
    semCadastro: pessoas.length - identificados,
    canais: [...porCanal.values()].sort((a, b) => b.total - a.total),
    pessoas: pessoas.sort((a, b) => a.nome.localeCompare(b.nome)),
  };
}

/**
 * Os leads captados do funil, indexados pelos últimos 8 dígitos do telefone.
 *
 * Lê as planilhas de captação (`type: "leads"`) ao vivo, como o resto do
 * sistema faz — nada de lead vai para o banco, e este cruzamento não muda isso.
 *
 * Quando o mesmo telefone aparece duas vezes, a PRIMEIRA linha vence: as
 * planilhas do n8n são append-only, então a primeira é o primeiro cadastro — o
 * canal que de fato trouxe a pessoa, não o que a reencontrou depois.
 *
 * Com uma exceção que o dg-pg02 escancarou: a `n8n-kiwify-captação` (2.222
 * linhas) **não tem coluna de UTM nenhuma**, e é lida antes da
 * `Leads-Cap-Gratuita`, que tem. Com a regra crua, ela sequestrava o canal de
 * todo mundo que estava nas duas — 657 pessoas do grupo caíam em "Sem Track"
 * tendo origem conhecida na outra planilha. Por isso um canal conhecido sempre
 * substitui um "Sem Track" guardado: ausência de rastro não é um rastro.
 */
export async function leadsDoFunil(
  db: Database,
  funnelId: string,
): Promise<Map<string, LeadCaptado>> {
  const planilhas = await db
    .select({
      spreadsheetId: funnelSpreadsheets.spreadsheetId,
      sheetName: funnelSpreadsheets.sheetName,
      columnMapping: funnelSpreadsheets.columnMapping,
    })
    .from(funnelSpreadsheets)
    .where(
      and(
        eq(funnelSpreadsheets.funnelId, funnelId),
        eq(funnelSpreadsheets.type, "leads"),
      ),
    );

  const leads = new Map<string, LeadCaptado>();
  for (const p of planilhas) {
    let dados;
    try {
      dados = await readSheetData(p.spreadsheetId, p.sheetName);
    } catch {
      // Uma planilha fora do ar não pode zerar o cruzamento das outras.
      continue;
    }
    const headers = dados.headers ?? [];
    // As chaves do column_mapping são snake_case (`utm_source`), e o valor pode
    // ser o NOME do cabeçalho ou o índice — `resolveColIdx` trata os dois. A
    // `n8n-kiwify-captação` do dg-pg02 mapeia a UTM para uma coluna chamada
    // literalmente `s=`: nenhum alias acharia, só o mapeamento.
    const mapa = (p.columnMapping ?? {}) as Record<string, string | undefined>;
    const iTel = resolveColIdx(headers, mapa.phone, ALIASES.phone);
    if (iTel < 0) continue;
    const iNome = resolveColIdx(headers, mapa.name, NOMES_DE_NOME);
    const iSrc = resolveColIdx(headers, mapa.utm_source, ALIASES.utmSource);
    const iMed = resolveColIdx(headers, mapa.utm_medium, ALIASES.utmMedium);

    for (const linha of dados.rows ?? []) {
      const tail = phoneTail(String(linha[iTel] ?? ""));
      if (!tail) continue;
      const src = iSrc >= 0 ? String(linha[iSrc] ?? "") : "";
      const med = iMed >= 0 ? String(linha[iMed] ?? "") : "";
      const canal = classifyCanal(src, med);
      const nome = iNome >= 0 ? String(linha[iNome] ?? "").trim() : "";
      const guardado = leads.get(tail);
      if (guardado) {
        if (guardado.canal === "Sem Track" && canal !== "Sem Track") {
          guardado.canal = canal;
          guardado.origem = classifyOrigem(src);
        }
        if (!guardado.nome && nome) guardado.nome = nome;
        continue;
      }
      leads.set(tail, { nome, canal, origem: classifyOrigem(src) });
    }
  }
  return leads;
}
