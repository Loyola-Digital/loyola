"use client";

import { use } from "react";
import { SwitchyTab } from "@/components/switchy";

interface Props {
  params: Promise<{ id: string }>;
}

export default function ProjectSwitchPage({ params }: Props) {
  const { id: projectId } = use(params);
  return <SwitchyTab projectId={projectId} />;
}
