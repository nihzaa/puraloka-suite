#!/usr/bin/env bash
# ============================================================================
# BUKTI MUTASI — `audit-preview-setujui.mjs` benar-benar bisa MERAH (P-7).
# ============================================================================
#
# Kriteria E1 menuntutnya eksplisit: "P-7 tiap penjaga TERBUKTI MERAH lewat
# mutasi sengaja". Bukan formalitas — beberapa jam sebelum berkas ini ditulis,
# penjaga G-5 di `audit-webhook-bergerbang.mjs` HIJAU padahal jalur yang
# dijaganya sudah dicabut, dan hanya mutasi yang menemukannya.
#
# Tiap mutasi menyuntik SATU cacat NYATA — bentuk yang benar-benar pernah
# terjadi di TJS — lalu menuntut penjaga merah dan memulihkan berkasnya.
set -u
cd "$(dirname "$0")/.." || exit 1

LIB=src/lib/ai-setujui.ts
RUTE=src/routes/v1/ai-setujui.ts
PENJAGA=scripts/audit-preview-setujui.mjs
gagal=0

coba() { # $1 nama, $2 berkas, $3 dari, $4 jadi
  local nama="$1" f="$2" dari="$3" jadi="$4"
  cp "$f" "$f.bak"
  python - "$f" "$dari" "$jadi" <<'PY'
import io, sys
p, dari, jadi = sys.argv[1], sys.argv[2], sys.argv[3]
s = io.open(p, encoding='utf-8').read()
if dari not in s:
    sys.exit(3)
io.open(p, 'w', encoding='utf-8', newline='').write(s.replace(dari, jadi, 1))
PY
  if [ $? -eq 3 ]; then
    echo "  $nama: ❌ mutasi TIDAK MENDARAT (pola berubah — perbarui bukti ini)"
    gagal=$((gagal + 1)); mv "$f.bak" "$f"; return
  fi
  if node "$PENJAGA" >/dev/null 2>&1; then
    echo "  $nama: ❌ HIJAU padahal dilanggar — penjaga BUTA"
    gagal=$((gagal + 1))
  else
    echo "  $nama: ✅ MERAH (benar)"
  fi
  mv "$f.bak" "$f"
}

echo "── bukti mutasi: audit-preview-setujui (P-7) ──"

# E-1 — approve memanggil recordApproval langsung (melewati saldo & rantai).
coba "E-1 dispatch diganti recordApproval" "$LIB" \
  "  const res = await request.server.inject({" \
  "  const res = await recordApproval({"

# E-2/E-3 — nominal tak diketahui dibaca NOL. Cacat C-10 dalam bentuk paling
#           murni: satu kata, dan gerbang uangnya terbuka tanpa galat.
coba "E-3 Infinity → 0 saat kolom nominal tak ada" "$LIB" \
  "  if (!sumber.kolomNominal) return Number.POSITIVE_INFINITY" \
  "  if (!sumber.kolomNominal) return 0"

# E-4 — klaim jadi TIDAK atomik: syarat `dipakai_pada IS NULL` dicabut.
coba "E-4 klaim kehilangan syarat dipakai_pada" "$LIB" \
  "    .is('dipakai_pada', null)" \
  "    "

# E-5 — batas hanya dicek sekali (pemeriksaan kedua dihapus).
coba "E-5 batas tak dicek ulang saat klaim" "$LIB" \
  "  const batas = await batasPengguna(db, userId)
  if (!(nominal <= batas)) {" \
  "  const batas = Number.MAX_SAFE_INTEGER
  if (!(nominal <= batas)) {"

# E-6 — rute setujui kehilangan gerbang permission.
coba "E-6 gerbang ai:setujui dicabut dari satu rute" "$RUTE" \
  "      preHandler: [authenticate, requirePermission('ai:setujui')],
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const token" \
  "      preHandler: [authenticate],
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const token"

echo "── pulih? ──"
if node "$PENJAGA" >/dev/null 2>&1; then
  echo "  ✅ HIJAU kembali"
else
  echo "  ❌ TIDAK PULIH — berkas tertinggal termutasi!"
  gagal=$((gagal + 1))
fi

[ "$gagal" -eq 0 ] || exit 1
