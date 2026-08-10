#!/usr/bin/env bash
# BUKTI MUTASI — penjaga Esc (WCAG 2.1.2, jalan keluar papan tik).
#
# Lantainya NOL, jadi setiap overlay baru tanpa jalan keluar harus merah.
# Yang diuji bukan hanya "bisa merah" melainkan juga "tidak cerewet": ketiga
# bentuk jalan keluar yang sah harus tetap hijau, karena penjaga yang menolak
# kode benar akan dimatikan orang pada hari pertama.
set -uo pipefail
cd "$(dirname "$0")/../../.."

PENJAGA="node apps/web/scripts/esc-ratchet.mjs"
KORBAN="apps/web/components/kosong-uji-esc.tsx"
trap 'rm -f "$KORBAN"' EXIT

gagal=0
uji() { # $1 judul, $2 harapan (merah|hijau), $3 isi berkas
  printf '%b' "$3" > "$KORBAN"
  if $PENJAGA >/dev/null 2>&1; then hasil=hijau; else hasil=merah; fi
  rm -f "$KORBAN"
  if [ "$hasil" = "$2" ]; then
    echo "   ✅ $1 → $hasil"
  else
    echo "   ❌ $1 → $hasil (harus $2)"
    gagal=1
  fi
}

echo "── 0. keadaan awal harus HIJAU"
if $PENJAGA >/dev/null 2>&1; then echo "   ✅ hijau"
else echo "   ❌ sudah merah sebelum mutasi — uji tak bermakna"; exit 1; fi

OVERLAY='<div style={{ position: "fixed", inset: 0 }} onClick={tutup} />'

echo
echo "── MENANGKAP (overlay tanpa jalan keluar papan tik)"
uji "overlay telanjang" merah \
  "export function U() { return $OVERLAY }\n"

echo
echo "── TIDAK CEREWET (ketiga jalan keluar yang sah)"
uji "useTutupEsc" hijau \
  "import { useTutupEsc } from '@/lib/use-tutup-esc';\nexport function U() { useTutupEsc(tutup); return $OVERLAY }\n"
uji "<dialog> asli" hijau \
  "export function U() { return <dialog><div style={{ position: \"fixed\", inset: 0 }} onClick={tutup} /></dialog> }\n"
uji "penanganan 'Escape' tangan" hijau \
  "export function U() { onKey(e => e.key === 'Escape' && tutup()); return $OVERLAY }\n"
uji "tanpa overlay sama sekali" hijau \
  "export function U() { return <div>halo</div> }\n"

echo
echo "── KOMENTAR bukan kode"
uji "overlay disebut di komentar saja" hijau \
  "/* contoh: position: \"fixed\", inset: 0 tanpa Esc */\nexport function U() { return <div>halo</div> }\n"

echo
if [ "$gagal" -eq 0 ]; then
  echo "✅ BUKTI LENGKAP: merah untuk jebakan papan tik, hijau untuk yang benar."
else
  echo "❌ BUKTI GAGAL — penjaga belum layak dipasang di CI."
fi
exit "$gagal"
