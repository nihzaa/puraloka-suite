#!/usr/bin/env bash
# BUKTI MUTASI — penjaga isian (K-6).
#
# Penjaga yang tak pernah merah adalah hiasan. Ini menyuntik dua bentuk
# pelanggaran yang BERBEDA, memastikan keduanya tertangkap, lalu memulihkan.
#
# Dua bentuk itu diuji terpisah karena keduanya lolos lewat jalur berbeda:
#   (1) `inputStyle` disusun dari nol — cacat yang terlihat saat membaca file.
#   (2) `GAYA_ISIAN` dipakai tapi `isian-fokus` dibuang — cacat yang TIDAK
#       terlihat saat review: bentuknya sudah memakai kosakata bersama.
# Penjaga yang hanya menangkap (1) akan lulus uji ini setengah, dan itulah
# gunanya memisahkannya.
#
# Uji ketiga: penjaga tidak boleh CEREWET — kode yang benar harus tetap hijau.
set -uo pipefail
cd "$(dirname "$0")/../../.."

PENJAGA="node apps/web/scripts/isian-ratchet.mjs"
KORBAN="apps/web/app/(dashboard)/pengaturan/kategori-pekerjaan/page.tsx"
CADANGAN="$(mktemp)"
cp "$KORBAN" "$CADANGAN"
pulihkan() { cp "$CADANGAN" "$KORBAN"; rm -f "$CADANGAN"; }
trap pulihkan EXIT

gagal=0

echo "── 0. keadaan awal harus HIJAU"
if $PENJAGA >/dev/null 2>&1; then
  echo "   ✅ hijau"
else
  echo "   ❌ sudah merah sebelum mutasi — uji ini tak bermakna"
  exit 1
fi

echo
echo "── 1. suntik: inputStyle disusun dari nol"
printf '\nconst inputStyle = { width: "100%%", borderRadius: 6, outline: "none" };\n' >> "$KORBAN"
if $PENJAGA >/dev/null 2>&1; then
  echo "   ❌ penjaga TETAP HIJAU — ia tak menangkap definisi dari nol"
  gagal=1
else
  echo "   ✅ MERAH"
fi
pulihkan; cp "$KORBAN" "$CADANGAN"

echo
echo "── 2. suntik: GAYA_ISIAN dipakai tanpa cincin fokus"
printf '\nconst _m = <input style={{ ...GAYA_ISIAN }} />;\n' >> "$KORBAN"
if $PENJAGA >/dev/null 2>&1; then
  echo "   ❌ penjaga TETAP HIJAU — cincin fokus yang dibuang lolos"
  gagal=1
else
  echo "   ✅ MERAH"
fi
pulihkan; cp "$KORBAN" "$CADANGAN"

echo
echo "── 3. tidak cerewet: pemakaian yang BENAR harus tetap hijau"
printf '\nconst _b = <input className="isian-fokus" style={{ ...GAYA_ISIAN }} />;\n' >> "$KORBAN"
printf 'const inputStyleB = { ...GAYA_ISIAN, height: 38 };\n' >> "$KORBAN"
if $PENJAGA >/dev/null 2>&1; then
  echo "   ✅ hijau — penjaga tidak menolak kode yang benar"
else
  echo "   ❌ MERAH pada kode yang benar — penjaga cerewet, akan diabaikan orang"
  gagal=1
fi
pulihkan; cp "$KORBAN" "$CADANGAN"

echo
if [ "$gagal" -eq 0 ]; then
  echo "✅ BUKTI LENGKAP: merah untuk dua bentuk pelanggaran, hijau untuk yang benar."
else
  echo "❌ BUKTI GAGAL — penjaga belum layak dipasang di CI."
fi
exit "$gagal"
