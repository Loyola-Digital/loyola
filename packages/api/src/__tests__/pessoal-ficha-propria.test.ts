/**
 * Quem pode mudar o quê na ficha.
 *
 * A pessoa passou a editar a própria ficha, e é aqui que mora o risco: dois
 * dos campos alimentam o cálculo de saldo de férias. Editáveis por quem os
 * usa, a tela de perfil vira formulário de auto-aprovação.
 */

import { describe, expect, it } from "vitest";
import { fichaDaPropriaPessoa } from "../routes/pessoal.js";

describe("o que a própria pessoa pode gravar", () => {
  it("aceita os dados que são dela", () => {
    const r = fichaDaPropriaPessoa.safeParse({
      nomeCompleto: "Fernanda Zapparoli",
      telefone: "(11) 90000-0000",
      emailContato: "fe@exemplo.com",
      nascimento: "1990-04-12",
      emergenciaNome: "Maria",
      emergenciaTelefone: "(11) 91111-1111",
      emergenciaParentesco: "Mãe",
      cargo: "Gestora de tráfego",
    });
    expect(r.success).toBe(true);
    expect(r.success && r.data.cargo).toBe("Gestora de tráfego");
  });

  it("DESCARTA a data de entrada e o ajuste de saldo", () => {
    // Os dois entram em `calcularSaldo`. Uma entrada antecipada em dois anos
    // cria períodos aquisitivos que não existiram.
    const r = fichaDaPropriaPessoa.safeParse({
      telefone: "(11) 90000-0000",
      entradaEm: "2015-01-01",
      ajusteSaldoDias: 300,
    });
    expect(r.success).toBe(true);
    expect(r.success && "entradaEm" in r.data).toBe(false);
    expect(r.success && "ajusteSaldoDias" in r.data).toBe(false);
  });

  it("DESCARTA as observações do RH", () => {
    // São notas SOBRE a pessoa, que ela nem recebe em `/me`. Gravá-las sem ver
    // o que havia antes apagaria o registro de outra pessoa.
    const r = fichaDaPropriaPessoa.safeParse({
      nomeCompleto: "Alguém",
      observacoes: "texto que substituiria o do RH",
    });
    expect(r.success).toBe(true);
    expect(r.success && "observacoes" in r.data).toBe(false);
  });

  it("continua exigindo que a foto seja imagem embutida", () => {
    // A restrição não pode afrouxar por o autor ser outro: uma URL externa
    // aqui vira requisição do servidor para onde quem enviou apontar.
    expect(fichaDaPropriaPessoa.safeParse({ foto: "https://exemplo.com/x.png" }).success).toBe(
      false,
    );
    expect(
      fichaDaPropriaPessoa.safeParse({ foto: "data:image/png;base64,iVBORw0KGgo=" }).success,
    ).toBe(true);
  });
});
