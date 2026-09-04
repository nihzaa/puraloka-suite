import { cn } from "@/lib/utils";
import { Pilihan, type PropsPilihan } from "@/components/pilihan";

const fieldBaseClass =
  "w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-[var(--text-muted)] focus:border-primary focus:shadow-[0_0_0_3px_var(--primary-soft)]";

function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      data-slot="input"
      className={cn(fieldBaseClass, className)}
      {...props}
    />
  );
}

function Select({ className, children, ...props }: PropsPilihan) {
  return (
    <Pilihan
      data-slot="select"
      className={cn(fieldBaseClass, "cursor-pointer", className)}
      {...props}
    >
      {children}
    </Pilihan>
  );
}

export { Input, Select };
