# Warm Clay Design System (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the "Warm Clay" design system foundation — new CSS design tokens (light+dark) mapped into Tailwind utility classes, a `cn()` class-merge helper, and a set of reusable `cva`-based base components (Button, Card, Badge, Input) under `components/ui/` — following the same shadcn/ui-style architecture already proven in the user's other project (`automation-tjs/admin-dashboard`), without breaking any existing page.

**Architecture:** New CSS custom properties are added to `apps/web/app/globals.css` alongside the existing token set (existing tokens like `--navy`, `--success`, `--surface-hover` stay defined and unchanged — 69+ files consume them directly via inline `style={{ background: "var(--navy)" }}` and must keep rendering correctly until their own migration phase). New tokens are additionally exposed to Tailwind via a `@theme inline` block, so they become usable as utility classes (`bg-primary`, `text-accent`, `rounded-lg`, etc.) — this is the same pattern used in `automation-tjs/admin-dashboard/app/globals.css`. New reusable React components live under `apps/web/components/ui/`, written with Tailwind classes + `cva` variants + the `cn()` merge helper (not inline `style={}`), as net-new files nothing existing imports yet — zero visual regression risk to any current page. A temporary dev-only preview page renders every new token and component together for visual verification (light + dark), then gets deleted before this phase is considered done.

**Tech Stack:** Next.js 16 (App Router), Tailwind CSS v4 (`@theme inline` + CSS custom properties, no `tailwind.config.js`), `next-themes` (class-based dark mode via `.dark` on `<html>`), TypeScript, `lucide-react` for icons. New dependencies this phase adds: `clsx`, `tailwind-merge`, `class-variance-authority` (all already used in the reference project `automation-tjs/admin-dashboard/package.json`). No test runner is configured in this repo — verification is `next build` (typecheck) plus manual visual check via `next dev` in the browser (both themes).

## Global Constraints

- Do not rename, remove, or change the value of any existing CSS custom property currently in `apps/web/app/globals.css` (`--navy`, `--navy-mid`, `--navy-light`, `--navy-glow`, `--success`, `--success-bg`, `--success-border`, `--warning*`, `--danger*`, `--info*`, `--bg`, `--surface*`, `--border*`, `--text-*`, `--shadow-*`) — 69+ files consume these directly via inline `style={{ background: "var(--navy)" }}`-style code and must keep rendering unchanged until their own migration phase.
- New raw tokens are added as new CSS custom property names (`--primary`, `--primary-soft`, `--accent`, `--accent-soft`, `--accent-2`, plus new `--radius-*` and `--shadow-2`/`--shadow-press`/`--shadow-inset` scale) per the spec `docs/superpowers/specs/2026-07-15-warm-clay-redesign-design.md` §3.
- New tokens are additionally mapped inside a `@theme inline { ... }` block as `--color-<name>: var(--<name>)` so Tailwind generates the matching utility classes, per spec §2A. This mirrors `automation-tjs/admin-dashboard/app/globals.css:7-46` exactly in structure (not copying its color values — only its mapping pattern).
- Dark mode selector is `.dark` (class on `<html>`, controlled by `next-themes`) — not a `data-variant` attribute. All new dark-mode token values go under `.dark { ... }`, mirroring the existing pattern in `globals.css`.
- New base components live in `apps/web/components/ui/` (new directory), one component per file, TypeScript, styled with Tailwind utility classes + `cva` variants (never inline `style={}`, never the old `--navy`/`--success` var names directly in component code — only through Tailwind classes backed by the new tokens).
- Every new `ui/` component root element carries a `data-slot="<component-name>"` attribute, per spec §2A and the `automation-tjs` reference pattern.
- Respect `prefers-reduced-motion`: any new hover/press transform must be neutralized under that media query, per spec §3.6.
- Font families are unchanged (`Bricolage Grotesque` display, `Plus Jakarta Sans` body) — do not touch `apps/web/app/layout.tsx` font config.
- No API, database, or route changes of any kind in this phase.

---

### Task 1: Install `clsx`, `tailwind-merge`, `class-variance-authority` and add the `cn()` helper

**Files:**
- Modify: `apps/web/package.json` (add dependencies)
- Create: `apps/web/lib/utils.ts`

**Interfaces:**
- Produces: `cn(...inputs: ClassValue[]): string` — exported function, importable as `import { cn } from "@/lib/utils"`. This is consumed by every component created in Tasks 4–7.

- [ ] **Step 1: Install the dependencies**

Run: `cd apps/web && npm install clsx tailwind-merge class-variance-authority`
Expected: `apps/web/package.json` gains three new entries under `dependencies`.

- [ ] **Step 2: Create the `cn()` helper**

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 3: Verify the app still builds**

Run: `cd apps/web && npm run build`
Expected: build completes with no errors (this file isn't imported anywhere yet, so this only checks it's syntactically/type-valid on its own).

- [ ] **Step 4: Commit**

```bash
git add apps/web/package.json apps/web/package-lock.json apps/web/lib/utils.ts
git commit -m "feat: add clsx/tailwind-merge/cva deps and cn() helper"
```

---

### Task 2: Add Warm Clay color, radius, and shadow tokens to `globals.css` (raw CSS vars)

**Files:**
- Modify: `apps/web/app/globals.css:1-80` (the `:root` and `.dark` token blocks)

**Interfaces:**
- Produces: raw CSS custom properties `--primary`, `--primary-soft`, `--accent`, `--accent-soft`, `--accent-2`, `--radius-sm`, `--radius-md`, `--radius-lg`, `--radius-xl`, `--radius-pill`, `--radius-dense`, `--shadow-2`, `--shadow-inset`, `--shadow-press`. These are consumed by Task 3 (Tailwind `@theme inline` mapping) — Task 3 needs these exact names to exist first.

- [ ] **Step 1: Add new light-mode raw tokens to `:root`**

Open `apps/web/app/globals.css`. Inside the existing `:root { ... }` block (currently lines 9–43), add these new properties immediately after the existing `--danger-border` / `--info-border` lines (do not remove or reorder anything already there):

```css
  /* ─── Warm Clay tokens — Light ───────────────────────────────── */
  --primary:          #003B5C;
  --primary-soft:      #E4EEF2;
  --accent:            #E08A3C;
  --accent-soft:       #FBE8D3;
  --accent-2:          #C75D3D;

  --radius-sm:         10px;
  --radius-md:         14px;
  --radius-lg:         20px;
  --radius-xl:         24px;
  --radius-pill:       999px;
  --radius-dense:      8px;

  --shadow-2:          0 8px 20px -6px rgba(43,38,33,0.14), 0 2px 6px rgba(43,38,33,0.06);
  --shadow-inset:      inset 0 1px 0 rgba(255,255,255,0.6);
  --shadow-press:      0 1px 1px rgba(43,38,33,0.08);
```

- [ ] **Step 2: Add new dark-mode raw tokens to `.dark`**

Inside the existing `.dark { ... }` block (currently lines 46–80), add immediately after the existing `--info-border` line:

```css
  /* ─── Warm Clay tokens — Dark ─────────────────────────────────── */
  --primary:           #4D9FFF;
  --primary-soft:      rgba(77,159,255,0.12);
  --accent:            #E8A868;
  --accent-soft:       rgba(232,168,104,0.14);
  --accent-2:          #D97F5E;

  --shadow-2:          0 8px 20px -6px rgba(0,0,0,0.45), 0 2px 6px rgba(0,0,0,0.25);
  --shadow-inset:      inset 0 1px 0 rgba(255,255,255,0.04);
  --shadow-press:      0 1px 1px rgba(0,0,0,0.35);
```

Note: `--radius-*` values are identical in both themes, so they are only declared once in `:root` and inherited by `.dark` automatically — do not redeclare them inside `.dark`.

- [ ] **Step 3: Verify the app still builds**

Run: `cd apps/web && npm run build`
Expected: build completes with no CSS or TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/globals.css
git commit -m "feat: add Warm Clay raw color, radius, and shadow tokens"
```

---

### Task 3: Map new tokens into Tailwind via `@theme inline`

**Files:**
- Modify: `apps/web/app/globals.css:1-7` (top of file, alongside the existing `@theme { ... }` block)

**Interfaces:**
- Consumes: raw tokens from Task 2 (`--primary`, `--accent`, `--radius-lg`, etc.)
- Produces: Tailwind utility classes `bg-primary`, `text-primary`, `border-primary`, `bg-primary-soft`, `bg-accent`, `text-accent`, `bg-accent-soft`, `bg-accent-2`, `text-accent-2`, `rounded-sm`/`rounded-md`/`rounded-lg`/`rounded-xl` (mapped to the new radius scale), `rounded-full` (pill — Tailwind's built-in, no mapping needed). These are consumed by every component in Tasks 4–7.

- [ ] **Step 1: Extend the existing `@theme` block**

The file currently starts with:

```css
@import "tailwindcss";

@theme {
  --font-display: var(--font-display);
  --font-body: var(--font-body);
}
```

Replace that `@theme { ... }` block with:

```css
@import "tailwindcss";

@theme inline {
  --font-display:      var(--font-display);
  --font-body:         var(--font-body);

  --color-primary:      var(--primary);
  --color-primary-soft: var(--primary-soft);
  --color-accent:       var(--accent);
  --color-accent-soft:  var(--accent-soft);
  --color-accent-2:     var(--accent-2);

  --radius-sm:          var(--radius-sm);
  --radius-md:          var(--radius-md);
  --radius-lg:          var(--radius-lg);
  --radius-xl:          var(--radius-xl);
}
```

(`@theme inline` — not plain `@theme` — is required because the right-hand side values (`var(--primary)`, etc.) are themselves CSS custom properties that change between `:root` and `.dark`; `inline` tells Tailwind v4 to re-resolve them at usage time instead of baking in the `:root` value at build time. This is the same reason `automation-tjs/admin-dashboard/app/globals.css:7` uses `inline`.)

- [ ] **Step 2: Verify the app still builds**

Run: `cd apps/web && npm run build`
Expected: build completes with no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/globals.css
git commit -m "feat: expose Warm Clay tokens as Tailwind utility classes"
```

---

### Task 4: Add reduced-motion-safe hover/press utility classes

**Files:**
- Modify: `apps/web/app/globals.css` (append near the existing `/* ─── Animations ─── */` section)

**Interfaces:**
- Produces: utility classes `.clay-hover` and `.clay-press`, usable via `className` on any element; both fully respect `prefers-reduced-motion`. Consumed by Task 5 (`Button`) and Task 6 (`Card`).

- [ ] **Step 1: Add the utility classes**

Add this block right after the existing `.no-transition` rule and before the `body { ... }` rule:

```css
/* ─── Warm Clay motion utilities ─────────────────────────────────── */
.clay-hover {
  transition: transform 180ms ease, box-shadow 180ms ease;
}
.clay-hover:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-2);
}
.clay-press:active {
  transform: translateY(0) scale(0.98);
  box-shadow: var(--shadow-press);
  transition: transform 100ms ease, box-shadow 100ms ease;
}

@media (prefers-reduced-motion: reduce) {
  .clay-hover, .clay-hover:hover, .clay-press:active {
    transform: none !important;
  }
}
```

- [ ] **Step 2: Verify the app still builds**

Run: `cd apps/web && npm run build`
Expected: build completes with no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/globals.css
git commit -m "feat: add clay-hover/clay-press motion utility classes"
```

---

### Task 5: Build the `Button` base component (cva + cn + data-slot)

**Files:**
- Create: `apps/web/components/ui/button.tsx`

**Interfaces:**
- Consumes: `cn()` from Task 1, Tailwind classes from Task 3 (`bg-primary`, `bg-accent`, etc.), `.clay-hover`/`.clay-press` from Task 4.
- Produces: `Button` component and `buttonVariants` cva config, both exported. `Button` props: `React.ComponentProps<"button"> & VariantProps<typeof buttonVariants>`. Variant keys: `variant: "primary" | "secondary" | "accent" | "danger" | "ghost"` (default `"primary"`), `size: "md" | "sm"` (default `"md"`).

- [ ] **Step 1: Create the component**

```tsx
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
```

- [ ] **Step 2: Verify the app still builds**

Run: `cd apps/web && npm run build`
Expected: build completes with no TypeScript errors (component is not imported anywhere yet, so this only checks it's syntactically/type-valid on its own).

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/ui/button.tsx
git commit -m "feat: add Warm Clay Button base component (cva)"
```

---

### Task 6: Build the `Card` base component (default + dense variant)

**Files:**
- Create: `apps/web/components/ui/card.tsx`

**Interfaces:**
- Consumes: `cn()` from Task 1, Tailwind classes from Task 3, `.clay-hover` from Task 4.
- Produces: `Card` component. Props: `React.ComponentProps<"div"> & { variant?: "default" | "dense"; hoverable?: boolean }`. `variant="default"` (the default) is the claymorphism card per spec §4.2; `variant="dense"` is the tone-down outer container used to wrap tables/charts per spec §4.7 (row/cell-level styling inside dense areas is handled per-table in later phases, not by this component — this component only provides the outer container treatment).

- [ ] **Step 1: Create the component**

```tsx
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
```

- [ ] **Step 2: Verify the app still builds**

Run: `cd apps/web && npm run build`
Expected: build completes with no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/ui/card.tsx
git commit -m "feat: add Warm Clay Card base component (default + dense variant)"
```

---

### Task 7: Build the `Badge` base component

**Files:**
- Create: `apps/web/components/ui/badge.tsx`

**Interfaces:**
- Consumes: `cn()` from Task 1.
- Produces: `Badge` component and `badgeVariants` cva config, both exported. Props: `React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>`. Variant key: `tone: "ok" | "warn" | "danger" | "info" | "neutral"` (default `"neutral"`).

- [ ] **Step 1: Create the component**

```tsx
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
```

- [ ] **Step 2: Verify the app still builds**

Run: `cd apps/web && npm run build`
Expected: build completes with no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/ui/badge.tsx
git commit -m "feat: add Warm Clay Badge base component (cva)"
```

---

### Task 8: Build the `Input` and `Select` base components

**Files:**
- Create: `apps/web/components/ui/input.tsx`

**Interfaces:**
- Consumes: `cn()` from Task 1.
- Produces: `Input` component (wraps `<input>`, `React.ComponentProps<"input">`) and `Select` component (wraps `<select>`, `React.ComponentProps<"select">`), both in the same file, both exported.

- [ ] **Step 1: Create the component**

```tsx
import { cn } from "@/lib/utils";

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

function Select({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="select"
      className={cn(fieldBaseClass, "cursor-pointer", className)}
      {...props}
    >
      {children}
    </select>
  );
}

export { Input, Select };
```

- [ ] **Step 2: Verify the app still builds**

Run: `cd apps/web && npm run build`
Expected: build completes with no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/ui/input.tsx
git commit -m "feat: add Warm Clay Input/Select base components"
```

---

### Task 9: Create a temporary visual verification page and confirm both themes

**Files:**
- Create (temporary, deleted at end of this task): `apps/web/app/(dashboard)/_ds-preview/page.tsx`

**Interfaces:**
- Consumes: `Button` (Task 5), `Card` (Task 6), `Badge` (Task 7), `Input`/`Select` (Task 8).
- Produces: nothing lasting — this route is deleted in Step 4 below. Its only purpose is to render every new token/component together so they can be checked in a real browser, in both themes, before this phase is considered done.

- [ ] **Step 1: Create the preview page**

```tsx
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input, Select } from "@/components/ui/input";

export default function DsPreviewPage() {
  return (
    <div className="flex max-w-3xl flex-col gap-6 p-8">
      <h1 className="font-display text-2xl font-extrabold">Warm Clay — Design System Preview</h1>

      <div className="flex flex-wrap gap-3">
        <Button variant="primary">Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="accent">Accent</Button>
        <Button variant="danger">Danger</Button>
        <Button variant="ghost">Ghost</Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <Badge tone="ok">Disetujui</Badge>
        <Badge tone="warn">Pending</Badge>
        <Badge tone="danger">Ditolak</Badge>
        <Badge tone="info">Info</Badge>
        <Badge tone="neutral">Netral</Badge>
      </div>

      <Card hoverable className="flex flex-col gap-2">
        <div className="text-[13px] font-semibold text-[var(--text-secondary)]">KPI CARD (hover me)</div>
        <div className="font-display text-[28px] font-extrabold">Rp 8.4M</div>
      </Card>

      <Card variant="dense">
        <div className="mb-2 text-[13px] font-semibold text-[var(--text-secondary)]">DENSE CONTAINER (table-style)</div>
        <div className="text-sm">Row content goes here — tighter, less shadow.</div>
      </Card>

      <div className="flex max-w-xs flex-col gap-2.5">
        <Input placeholder="Nama proyek..." />
        <Select defaultValue="">
          <option value="" disabled>Pilih status</option>
          <option value="active">Aktif</option>
          <option value="done">Selesai</option>
        </Select>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run the dev server and visually verify in the browser**

Run: `cd apps/web && npm run dev`
Open `http://localhost:3000/_ds-preview` in a browser.

Check, in **light mode**:
- Buttons show 5 distinct variants; primary/accent have a soft shadow and lift slightly on hover, press down slightly on click.
- Badges show 5 distinct tone colors, pill-shaped.
- The KPI card has a large rounded corner, soft layered shadow, and lifts on hover.
- The dense card looks visibly flatter/tighter than the KPI card.
- Input/select show the navy focus ring when clicked.

Then toggle dark mode (use the existing `ThemeToggle` control in the topbar, or manually add `class="dark"` to `<html>` via devtools if the preview route doesn't render inside the dashboard shell) and re-check the same list — colors should feel intentionally dark, not just inverted, and the accent/terracotta tones should look softened rather than neon.

If anything looks wrong, fix the relevant component/token from Tasks 2–8 now, before proceeding.

- [ ] **Step 3: Confirm production build still succeeds**

Run: `cd apps/web && npm run build`
Expected: build completes with no errors.

- [ ] **Step 4: Delete the temporary preview route**

```bash
rm -rf "apps/web/app/(dashboard)/_ds-preview"
```

- [ ] **Step 5: Commit the deletion**

```bash
git add -A "apps/web/app/(dashboard)/_ds-preview"
git commit -m "chore: remove temporary design system preview route"
```

If `git status` shows nothing to commit after the `rm` (nothing was tracked yet), skip this commit.

---

## Self-Review Notes

- **Spec coverage:** §2A (cva/cn/Tailwind-class architecture, data-slot) → Tasks 1, 3, 5–8. §3.1/3.2 (color tokens) → Task 2. §3.3 (shadow) → Task 2. §3.4 (radius) → Task 2. §3.6 (motion incl. reduced-motion) → Task 4. §4.1 (Button) → Task 5. §4.2 (Card, incl. dense variant per §4.7) → Task 6. §4.3 (Badge) → Task 7. §4.4 (Input) → Task 8. Visual verification of light+dark → Task 9. Modal/Toast/Sidebar/Topbar/Table-row components (§4.5, §4.6, §4.7 row-level, §4.8) are explicitly deferred to the phases that touch those specific files (per the spec's own phase breakdown in §6) — building them now with no consumer would be premature, since their exact shape depends on the existing modal/toast/sidebar code they replace, which later phases read first. `@base-ui/react` (headless primitives for Dialog/Select) is explicitly deferred per spec §2A — not needed until a phase builds a real Modal/Dialog.
- **Placeholder scan:** no TBD/TODO; every step has complete code.
- **Type consistency:** `Button`'s `variant`/`size` variant keys defined once in Task 5 via `cva`, exported as `buttonVariants` — no other task redefines them. `Card`'s `variant`/`hoverable` props defined once in Task 6. `Badge`'s `tone` variant defined once in Task 7, exported as `badgeVariants`. `cn()` signature (`(...inputs: ClassValue[]) => string`) defined once in Task 1 and imported identically (`import { cn } from "@/lib/utils"`) in Tasks 5–8 — no drift. Task 9 imports `Button`, `Card`, `Badge`, `Input`, `Select` using exactly the export names and prop names defined in their respective tasks.
- **Note on inline `rounded-[var(...)]`-style arbitrary values in Tasks 5–8:** some styles reference CSS vars directly inside Tailwind arbitrary-value brackets (e.g. `shadow-[var(--shadow-1),var(--shadow-inset)]`, `bg-[var(--surface-2)]`) rather than a mapped utility class. This is intentional and matches the `automation-tjs` reference pattern (`color-mix(in_oklch,var(--secondary),...)` inside arbitrary values) for tokens not yet promoted to `@theme inline` in Task 3 (`--surface-2`, `--success-bg`, `--border`, etc. — the existing token set, not redefined by this phase). Only the *new* Warm Clay tokens (`primary`, `accent`, `accent-2`, radius scale) get full utility-class treatment via `@theme inline`; the rest are referenced via arbitrary values to avoid touching/renaming the existing 69-file-consumed token names, per the Global Constraints.
