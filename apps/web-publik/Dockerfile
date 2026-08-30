# ============================================================================
# Web publik (compro) — image produksi
# ============================================================================
# Dibangun DARI AKAR REPO, bukan dari apps/web-publik:
#
#     docker build -f apps/web-publik/Dockerfile \
#       --build-arg NEXT_PUBLIC_API_URL=https://api.puraloka-suite.duckdns.org \
#       --build-arg NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co \
#       -t puraloka-web-publik .
#
# Alasannya pnpm workspace: `pnpm-lock.yaml` dan `pnpm-workspace.yaml` hidup di
# akar. Membangun dari apps/web-publik "berhasil" tapi memasang versi yang
# berbeda dari yang diuji CI — kegagalan yang muncul di produksi.
# ============================================================================

FROM node:22-alpine AS deps
WORKDIR /repo
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web-publik/package.json apps/web-publik/
COPY packages/ packages/

RUN pnpm install --frozen-lockfile --filter web-publik...

FROM node:22-alpine AS build
WORKDIR /repo
RUN corepack enable

COPY --from=deps /repo/node_modules node_modules
COPY --from=deps /repo/apps/web-publik/node_modules apps/web-publik/node_modules
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/ packages/
COPY apps/web-publik/ apps/web-publik/

ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SUPABASE_URL
# ⚠ Ketiganya dibutuhkan SAAT BUILD, bukan cuma saat runtime.
#
# Halaman `/` di-PRERENDER oleh `next build`, dan prerender itu benar-benar
# mengambil datanya. Tanpa ketiganya build gagal dengan
#   "SITUS_COMPANY_ID belum diset. Situs publik tidak tahu konten milik siapa."
ARG SITUS_COMPANY_ID
ARG SUPABASE_SECRET_KEY
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
# Gagal SEKARANG, bukan nanti.
#
# `next.config.ts` memakai `new URL(NEXT_PUBLIC_SUPABASE_URL ?? 'https://localhost')`
# untuk mendaftarkan host gambar. Kalau kosong, ia jatuh ke `localhost` — dan
# SELURUH foto compro gagal dimuat di peramban pengunjung, tanpa satu pun galat
# di server. Halamannya terbuka, gambarnya saja yang hilang.
RUN test -n "$NEXT_PUBLIC_SUPABASE_URL" || \
    (echo "FATAL: --build-arg NEXT_PUBLIC_SUPABASE_URL wajib diisi — tanpa itu semua foto compro mati" && exit 1)
RUN test -n "$NEXT_PUBLIC_API_URL" || \
    (echo "FATAL: --build-arg NEXT_PUBLIC_API_URL wajib diisi" && exit 1)

RUN test -n "$SITUS_COMPANY_ID" || \
    (echo "FATAL: --build-arg SITUS_COMPANY_ID wajib — halaman / di-prerender saat build" && exit 1)

ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    SITUS_COMPANY_ID=$SITUS_COMPANY_ID \
    SUPABASE_SECRET_KEY=$SUPABASE_SECRET_KEY \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_TELEMETRY_DISABLED=1

RUN cd apps/web-publik && pnpm build

FROM node:22-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache tini

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup -g 1001 -S nodejs && adduser -u 1001 -S nextjs -G nodejs

# ── Tiga salinan ini WAJIB ketiganya (output: standalone) ───────────────────
# `standalone` menghasilkan server minimal TAPI TIDAK menyertakan aset statis.
# Kalau `.next/static` atau `public/` terlewat, halaman tetap terbuka — tanpa
# CSS, tanpa gambar. Gejalanya terbaca seperti build rusak.
COPY --from=build --chown=nextjs:nodejs /repo/apps/web-publik/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /repo/apps/web-publik/.next/static ./apps/web-publik/.next/static
COPY --from=build --chown=nextjs:nodejs /repo/apps/web-publik/public ./apps/web-publik/public

USER nextjs
EXPOSE 3000

# Menembak `/` — compro memang halaman publik tanpa sesi, jadi 200 di sini
# benar-benar berarti ia merender. (Beda dari web ERP yang memulangkan 307.)
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "apps/web-publik/server.js"]
