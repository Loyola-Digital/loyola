import { describe, it, expect } from "vitest";
import {
  SEM_PAGINA,
  abasParaDescobrir,
  acharColunaEmail,
  acharColunaNome,
  acharColunaUtmSource,
  acharColunaUtmTerm,
  agruparPorPagina,
  derivarPrefixo,
  derivarPrefixos,
  ehNomeDePagina,
  labelDaAbaDescoberta,
  letraDaLpNoUtmTerm,
  letraDaPagina,
  letrasDasFormas,
} from "../services/application-sheets.js";

// Nomes reais do funil dg-pg04 (produção, 2026-08-14) — é o caso que originou
// a story, então é o que os testes têm de proteger primeiro.
const ABA_A = "Pesquisa-Aplicacao-Comercial";
const ABA_B = "Pesquisa-Aplicacao-Comercial-PaginaB";
const ABA_C = "Pesquisa-Aplicacao-Comercial-PaginaC";

describe("derivarPrefixo", () => {
  it("remove o sufixo de página", () => {
    expect(derivarPrefixo(ABA_B)).toBe(ABA_A);
    expect(derivarPrefixo(ABA_C)).toBe(ABA_A);
  });

  it("deixa intacta a aba sem sufixo", () => {
    expect(derivarPrefixo(ABA_A)).toBe(ABA_A);
  });

  it("não confunde palavra terminada em letra com sufixo de página", () => {
    // "Comercial" termina em letra, mas não é "-PaginaX" nem "LPx".
    expect(derivarPrefixo("Formulario-Principal")).toBe("Formulario-Principal");
    expect(derivarPrefixo("Aplicacoes-Geral")).toBe("Aplicacoes-Geral");
  });

  it("aceita variações de separador, acento e caixa", () => {
    expect(derivarPrefixo("Form_paginaC")).toBe("Form");
    expect(derivarPrefixo("Form página D")).toBe("Form");
    expect(derivarPrefixo("Form-LPA")).toBe("Form");
  });

  it("não devolve prefixo vazio quando a aba é só o marcador", () => {
    // Prefixo vazio casaria com TODA aba do arquivo.
    expect(derivarPrefixo("PaginaB")).toBe("PaginaB");
  });
});

describe("derivarPrefixos", () => {
  it("colapsa prefixos repetidos", () => {
    expect(derivarPrefixos([ABA_A, ABA_B, ABA_C])).toEqual([ABA_A]);
  });

  it("mantém grupos distintos", () => {
    const r = derivarPrefixos([ABA_B, "Outro-Form-PaginaA"]);
    expect(r).toHaveLength(2);
    expect(r).toContain(ABA_A);
    expect(r).toContain("Outro-Form");
  });

  /**
   * CASO F1 (@po, validação iteração 1).
   *
   * Com UMA única planilha cadastrada, a regra antiga ("maior prefixo comum")
   * devolveria o sheet_name inteiro e a descoberta acharia ZERO abas — no
   * estado inicial de todo lançamento novo, que é quando ela mais importa.
   */
  it("F1: uma única planilha com sufixo ainda produz prefixo que acha as irmãs", () => {
    const [prefixo] = derivarPrefixos([ABA_B]);
    expect(prefixo).toBe(ABA_A);

    const abasDoArquivo = [ABA_A, ABA_B, ABA_C, "n8n-leads-captacao"];
    const descobertas = abasDoArquivo.filter((a) => a.startsWith(prefixo) && a !== ABA_B);
    expect(descobertas).toEqual([ABA_A, ABA_C]);
  });
});

describe("ehNomeDePagina", () => {
  it("reconhece nomes de página em aba e em label", () => {
    expect(ehNomeDePagina(ABA_C)).toBe(true);
    expect(ehNomeDePagina("PAGINA C")).toBe(true);
    expect(ehNomeDePagina("página d")).toBe(true);
    expect(ehNomeDePagina("LPA")).toBe(true);
  });

  /**
   * CASO F2 (@po, validação iteração 1).
   *
   * Nomear formas por formulário é uso documentado
   * (applications-daily-chart.tsx:113, stage-applications.ts:5). Num funil
   * assim o aviso de LP órfã não pode existir: acusaria erro com tudo certo, e
   * aviso que aparece com tudo certo treina o time a ignorar avisos.
   */
  it("F2: nomenclatura por formulário NÃO é padrão de página", () => {
    expect(ehNomeDePagina("form com ticket")).toBe(false);
    expect(ehNomeDePagina("form sem ticket")).toBe(false);
    expect(ehNomeDePagina("Leads")).toBe(false);
  });

  it("F2: funil inteiro sem padrão de página fecha a porta do aviso", () => {
    const formas = ["form com ticket", "form sem ticket"];
    expect(formas.some(ehNomeDePagina)).toBe(false);
  });

  it("funil com ao menos uma página abre a porta", () => {
    const formas = ["PAGINA A", "form com ticket"];
    expect(formas.some(ehNomeDePagina)).toBe(true);
  });
});

describe("letraDaPagina", () => {
  it("extrai a letra em maiúscula", () => {
    expect(letraDaPagina(ABA_C)).toBe("C");
    expect(letraDaPagina("PAGINA A")).toBe("A");
    expect(letraDaPagina("Form-lpb")).toBe("B");
  });

  it("devolve null fora do padrão de página", () => {
    expect(letraDaPagina("form com ticket")).toBeNull();
    expect(letraDaPagina(ABA_A)).toBeNull();
  });
});

describe("abasParaDescobrir", () => {
  const ABAS_DO_ARQUIVO = [ABA_A, ABA_B, ABA_C, "n8n-leads-captacao", "n8n-leads-captacao-pp"];

  it("acha a página nova e ignora as abas de outro grupo", () => {
    const r = abasParaDescobrir(ABAS_DO_ARQUIVO, [ABA_A, ABA_B], [ABA_A]);
    expect(r).toEqual([{ aba: ABA_C, prefixo: ABA_A }]);
  });

  it("não duplica aba já cadastrada", () => {
    const r = abasParaDescobrir(ABAS_DO_ARQUIVO, [ABA_A, ABA_B, ABA_C], [ABA_A]);
    expect(r).toEqual([]);
  });

  it("F1: com só a PaginaB cadastrada, descobre a base E a PaginaC", () => {
    const prefixos = derivarPrefixos([ABA_B]);
    const r = abasParaDescobrir(ABAS_DO_ARQUIVO, [ABA_B], prefixos);
    expect(r.map((x) => x.aba)).toEqual([ABA_A, ABA_C]);
  });

  it("nenhuma aba entra quando não há prefixo", () => {
    expect(abasParaDescobrir(ABAS_DO_ARQUIVO, [], [])).toEqual([]);
  });

  it("suporta dois grupos no mesmo arquivo", () => {
    const abas = [ABA_C, "Outro-Form-PaginaB", "Nada-A-Ver"];
    const r = abasParaDescobrir(abas, [], [ABA_A, "Outro-Form"]);
    expect(r.map((x) => x.aba)).toEqual([ABA_C, "Outro-Form-PaginaB"]);
  });
});

describe("letrasDasFormas", () => {
  it("identifica pelo label", () => {
    expect(letrasDasFormas([["PAGINA A", ABA_A], ["PAGINA B", ABA_B]])).toEqual(["A", "B"]);
  });

  it("identifica pela aba quando o label não diz", () => {
    // Label livre ("Form principal") mas a aba carrega a letra.
    expect(letrasDasFormas([["Form principal", ABA_B]])).toEqual(["B"]);
  });

  /**
   * CASO QA-17 (@qa, gate iteração 1).
   *
   * No cenário que o F1 destravou, a aba-base vem pela DESCOBERTA e seu label é
   * o próprio sheet_name — que não carrega letra. Ela é a "Página A" só por
   * convenção do time.
   *
   * Antes deste fix, `comForma` era montado só dos labels: a Página A entrava
   * no gráfico mas ficava fora do conjunto, e uma campanha `lpa` ativa gerava
   * "a LPA está rodando mas não há aba de aplicação" — com a página na tela.
   * Mesma classe de aviso-falso que o F2 barrou.
   */
  it("QA-17: devolve null quando alguma forma não é identificável", () => {
    const identificadores = [
      [ABA_A, ABA_A], // aba-base descoberta: label = sheet_name, sem letra
      ["PAGINA C", ABA_C],
    ];
    expect(letrasDasFormas(identificadores)).toBeNull();
  });

  it("QA-17: null faz o chamador silenciar em vez de acusar LP órfã", () => {
    const letras = letrasDasFormas([[ABA_A, ABA_A], ["PAGINA C", ABA_C]]);
    // É o contrato que a rota usa: null => nenhum aviso de LP órfã.
    const lpsOrfas = letras === null ? [] : ["LPA"];
    expect(lpsOrfas).toEqual([]);
  });

  it("com todas identificáveis, o conjunto sai completo e o aviso pode existir", () => {
    const letras = letrasDasFormas([["PAGINA A", ABA_A], ["PAGINA B", ABA_B]]);
    expect(letras).toEqual(["A", "B"]);
    const comForma = new Set(letras!);
    expect(comForma.has("C")).toBe(false); // LPC seria legitimamente órfã
  });

  it("lista vazia não bloqueia (sem formas, sem afirmação)", () => {
    expect(letrasDasFormas([])).toEqual([]);
  });
});

describe("labelDaAbaDescoberta", () => {
  it("nomeia a página pelo sufixo", () => {
    expect(labelDaAbaDescoberta(ABA_C, ABA_A)).toBe("PAGINA C");
    expect(labelDaAbaDescoberta("Form-PaginaD", "Form")).toBe("PAGINA D");
  });

  it("usa o próprio nome da aba quando ela É o prefixo (aba-base descoberta)", () => {
    // Cenário do F1: só a PaginaB estava cadastrada, a base veio pela varredura.
    expect(labelDaAbaDescoberta(ABA_A, ABA_A)).toBe(ABA_A);
  });

  it("preserva sufixo que não é de página", () => {
    expect(labelDaAbaDescoberta("Form-ComTicket", "Form")).toBe("ComTicket");
  });
});

// ============================================================
// Story 43.6 — a página vem do `utm_term`, não do nome da aba.
// ============================================================

describe("letraDaLpNoUtmTerm", () => {
  const UTM_REAL =
    "Instagram_Stories_dg-pg04-ago-26--vendas-principal-leads--2026-08-11--hot--cbo--estaticos-escassez--lpc|01_FD-ST_ALLINONE30D|ad01";

  it("extrai a LP do utm_term real que motivou a story", () => {
    expect(letraDaLpNoUtmTerm(UTM_REAL)).toBe("C");
  });

  it("aceita a LP delimitada por hífen, pipe, espaço, underscore e fim", () => {
    expect(letraDaLpNoUtmTerm("--lpa|01")).toBe("A");
    expect(letraDaLpNoUtmTerm("x--lpb--y")).toBe("B");
    expect(letraDaLpNoUtmTerm("campanha lpd fim")).toBe("D");
    expect(letraDaLpNoUtmTerm("lpe")).toBe("E");
    expect(letraDaLpNoUtmTerm("algo_lpf")).toBe("F");
  });

  /**
   * A razão de esta função existir em vez de reusar `extractLPName`.
   *
   * `extractLPName` é /lp([a-z])/i, sem âncora: "alpha" devolve LPH. Como `lph`
   * é uma LP real do dg-pg04, o falso positivo sairia plausível demais para
   * alguém desconfiar — e uma aplicação apareceria na página errada.
   */
  it("NÃO casa lp no meio de palavra — alpha não é LPH", () => {
    expect(letraDaLpNoUtmTerm("alpha")).toBeNull();
    expect(letraDaLpNoUtmTerm("alphabet")).toBeNull();
    expect(letraDaLpNoUtmTerm("campanha-alpha-teste")).toBeNull();
  });

  it("devolve null para utm_term que não é nome de anúncio", () => {
    expect(letraDaLpNoUtmTerm("publico-imersao")).toBeNull();
    expect(letraDaLpNoUtmTerm("vendas-principal-leads")).toBeNull();
    expect(letraDaLpNoUtmTerm("")).toBeNull();
    expect(letraDaLpNoUtmTerm(null)).toBeNull();
    expect(letraDaLpNoUtmTerm(undefined)).toBeNull();
  });
});

describe("acharColunaUtmTerm", () => {
  it("prefere a coluna PREENCHIDA, não a primeira homônima", () => {
    // A aba-base do dg-pg04 tem três colunas "utm_term"; só uma tem dado.
    const headers = ["data", "utm_term", "x", "utm_term", "utm_term"];
    const rows = [
      ["2026-08-14", "", "a", "--lpc|01", ""],
      ["2026-08-15", "", "b", "--lpa|01", ""],
    ];
    expect(acharColunaUtmTerm(headers, rows)).toBe(3);
  });

  it("aceita variações de grafia do cabeçalho", () => {
    expect(acharColunaUtmTerm(["UTM_TERM"], [["--lpa|"]])).toBe(0);
    expect(acharColunaUtmTerm([" utm term "], [["--lpa|"]])).toBe(0);
  });

  it("devolve null quando nenhuma candidata tem dado", () => {
    expect(acharColunaUtmTerm(["data", "utm_term"], [["2026-08-14", ""]])).toBeNull();
    expect(acharColunaUtmTerm(["data"], [["2026-08-14"]])).toBeNull();
  });
});

describe("agruparPorPagina", () => {
  const linha = (dia: string, identificador = "") => ({ dia, identificador });

  it("AC1 — aba COM sufixo não quebra: o nome já declarou a página", () => {
    // Caso real: a aba -PaginaB do dg-pg04 tem 44 linhas com lpb e 9 sem UTM.
    // As 9 pertencem à Página B, porque quem criou a aba já disse isso.
    const g = agruparPorPagina("Pesquisa-Aplicacao-Comercial-PaginaB", "PAGINA B", [
      linha("2026-08-10", "--lpb|01"),
      linha("2026-08-11", ""),
      linha("2026-08-11", "--lpc|01"),
    ]);
    expect(g).toHaveLength(1);
    expect(g[0].label).toBe("PAGINA B");
    expect(g[0].total).toBe(3);
    expect(g[0].ehPagina).toBe(true);
  });

  it("AC2/AC3 — aba-base quebra por utm_term e guarda o resto", () => {
    // A forma do dg-pg04: 2 lpa, 1 lpc, e o resto sem LP.
    const g = agruparPorPagina("Pesquisa-Aplicacao-Comercial", "PAGINA A", [
      linha("2026-08-04", "--lpa|01"),
      linha("2026-08-14", "--lpa|01"),
      linha("2026-08-14", "--lpc|01"),
      linha("2026-08-01", "publico-imersao"),
      linha("2026-08-02", ""),
    ]);
    expect(g.map((x) => x.label)).toEqual(["PAGINA A", "PAGINA C", SEM_PAGINA]);
    expect(g.map((x) => x.total)).toEqual([2, 1, 2]);
    expect(g.find((x) => x.label === "PAGINA C")?.ehPagina).toBe(true);
    expect(g.find((x) => x.label === SEM_PAGINA)?.ehPagina).toBe(false);
  });

  it("AC3 — o total do gráfico não muda por causa da quebra", () => {
    const linhas = [
      linha("2026-08-04", "--lpa|01"),
      linha("2026-08-14", "--lpc|01"),
      linha("2026-08-01", "publico-imersao"),
      linha("2026-08-02", ""),
    ];
    const g = agruparPorPagina("Pesquisa-Aplicacao-Comercial", "PAGINA A", linhas);
    expect(g.reduce((n, x) => n + x.total, 0)).toBe(linhas.length);
  });

  it("AC8 — quebra pelo utm_term mesmo com label que não parece página (dg-pg02)", () => {
    // O label do dg-pg02 é "apc" e a aba não tem sufixo. Pelo critério antigo
    // (nome da aba) ele ficaria de fora — e é o funil que mais precisa: roda 4
    // LPs numa aba-base só, hoje somadas numa série única.
    const g = agruparPorPagina("Pesquisa-AplicaçãoComercial", "apc", [
      linha("2026-08-01", "--lpa|01"),
      linha("2026-08-02", "--lpb|01"),
      linha("2026-08-03", "--lpc|01"),
      linha("2026-08-04", "--lpf|01"),
    ]);
    expect(g.map((x) => x.label)).toEqual(["PAGINA A", "PAGINA B", "PAGINA C", "PAGINA F"]);
    expect(g.every((x) => x.ehPagina)).toBe(true);
  });

  it("AC9 — aba-base sem nenhuma LP continua sendo uma série só", () => {
    const g = agruparPorPagina("form com ticket", "form com ticket", [
      linha("2026-08-01", "publico-geral"),
      linha("2026-08-02", ""),
    ]);
    expect(g).toHaveLength(1);
    expect(g[0].label).toBe("form com ticket");
    expect(g[0].total).toBe(2);
    // `false` mantém a guarda da 43.1: sem saber a página, o aviso se cala.
    expect(g[0].ehPagina).toBe(false);
  });

  it("AC7 — aba sem coluna de utm_term cai no comportamento antigo", () => {
    // `identificador` vazio em todas as linhas é como a rota sinaliza "sem coluna".
    const g = agruparPorPagina("Pesquisa-Aplicacao-Comercial", "PAGINA A", [
      linha("2026-08-01"),
      linha("2026-08-02"),
    ]);
    expect(g).toHaveLength(1);
    expect(g[0].ehPagina).toBe(false);
  });

  it("agrupa por dia dentro de cada página", () => {
    const g = agruparPorPagina("base", "base", [
      linha("2026-08-01", "--lpa|"),
      linha("2026-08-01", "--lpa|"),
      linha("2026-08-02", "--lpa|"),
    ]);
    expect(g[0].counts.get("2026-08-01")).toBe(2);
    expect(g[0].counts.get("2026-08-02")).toBe(1);
  });

  it("aba vazia não inventa série", () => {
    expect(agruparPorPagina("base", "base", [])).toEqual([
      {
        chave: "todas",
        label: "base",
        ehPagina: false,
        veioDoUtmTerm: false,
        counts: new Map(),
        total: 0,
      },
    ]);
  });
});

describe("agruparPorPagina — sinal de quebra (QA-43.6-01)", () => {
  const linha = (dia: string, identificador = "") => ({ dia, identificador });

  /**
   * O furo que o gate pegou: a tela usava "há órfãs" como gatilho da explicação
   * do AC4. Uma aba-base pode quebrar SEM deixar nenhuma órfã — e aí os números
   * mudam do mesmo jeito, com a tela calada.
   */
  it("marca veioDoUtmTerm mesmo quando NÃO sobra nenhuma órfã", () => {
    const g = agruparPorPagina("Pesquisa-AplicaçãoComercial", "apc", [
      linha("2026-08-01", "--lpa|01"),
      linha("2026-08-02", "--lpb|01"),
      linha("2026-08-03", "--lpc|01"),
    ]);
    expect(g).toHaveLength(3);
    expect(g.every((x) => x.veioDoUtmTerm)).toBe(true);
    // nenhuma órfã — era exatamente aqui que o gatilho antigo falhava
    expect(g.filter((x) => !x.ehPagina)).toHaveLength(0);
  });

  it("não marca veioDoUtmTerm quando a aba tem sufixo (AC1)", () => {
    const g = agruparPorPagina("X-PaginaB", "PAGINA B", [linha("2026-08-01", "--lpb|01")]);
    expect(g[0].veioDoUtmTerm).toBe(false);
  });

  it("não marca veioDoUtmTerm quando não houve quebra (AC9)", () => {
    const g = agruparPorPagina("base", "base", [linha("2026-08-01", "publico-geral")]);
    expect(g[0].veioDoUtmTerm).toBe(false);
  });

  it("a série SEM_PAGINA não sinaliza quebra sozinha — quem sinaliza são as páginas", () => {
    const g = agruparPorPagina("base", "base", [
      linha("2026-08-01", "--lpa|01"),
      linha("2026-08-02", ""),
    ]);
    expect(g.find((x) => x.label === SEM_PAGINA)?.veioDoUtmTerm).toBe(false);
    expect(g.find((x) => x.label === "PAGINA A")?.veioDoUtmTerm).toBe(true);
  });
});

// ============================================================
// Story 43.7 — colunas de nome e e-mail para a lista de aplicações.
// ============================================================

describe("acharColunaNome / acharColunaEmail", () => {
  it("escolhe a coluna PREENCHIDA entre homônimas", () => {
    // Shape real da aba-base do dg-pg04: name(16), Nome(24), name(40) — só a
    // primeira com dado. E-mail idem.
    const headers = ["data", "name", "email", "x", "Nome", "E-mail"];
    const rows = [
      ["2026-08-14", "Otavio", "o@x.com", "-", "", ""],
      ["2026-08-13", "Renata", "r@x.com", "-", "", ""],
    ];
    expect(acharColunaNome(headers, rows)).toBe(1);
    expect(acharColunaEmail(headers, rows)).toBe(2);
  });

  it("prefere a segunda quando é ela que tem dado", () => {
    const headers = ["name", "Nome"];
    const rows = [["", "Joseilme"], ["", "Danusa"]];
    expect(acharColunaNome(headers, rows)).toBe(1);
  });

  /**
   * As âncoras existem para isto: sem elas, "Nome do produto" e "email de
   * cobrança" entrariam como se fossem a coluna da pessoa.
   */
  it("não casa cabeçalho que apenas CONTÉM nome/email", () => {
    expect(acharColunaNome(["Nome do produto"], [["Curso X"]])).toBeNull();
    expect(acharColunaEmail(["email de cobrança"], [["a@b.com"]])).toBeNull();
  });

  it("aceita as variações de grafia usadas nas planilhas", () => {
    expect(acharColunaNome([" NAME "], [["Ana"]])).toBe(0);
    expect(acharColunaEmail(["E-Mail"], [["a@b.com"]])).toBe(0);
    expect(acharColunaEmail(["Email"], [["a@b.com"]])).toBe(0);
  });

  it("devolve null quando a coluna não existe ou está toda vazia", () => {
    expect(acharColunaNome(["data"], [["2026-08-14"]])).toBeNull();
    expect(acharColunaEmail(["email"], [[""]])).toBeNull();
  });
});

describe("acharColunaUtmSource", () => {
  it("acha a coluna do canal", () => {
    expect(acharColunaUtmSource(["data", "utm_source"], [["2026-08-14", "meta"]])).toBe(1);
    expect(acharColunaUtmSource(["UTM_SOURCE"], [["ig"]])).toBe(0);
    expect(acharColunaUtmSource([" utm source "], [["whatsapp"]])).toBe(0);
  });

  it("escolhe a preenchida entre homônimas", () => {
    // dg-pg04: utm_source em 20 e 44, só a primeira com dado.
    const headers = ["utm_source", "x", "utm_source"];
    const rows = [["meta", "-", ""], ["ig", "-", ""]];
    expect(acharColunaUtmSource(headers, rows)).toBe(0);
  });

  /**
   * A âncora impede confundir com `utm_source_original` ou `utm_sourced`, e
   * — o que mais importaria aqui — com `utm_term`: o canal e a página são
   * perguntas diferentes, e extrair a LP do `utm_source` faria toda aplicação
   * vinda do Meta virar a mesma página.
   */
  it("não casa outras colunas utm", () => {
    expect(acharColunaUtmSource(["utm_term"], [["--lpa|"]])).toBeNull();
    expect(acharColunaUtmSource(["utm_campaign"], [["dg-pg04"]])).toBeNull();
    expect(acharColunaUtmSource(["utm_source_original"], [["meta"]])).toBeNull();
  });
});
