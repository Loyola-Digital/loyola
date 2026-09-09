/**
 * As onze cores de evento do Google Calendar.
 *
 * ## Por que estas e não outras
 *
 * O time olha as duas telas: o Planner aqui e a agenda no Google. Quando um
 * lançamento é vermelho lá e roxo aqui, a pessoa perde o reconhecimento de
 * relance — que é a única coisa que uma cor faz num calendário. Adotar a
 * paleta do Google faz "aquele evento laranja" significar a mesma coisa nos
 * dois lugares.
 *
 * Os hex são os que a API do Google devolve em `colors.get` para eventos. Os
 * nomes são os que aparecem no Google Calendar em português — é assim que
 * alguém pede "põe no tomate", e o seletor precisa falar a mesma língua.
 *
 * ## `colorId` é opcional no evento
 *
 * Evento sem `colorId` usa a cor do CALENDÁRIO, que não está aqui: ela vive em
 * `calendarList`, que é por usuário e vem vazia para a service account (ela não
 * tem caixa de entrada). Nesse caso quem decide a cor continua sendo
 * `corParaCampanha` — ver `planner-sync.ts`.
 *
 * ## A mesma tabela existe no web
 *
 * `packages/web/lib/utils/cores-do-google.ts`. O web não importa valores de
 * `@loyola-x/shared` (quebra o build do Next), e uma chamada de rede para saber
 * o hex de uma cor fixa seria pior que a cópia.
 */

export interface CorDoGoogle {
  /** O `colorId` da API. String, porque é assim que o Google manda. */
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

/** Só os hex, na ordem — é o formato que a paleta cíclica do planner espera. */
export const PALETA_DO_GOOGLE = CORES_DO_GOOGLE.map((c) => c.hex);

/** O hex de um `colorId`, ou `null` quando o evento não trouxe cor própria. */
export function hexDoColorId(id: string | null | undefined): string | null {
  if (!id) return null;
  return CORES_DO_GOOGLE.find((c) => c.id === String(id))?.hex ?? null;
}
