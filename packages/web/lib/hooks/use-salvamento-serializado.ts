"use client";

/**
 * O invólucro React da fila de salvamento.
 *
 * A máquina de estados mora em `lib/bi/fila-de-salvamento` — aqui só se cuida do
 * ciclo de vida: uma fila por montagem, e descarga garantida ao desmontar, senão
 * sair da página perde o último arrasto.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { criarFilaDeSalvamento } from "@/lib/bi/fila-de-salvamento";

export function useSalvamentoSerializado<T>(
  salvar: (valor: T) => Promise<unknown>,
  atrasoMs?: number,
) {
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<unknown>(null);

  // A função de salvar muda a cada render (closure sobre props). A fila não
  // pode ser recriada por isso — senão o debounce reinicia a cada render e o
  // pendente se perde. Então a fila lê sempre a versão mais recente.
  const salvarRef = useRef(salvar);
  salvarRef.current = salvar;

  const fila = useMemo(
    () =>
      criarFilaDeSalvamento<T>((valor) => salvarRef.current(valor), {
        atrasoMs,
        aoMudarEstado: setSalvando,
        aoFalhar: setErro,
      }),
    [atrasoMs],
  );

  useEffect(() => {
    return () => {
      // Sem `await`: o desmonte não espera. Mas o `PUT` já saiu, e é isso que
      // impede o último arrasto de sumir ao trocar de página.
      void fila.descarregar();
    };
  }, [fila]);

  const agendar = useCallback(
    (valor: T) => {
      setErro(null);
      fila.agendar(valor);
    },
    [fila],
  );

  return { agendar, descarregar: fila.descarregar, salvando, erro };
}
