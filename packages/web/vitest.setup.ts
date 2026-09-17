/**
 * Remendos do jsdom para os testes de componente.
 *
 * O Radix (Select, Tooltip, Dialog) usa APIs de ponteiro e rolagem que o jsdom
 * não implementa. Sem isto, abrir um menu quebra com
 * "candidate?.scrollIntoView is not a function" — erro do ambiente de teste,
 * não do componente.
 */
import { vi } from "vitest";

if (typeof Element !== "undefined") {
  Element.prototype.hasPointerCapture ??= vi.fn(() => false);
  Element.prototype.setPointerCapture ??= vi.fn();
  Element.prototype.releasePointerCapture ??= vi.fn();
  Element.prototype.scrollIntoView ??= vi.fn();
}
