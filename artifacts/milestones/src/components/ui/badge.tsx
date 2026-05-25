import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "whitespace-nowrap inline-flex items-center rounded-xs px-2 py-0.5 text-[11px] font-medium transition-colors focus:outline-none",
  {
    variants: {
      variant: {
        default:
          "bg-surface-2 text-ink-2",
        secondary:
          "bg-surface-2 text-ink-2",
        outline:
          "bg-transparent text-ink-2 border border-line",
        neutral:
          "bg-surface-2 text-ink-2",
        gold:
          "text-ink",
        success:
          "text-[color:var(--c-success)]",
        warn:
          "text-[color:var(--c-warn)]",
        danger:
          "text-[color:var(--c-danger)]",
        info:
          "text-[color:var(--c-info)]",
        destructive:
          "text-[color:var(--c-danger)]",
        "neutral-solid":
          "bg-ink text-[color:var(--c-accent-fg)]",
        "gold-solid":
          "bg-[color:var(--c-gold)] text-ink",
        "success-solid":
          "bg-[color:var(--c-success)] text-[color:var(--c-accent-fg)]",
        "warn-solid":
          "bg-[color:var(--c-warn)] text-[color:var(--c-accent-fg)]",
        "danger-solid":
          "bg-[color:var(--c-danger)] text-[color:var(--c-accent-fg)]",
        "info-solid":
          "bg-[color:var(--c-info)] text-[color:var(--c-accent-fg)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

const tonedSoftBg: Record<string, string> = {
  gold: "color-mix(in oklab, var(--c-gold) 18%, var(--c-surface))",
  success: "color-mix(in oklab, var(--c-success) 12%, var(--c-surface))",
  warn: "color-mix(in oklab, var(--c-warn) 12%, var(--c-surface))",
  danger: "color-mix(in oklab, var(--c-danger) 12%, var(--c-surface))",
  info: "color-mix(in oklab, var(--c-info) 12%, var(--c-surface))",
  destructive: "color-mix(in oklab, var(--c-danger) 12%, var(--c-surface))",
}

export type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  withDot?: boolean
}

function Badge({ className, variant, withDot, style, children, ...props }: BadgeProps) {
  const v = (variant ?? "default") as string
  const softBg = tonedSoftBg[v]
  const mergedStyle = softBg ? { background: softBg, ...style } : style
  return (
    <div className={cn(badgeVariants({ variant }), className)} style={mergedStyle} {...props}>
      {withDot && <span className="status-dot" />}
      {children}
    </div>
  )
}

export { Badge, badgeVariants }
