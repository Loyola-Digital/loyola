import { describe, expect, it } from "vitest";
import {
  ABA_PADRAO,
  abaPadraoDoGrupo,
  abasDoMenu,
  ehGrupoExpansivel,
  grupoDaAba,
  montarMenuDeAbas,
  resolverAbaAtiva,
  type ContextoDeAbas,
} from "./menu-de-abas";

/** Etapa paga de um lançamento — a configuração mais comum. */
const LANCAMENTO_CAPTACAO_PAGA: ContextoDeAbas = {
  funnelType: "launch",
  ehCaptacaoPagaStage: true,
  familiaCadeiaCac: "paga",
};

const PERPETUO: ContextoDeAbas = {
  funnelType: "perpetual",
  ehCaptacaoPagaStage: false,
  familiaCadeiaCac: "paga",
};

/** Lançamento fora da captação paga: o grupo Meta Ads fica sem filhos. */
const LANCAMENTO_SEM_CAPTACAO_PAGA: ContextoDeAbas = {
  funnelType: "launch",
  ehCaptacaoPagaStage: false,
  familiaCadeiaCac: "gratuita",
};

/** `lyrio` / `comercial` / `debriefing` — família `null`. */
const FORA_DA_CADEIA: ContextoDeAbas = {
  funnelType: "launch",
  ehCaptacaoPagaStage: true,
  familiaCadeiaCac: null,
};

const idsDe = (ctx: ContextoDeAbas) => montarMenuDeAbas(ctx).map((g) => g.id);
const grupo = (ctx: ContextoDeAbas, id: string) => {
  const g = montarMenuDeAbas(ctx).find((x) => x.id === id);
  if (!g) throw new Error(`grupo ${id} não está no menu`);
  return g;
};

describe("montarMenuDeAbas — estrutura", () => {
  it("entrega cinco grupos de primeiro nível na etapa paga de lançamento", () => {
    expect(idsDe(LANCAMENTO_CAPTACAO_PAGA)).toEqual([
      "meta-ads",
      "youtube-ads",
      "dados",
      "inacio",
      "relatorios",
    ]);
  });

  it("agrupa as oito fontes de dados em Dados, na ordem de antes", () => {
    expect(grupo(LANCAMENTO_CAPTACAO_PAGA, "dados").filhos.map((f) => f.value)).toEqual([
      "surveys",
      "spreadsheets",
      "switchy-links",
      "lead-scoring",
      "organic-media",
      "mautic",
      "ga4",
      "nps",
    ]);
  });

  it("mantém Relatórios no primeiro nível, fora do grupo Inácio", () => {
    // O Resumão é de lançamento/perpétuo (Epic 41), não do Inácio. Enterrá-lo
    // sob o rótulo de um expert esconderia a ferramenta de quem a usa.
    const menu = montarMenuDeAbas(LANCAMENTO_CAPTACAO_PAGA);
    expect(grupoDaAba(menu, "relatorios")?.id).toBe("relatorios");
    expect(grupo(LANCAMENTO_CAPTACAO_PAGA, "inacio").filhos.map((f) => f.value)).toEqual([
      "cadeia-cac",
      "panorama",
    ]);
  });
});

describe("montarMenuDeAbas — elegibilidade (AC1/AC4)", () => {
  it("lançamento com captação paga: Meta Ads tem Meta Ads TESTE, e não Análise MVP", () => {
    expect(grupo(LANCAMENTO_CAPTACAO_PAGA, "meta-ads").filhos.map((f) => f.value)).toEqual([
      "meta-ads-teste",
    ]);
  });

  it("perpétuo: Meta Ads fica SEM filhos — a Análise MVP mudou de grupo (46.2)", () => {
    const g = grupo(PERPETUO, "meta-ads");
    expect(g.filhos).toEqual([]);
    // Consequência declarada na AC2 da 46.2: sem filhos, vira aba comum e some
    // a afordância de submenu. Não é regra nova — é a AC4 da 46.1 sendo
    // exercida por uma configuração que antes não a alcançava.
    expect(ehGrupoExpansivel(g)).toBe(false);
  });

  it("perpétuo: a Análise MVP é o PRIMEIRO filho de Dados (46.2 AC1)", () => {
    // Primeiro e não último: ela é análise, as outras oito são fontes. No fim
    // de nove itens ela se esconderia de novo — que é o que originou a story.
    expect(grupo(PERPETUO, "dados").filhos.map((f) => f.value)).toEqual([
      "analise-mvp",
      "surveys",
      "spreadsheets",
      "switchy-links",
      "lead-scoring",
      "organic-media",
      "mautic",
      "ga4",
      "nps",
    ]);
  });

  it("lançamento: a Análise MVP NÃO vaza para Dados", () => {
    // A armadilha que o @po barrou: mutar o const de módulo com `unshift`
    // vazaria a aba para todo funil. Espalhar mantém a elegibilidade.
    for (const ctx of [LANCAMENTO_CAPTACAO_PAGA, LANCAMENTO_SEM_CAPTACAO_PAGA]) {
      const dados = montarMenuDeAbas(ctx).find((g) => g.id === "dados");
      expect(dados?.filhos.map((f) => f.value)).not.toContain("analise-mvp");
      expect(dados?.filhos[0]?.value).toBe("surveys");
    }
  });

  it("montar duas vezes não duplica a Análise MVP", () => {
    // A outra metade da mesma armadilha: `unshift` DENTRO da função acumularia
    // uma cópia a cada chamada, e o menu é remontado a cada render.
    const a = grupo(PERPETUO, "dados").filhos.map((f) => f.value);
    const b = grupo(PERPETUO, "dados").filhos.map((f) => f.value);
    expect(a).toEqual(b);
    expect(a.filter((v) => v === "analise-mvp")).toHaveLength(1);
  });

  it("lançamento sem captação paga: Meta Ads fica SEM filhos e vira aba comum", () => {
    const g = grupo(LANCAMENTO_SEM_CAPTACAO_PAGA, "meta-ads");
    expect(g.filhos).toEqual([]);
    // Continua no menu porque tem conteúdo próprio — mas sem afordância de
    // submenu, senão a seta abriria o nada.
    expect(ehGrupoExpansivel(g)).toBe(false);
    expect(abaPadraoDoGrupo(g)).toBe("meta-ads");
  });

  it("família null: o grupo Inácio não é renderizado", () => {
    // Story 44.9 — família `null` não ganha aba vazia: não ganha aba. E o
    // Panorama vive no mesmo escopo, então não sobra filho para segurar o grupo.
    expect(idsDe(FORA_DA_CADEIA)).not.toContain("inacio");
    expect(abasDoMenu(montarMenuDeAbas(FORA_DA_CADEIA)).map((a) => a.value)).not.toContain(
      "panorama",
    );
  });

  it("grupo sem conteúdo próprio e sem filhos some; com conteúdo próprio permanece", () => {
    const semCadeia = montarMenuDeAbas(FORA_DA_CADEIA);
    // "dados" nunca fica vazio, então continua; "inacio" some.
    expect(semCadeia.map((g) => g.id)).toEqual(["meta-ads", "youtube-ads", "dados", "relatorios"]);
  });
});

describe("abaPadraoDoGrupo (AC3)", () => {
  it("pai com conteúdo próprio abre nele mesmo", () => {
    expect(abaPadraoDoGrupo(grupo(PERPETUO, "meta-ads"))).toBe("meta-ads");
    expect(abaPadraoDoGrupo(grupo(PERPETUO, "relatorios"))).toBe("relatorios");
  });

  it("Inácio abre em Cadeia de CAC, não em Panorama", () => {
    expect(abaPadraoDoGrupo(grupo(PERPETUO, "inacio"))).toBe("cadeia-cac");
  });

  it("Dados abre no primeiro filho elegível — que no perpétuo passou a ser a Análise MVP", () => {
    // ⚠️ Efeito colateral declarado da 46.2 (achado F3 do @po): `abaPadraoDoGrupo`
    // devolve `filhos[0]`, então pôr a Análise MVP em primeiro muda o destino do
    // clique no pai "Dados". Aceito e travado aqui para não chegar como surpresa.
    expect(abaPadraoDoGrupo(grupo(PERPETUO, "dados"))).toBe("analise-mvp");
    expect(abaPadraoDoGrupo(grupo(LANCAMENTO_CAPTACAO_PAGA, "dados"))).toBe("surveys");
  });
});

describe("grupoDaAba — o pai é derivado do filho (AC5)", () => {
  it("acha o grupo a partir de uma aba filha", () => {
    const menu = montarMenuDeAbas(LANCAMENTO_CAPTACAO_PAGA);
    expect(grupoDaAba(menu, "meta-ads-teste")?.id).toBe("meta-ads");
    expect(grupoDaAba(menu, "nps")?.id).toBe("dados");
    expect(grupoDaAba(menu, "panorama")?.id).toBe("inacio");
  });

  it("devolve null para aba que não existe nesta etapa", () => {
    expect(grupoDaAba(montarMenuDeAbas(FORA_DA_CADEIA), "cadeia-cac")).toBeNull();
    expect(grupoDaAba(montarMenuDeAbas(PERPETUO), "meta-ads-teste")).toBeNull();
  });
});

describe("resolverAbaAtiva — o ?tab= da URL (AC5)", () => {
  const menuPago = montarMenuDeAbas(LANCAMENTO_CAPTACAO_PAGA);

  it("sem ?tab= cai no default de hoje", () => {
    expect(resolverAbaAtiva(menuPago, null)).toBe(ABA_PADRAO);
    expect(resolverAbaAtiva(menuPago, undefined)).toBe("meta-ads");
    expect(resolverAbaAtiva(menuPago, "")).toBe("meta-ads");
  });

  it("respeita um ?tab= válido, inclusive de aba filha", () => {
    expect(resolverAbaAtiva(menuPago, "nps")).toBe("nps");
    expect(resolverAbaAtiva(menuPago, "panorama")).toBe("panorama");
    expect(resolverAbaAtiva(menuPago, "meta-ads-teste")).toBe("meta-ads-teste");
  });

  it("?tab= inexistente cai no default sem estourar", () => {
    expect(resolverAbaAtiva(menuPago, "aba-que-nunca-existiu")).toBe("meta-ads");
  });

  it("?tab= válido em OUTRA etapa cai no default aqui", () => {
    // O caso real: alguém manda o link da Cadeia de CAC de uma etapa paga e o
    // colega abre numa etapa `lyrio`, onde a aba não existe.
    const menuSemCadeia = montarMenuDeAbas(FORA_DA_CADEIA);
    expect(resolverAbaAtiva(menuSemCadeia, "cadeia-cac")).toBe("meta-ads");
    // E o inverso: Meta Ads TESTE não existe no perpétuo.
    expect(resolverAbaAtiva(montarMenuDeAbas(PERPETUO), "meta-ads-teste")).toBe("meta-ads");
  });

  it("um link ?tab=analise-mvp de antes da 46.2 continua abrindo a aba (QA-452-05)", () => {
    // A 46.2 mudou o GRUPO da aba, nunca o `value`. Este teste existe porque o
    // "nunca devolve uma aba que o menu não renderiza", abaixo, é TAUTOLÓGICO
    // para este caso: `toContain` passa igual se `resolverAbaAtiva` cair no
    // fallback `meta-ads`. Aqui a asserção é de identidade, não de pertinência.
    const menu = montarMenuDeAbas(PERPETUO);
    expect(resolverAbaAtiva(menu, "analise-mvp")).toBe("analise-mvp");
    // E o pai derivado tem de ser o grupo NOVO — senão o link abre a aba certa
    // com o submenu errado aberto.
    expect(grupoDaAba(menu, "analise-mvp")?.id).toBe("dados");
  });

  it("nunca devolve uma aba que o menu não renderiza", () => {
    for (const ctx of [LANCAMENTO_CAPTACAO_PAGA, PERPETUO, LANCAMENTO_SEM_CAPTACAO_PAGA, FORA_DA_CADEIA]) {
      const menu = montarMenuDeAbas(ctx);
      const existentes = abasDoMenu(menu).map((a) => a.value);
      for (const pedido of [null, "meta-ads", "cadeia-cac", "panorama", "lixo", "analise-mvp"]) {
        expect(existentes).toContain(resolverAbaAtiva(menu, pedido));
      }
    }
  });
});

describe("contrato de URL (AC2)", () => {
  it("os values de antes da 46.1 sobrevivem intactos", () => {
    // Renomear qualquer um destes quebraria links no mesmo dia em que eles
    // passam a existir. "ga4" é o caso a lembrar: o rótulo virou "Analytics"
    // na 0870c2a2 e o value ficou de propósito.
    const todos = abasDoMenu(montarMenuDeAbas(PERPETUO)).map((a) => a.value);
    // A 46.2 mudou a POSIÇÃO de `analise-mvp` (Meta Ads → Dados), nunca o
    // `value`: `?tab=analise-mvp` compartilhado antes continua abrindo a aba.
    expect(todos).toEqual([
      "meta-ads",
      "youtube-ads",
      "analise-mvp",
      "surveys",
      "spreadsheets",
      "switchy-links",
      "lead-scoring",
      "organic-media",
      "mautic",
      "ga4",
      "nps",
      "cadeia-cac",
      "panorama",
      "relatorios",
    ]);
  });

  it("todo item tem value, label e ícone — o menu não renderiza buraco", () => {
    for (const aba of abasDoMenu(montarMenuDeAbas(LANCAMENTO_CAPTACAO_PAGA))) {
      expect(aba.value).toBeTruthy();
      expect(aba.label).toBeTruthy();
      expect(aba.icon).toBeTruthy();
    }
  });
});
