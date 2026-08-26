/**
 * Prepara a foto da ficha para caber no banco.
 *
 * A imagem vai como data: URI dentro da linha — não há bucket de arquivos neste
 * ambiente. Uma foto de celular tem 3 a 8 MB; sem reduzir, cada abertura do
 * painel arrastaria isso vezes o número de pessoas, e o CHECK da tabela
 * recusaria a gravação de qualquer jeito.
 *
 * Corta no centro em quadrado, reduz para 256px e comprime — chega em dezenas
 * de KB, a mesma ordem das fotos que já vêm dentro dos PDIs.
 */

const LADO = 256;
const TETO_BYTES = 700_000;

export async function prepararFoto(arquivo: File): Promise<string> {
  if (!arquivo.type.startsWith("image/")) {
    throw new Error("Escolha um arquivo de imagem.");
  }

  const bitmap = await criarBitmap(arquivo);
  const canvas = document.createElement("canvas");
  canvas.width = LADO;
  canvas.height = LADO;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Não consegui processar a imagem neste navegador.");

  // Recorte central: a foto vira um círculo na tela, e redimensionar sem cortar
  // deixaria barras nas laterais dentro do círculo.
  const lado = Math.min(bitmap.width, bitmap.height);
  ctx.drawImage(
    bitmap,
    (bitmap.width - lado) / 2,
    (bitmap.height - lado) / 2,
    lado,
    lado,
    0,
    0,
    LADO,
    LADO,
  );
  if ("close" in bitmap && typeof bitmap.close === "function") bitmap.close();

  // Cai a qualidade até caber. Em 256px a diferença entre 0.82 e 0.6 é
  // imperceptível num avatar, e uma foto que não grava é pior que uma um pouco
  // mais comprimida.
  for (const qualidade of [0.82, 0.7, 0.6, 0.45]) {
    const uri = canvas.toDataURL("image/webp", qualidade);
    if (uri.length <= TETO_BYTES) return uri;
  }
  const jpeg = canvas.toDataURL("image/jpeg", 0.5);
  if (jpeg.length > TETO_BYTES) throw new Error("Não consegui reduzir a imagem o bastante.");
  return jpeg;
}

/**
 * `createImageBitmap` não existe em todo navegador; o caminho pelo <img> cobre
 * o resto sem exigir polyfill.
 */
async function criarBitmap(arquivo: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(arquivo);
    } catch {
      /* formato que o decoder não aceita: tenta pelo <img> */
    }
  }
  const url = URL.createObjectURL(arquivo);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Não consegui ler essa imagem."));
      img.src = url;
    });
  } finally {
    // Só depois do onload: revogar antes deixa o <img> sem fonte.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}
