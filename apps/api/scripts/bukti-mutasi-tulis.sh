#!/usr/bin/env bash
# ============================================================================
# BUKTI MUTASI — `audit-tulis-berkonfirmasi.mjs` benar-benar bisa MERAH.
# ============================================================================
#
# Sesi 2026-08-10 sudah menemukan LIMA penjaga/test hijau-karena-buta: G-5,
# E-6, R-5, P-5, dan test konkurensi jalur tulis ini sendiri (lima
# `app.inject` bersamaan ternyata berurutan, jadi balapannya tak pernah
# terjadi).
#
# Empat di antaranya saya tulis sendiri. Membaca ulang tak pernah menemukannya.
set -u
cd "$(dirname "$0")/.." || exit 1

RUTE=src/routes/v1/ai-tulis.ts
DAFTAR=src/lib/ai-tool-siapkan.ts
PENJAGA=scripts/audit-tulis-berkonfirmasi.mjs
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

echo "── bukti mutasi: audit-tulis-berkonfirmasi ──"

# W-2 — klaim tak lagi atomik. Dua klik bersamaan = dua baris.
coba "W-2 syarat dipakai_pada dicabut" "$RUTE" \
  "        .is('dipakai_pada', null)" \
  "        "

# W-3 — entitas berisiko diselundupkan ke daftar putih.
coba "W-3 kasbons masuk daftar putih" "$DAFTAR" \
  "    tabel: 'punch_items'," \
  "    tabel: 'kasbons',"

# W-4 — aksi hapus muncul.
coba "W-4 aksi hapus ditambahkan" "$DAFTAR" \
  "    aksi: ['buat']," \
  "    aksi: ['buat', 'hapus'],"

# W-5 — izin tulis diganti izin chat.
coba "W-5 izin tulis diganti ai:chat" "$RUTE" \
  "      preHandler: [authenticate, requirePermission('ai:tulis')],
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const token" \
  "      preHandler: [authenticate, requirePermission('ai:chat')],
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
