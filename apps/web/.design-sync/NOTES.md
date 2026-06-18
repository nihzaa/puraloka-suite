# design-sync repo notes

## Excluded components
- **InvoicePDF** — react-pdf renderer; depends on @react-pdf/renderer which can't run in browser preview context
- **TerminPaymentModal** — uses createPortal at module level; excluded to avoid hydration errors in preview

## Next.js stubs (bundle.mjs libOverride)
The app uses Next.js app-router APIs at import time. A forked `bundle.mjs` stubs:
- `next/navigation` → mock hooks (useRouter, usePathname, useSearchParams, useParams, redirect, notFound, etc.)
- `next/link` → renders `<a href={p.href}>`
- `next/image` → renders `<img src={p.src}>`
- `next-themes` → ThemeProvider renders children; useTheme returns `{theme:'light'}`

## Supabase env vars
`@/lib/supabase.ts` calls `createClient(NEXT_PUBLIC_SUPABASE_URL, ...)` at module load. The env vars are baked into the bundle via esbuild `define` in bundle.mjs. Values sourced from `.env.local`.

## process polyfill
Some bundled deps use `process.env.NODE_ENV` and `process.browser` at module init. Added a `banner` polyfill in bundle.mjs since esbuild's `define` only replaces specific keys, not `process` as a whole.

## esbuild location
esbuild is installed in `.design-sync/node_modules/` (local npm install), not in the pnpm workspace. Reason: pnpm doesn't hoist esbuild to `apps/web/node_modules/`, so the forked bundle.mjs couldn't resolve it from there.

## Minification
`minify: true` set in bundle.mjs. Required to bring `_ds_bundle.js` under the 5 MB upload limit (unminified = 5.9 MB, minified = 2.5 MB).

## Thin/error renders (non-blocking, by design)
- **NotificationPanel**, **ThemeToggle** — icon-only buttons; minimal UI is correct
- **ToastProvider** — context provider with no visible output
- **AbsorptionLogModal**, **RabScheduleModal** — 404s from background API calls during render; UI itself renders correctly
