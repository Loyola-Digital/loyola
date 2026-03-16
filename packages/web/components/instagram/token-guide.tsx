"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

const steps = [
  {
    num: 1,
    title: "Acesse o Meta for Developers",
    description:
      "Acesse developers.facebook.com e selecione o App vinculado à sua conta Business.",
  },
  {
    num: 2,
    title: "Abra o Instagram Graph API",
    description:
      'No painel de ferramentas do App, acesse "Instagram Graph API" no menu lateral.',
  },
  {
    num: 3,
    title: "Gere um User Token com as permissões necessárias",
    description:
      'Clique em "Gerar Token" e selecione as permissões: instagram_basic, instagram_manage_insights, pages_show_list, pages_read_engagement.',
  },
  {
    num: 4,
    title: "Copie o token gerado",
    description:
      "O token gerado expira em aproximadamente 60 dias. Copie-o e cole no campo acima.",
  },
  {
    num: 5,
    title: "Long-Lived Token (opcional, recomendado)",
    description:
      "Para maior durabilidade, troque o token de curta duração por um Long-Lived Token usando o endpoint de exchange no Graph API Explorer. Tokens long-lived expiram em ~60 dias mas podem ser renovados.",
  },
];

export function TokenGuide() {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" className="w-full justify-start gap-2 px-0 text-muted-foreground hover:text-foreground">
          <HelpCircle className="h-4 w-4" />
          Como obter seu Access Token no Business Manager
          {open ? (
            <ChevronDown className="ml-auto h-4 w-4" />
          ) : (
            <ChevronRight className="ml-auto h-4 w-4" />
          )}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-3">
        <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
          {steps.map((step) => (
            <div key={step.num} className="flex gap-3">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                {step.num}
              </div>
              <div>
                <p className="text-sm font-medium">{step.title}</p>
                <p className="text-xs text-muted-foreground">{step.description}</p>
              </div>
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
