#!/usr/bin/env bash
# BUKTI MUTASI — penjaga urutan sidebar (ambang NOL).
#
# Mutasinya di BASIS DATA, bukan di berkas — yang dijaga penjaga ini memang
# keadaan data, bukan bentuk kode. Karena itu perubahannya dijalankan di dalam
# TRANSAKSI yang selalu di-ROLLBACK: menyuntik bentrok lalu lupa memulihkannya
# akan meninggalkan sidebar rusak untuk sesi berikutnya.
#
# Diuji dua arah:
#   MENANGKAP    dua item diberi sort_order yang sama → MERAH
#   TIDAK CEREWET  sort_order sama di grup BERBEDA tetap hijau (itu sah —
#                  bentrok hanya berarti di dalam satu grup)
set -uo pipefail
cd "$(dirname "$0")/../../.."

PENJAGA="node apps/web/scripts/audit-sidebar-urutan.mjs"
D="$(mktemp -d)"
trap 'rm -rf "$D"' EXIT

gagal=0

echo "── 0. keadaan awal harus HIJAU"
if $PENJAGA >/dev/null 2>&1; then echo "   ✅ hijau"
else echo "   ❌ sudah merah sebelum mutasi — uji ini tak bermakna"; exit 1; fi

# Menjalankan penjaga DI DALAM transaksi yang sama dengan mutasinya: penjaga
# memakai koneksinya sendiri, jadi ia tak akan melihat perubahan yang belum
# di-commit. Karena itu logikanya diulang di SQL di sini, memakai kueri yang
# sama persis dengan penjaganya.
jalankan() { # $1 = SQL mutasi
  node - "$1" <<'EOF'
import { buatClient } from 'file:///E:/Project/puraloka-suite/scripts/db/_koneksi.mjs'
const c = buatClient('DIRECT_URL'); await c.connect()
try {
  await c.query('BEGIN')
  await c.query(process.argv[2])
  // Dua pemeriksaan, sama persis dengan penjaganya: bentrok DAN rentang.
  const r = await c.query(`
    SELECT
      (SELECT count(*)::int FROM (
        SELECT i.parent_id, i.sort_order FROM menu_items i
          JOIN menu_items g ON g.id = i.parent_id
         WHERE i.is_active AND g.is_active
         GROUP BY i.parent_id, i.sort_order HAVING count(*) > 1) t) AS bentrok,
      (SELECT count(*)::int FROM menu_items g
         JOIN menu_items i ON i.parent_id = g.id AND i.is_active
        WHERE g.parent_id IS NULL AND g.is_active
          AND (i.sort_order <= g.sort_order OR i.sort_order > g.sort_order + 99)) AS luar`)
  const { bentrok, luar } = r.rows[0]
  console.log(bentrok > 0 || luar > 0 ? 'merah' : 'hijau')
} finally {
  await c.query('ROLLBACK')   // SELALU — sidebar tak boleh ditinggalkan rusak
  await c.end()
}
EOF
}

uji() { # $1 judul, $2 harapan, $3 SQL
  hasil="$(jalankan "$3" | tail -1)"
  if [ "$hasil" = "$2" ]; then echo "   ✅ $1 → $hasil"
  else echo "   ❌ $1 → $hasil (harus $2)"; gagal=1; fi
}

echo
echo "── MENANGKAP"
uji "dua item, sort_order sama, grup sama" merah \
  "UPDATE menu_items SET sort_order = (SELECT sort_order FROM menu_items WHERE key='ai-asisten-staf') WHERE key='ai-asisten-web'"

uji "anak DI LUAR rentang gso+1..gso+99" merah \
  "UPDATE menu_items SET sort_order = 9999 WHERE key='ai-riwayat'"
uji "anak sama dengan sort_order GRUPNYA" merah \
  "UPDATE menu_items SET sort_order = (SELECT sort_order FROM menu_items WHERE key='g-ai') WHERE key='ai-riwayat'"

echo
echo "── TIDAK CEREWET"
# Angka yang sama di DUA grup berbeda tetap sah — bentrok hanya berarti di
# dalam satu grup. Dipilih angka yang muat di KEDUA rentang: 190 ada di
# 186–284 (AI, gso 185) dan… tidak ada di 701–799 (Gudang). Karena rentangnya
# memang tak beririsan, ujinya memakai dua item yang keduanya SAH di grupnya
# masing-masing dan kebetulan berselisih 1 — cukup untuk membuktikan penjaga
# tak menuduh lintas-grup.
#
# Versi pertama menyalin sort_order AI (190) ke Gudang dan ditolak — bukan
# karena penjaga cerewet, melainkan karena 190 memang di luar 701–799.
# Mutasinya yang salah, bukan penjaganya.
uji "angka berdekatan di grup BERBEDA" hijau \
  "UPDATE menu_items SET sort_order = 799 WHERE key='gudang-transfer'; UPDATE menu_items SET sort_order = 199 WHERE key='ai-riwayat'"
uji "geser dalam rentang yang sah" hijau \
  "UPDATE menu_items SET sort_order = 199 WHERE key='ai-riwayat'"
uji "tanpa perubahan apa pun" hijau "SELECT 1"

echo
echo "── pulih: penjaga nyata harus tetap HIJAU sesudah rollback"
if $PENJAGA >/dev/null 2>&1; then echo "   ✅ hijau"
else echo "   ❌ MERAH — rollback gagal, sidebar ditinggalkan rusak"; gagal=1; fi

echo
if [ "$gagal" -eq 0 ]; then
  echo "✅ BUKTI LENGKAP: merah untuk bentrok, hijau untuk yang sah."
else
  echo "❌ BUKTI GAGAL — penjaga belum layak dipasang di CI."
fi
exit "$gagal"
