#!/usr/bin/env bash
# ============================================================================
# BUKTI MUTASI — `audit-otomasi-satu-pintu.mjs` benar-benar bisa MERAH.
# ============================================================================
#
# Sesi 2026-08-10 menemukan LIMA penjaga/test hijau-karena-buta, empat di
# antaranya saya tulis sendiri, dan dua mengulangi kekeliruan yang baru saja
# saya perbaiki beberapa menit sebelumnya. Membaca ulang tak pernah
# menemukannya; hanya mutasi.
#
# Penjaga ini sendiri sudah salah sekali sebelum sempat dipakai: O-1 memakai
# `/N8N_BASE_URL/` polos dan merah di route yang hanya MENYEBUT nama kunci di
# dalam pesan untuk pengguna. Penjaga yang melarang pesan galat menyebut nama
# kunci memaksa pesan jadi kabur — cacat yang lebih mahal daripada yang
# dijaganya.
set -u
cd "$(dirname "$0")/.." || exit 1

PUSTAKA=src/lib/otomasi-n8n.ts
RUTE=src/routes/v1/otomasi-alur.ts
PENJAGA=scripts/audit-otomasi-satu-pintu.mjs
gagal=0

coba() { # $1 nama, $2 berkas, $3 dari, $4 jadi
  local nama="$1" f="$2" dari="$3" jadi="$4"
  cp "$f" "$f.bak"
  python - "$f" "$dari" "$jadi" <<'PY'
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

echo "── bukti mutasi: audit-otomasi-satu-pintu ──"

# O-1 — n8n disentuh langsung dari route, melewati pustaka satu-pintu.
#       Ini cacat yang MEMANG pernah saya buat untuk WhatsApp (W-1), dan
#       ditolak penjaga satu-pintu WA.
coba "O-1 fetch n8n dari route" "$RUTE" \
  "  app.get(" \
  "  app.get(
    '/uji-mutasi',
    async () => { await fetch('https://n8n.contoh.id/webhook/x') },
  )
  app.get("

# O-1b — kredensial n8n dibaca di luar pustaka.
coba "O-1b kredensial n8n dibaca di route" "$RUTE" \
  "function cfgTenant(request: Parameters<typeof ambilKredensial>[0]) {" \
  "async function bocor(r: Parameters<typeof ambilKredensial>[0]) {
  return ambilKredensial(r, 'N8N_BASE_URL')
}
function cfgTenant(request: Parameters<typeof ambilKredensial>[0]) {"

# O-2 — jejak ditulis SESUDAH panggilan (pola "tulis di akhir"). Proses yang
#       mati di tengah lalu tak meninggalkan bukti apa pun.
coba "O-2 jejak awal berstatus sukses" "$PUSTAKA" \
  "      status: 'jalan'," \
  "      status: 'sukses',"

# O-3 — gerbang izin menjalankan diturunkan jadi izin MELIHAT. Yang boleh
#       memeriksa jadi boleh mengirim pesan ke pelanggan.
coba "O-3 gerbang jalankan diturunkan" "$RUTE" \
  "requirePermission('otomasi:alur:jalankan')" \
  "requirePermission('otomasi:alur:lihat')"

echo "── pulih? ──"
if node "$PENJAGA" >/dev/null 2>&1; then
  echo "  ✅ HIJAU kembali"
else
  echo "  ❌ TIDAK PULIH — berkas tertinggal termutasi!"
  gagal=$((gagal + 1))
fi

[ "$gagal" -eq 0 ] || exit 1
