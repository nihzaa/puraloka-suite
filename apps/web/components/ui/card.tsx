import { cn } from "@/lib/utils";

function Card({
  className,
  variant = "default",
  hoverable = false,
  ...props
}: React.ComponentProps<"div"> & { variant?: "default" | "dense"; hoverable?: boolean }) {
  return (
    <div
      data-slot="card"
      data-variant={variant}
      className={cn(
        "rounded-lg border border-[var(--border)] bg-[var(--surface)]",
        variant === "default"
          ? "p-5 shadow-[var(--shadow-1),var(--shadow-inset)]"
          : "p-4 shadow-[var(--shadow-1)]",
        hoverable && "clay-hover",
        className
      )}
      {...props}
    />
  );
}

export { Card };
