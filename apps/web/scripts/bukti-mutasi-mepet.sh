#!/usr/bin/env bash
# ============================================================================
# BUKTI MUTASI — `uji-baris-tak-mepet.mjs` benar-benar bisa MERAH.
# ============================================================================
#
# Penjaga ini lahir dari satu kata founder: "mepet" (2026-08-10), pada halaman
# Alur Otomasi dan Riwayat Asisten. Sebabnya `<Panel padat>` menyetel padding
# badan jadi NOL sementara kepalanya tetap 16px — baris yang memberi dirinya
# padding lebih kecil membuat isi terlihat menepi.
#
# Penjaganya sendiri sudah salah sekali sebelum sempat dipakai: versi pertama
# menghitung SEMUA `padding` dan menemukan 189, sebagian besar padding TOMBOL
# dan SEL TABEL yang memang benar kecil. Penjaga yang memerahkan hal yang bukan
# cacat akan dimatikan orang — dan setelah dimatikan ia tak menjaga apa pun.
# Setelah disaring ke baris daftar saja (padding-Y >= 10px): 28, lalu dilunasi
# jadi 0.
set -u
cd "$(dirname "$0")/.." || exit 1

PENJAGA=scripts/uji-baris-tak-mepet.mjs
KORBAN="app/(dashboard)/otomasi/alur/page.tsx"
gagal=0

coba() { # $1 nama, $2 berkas, $3 dari, $4 jadi
  local nama="$1" f="$2"
  cp "$f" "$f.bak"
  python - "$f" "$3" "$4" <<'PY'
import io, sys
p, dari, jadi = sys.argv[1], sys.argv[2], sys.argv[3]
s = io.open(p, encoding='utf-8').read()
if dari not in s:
    sys.exit(3)
io.open(p, 'wb').write(s.replace(dari, jadi, 1).encode('utf-8'))
PY
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

echo "── bukti mutasi: uji-baris-tak-mepet ──"

# M-1 — baris daftar dikembalikan jadi mepet (persis cacat yang ditunjuk founder).
coba "M-1 baris daftar jadi 14px" "$KORBAN" \
  'padding: "14px var(--pad-kartu-lega)",' \
  'padding: "14px 14px",'

# M-2 — padding TOMBOL dikecilkan. Ini TIDAK boleh merah: tombol memang kecil,
#       dan penjaga yang ikut memerahkannya akan dimatikan orang.
echo "── M-2 apakah penjaga MENGABAIKAN tombol (seharusnya ya) ──"
cp "$KORBAN" "$KORBAN.bak"
python - "$KORBAN" <<'PY'
import io, sys
p = sys.argv[1]
s = io.open(p, encoding='utf-8').read()
io.open(p, 'wb').write(s.replace('padding: "6px 11px", borderRadius: 8,',
                                 'padding: "6px 4px", borderRadius: 8,', 1).encode('utf-8'))
PY
if node "$PENJAGA" >/dev/null 2>&1; then
  echo "  M-2: ✅ HIJAU (benar — tombol diabaikan, penjaga tak cerewet)"
else
  echo "  M-2: ❌ MERAH untuk padding tombol — penjaga akan dimatikan orang"
  gagal=$((gagal + 1))
fi
mv "$KORBAN.bak" "$KORBAN"

echo "── pulih? ──"
if node "$PENJAGA" >/dev/null 2>&1; then
  echo "  ✅ HIJAU kembali"
else
  echo "  ❌ TIDAK PULIH — berkas tertinggal termutasi!"
  gagal=$((gagal + 1))
fi

[ "$gagal" -eq 0 ] || exit 1
