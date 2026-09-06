import { describe, it, expect } from "vitest";
import {
  filtrarPorPublico,
  avisoDeNaoClassificados,
  type ClassificacaoDeEntidade,
} from "./filtro-de-publico";

/**
 * O caso real que motivou a Story 29.76.
 *
 * `ad11-pp-s1-ago26--noticia` no pps1 tem 4 ad_ids: 3 em campanha FRIA e 1 em
 * QUENTE. A tabela agrega por Ad Name e guarda um único id — o do primeiro, que
 * é frio. Classificar o criativo por esse id o apagava do filtro "quente".
 */
interface Linha {
  campaignId: string;
  campaignName: string;
  spend: number;
  porPublico?: { quente?: Linha; frio?: Linha };
}

const AD_ID_FRIO = "120249937658870041";
const AD_ID_QUENTE = "120249937716610041";

const mapa: Record<string, ClassificacaoDeEntidade> = {
  [AD_ID_FRIO]: { temperatura: "frio", nivel: "campanha" },
  [AD_ID_QUENTE]: { temperatura: "quente", nivel: "campanha" },
};

/** A linha como a API NOVA a devolve: total + quebra. */
const noticia: Linha = {
  campaignId: AD_ID_FRIO, // o representante é frio — era isso que a apagava
  campaignName: "ad11-pp-s1-ago26--noticia",
  spend: 21.87, // 10,31 + 2,45 + 1,88 (frio) + 7,23 (quente)
  porPublico: {
    frio: { campaignId: AD_ID_FRIO, campaignName: "ad11-pp-s1-ago26--noticia", spend: 14.64 },
    quente: { campaignId: AD_ID_QUENTE, campaignName: "ad11-pp-s1-ago26--noticia", spend: 7.23 },
  },
};

const quebraDe = (l: Linha, p: "quente" | "frio") =>
  l.porPublico ? { temQuebra: true, linha: l.porPublico[p] } : { temQuebra: false };

describe("filtrarPorPublico — Story 29.76", () => {
  describe("o caso do pps1: criativo que roda nos dois públicos", () => {
    it("aparece no filtro QUENTE, mesmo com o representante frio", () => {
      const r = filtrarPorPublico([noticia], "quente", (l) => l.campaignId, mapa, quebraDe);
      expect(r.linhas).toHaveLength(1);
      expect(r.linhas[0].campaignName).toBe("ad11-pp-s1-ago26--noticia");
    });

    it("com o gasto SÓ do público quente — não o total", () => {
      const r = filtrarPorPublico([noticia], "quente", (l) => l.campaignId, mapa, quebraDe);
      expect(r.linhas[0].spend).toBe(7.23);
      expect(r.linhas[0].spend).not.toBe(noticia.spend); // 21,87 seria misturar
    });

    it("e aparece no FRIO com o gasto do frio", () => {
      const r = filtrarPorPublico([noticia], "frio", (l) => l.campaignId, mapa, quebraDe);
      expect(r.linhas).toHaveLength(1);
      expect(r.linhas[0].spend).toBe(14.64);
    });

    it("quente + frio fecham com o total da linha", () => {
      const q = filtrarPorPublico([noticia], "quente", (l) => l.campaignId, mapa, quebraDe);
      const f = filtrarPorPublico([noticia], "frio", (l) => l.campaignId, mapa, quebraDe);
      expect(q.linhas[0].spend + f.linhas[0].spend).toBeCloseTo(noticia.spend, 2);
    });

    /**
     * A prova de que o teste morde: SEM a quebra (o comportamento anterior), o
     * mesmo criativo desaparece do filtro quente. Se esta expectativa passar a
     * falhar, é porque o bug voltou por outro caminho.
     */
    it("SEM a quebra, o criativo some do quente — o bug de origem", () => {
      const semQuebra = filtrarPorPublico([noticia], "quente", (l) => l.campaignId, mapa);
      expect(semQuebra.linhas).toHaveLength(0);
      expect(semQuebra.doOutroPublico).toBe(1);
    });
  });

  describe("criativo de um público só", () => {
    const soQuente: Linha = {
      campaignId: AD_ID_QUENTE, campaignName: "so-quente", spend: 100,
      porPublico: { quente: { campaignId: AD_ID_QUENTE, campaignName: "so-quente", spend: 100 } },
    };

    it("entra no quente", () => {
      const r = filtrarPorPublico([soQuente], "quente", (l) => l.campaignId, mapa, quebraDe);
      expect(r.linhas).toHaveLength(1);
    });

    it("no frio conta como do outro público, não como sem classificação", () => {
      const r = filtrarPorPublico([soQuente], "frio", (l) => l.campaignId, mapa, quebraDe);
      expect(r.linhas).toHaveLength(0);
      expect(r.doOutroPublico).toBe(1);
      expect(r.semClassificacao).toBe(0);
    });
  });

  describe("API antiga — o front não pode exigir a versão nova", () => {
    const semCampoNovo: Linha = { campaignId: AD_ID_QUENTE, campaignName: "legado", spend: 50 };

    it("sem `porPublico`, cai no caminho do mapa", () => {
      const r = filtrarPorPublico([semCampoNovo], "quente", (l) => l.campaignId, mapa, quebraDe);
      expect(r.linhas).toHaveLength(1);
      expect(r.linhas[0].spend).toBe(50);
    });

    it("e continua classificando pelo mapa no filtro oposto", () => {
      const r = filtrarPorPublico([semCampoNovo], "frio", (l) => l.campaignId, mapa, quebraDe);
      expect(r.linhas).toHaveLength(0);
      expect(r.doOutroPublico).toBe(1);
    });

    it("id fora do mapa continua sendo 'sem classificação'", () => {
      const orfa: Linha = { campaignId: "id-que-nao-existe", campaignName: "órfã", spend: 1 };
      const r = filtrarPorPublico([orfa], "quente", (l) => l.campaignId, mapa, quebraDe);
      expect(r.semClassificacao).toBe(1);
      expect(r.doOutroPublico).toBe(0);
    });
  });

  describe("o que não pode mudar", () => {
    it('filtro "todos" devolve tudo, sem tocar na quebra', () => {
      const r = filtrarPorPublico([noticia], "todos", (l) => l.campaignId, mapa, quebraDe);
      expect(r.linhas).toHaveLength(1);
      expect(r.linhas[0].spend).toBe(noticia.spend); // o TOTAL, não a quebra
    });

    it("sem a função de quebra, o comportamento é o de antes (campanha/conjunto)", () => {
      const campanha: Linha = { campaignId: AD_ID_QUENTE, campaignName: "camp", spend: 9 };
      const r = filtrarPorPublico([campanha], "quente", (l) => l.campaignId, mapa);
      expect(r.linhas).toHaveLength(1);
    });

    it("o aviso continua distinguindo sem-classificação de outro-público", () => {
      const r = filtrarPorPublico([noticia], "quente", (l) => l.campaignId, mapa, quebraDe);
      expect(avisoDeNaoClassificados(r, "quente")).toBeNull();
    });
  });
});
