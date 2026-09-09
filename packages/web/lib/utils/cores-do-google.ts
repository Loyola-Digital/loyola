/**
 * As onze cores de evento do Google Calendar.
 *
 * Cópia fiel de `packages/api/src/services/cores-do-google.ts`. O web não
 * importa VALORES de `@loyola-x/shared` (quebra o build do Next), e pedir ao
 * servidor o hex de uma cor fixa seria pior que a cópia. Se mudar de um lado,
 * mude do outro — os hex vêm do Google e não mudam sozinhos.
 *
 * Os nomes são os do Google Calendar em português: é assim que alguém pede
 * "põe no tomate", e o seletor precisa falar a mesma língua.
 */

export interface CorDoGoogle {
  id: string;
  nome: string;
  hex: string;
}

export const CORES_DO_GOOGLE: readonly CorDoGoogle[] = [
  { id: "1", nome: "Lavanda", hex: "#7986CB" },
  { id: "2", nome: "Sálvia", hex: "#33B679" },
  { id: "3", nome: "Uva", hex: "#8E24AA" },
  { id: "4", nome: "Flamingo", hex: "#E67C73" },
  { id: "5", nome: "Banana", hex: "#F6BF26" },
  { id: "6", nome: "Tangerina", hex: "#F4511E" },
  { id: "7", nome: "Pavão", hex: "#039BE5" },
  { id: "8", nome: "Grafite", hex: "#616161" },
  { id: "9", nome: "Mirtilo", hex: "#3F51B5" },
  { id: "10", nome: "Manjericão", hex: "#0B8043" },
  { id: "11", nome: "Tomate", hex: "#D50000" },
] as const;

/** O nome da cor, quando ela é uma das do Google. */
export function nomeDaCor(hex: string | null | undefined): string | null {
  const alvo = (hex ?? "").trim().toUpperCase();
  return (
    CORES_DO_GOOGLE.find((c) => c.hex.toUpperCase() === alvo)?.nome ?? null
  );
}
