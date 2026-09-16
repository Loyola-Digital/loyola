import { describe, expect, it } from "vitest";
import { mensagemDeErroDaConta } from "../erro-de-conta-do-instagram";

describe("mensagemDeErroDaConta", () => {
  it("conta repetida manda editar a existente, não adicionar de novo", () => {
    const m = mensagemDeErroDaConta(new Error("Esta conta do Instagram já está cadastrada"));
    expect(m).toContain("Editar");
  });

  it("token expirado fala em gerar outro", () => {
    const m = mensagemDeErroDaConta(
      new Error("Error validating access token: Session has expired on Tuesday, 23-Jun-26"),
    );
    expect(m).toContain("expirou");
  });

  it("token colado pela metade aponta a causa provável", () => {
    const m = mensagemDeErroDaConta(new Error("Invalid OAuth access token - Cannot parse access token"));
    expect(m).toContain("colado inteiro");
  });

  it("erro desconhecido mostra o que a API disse, e não uma mensagem inventada", () => {
    // O defeito que motivou isto: a tela dizia "sem permissão" para tudo.
    expect(mensagemDeErroDaConta(new Error("Conta não encontrada"))).toBe("Conta não encontrada");
  });

  it("sem erro, sem mensagem", () => {
    expect(mensagemDeErroDaConta(null)).toBeNull();
  });
});
