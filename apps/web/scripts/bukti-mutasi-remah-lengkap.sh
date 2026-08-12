#!/usr/bin/env bash
# ============================================================================
# BUKTI MUTASI — `uji-remah-lengkap.mjs` benar-benar bisa MERAH.
#
# Pakai:  bash apps/web/scripts/bukti-mutasi-remah-lengkap.sh
# ============================================================================
set -uo pipefail
cd "$(dirname "$0")/../../.." || exit 1

PENJAGA="apps/web/scripts/uji-remah-lengkap.mjs"
TOPBAR="apps/web/components/topbar.tsx"
# Nama TIDAK boleh diawali `_`: penjaga melewati direktori berawalan garis
# bawah (folder bersama seperti `_bersama` memang bukan rute). Percobaan
# pertama memakai `__bukti-mutasi-modul-baru` dan M1 tetap hijau — mutasi
# yang jatuh tepat ke dalam pengecualian tak menguji apa pun.
BARU="apps/web/app/(dashboard)/bukti-mutasi-modul-baru"
LULUS=0
GAGAL=0

pulihkan() {
  [ -f "$TOPBAR.asli" ] && mv -f "$TOPBAR.asli" "$TOPBAR"
  rm -rf "$BARU"
}
trap pulihkan EXIT INT TERM

periksa() {
  local nama="$1" harap="$2"
  node "$PENJAGA" >/dev/null 2>&1
  # `local kode=$?` TERPISAH — `local nyata="X"; [ $? ]` membaca hasil
  # `local`, yang selalu 0, dan membuat setiap pemeriksaan melapor HIJAU.
  # Cacat itu sudah terjadi di `bukti-mutasi-tabel-seragam.sh` hari ini dan
  # menuduh penjaga yang sehat.
  local kode=$?
  local nyata="HIJAU"; [ $kode -ne 0 ] && nyata="MERAH"
  if [ "$nyata" = "$harap" ]; then
    echo "   ✅ $nama → $nyata (sesuai harapan)"; LULUS=$((LULUS+1))
  else
    echo "   ❌ $nama → $nyata, seharusnya $harap"; GAGAL=$((GAGAL+1))
  fi
}

echo "════ dasar: tanpa mutasi"
periksa "keadaan bersih" HIJAU

echo
echo "════ M1 — modul BARU tanpa entri breadcrumb (kasus yang paling sering)"
mkdir -p "$BARU"
cat > "$BARU/page.tsx" <<'TSX'
"use client";
export default function Halaman() { return <div><h1>Modul baru</h1></div>; }
TSX
periksa "modul baru tak terdaftar" MERAH
rm -rf "$BARU"

echo
echo "════ M2 — entri modul yang ADA dihapus dari peta"
cp "$TOPBAR" "$TOPBAR.asli"
PYTHONIOENCODING=utf-8 python -c "
import io,sys
p = sys.argv[1]
s = io.open(p, encoding='utf-8', newline='').read()
c = '[\"/sdm\",           \"SDM & Payroll\"],'
if c not in s:
    print('   [!] pola mutasi tak ditemukan'); sys.exit(3)
io.open(p,'w',encoding='utf-8',newline='').write(s.replace(c, '', 1))
" "$TOPBAR" || { echo "   ❌ mutasi gagal diterapkan"; GAGAL=$((GAGAL+1)); }
periksa "entri /sdm dihapus" MERAH
mv -f "$TOPBAR.asli" "$TOPBAR"

echo
echo "════ M3 — TIDAK CEREWET: keadaan sah kembali hijau"
periksa "sesudah semua mutasi dipulihkan" HIJAU

echo
echo "════════════════════════════════════════════"
echo "   lulus: $LULUS   gagal: $GAGAL"
[ $GAGAL -eq 0 ] || exit 1
echo "   ✅ penjaga terbukti bisa MERAH dan tidak cerewet"
