"use client";

import { cn } from "@/lib/utils";

const sizeClasses = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-16 w-16 text-xl",
} as const;

const colors = [
  "bg-red-500",
  "bg-orange-500",
  "bg-amber-500",
  "bg-yellow-500",
  "bg-lime-500",
  "bg-green-500",
  "bg-emerald-500",
  "bg-teal-500",
  "bg-cyan-500",
  "bg-sky-500",
  "bg-blue-500",
  "bg-indigo-500",
  "bg-violet-500",
  "bg-purple-500",
  "bg-fuchsia-500",
  "bg-pink-500",
];

function hashName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

interface MindAvatarProps {
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function MindAvatar({ name, size = "md", className }: MindAvatarProps) {
  const colorClass = colors[hashName(name) % colors.length];
  const initials = getInitials(name);

  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-full font-semibold text-white",
        sizeClasses[size],
        colorClass,
        className,
      )}
    >
      {initials}
    </div>
  );
}
