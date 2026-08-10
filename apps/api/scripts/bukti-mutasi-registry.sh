#!/usr/bin/env bash
# ============================================================================
# BUKTI MUTASI — `audit-registry-penyedia.mjs` benar-benar bisa MERAH.
# ============================================================================
#
# Sesi 2026-08-10 sudah menemukan EMPAT penjaga hijau-karena-buta (G-5, E-6,
# R-5, dan test isolasi RAG). Tiga di antaranya saya tulis sendiri, dan dua
# adalah kesalahan yang sama yang saya ulangi beberapa menit sesudah
# memperbaikinya. Membaca ulang tak pernah menemukannya; hanya mutasi.
set -u
cd "$(dirname "$0")/.." || exit 1

RUTE=src/routes/v1/penyedia.ts
MIG=../../db/migrations/266_registry_penyedia_universal.sql
PENJAGA=scripts/audit-registry-penyedia.mjs
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

echo "── bukti mutasi: audit-registry-penyedia ──"

# P-1 — kolom rahasia diselundupkan ke definisi tabel.
coba "P-1 kolom api_key masuk registry" "$MIG" \
  "  kunci_kredensial TEXT," \
  "  kunci_kredensial TEXT,
  api_key     TEXT,"

# P-3 — adaptor tak lagi divalidasi; nilai karangan tersimpan rapi.
coba "P-3 validasi adaptor dicabut" "$RUTE" \
  "          ? ADAPTOR_WA_DIKENAL.some((a) => a.kunci === adaptor)" \
  "          ? true"

# P-4 — endpoint WhatsApp dipanggil langsung dari route (cacat W-1 yang
#       memang SEMPAT saya buat, lalu ditolak penjaga satu-pintu).
coba "P-4 endpoint WA disentuh dari route" "$RUTE" \
  "    if (p.jenis === 'wa') {" \
  "    if (p.jenis === 'wa') {
      await fetch('https://api.fonnte.com/device')"

# P-5 — jejak uji tak dicatat; hanya status terakhir yang ditimpa.
coba "P-5 jejak uji tak dicatat" "$RUTE" \
  "        .from('penyedia_uji_log')" \
  "        .from('penyedia_layanan')"

echo "── pulih? ──"
if node "$PENJAGA" >/dev/null 2>&1; then
  echo "  ✅ HIJAU kembali"
else
  echo "  ❌ TIDAK PULIH — berkas tertinggal termutasi!"
  gagal=$((gagal + 1))
fi

[ "$gagal" -eq 0 ] || exit 1
