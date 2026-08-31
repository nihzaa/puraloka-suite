# Kerja Paralel — dua sesi atau lebih, tanpa saling menimpa

> Ditulis 2026-08-31, sesudah dua sesi bekerja bersamaan di checkout yang sama
> dan saya berhenti di tengah jalan karena berkas asing bermunculan.
>
> **Jawaban singkatnya: paralel BOLEH, dan memang cara yang benar.** Yang
> dilarang cuma dua sesi menulis di DIREKTORI yang sama.

---

## 1. Kenapa berbagi checkout berbahaya

Empat hal rusak diam-diam. Tak satu pun mengeluarkan galat yang menunjuk
sebabnya — semuanya bergejala di tempat lain.

| Yang dilakukan | Yang terjadi |
|---|---|
| `git stash -u` | menyapu berkas belum-ter-commit sesi lain. `pop` menyelamatkannya, tapi menyisakan entri stash dan mengubah akhir baris jadi CRLF |
| `pnpm install` / `--filter` | mengosongkan `node_modules` workspace lain di tengah jalan. `tsc`/`vitest` sesi itu mati dengan "Cannot find package" — galat yang menuduh KODE |
| menulis `JOURNAL.md` | dua konvensi berbeda; yang belakangan menimpa struktur yang pertama |
| **menjalankan suite bersamaan** | test memakai Postgres SUNGGUHAN, satu basis, dan banyak fixture memilih barisnya lewat `LIMIT 1`. Dua run yang menyisip & membersihkan bersamaan saling menggeser fixture |

Yang keempat sudah diukur — dua run suite penuh, **kode yang sama persis**:

```
run 1   5853 lulus /  95 gagal / 32 berkas
run 2   5837 lulus / 111 gagal / 34 berkas
```

Selisih 16 kegagalan, penyebabnya operator, bukan kode.

⚠ `fileParallelism: false` di `vitest.config.ts` TIDAK menolong. Ia
menyerialkan berkas DI DALAM satu run, dan tak bisa berbuat apa pun terhadap
run kedua di proses lain.

**Angka apa pun dari run yang tumpang tindih TIDAK SAH.**

---

## 2. Yang benar: satu worktree per sesi

Repo ini sudah memakainya. `git worktree list` memperlihatkan siapa di mana.

```bash
# Dari akar repo.
git worktree add -b feat/<nama> /e/tmp/<nama>

# ⚠ node_modules pnpm di Windows butuh JUNCTION, bukan symlink.
cmd //c "mklink /J E:\tmp\<nama>\node_modules E:\Project\puraloka-suite\node_modules"
cmd //c "mklink /J E:\tmp\<nama>\apps\api\node_modules E:\Project\puraloka-suite\apps\api\node_modules"

cp apps/api/.env /e/tmp/<nama>/apps/api/.env

# Buktikan hidup SEBELUM dipakai — junction yang salah bergejala sebagai
# "Cannot find package", galat yang menuduh kode.
cd /e/tmp/<nama>/apps/api && npx tsc --noEmit && npx vitest run src/utils/__tests__/<satu>.test.ts
```

Yang TIDAK ikut ke worktree: `.env` (tak ter-commit) dan `node_modules`
(di-junction, bukan disalin — menyalinnya boros belasan GB).

---

## 3. Membersihkan: hapus JUNCTION-nya, JANGAN direktorinya

```bash
rmdir /S /Q E:\tmp\<nama>          # ❌ MENEMBUS junction, menghapus TARGETNYA
```

Perintah itu pernah menghancurkan `node_modules` SUNGGUHAN milik repo:
root tersisa 2 entri, `apps/api/node_modules` KOSONG, satu entri `.pnpm`
tinggal cangkang. Gejalanya `ERR_MODULE_NOT_FOUND` pada `vitest/dist/worker.js`
— galat yang menuduh VITEST.

Lebih buruk: `pnpm install` menjawab **"Already up to date"** dan tak
memperbaiki apa pun, karena `node_modules/.pnpm-workspace-state-v1.json`
selamat.

Yang benar:

```bash
cmd //c "rmdir E:\tmp\<nama>\node_modules"            # ✅ junction SAJA, tanpa /S
cmd //c "rmdir E:\tmp\<nama>\apps\api\node_modules"
cmd //c "dir /AL E:\tmp\<nama>"                       # buktikan nol JUNCTION tersisa
git worktree remove /e/tmp/<nama>                     # baru direktorinya
```

---

## 4. Yang tetap dipakai bersama — dan aturannya

Worktree memisahkan BERKAS. Tiga hal ini tetap satu untuk semua sesi:

| Sumber daya | Aturan |
|---|---|
| **Basis Postgres** | satu basis, dipakai semua worktree. Suite penuh **BERGILIRAN**, jangan tumpang tindih |
| **`node_modules`** | di-junction ke yang sama. Jangan `pnpm install` saat sesi lain jalan |
| **Buku migrasi** | nomor migrasi diambil dari yang sama. **Jalankan `node apps/api/scripts/nomor-migrasi-berikutnya.mjs`** sebelum memilih nomor — ia memindai SELURUH worktree |

⚠ **Nomor migrasi bentrok TIGA KALI dalam satu jam** pada 2026-08-31, semuanya
antar-sesi paralel:

```
535  menu-grup-mati    ↔  535  rls-tiga-tabel
526  perbaiki-format   ↔  526  peta-peran-dibenahi
537  menu-grup-mati    ↔  537  pulihkan-peta-peran
```

Tiap bentrok membuat SALAH SATU berkas **tak pernah jalan** di lingkungan baru.
Yang terlewat termasuk migrasi RLS (Ember [C]) dan pemulihan izin PM — keduanya
tanpa satu pun galat, karena di basis pengembangan efeknya sudah terlanjur ada.
Yang rusak justru server berikutnya.

`audit-replay-bersih.mjs` menangkapnya, tetapi SESUDAH berkasnya ditulis dan
sering sesudah di-commit. Alat di atas menjawab pertanyaannya SEBELUM — dan ia
membedakan kembar DI SATU CHECKOUT (cacat sungguhan) dari kembar
LINTAS-WORKTREE (dua cabang belum di-merge; belum tentu salah).

Test yang MENYASAR (satu berkas, satu modul) aman dijalankan bersamaan; yang
berbahaya adalah suite penuh, karena ia menyentuh hampir semua fixture.

---

## 5. Tanda sesi lain sedang menulis di tempat yang sama

Kalau muncul salah satu ini, **berhenti dan periksa** — jangan lanjut menulis:

- berkas hilang dari disk padahal `git status` bersih
- berkas asing muncul di `git status` yang bukan buatan Anda
- commit muncul yang bukan buatan Anda (`git log` bergerak sendiri)
- `docs/` atau `.superpowers/` lenyap

Diukur 2026-08-31: migrasi `530_urutan_sidebar_berjarak.sql` muncul **35 detik**
sebelum saya melihatnya, plus dua commit yang bukan milik saya. Yang benar
saat itu: commit HANYA berkas sendiri, biarkan milik sesi lain, lalu pindah ke
worktree.

---

## 6. Yang sudah ada sekarang

```bash
git worktree list
```

Diukur 2026-08-31 — enam, termasuk yang baru:

```
E:/Project/puraloka-suite                    deploy/vps-perdana   ← utama
.claude/worktrees/admin-direktur-lengkap     feat/admin-direktur-lengkap
.claude/worktrees/kematangan-modul           feat/kematangan-modul
.claude/worktrees/struktur                   feat/struktur-analisa
E:/tmp/base                                  (detached — untuk membandingkan)
E:/tmp/peran                                 feat/peta-peran
E:/tmp/batas-paket                           feat/batas-paket
```

⚠ `.worktrees/` dan `.claude/worktrees/` menduplikasi seluruh pohon `docs/`
dan sudah dikeluarkan dari jangkauan pencarian lewat `.claudeignore`. **Jangan
membaca dokumen dari sana** — isinya versi lain.
