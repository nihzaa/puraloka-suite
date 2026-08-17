#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════
# BUKTI MUTASI — dokumen penawaran (sisi API & hitungan).
#
# Dua mutasi pertama menyerang ANGKA YANG MENGIKAT:
#
#   • urutan diskon & PPN ditukar → pajak dihitung atas nilai yang tak pernah
#     ditagih; pada penawaran ratusan juta selisihnya jutaan
#   • terbilang lahir dari subtotal, bukan total → surat menyebut dua angka
#     berbeda, dan yang tertulis HURUF yang dipegang saat keduanya berbeda
#
# Mutasi ketiga menyerang hal yang paling sunyi: PDF yang terbit KOSONG tetapi
# tetap 200 ber-Content-Type PDF. Peramban menampilkannya sebagai berkas
# rusak, dan tak ada galat di mana pun.
#
# Jalankan DARI apps/api:  bash scripts/bukti-mutasi-penawaran.sh
# ════════════════════════════════════════════════════════════════════════════
set -uo pipefail

merah=0
total=0
CADANGAN=""
BERKAS=""
UJI=""

pulihkan() { [ -n "$CADANGAN" ] && cp "$CADANGAN" "$BERKAS"; return 0; }
trap pulihkan EXIT

pakai() {
  pulihkan
  BERKAS="$1"; UJI="$2"
  CADANGAN="$(mktemp)"
  cp "$BERKAS" "$CADANGAN"
  echo ""
  echo "── $BERKAS ────────────────────────────────────────────"
}

coba() {
  total=$((total + 1))
  pulihkan
  perl -0pi -e "$2" "$BERKAS"
  if diff -q "$CADANGAN" "$BERKAS" >/dev/null; then
    echo "  ?      ✗  $1   <- pola tak cocok, tak ada yang berubah"
    return
  fi
  if npx vitest run "$UJI" >/dev/null 2>&1; then
    echo "  HIJAU  ✗  $1   <- MUTASI TAK TERTANGKAP"
  else
    echo "  MERAH  ✓  $1"
    merah=$((merah + 1))
  fi
}

# ── Hitungan & terbilang ───────────────────────────────────────────────────
pakai 'src/lib/penawaran.ts' 'src/lib/__tests__/penawaran.test.ts'

# 1. PPN dikenakan SEBELUM diskon.
coba "ppn dikenakan sebelum diskon" \
  "s/  const ppn = Math\.round\(dpp \* persen\) \/ 100/  const ppn = Math.round(subtotal * persen) \/ 100/"

# 2. Terbilang lahir dari subtotal, bukan total.
coba "terbilang dari subtotal" \
  "s/    terbilang: terbilangRupiah\(total\),/    terbilang: terbilangRupiah(subtotal),/"

# 3. Diskon melebihi subtotal lolos — total negatif.
coba "diskon melebihi subtotal lolos" \
  "s/  const diskon = Math\.min\(diskonMinta, subtotal\)/  const diskon = diskonMinta/"

# 4. \"Seribu\" jadi \"satu ribu\".
coba "aturan se- pada ribu hilang" \
  "s/  if \(n < 2000\) return \`seribu\\\$\{n - 1000 \? \` \\\$\{keKata\(n - 1000\)\}\` : ''\}\`/  if (n < 2000) return \`satu ribu\\\${n - 1000 ? \` \\\${keKata(n - 1000)}\` : ''}\`/"

# 5. \"Seratus\" jadi \"satu ratus\".
coba "aturan se- pada ratus hilang" \
  "s/  if \(n < 200\) return \`seratus\\\$\{n - 100 \? \` \\\$\{keKata\(n - 100\)\}\` : ''\}\`/  if (n < 200) return \`satu ratus\\\${n - 100 ? \` \\\${keKata(n - 100)}\` : ''}\`/"

# 6. `angkaSah` meloloskan sampah sebagai NaN.
#
#    Versi pertama mutasi ini menyerang penjaga `null` di `jumlahBaris` dan
#    HIJAU — pantas: `null * 185000` adalah 0 di JavaScript, jadi penjaga itu
#    redundansi defensif, bukan yang menentukan. Yang sungguh menahan NaN ada
#    di hulu, di `angkaSah`. Hijau di situ berarti mutasinya menyerang baris
#    yang memang tak menentukan apa-apa.
coba "angkaSah meloloskan sampah" \
  "s/  if \(!Number\.isFinite\(n\)\) return null\n  return n/  return n/"

# 7. Masa berlaku tak lagi wajib saat mengirim.
coba "masa berlaku tak wajib saat kirim" \
  "s/  if \(!m\.berlaku_sampai\) \{/  if (false) {/"

# 8. Penawaran tanpa rincian boleh dikirim.
coba "penawaran tanpa rincian boleh dikirim" \
  "s/  if \(isi\.length === 0\) \{/  if (false) {/"

# ── Rute ───────────────────────────────────────────────────────────────────
pakai 'src/routes/v1/penawaran.ts' 'src/routes/v1/__tests__/penawaran-rute.test.ts'

# 9. PDF disusun sebelum alirannya tuntas — berkas KOSONG ber-status 200.
coba "pdf tak menunggu aliran tuntas" \
  "s/  await new Promise<void>\(\(resolve\) => doc\.on\('end', resolve\)\)\n  return Buffer\.concat\(chunks\)/  return Buffer.concat(chunks)/"

# 10. Rincian yang sudah terkirim boleh diubah.
coba "rincian terkirim boleh diubah" \
  "s/      if \(induk\.status !== 'draft'\) \{/      if (false) {/"

# 11. `dikirim_pada` ditimpa tiap perpindahan status.
coba "dikirim_pada ditimpa tiap status" \
  "s/      if \(status !== 'draft' && status !== 'batal' && !hasil\.data\.dikirim_pada\) \{/      if (status !== 'draft' \&\& status !== 'batal') {/"

# 12. Gerbang kelengkapan saat mengirim dicabut.
coba "gerbang kirim dicabut" \
  "s/      if \(status === 'terkirim'\) \{/      if (false) {/"

# 13. Penawaran yang sudah dikirim boleh dihapus.
coba "penawaran terkirim boleh dihapus" \
  "s/      if \(ada\.status !== 'draft'\) \{/      if (false) {/"

# 14. Volume kosong disimpan 0, bukan NULL — baris judul jadi pekerjaan gratis.
coba "volume kosong disimpan nol" \
  "s/          volume: it\.volume === '' \|\| it\.volume === null \|\| it\.volume === undefined\n            \? null : Number\(it\.volume\),/          volume: Number(it.volume) || 0,/"

echo ""
echo "Tertangkap: $merah/$total"
[ "$merah" -eq "$total" ] || exit 1
