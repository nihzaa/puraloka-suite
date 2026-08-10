#!/usr/bin/env bash
# ============================================================================
# BUKTI MUTASI — `uji-kosong-seragam.mjs` bisa MERAH, dan tidak cerewet.
# ============================================================================
#
# Dua arah diuji, karena penjaga yang cuma bisa merah belum tentu berguna:
#
#   K-1  keadaan kosong BARU yang digambar sendiri  → harus MERAH
#   K-2  teks "Belum ada" di luar cabang data-nol   → harus HIJAU
#
# Arah kedua yang paling sering terlewat. Versi pertama penjaga "mepet"
# menghitung padding tombol dan menemukan 189 pelanggaran — sebagian besar
# bukan cacat. Penjaga cerewet akan dimatikan orang, dan setelah dimatikan ia
# tak menjaga apa pun.
set -u
cd "$(dirname "$0")/.." || exit 1

PENJAGA=scripts/uji-kosong-seragam.mjs
KORBAN="app/(dashboard)/otomasi/alur/page.tsx"
gagal=0

echo "── bukti mutasi: uji-kosong-seragam ──"

# ── K-1: keadaan kosong baru, digambar sendiri ──────────────────────────────
cp "$KORBAN" "$KORBAN.bak"
python - "$KORBAN" <<'PY'
import io, sys
p = sys.argv[1]
s = io.open(p, encoding='utf-8').read()
jangkar = '      <Panel judul={bagian === "monitor" ? "Perlu perhatian" : "Katalog alur"} padat>'
sisip = '''      {terurut.length === 0 && (
        <div style={{ padding: 40, textAlign: "center" }}>
          <p>Belum ada data</p>
        </div>
      )}
'''
assert jangkar in s, 'jangkar tak ketemu'
io.open(p, 'wb').write(s.replace(jangkar, sisip + jangkar, 1).encode('utf-8'))
PY
if node "$PENJAGA" >/dev/null 2>&1; then
  echo "  K-1 keadaan kosong digambar sendiri: ❌ HIJAU padahal dilanggar — BUTA"
  gagal=$((gagal + 1))
else
  echo "  K-1 keadaan kosong digambar sendiri: ✅ MERAH (benar)"
fi
mv "$KORBAN.bak" "$KORBAN"

# ── K-2: "Belum ada" DI LUAR cabang data-nol (mis. teks sel tabel) ──────────
cp "$KORBAN" "$KORBAN.bak"
python - "$KORBAN" <<'PY'
import io, sys
p = sys.argv[1]
s = io.open(p, encoding='utf-8').read()
jangkar = '                        {j.pesan ?? "—"}'
assert jangkar in s, 'jangkar sel tabel tak ketemu'
io.open(p, 'wb').write(s.replace(jangkar, '                        {j.pesan ?? "Tidak ada catatan"}', 1).encode('utf-8'))
PY
if node "$PENJAGA" >/dev/null 2>&1; then
  echo "  K-2 teks sel tabel diabaikan: ✅ HIJAU (benar — penjaga tak cerewet)"
else
  echo "  K-2 teks sel tabel diabaikan: ❌ MERAH untuk yang bukan cacat"
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
