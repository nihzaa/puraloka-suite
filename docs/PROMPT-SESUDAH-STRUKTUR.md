# Prompt untuk sesi `struktur` — dipakai SESUDAH pekerjaannya tuntas

> Ditulis 2026-08-19 atas permintaan founder: *"saya minta prompt-nya aja
> harus diapakan setelah di sana tuntas"*.
>
> Salin blok di bawah apa adanya ke sesi yang mengerjakan
> `feat/struktur-analisa`.

---

## Kenapa prompt ini ada

Cabang `feat/struktur-analisa` mengerjakan modul analisa struktur baja, dan
selama ia berjalan **dua penjaga CI di direktori utama MERAH** — bukan karena
rusak, melainkan karena bekerja sebagaimana dirancang:

```
audit-nav-yatim         ❌ LINK MATI: /estimasi/struktur  (sidebar/DB)
audit-peta-menu-vs-db   ❌ hanyaDb naik 124 -> 125
```

Menu `cc-struktur` sudah masuk basis, halamannya masih di cabang lain. Siapa
pun yang mengkliknya sekarang mendapat 404.

⚠ **Kedua penjaga itu JANGAN "diperbaiki" dengan menghapus entri menunya.**
Keduanya akan hijau sendiri begitu cabang ini masuk.

---

## Prompt (salin dari sini)

```
Pekerjaan struktur di cabang ini sudah tuntas. Sekarang gabungkan ke cabang
utama `feat/sumbu-ui-roadmap` dan pastikan tak ada yang rusak.

Yang WAJIB dilakukan, berurutan:

1. UKUR keadaan awal di cabang ini, jangan percaya ingatan:
     cd apps/api && npx tsc --noEmit
     cd apps/web && npx tsc --noEmit
     cd apps/api && npx vitest run          # tempel ringkasannya
     node apps/api/scripts/jalankan-semua-penjaga.mjs   # catat jumlah merah

2. Cabang utama sudah JAUH bergerak sejak cabang ini bercabang. Yang berubah
   dan berpotensi bentrok:

     - migrasi 461-465 (tabel `mitra`, izin, menu, klausul per jenis dokumen)
     - `apps/web/lib/peta-menu.ts` — banyak entri disunting; ini yang paling
       mungkin bentrok, dan bentroknya berupa SATU BARIS SANGAT PANJANG
     - `apps/api/src/utils/email.ts` — kunci Resend jadi per-tenant
     - `apps/api/src/lib/klausul-kontrak.ts` — ada `gabungKlausulJenis` baru
     - `apps/web/components/layar-kosong.tsx` — DIPINDAH dari
       `app/(dashboard)/estimasi/_bersama/layar-kosong.tsx`

   Kalau ada konflik di `peta-menu.ts`, JANGAN pilih salah satu sisi begitu
   saja: kedua sisi menambah entri yang berbeda, dan memilih satu sisi akan
   MENGHAPUS entri sisi lain tanpa satu pun galat. Gabungkan keduanya, lalu
   buktikan dengan:
     node -e "const s=require('fs').readFileSync('apps/web/lib/peta-menu.ts','utf8');const c={};for(const m of s.matchAll(/status: '(\w+)'/g))c[m[1]]=(c[m[1]]||0)+1;console.log(c)"
   Angkanya harus >= 228 hidup / 5 sebagian DITAMBAH entri struktur.

3. Nomor migrasi: cabang utama sudah memakai sampai 465. Kalau cabang ini
   punya migrasi bernomor <= 465, RENOMORI ke 466 dst. Dua migrasi bernomor
   sama membuat salah satunya dilewati senyap selamanya.
   Periksa: node scripts/db/ledger-diff.mjs

4. Sesudah merge, jalankan SEMUA penjaga — bukan yang "kira-kira relevan":
     node apps/api/scripts/jalankan-semua-penjaga.mjs

   Dua penjaga ini HARUS jadi hijau (mereka merah HANYA karena cabang ini
   belum masuk):
     audit-nav-yatim         (/estimasi/struktur 404)
     audit-peta-menu-vs-db   (hanyaDb 124 -> 125)

   Kalau keduanya masih merah sesudah merge, artinya halaman
   `/estimasi/struktur` belum ikut terbawa — periksa, jangan diamkan.

5. Jangan menaikkan ambang penjaga mana pun untuk membuat CI hijau. Kalau
   sebuah ratchet naik, cari sebabnya di kode yang baru masuk. Melemahkan
   penjaga adalah Gerbang Keras G-5 dan butuh ratifikasi founder.

6. Jalankan suite penuh SENDIRIAN sesudah merge — jangan berbarengan dengan
   proses vitest lain. Diukur 2026-08-19: dua suite yang tumpang tindih
   menghasilkan selisih 16 kegagalan pada kode yang SAMA PERSIS, karena
   fixture saling menggeser lewat basis yang sama.

7. Perbarui dokumennya di commit yang sama:
     - `apps/web/lib/peta-menu.ts` (status entri struktur)
     - `docs/execution/JOURNAL.md`
     - `docs/INDEKS-DOKUMEN.md` (node apps/api/scripts/gen-indeks-docs.mjs)

Lapor dengan ANGKA, bukan kesan: berapa test lulus/gagal sebelum dan sesudah
merge, berapa penjaga merah sebelum dan sesudah, dan berkas apa saja yang
konflik beserta cara menyelesaikannya.
```

---

## Sesudah merge selesai — yang tersisa di seluruh repo

Diukur 2026-08-19 di cabang utama:

| Hal | Keadaan |
|---|---|
| Peta Modul | 228 hidup / 5 sebagian |
| Pekerjaan kode | **habis** — kelima sisa menunggu di luar kode |
| Penjaga merah | 31 (dari 33 di awal sesi) |

Kelima `sebagian` beserta apa yang menahannya: `docs/PETUNJUK-SISA-SEBAGIAN.md`.
Persiapan deploy: `docs/SIAP-DEPLOY.md`.
