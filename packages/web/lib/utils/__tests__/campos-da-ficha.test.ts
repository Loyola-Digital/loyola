import { describe, expect, it } from "vitest";
import {
  CAMPOS_DA_PESSOA,
  CAMPOS_DE_RH,
  entradaDoFormulario,
  formularioDaFicha,
} from "../campos-da-ficha";
import type { Ficha } from "@/lib/hooks/use-pessoal";

const ficha = (over: Partial<Ficha> = {}): Ficha => ({
  userId: "u1",
  nome: "Fulano",
  email: "f@x.com",
  role: "member",
  nomeCompleto: null,
  foto: null,
  fotoDoPdi: false,
  nascimento: null,
  telefone: null,
  emailContato: null,
  emergenciaNome: null,
  emergenciaTelefone: null,
  emergenciaParentesco: null,
  cargo: null,
  entradaEm: null,
  ajusteSaldoDias: 0,
  cpf: null,
  cnpj: null,
  chavePix: null,
  endereco: null,
  temFicha: true,
  ...over,
});

describe("formularioDaFicha", () => {
  it("carrega os dados de pagamento — o bug que abria a ficha vazia", () => {
    // Estavam gravados no banco e a tela mostrava em branco, porque o
    // formulário nunca era preenchido com eles.
    const f = formularioDaFicha(
      ficha({
        cpf: "52998224725",
        cnpj: "11222333000181",
        chavePix: "a@b.com",
        endereco: "Rua X",
      }),
    );
    expect(f.cpf).toBe("52998224725");
    expect(f.cnpj).toBe("11222333000181");
    expect(f.chavePix).toBe("a@b.com");
    expect(f.endereco).toBe("Rua X");
  });

  it("campo nulo vira string vazia, não 'null'", () => {
    // `String(null)` daria "null" no input — visível e ridículo.
    const f = formularioDaFicha(ficha());
    expect(f.cpf).toBe("");
    expect(f.telefone).toBe("");
  });

  it("cobre todo campo das duas listas", () => {
    const f = formularioDaFicha(ficha());
    for (const campo of [...CAMPOS_DA_PESSOA, ...CAMPOS_DE_RH]) {
      expect(f).toHaveProperty(campo);
    }
  });
});

describe("entradaDoFormulario", () => {
  it("manda os dados de pagamento — o outro lado do mesmo bug", () => {
    // A tela dizia "Ficha salva" e o PUT ia sem os campos. Um PUT sem o campo
    // é um PUT válido: o servidor respondia 200 e não gravava nada.
    const d = entradaDoFormulario(
      {
        cpf: "52998224725",
        cnpj: "11222333000181",
        chavePix: "a@b.com",
        endereco: "Rua X",
      },
      { camposDeRh: false },
    );
    expect(d.cpf).toBe("52998224725");
    expect(d.cnpj).toBe("11222333000181");
    expect(d.chavePix).toBe("a@b.com");
    expect(d.endereco).toBe("Rua X");
  });

  it("vazio vira null, não string vazia", () => {
    const d = entradaDoFormulario(
      { cpf: "", telefone: "   " },
      { camposDeRh: false },
    );
    expect(d.cpf).toBeNull();
    expect(d.telefone).toBeNull();
  });

  it("sem permissão de RH, os campos de RH não viajam", () => {
    const d = entradaDoFormulario(
      { entradaEm: "2020-01-01", observacoes: "nota" },
      { camposDeRh: false },
    );
    expect(d).not.toHaveProperty("entradaEm");
    expect(d).not.toHaveProperty("observacoes");
  });

  it("com permissão de RH, eles vão", () => {
    const d = entradaDoFormulario(
      { entradaEm: "2020-01-01", observacoes: "nota" },
      { camposDeRh: true },
    );
    expect(d.entradaEm).toBe("2020-01-01");
    expect(d.observacoes).toBe("nota");
  });

  it("o que sai do formulário volta igual pelo carregamento", () => {
    // A ida e a volta usam a MESMA lista. Se divergirem, um campo é gravado e
    // some ao reabrir — que foi exatamente o sintoma relatado.
    const original = ficha({
      cpf: "52998224725",
      cnpj: "11222333000181",
      telefone: "11999",
    });
    const volta = entradaDoFormulario(formularioDaFicha(original), {
      camposDeRh: true,
    });
    expect(volta.cpf).toBe(original.cpf);
    expect(volta.cnpj).toBe(original.cnpj);
    expect(volta.telefone).toBe(original.telefone);
  });
});
