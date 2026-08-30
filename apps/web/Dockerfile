# ============================================================================
# Web (Next.js) — image produksi
# ============================================================================
# Dibangun DARI AKAR REPO (alasan sama dengan apps/api/Dockerfile):
#
#     docker build -f apps/web/Dockerfile \
#       --build-arg NEXT_PUBLIC_API_URL=https://api.puraloka-suite.duckdns.org \
#       -t puraloka-web .
#
# ⚠ NEXT_PUBLIC_* DIPANGGANG SAAT BUILD, bukan dibaca saat runtime.
#
# Ini jebakan yang sudah terbukti memakan waktu di repo ini: menyetelnya di
# docker-compose `environment:` TIDAK berpengaruh sama sekali, dan tak ada
# galat apa pun — peramban cuma menembak alamat lama. Karena itu ia ARG di
# sini, dan build gagal terang-terangan kalau kosong (lihat di bawah).
# ============================================================================

FROM node:22-alpine AS deps
WORKDIR /repo
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/ packages/

RUN pnpm install --frozen-lockfile --filter web...

FROM node:22-alpine AS build
WORKDIR /repo
RUN corepack enable

COPY --from=deps /repo/node_modules node_modules
COPY --from=deps /repo/apps/web/node_modules apps/web/node_modules
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/ packages/
COPY apps/web/ apps/web/

ARG NEXT_PUBLIC_API_URL
# ⚠ Supabase dibutuhkan SAAT BUILD, bukan cuma runtime.
#
# `/auth/callback` di-PRERENDER oleh `next build`, dan modul Supabase-nya
# dievaluasi saat itu juga. Tanpa keduanya build gagal dengan
#   "Error: supabaseUrl is required."
# — pesan yang benar, di tempat yang mudah disalahartikan sebagai cacat kode.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_KEY
# Gagal SEKARANG, bukan nanti. Tanpa pemeriksaan ini next.config.ts jatuh ke
# bawaan `http://localhost:3001`, dan itu dipanggang ke bundel: di peramban
# pengguna, `localhost` adalah KOMPUTER PENGGUNA SENDIRI. Gejalanya galat
# jaringan yang menuduh server, dan ia baru muncul sesudah deploy.
RUN test -n "$NEXT_PUBLIC_API_URL" || \
    (echo "FATAL: --build-arg NEXT_PUBLIC_API_URL wajib diisi (lihat header Dockerfile)" && exit 1)
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_KEY=$NEXT_PUBLIC_SUPABASE_KEY
ENV NEXT_TELEMETRY_DISABLED=1

RUN cd apps/web && pnpm build

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
# CSS, tanpa gambar, tanpa JS. Gejalanya terbaca seperti build rusak.
COPY --from=build --chown=nextjs:nodejs /repo/apps/web/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=nextjs:nodejs /repo/apps/web/public ./apps/web/public

USER nextjs
EXPOSE 3000

# Menembak /login: halaman NYATA yang tak butuh sesi. Menembak `/` memulangkan
# 307 (pengalihan ke login) — dan 307 bukan bukti aplikasinya merender.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "apps/web/server.js"]
