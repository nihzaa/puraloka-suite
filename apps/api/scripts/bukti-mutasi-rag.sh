#!/usr/bin/env bash
# ============================================================================
# BUKTI MUTASI — `audit-rag-tenancy.mjs` benar-benar bisa MERAH.
# ============================================================================
#
# Sesi 2026-08-10 sudah menemukan TIGA penjaga hijau-karena-buta (G-5, E-6, dan
# test isolasi RAG itu sendiri). Dua di antaranya saya tulis beberapa menit
# sebelum mengulangi kesalahan yang sama. Membaca ulang tak menemukannya;
# hanya mutasi yang menemukannya.
#
# R-5 di penjaga ini SEMPAT salah kalibrasi (menuntut ≥2 kemunculan padahal
# definisinya `terapkanAcl<T>(` tak cocok dengan regex-nya), lalu dilonggarkan.
# Yang dilonggarkan justru yang paling perlu dibuktikan.
set -u
cd "$(dirname "$0")/.." || exit 1

CARI=src/lib/rag-cari.ts
ACL=src/lib/rag-acl.ts
PENJAGA=scripts/audit-rag-tenancy.mjs
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
io.open(p, 'w', encoding='utf-8', newline='').write(s.replace(dari, jadi, 1))
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

echo "── bukti mutasi: audit-rag-tenancy ──"

# R-1 — company_id dicabut dari saringan. Kebocoran T-2 dalam bentuk termurni:
#       pencarian tetap bekerja, hasilnya tetap masuk akal, tenantnya salah.
coba "R-1 company_id dicabut dari WHERE" "$CARI" \
  "  let x = (q as { eq: (k: string, v: unknown) => T }).eq('company_id', companyId)" \
  "  let x = q as T"

# R-2 — T-5 dilanggar: file_url ikut diambil.
coba "R-2 file_url masuk kolom yang dibaca" "$CARI" \
  "const KOLOM = 'id, document_id, doc_type, urutan, isi, documents(title)'" \
  "const KOLOM = 'id, document_id, doc_type, urutan, isi, file_url, documents(title)'"

# R-3 — ACL kembali ke literal peran (ADR-004), persis cacat documents.ts.
coba "R-3 ACL memakai literal nama peran" "$ACL" \
  "  if (izin.has('documents:manage')) {" \
  "  const peran = 'admin'
  if (peran === 'admin') {"

# R-5 — saringan tak lagi dipanggil; tiap jalur menyaring sendiri-sendiri.
coba "R-5 terapkanAcl tak dipanggil" "$CARI" \
  "    const q = terapkanAcl(" \
  "    const q = ((x: unknown) => x)("

echo "── R-4 (SQL): fungsi dimutasi di BASIS, bukan di berkas ──"
# R-4 membaca migrasi, jadi mutasinya menyunting berkas migrasi terakhir yang
# mendefinisikan fungsinya.
M=../../db/migrations/265_rag_cari_vektor_tenant_nyata.sql
cp "$M" "$M.bak"
python - "$M" <<'PY'
import io, sys
p = sys.argv[1]
s = io.open(p, encoding='utf-8').read()
# Cabut bukti keanggotaan dari BADAN fungsi.
s = s.replace("""  IF NOT EXISTS (
    SELECT 1 FROM company_members cm
     WHERE cm.company_id = p_company
       AND cm.user_id = p_user
       AND cm.is_active
  ) THEN
    RETURN;
  END IF;""", "  -- MUTASI: bukti keanggotaan dicabut", 1)
io.open(p, 'w', encoding='utf-8', newline='').write(s)
PY
if node "$PENJAGA" >/dev/null 2>&1; then
  echo "  R-4 bukti keanggotaan dicabut: ❌ HIJAU padahal dilanggar — penjaga BUTA"
  gagal=$((gagal + 1))
else
  echo "  R-4 bukti keanggotaan dicabut: ✅ MERAH (benar)"
fi
mv "$M.bak" "$M"

echo "── pulih? ──"
if node "$PENJAGA" >/dev/null 2>&1; then
  echo "  ✅ HIJAU kembali"
else
  echo "  ❌ TIDAK PULIH — berkas tertinggal termutasi!"
  gagal=$((gagal + 1))
fi

[ "$gagal" -eq 0 ] || exit 1
