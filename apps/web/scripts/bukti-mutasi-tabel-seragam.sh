#!/usr/bin/env bash
# ============================================================================
# BUKTI MUTASI — `uji-tabel-seragam.mjs` benar-benar bisa MERAH.
#
# Ratchet punya cara gagal yang khas dan senyap: kalau lantainya diukur ulang
# tiap jalan, ia SELALU sama dengan keadaan dan penjaganya hijau untuk
# pelanggaran apa pun. `isian-ratchet` di repo ini lahir persis begitu, dan
# ketahuan HANYA lewat bukti mutasi — bukan review, bukan test.
#
# Karena itu M1 di bawah bukan sekadar "tambah pelanggaran → merah". Ia juga
# memeriksa bahwa BERKAS LANTAI TIDAK IKUT BERUBAH saat mutasi berjalan.
# Ratchet yang menulis ulang lantainya sendiri akan lulus uji merah/hijau
# naif dan tetap tak berguna.
#
# Pakai:  bash apps/web/scripts/bukti-mutasi-tabel-seragam.sh
# ============================================================================
set -uo pipefail
cd "$(dirname "$0")/../../.." || exit 1

PENJAGA="apps/web/scripts/uji-tabel-seragam.mjs"
LANTAI="apps/web/scripts/uji-tabel-lantai.json"
KORBAN="apps/web/app/(dashboard)/approval-inbox/page.tsx"
LULUS=0
GAGAL=0

pulihkan() {
  [ -f "$KORBAN.asli" ] && mv -f "$KORBAN.asli" "$KORBAN"
  [ -f "$LANTAI.asli" ] && mv -f "$LANTAI.asli" "$LANTAI"
}
trap pulihkan EXIT INT TERM

periksa() {
  local nama="$1" harap="$2"
  node "$PENJAGA" >/dev/null 2>&1
  # Kode keluar DITANGKAP LEBIH DULU ke variabel biasa.
  #
  # Versi pertama menulis `local nyata="HIJAU"; [ $? -ne 0 ] && nyata="MERAH"`
  # — dan `$?` di sana adalah hasil `local`, yang selalu 0. Akibatnya SETIAP
  # pemeriksaan melaporkan HIJAU, termasuk saat penjaganya benar-benar merah.
  #
  # Bug itu membuat bukti mutasi menuduh penjaga yang sehat. Kalau saya
  # percaya laporannya, saya akan "memperbaiki" penjaga yang tak rusak.
  local kode=$?
  local nyata="HIJAU"; [ $kode -ne 0 ] && nyata="MERAH"
  if [ "$nyata" = "$harap" ]; then
    echo "   ✅ $nama → $nyata (sesuai harapan)"; LULUS=$((LULUS+1))
  else
    echo "   ❌ $nama → $nyata, seharusnya $harap"; GAGAL=$((GAGAL+1))
  fi
}

cp "$LANTAI" "$LANTAI.asli"

echo "════ dasar: tanpa mutasi"
periksa "keadaan bersih" HIJAU

echo
echo "════ M1 — satu sel tabel memaku padding lagi"
cp "$KORBAN" "$KORBAN.asli"
PYTHONIOENCODING=utf-8 python -c "
import io,sys
p = sys.argv[1]
s = io.open(p, encoding='utf-8', newline='').read()
c = 'padding: \"var(--pad-baris)\", whiteSpace: \"nowrap\", color: C.mid'
if c not in s:
    print('   [!] pola mutasi tak ditemukan'); sys.exit(3)
io.open(p,'w',encoding='utf-8',newline='').write(s.replace(c, 'padding: \"7px 13px\", whiteSpace: \"nowrap\", color: C.mid', 1))
" "$KORBAN" || { echo "   ❌ mutasi gagal diterapkan"; GAGAL=$((GAGAL+1)); }
periksa "padding dipaku bertambah" MERAH

# Ratchet yang menulis ulang lantainya sendiri lulus uji merah/hijau naif
# dan tetap tak berguna. Ini yang membedakannya.
if diff -q "$LANTAI" "$LANTAI.asli" >/dev/null 2>&1; then
  echo "   ✅ berkas lantai TIDAK berubah selama mutasi"; LULUS=$((LULUS+1))
else
  echo "   ❌ berkas lantai IKUT BERUBAH — ratchet ini lahir mati"; GAGAL=$((GAGAL+1))
fi

mv -f "$KORBAN.asli" "$KORBAN"

echo
echo "════ M2 — TIDAK CEREWET: keadaan sah kembali hijau"
periksa "sesudah mutasi dipulihkan" HIJAU

echo
echo "════ M3 — lantai dihapus → dibuat ulang, bukan diam-diam hijau selamanya"
mv -f "$LANTAI" "$LANTAI.hilang"
node "$PENJAGA" >/dev/null 2>&1
if [ -f "$LANTAI" ]; then
  n=$(python -c "import json;print(json.load(open('$LANTAI'))['nilai'])" 2>/dev/null)
  echo "   ✅ berkas lantai dibuat ulang (nilai $n), bukan diabaikan"; LULUS=$((LULUS+1))
else
  echo "   ❌ lantai TIDAK ditulis — penjaga akan mengukur ulang tiap jalan (lahir mati)"
  GAGAL=$((GAGAL+1))
fi
mv -f "$LANTAI.hilang" "$LANTAI"

echo
echo "════════════════════════════════════════════"
echo "   lulus: $LULUS   gagal: $GAGAL"
[ $GAGAL -eq 0 ] || exit 1
echo "   ✅ ratchet terbukti bisa MERAH, tidak cerewet, dan lantainya nyata"
