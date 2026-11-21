"use client";

import { cn, getInitials } from "@/utils/format";

interface UserAvatarProps {
  name: string;
  src?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
  ring?: "none" | "green" | "blue";
  className?: string;
}

const SIZE_MAP = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-12 w-12 text-base",
  xl: "h-24 w-24 text-2xl"
};

export function UserAvatar({
  name,
  src,
  size = "md",
  ring = "none",
  className
}: UserAvatarProps) {
  const ringClass =
    ring === "green"
      ? "ring-2 ring-rm-success ring-offset-2 ring-offset-rm-sidebar"
      : ring === "blue"
        ? "ring-2 ring-rm-primary ring-offset-2 ring-offset-rm-stage"
        : "";

  return (
    <div
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-rm-primary to-rm-card font-semibold text-white select-none",
        SIZE_MAP[size],
        ringClass,
        className
      )}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name} className="h-full w-full object-cover" />
      ) : (
        <span>{getInitials(name || "RM")}</span>
      )}
    </div>
  );
}
