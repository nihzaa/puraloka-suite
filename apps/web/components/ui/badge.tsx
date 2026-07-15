import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-[11px] py-[5px] text-xs font-bold font-body whitespace-nowrap",
  {
    variants: {
      tone: {
        ok: "bg-[var(--success-bg)] text-[var(--success)]",
        warn: "bg-[var(--warning-bg)] text-[var(--warning)]",
        danger: "bg-[var(--danger-bg)] text-[var(--danger)]",
        info: "bg-[var(--info-bg)] text-[var(--info)]",
        neutral: "bg-[var(--surface-2)] text-[var(--text-secondary)]",
      },
    },
    defaultVariants: {
      tone: "neutral",
    },
  }
);

function Badge({
  className,
  tone,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ tone }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
