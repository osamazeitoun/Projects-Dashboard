import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-[color,background-color,border-color,box-shadow,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:ring-[color:var(--c-gold)] active:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-ink text-[color:var(--c-accent-fg)] shadow-sm hover:bg-ink-2",
        destructive:
          "bg-[color:var(--c-danger)] text-[color:var(--c-accent-fg)] shadow-sm hover:brightness-110",
        outline:
          "bg-surface text-ink border border-line-2 shadow-sm hover:bg-surface-2 hover:border-ink-5",
        secondary:
          "bg-surface-2 text-ink border border-line hover:bg-surface-3",
        ghost: "bg-transparent text-ink-2 hover:bg-surface-2 hover:text-ink",
        link: "text-[color:var(--c-gold)] underline-offset-4 hover:underline",
        gold: "bg-[color:var(--c-gold)] text-[color:var(--c-accent-fg)] shadow-sm hover:brightness-110",
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
  },
);

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
