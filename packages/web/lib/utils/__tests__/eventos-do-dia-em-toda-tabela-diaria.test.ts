import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Toda tabela diária mostra os ícones do Log de Campanha na coluna do dia.
 *
 * Existe porque a regra é fácil de esquecer: os ícones nasceram no perpétuo e
 * no lançamento (Epic 38) e ficaram de fora das três tabelas diárias criadas
 * depois — Vendas (18.95), Aplicação (18.96) e Lyrio (42.17) —, além do
 * movimento de grupo do SendFlow. Quem lê a tabela faz a pergunta "por que
 * este dia foi diferente?" em TODAS elas; a resposta mora no log.
 *
 * Lê o fonte (o padrão dos "fios de tela" das 42.13 a 42.17) porque o que se
 * quer provar é a LIGAÇÃO, e renderizar cada uma dessas telas exigiria o
 * provider de query, o Clerk e os dados de cada domínio.
 *
 * Quando nascer a próxima tabela diária, acrescente o arquivo aqui — e é este
 * teste que vai cobrar os ícones antes de a tela subir sem eles.
 */
const ler = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

/** Uma linha por dia na coluna da esquerda — a definição de "tabela diária". */
const TABELAS_DIARIAS = [
  "crossed-funnel-daily-table.tsx", // captação (lançamento)
  "perpetual-dashboard.tsx", // perpétuo
  "sales-daily-table.tsx", // vendas — Story 18.95
  "application-investment-section.tsx", // aplicação — Story 18.96
  "lyrio-dados-diarios.tsx", // Lyrio — Story 42.17
  "grupos-do-sendflow.tsx", // movimento de grupo
];

describe("os ícones do Log de Campanha em toda tabela diária", () => {
  it.each(TABELAS_DIARIAS)("%s renderiza <EventosDoDia> com o dia da linha", (arquivo) => {
    const fonte = ler(`../../../components/funnels/${arquivo}`);
    expect(fonte).toContain("<EventosDoDia");
    // `entradas` sem `dia` compilaria (o prop é opcional) e o modal abriria sem
    // título — o dia é o que diz "o que aconteceu NESTE dia".
    expect(fonte).toMatch(/<EventosDoDia[\s\S]{0,200}?dia=\{/);
  });

  it("a tabela do Lyrio recebe o mapa pronto, sem consulta própria (42.17 AC4b)", () => {
    const tabela = ler("../../../components/funnels/lyrio-dados-diarios.tsx");
    const etapa = ler("../../../components/funnels/lyrio-stage-view.tsx");
    expect(tabela).not.toMatch(/useEventosDoDia|useCampaignLog/);
    expect(tabela).toMatch(/eventosPorDia\?\.get\(/);
    expect(etapa).toMatch(/useEventosDoDia\(projectId, funnelId, days\)/);
  });

  it("a conta de quantos dias pedir ao log existe uma vez só", () => {
    // Era copiada no perpétuo e na captação, com a mesma régua (7 a 365 dias)
    // escrita de dois jeitos. Agora mora em `eventos-do-dia.tsx`.
    const fonte = ler("../../../components/funnels/eventos-do-dia.tsx");
    expect(fonte.match(/export function diasParaCobrir/g)).toHaveLength(1);
    for (const arquivo of TABELAS_DIARIAS) {
      expect(ler(`../../../components/funnels/${arquivo}`)).not.toMatch(
        /function diasParaCobrir|Math\.min\(365, Math\.max\(7/,
      );
    }
  });
});
