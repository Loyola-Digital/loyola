"use client";

/**
 * Botão de instalar o Loyola X como app.
 *
 * Três comportamentos, porque os navegadores não concordam:
 *
 * - **Chrome/Edge** disparam `beforeinstallprompt` quando a página é
 *   instalável. O evento só pode ser usado UMA vez e só a partir de um clique,
 *   então ele é guardado e disparado no gesto da pessoa.
 * - **Safari no iPhone** não tem o evento nem API nenhuma: lá só dá para
 *   explicar o caminho (Compartilhar → Adicionar à Tela de Início), e é onde
 *   mais importa, porque sem instalar não há notificação no iOS.
 * - **Já instalado** (rodando em `standalone`): o botão some. Oferecer
 *   instalar dentro do próprio app instalado é ruído.
 */

import { useEffect, useState } from "react";
import { Download, Share } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface EventoDeInstalacao extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstalarApp({ className }: { className?: string }) {
  const [evento, setEvento] = useState<EventoDeInstalacao | null>(null);
  const [instalado, setInstalado] = useState(true);
  const [ehIOS, setEhIOS] = useState(false);
  const [explicando, setExplicando] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (navigator as { standalone?: boolean }).standalone === true;
    setInstalado(standalone);
    setEhIOS(/iphone|ipad|ipod/i.test(navigator.userAgent ?? ""));

    function aoPoderInstalar(e: Event) {
      // Sem o preventDefault o Chrome mostra a própria barra e o evento se
      // perde — e aí o botão daqui nunca teria o que disparar.
      e.preventDefault();
      setEvento(e as EventoDeInstalacao);
    }
    function aoInstalar() {
      setInstalado(true);
      setEvento(null);
    }

    window.addEventListener("beforeinstallprompt", aoPoderInstalar);
    window.addEventListener("appinstalled", aoInstalar);
    return () => {
      window.removeEventListener("beforeinstallprompt", aoPoderInstalar);
      window.removeEventListener("appinstalled", aoInstalar);
    };
  }, []);

  if (instalado) return null;
  // Nem o evento do Chrome nem iPhone: navegador que não instala (Firefox no
  // desktop, Safari no Mac). Botão que não faz nada é pior que botão nenhum.
  if (!evento && !ehIOS) return null;

  async function instalar() {
    if (ehIOS || !evento) {
      setExplicando(true);
      return;
    }
    await evento.prompt();
    const escolha = await evento.userChoice;
    // O evento é de uso único: se a pessoa recusou, o navegador só oferece de
    // novo numa visita futura.
    setEvento(null);
    if (escolha.outcome === "accepted") setInstalado(true);
  }

  return (
    <>
      <Button variant="outline" size="sm" className={className} onClick={() => void instalar()}>
        <Download className="mr-2 h-4 w-4" />
        Instalar app
      </Button>

      <Dialog open={explicando} onOpenChange={setExplicando}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Instalar no iPhone</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3 pt-2 text-sm">
                <p className="flex items-center gap-2">
                  <Share className="h-4 w-4 shrink-0" />
                  Toque em <strong>Compartilhar</strong>, na barra do Safari.
                </p>
                <p>
                  Role e escolha <strong>Adicionar à Tela de Início</strong>.
                </p>
                <p className="text-muted-foreground">
                  Vale a pena: no iPhone a notificação dos funis só funciona pelo app instalado.
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </>
  );
}
