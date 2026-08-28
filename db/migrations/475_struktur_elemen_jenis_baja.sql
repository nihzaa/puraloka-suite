-- ════════════════════════════════════════════════════════════════════════════
-- 463 — Jenis elemen struktur BAJA ditambahkan ke CHECK constraint
-- ════════════════════════════════════════════════════════════════════════════
--
-- Migrasi 458 membatasi `jenis` ke tujuh elemen BETON. Sejak itu delapan modul
-- analisa baja dibangun (balok, kolom, sambungan baut, sambungan las, base
-- plate, angkur, rangka batang, gording/bracing/interaksi) — dan tak satu pun
-- bisa disimpan, karena CHECK-nya menolak.
--
-- Akibatnya seluruh modul baja berhenti di lapisan perhitungan: ia lulus 572
-- test, tetapi tak seorang pun bisa memakainya lewat aplikasi.
--
-- ── Kenapa CHECK, bukan tabel referensi
--
-- Daftar jenis elemen adalah KONTRAK KODE, bukan data konfigurasi: tiap jenis
-- menunjuk fungsi analisa yang berbeda di `lib/struktur-*.ts`. Menaruhnya di
-- tabel yang bisa disunting UI akan mengundang jenis karangan yang tak punya
-- fungsi analisanya — dan itu baris yang meledak saat dibuka, bukan galat yang
-- menunjuk sebabnya.
--
-- Dijaga dua arah: CHECK di basis, dan konstanta `JENIS` di
-- `routes/v1/struktur.ts` yang harus memuat daftar yang sama.
--
-- ── Penamaan
--
-- Berawalan `baja_` supaya jelas terpisah dari elemen beton, dan supaya
-- penyaringan "tampilkan hanya elemen baja" bisa dilakukan tanpa daftar yang
-- harus diperbarui tiap ada jenis baru.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE struktur_elemen DROP CONSTRAINT IF EXISTS struktur_elemen_jenis_check;

ALTER TABLE struktur_elemen ADD CONSTRAINT struktur_elemen_jenis_check
  CHECK (jenis = ANY (ARRAY[
    -- Beton (migrasi 458)
    'balok', 'kolom', 'kolom_bulat', 'plat', 'footplat', 'pilecap', 'tiang',
    -- Baja (migrasi 463)
    'baja_balok', 'baja_kolom', 'baja_gording', 'baja_bracing',
    'baja_rangka', 'baja_base_plate', 'baja_angkur',
    'baja_sambungan_baut', 'baja_sambungan_las', 'baja_interaksi'
  ]));

-- ─── Verifikasi ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_id uuid;
  v_proyek uuid;
  v_company uuid;
  v_gagal INT := 0;
  v_jenis TEXT;
BEGIN
  SELECT p.id, p.company_id INTO v_proyek, v_company
    FROM projects p WHERE p.company_id IS NOT NULL LIMIT 1;

  IF v_proyek IS NULL THEN
    RAISE NOTICE '463 — tak ada proyek untuk diuji, verifikasi bentuk dilewati';
    RETURN;
  END IF;

  /*
    Tiap jenis baja DICOBA SIMPAN sungguhan.

    Membaca definisi CHECK dengan regex akan lulus meski constraint-nya tak
    berlaku (mis. salah nama tabel). Menyimpan baris nyata membuktikan bahwa
    basis benar-benar menerimanya — dan itulah yang menentukan apakah rute
    bisa memakainya.
  */
  FOREACH v_jenis IN ARRAY ARRAY[
    'baja_balok', 'baja_kolom', 'baja_gording', 'baja_bracing',
    'baja_rangka', 'baja_base_plate', 'baja_angkur',
    'baja_sambungan_baut', 'baja_sambungan_las', 'baja_interaksi'
  ] LOOP
    BEGIN
      INSERT INTO struktur_elemen
        (company_id, project_id, kode, jenis, jumlah, input)
      VALUES
        (v_company, v_proyek, '[MIG-463] ' || v_jenis, v_jenis, 1, '{}'::jsonb)
      RETURNING id INTO v_id;
      DELETE FROM struktur_elemen WHERE id = v_id;
    EXCEPTION WHEN check_violation THEN
      v_gagal := v_gagal + 1;
      RAISE NOTICE '463 — jenis % DITOLAK basis', v_jenis;
    END;
  END LOOP;

  IF v_gagal > 0 THEN
    RAISE EXCEPTION '463 GAGAL: % jenis baja masih ditolak CHECK constraint', v_gagal;
  END IF;

  -- Dan jenis karangan HARUS tetap ditolak — CHECK yang menerima apa pun
  -- sama saja dengan tak ada CHECK.
  BEGIN
    INSERT INTO struktur_elemen
      (company_id, project_id, kode, jenis, jumlah, input)
    VALUES
      (v_company, v_proyek, '[MIG-463] ngawur', 'jenis_karangan', 1, '{}'::jsonb)
    RETURNING id INTO v_id;
    DELETE FROM struktur_elemen WHERE id = v_id;
    RAISE EXCEPTION '463 GAGAL: jenis karangan DITERIMA — CHECK tak menjaga apa pun';
  EXCEPTION WHEN check_violation THEN
    NULL;   -- ditolak, sesuai harapan
  END;

  RAISE NOTICE '463 OK — 10 jenis baja diterima, jenis karangan tetap ditolak';
END $$;
