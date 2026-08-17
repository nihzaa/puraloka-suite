#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════
# BUKTI MUTASI — dokumen penawaran (sisi layar).
#
# Mutasi PERTAMA adalah yang paling menggoda ditulis orang yang tak tahu
# sejarahnya: menghitung total di layar supaya "responsif". Hasilnya dua angka
# untuk satu nilai — dan yang tercetak di surat adalah punya server, jadi
# layar yang berbeda hanya menyesatkan yang mengisinya.
#
# Sisi API-nya diuji terhadap Postgres nyata di
# `apps/api/src/routes/v1/__tests__/penawaran-rute.test.ts`, dan hitungannya
# di `apps/api/src/lib/__tests__/penawaran.test.ts` (24 test murni).
#
# Jalankan DARI apps/web:  bash scripts/bukti-mutasi-penawaran.sh
# ════════════════════════════════════════════════════════════════════════════
set -uo pipefail

BERKAS='components/penawaran-aksi.tsx'
UJI='components/penawaran-aksi.test.tsx'
CADANGAN="$(mktemp)"
cp "$BERKAS" "$CADANGAN"
pulihkan() { cp "$CADANGAN" "$BERKAS"; }
trap pulihkan EXIT

merah=0
total=0

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

echo "── Mutasi dokumen penawaran ─────────────────────────────────────"

# 1. Total dihitung ULANG di layar, dengan urutan diskon/pajak yang tertukar.
#
#    Inilah bentuk paling umum cacat ini: pajak dikenakan pada subtotal, bukan
#    pada dasar sesudah diskon. Selisihnya wajar di mata, dan salah.
coba "total dihitung ulang di layar" \
  's/              <Baris label="TOTAL PENAWARAN" nilai=\{hitung\.total\} tebal \/>/              <Baris label="TOTAL PENAWARAN" nilai={hitung.subtotal + hitung.subtotal * Number(surat?.ppn_persen ?? 0) \/ 100 - hitung.diskon} tebal \/>/'

# 2. Terbilang dikarang di layar alih-alih dari server.
coba "terbilang tak lagi dari server" \
  's/                Terbilang: \{hitung\.terbilang\}/                Terbilang: (dihitung di layar)/'

# 3. Baris judul menampilkan "Rp 0" di kolom jumlah.
coba "baris judul menampilkan Rp 0" \
  's/                        \{j === null \? "" : rupiah\(j\)\}/                        {rupiah(j ?? 0)}/'

# 4. Yang sudah terkirim tetap bisa disunting.
coba "yang terkirim tetap bisa disunting" \
  's/  const terkunci = !!surat && surat\.status !== "draft";/  const terkunci = false;/'

# 5. Peringatan terkunci hilang — isian mati tanpa penjelasan.
coba "sebab terkunci tak dinyatakan" \
  's/          \{terkunci && \(\n            <div role="alert"/          {false \&\& (\n            <div role="alert"/'

# 6. Masa berlaku terbalik lolos ke server.
coba "masa berlaku terbalik lolos" \
  's/  const berlakuTerbalik = !!berlaku && !!tanggal && berlaku < tanggal;/  const berlakuTerbalik = false;/'

# 7. Masa berlaku kosong dikirim string kosong.
coba "masa berlaku kosong jadi string kosong" \
  's/        berlaku_sampai: berlaku \|\| null,/        berlaku_sampai: berlaku,/'

# 8. Baris tanpa uraian ikut terkirim.
coba "baris kosong ikut terkirim" \
  's/        \{ item: baris\.filter\(\(b\) => b\.uraian\.trim\(\)\) \}\);/        { item: baris });/'

# 9. Peringatan "terkirim mengunci rincian" hilang dari modal status.
coba "peringatan kunci hilang dari modal status" \
  's/      \{status === "terkirim" && penawaran\.status === "draft" && \(/      {false \&\& (/'

# 10. PPN bawaan jadi 0 — surat terbit tanpa pajak tanpa ada yang memutuskan.
coba "ppn bawaan jadi nol" \
  's/const \[ppn, setPpn\] = useState\(awal \? String\(Number\(awal\.ppn_persen\) \|\| ""\) : "11"\);/const [ppn, setPpn] = useState("0");/'

echo ""
echo "Tertangkap: $merah/$total"
[ "$merah" -eq "$total" ] || exit 1
