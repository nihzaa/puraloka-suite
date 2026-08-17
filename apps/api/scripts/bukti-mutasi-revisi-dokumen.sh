#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════
# BUKTI MUTASI — revisi dokumen.
#
# Mutasi PERTAMA mengembalikan cacat yang seluruh modul ini tutup: status
# dibaca dari kolom, bukan diturunkan. Kolom hanya benar kalau ada yang ingat
# memperbaruinya — dan yang lupa menghasilkan gambar rev-2 berstatus
# "berlaku" yang sudah punya rev-3. Itu keadaan yang membuat pekerjaan
# dibongkar.
#
# Jalankan DARI apps/api:  bash scripts/bukti-mutasi-revisi-dokumen.sh
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

# ── Penurunan status ───────────────────────────────────────────────────────
pakai 'src/lib/revisi-dokumen.ts' 'src/lib/__tests__/revisi-dokumen.test.ts'

# 1. Tak ada yang pernah ditandai digantikan.
coba "status digantikan tak pernah menyala" \
  "s/    if \(d\.menggantikan_id\) penerus\.set\(d\.menggantikan_id, d\.id\)/    if (false) penerus.set(d.menggantikan_id!, d.id)/"

# 2. Nomor revisi dibaca kolom apa adanya — menyimpang begitu kolomnya salah.
coba "revisi dibaca kolom, bukan ditelusuri" \
  "s/  const revisiPer = new Map<string, number>\(daftar\.map\(\(d\) => \[d\.id, nomorRevisi\(d\)\]\)\)/  const revisiPer = new Map<string, number>(daftar.map((d) => [d.id, Number(d.revisi ?? 1)]))/"

# 3. Induk yang tak ada di daftar berhenti diam-diam — rev-3 jadi rev-1.
coba "induk hilang berhenti diam-diam" \
  "s/      n \+= 1\n      if \(!induk\) break/      if (!induk) break\n      n += 1/"

# 4. Kolom `revisi` tak lagi jadi lantai saat rantainya putus.
coba "rantai putus tak punya saksi" \
  "s/    const tersimpan = Number\(d\.revisi \?\? 1\)\n    return Number\.isFinite\(tersimpan\) && tersimpan > n \? tersimpan : n/    return n/"

# ⚠ PENJAGA RANTAI MELINGKAR SENGAJA TIDAK DIMUTASI.
#
# Mencabut `terlihat` menghasilkan perulangan tak berujung yang SINKRON —
# `testTimeout` vitest tak bisa memutusnya, jadi berkas bukti ini menggantung
# selamanya alih-alih melaporkan MERAH. Dicoba sekali: prosesnya harus
# dimatikan tangan, dan trap pemulihannya ikut terlewat sehingga berkasnya
# tertinggal termutasi.
#
# Pelajarannya: penjaga yang ketiadaannya membuat program MENGGANTUNG tak bisa
# dibuktikan lewat uji mutasi, karena suite yang menggantung bukan suite yang
# merah. Yang menjaganya tetap ada — uji `rantai melingkar tidak menggantung`
# di `lib/__tests__/revisi-dokumen.test.ts` — dan bentuk buktinya memang
# berbeda: ia lulus dalam hitungan milidetik, dan tanpa penjaganya ia tak
# pernah selesai sama sekali.

# 6. Revisi lintas proyek lolos.
coba "revisi lintas proyek lolos" \
  "s/  if \(m\.induk\.project_id && m\.induk\.project_id !== m\.projectId\) \{/  if (false) {/"

# 7. Percabangan riwayat lolos.
coba "percabangan riwayat lolos" \
  "s/  if \(m\.sudahDigantikan\) \{/  if (false) {/"

# ── Rute ───────────────────────────────────────────────────────────────────
pakai 'src/routes/v1/documents.ts' 'src/routes/v1/__tests__/dokumen-revisi.test.ts'

# 8. Daftar berhenti membawa status revisinya.
coba "daftar tak membawa status revisi" \
  "s/            digantikan: h\?\.digantikan \?\? false,/            digantikan: false,/"

# 9. Nomor revisi berikutnya dipaku 1 — nomornya berhenti bertambah.
#
#    Diserang di LIB, bukan di rute. Versi pertama memutasi barisnya di jalur
#    unggah dan pulang HIJAU — bukan karena kodenya aman, melainkan karena
#    jalur itu menyentuh Storage dan tak ada uji yang menjalankannya. Barisnya
#    lalu dipindahkan ke `nomorRevisiBerikut()` supaya bisa diuji murni.
pakai 'src/lib/revisi-dokumen.ts' 'src/lib/__tests__/revisi-dokumen.test.ts'

coba "nomor revisi berikutnya dipaku satu" \
  "s/  return \(Number\.isFinite\(n\) && n >= 1 \? Math\.floor\(n\) : 1\) \+ 1/  return 1/"

# 10. Induk ber-nomor tak terbaca menghasilkan NaN.
coba "nomor revisi induk sampah jadi NaN" \
  "s/  const n = Number\(induk\.revisi \?\? 1\)\n  return \(Number\.isFinite\(n\) && n >= 1 \? Math\.floor\(n\) : 1\) \+ 1/  return Number(induk.revisi) + 1/"

echo ""
echo "Tertangkap: $merah/$total"
[ "$merah" -eq "$total" ] || exit 1
