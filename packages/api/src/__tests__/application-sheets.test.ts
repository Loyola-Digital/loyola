import { describe, it, expect } from "vitest";
import {
  abasParaDescobrir,
  derivarPrefixo,
  derivarPrefixos,
  ehNomeDePagina,
  letraDaPagina,
  labelDaAbaDescoberta,
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
