import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-sm border border-line-2 bg-surface px-3 py-2 text-[13px] text-ink transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-ink placeholder:text-ink-4 focus-visible:outline-none focus-visible:border-ink focus-visible:ring-[3px] focus-visible:ring-surface-3 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
