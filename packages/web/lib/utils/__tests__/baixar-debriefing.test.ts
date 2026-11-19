import { describe, expect, it } from "vitest";
import { nomeDoArquivoDebriefing } from "../baixar-debriefing";

describe("nomeDoArquivoDebriefing", () => {
  it("usa o nome do arquivo subido, sem duplicar a extensão", () => {
    expect(
      nomeDoArquivoDebriefing({ campaignName: "DGPG-03", fileName: "debrief-final.html" }),
    ).toBe("debrief-final.html");
  });

  // O gerado nasce com fileName null — o nome tem de sair da campanha.
  it("cai no nome da campanha quando não há arquivo", () => {
    expect(nomeDoArquivoDebriefing({ campaignName: "DGPG-03", fileName: null })).toBe(
      "DGPG-03.html",
    );
  });

  it("mantém acento e troca só o que quebra o nome do arquivo", () => {
    expect(
      nomeDoArquivoDebriefing({ campaignName: "Lançamento 04/2026: fim", fileName: null }),
    ).toBe("Lançamento 04_2026_ fim.html");
  });

  it("nome que sobra vazio ainda baixa com nome", () => {
    expect(nomeDoArquivoDebriefing({ campaignName: "///", fileName: null })).toBe(
      "debriefing.html",
    );
    expect(nomeDoArquivoDebriefing({ campaignName: "...", fileName: null })).toBe(
      "debriefing.html",
    );
  });
});
