# ============================================================================
# API (Fastify + TypeScript) — image produksi
# ============================================================================
# Dibangun DARI AKAR REPO, bukan dari apps/api:
#
#     docker build -f apps/api/Dockerfile -t puraloka-api .
#
# Alasannya pnpm workspace: `pnpm-lock.yaml` dan `pnpm-workspace.yaml` hidup di
# akar, dan tanpa keduanya `--frozen-lockfile` tak bisa dipakai. Membangun dari
# apps/api "berhasil" tapi memasang versi yang berbeda dari yang diuji CI —
# kegagalan yang muncul di produksi, bukan saat build.
# ============================================================================

# ── Tahap 1: dependensi ─────────────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /repo

RUN corepack enable

# Hanya manifest lebih dulu — supaya lapisan `pnpm install` di-cache dan tak
# diulang tiap kali kode berubah.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/ packages/

# --frozen-lockfile: versi yang dipasang WAJIB sama dengan yang diuji CI.
# Tanpa ini lockfile diperbarui diam-diam saat build, dan image produksi
# menjalankan pohon dependensi yang tak pernah diuji siapa pun.
RUN pnpm install --frozen-lockfile --filter @puraloka/api...

# ── Tahap 2: build ──────────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /repo
RUN corepack enable

COPY --from=deps /repo/node_modules node_modules
COPY --from=deps /repo/apps/api/node_modules apps/api/node_modules
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/ packages/
COPY apps/api/ apps/api/

# ⚠ Heap dinaikkan — `tsc` kehabisan memori di VPS.
#
# Diukur 2026-08-30: build gagal dengan
#   FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
#
# Bawaan Node ~2 GB pada mesin 8 GB, dan proyek ini besar (494 migrasi, ratusan
# rute, tipe yang saling merujuk dalam). Ini BUKAN kebocoran memori: kompilasi
# sekali jalan memang butuh lebih, dan angkanya turun lagi begitu build selesai.
#
# 4 GB dipilih karena VPS punya ~6 GB tersedia — menyisakan ruang untuk
# container lain yang sedang berjalan (TJS, n8n, Evolution, admin-saas).
ENV NODE_OPTIONS=--max-old-space-size=4096
RUN cd apps/api && pnpm build

# Buang dependensi pengembangan SESUDAH build — `tsc` butuh mereka, runtime
# tidak. Ini yang memangkas image, bukan trik lain.
# ⚠ `CI=true` WAJIB, dan `--force` BUKAN jawabannya.
#
# Tanpa TTY pnpm menolak menghapus node_modules:
#   [ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY]
#
# Perlindungan yang masuk akal di terminal orang, penghalang di build otomatis
# yang memang BERMAKSUD menghapusnya. Percobaan pertama memakai `--force` dan
# ditolak — `[ERROR] Unknown option: 'force'`; prune tak punya bendera itu.
# Yang dikenali pnpm adalah `CI=true`.
RUN CI=true pnpm prune --prod

# ── Tahap 3: runtime ────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app

# tini: PID 1 yang benar. Tanpanya SIGTERM tak diteruskan ke node, container
# butuh 10 detik untuk mati di tiap deploy, dan koneksi berjalan diputus paksa.
RUN apk add --no-cache tini

ENV NODE_ENV=production

# Non-root. Nomor UID dipaku supaya kepemilikan berkas tak berubah antar build.
RUN addgroup -g 1001 -S nodejs && adduser -u 1001 -S fastify -G nodejs

COPY --from=build --chown=fastify:nodejs /repo/node_modules ./node_modules
COPY --from=build --chown=fastify:nodejs /repo/apps/api/node_modules ./apps/api/node_modules
COPY --from=build --chown=fastify:nodejs /repo/apps/api/dist ./apps/api/dist
COPY --from=build --chown=fastify:nodejs /repo/apps/api/package.json ./apps/api/

USER fastify

# PORT dibaca dari env saat runtime — JANGAN dipaku di sini. Nilainya harus
# sepadan dengan NEXT_PUBLIC_API_URL milik web, dan itu dijaga
# `apps/api/scripts/audit-port-api-cocok.mjs`.
EXPOSE 3001

# Healthcheck menembak /health — rute yang BENAR-BENAR ada (diverifikasi
# 2026-08-29: 200). Menembak `/` akan selalu 404 dan container dinyatakan
# sakit padahal sehat.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "apps/api/dist/index.js"]
