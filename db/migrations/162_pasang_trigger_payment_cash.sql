-- ============================================================
-- PURALOKA SUITE — Migration 162
-- Pasang trigger `trg_update_cash_balance_on_payment` yang HILANG.
-- ============================================================
--
-- ── Cacat yang sama dengan migrasi 161, tabel berbeda
--
-- `fn_update_cash_balance_on_payment()` ADA di database (diverifikasi ke
-- `pg_proc`, 2026-08-02) tapi TRIGGER-nya TIDAK. Jadi pembayaran klien yang
-- dicatat masuk ke akun kas tertentu tak pernah MENAMBAH saldo akun itu.
--
-- Migrasi `019_payments_cash_account.sql` memuat `CREATE TRIGGER`-nya dengan
-- nama `trg_update_cash_balance_on_payment`. Kenapa ia tak ada di dev tak bisa
-- dipastikan — repo ini baru punya `schema_migrations` belakangan, jadi riwayat
-- sebelum itu tak terekam.
--
-- ── Nama trigger: SAMA PERSIS dengan 019, dan itu disengaja
--
-- Versi pertama migrasi ini memakai nama sendiri (`trg_update_cash_balance_on_payment`).
-- Test alur uang menangkapnya di database bersih: dengan 019 DAN 162 keduanya
-- dijalankan, DUA trigger terpasang pada tabel yang sama memanggil fungsi yang
-- sama — setiap pembayaran menambah saldo DUA KALI.
--
-- Di dev cacat itu tak terlihat (hanya 162 yang pernah jalan, jadi hanya satu
-- trigger di sana). Ia baru menggigit di database yang dibangun ulang dari nol
-- — persis yang dilakukan CI, dan persis yang akan dilakukan environment
-- produksi pertama.
--
-- Memakai nama yang sama membuat `DROP TRIGGER IF EXISTS` di bawah benar-benar
-- menggantikan yang dari 019, bukan menumpuk di sebelahnya.
--
-- ── ⚠️ Ada DAMPAK NYATA di sini, berbeda dari 161
--
-- Migrasi 161 menyentuh `project_expenses` yang NOL BARIS — cacatnya belum
-- menggigit. Yang ini tidak: `payments` punya 23 baris, **5 di antaranya**
-- ber-`cash_account_id` dengan total **Rp 627.075.000** yang seharusnya sudah
-- menambah saldo tapi tidak.
--
--   Kas Kolektor Ayah : saldo Rp  50.095.000 · tak terhitung Rp 598.005.000
--   Kas Utama Nizar   : saldo Rp 447.405.000 · tak terhitung Rp  29.070.000
--
-- ── Yang migrasi ini LAKUKAN dan TIDAK lakukan
--
-- LAKUKAN  : memasang trigger, sehingga pembayaran BERIKUTNYA menambah saldo.
-- TIDAK    : menyentuh saldo yang sudah ada.
--
-- `AFTER INSERT/UPDATE/DELETE` hanya bereaksi pada perubahan baru — lima baris
-- lama tak tersentuh, dan saldo sebelum & sesudah migrasi ini identik.
--
-- Koreksi retroaktif SENGAJA tidak dilakukan di sini. Menambahkan Rp 627 juta
-- ke saldo adalah keputusan akuntansi, bukan perbaikan teknis: angkanya harus
-- dicocokkan dengan rekening bank sungguhan lebih dulu, dan mungkin sebagian
-- pembayaran itu memang sudah tercatat lewat jalur lain (transfer manual).
-- Menebaknya dari sini akan menghasilkan saldo yang salah dengan cara baru.
--
-- Dicatat di STATUS.md sebagai keputusan terbuka menunggu founder.
-- ============================================================

DROP TRIGGER IF EXISTS trg_update_cash_balance_on_payment ON payments;

CREATE TRIGGER trg_update_cash_balance_on_payment
  AFTER INSERT OR UPDATE OR DELETE ON payments
  FOR EACH ROW EXECUTE FUNCTION fn_update_cash_balance_on_payment();

COMMENT ON TRIGGER trg_update_cash_balance_on_payment ON payments IS
  'Tambah/kurangi saldo cash_accounts saat pembayaran klien dicatat, diubah, '
  'atau dihapus. Dipasang ulang di migrasi 162: fungsinya ada tapi trigger-nya '
  'hilang, sehingga pembayaran tak pernah menambah saldo kas.';

-- ── Verifikasi: trigger benar-benar terpasang ────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE NOT tgisinternal
      AND tgname = 'trg_update_cash_balance_on_payment'
      AND tgrelid = 'payments'::regclass
  ) THEN
    RAISE EXCEPTION 'trg_update_cash_balance_on_payment TIDAK terpasang sesudah migrasi 162';
  END IF;
END $$;
