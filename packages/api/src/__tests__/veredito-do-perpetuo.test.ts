import { describe, it, expect } from "vitest";
import { vereditoDoPerpetuo, roasDeEquilibrio, META_DE_ROAS } from "@loyola-x/shared";

/**
 * Story 44.30 (AC2/AC3) — o veredito do Resumão.
 *
 * ⚠️ Mora em `packages/api` porque o `shared` não tem runner próprio — é a
 * convenção do repo, a mesma de `cadeia-cac.test.ts`.
 *
 * ## A fixture é o caso que motivou a story
 *
 * O Resumão de 06/09/2026 chamou de **"no ar e saudável"** uma operação com
 * ROAS 7d de 1,47x contra meta de 2x, 30d de 1,86x e três dias negativos na
 * semana. O §3.4 do briefing fixa o aceite: com esses números, 🔴 **Alerta**.
 *
 * ## Por que o AC3 NÃO é um snapshot do texto do Resumão
 *
 * O Resumão é escrito pelo agente. Congelar a prosa dele testaria o modelo, não
 * o código — e quebraria a cada mudança de redação sem que nada de errado
 * tivesse acontecido. O que dá para travar, e o que decide a leitura da
 * diretoria, é a REGRA que produz a cor. Ela virou função pura por isso, e é
 * ela que este arquivo congela.
 */

/** Kiwify: as taxas que incidem em toda venda. Reembolso não entra. */
const KIWIFY = { plataforma: 0.0999, imposto: 0.06, outros: 0.01 };
/** Plataforma "outra": sem taxa. O equilíbrio vira 1,00x. */
const SEM_TAXA = { plataforma: 0, imposto: 0, outros: 0 };

/** Margem folgada e zero dia negativo — para isolar o efeito das janelas. */
const SAUDAVEL = { margem7dPct: 40, diasNegativosEm7: 0, taxas: KIWIFY };

describe("Story 44.30 — o ponto de equilíbrio", () => {
  it("é 1 ÷ (1 − taxas)", () => {
    // 16,99% de taxa → 1 / 0,8301 = 1,2047
    expect(roasDeEquilibrio(KIWIFY)).toBeCloseTo(1.2047, 3);
  });

  it("sem taxa nenhuma, o equilíbrio é 1x", () => {
    expect(roasDeEquilibrio(SEM_TAXA)).toBe(1);
  });

  it("taxa impossível (≥ 100%) devolve null, não Infinity", () => {
    expect(roasDeEquilibrio({ plataforma: 0.9, imposto: 0.2, outros: 0 })).toBeNull();
  });
});

/**
 * O aceite literal do §3.4: *"com a fixture, o veredito de 06/09 é 🔴 Alerta
 * (7d 1.47x e 30d 1.86x abaixo de 2x; 3 dias negativos em 7)"*.
 */
describe("Story 44.30 AC2/AC3 — a fixture de 06/09, que gerou a story", () => {
  const FIXTURE = {
    roas7d: 1.47,
    roas30d: 1.86,
    margem7dPct: 14.89,
    diasNegativosEm7: 3,
    taxas: KIWIFY,
  };

  it("🔴 Alerta — e NÃO 'no ar e saudável', que foi o que o Resumão publicou", () => {
    const v = vereditoDoPerpetuo(FIXTURE);
    expect(v.cor).toBe("vermelho");
    expect(v.rotulo).toBe("Alerta");
  });

  it("diz QUAL condição disparou (§5.4 do briefing)", () => {
    // Três condições de 🔴 valem aqui ao mesmo tempo; a que responde é a de
    // dias negativos, porque a margem ainda é positiva (14,89%).
    expect(vereditoDoPerpetuo(FIXTURE).condicao).toBe("tresDiasNegativos");
  });

  it("o motivo cita os dois ROAS e a meta, para o leitor conferir a conta", () => {
    const v = vereditoDoPerpetuo(FIXTURE);
    expect(v.motivo).toContain("1,47x");
    expect(v.motivo).toContain("1,86x");
    expect(v.motivo).toContain("2,00x");
  });

  it("declara que a meta é constante — não é meta por funil", () => {
    const v = vereditoDoPerpetuo(FIXTURE);
    expect(v.metaDeRoas).toBe(2);
    expect(v.fonteDaMeta).toBe("constante");
  });

  it("mesmo sem os dias negativos, as duas janelas abaixo já dão 🔴", () => {
    // Isola a condição de janelas: sem ela, o teste acima passaria por causa
    // dos 3 dias e a regra principal do §3.4 ficaria sem prova.
    const v = vereditoDoPerpetuo({ ...FIXTURE, diasNegativosEm7: 0, margem7dPct: 40 });
    expect(v.cor).toBe("vermelho");
    expect(v.condicao).toBe("duasJanelasAbaixoDaMeta");
  });

  it("continua acima do equilíbrio: perder a meta ≠ perder dinheiro", () => {
    expect(vereditoDoPerpetuo(FIXTURE).abaixoDoEquilibrio).toBe(false);
  });
});

describe("Story 44.30 — as três cores da regra do §3.4", () => {
  it("🟢 as DUAS janelas na meta", () => {
    const v = vereditoDoPerpetuo({ ...SAUDAVEL, roas7d: 2.4, roas30d: 2.1 });
    expect(v.cor).toBe("verde");
    expect(v.condicao).toBe("duasJanelasNaMeta");
  });

  it("🟡 só os 7 dias abaixo", () => {
    const v = vereditoDoPerpetuo({ ...SAUDAVEL, roas7d: 1.8, roas30d: 2.1 });
    expect(v.cor).toBe("amarelo");
    expect(v.condicao).toBe("umaJanelaAbaixoDaMeta");
    expect(v.motivo).toContain("os 7 dias abaixo");
  });

  it("🟡 só os 30 dias abaixo", () => {
    const v = vereditoDoPerpetuo({ ...SAUDAVEL, roas7d: 2.4, roas30d: 1.9 });
    expect(v.cor).toBe("amarelo");
    expect(v.motivo).toContain("os 30 dias abaixo");
  });

  it("🔴 as duas abaixo", () => {
    const v = vereditoDoPerpetuo({ ...SAUDAVEL, roas7d: 1.9, roas30d: 1.9 });
    expect(v.cor).toBe("vermelho");
    expect(v.condicao).toBe("duasJanelasAbaixoDaMeta");
  });

  it("🔴 margem de 7 dias negativa", () => {
    const v = vereditoDoPerpetuo({ ...SAUDAVEL, roas7d: 2.4, roas30d: 2.4, margem7dPct: -3 });
    expect(v.cor).toBe("vermelho");
    expect(v.condicao).toBe("margemNegativa");
  });

  it("🔴 três dias negativos em sete", () => {
    const v = vereditoDoPerpetuo({ ...SAUDAVEL, roas7d: 2.4, roas30d: 2.4, diasNegativosEm7: 3 });
    expect(v.cor).toBe("vermelho");
    expect(v.condicao).toBe("tresDiasNegativos");
  });

  it("🟡 margem apertada (entre 0 e 20%) mesmo com as duas janelas na meta", () => {
    // ⚠️ No §3.4 a margem apertada é gatilho INDEPENDENTE de amarelo, não um
    // desempate entre janelas. A primeira versão desta função a checava depois
    // do verde, e este caso saía 🟢.
    const v = vereditoDoPerpetuo({ ...SAUDAVEL, roas7d: 2.4, roas30d: 2.2, margem7dPct: 15 });
    expect(v.cor).toBe("amarelo");
    expect(v.condicao).toBe("margemApertada");
  });
});

/**
 * ⚠️ Divergência DELIBERADA do briefing, declarada no cabeçalho da função.
 *
 * O texto lista as cores "na ordem", o que sugere avaliar 🟢 primeiro. Tomado
 * ao pé da letra, duas janelas na meta com margem negativa sairia 🟢. Margem
 * negativa é queimar caixa — chamar isso de saudável é a mesma classe de
 * defeito que a story existe para corrigir.
 */
describe("Story 44.30 — as condições de 🔴 dominam as de 🟢", () => {
  it("duas janelas na meta MAS margem negativa é 🔴, não 🟢", () => {
    const v = vereditoDoPerpetuo({
      roas7d: 2.5,
      roas30d: 2.5,
      margem7dPct: -5,
      diasNegativosEm7: 0,
      taxas: KIWIFY,
    });
    expect(v.cor).toBe("vermelho");
    expect(v.rotulo).not.toBe("Saudável");
  });
});

describe("Story 44.30 — os três funis reais, medidos em 08/09/2026", () => {
  /**
   * ⚠️ Só o ROAS de 30 dias foi medido; o de 7 dias aqui é o mesmo valor, para
   * exercitar a regra. O que estes casos travam é a leitura das janelas, não a
   * medição — essa vive na story.
   */
  const casos = [
    { nome: "bbe", roas: 1.941, cor: "vermelho" },
    { nome: "fz", roas: 1.471, cor: "vermelho" },
    { nome: "pps", roas: 0.912, cor: "vermelho" },
  ] as const;

  for (const c of casos) {
    it(`${c.nome} a ${c.roas}x nas duas janelas → ${c.cor}`, () => {
      const v = vereditoDoPerpetuo({ ...SAUDAVEL, roas7d: c.roas, roas30d: c.roas });
      expect(v.cor).toBe(c.cor);
    });
  }

  /**
   * ⚠️ Os três são vermelhos, e por situações diferentes. Sem
   * `abaixoDoEquilibrio` a diretoria leria a mesma cor para "não bati a meta,
   * mas lucro" e "estou queimando caixa" — ações opostas.
   */
  it("o pps se distingue dos outros dois: só ele está abaixo do equilíbrio", () => {
    const fz = vereditoDoPerpetuo({ ...SAUDAVEL, roas7d: 1.471, roas30d: 1.471 });
    const pps = vereditoDoPerpetuo({ ...SAUDAVEL, roas7d: 0.912, roas30d: 0.912 });
    expect(fz.cor).toBe(pps.cor);
    expect(fz.abaixoDoEquilibrio).toBe(false);
    expect(pps.abaixoDoEquilibrio).toBe(true);
  });
});

describe("Story 44.30 — as fronteiras da regra", () => {
  it("exatamente na meta conta como na meta", () => {
    const v = vereditoDoPerpetuo({ ...SAUDAVEL, roas7d: META_DE_ROAS, roas30d: META_DE_ROAS });
    expect(v.cor).toBe("verde");
  });

  it("margem exatamente em 20% já é folgada, não apertada", () => {
    const v = vereditoDoPerpetuo({ ...SAUDAVEL, roas7d: 2.1, roas30d: 2.1, margem7dPct: 20 });
    expect(v.cor).toBe("verde");
  });

  it("margem exatamente em zero é 🔴, não 🟡", () => {
    const v = vereditoDoPerpetuo({ ...SAUDAVEL, roas7d: 2.1, roas30d: 2.1, margem7dPct: 0 });
    expect(v.condicao).toBe("margemNegativa");
  });

  it("dois dias negativos ainda não dispara o 🔴 por dias", () => {
    const v = vereditoDoPerpetuo({ ...SAUDAVEL, roas7d: 2.1, roas30d: 2.1, diasNegativosEm7: 2 });
    expect(v.cor).toBe("verde");
  });
});

describe("Story 44.30 — ausência é ausência", () => {
  it("sem uma das janelas, a cor é semDado — nem verde nem vermelho", () => {
    const v = vereditoDoPerpetuo({ ...SAUDAVEL, roas7d: 2.5, roas30d: null });
    expect(v.cor).toBe("semDado");
    expect(v.condicao).toBeNull();
  });

  /**
   * ⚠️ Medido no `pps` em 08/09: mídia parada há 7 dias, 30 dias em 0,91x.
   * "Sem dado" sozinho manda o leitor a lugar nenhum — e mídia PARADA é
   * informação de gestão, não ausência dela. A regra do §3.4 continua exigindo
   * as duas janelas para dar cor; o que o texto não faz é jogar fora o que sabe.
   */
  it("o texto diz QUAL janela faltou e cita a que existe", () => {
    const v = vereditoDoPerpetuo({ ...SAUDAVEL, roas7d: null, roas30d: 0.912 });
    expect(v.cor).toBe("semDado");
    expect(v.motivo).toContain("últimos 7 dias");
    expect(v.motivo).toContain("0,91x");
  });

  it("as duas janelas ausentes não inventam número nenhum", () => {
    const v = vereditoDoPerpetuo({ ...SAUDAVEL, roas7d: null, roas30d: null });
    expect(v.motivo).toContain("duas janelas");
    expect(v.motivo).not.toMatch(/\d,\d\dx/);
  });

  it("margem e dias negativos não medidos NÃO viram zero", () => {
    // `null` em margem não pode disparar o 🔴 de "margem ≤ 0": não medimos.
    const v = vereditoDoPerpetuo({
      roas7d: 2.4,
      roas30d: 2.2,
      margem7dPct: null,
      diasNegativosEm7: null,
      taxas: KIWIFY,
    });
    expect(v.cor).toBe("verde");
  });

  /**
   * ⚠️ Sem plataforma conhecida as taxas chegam zeradas e o equilíbrio vira
   * 1,00x — mais permissivo. O veredito segue pelas janelas, que é o que impede
   * um ROAS de 1,05x passar por "no lucro, tudo bem".
   */
  it("sem taxas conhecidas, a meta continua mandando", () => {
    const v = vereditoDoPerpetuo({ ...SAUDAVEL, roas7d: 1.05, roas30d: 1.05, taxas: SEM_TAXA });
    expect(v.cor).toBe("vermelho");
  });
});

describe("Story 44.30 AC4 — higiene do texto", () => {
  const todos = [
    vereditoDoPerpetuo({ ...SAUDAVEL, roas7d: 2.5, roas30d: 2.5 }),
    vereditoDoPerpetuo({ ...SAUDAVEL, roas7d: 1.8, roas30d: 2.1 }),
    vereditoDoPerpetuo({ ...SAUDAVEL, roas7d: 1.4, roas30d: 1.4 }),
    vereditoDoPerpetuo({ ...SAUDAVEL, roas7d: 2.1, roas30d: 2.1, margem7dPct: -1 }),
    vereditoDoPerpetuo({ ...SAUDAVEL, roas7d: null, roas30d: null }),
  ];

  it("nenhum motivo carrega jargão interno ou número de story", () => {
    for (const v of todos) {
      for (const jargao of [
        "semTetoConfiavel",
        "baseInsuficiente",
        "semDados",
        "Story",
        "payload",
        "null",
        "connectRate",
        "roas7d",
      ]) {
        expect(v.motivo).not.toContain(jargao);
      }
    }
  });

  it("os números do texto usam vírgula decimal, não ponto", () => {
    const v = vereditoDoPerpetuo({ ...SAUDAVEL, roas7d: 1.47, roas30d: 1.86 });
    expect(v.motivo).toContain("1,47");
    expect(v.motivo).not.toMatch(/\d\.\d/);
  });
});
