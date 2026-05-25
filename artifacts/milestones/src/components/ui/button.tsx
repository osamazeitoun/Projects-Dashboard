import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-surface-3 focus-visible:border-ink disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-ink text-[color:var(--c-accent-fg)] hover:bg-ink-2",
        destructive:
          "bg-surface text-destructive border border-line-2 hover:bg-surface-2",
        outline:
          "bg-surface text-ink border border-line-2 hover:bg-surface-2",
        secondary:
          "bg-surface text-ink border border-line-2 hover:bg-surface-2",
        ghost:
          "bg-transparent text-ink-2 hover:bg-surface-2",
        link:
          "text-ink underline-offset-4 hover:underline",
        gold:
          "bg-[color:var(--c-gold)] text-ink border border-[color:var(--c-gold)] hover:bg-[color:var(--c-gold-soft)]",
      },
      size: {
        default: "h-9 px-[14px] text-[13px] [&_svg]:size-4",
        sm: "h-7 px-[10px] text-xs [&_svg]:size-[14px]",
        lg: "h-11 px-5 text-[15px] [&_svg]:size-[16px]",
        icon: "h-9 w-9 [&_svg]:size-4",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
