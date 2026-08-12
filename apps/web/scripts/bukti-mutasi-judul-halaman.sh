#!/usr/bin/env bash
# ============================================================================
# BUKTI MUTASI — `uji-judul-halaman-ada.mjs` benar-benar bisa MERAH.
#
# Penjaga yang tak pernah merah adalah hiasan. Ini sudah terjadi di repo ini:
# `isian-ratchet` lahir mati karena menyetel lantai = keadaan sekarang di
# dalam `catch`, jadi ia hijau untuk pelanggaran apa pun — dan itu ketahuan
# HANYA karena bukti mutasi dijalankan.
#
# Yang dibuktikan di sini ADA DUA, dan yang kedua sama pentingnya:
#
#   1. Penjaga MERAH untuk pelanggaran nyata (judul dihapus).
#   2. Penjaga HIJAU untuk ketiga bentuk judul yang sah — `KepalaHalaman`,
#      `JudulBagian`, dan `<h1>` langsung. Penjaga yang cerewet akan didiamkan
#      orang, dan penjaga yang didiamkan sama tak bergunanya dengan yang buta.
#
# Butir 2 bukan kelengkapan formalitas: versi pertama penjaga ini TIDAK tahu
# `JudulBagian` dan menuduh 31 halaman yang sudah benar. Kalau angka itu
# dipercaya, "perbaikan"-nya akan menghasilkan DUA <h1> per halaman — cacat
# a11y yang lebih buruk daripada yang sedang diperbaiki.
#
# Semua mutasi DIPULIHKAN lewat `trap`, termasuk bila skrip dihentikan.
#
# Pakai:  bash apps/web/scripts/bukti-mutasi-judul-halaman.sh
# ============================================================================
set -uo pipefail
cd "$(dirname "$0")/../../.." || exit 1

PENJAGA="apps/web/scripts/uji-judul-halaman-ada.mjs"
LULUS=0
GAGAL=0

# Berkas yang dimutasi + salinan aslinya, dipulihkan apa pun yang terjadi.
declare -a DIPULIHKAN=()
pulihkan() {
  for f in "${DIPULIHKAN[@]:-}"; do
    [ -n "$f" ] && [ -f "$f.asli" ] && mv -f "$f.asli" "$f"
  done
}
trap pulihkan EXIT INT TERM

mutasi() {
  local berkas="$1" cari="$2" ganti="$3"
  cp "$berkas" "$berkas.asli"
  DIPULIHKAN+=("$berkas")
  # `python` karena `sed -i` di Git Bash mengacaukan CRLF, dan berkas di pohon
  # kerja ini CRLF. Pola ber-`\n` telanjang mencocokkan NOL kali, diam-diam.
  # Keluaran python SENGAJA ASCII: stdout Python di Windows memakai cp1252,
  # dan satu karakter `⚠` melempar UnicodeEncodeError yang menutupi pesan
  # aslinya ("pola tak ditemukan") dengan tumpukan galat encoding.
  python -c "
import io,sys
p,c,g = sys.argv[1], sys.argv[2], sys.argv[3]
s = io.open(p, encoding='utf-8', newline='').read()
if c not in s:
    print('   [!] pola mutasi tak ditemukan di ' + p); sys.exit(3)
io.open(p,'w',encoding='utf-8',newline='').write(s.replace(c,g,1))
" "$berkas" "$cari" "$ganti" || {
    echo "   ❌ mutasi GAGAL diterapkan — hasil di bawah tak bisa dipercaya"
    GAGAL=$((GAGAL+1))
    return 1
  }
}

periksa() {
  local nama="$1" harap="$2"   # harap = MERAH | HIJAU
  node "$PENJAGA" >/dev/null 2>&1
  local kode=$?
  local nyata="HIJAU"; [ $kode -ne 0 ] && nyata="MERAH"
  if [ "$nyata" = "$harap" ]; then
    echo "   ✅ $nama → $nyata (sesuai harapan)"
    LULUS=$((LULUS+1))
  else
    echo "   ❌ $nama → $nyata, seharusnya $harap"
    GAGAL=$((GAGAL+1))
  fi
}

kembalikan() {
  for f in "${DIPULIHKAN[@]:-}"; do
    [ -n "$f" ] && [ -f "$f.asli" ] && mv -f "$f.asli" "$f"
  done
  DIPULIHKAN=()
}

echo "════ dasar: tanpa mutasi apa pun"
periksa "keadaan bersih" HIJAU

echo
echo "════ M1 — judul \`KepalaHalaman\` dihapus dari satu halaman"
# Berkas dipilih yang menyebut `KepalaHalaman` PERSIS SEKALI di JSX.
#
# Percobaan pertama memutasi `/kepatuhan/page.tsx` dan penjaganya tetap
# HIJAU — bukan karena penjaganya buta, tapi karena berkas itu menyebut
# `KepalaHalaman` enam kali (impor + JSX + empat kali di komentar), dan
# `replace(...,1)` cuma mengenai yang pertama. Mutasi yang tak benar-benar
# menghapus apa pun akan selalu "membuktikan" penjaga rusak.
mutasi "apps/web/app/(dashboard)/sdm/payroll/page.tsx" "<KepalaHalaman" "<div hidden data-bukan-kepala"
periksa "KepalaHalaman hilang" MERAH
kembalikan

echo
echo "════ M2 — judul \`JudulBagian\` dihapus dari layout grup"
# `JudulBagian` dipakai di LAYOUT (kas, keuangan, mandor, procurement), bukan
# di halamannya. Percobaan pertama memutasi `procurement/page.tsx` yang tak
# memuatnya sama sekali — mutasi kosong, lalu disalahartikan sebagai penjaga
# yang gagal. Melumpuhkan layout menjatuhkan SELURUH cabang di bawahnya, dan
# itu justru kasus yang paling perlu dijaga.
mutasi "apps/web/app/(dashboard)/procurement/layout.tsx" "<JudulBagian" "<div hidden data-bukan-judul"
periksa "JudulBagian hilang dari layout" MERAH
kembalikan

echo
echo "════ M3 — halaman BARU tanpa judul (kasus yang paling sering)"
BARU="apps/web/app/(dashboard)/__bukti-mutasi-tanpa-judul"
mkdir -p "$BARU"
cat > "$BARU/page.tsx" <<'TSX'
"use client";
export default function Halaman() {
  return <div><p>Halaman baru yang lupa diberi judul.</p></div>;
}
TSX
periksa "halaman baru tanpa judul" MERAH
rm -rf "$BARU"

echo
echo "════ M4 — TIDAK CEREWET: ketiga bentuk judul yang sah harus HIJAU"
periksa "sesudah semua mutasi dipulihkan" HIJAU

# Ketiganya benar-benar terpakai? Penjaga bisa hijau karena salah satu bentuk
# tak pernah dipakai siapa pun — hijau yang tak membuktikan apa-apa.
echo
echo "   bentuk judul yang benar-benar dipakai di pohon:"
for b in KepalaHalaman JudulBagian; do
  n=$(grep -rl "<$b" apps/web/app/\(dashboard\)/ 2>/dev/null | wc -l)
  echo "      <$b> → $n berkas"
  if [ "$n" -eq 0 ]; then
    echo "      ❌ $b tak dipakai — M4 tak membuktikan penjaga menerimanya"
    GAGAL=$((GAGAL+1))
  fi
done

echo
echo "════════════════════════════════════════════"
echo "   lulus: $LULUS   gagal: $GAGAL"
[ $GAGAL -eq 0 ] || exit 1
echo "   ✅ penjaga terbukti bisa MERAH dan tidak cerewet"
