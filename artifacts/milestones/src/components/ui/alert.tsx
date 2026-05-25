import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const alertVariants = cva(
  "relative w-full rounded-md border px-4 py-3 text-[13px] [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:size-4 [&>svg~*]:pl-7",
  {
    variants: {
      variant: {
        default: "bg-surface border-line text-ink-2 [&>svg]:text-ink-3",
        info: "[&>svg]:text-[color:var(--c-info)] text-ink-2",
        success: "[&>svg]:text-[color:var(--c-success)] text-ink-2",
        warn: "[&>svg]:text-[color:var(--c-warn)] text-ink-2",
        danger: "[&>svg]:text-[color:var(--c-danger)] text-ink-2",
        destructive: "[&>svg]:text-[color:var(--c-danger)] text-ink-2",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

const tonedAlertStyles: Record<string, { background: string; borderColor: string }> = {
  info: {
    background: "color-mix(in oklab, var(--c-info) 10%, var(--c-surface))",
    borderColor: "color-mix(in oklab, var(--c-info) 30%, var(--c-surface))",
  },
  success: {
    background: "color-mix(in oklab, var(--c-success) 10%, var(--c-surface))",
    borderColor: "color-mix(in oklab, var(--c-success) 30%, var(--c-surface))",
  },
  warn: {
    background: "color-mix(in oklab, var(--c-warn) 10%, var(--c-surface))",
    borderColor: "color-mix(in oklab, var(--c-warn) 30%, var(--c-surface))",
  },
  danger: {
    background: "color-mix(in oklab, var(--c-danger) 10%, var(--c-surface))",
    borderColor: "color-mix(in oklab, var(--c-danger) 30%, var(--c-surface))",
  },
  destructive: {
    background: "color-mix(in oklab, var(--c-danger) 10%, var(--c-surface))",
    borderColor: "color-mix(in oklab, var(--c-danger) 30%, var(--c-surface))",
  },
}

const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant, style, ...props }, ref) => {
  const toned = variant ? tonedAlertStyles[variant] : undefined
  const merged = toned ? { ...toned, ...style } : style
  return (
    <div
      ref={ref}
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      style={merged}
      {...props}
    />
  )
})
Alert.displayName = "Alert"

const AlertTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn("mb-1 text-[13px] font-semibold leading-none tracking-tight text-ink", className)}
    {...props}
  />
))
AlertTitle.displayName = "AlertTitle"

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-xs text-ink-3 [&_p]:leading-relaxed", className)}
    {...props}
  />
))
AlertDescription.displayName = "AlertDescription"

export { Alert, AlertTitle, AlertDescription }
