"use client";

import { useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

const sizeClasses = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-16 w-16 text-xl",
} as const;

const sizePixels = {
  sm: 32,
  md: 40,
  lg: 64,
} as const;

const colors = [
  "bg-rose-500/80",
  "bg-orange-500/80",
  "bg-amber-500/80",
  "bg-lime-500/80",
  "bg-emerald-500/80",
  "bg-teal-500/80",
  "bg-cyan-500/80",
  "bg-sky-500/80",
  "bg-blue-500/80",
  "bg-indigo-500/80",
  "bg-violet-500/80",
  "bg-purple-500/80",
  "bg-fuchsia-500/80",
  "bg-pink-500/80",
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
  avatarUrl?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function MindAvatar({ name, avatarUrl, size = "md", className }: MindAvatarProps) {
  const [imgError, setImgError] = useState(false);
  const colorClass = colors[hashName(name) % colors.length];
  const initials = getInitials(name);
  const px = sizePixels[size];

  if (avatarUrl && !imgError) {
    return (
      <div
        className={cn(
          "relative overflow-hidden rounded-full bg-muted",
          sizeClasses[size],
          className,
        )}
      >
        <Image
          src={avatarUrl}
          alt={name}
          width={px}
          height={px}
          className="h-full w-full object-cover"
          onError={() => setImgError(true)}
          unoptimized
        />
      </div>
    );
  }

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
