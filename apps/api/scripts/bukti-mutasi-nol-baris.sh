#!/usr/bin/env bash
# ============================================================================
# BUKTI MUTASI — ambang kedua `audit-tulis-tanpa-periksa.mjs` bisa MERAH.
# ============================================================================
#
# Ambang kedua menangkap `const { error } = await db…update(…)`: bentuk yang
# TIDAK bisa membedakan "satu baris berubah" dari "tak ada baris yang cocok".
#
# ── Kenapa bukti ini bentuknya lain dari bukti penjaga ambang-NOL
#
# Penjaga berambang nol dibuktikan dengan menyuntik SATU pelanggaran. Penjaga
# RATCHET tak bisa: satu pelanggaran baru memang dimaksudkan membuatnya merah,
# tetapi kalau angkanya kebetulan turun di tempat lain, penambahan itu tertelan
# dan penjaganya tetap hijau. Jadi yang dibuktikan di sini ada dua hal:
#
#   1. menambah SATU penulisan tak terperiksa → MERAH  (ratchet-nya bekerja)
#   2. dua sub-fungsi yang mengkalibrasi angkanya benar-benar dipakai —
#      keduanya sempat SALAH, dan keduanya menghasilkan angka yang keliru
#      tanpa satu pun gejala:
#        · `potongStatement()`  — tanpa itu, `insert` dilaporkan sebagai
#          `update` karena jendela 25 baris menjangkau statement berikutnya
#          (91 vs 77 — 14 temuan hantu)
#        · `blokKomentarDiAtas()` — tanpa itu, `// best-effort` yang menyertakan
#          alasannya tak terbaca, dan pengecualian yang sah ikut terhitung
#
# Angka yang salah pada penjaga ratchet lebih buruk daripada penjaga yang tak
# ada: ia MENGIZINKAN pelanggaran baru sebanyak selisihnya, sambil terlihat
# seperti sedang menjaga.
set -u
cd "$(dirname "$0")/.." || exit 1

PENJAGA=scripts/audit-tulis-tanpa-periksa.mjs
KORBAN=src/routes/v1/wa-nomor.ts
gagal=0

ganti() { # $1 berkas, $2 dari, $3 jadi
  python - "$1" "$2" "$3" <<'PY'
import io, sys
p, dari, jadi = sys.argv[1], sys.argv[2], sys.argv[3]
s = io.open(p, encoding='utf-8').read()
if dari not in s:
    sys.exit(3)
io.open(p, 'w', encoding='utf-8', newline='').write(s.replace(dari, jadi, 1))
PY
}

coba() { # $1 nama, $2 berkas, $3 dari, $4 jadi
  local nama="$1" f="$2"
  cp "$f" "$f.bak"
  ganti "$f" "$3" "$4"
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

echo "── bukti mutasi: ambang kedua (nol baris dianggap berhasil) ──"

# N-1 — RATCHET. Satu penulisan baru yang hasilnya tak bisa diperiksa.
#       Inilah cacat yang sesungguhnya ditemukan di S4: yang menyunting isi
#       pesan melihat "tersimpan", dan teks lama tetap yang terkirim.
coba "N-1 update baru hanya ambil {error}" "$KORBAN" \
  "export async function waTemplateRoutes(app: FastifyInstance) {" \
  "export async function waTemplateRoutes(app: FastifyInstance) {
  const { error: sisipan } = await app.db
    .from('wa_template')
    .update({ isi: 'x' })
    .eq('id', 'y')
  if (sisipan) throw sisipan"

# N-2 — `potongStatement()` dilumpuhkan: kembali ke jendela 25 baris buta.
#       Angkanya melonjak ke 90-an karena `insert` ikut terhitung, dan
#       penjaganya melewati ambang.
coba "N-2 jendela statement dilumpuhkan" "$PENJAGA" \
  "      const blokD = potongStatement(baris, i)" \
  "      const blokD = baris.slice(i, i + 25).join('\\n')"

# N-3 — `blokKomentarDiAtas()` dilumpuhkan tanpa mengubah ambang. Ini TIDAK
#       boleh merah: mempersempit lookback hanya MENAMBAH temuan kalau ada
#       penanda ber-alasan yang jadi tak terbaca. Yang dibuktikan: penanda
#       semacam itu MEMANG ada di repo — kalau tidak, sub-fungsinya sia-sia.
echo "── N-3 apakah blokKomentarDiAtas() benar-benar berguna? ──"
cp "$PENJAGA" "$PENJAGA.bak"
ganti "$PENJAGA" \
  "    const konteks = [baris[i], ...blokKomentarDiAtas(baris, i)].join('\\n')" \
  "    const konteks = baris.slice(Math.max(0, i - 3), i + 1).join('\\n')"
sempit=$(node "$PENJAGA" 2>/dev/null | sed -n 's/^update\/delete yang hanya mengambil {error}: //p')
mv "$PENJAGA.bak" "$PENJAGA"
lebar=$(node "$PENJAGA" 2>/dev/null | sed -n 's/^update\/delete yang hanya mengambil {error}: //p')
if [ "${sempit:-0}" -gt "${lebar:-0}" ]; then
  echo "  N-3: ✅ lookback lebar menyelamatkan $((sempit - lebar)) penanda ber-alasan ($sempit → $lebar)"
else
  echo "  N-3: ❌ tak ada bedanya ($sempit vs $lebar) — sub-fungsinya tak menjaga apa pun"
  gagal=$((gagal + 1))
fi

echo "── pulih? ──"
if node "$PENJAGA" >/dev/null 2>&1; then
  echo "  ✅ HIJAU kembali"
else
  echo "  ❌ TIDAK PULIH — berkas tertinggal termutasi!"
  gagal=$((gagal + 1))
fi

[ "$gagal" -eq 0 ] || exit 1
