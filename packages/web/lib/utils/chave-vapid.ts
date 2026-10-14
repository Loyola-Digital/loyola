/**
 * A chave VAPID viaja como base64url e o `pushManager.subscribe` exige bytes.
 *
 * Duas pegadinhas moram aqui: o base64url troca `+/` por `-_`, e o padding `=`
 * costuma vir cortado — `atob` recusa os dois casos. Chave convertida errado
 * não dá erro na hora: a inscrição é criada e o serviço de push rejeita o envio
 * depois, longe daqui.
 *
 * O buffer é criado explícito porque `Uint8Array.from` devolve
 * `Uint8Array<ArrayBufferLike>`, que pode ser memória compartilhada, e
 * `applicationServerKey` só aceita `ArrayBuffer`.
 */
export function chaveVapidParaBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const bin = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
