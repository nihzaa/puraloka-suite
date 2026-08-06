-- 203 — arahkan menu `sk-tender` ke halaman nyata
--
-- Sebelum ini `sk-tender` menunjuk `/m/sk-tender`, rute generik "belum
-- dibangun": ia membuka halaman penjelasan, bukan fitur. Backend-nya sudah
-- ada sejak migrasi 201 (tender_subkon + penawaran_subkon, 22 invarian
-- terjaga), yang belum ada hanya layarnya.
--
-- ── Kenapa `/mandor/tender`, bukan `/tender`
--
-- `/tender` sudah dipakai untuk tender PROYEK — kita sebagai peserta,
-- menawar ke pemilik. Yang ini kebalikannya: kita yang MENENDERKAN lingkup
-- kerja ke mandor. Menyatukannya di satu rute akan menggabungkan dua peran
-- yang berlawanan dalam satu layar.
--
-- Rumahnya grup `g-subkon` (Mandor & Subkon), konsisten dengan saudaranya
-- yang sudah punya halaman: `sk-retensi` → /mandor/retensi,
-- `sk-absensi` → /mandor/absensi.
--
-- ── Ikon
--
-- `Dot` adalah penanda "belum digarap" yang dipakai submenu tanpa halaman.
-- Diganti `Gavel` — palu lelang, yang menamai perbuatannya: memilih satu
-- penawaran di antara beberapa.
--
-- ── Permission
--
-- `required_permissions` diisi `projects:view`, sama dengan gerbang rute
-- GET-nya (`requirePermission('projects:view')` di tender-subkon.ts).
-- Membiarkannya `[]` berarti menu tampil untuk peran yang saat diklik hanya
-- mendapat layar kosong — pintu yang terlihat terbuka tapi selalu terkunci.

BEGIN;

UPDATE menu_items
   SET href = '/mandor/tender',
       icon = 'Gavel',
       required_permissions = ARRAY['projects:view'],
       updated_at = now()
 WHERE key = 'sk-tender';

COMMIT;
