import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "clay-hover clay-press inline-flex items-center justify-center gap-2 rounded-md font-body font-bold whitespace-nowrap transition-colors outline-none disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "border border-transparent bg-primary text-white shadow-[var(--shadow-1),var(--shadow-inset)]",
        secondary: "border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-primary)]",
        accent: "border border-transparent bg-accent text-white shadow-[var(--shadow-1),var(--shadow-inset)]",
        danger: "border border-transparent bg-[var(--danger)] text-white",
        ghost: "border border-transparent bg-transparent text-[var(--text-secondary)]",
      },
      size: {
        md: "px-[22px] py-3 text-sm",
        sm: "px-3.5 py-2 text-[13px]",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

function Button({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants>) {
  return (
    <button
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { Button, buttonVariants };
