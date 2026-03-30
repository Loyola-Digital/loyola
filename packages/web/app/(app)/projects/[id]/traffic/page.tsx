"use client";

import { use } from "react";
import { redirect } from "next/navigation";

interface Props {
  params: Promise<{ id: string }>;
}

export default function ProjectTrafficPage({ params }: Props) {
  const { id } = use(params);
  redirect(`/traffic?project=${id}`);
}
