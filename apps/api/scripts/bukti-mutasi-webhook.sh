#!/usr/bin/env bash
# ============================================================================
# BUKTI MUTASI — `audit-webhook-bergerbang.mjs` benar-benar bisa MERAH.
# ============================================================================
#
# Penjaga yang tak pernah merah adalah hiasan (CLAUDE.md §8a.2). G-3 di penjaga
# ini SEMPAT dilonggarkan setelah temuan palsu (ia merah karena baris `import`,
# bukan karena urutan gerbang), dan pelonggaran itu justru yang paling perlu
# dibuktikan: yang dilonggarkan bisa saja jadi buta seluruhnya.
#
# Tiap mutasi menyuntik SATU pelanggaran nyata, menuntut MERAH, lalu memulihkan.
# Dijalankan sebagai BERKAS, bukan one-liner: satu baris shell panjang di repo
# ini pernah gagal senyap karena CRLF dan pengutipan.
set -u
cd "$(dirname "$0")/.." || exit 1

W=src/routes/v1/wa-webhook.ts
PENJAGA=scripts/audit-webhook-bergerbang.mjs
gagal=0

coba() { # $1 nama, $2 dari, $3 jadi
  local nama="$1" dari="$2" jadi="$3"
  cp "$W" "$W.bak"
  python - "$W" "$dari" "$jadi" <<'PY'
import io, sys
p, dari, jadi = sys.argv[1], sys.argv[2], sys.argv[3]
s = io.open(p, encoding='utf-8').read()
if dari not in s:
    sys.exit(3)
io.open(p, 'w', encoding='utf-8', newline='').write(s.replace(dari, jadi, 1))
PY
  if [ $? -eq 3 ]; then
    echo "  $nama: ❌ mutasi TIDAK MENDARAT (pola berubah — perbarui bukti ini)"
    gagal=$((gagal + 1)); mv "$W.bak" "$W"; return
  fi
  if node "$PENJAGA" >/dev/null 2>&1; then
    echo "  $nama: ❌ HIJAU padahal dilanggar — penjaga BUTA"
    gagal=$((gagal + 1))
  else
    echo "  $nama: ✅ MERAH (benar)"
  fi
  mv "$W.bak" "$W"
}

echo "── bukti mutasi: audit-webhook-bergerbang ──"

# G-2 — perbandingan rahasia yang bocor lewat waktu.
coba "G-2 samaAman diganti ===" \
  "      if (!samaAman(dikirim, rahasia)) {" \
  "      if (dikirim === rahasia ? false : true) {"

# G-3 — basis disentuh SEBELUM rahasia diperiksa.
#       Klaim dedup dipindah ke atas gerbang rahasia. Inilah mutasi yang
#       membuktikan pelonggaran G-3 tidak membutakannya.
coba "G-3 dedup dipindah ke ATAS gerbang rahasia" \
  "      const rahasia = process.env.WA_WEBHOOK_SECRET?.trim() || null" \
  "      await klaimPesanMasuk(supabase, 'x', 'y')
      const rahasia = process.env.WA_WEBHOOK_SECRET?.trim() || null"

# G-4 — model dipanggil tanpa inti bersama (melewati saklar mati + biaya).
coba "G-4 jalankanGiliranAi dilewati" \
  "await jalankanGiliranAi({" \
  "await jalankanLoop({"

# G-5 — percobaan nomor asing tak dicatat (C-9 hilang).
coba "G-5 catatAksesDitolak dihapus dari jalur tolak" \
  "        await catatAksesDitolak(supabase, pesan.dari, sesi.alasan)" \
  "        // (dihapus untuk uji mutasi)"

echo "── pulih? ──"
if node "$PENJAGA" >/dev/null 2>&1; then
  echo "  ✅ HIJAU kembali"
else
  echo "  ❌ TIDAK PULIH — berkas tertinggal termutasi!"
  gagal=$((gagal + 1))
fi

[ "$gagal" -eq 0 ] || exit 1
