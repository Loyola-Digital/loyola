"use client";

import { useEffect, useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  rectSortingStrategy,
  useSortable,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { StageCard } from "./stage-card";
import { useReorderStages } from "@/lib/hooks/use-funnel-stages";
import { toast } from "sonner";
import type { FunnelStage } from "@loyola-x/shared";

interface SortableStageGridProps {
  stages: FunnelStage[];
  projectId: string;
  funnelId: string;
}

export function SortableStageGrid({ stages, projectId, funnelId }: SortableStageGridProps) {
  const reorder = useReorderStages(projectId, funnelId);

  // Mantém ordem local pra UI instantânea — sincroniza quando server retorna
  const [orderedStages, setOrderedStages] = useState(stages);
  useEffect(() => {
    setOrderedStages(stages);
  }, [stages]);

  const sensors = useSensors(
    // pointerSensor com `distance: 8` evita conflito com click (precisa
    // arrastar 8px pra começar drag)
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = orderedStages.findIndex((s) => s.id === active.id);
    const newIndex = orderedStages.findIndex((s) => s.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const newOrder = arrayMove(orderedStages, oldIndex, newIndex);
    setOrderedStages(newOrder); // otimista
    reorder.mutate(
      newOrder.map((s) => s.id),
      {
        onError: () => {
          setOrderedStages(stages); // reverte
          toast.error("Erro ao reordenar — voltei pra ordem anterior");
        },
      },
    );
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={orderedStages.map((s) => s.id)} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {orderedStages.map((stage) => (
            <SortableStageCard
              key={stage.id}
              stage={stage}
              projectId={projectId}
              funnelId={funnelId}
              isLastStage={orderedStages.length === 1}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

interface SortableStageCardProps {
  stage: FunnelStage;
  projectId: string;
  funnelId: string;
  isLastStage: boolean;
}

function SortableStageCard({ stage, projectId, funnelId, isLastStage }: SortableStageCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: stage.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : "auto",
  };

  return (
    <div ref={setNodeRef} style={style} className="relative">
      {/* Drag handle no canto superior esquerdo do card */}
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="absolute top-2 left-2 z-10 p-1 rounded hover:bg-muted/50 cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
        aria-label="Arrastar pra reordenar"
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="group">
        <StageCard stage={stage} projectId={projectId} funnelId={funnelId} isLastStage={isLastStage} />
      </div>
    </div>
  );
}
