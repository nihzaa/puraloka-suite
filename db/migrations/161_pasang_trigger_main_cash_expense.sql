-- ============================================================
-- PURALOKA SUITE — Migration 161
-- Pasang trigger `trg_update_main_cash_on_expense` yang HILANG.
-- ============================================================
--
-- ── Apa yang salah
--
-- Fungsi `fn_update_main_cash_on_expense()` ADA di database (diverifikasi ke
-- `pg_proc` lewat koneksi baru, 2026-08-02) — tapi TRIGGER yang memanggilnya
-- TIDAK ADA. Jadi ia tak pernah dieksekusi sekali pun.
--
-- Akibatnya: pengeluaran proyek dari KAS UTAMA (`expense_source='main_cash'`)
-- yang di-approve TIDAK mengurangi `cash_accounts.balance`. Saldo kas utama
-- akan terus menampilkan angka yang lebih besar daripada uang yang benar-benar
-- ada — dan tak ada gejala apa pun: request tetap 200, pengeluaran tercatat,
-- laporan terbit.
--
-- Kembarannya untuk kas kecil (`trg_expense_petty_cash_balance`, migrasi 016)
-- terpasang normal. Jadi separuh jalur bekerja dan separuh tidak, yang lebih
-- menyesatkan daripada kalau keduanya mati: orang melihat saldo petty cash
-- berkurang dengan benar, lalu menyimpulkan mekanismenya berfungsi.
--
-- ── Kenapa belum menimbulkan kerugian
--
-- `project_expenses` masih NOL BARIS (diverifikasi 2026-08-02). Cacatnya belum
-- menggigit karena fiturnya belum dipakai operasional — bukan karena ia tidak
-- berbahaya. Begitu pengeluaran pertama dari kas utama disetujui, selisihnya
-- mulai menumpuk tanpa jejak.
--
-- ── Kenapa migrasi 025 tidak cukup
--
-- Migrasi `025_fix_main_cash_expense_trigger.sql` MEMANG memuat
-- `CREATE TRIGGER`-nya. Yang tidak bisa dipastikan: apakah ia pernah
-- dijalankan penuh di database dev, karena repo ini tak punya tabel pencatat
-- migrasi (diverifikasi: tak ada `schema_migrations` maupun sejenisnya).
--
-- Migrasi ini idempoten — aman dijalankan berapa kali pun, dan aman meski 025
-- ternyata sudah pernah membuatnya.
--
-- ── Dampak ke data yang sudah ada: NOL
--
-- Trigger `AFTER INSERT OR UPDATE` hanya bereaksi pada baris BARU. Ia tak
-- menyentuh, menghitung ulang, atau memperbaiki apa pun yang sudah tersimpan.
-- Saldo kas utama sebelum & sesudah migrasi ini identik.
-- ============================================================

DROP TRIGGER IF EXISTS trg_update_main_cash_on_expense ON project_expenses;

CREATE TRIGGER trg_update_main_cash_on_expense
  AFTER INSERT OR UPDATE OF status ON project_expenses
  FOR EACH ROW EXECUTE FUNCTION fn_update_main_cash_on_expense();

COMMENT ON TRIGGER trg_update_main_cash_on_expense ON project_expenses IS
  'Kurangi/kembalikan saldo cash_accounts saat pengeluaran main_cash '
  'di-approve/di-reject. Dipasang ulang di migrasi 161: fungsinya ada tapi '
  'trigger-nya hilang, sehingga jalur kas utama tak pernah memotong saldo.';

-- ── Verifikasi: trigger benar-benar terpasang ────────────────────────────────
-- Gagal keras kalau tidak — migrasi yang "berhasil" tanpa efek adalah persis
-- kelas cacat yang migrasi ini perbaiki.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE NOT tgisinternal
      AND tgname = 'trg_update_main_cash_on_expense'
      AND tgrelid = 'project_expenses'::regclass
  ) THEN
    RAISE EXCEPTION 'trg_update_main_cash_on_expense TIDAK terpasang sesudah migrasi 161';
  END IF;
END $$;
