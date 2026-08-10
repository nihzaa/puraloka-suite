#!/usr/bin/env bash
# BUKTI MUTASI — penjaga a11y statis, SESUDAH dilonggarkan (K-6, 2026-08-11).
#
# ── Kenapa berkas ini ada
#
# `a11y-ratchet` dilonggarkan dua kali hari ini:
#   1. pengecualian pembungkus generik `{...props}` → `{...<apa pun>}`,
#      karena repo ini menulis kodenya dalam bahasa Indonesia dan
#      `components/isian.tsx` menyebar `{...sisa}`;
#   2. pengenalan komentar `/*` dan `/**`, karena JSDoc satu baris yang
#      MENYEBUT `<select>` dilaporkan sebagai kontrol tanpa nama.
#
# Melonggarkan penjaga adalah G-5. Yang membuatnya sah bukan alasannya,
# melainkan bukti bahwa ia MASIH menangkap pelanggaran nyata sesudahnya.
#
# ── Catatan tentang bentuk yang diuji
#
# `<button />` self-closing tanpa anak sengaja TIDAK dijadikan uji: bentuk itu
# tak pernah ditulis orang, dan penjaga yang dituntut menangkapnya hanya akan
# dilonggarkan lagi nanti. Yang diuji adalah bentuk yang benar-benar muncul di
# kode ini: tombol kosong dan tombol berisi ikon saja.
set -uo pipefail
cd "$(dirname "$0")/../../.."

PENJAGA="node apps/web/scripts/a11y-ratchet.mjs"
KORBAN="apps/web/app/(dashboard)/pengaturan/kategori-pekerjaan/page.tsx"
CADANGAN="$(mktemp)"
cp "$KORBAN" "$CADANGAN"
trap 'cp "$CADANGAN" "$KORBAN"; rm -f "$CADANGAN"' EXIT

gagal=0
uji() { # $1 = judul, $2 = harapan (merah|hijau), $3 = kode yang disuntik
  cp "$CADANGAN" "$KORBAN"
  printf '%b' "$3" >> "$KORBAN"
  if $PENJAGA >/dev/null 2>&1; then hasil=hijau; else hasil=merah; fi
  if [ "$hasil" = "$2" ]; then
    echo "   ✅ $1 → $hasil"
  else
    echo "   ❌ $1 → $hasil (harus $2)"
    gagal=1
  fi
}

echo "── 0. keadaan awal harus HIJAU"
if $PENJAGA >/dev/null 2>&1; then echo "   ✅ hijau"
else echo "   ❌ sudah merah sebelum mutasi — uji ini tak bermakna"; exit 1; fi

echo
echo "── MASIH MENANGKAP (pelanggaran nyata)"
uji "<select> tanpa nama"        merah '\nconst _a = <select id="m"><option>x</option></select>;\n'
uji "<button> kosong"            merah '\nconst _b = <button onClick={() => {}}></button>;\n'
uji "<button> hanya ikon"        merah '\nconst _c = <button onClick={() => {}}><X size={12} /></button>;\n'

echo
echo "── TIDAK CEREWET (kode yang benar)"
uji "pembungkus {...sisa}"       hijau '\nconst _d = <select {...sisa} />;\n'
uji "pembungkus {...props}"      hijau '\nconst _e = <select {...props} />;\n'
uji "JSDoc menyebut <select>"    hijau '\n/** <select> di sini hanya kalimat penjelasan. */\n'
uji "<select> dengan aria-label" hijau '\nconst _f = <select aria-label="Pilih satuan"><option>x</option></select>;\n'

echo
if [ "$gagal" -eq 0 ]; then
  echo "✅ BUKTI LENGKAP: pelonggaran tidak membutakan penjaga."
else
  echo "❌ BUKTI GAGAL — pelonggaran melemahkan penjaga (G-5)."
fi
exit "$gagal"
