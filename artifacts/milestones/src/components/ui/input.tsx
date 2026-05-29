import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-md border border-line-2 bg-surface px-3 py-2 text-[13px] text-ink shadow-xs transition-[color,border-color,box-shadow] file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-ink placeholder:text-ink-4 focus-visible:outline-none focus-visible:border-[color:var(--c-gold)] focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--c-gold)_28%,transparent)] disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
