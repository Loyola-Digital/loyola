import { describe, expect, it } from "vitest";
import { cruzarOrigem, lerExportDeLeads } from "../services/sendflow-origem.js";

// Números fictícios.
const A = "5511900000001";
const B = "5511900000002";
const C = "5511900000003";
const D = "5511900000004";

const cab = "Posição;Grupo;Nome;Número;Saiu";

describe("lerExportDeLeads", () => {
  it("lê o formato real, com `;` sobrando no fim da linha", () => {
    const r = lerExportDeLeads(
      [cab, `1;Semana #2;;${A};Não;`, `2;Semana #2;;${B};Sim;`].join("\n"),
    );
    expect([...r.atuais]).toEqual([A]);
    expect([...r.sairam]).toEqual([B]);
  });

  it("ignora cabeçalho, linha vazia e CRLF", () => {
    const r = lerExportDeLeads(`${cab}\r\n\r\n1;G;;${A};Não;\r\n`);
    expect(r.atuais.size).toBe(1);
    expect(r.sairam.size).toBe(0);
  });

  it("não se perde com `;` no nome do grupo", () => {
    // Pela posição do cabeçalho, o número viraria "Turma 2" sem erro nenhum.
    const comAspas = lerExportDeLeads(`${cab}\n1;"Avisos; Turma 2";;${A};Não;`);
    const semAspas = lerExportDeLeads(`${cab}\n1;Avisos; Turma 2;;${A};Não;`);
    expect([...comAspas.atuais]).toEqual([A]);
    expect([...semAspas.atuais]).toEqual([A]);
  });

  it("a posição da linha não é confundida com telefone", () => {
    const r = lerExportDeLeads(`${cab}\n3446;G;;;Não;`);
    expect(r.atuais.size).toBe(0);
  });

  it("saiu de um grupo e está em outro da campanha: continua dentro", () => {
    const r = lerExportDeLeads(
      [cab, `1;G #1;;${A};Sim;`, `2;G #2;;${A};Não;`].join("\n"),
    );
    expect(r.atuais.has(A)).toBe(true);
    expect(r.sairam.has(A)).toBe(false);
  });

  it("normaliza número formatado", () => {
    const r = lerExportDeLeads(`${cab}\n1;G;;+55 (11) 90000-0001;Não;`);
    expect([...r.atuais]).toEqual([A]);
  });
});

describe("cruzarOrigem", () => {
  const campanha = { atuais: new Set([A, B, C]), sairam: new Set([D]) };
  const antiga = { atuais: new Set([A]), sairam: new Set([D]) };

  it("separa quem veio da antiga de quem é novo", () => {
    const r = cruzarOrigem(campanha, antiga);
    expect(r.total).toBe(4);
    expect(r.vieramDaAntiga).toBe(2);
    expect(r.novos).toBe(2);
    expect(r.vieramDaAntiga + r.novos).toBe(r.total);
  });

  it("quem já tinha saído da antiga também conta como vindo dela", () => {
    const r = cruzarOrigem(campanha, antiga);
    expect(r.aindaNaAntiga).toBe(1);
    expect(r.tinhamSaidoDaAntiga).toBe(1);
  });

  it("quem saiu da campanha atual continua no total", () => {
    // Entrou pela página e saiu: ainda é alguém que a página trouxe.
    const r = cruzarOrigem(campanha, antiga);
    expect(r.sairamDaCampanha).toBe(1);
    expect(r.participantes.find((p) => p.numero === D)).toEqual({
      numero: D,
      veioDaAntiga: true,
      saiu: true,
    });
  });

  it("campanha antiga vazia: todo mundo é novo", () => {
    const r = cruzarOrigem(campanha, { atuais: new Set(), sairam: new Set() });
    expect(r.novos).toBe(4);
    expect(r.vieramDaAntiga).toBe(0);
  });
});
