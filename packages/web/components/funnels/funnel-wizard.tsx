"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Rocket, Repeat, ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { CampaignSelector } from "@/components/funnels/campaign-selector";
import { useCreateFunnel, useCampaignPicker } from "@/lib/hooks/use-funnels";
import { toast } from "sonner";
import type { FunnelType } from "@loyola-x/shared";

interface FunnelWizardProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingCampaignIds?: string[];
}

const STEPS = ["Nome & Tipo", "Campanha", "Confirmação"] as const;

const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 200 : -200,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction < 0 ? 200 : -200,
    opacity: 0,
  }),
};

export function FunnelWizard({
  projectId,
  open,
  onOpenChange,
  existingCampaignIds = [],
}: FunnelWizardProps) {
  const router = useRouter();
  const createFunnel = useCreateFunnel(projectId);
  const { data: campaignData } = useCampaignPicker(open ? projectId : null);

  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(0);
  const [name, setName] = useState("");
  const [type, setType] = useState<FunnelType | null>(null);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [campaignName, setCampaignName] = useState<string | null>(null);

  const canNext = step === 0 ? name.length >= 3 && type !== null : true;

  function goNext() {
    if (step < 2) {
      setDirection(1);
      setStep((s) => s + 1);
    }
  }

  function goBack() {
    if (step > 0) {
      setDirection(-1);
      setStep((s) => s - 1);
    }
  }

  function reset() {
    setStep(0);
    setDirection(0);
    setName("");
    setType(null);
    setCampaignId(null);
    setCampaignName(null);
  }

  async function handleCreate() {
    if (!type) return;

    if (campaignId && existingCampaignIds.includes(campaignId)) {
      toast.error("Essa campanha já está vinculada a outro funil deste projeto.");
      return;
    }

    try {
      const funnel = await createFunnel.mutateAsync({
        name,
        type,
        campaignId,
        campaignName,
      });
      toast.success("Funil criado com sucesso!");
      reset();
      onOpenChange(false);
      router.push(`/projects/${projectId}/funnels/${funnel.id}`);
    } catch {
      toast.error("Erro ao criar funil. Tente novamente.");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(val) => {
        if (!val) reset();
        onOpenChange(val);
      }}
    >
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Novo Funil</DialogTitle>
        </DialogHeader>

        {/* Progress dots */}
        <div className="flex justify-center gap-2 py-2">
          {STEPS.map((s, i) => (
            <div
              key={s}
              className={cn(
                "h-2 w-2 rounded-full transition-colors",
                i === step
                  ? "bg-primary"
                  : i < step
                    ? "bg-primary/50"
                    : "bg-muted",
              )}
            />
          ))}
        </div>

        {/* Step content */}
        <div className="relative min-h-[280px] overflow-hidden">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={step}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.2, ease: "easeInOut" }}
              className="space-y-4"
            >
              {step === 0 && (
                <>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Nome do Funil</label>
                    <Input
                      placeholder="Ex: Lançamento Black Friday"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      autoFocus
                    />
                    {name.length > 0 && name.length < 3 && (
                      <p className="text-xs text-destructive">Mínimo 3 caracteres</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Tipo do Funil</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setType("launch")}
                        className={cn(
                          "flex flex-col items-center gap-2 rounded-lg border-2 p-4 text-center transition-colors",
                          type === "launch"
                            ? "border-primary bg-primary/5"
                            : "border-muted hover:border-muted-foreground/30",
                        )}
                      >
                        <Rocket className="h-8 w-8 text-primary" />
                        <span className="text-sm font-medium">Lançamento</span>
                        <span className="text-xs text-muted-foreground">
                          Com data de início e fim. Dashboard com fases e timeline.
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setType("perpetual")}
                        className={cn(
                          "flex flex-col items-center gap-2 rounded-lg border-2 p-4 text-center transition-colors",
                          type === "perpetual"
                            ? "border-primary bg-primary/5"
                            : "border-muted hover:border-muted-foreground/30",
                        )}
                      >
                        <Repeat className="h-8 w-8 text-primary" />
                        <span className="text-sm font-medium">Perpétuo</span>
                        <span className="text-xs text-muted-foreground">
                          Evergreen. Dashboard com tendências e métricas contínuas.
                        </span>
                      </button>
                    </div>
                  </div>
                </>
              )}

              {step === 1 && (
                <div className="space-y-3">
                  <label className="text-sm font-medium">
                    Vincular Campanha Meta Ads
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Opcional — você pode vincular uma campanha depois.
                  </p>
                  <CampaignSelector
                    campaigns={campaignData?.campaigns ?? []}
                    accountLinked={campaignData?.accountLinked ?? false}
                    value={campaignId}
                    onSelect={(id, cName) => {
                      setCampaignId(id);
                      setCampaignName(cName);
                    }}
                  />
                  {campaignId && existingCampaignIds.includes(campaignId) && (
                    <p className="text-xs text-destructive">
                      Essa campanha já está vinculada a outro funil deste projeto.
                    </p>
                  )}
                </div>
              )}

              {step === 2 && (
                <div className="space-y-4">
                  <p className="text-sm font-medium">Confirmar Funil</p>
                  <div className="rounded-lg border p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      {type === "launch" ? (
                        <Rocket className="h-5 w-5 text-primary" />
                      ) : (
                        <Repeat className="h-5 w-5 text-primary" />
                      )}
                      <span className="font-medium">{name}</span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      <p>
                        Tipo:{" "}
                        {type === "launch" ? "Lançamento" : "Perpétuo"}
                      </p>
                      <p>
                        Campanha:{" "}
                        {campaignName ?? "Nenhuma (vincular depois)"}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Navigation */}
        <div className="flex justify-between pt-2">
          <Button
            variant="outline"
            onClick={goBack}
            disabled={step === 0}
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            Voltar
          </Button>

          {step < 2 ? (
            <Button onClick={goNext} disabled={!canNext}>
              Próximo
              <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          ) : (
            <Button
              onClick={handleCreate}
              disabled={createFunnel.isPending}
            >
              {createFunnel.isPending ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Check className="mr-1 h-4 w-4" />
              )}
              Criar Funil
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
