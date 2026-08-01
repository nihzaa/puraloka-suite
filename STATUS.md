# STATUS — Puraloka Suite (penunjuk satu pintu)

**Diperbarui:** 2026-08-01 (rev-15: 24 integration test ternyata TAK PERNAH berjalan — `to_regclass` tanpa skema menembus ke public, gejalanya "skipped" bukan "failed"; ditutup migrasi 154 + penjaga CI · rev-14: ROADMAP #17 paritas golden TUNTAS — RAB nyata Rp 3,63 M, 65 pemeriksaan nol selisih; temuan Rp 37,8 jt tertulis tapi di luar SUM (butuh keputusan founder) · rev-13: PETA MENU PENUH — 20 grup + 202 sub-menu di sidebar (migrasi 153), halaman `/m/<key>` kontekstual, collapse generik menggantikan angka mati yang akan memotong 13 dari 18 submenu · rev-12: 6 bug kolom-salah yang gagal SENYAP ditutup — kurva-S kehilangan Rp 755,7 jt dari AC, pencarian klien selalu nol, auto-clone kategori nol baris; 2 penjaga CI baru + CI merah 149 diperbaiki · rev-11: ROADMAP #15 WIP/PSAK — pengakuan pendapatan, CIE/BIE; sekaligus menemukan Kurva-S kehilangan Rp 631,7 jt dari AC karena kolom salah + kegagalan query menyamar jadi "nol baris" · rev-10: ROADMAP #16 rantai kontrak — EOT + LD arah kontraktor + register jaminan, migrasi 152; peringatan "091 arahnya terbalik" terkonfirmasi & ditutup · rev-9: ROADMAP #23 aset & alat PENUH — migrasi 149/150/151; 4 tabel sempat MATI TOTAL, tertangkap penjaga t5a/t7 · rev-8: SCOPE DIPERLUAS — ERP lengkap+terintegrasi+AI, lihat `docs/KEPUTUSAN-SCOPE-ERP-AI.md`) · rev-7 2026-07-31: 8 celah tenancy ditutup + gerbangnya jadi gate CI · 296 pelanggaran WCAG ditutup + penjaga a11y · PV EVM berjenjang dari tanggal Gantt · buku migrasi direkonsiliasi (20 migrasi tak tercatat)) · File ini adalah `STATUS.md` yang diwajibkan AUTOPILOT §2
— penunjuk TIPIS, bukan duplikasi konten. Update tanggal + baris "Fase aktif" setiap
kali keadaan berubah; detail selalu di dokumen rujukan.

## Fase aktif

> ### 🎯 SCOPE DIPERLUAS — 2026-08-01 (paling baru, menang atas yang di bawah)
> **Tujuan founder: ERP kontraktor LENGKAP, TERINTEGRASI, BERBASIS AI.**
> Keputusan lengkap: **`docs/KEPUTUSAN-SCOPE-ERP-AI.md`**.
>
> Empat kantong yang sebelumnya dicoret kini **MASUK**: GL/jurnal in-app ·
> QA/QC + HSE formal · payroll+BPJS+PPh 21 · aset & alat berat penuh. Keempat
> bentuk integrasi dipakai sekaligus: antar-modul · WhatsApp · sistem luar ·
> mobile lapangan.
>
> **Urutan mengikat: 8 item ROADMAP sisa DULU, baru AI.** Alasannya teknis —
> #15 WIP/PSAK & #16 rantai kontrak adalah data yang akan dibaca AI; AI di atas
> pembukuan yang belum benar menjawab dengan percaya diri dan salah.
>
> Gerbang AI ternyata **sudah terbuka** (140 automation terkatalog, 13 "Next"
> setelah Phase 1-2 yang sudah selesai) — yang menahan kini hanya kualitas data.
> Di kode: **nol baris AI, nol dependency**.
>
> Dua gerbang di luar kendali teknis: **WhatsApp Business API** (berbayar +
> verifikasi Meta) dan kredensial integrasi luar.

> ### 🔄 PERUBAHAN ARAH BESAR — 2026-07-28
> **CECEP DITUNDA. Multi-tenant (Program D / L2→L3) jadi prioritas tunggal.**
>
> Pemicu: founder menetapkan sistem akan dijual sebagai **SaaS** (calon pelanggan
> konkret sudah ada) DAN akan ada **badan usaha kedua**. Ini memicu **kedua tripwire**
> di `docs/KEPUTUSAN-MULTI-COMPANY.md` §2 sekaligus.
>
> Keputusan lengkap + roadmap 8 tahap: **`.../Engineering-Constitution/adr/ADR-011-multi-tenant-strategy.md`** (ACCEPTED).
> Mandat "CECEP Option 2" (2026-07-26) **ditunda**, bukan dicabut — CECEP dilanjutkan
> setelah multi-tenant TUNTAS (bukan setengah matang).
>
> **Rasionalisasi founder:** sistem **belum dipakai operasional nyata (masih
> development)** → nol data produksi = waktu TERMURAH untuk retrofit pondasi.
> Titik-bocor #1 belum menimbulkan kerugian aktual.
>
> **GERBANG MUTLAK:** tenant kedua TIDAK BOLEH dibuat di produksi sebelum Tahap 4
> dan 5 selesai penuh. Selama itu sistem berisi tepat satu company.
>
> **2026-08-01 — dua celah pra-tenant-kedua ditutup** (ROADMAP 14i & 14j). Keduanya
> punya dampak **nol hari ini** justru karena baru ada satu company — dan keduanya
> akan menggigit pada hari tenant kedua lahir:
> · `modules` menyimpan `is_enabled` di baris katalog **bersama** → satu perusahaan
>   mematikan modul untuk semua (migrasi 155, kategori A → AB).
> · API dan RLS memakai **peran yang berbeda** — `auth_role()` sudah per-company
>   sejak migrasi 144, `authenticate()` masih global. Arah berbahayanya: peran
>   global `admin` membawa 95 permission ke company tempat orangnya hanya `mandor`.
>
> Ratchet gerbang tenancy dikencangkan **9 → 7**; 195 dari 202 rute bergerbang.
>
> **2026-08-01 — ROADMAP #24 dimulai: Punch List hidup** (migrasi 156, `/lapangan/punch-list`).
> Modul pertama Capability Tier-2. Blocker lamanya ("butuh Workflow Engine")
> diverifikasi lunas **ke kode**, bukan dibaca dari dokumen: 4 modul memakai
> `evaluateEntityApproval`, 6 chain berisi 13 langkah, ada baris progress nyata.
> Keputusan yang menentukan modul ini berguna atau tidak: **`punch:verify`
> dipisah dari `punch:manage`** — yang memperbaiki tak boleh menyatakan
> perbaikannya sah. Nol akses `supabase` mentah (seluruhnya `request.db`), jadi
> ratchet T4f tidak naik sedikit pun.
>
> **2026-08-01 — Tier-2 lanjut: DUA modul RFI hidup** (migrasi 157).
> Dokumen proyek konflik soal apa itu "RFI" — taksonomi menu menulis *Request
> for **Inspection***, Blueprint & vision menulis *Request for **Information***.
> Keduanya alur kerja nyata yang berbeda, jadi ini keputusan produk, bukan
> teknis; **founder memilih membangun keduanya dengan menu terpisah**:
> · `/lapangan/inspeksi` — izin cor/tutup. Yang memutuskan lolos terpisah dari
>   yang mengajukan; gagal boleh langsung jadi temuan punch list.
> · `/kontrak/rfi` — pertanyaan resmi ke konsultan, di grup **Kontrak** karena
>   ke situlah jawaban yang telat bermuara (Claims & EOT). Yang dihitung:
>   **lama menggantung** — angka yang dibawa ke klaim perpanjangan waktu.
>
> **2026-08-01 — Submittal Register hidup** (migrasi 159, `/lapangan/submittal`).
> Persetujuan lewat **Workflow Engine yang sudah ada**, bukan status sendiri —
> tabelnya sengaja tanpa kolom `disetujui_oleh`. Revisi dirantai ke pengajuan
> pertama: "ditolak 3× sebelum disetujui" adalah fakta yang menjelaskan
> keterlambatan pengadaan.
>
> **Temuan yang lebih besar daripada modulnya** (migrasi 158): `approval_chains`
> punya `UNIQUE (entity_type)` **GLOBAL** — badan usaha kedua tak bisa punya
> rantai approval sendiri. Pola yang sama untuk **keempat kalinya** (145, 146,
> 155), dan yang ini **fail-closed**: company kedua berarti nol orang bisa
> menyetujui apa pun di sana. Ditemukan karena asumsi kolom diverifikasi ke
> `pg_constraint` SEBELUM menulis migrasi, bukan setelah gagal.
>
> Sisa Tier-2: **QA/QC, HSE** — dan keduanya **bukan pekerjaan berikutnya**.
> `KEPUTUSAN-SCOPE-ERP-AI.md` §5 menempatkannya di **Gelombang 2**, sesudah
> item ROADMAP sisa. Peta menu masih menandainya `gerbang` ("menunggu tender
> mensyaratkan") — penanda itu sudah dibalik keputusan scope 2026-08-01 yang
> memasukkannya, tapi urutannya tetap Gelombang 2.

> ### ⚠️ TEMUAN 2026-08-01 — alat pembersih akan menghapus 8.923 baris NYATA
>
> `cleanup-cecep-residue.mjs` memakai `DELETE FROM <tabel>` **TANPA `WHERE`** —
> ia MENGOSONGKAN tabel, bukan menyaring residu. Saat ditulis itu benar; seluruh
> isi tabel CECEP memang residu test. Keadaan itu sudah berubah:
>
> | tabel | baris | ber-`[TEST]` |
> |---|---|---|
> | `assemblies` | 3.043 | **0** — analisa AHSP SE-47-2026 |
> | `assembly_components` | 17.873 | — |
> | `resources` | 2.830 | **0** |
> | `price_book_entries` | 3.006 | **0** — dipakai SETIAP hitung RAB |
> | `cost_codes` | 44 | **0** |
>
> Yang berbahaya bukan perintah DELETE-nya, melainkan **jaraknya dengan nama
> skrip**: "cleanup residu" terbaca seperti membuang sampah sampai seseorang
> membaca 40 baris ke bawah. ✅ Ditutup: `assertMemangResidu()` menolak jalan,
> ditampilkan di dry-run juga, tanpa flag `--paksa`. Diuji: `--execute` exit 1,
> nol baris terhapus.
>
> **Lessons Learned**: terverifikasi **913/913** residu (diperbarui 2026-08-01 malam) (angka lama 668 basi),
> seluruhnya yatim. Penghapusan tetap **menunggu izin founder** (keputusan
> terbuka #1c).

> ### 2026-08-02 — adopsi `tenantDb` 426 → 378; alat pemilahnya salah 4×
>
> **48 query dialihkan ke `viaProject()`** di delapan berkas: `rab-schedule`,
> `progress`, `documents`, `rab`, `termin-payment`, `cash`, `milestones`,
> `change-orders`, `mandor`. Yang berubah bukan keamanannya hari ini —
> gerbangnya memang sudah ada. Yang berubah: **filter tenant melekat pada
> query**, jadi rute berikutnya yang ditulis di berkas itu tak bisa lupa.
>
> Ikut dibersihkan: 7 impor `supabase` yatim, ratchet lint API 16 → **10**.
>
> **Yang lebih berharga daripada angkanya: alat pemilahnya salah EMPAT kali**,
> dan tiap kesalahan menaikkan angka palsu yang meyakinkan —
>
> 1. Tak memeriksa gerbang **per-handler**, hanya jarak baris → melaporkan 70
>    kandidat di `mandor.ts`; yang sebenarnya siap **2**.
> 2. Menghitung `projectIds()` sebagai gerbang → rute **lintas-proyek** ikut
>    terbaca "siap": 0 jadi **40 palsu** di `procurement`.
> 3. Tak memeriksa **kategori tabel** → `viaProject` hanya menerima kategori C,
>    sementara `projects` adalah ANCHOR dan akan gagal compile.
> 4. Tak membedakan `request.params` (selalu ada) dari `request.query` (bisa
>    `undefined`) → mengalihkan yang kedua akan **MEMECAHKAN** rute "semua
>    proyek" yang sekarang bekerja.
>
> Tiap kesalahan ketahuan dengan memeriksa **sampel**, bukan dari alatnya.
> Sesudah empat koreksi angkanya masih tak stabil, jadi sisanya diperiksa
> manual alih-alih dipercaya — dan pekerjaan dihentikan di titik itu, bukan
> dipaksakan dengan angka yang tak bisa dipertanggungjawabkan.
>
> Sisa 378 **bukan seluruhnya hutang**: 28 di antaranya operasi by-id
> lintas-proyek (`.in('project_id', await db.projectIds())` — bentuk yang
> BENAR untuk "apakah id ini milik salah satu proyek saya").

> ### 2026-08-02 — `apps/web` akhirnya punya harness test (sebelumnya NOL)
>
> Sisi API punya 1.215 test tiap CI; sisi web hanya dijaga **bentuk kodenya**
> (lint, tsc, ratchet), bukan perilakunya. Celahnya konkret: `useTutupEsc`
> dipasang di **51 tempat** untuk menutup jebakan papan tik, dan
> `modal-esc-ratchet` menangkap **KEBERADAAN** panggilannya — bukan efeknya.
> Mengubah `'Escape'` jadi `'Esc'` (nama usang) lolos setiap pemeriksaan
> statis sementara 51 modal kembali menjebak tanpa gejala.
>
> Dipasang **Vitest 3.2.7** (versi sama dengan API — satu runner untuk dua
> workspace) + Testing Library + jsdom. **29 test**, dan **11 uji mutasi
> semuanya tertangkap**.
>
> **Dua mutasi menemukan test yang LEMAH, lalu diperkuat** — dan itu justru
> nilai terbesarnya: (1) guard `if (!tutup) return` ternyata tak terjaga, sebab
> test hanya membuktikan "Esc tak menutup" padahal yang dijaga guard itu adalah
> listener **tidak dipasang sama sekali**; (2) batas sorotan `Math.min` lolos
> karena `if (hasil[sorot])` menelan indeks di luar batas diam-diam — yang
> rusak bukan Enter-nya melainkan **sorotannya**.
>
> **Dua kegagalan lingkungan yang menghabiskan waktu paling lama:**
>
> · Setiap komponen ber-ikon gagal `Cannot read properties of null (reading
>   useContext)`. Errornya menuduh React, lalu menuduh komponennya — keduanya
>   salah alamat. Sebabnya `lucide-react` dan `react` bisa di-resolve dari
>   **pohon node_modules berbeda**; versi React identik, objeknya berbeda.
>   `dedupe`, `server.deps.inline`, `resolve.conditions`, dan alias ke jalur
>   `.pnpm` semuanya dicoba dan tak satu pun menyelesaikannya.
>
> · `pnpm add` dari `apps/web` membuat **workspace terpisah** — lockfile
>   sendiri, root tak diperbarui. CI memakai `--frozen-lockfile` dari root,
>   jadi ketiga job gagal di "Install dependencies". **Terbukti di CI nyata**
>   (`0977756` merah), lalu ditutup. Alias diganti `createRequire().resolve()`
>   supaya tak pecah lagi oleh `pnpm install` — alat yang rusak oleh
>   `pnpm install` bukan alat.

> ### 2026-08-02 — residu test yang membutakan audit; a11y kontrol nyata
>
> **913 baris menumpuk di DB dev, dan itu membutakan alat lain.**
> `lessons-writeback.test.ts` menghapus `projects` bertanda `[TEST]` tapi tidak
> `lessons_learned_records` — dan `session_replication_role='replica'`, dipasang
> di `purge()` itu juga, **mematikan FK cascade**, jadi lesson-nya tak ikut
> terhapus melainkan jadi yatim. Tiap run menambah, tanpa gejala.
>
> Yang membuatnya lebih dari sekadar sampah: audit jalur hidup (§9a) **ikut
> tertipu** — tabelnya tampak berisi sehingga lolos dari daftar tabel nol-baris.
> Alat yang dibuat untuk menemukan yang "benar tapi mati" dibutakan oleh residu
> test. Dibuktikan dua kali: run pertama menyapu 913 → 0, run kedua tetap 0.
>
> Pola yang sama ditemukan dua kali lagi: rantai `estimate_items` →
> `estimate_versions` → `scenarios` (komentarnya bahkan menyebut "termasuk
> CASCADE dari project", padahal `replica` justru menonaktifkannya — niat dan
> efek bertolak belakang), dan **151 `price_book_entries` yatim** dari lima test
> yang menghapus `resources` tanpa membersihkan entry harganya; tabel itu dibaca
> **setiap perhitungan RAB**. Sesudah suite penuh kini hanya `audit_logs` yang
> bertambah — jejak permanen yang memang pantas bertahan.
>
> **151 yatim yang sudah ada TIDAK dibersihkan**, dan itu disengaja: trigger
> penjaga menolak `DELETE` pada entry `active` ("expire-kan, jangan hapus"),
> transaksinya rollback dengan nol baris terhapus. Penolakan itu benar;
> menonaktifkan trigger untuk menerobosnya menyentuh jaminan integritas.
>
> **a11y kontrol nyata.** `click-events` 102 → **88**, `static-interactions`
> 115 → **96**. Yang ditutup bukan angka melainkan kontrol: **pencentang
> permission** di `/pengaturan/roles` (mengatur AKSES, sebelumnya hanya bisa
> dijangkau tetikus), foto bukti lapangan, baris mandor yang melipat, kartu KPI,
> milestone, kartu statistik penyaring. Sisa 88 komposisinya penting: **43 latar
> modal yang jebakan keyboardnya sudah hilang** lewat Esc — bentuknya bukan
> tombol, tapi orang tak lagi terperangkap.

> ### 2026-08-01 (lanjut) — kegagalan senyap di API & web; penjaga yang buta
>
> **11 penulisan senyap di API.** `update`/`delete`/`insert` yang hasilnya
> dibuang: request membalas **200** sementara datanya separuh jalan. Yang
> paling berdampak — pembayaran termin tercatat tapi invoice tak jadi lunas
> (**klien ditagih dua kali**); saldo stok tak berkurang padahal mutasinya
> tercatat (selisih baru ketahuan saat opname); ganti-permission role bisa
> **MENAMBAH** akses alih-alih menggantinya, pada endpoint yang justru dipakai
> untuk MENCABUT wewenang. Ditutup penjaga ratchet 41 → 26 + **test integrasi**
> yang menguji perilaku (permission lama benar-benar hilang), bukan keberadaan
> satu baris `if (error)` — uji mutasi: melewati DELETE → dua test merah.
>
> **18 `catch` menelan error di API, 8 aksi pemakai di web.** Di API akibatnya
> kehilangan jejak; di web lebih langsung: orang menekan tombol, tak terjadi
> apa-apa, dan layar tetap menampilkan seolah berhasil — karena semuanya
> memperbarui tampilan lokal SEBELUM tahu servernya menerima. Termasuk
> **menonaktifkan akun** (tindakan keamanan), **approve/reject kasbon** di dua
> jalur, dan **menyetujui laporan upah**. Dua penjaga baru, ambang NOL.
>
> **Penjaga modal P9 ternyata buta.** Ia melaporkan nol — benar untuk bentuk
> yang dikenalinya (`onClose` prop). Seluruh portal mandor memakai state lokal,
> jadi **lima modal di sana menjebak pemakai keyboard tanpa terdeteksi**, tepat
> di portal yang penggunanya mandor di lapangan. Plus empat modal inline di
> `/mandor` dan `/proyek/[id]`. Pelajaran yang sama, ketiga kalinya hari ini:
> **nol hanya berarti sesuatu kalau uji mutasi membuktikan alatnya menggigit.**

> ### 2026-08-01 — 36 modal menjebak pemakai keyboard; unggah RAB yang mati
>
> **Modal (36 → 0, penjaga ambang NOL).** Berawal dari satu warning pada latar
> modal `/mandor`. Menambalnya `role="button"` adalah saran lint kalau dibaca
> harfiah — dan **salah**: latar modal bukan tombol. Pertanyaan yang benar
> adalah bagaimana pemakai keyboard KELUAR, dan jawabannya **tidak bisa**: nol
> penanganan Esc di halaman itu, lalu setelah diukur **nol di seluruh
> aplikasi — 36 modal**. Tab berputar di dalam, satu-satunya jalan keluar
> mengambil tetikus. WCAG 2.1.2 (Level A), syarat dasar. Ditutup dengan
> `lib/use-tutup-esc.ts` di 40 tempat + penjaga CI ambang **0**.
>
> Penjaganya sendiri menuduh palsu tiga komponen HALAMAN yang cuma merender
> modal (`onClose` dilewatkan ke anak, bukan milik sendiri) — sisipan otomatis
> di sana merujuk nama tak ada. tsc menangkapnya, **tapi hanya karena kebetulan
> gagal keras**: kalau ada variabel bernama sama, ia menutup hal yang salah
> tanpa peringatan. Diperbaiki jadi menuntut `onClose` di *signature*.
>
> **Unggah RAB mati di keadaan kosong — ketemu saat kerja keyboard.** Area
> "Belum ada data RAB" memanggil `fileRef.current?.click()`, tapi
> `<input ref={fileRef}>` ada di blok header yang hanya dirender kalau
> `hasData`. Di keadaan kosong ref-nya **null**: mengklik area itu tak
> melakukan apa pun, tanpa pesan. Proyek yang belum punya RAB **tak punya jalan
> mengunggah RAB** — persis keadaan di mana orang paling membutuhkannya.
> Diperbaiki dengan `<label>` yang membungkus input-nya sendiri.
>
> **RAB bisa dijangkau keyboard** lewat helper `lib/dapat-ditekan.ts`, supaya
> `role`+`tabIndex`+Enter/Space selalu lengkap — separuh implementasi (umumnya
> Enter ditangani, Space tidak) terasa rusak sesekali, dan itu lebih
> membingungkan daripada rusak konsisten. Regresi yang saya perkenalkan sendiri
> lalu tutup: begitu baris induk menangani Space, mengetik Space di kotak angka
> serapan **menembus** ke induk dan melipat barisnya di tengah orang mengetik.
>
> click-events 117 → 104 · static-element-interactions 115 → 108.

> ### 2026-08-01 — a11y gelombang 2: 253 label → 44, foto jadi tombol
>
> **Label (253 → 44).** Codemod `pasangkan-label.mjs` memasangkan **213** label
> ke kontrolnya lewat `htmlFor` ↔ `id` dalam dua gelombang, id **diturunkan**
> dari `value={state}` yang sudah ada — tak dikarang, karena id yang salah
> memasangkan label ke kontrol yang keliru dan itu lebih menyesatkan daripada
> tak berpasangan. Manfaatnya bukan hanya untuk pembaca layar: teks label jadi
> bisa **diketuk** untuk memfokuskan kontrolnya, jadi target sentuh membesar —
> persis yang dibutuhkan mandor di HP, satu tangan, di bawah matahari.
>
> Dua kebutaan alatnya sendiri ketahuan, keduanya sebelum di-push:
>
> · **Label bercabang.** Di `progress-log-modal` satu label melayani DUA kontrol
>   berbeda (`select` scope vs `input` jumlah pekerja). `htmlFor` statis
>   menunjuk elemen yang tak dirender di salah satu cabang — label **MATI**,
>   lebih buruk daripada tak berpasangan karena pembaca layar menyebutkan
>   kaitan yang tak ada. Diperbaiki manual, lalu seluruh 213 hasil dipindai
>   untuk bentuk yang sama: hanya satu.
>
> · **Label multi-baris tak terlihat.** Bentuk yang teksnya dipecah beberapa
>   baris (karena memuat penanda wajib `*` atau ikon) tak dikenali sama sekali,
>   sehingga 9 label di `termin-payment-modal.tsx` **tak pernah muncul di
>   laporan mana pun** — bukan "dilewati dengan alasan", tapi tak terlihat.
>
> **Foto progres jadi tombol.** Lima `<img onClick>` di `progress-log-list`:
> bisa diklik tetikus, dengan keyboard tak bisa apa-apa. Diganti `<button>`,
> bukan ditambal `role`+`tabIndex`+`onKeyDown` — browser sudah tahu apa itu
> tombol, tambalan manual mudah tak lengkap (sering `Enter` ditangani, `Space`
> tidak). Versi pertama saya taruh komponennya DI DALAM `PhotoGrid`, dan
> `react-hooks/static-components` menangkapnya: komponen yang lahir ulang tiap
> render melepas-pasang seluruh pohon anaknya, dan fokus keyboard hilang di
> tengah jalan — merusak persis hal yang sedang diperbaiki.
>
> **Penjaga baru: medan hantu** (dipasang ke CI). Mencari nilai yang dikirim ke
> API tapi tak punya cara diisi. Penjaganya sendiri salah **tiga kali** sebelum
> di-commit; yang terakhir paling penting: analisis per-berkas MELEWATKAN bug
> yang melahirkannya (`kas/page.tsx` punya tiga modal dengan `notes`
> masing-masing), dan hanya **uji mutasi** yang mengungkapnya.

> ### 2026-08-01 — ADR-004 sisi web NOL; empat fitur mati ketahuan lewat lint
>
> **P6 — ADR-004 (27 → 0), tapi nol pertamanya PALSU.** Seluruh pemakaian
> `role === "..."` di web dipetakan ke capability yang **API benar-benar
> tuntut**, diverifikasi satu per satu ke `requirePermission` di rutenya. Dua
> kasus butuh penilaian: `isMandor` → `!hasPermission("mandor:assign")` (efek
> sampingnya bagus — `direktur` kini melihat tab Penugasan yang dulu
> tersembunyi), dan `canEdit` di halaman kas ternyata **satu boolean untuk tiga
> wewenang** yang API pisahkan, jadi dipecah.
>
> Yang lebih berharga daripada angkanya: **penjaganya sendiri salah dua kali**.
> Ratchet hanya mencari `===` dengan nama variabel `currentUser|user|me`. Yang
> lolos justru bentuk paling berbahaya — `if (user?.role !== "admin") return
> <TidakBolehMasuk/>` di `/audit` dan `/sistem`: itu **gerbang halaman penuh**,
> bukan satu tombol. `direktur` yang punya `audit:view` ditolak di depan pintu
> oleh halaman yang API-nya sendiri akan melayani. Pola diperlebar (`!==` ikut;
> nama variabel apa pun), penyaringan daftar dibedakan lewat **bentuknya**
> (`.filter(`/`.map(`) bukan lewat daftar nama. Tiga layout portal dikecualikan
> dengan alasan tertulis: pengalihan `/portal` ↔ `/mandor-portal` adalah
> IDENTITAS ("ini rumahmu"), bukan kewenangan.
>
> **P7 — lint 67 → 11, dan empat fitur mati ketahuan.** Dimulai sebagai
> kerja rapi-rapi (50 impor yatim sisa P6) tapi sisanya ternyata penanda fitur
> yang tak tersambung — variabel yatim adalah **gejala, bukan kotoran**:
>
> | Yatim | Yang sebenarnya rusak |
> |---|---|
> | `setNotes` | Modal pengeluaran kas mengirim `notes` ke API tapi **tak punya input**. Selalu kosong. Dua modal lain di berkas yang sama punya textarea-nya. |
> | `setFundSource` | Kasbon dari halaman mandor **selalu** "Dana Owner" — pemilihnya tak pernah dirender. Komentar di sana menjanjikan "ditentukan admin/PM saat approve" yang **tak pernah ada**: `fund_source` hanya bisa diisi saat POST. Portal mandor sudah punya pemilihnya; dashboard-lah yang tertinggal. |
> | `rowOk` | Validasi `rab_items_pct_sum` dihitung lalu dibuang — baris salah tak ditandai, tombol simpan tetap aktif sampai Postgres menolak dengan pesan mentah. |
> | `hasBorongan` | **Dugaan awal saya salah.** Sempat saya catat "halaman belum ada"; ternyata settlement borongan sudah lengkap — `GET`+`POST /mandor/borongan-settlements` + `SettlementBoronganModal` di `/mandor`. Dijaga `mandor:kasbon:approve` (admin/PM), karena settlement adalah PENCAIRAN bukan pengajuan. State itu memang pantas mati; menambah menunya justru menjanjikan wewenang yang API-nya tolak. |
>
> Ikut ketemu: pencarian audit membandingkan kata kunci lowercase terhadap nilai
> yang **belum** di-lowercase (UUID berhuruf besar tak pernah ketemu), dan
> kalender tak punya indikator memuat sama sekali — grid tanggal selalu
> terlukis, jadi tampak "tak ada acara bulan ini" alih-alih "belum selesai
> memuat", yang **lebih menyesatkan daripada halaman kosong**.
>
> Verifikasi: 1.213 test hijau · build sukses · enam ratchet hijau · uji mutasi
> tiap ratchet baru (nama bebas → merah, penyaringan daftar → tetap hijau).

> ### 2026-08-01 — a11y NOL, hutang tenancy dicicil
>
> **#14d SELESAI**: nol kontrol tanpa nama (96/62 → 0/0), ambang dikencangkan
> ke 0 — kontrol baru tanpa nama kini ditolak sama sekali. Bagian yang jujur:
> sebagian "hutang" itu ternyata **laporan palsu** — jendela pencarian teks
> tombol 14 baris terlalu sempit untuk repo ini. Kontras warna tetap tak dijaga
> otomatis (butuh browser + login).
>
> **#14g**: `price-overrides` kini punya UI di tab Harga — ia sudah dipakai
> tiga jalur perhitungan tapi nol pemanggil web. `settings/config` **sengaja
> tidak** dibangun UI-nya: 5 key-nya sudah punya jalur pakai masing-masing, dan
> layar terpadu justru menciptakan dua tempat mengubah tarif pajak yang sama.
>
> **#14 hutang adopsi**: 9 query `reports.ts` dialihkan ke `viaProject()`,
> dibuktikan behavior-preserving pada data nyata. Ratchet T4f 468 → **459**.
> Tiga alat pengukur yang saya bangun semuanya menuduh palsu; pengukuran
> akhirnya dilakukan dengan membaca kode. **15 akses mentah adalah `.storage`**
> yang memang tak punya konsep tenant — sebagian "hutang" tak pernah bisa
> dilunasi dengan mengalihkan ke wrapper.

---

### 🗺 PETA HORIZON — supaya konteks tidak hilang antar sesi

Empat tingkat evolusi (`00-vision-and-business-architecture.md`). **Kita di mana
dan apa pemicu naik tingkat:**

| | Artinya | Status | Pemicu naik tingkat |
|---|---|---|---|
| **L1** | Satu perusahaan, pengguna internal | ✅ terlampaui | — |
| **L2** | **Grup usaha** — beberapa PT/CV milik sendiri, data terisolasi | ✅ **arsitektur selesai** (T0–T7). ⚠️ **belum bisa dari UI** — buat badan usaha kedua masih perlu SQL manual | — |
| **L2 penuh** | Sama, tapi founder bisa kelola sendiri dari UI | ✅ **SELESAI** (T9, migrasi 137). Buat PT/CV kedua dari `/pengaturan/perusahaan` — tak perlu SQL lagi | — |
| **L3** | **SaaS komersial** — kontraktor LAIN berlangganan | ⛔ **BELUM & SENGAJA**. Isi: tenant lifecycle, billing, observability-produk, SLA, support | **Pelanggan eksternal committed** — "mutlak, bukan negotiable" (doc 09 §3) |
| **L4** | Regional, multi-currency | ⛔ 5–10 th, sengaja tak dirinci | — |

**⚠️ Jangan bangun apa pun dari daftar L3 sebelum ada pelanggan berbayar.**
Dokumen visi menyebut itu ***enterprise theater*** — istilahnya sendiri, bukan
tafsiran. Checklist lengkap L2→L3:
`Master-Delivery-Blueprint/09-saas-and-tenancy-readiness.md` §3.

**Bedanya L2 dan L3 dalam satu kalimat:** L2 = *beberapa badan usaha MILIK
ANDA*; L3 = *perusahaan ORANG LAIN membayar untuk memakai sistem ini*. Membuat
badan usaha dari UI **tidak** menjadikan sistem ini SaaS.

---

**Program D — Multi-Tenant (AKTIF).** Tahap: T0 ADR ✅ → **T1 audit 94 tabel ✅** →
**T2 skema inti ✅ (migration 126)** → **T3 `company_id` ✅ (migration 127)** →
**T4 repository wrapper ✅** → **T5a/T5b RLS dual-axis ✅ (migration 131–133)** →
**T5c DITUNDA sampai pemicunya muncul** → **T6 numbering ✅ (migration 135)** →
**T7 ✅ switcher + exit criteria L2**. **CECEP langkah 7+ kini boleh dilanjutkan**
(gerbang D1 terbuka).

**T7 SELESAI.** Tiga bagian: (a) endpoint `GET /api/v1/my/companies` — daftar
perusahaan milik user; satu-satunya tempat yang **sengaja** tidak memakai wrapper
tenant, karena yang ditanyakan justru "company mana saja yang boleh saya pakai";
lingkupnya dijaga `company_members.user_id`. (b) `CompanySwitcher` di topbar —
ditaruh di kiri bersama breadcrumb (perusahaan aktif itu **konteks**, bukan aksi),
menampilkan diri hanya bila user punya >1 perusahaan; berpindah = simpan + reload
penuh, karena memperbarui sebagian layar akan menampilkan campuran dua perusahaan
sekaligus — bentuk kesalahan paling berbahaya di aplikasi multi-tenant karena
tampak wajar. Header `x-company-id` adalah **permintaan**, bukan penentu: backend
memverifikasinya ke keanggotaan dan membalas 403 bila bukan haknya, jadi nilai
palsu di localStorage tak membuka apa pun. (c) **exit criteria L2** jadi test
permanen (`t7-exit-criteria-l2.test.ts`) — memeriksa gabungan klaim "multi-tenant
selesai" terhadap **database**, bukan dokumen, karena klaim tingkat-program bisa
runtuh tanpa satu pun test tahap jadi merah.

**(d) Menu Registry per company (migration 136)** — item checklist L2 yang sempat
**terlewat** pada PR #108 dan ditutup di PR berikutnya. `menu_items` tetap katalog
**global**; yang per-company hanya **pengecualian** di `company_menu_settings`.
Nol baris = seluruh menu tampil, jadi migrasinya **netral**. Alternatif "salin 23
menu per tenant" ditolak: menu adalah struktur aplikasi, bukan data pelanggan —
menyalinnya berarti tiap menu baru di rilis berikutnya harus di-backfill, dan
tenant yang terlewat diam-diam kehilangan fitur. **Bukan lapis keamanan** —
menyembunyikan menu tidak menutup endpoint-nya (ada test yang menegaskan ini).
Jebakan yang ikut ditutup: menyembunyikan menu induk tadinya menaikkan anaknya
jadi **menu utama** — kebalikan dari yang diminta.

**T9 SELESAI (migrasi 137)** — L2 penuh dari UI. Mendirikan PT/CV kedua tak lagi
butuh SQL manual: halaman `/pengaturan/perusahaan` + endpoint `POST /companies`.

**Otorisasi — keputusan founder 2026-07-29: hanya PEMILIK GRUP** (Opsi B;
rekomendasi saya Opsi A "permission baru" tidak dipakai, founder pilih yang lebih
ketat). Kenapa bukan permission biasa: seluruh 89 permission dievaluasi **dalam
konteks company aktif** ("boleh apa orang ini di perusahaan ini"), sementara
mendirikan badan usaha adalah tindakan **di atas** semua perusahaan — memaksakannya
ke model per-company berarti bertanya "di perusahaan mana Anda boleh mendirikan
perusahaan?". Temuan yang membuat ini penting: `settings:manage` (satu-satunya
kandidat yang ada) dipegang admin **dan direktur** — memakainya berarti direktur
di PT anak bisa mendirikan badan usaha atas nama grup.

Model: **tanpa tabel `group_owners`**. Grup = pohon `parent_company_id` yang sudah
ada; kepemilikan ditaruh di akarnya (`companies.owner_user_id`), anak mewarisi.
`is_group_owner()` fail-closed. **Kepemilikan grup BUKAN gerbang akses data** —
nol policy RLS membacanya, dijaga test.

Endpoint menjamin **company + keanggotaan pembuat lahir bersama**; kalau keanggotaan
gagal, company-nya dibatalkan. Itu menutup kegagalan paling mungkin dari INSERT
manual: perusahaan yang **tak bisa dimasuki siapa pun**, termasuk pembuatnya.

**Keenam kriteria hijau:** company_id di 31 tabel B/AB/ANCHOR · 79 policy tenant,
nol policy tak-terevaluasi, nol tabel mati · counter penomoran + UNIQUE global
sudah dilepas · `auth_company_id()` berbasis keanggotaan (bukan "company
satu-satunya") · Menu Registry per-company ter-isolasi · nol helper per-baris.
**809 test hijau.**

**T6 SELESAI (migration 135, PR #107).** `COUNT(*)+1` (migrasi 041) diganti counter
transaksional. **Empat cacat, semuanya dibuktikan di dev — bukan teori:**
(1) nomor **berlanjut lintas company** — company A dapat `MR-2026-006`, company B
berikutnya `MR-2026-007`, bukan 001; dari lompatan itu tenant B bisa menyimpulkan
volume dokumen tenant A · (2) nomor **dipakai ulang setelah dihapus** — `COUNT(*)`
menghitung yang ADA, bukan yang PERNAH ada; untuk PO ke supplier/invoice ke klien
itu cacat audit · (3) **rentan balapan** — diuji 2 koneksi nyata: transaksi kedua
mengantre menunggu kunci, bukan dapat nomor kembar · (4) **`UNIQUE` global** —
inilah yang membuat (1)-(3) tak bisa diperbaiki hanya dengan ganti generator,
karena dua tenant WAJIB boleh sama-sama punya `MR-2026-001`.

**Invoice ikut diperbaiki** — cacatnya identik tapi tersamar: query `MAX`-nya
memakai klien **mentah** sehingga memindai invoice seluruh company; yang
menyembunyikannya cuma prefix per-company, dan default prefix company baru **sama**
(`INV`). Sinkronisasi counter menangani **dua format** (`INV/PRL/YYYY/NNN` lama vs
`INV/YYYY/MM/NNN` sekarang) — ketahuan dari dry-run yang memulangkan nol baris;
tanpa itu invoice berikutnya bertabrakan dengan `INV/PRL/2026/026` yang **sudah
terkirim ke klien**. Counter sengaja tak pernah mundur: lubang pada urutan nomor
adalah perilaku yang benar, nomor kembar tidak. Diverifikasi uji mutasi.

---

### ⏸ SATU-SATUNYA KEPUTUSAN YANG MENUNGGU FOUNDER: T5c

**Pertanyaannya:** kapan API berhenti memakai `service_role` (yang mem-bypass RLS)
dan mulai berjalan sebagai user-nya sendiri?

**Rekomendasi saya: TUNDA.** Bukan karena belum siap — delapan prasyaratnya sudah
lunas — tapi karena aritmetikanya:

- **Manfaat hari ini nol.** Satu tenant, satu pemakai (founder), nol data
  operasional. Tak ada satu pun kebocoran yang dicegah T5c hari ini yang belum
  dicegah wrapper.
- **Risiko hari ini nyata.** 60+ endpoint berubah perilaku serentak, dan **nol**
  di antaranya pernah dijalankan tanpa `service_role`.
- **Keamanan TIDAK berkurang karena ditunda.** Ini bagian yang paling mudah salah
  dibaca: policy-nya **sudah terpasang penuh** (79 policy, migrasi 131) dan
  **sudah terbukti menahan** — uji kill-switch menunjukkan kalau wrapper dilewati,
  RLS menangkap kebocorannya. Yang ditunda bukan perlindungannya, melainkan
  keputusan menjadikan RLS satu-satunya penjaga. Lapisnya ada; ia belum jadi
  lapis terdepan.

**Pemicu untuk mengeksekusi** (mana pun lebih dulu): perusahaan kedua di-onboard ·
ada pemakai di luar founder · data operasional nyata masuk. Ketiganya juga pemicu
rotasi kredensial yang sudah tercatat — sebaiknya satu paket "sebelum operasional".

Angka lengkap, daftar jujur yang belum terbukti, dan urutan eksekusi saat waktunya
tiba: **`.../adr/ADR-011-T5c-AUDIT-PRA-EKSEKUSI.md`**.

---

**T5a/T5b SELESAI (migration 131, applied ke dev 2026-07-29).** Axis COMPANY
ditambahkan lewat **komposisi**, bukan menyunting 218 policy existing: Postgres
meng-AND policy RESTRICTIVE dengan hasil OR seluruh PERMISSIVE, jadi satu policy
restriktif per tabel menambah axis tenant tanpa menyentuh satu pun policy role —
dan bisa di-rollback granular. **79 policy + 16 helper SECURITY DEFINER**,
di-generate dari peta tenancy (yang di-generate dari skema), bukan diketik tangan.

**T5b — uji kill-switch (P2) membuktikan dua lapis benar-benar independen:**
wrapper dimatikan → RLS menahan · RLS dimatikan → predikat wrapper menahan.
Diverifikasi **uji mutasi**: DROP policy → kebocoran benar terjadi. Tanpa itu,
"satu lapis bekerja dan satunya menumpang" terlihat persis sama dengan "dua lapis
bekerja" — sampai lapis itu gagal.

**⚠️ TEMUAN PERFORMA yang membuat T5c mustahil sebelum diperbaiki (migration 132).**
Baseline `EXPLAIN ANALYZE` service_role vs authenticated:

| query | bypass | RLS (sebelum) | RLS (sesudah 132) |
|---|---:|---:|---:|
| `assembly_components` (17.853) | 2,2 ms | **3.524 ms** | **5,1 ms** |
| `assemblies` (3.038) | 1,2 ms | 598 ms | 2,5 ms |

Akarnya bukan policy T5a: `has_permission()` — meski `STABLE` — dipanggil **sekali
per baris** selama ia berdiri sebagai ekspresi biasa; tiap panggilan menjalankan
join 3 tabel + `auth_role()`. Pembandingnya ada di baris yang sama:
`auth_company_id()` dibungkus `(SELECT …)`, jadi `InitPlan`, terukur 0,37 ms
**sekali**. **173 policy di 92 tabel** ditulis ulang dengan pola yang sama,
di-generate dari `pg_policies`. Dry-run membandingkan **368 sel** (92 tabel × 4
peran): **seluruhnya identik** — murni performa, nol perubahan visibilitas.
Dijaga test permanen (`rls-initplan.test.ts`) karena bentuk yang salah adalah
bentuk yang paling natural diketik, dan CI tetap hijau saat ia muncul.

**⚠️ KEBOCORAN NYATA yang ditemukan CI, bukan review (migration 134).** Di
database yang dibangun **bersih dari migrasi** — yaitu produksi masa depan — 8
tabel punya policy lengkap (dari 130 & 131) tetapi `relrowsecurity = false`.
**Policy di tabel tanpa RLS tidak dievaluasi sama sekali**: ia tetap muncul di
`pg_policies`, tetap terbaca benar saat review, dan menjaga persis nol. Di CI,
`rab_items` milik tenant lain benar-benar terbaca.

Tak ketahuan di dev karena dev punya `rls_auto_enable()` — fungsi yang **hanya
ada di dev** (terkonfirmasi schema-diff) — sehingga tabel itu sudah ter-RLS lewat
jalur di luar migrasi. Migrasi 130 karena itu mengasumsikan RLS sudah menyala:
benar di dev, salah di mana pun selain dev. **Inilah alasan CI dijalankan
terhadap database bersih** — selisih antara "berlaku di dev" dan "berlaku dari
migrasi" tak bisa dilihat dari dev. Diverifikasi dengan mereproduksi kondisi CI
di dev: RLS dimatikan → bocor; 134 dijalankan → tertutup. Migrasi memverifikasi
dua arah untuk SELURUH tabel, plus test permanen.

**R5 DITUTUP (migration 133).** Bukan hipotetis — terbukti: fungsi lama
memulangkan baris klien **company B** untuk user yang company aktifnya **A**.
Behavior-preserving pada 1 tenant (nilai identik sebelum/sesudah), benar pada
banyak tenant. Ada test regresinya.

**Temuan sampingan T5a (dicatat, di luar lingkup migrasi):** 104 `scenarios` +
413 `lessons_learned_records` — semua bernama `[TEST]` — adalah **yatim**: project
induknya terhapus, anaknya selamat karena trigger no-delete memblokir cascade.
Postgres sendiri menolak mem-VALIDATE ulang FK-nya. Residu dev sebelum CI dipisah;
skrip pembersihnya sudah ada (`cleanup-cecep-residue.mjs`). Policy T5a **benar** —
menyembunyikan baris yang pemiliknya tak ada memang perilaku yang diharapkan.
Tabel berisi data nyata terbukti 100% sehat (`rab_items` 373/373, `invoices` 26/26).

**T4 (wrapper) — status jujur per 2026-07-29:**
✅ **T4a fondasi**: `tenant-db.ts` (scope otomatis per kategori) · peta tenancy
**di-generate dari skema** (97 tabel, cocok persis dgn audit T1) · `request.db`
di auth plugin · **fix cache config per-company** (ADR sebut "bug yang AKAN
terjadi") · **migration 128** jaring pengaman (isi `company_id` saat INSERT,
TOLAK saat ambigu).
✅ **T4b–T4d**: `search` · `finance` · `dashboard` · `cash` · `kasbons` ·
`projects` · `reports` · `procurement` · `mandor`.
✅ **T4f penegak**: ratchet (akses supabase mentah tak boleh naik — **diuji
benar-benar menggigit**, bukan diasumsikan) + P3 (peta vs skema hidup; tabel
baru tanpa kategori = build merah).
🟢 **T4 — SELURUH temuan DUA RONDE audit keamanan DITUTUP (2026-07-29).**
Ronde 1 menemukan permukaan jauh lebih luas dari laporan awal saya; ronde 2
(verifikasi ulang) menemukan pola "gerbang di GET, hilang di PATCH/DELETE" di
4 modul. Keduanya kini tertutup: ±40 endpoint tulis + belasan jalur baca.
Sisa `supabase` mentah **476** (dari 584) — itu adopsi wrapper, BUKAN celah;
sisanya sudah bergerbang eksplisit. Detail lengkap + skenario
per-modul: **`.../adr/ADR-011-T4-AUDIT-CELAH-TENANCY.md`**.
Sisa: **468 akses `supabase` mentah** (dari 584).

⚠️ **Daftar "modul yang seluruh filenya belum ter-scope" di revisi sebelumnya
SUDAH USANG — jangan dipakai sebagai daftar kerja.** Diperiksa ulang satu per
satu 2026-07-31: `users` (gerbang keanggotaan → 404 sebelum tulis) · `documents`
(6 panggilan `proyekMilikTenant`, seluruh 5 rutenya tertutup) · `audit`,
`roles`, `clients`, `settings`, `lessons-learned`, `estimate-versions`
(semuanya sudah punya gerbang eksplisit). Yang tersisa adalah **hutang adopsi
wrapper**, bukan lubang terbuka — ratchet menjaganya tak bertambah.

Pelajarannya: klaim keamanan yang usang tidak netral. Ia membuat orang
mengerjakan ulang yang sudah beres, dan menutupi yang benar-benar terbuka.
**Dua yang paling merugikan dan bukan sekadar 'baca' — KEDUANYA kini DITUTUP
(2026-07-31):** `settings`/config finansial — ✅ migrasi 145 + `companyId` wajib
di `setFinancialConfig()`; sebelumnya penutupan rentang menyapu SELURUH
perusahaan (lihat butir 5b di atas) · `notification-routing` — ✅ sebagian besar
sudah ditutup T4g (`companyId` wajib, penerima dibatasi anggota company); sisa
celahnya `projectPm`/`projectMandors` yang diambil murni lewat `projectId`
lalu dimasukkan `mergeRecipients` **tanpa** diiris keanggotaan. Belum bisa
terjadi hari ini (semua pemanggil mengambil projectId dari baris yang sudah
ber-scope), tapi itu berarti keamanannya bergantung disiplin pemanggil —
kini diiris ke `idAnggota` sehingga fail-closed.

**KEBOCORAN NYATA yang ditutup T4** (bukan hipotetis — ini query yang benar-benar
berjalan tanpa saringan tenancy): KPI halaman depan · 11 query dashboard
keuangan · AR aging · DP recoupment · arus kas · `invoices`+`milestones` di
search · daftar MR/PO/GR/stok · laporan proyek & mandor. Plus **3 celah akses
by-id**: `?project_id=` di arus kas & laporan, dan `MR/:id` + `PO/:id` yang
mengambil baris hanya dengan `.eq('id', …)` — data perusahaan lain terbaca
lengkap hanya dengan mengetahui id-nya.

**Dua temuan dari pembacaan dokumen perencanaan** (ADR-011 §10):
**R4** urutan di `plugins/auth.ts` load-bearing (resolusi company WAJIB sebelum
`loadPermissionCache`) — sudah benar tapi tak terdokumentasi; komentar
peringatan ditambahkan. · **R5 TERVERIFIKASI NYATA**: `auth_client_id()`
(049:23-28) memetakan user→client **tanpa saringan company**; sejak `clients`
jadi kategori B, satu orang yang jadi klien di 2 perusahaan bikin portal klien
menampilkan proyek perusahaan yang salah. **✅ DITUTUP migration 133 (T5).**

**T3 SELESAI (migration 127, applied ke dev 2026-07-29)** — 32 tabel dapat
`company_id`, 23.030 baris. Verifikasi: jumlah baris **tidak berubah** · nol NULL
di 20 tabel terkunci · **2.620 AHSP nasional tetap milik bersama** · angka bisnis
identik (kontrak 4,883 M · invoice 2,092 M · kas 222 jt). **Dua pengaman disentuh
atas keputusan founder, bukan tafsiran saya:** segel append-only `audit_logs`
(073) dibuka sekali lalu dipasang kembali + dicek eksplisit, dan gerbang
immutability komponen CECEP (107) dilonggarkan **permanen tapi sempit** — hanya
`company_id`; ubah koefisien/resource pada assembly aktif TETAP ditolak. Bukti
keempat pengaman masih menolak: diuji langsung di dev. 43 test hijau.
Detail: `.../adr/ADR-011-T3-AUDIT-PRA-EKSEKUSI.md` §10.

**T1 — 3 temuan yang mengubah rencana** (`.../adr/ADR-011-T1-AUDIT-KLASIFIKASI-TABEL.md`):
**F1** 7 tabel PUNYA jalur ke `projects` tapi rantainya LEMAH (FK nullable) → tak
bisa mewarisi tenancy. Bukan cacat: `cash_accounts.project_id` nullable karena
memang ada kas tingkat perusahaan (40% data dev). · **F2** policy RLS nyata **198**,
bukan 293 seperti tertulis di ADR. · **F3** **8 tabel RLS-nya ENABLED tapi NOL
policy** (`rab_items`, `rab_schedule`, `rab_absorption_log`, `change_orders`,
`change_order_items`, `work_scope_item_specs`, `document_access_logs`,
`company_profile`) — karena RESTRICTIVE di-AND dengan hasil OR permissive, nol
permissive = tabel TAK TERBACA begitu RLS ditegakkan. Dibuktikan empiris.
Maka T5 wajib didahului **T5a-0**. Klasifikasi final: **32 tabel** dapat kolom
`company_id` di T3 (1 anchor + 11 AB + 17 B + 3 dari D); 48 mewarisi; 12 bersama.

**T2 — migration 126 applied ke dev** (additive murni, nol ubah data existing):
`companies` + `company_members` + `document_number_series` + `auth_company_id()`
+ `is_member_of()`. Tenant pertama di-seed **dibaca dari `company_profile`**
(`puraloka-persada`), 23 user jadi anggota dengan **peran dipertahankan persis**
(0 divergensi vs `users.role_id`). 20 test hijau, termasuk penjaga P1:
`auth_company_id()` mengembalikan NULL saat tak dapat ditentukan — **tidak** jatuh
ke "satu-satunya company yang ada". `project_company_id()` sengaja **ditunda ke
T3** (butuh `projects.company_id`; dry-run membuktikan membuatnya sekarang =
migrasi gagal).

**Tiga penajaman wajib (ADR-011 §9.5, masuk DoD tahapnya masing-masing):**
**P1** company pertama = tenant biasa (nol `DEFAULT_COMPANY_ID`, nol cabang
"kalau cuma satu company") → T2 · **P2** isolasi dibuktikan sebelum tenant kedua
nyata via fixture TENANT-A/B + **uji kill-switch** (matikan wrapper → test tetap
hijau karena RLS, dan sebaliknya; kalau merah berarti lapisnya cuma satu) → T5b ·
**P3** tabel ke-95 tak bisa lahir tanpa klasifikasi (CI merah kalau tabel di
schema tak ada di peta kategori) → T4a.

**Phase 3 / Program C (CECEP) — DITUNDA di langkah 6 (hasil 1–6 TETAP UTUH & dipakai).**
migration 102–123, 72 test-file hijau (PR #86–101). Langkah 1/3/4/5/6 ✅ selesai;
langkah 7 (RAP/Pagu) **ditahan** — ia commitment ledger, wajib menunggu multi-tenant
(tripwire #1). Kompensasi: RAP nanti lahir dengan `company_id` sejak baris pertama
→ nol backfill. **Syarat lanjut CECEP: multi-tenant TUNTAS** (seluruh checklist L2
doc 09 §2 tercentang), bukan sekadar "tahapnya sudah dikerjakan".

**Build order 10 langkah (`.../CECEP/MATERIAL-RAP-COMPANY-UI-DESIGN.md`) — status
per-langkah, verified 2026-07-26/28:**
- ✅ **1** CI isolation tuntas (project CI terpisah; repo public + branch protection)
- 🟡 **2** Config Lapis1/2 — PPN reuse (`tax.ppn_rate` existing); **BUK & rounding
  BELUM di-config**, masih wajib eksplisit per-request (C1, tanpa default diam-diam)
- ✅ **3** Metode per-estimasi + wiring engine↔config (engine paritas nyambung)
- ✅ **4b HARGA POKOK TER-SEED (2026-07-29)** — menutup celah yang ditemukan lewat
  pertanyaan founder: analisa sudah **nge-link** ke harga (nol kolom harga di
  `assembly_components`, sesuai desain), tapi **harga pokoknya belum pernah
  di-seed** — 2.766 resource dipakai analisa, **NOL** punya harga, sehingga
  **100% analisa tak bisa menghitung HSP**. Rumus `=HS.BAHAN!D569` sudah
  terpasang; sheet harganya yang kosong.
  **Hasil: `price_book_entries` 67 → 2.625 baris.** HSP lengkap: nasional
  **2.091/2.620 (80%)**, company **237/418 (57%)**.
  **Paritas terverifikasi vs workbook sampai dua desimal** — B.2 BONGKARAN
  RANGKA `17.778,75` sistem = `17.778,75` workbook; 4 dari 5 blok cocok persis.
  **Pencocokan LEWAT RUMUS, bukan nama**: cocok-by-nama hanya 12% karena nama di
  analisa dan di sheet harga memang beda penulisan (`"Pekerja"` → `"Pekerja /
  Pembantu Tukang"`); rumus Excel-nya yang dipanen → 12% → **77%**.
  **21 konflik rumus DITOLAK, tidak ditebak** — mis. `"Asbes Gelombang"` menunjuk
  D181 (Rp 60.000, benar) di satu tempat dan D194 = `"Genteng Morando Glasur"`
  (Rp 8.000) di tempat lain; keduanya sah secara Excel, isian workbook-nya yang
  salah (kelas sama dgn 42 cacat internal terdokumentasi). **257 resource sengaja
  dibiarkan tanpa harga** → fail-loud saat dipakai, founder mengisi lewat UI.
  Lingkup: nasional `company_id NULL` (dipakai bersama; workbook SE-47 sendiri
  menyatakan *"diubah sesuai harga daerah masing-masing"*) · Cibuluh → company
  founder, Kab. Bandung (keputusan founder 2026-07-29). Idempoten.
  ⚠️ **TEMUAN TERBUKA (bukan dari pekerjaan harga)**: blok `B.3 BONGKARAN KERAMIK`
  koefisiennya berselisih — sistem 0,093/0,045 vs workbook 0,05/0,025. **Harganya
  identik persis**; yang beda koefisien, berasal dari **impor analisa (langkah
  8)**. Dataset mencatat sendiri alasannya (`"workbook 2 baris (0.043)"`) tapi
  blok B.3 di workbook hanya 2 baris — perlu ditelusuri terpisah.
- ✅ **4** Seed AHSP nasional PENUH: 2.620 assemblies (SE-47-2026) + 2.429 resources +
  15.149 komponen, terverifikasi 100% struktural (dataset↔DB↔workbook, nol mismatch)
  + fungsional (2.573 HSP cocok persis vs F workbook; 42 selisih = cacat internal
  workbook terdokumentasi, bukan bug pipeline). Idempotent — re-import file sama =
  no-op aman
- ✅ **5** Endpoint hitung RAB end-to-end + golden-file (HSP 278300, dari data dev)
- ✅ **6 Material Take-off SELESAI** — D2 agregasi lintas item (PR #98: satu baris
  per resource + drill-down provenance) · D3 BBS besi per-Ø + D4 katalog profil baja
  + D5 faktor kemasan (PR #100, migration 122/123: `rebar_takeoff`, `steel_profiles`
  58 profil ter-seed dari DAFTAR BESI verbatim, `material_pack`). Konstanta besi
  0,006165 diverifikasi = turunan fisika (ρ7850×π/4÷1e6) DAN cocok tabel baku SNI.
  **Titik-bocor #1: sisi take-off tertutup; pagu (langkah 7) masih terbuka**
- ✅ **7 RAP/Pagu SELESAI** (migrasi 138) — gerbang tripwire #1 terbuka setelah
  multi-tenant tuntas, jadi RAP lahir **dengan tenancy sejak baris pertama, nol
  backfill** (persis kompensasi yang dijanjikan saat CECEP ditunda).
  4 tabel: `rap_budget` · `rap_material_line` · `rap_labor_line` · `rap_change_log`.
  **Beda RAB dan RAP:** RAB = rencana **jual** (harga pasar + upah harian lewat
  AHSP); RAP = rencana **belanja** (harga supplier + **borongan** mandor) —
  selisihnya margin yang dikelola. Qty material **diturunkan** dari take-off
  langkah 6 memakai fungsi agregasi yang **sama** (bukan salinan logika), lalu
  **disalin** ke `qty_ahsp` — pagu adalah komitmen, dan angka yang ikut berubah
  tiap RAB/katalog AHSP disunting bukan komitmen. Hanya kategori **bahan** yang
  masuk pagu material; tenaga/alat lewat `rap_labor_line` (borongan) supaya upah
  tidak dianggarkan dua kali. `pagu` kolom **GENERATED** di DB — satu-satunya
  cara ia berbeda dari qty × harga adalah kalau diisi manual, dan itu tak bisa.
  **Lock**: line beku (guard DB, bukan hanya endpoint) · **tak bisa dibuka lagi**
  (kalau bisa: sunting → kunci ulang → change log kosong) · perubahan sesudahnya
  lewat `rap_change_log` yang **wajib beralasan** dan **tak punya policy
  UPDATE/DELETE** (jejak yang bisa disunting bukan jejak). Menolak lock saat pagu
  masih nol seluruhnya — biasanya harga supplier belum diisi, dan lock tak bisa
  dibatalkan. Permission `cecep:rap:view|manage` di-seed ke role yang **persis
  sama** dengan `cecep:estimate:*` (scope tak melebar).
  **D7 (sambung realisasi) SENGAJA belum dibangun** — desainnya sendiri menandai
  "discovery, jangan bangun"; titik sambung `resource_id` ↔ material procurement
  belum dipastikan.
- ✅ **8** AHSP Company: struktur DB ada sejak 107/117 · endpoint create-assembly
  hidup (PR #96) · **KATALOG COMPANY TER-SEED** (PR #101): 420 analisa Cibuluh +
  2.698 koefisien, verifikasi DB 100% nol-mismatch, idempoten. Paritas: exact 368 /
  cacat-SUM-workbook 39 / unexplained 6 / no_hsp 7.
  **Duplikat national→company**: sudah ada sejak PR #101 (endpoint `/adopt` +
  tombol "Jadikan analisa perusahaan"). **Edit (correction/deviation) — SELESAI
  (2026-07-30):** endpoint baru `POST /cecep/assemblies/:id/edit` — dua jenis
  sesuai §1.1–1.2 AHSP-EDITION-BUILDER-DESIGN.md: `correction` (perbaikan,
  source+edition_id TETAP sama, label dipertahankan) vs `deviation` (cara kerja
  sengaja beda; kalau asalnya national, OTOMATIS fork ke company — national
  tetap murni). Baris asal TAK PERNAH di-mutate (immutability M1-M2) — hanya
  dibaca lalu disalin ke versi baru (`version_number+1`, `edited_from` → asal).
  Gap tersembunyi yang ikut ketahuan & ditutup: `/adopt` dan `/edit` sama-sama
  melahirkan baris `draft`, tapi TIDAK ADA cara mengaktifkannya dari UI (picker
  komposer hanya menampilkan `status=active`) — endpoint baru
  `PATCH /cecep/assemblies/:id/activate` menutup ini utk kedua alur sekaligus.
  UI: tombol "Edit (versi baru)" + badge DRAFT + tombol "Aktifkan" di setiap
  baris KatalogTab (estimasi/page.tsx), modal pilih correction/deviation +
  ubah koefisien opsional-parsial (pola sama `AdopsiModal`). 8 test baru
  (869 total API, dari 861). **Diverifikasi E2E via Playwright (browser
  sungguhan, login admin nyata)** — alur penuh login→/estimasi→Katalog→filter
  →expand→Edit→pilih deviation→ubah koefisien→submit (201)→Aktifkan (200),
  semua terlihat benar di screenshot: badge DRAFT muncul/hilang tepat waktu,
  koefisien tersimpan sesuai input.
  **BUG PRE-EXISTING ikut ketahuan & diperbaiki lewat verifikasi ini
  (middleware.ts):** `ROLE_ALLOWED.admin` dan `.pm` **tidak menyertakan
  `/estimasi`** sejak halaman itu dibuat (PR #90) — middleware terakhir
  disentuh sebelum halaman ini ada (commit `1b42e96`, app-shell awal), tak
  pernah diupdate. Akibatnya admin/pm redirect balik ke `/dashboard` setiap
  kali mencoba buka `/estimasi` — **seluruh CECEP (langkah 1-8, 10 bulanan
  kerja) sebenarnya TAK BISA DIAKSES dari UI sejak awal**, hanya API yang
  pernah teruji. Ditambahkan `/estimasi` ke kedua daftar. **Tidak ada test
  untuk middleware.ts sama sekali** (web app tak punya test runner terpasang)
  — celah coverage terbuka, dicatat sebagai temuan, di luar scope PR ini
  (butuh setup vitest/jest utk apps/web, pekerjaan tersendiri).
  **Koreksi bug parser (2026-07-30, migrasi 141):** `extract-ahsp-cibuluh.py`
  mensyaratkan spasi wajib antara "1" dan kode satuan (`\b` gagal di 3 baris
  workbook tanpa spasi: "1 M1BONGKARAN...", "1M3 PASANGAN BALOK GORDING
  KY.KRUING/BORNEO"). Akibatnya 3 blok analisa (B.4, STD-58, STD-59) tak
  terdeteksi — komponennya bocor ke blok B.3 sebelumnya (dedup resource
  menjumlahkan koefisien: Pekerja 0,05+0,043=0,093, Mandor 0,025+0,02=0,045,
  SEHARUSNYA murni 0,05/0,025). Diverifikasi manual thd baris mentah workbook
  (0 regresi pada 433 blok lain yg sudah benar). B.3 lama diarsipkan
  `status='superseded'`, baris baru `edit_type='correction'` dgn koefisien
  benar (`edited_from` → baris lama, audit trail utuh). B.4/58/59 di-seed baru
  (existing di dataset, belum pernah ada di DB). Ditemukan lewat pertanyaan
  founder soal selisih HSP — bukan proses audit terjadwal.
- ⏸️ **9** dpp_factor split PPN — sengaja ditunda (gerbang D10, butuh guardrail
  di-run ulang di env ber-PPN nyata + aba-aba founder)
- ✅ **10** UI `/estimasi` (Komposer+Katalog+Harga+rekap-PPN) hidup + **layar
  Material & RAP — SELESAI (2026-07-30)**: tab ke-4 di `/estimasi`, picker
  proyek→RAP existing atau buat baru dari versi estimasi (skenario/versi sama
  yang dipakai tab Komposer). Tabel Material (qty RAB beku vs qty disesuaikan
  editable, harga supplier editable, pagu read-only computed) + Tabel Tenaga
  Kerja Borongan + tombol Kunci Pagu + badge status draft/locked + Log
  Perubahan (arsip pasca-lock, murni catatan — tak mengubah pagu tersimpan).
  Reuse skema DB migrasi 138 + endpoint API `rap.ts` (langkah 7) yang sudah ada.
  **BUG API PRE-EXISTING ditemukan & diperbaiki saat verifikasi E2E** (bukan
  buatan sesi ini, sudah ada sejak migrasi 138/PR RAP — belum pernah teruji
  lewat jalur HTTP, hanya trigger DB via INSERT manual): endpoint
  `POST /projects/:id/rap` dan seluruh endpoint turunan RAP (`GET/PATCH
  material`, `POST labor`, `PATCH lock`, `POST/GET change-log`) memanggil
  `.viaProject(tabel, ID_YANG_SALAH)` — tabel `rap_material_line`/
  `rap_labor_line`/`rap_change_log` terdaftar di peta tenancy dengan
  `lewat: 'rap_budget_id'` (bukan `project_id` — tabel-tabel ini memang tak
  punya kolom itu), tapi kode lama selalu mengirim `projectId`/`rap.project_id`
  sebagai argumen. Akibatnya: `POST /projects/:id/rap` selalu melaporkan
  `baris_material` benar tapi **rap_material_line selalu kosong** (query SELECT
  `estimate_items` filter salah kolom → 0 baris, gagal SENYAP tanpa error);
  `GET /rap/:id` dan endpoint lain punya DUA `.eq('rap_budget_id', ...)` dengan
  nilai BERBEDA yang saling AND → SELALU nol baris. Bug ini baru ketahuan
  karena diverifikasi end-to-end lewat browser sungguhan (login admin nyata,
  create RAP dari item RAB nyata) — test unit existing (`cecep-rap-pagu.test.ts`)
  tak pernah menyentuh jalur ini. Diperbaiki: semua panggilan `viaProject`
  untuk tabel ber-`lewat` khusus memakai ID yang benar (`rap.id`, bukan
  `rap.project_id`); ditambah error handling berisik (sebelumnya `error` dari
  query take-off tak pernah dicek) + rollback RAP yatim bila derivasi gagal.
  9 test HTTP baru (`cecep-rap-endpoint.test.ts`) menutup celah coverage ini —
  878 test total API (dari 869). Diverifikasi E2E penuh: create RAP → edit
  qty/harga → tambah borongan → kunci pagu → catat perubahan pasca-lock,
  semua lewat browser sungguhan dengan screenshot terverifikasi.

**Rantai "bikin RAB dari UI" hidup end-to-end** (langkah 1/3/4/5/8/10 + sebagian 2):
proyek → skenario → versi (menyatakan edisi) → item dari **katalog** / **custom
company mid-estimasi** (§2.2, menyentuh gerbang immutability `assemblies`, ditutup
approval desain) / **lump-sum** (§2.3, pekerjaan bukan-beranalisa) → price book
(lifecycle draft→verified→active) → engine paritas → **rekap per kategori + PPN**
→ Ajukan. Tiap rupiah ter-telusur ke `price_book_entry_id` + koefisien + edisi.
**Rantai "bikin RAP dari UI"** (langkah 6/7/10) juga hidup end-to-end sekarang:
RAB disetujui → RAP diturunkan dari take-off → sesuaikan qty/harga supplier →
kunci pagu → catat perubahan pasca-lock.

**PR #86–96 merged** (sumbu edisi 117/118 · thin-slice+seed penuh · price-resolver
+ compute path · scenario/price-book endpoints · UI 3-tab · rekap+PPN · polish
harga · item-custom/lump-sum). Analisis SE47-vs-Cibuluh selesai (report untracked
— nunggu keputusan masking; temuan: SE = SNI-2013 modernisasi, upah −33%, mortar
M/S/N/O = 1:2/3/4/5). AI-import edisi baru (masa depan) = inisiatif terpisah, tak
bertabrakan (parser+auditor, bukan penghasil angka) — lihat plan
`humming-weaving-snail.md`.

**Katalog AHSP di dev (terverifikasi 2026-07-30):** 2.620 nasional (SE-47-2026) +
421 company (420 Cibuluh aktif+1 superseded + 1 fixture) · 2.827 resources ·
58 profil baja.

**Build-order 10 langkah — SELESAI kecuali langkah 9 (2026-07-30):** langkah
1/3/4/5/6/7/8/10 ✅ SELESAI. Langkah 9 (dpp_factor split PPN) ⏸️ sengaja
ditunda — gerbang D10, butuh guardrail di-run ulang di environment ber-PPN
nyata + aba-aba founder eksplisit, bukan tugas teknis biasa (satu-satunya
sisa build-order CECEP; bukan blocker teknis, menunggu kondisi eksternal).
~~Langkah 10 sebagian: layar Material/RAP terpisah belum ada~~ — kini tab
ke-4 "Material & RAP" di `/estimasi`, lihat detail langkah 8/10 di atas.

Sisipan saat jeda gate (sesuai PETA §3, tidak menyela CECEP):
- **#2 celah 3-way match procurement DITUTUP 2026-07-27** (invoice manual wajib
  link GR, harga vs PO, anti invoice dobel + migration 121) — detail:
  `docs/DEVELOPMENT_LOG.md` entry 2026-07-27 + taksonomi §6.
- **#3 register piutang SELESAI 2026-07-28** — halaman `/piutang` (AR aging
  30/60/90 + register retensi + register DP) + potongan uang muka (recoupment)
  di invoice progres (migration 126/125) — detail: `docs/DEVELOPMENT_LOG.md`
  entry 2026-07-28 + taksonomi §14–15. ⚠️ Melahirkan keputusan terbuka #5.

Phase 1 (Program A) ✅ · Phase 2 (Program B) ✅.

## Ke mana membaca apa

| Butuh | Baca |
|---|---|
| **"Apa pekerjaan berikutnya?"** | **`docs/ROADMAP.md`** ← satu-satunya daftar pekerjaan + tracker |
| Log berjalan harian (per-migration/PR) | `docs/DEVELOPMENT_LOG.md` |
| Registry dokumen rencana (mana AKTIF/STALE) | `docs/PETA-PRIORITAS-ERP.md` (§3-nya SUPERSEDED oleh ROADMAP) |
| Status per-menu ERP terverifikasi kode | `docs/ERP-KONTRAKTOR-TAKSONOMI-MENU.md` |
| Strategi multi-tenant (AKTIF, ACCEPTED) | `.../Engineering-Constitution/adr/ADR-011-multi-tenant-strategy.md` |
| Klasifikasi 94 tabel A/AB/B/C/D + 3 temuan T1 | `.../Engineering-Constitution/adr/ADR-011-T1-AUDIT-KLASIFIKASI-TABEL.md` |
| Keputusan multi-company + tripwire (SUPERSEDED oleh ADR-011) | `docs/KEPUTUSAN-MULTI-COMPANY.md` |
| Status Phase 1/2 + temuan RLS/storage | `docs/superpowers/specs/2026-07-18-enterprise-architecture/PHASE-{1,2}-STATUS.md` |
| Urutan build CECEP (terkunci, 10 langkah) | `.../CECEP/MATERIAL-RAP-COMPANY-UI-DESIGN.md` + `.../CECEP/NEXT-EXEC-PREP.md` |
| Peta penomoran Program A–F ↔ Phase 0–9 | `.../Master-Delivery-Blueprint/NUMBERING-GLOSSARY.md` (⚠️ "Phase 7" EA = multi-company; "Fase 7" ERP_MASTER_PLAN = GL — selalu sebut sumber) |

## 📖 AUDIT DOKUMENTASI MENYELURUH — 2026-07-31

**Seluruh 233 file `docs/` dibaca isinya** (bukan judul) atas permintaan founder,
lalu tiap klaim penting **diverifikasi silang ke kode/DB nyata**. Hasil ringkas:

**Tindakan yang sudah diambil:**
- 🔒 **Repo dijadikan PRIVATE.** `CECEP/SE47-VS-CIBULUH-ANALYSIS.md` ternyata
  ter-commit padahal isinya sendiri memperingatkan *"UNTRACKED — jangan commit,
  memuat angka RAB Cibuluh nyata"* — nilai kontrak Rp 3,67 M + rincian per item,
  di repo publik. Ini juga menutup paparan 4 password test yang rotasinya ditunda.
- ✅ **BAC EVM diperbaiki** (lihat DEVELOPMENT_LOG 2026-07-31) — temuan
  berdampak-tertinggi dari audit ini.

**Tiga klaim dokumen yang ternyata SUDAH USANG** (dokumen bilang "belum",
kode bilang "sudah") — jangan percaya ketiganya lagi:
| Klaim | Kenyataan (diverifikasi ke DB dev) |
|---|---|
| `ADR-011-T5c` R5: "`auth_client_id()` belum filter company" | **Sudah** — migrasi 133 |
| Taksonomi + `02-security`: "trigger append-only 073 masih DORMAN" | **Sudah aktif** — `tgenabled='O'` |
| `Engineering-Constitution/08-testing`: "nol infrastruktur test" | **883 test hijau** — badge beku sejak v1.1 Juli-18 |

**Gap NYATA yang terverifikasi (urut dampak):**
1. ~~**`apps/web` sama sekali di luar CI**~~ — **✅ DITUTUP 2026-07-31** (A1).
   Job `web` (lint-ratchet + typecheck + build) kini ada di `ci.yml`, tanpa
   `needs: api` supaya kegagalan frontend terlihat cepat.
   **Dua bug pre-existing ikut ketahuan & diperbaiki** — keduanya hanya bisa
   bersembunyi karena web tak pernah di-CI: (a) **5 error TS2322** di
   `components/ui/*.tsx` — `@types/react@18` milik `apps/mobile` ikut termuat
   lewat hoist pnpm, `LegacyRef` React 18 (masih mengizinkan string ref)
   bentrok dengan `Ref` React 19; akarnya `jsx: "react-jsx"` yang meng-import
   `react/jsx-runtime` implisit di tiap `.tsx`, ditutup lewat `paths` di
   `apps/web/tsconfig.json`. (b) **6.070 dari 6.503 lint problem ternyata SEMU**
   — dari `ds-bundle/` (keluaran bundler, sudah di `.gitignore` tapi tetap
   dipindai eslint). Kode asli hanya 433; kini 0 error + 431 warning terkunci
   ratchet per-rule (`apps/web/scripts/lint-ratchet.mjs`).
2. ~~**Nol dependency scanning & secret scanning**~~ — **✅ DITUTUP 2026-07-31** (A2).
   Job `keamanan`: `pnpm audit --audit-level=high` + gitleaks atas SELURUH
   riwayat (`fetch-depth: 0` — rahasia yang di-commit lalu dihapus tetap
   terdeteksi; relevan karena repo sempat publik).
   **Audit pertama menemukan 1 critical + 35 high yang nyata** → ditutup:
   `axios`/`next` di-upgrade langsung · 11 paket transitif dipaksa lewat
   `overrides` di **`pnpm-workspace.yaml`** (⚠️ sejak pnpm v10 dibaca dari sana,
   BUKAN `package.json` — kalau salah tempat ia diabaikan diam-diam) ·
   `xlsx` dipindah ke tarball resmi SheetJS 0.20.3 (npm mentok di 0.18.5 yang
   rentan; jalur `XLSX.read` atas unggahan pengguna ada di `rab.ts:627`) ·
   pnpm 11.5.2 → 11.8.0 di 5 tempat. Hasil: **exit code 0**.
   Dua entri `auditConfig.ignoreGhsas` ber-alasan terverifikasi (xlsx =
   false-positive versi-dari-URL; brace-expansion = tak bisa di-override tanpa
   mematikan ESLint, dan tak punya permukaan serang di runtime).
3. ~~**`@typescript-eslint/no-explicit-any` di-set `"off"`**~~ — **✅ DITUTUP
   2026-07-31** (A3). Dinyalakan sebagai `warn` + ratchet per-rule
   (`apps/api/scripts/lint-ratchet.mjs`; ambang 227 `any` + 16 `unused-vars`),
   dan step Lint di CI job `api` kini memanggil ratchet itu.
   Mematikan rule sambil tetap menuliskan MUST di dokumen adalah bentuk
   terburuk — standarnya **terlihat** ditegakkan padahal tidak. Kini aturan
   selaras dengan praktik, hutangnya terukur, dan tak bisa diam-diam bertambah.
4. ~~**Nol audit aksesibilitas**~~ — **✅ DITUTUP 2026-07-31** (A4).
   `eslint-plugin-jsx-a11y` diaktifkan penuh. Sebelumnya `eslint-config-next`
   hanya membawa segelintir rule bawaan (cuma `alt-text` aktif) — jadi "cuma 3
   temuan a11y" selama ini menyesatkan: sisanya memang tak pernah diperiksa.
   **Begitu dinyalakan: 498 temuan.** 255 `label-has-associated-control`
   (pembaca layar tak bisa menyebutkan field yang sedang diisi) · 117+115
   `click-events`/`no-static-element-interactions` (**bisa diklik tapi tak bisa
   dijangkau keyboard** — melanggar MUST #7 langsung) · 11 lainnya.
   Diturunkan ke `warn` + ratchet per-rule (pola A1). **Dua rule dimatikan
   dengan alasan terverifikasi satu per satu**, bukan diasumsikan:
   `alt-text` (3 temuan semuanya bukan `<img>` HTML — `Image` dari lucide-react
   & @react-pdf/renderer) dan `no-autofocus` (4 temuan semuanya field pertama
   di dalam **modal**, yang justru pola benar untuk dialog).
5. **T10** (`ADR-011-T9` §5): `auth_role()` baca `users.role_id` (peran global),
   bukan `company_members.role_id` (peran per-company). Diverifikasi di DB: benar.
   Tak bergejala hari ini (satu company), menggigit saat badan usaha kedua dibuat.
5b. ~~**`financial_config` anti-overlap lintas-tenant**~~ — **✅ DITUTUP 2026-07-31**
   (migrasi 145). Constraint `no_overlap_financial_config` (086) mengunci
   `(key, daterange)` saja; migrasi 127 menambah `company_id NOT NULL` tapi
   constraint-nya **tak ikut diperbarui**. Akibatnya badan usaha KEDUA tak bisa
   menetapkan tarif pajaknya sendiri — perusahaan pertama memegang rentang
   tanggalnya, dan tanpa `company_id` dalam perbandingan keduanya dianggap
   bertabrakan. **Dibuktikan di dev** (transaksi di-rollback): sebelum `23P01
   exclusion_violation`, sesudah berhasil. Kelas cacat yang persis dijaga
   tripwire multi-company: nol gejala pada satu tenant, menggigit tepat saat
   tenant kedua lahir. Ikut ditutup di kode: `setFinancialConfig()` menutup
   rentang lama **tanpa filter company** (menyapu tarif seluruh perusahaan) dan
   menyisip tanpa `company_id`; parameter `companyId` kini **wajib** sehingga
   "lupa" gagal saat kompilasi, bukan diam-diam berlaku ke semua tenant.

6. **ADR-011-T4 belum tuntas** — 468 akses `supabase` mentah tersisa di 9 modul
   (`clients`, `users`, `roles`, `settings`, `audit`, `documents`, dst). Ratchet
   `tenancy-ratchet.test.ts` mencegah memburuk, tapi tidak menyelesaikan.
7. **Rekonsiliasi pagu RAP vs realisasi belanja** (§D7) — gerbang "jangan bangun"
   sudah lewat karena RAP kini live. Sisa terbesar Lima Pembeda #1.

**Rancangan matang yang terlantar** (ada spesifikasinya, belum dibangun):
`ERP_MASTER_PLAN.md` Modul 9a (RAB hard-guard di MR, lengkap rumus validasi),
9b (PO ke WhatsApp/email), 10 (GL + Chart of Accounts + tabel auto-jurnal per
event) · `AHSP-EDITION-BUILDER-DESIGN` §3.5 (laporan perbandingan antar-edisi —
sumbu edisi sudah ada, manfaatnya belum dipanen) · `GOLDEN-FILE-SPEC` (paritas
end-to-end satu RAB nyata; harness ada, fixture nyata belum).

**Cacat administratif dokumen** (kecil, menyesatkan pembaca baru):
`SUB-FASE-1B-COMPLETION-AUDIT.md` masih template kosong berdampingan dengan
`PHASE-1B-COMPLETION-AUDIT.md` yang terisi · `CI-ISOLATION-SETUP.md` masih
tertulis "⛔ MENUNGGU PROVISIONING FOUNDER" padahal sudah tuntas ·
`runbook-kasbon-workflow-cutover.md` merujuk objek DB yang sudah di-drop.

⚠️ **`Phase1/` JANGAN DIPINDAH** — disitasi 123× oleh Engineering-Constitution
(dokumen mengikat) **dan** oleh `apps/api/vitest.config.ts:15` di kode produksi.
Selesai sebagai fase kerja, hidup sebagai basis bukti.

---

## Keputusan terbuka menunggu Nizar

~~**A. "≥2 kontributor review"**~~ — **TERJAWAB 2026-07-28**: ack tertulis founder +
   **Dokumen Audit Pra-Eksekusi** wajib untuk T3 & T5 (diff lengkap · angka
   sebelum/sesudah hasil dry-run · rencana rollback teruji · daftar yang TIDAK
   diverifikasi). Pengecualian diakui sadar. Detail: ADR-011 §10 R7.
**B. (tidak memblokir) Pelanggan pertama punya >1 badan usaha?** Menentukan
   apakah butuh level `tenants` di atas `companies` sekarang atau cukup nanti.
   Default sementara: cukup `companies` + `parent_company_id`. ADR-011 §3.

~~**C. Ack + 2 jawaban T3**~~ — **TERJAWAB 2026-07-29** (Q1=privat, Q2=sekarang;
   plus 2 keputusan gerbang di §10b dokumen). T3 SELESAI di-apply ke dev.
   Rincian lama:
   **`.../adr/ADR-011-T3-AUDIT-PRA-EKSEKUSI.md`** (baca §0 ringkasan 1 menit →
   §5 apa yang bisa rusak → §7 yang tidak diverifikasi). Angka nyata: **32 tabel,
   23.030 baris** (2.180 → tenant-1; 20.850 sengaja tetap NULL = milik bersama,
   termasuk 2.620 AHSP nasional yang TIDAK boleh jadi milik satu pelanggan).
   Dua pertanyaan yang harus dijawab dulu:
   **Q1** `suppliers` bersama atau **privat**? (rekomendasi saya: **privat** —
   relasi supplier = rahasia dagang; salah ke arah "terlalu terbuka" jauh lebih
   sulit diperbaiki setelah pelanggan kedua masuk. Cuma 5 baris: murah sekarang)
   · **Q2** `SET NOT NULL` **sekarang** atau setelah T4? (rekomendasi: sekarang —
   error di dev = informasi murah, konsisten P1).
   **Tanpa ack, T3a/T3b/T3c tidak dijalankan.**

**Mandat eksekusi (founder 2026-07-29):** *"saya setuju apa aja yang kamu
putuskan asal hasilnya terbaik"* — keputusan TEKNIS diambil sendiri, tanpa
bertanya per-langkah. Yang tetap dilaporkan (bukan ditanyakan): keputusan yang
mengubah **jaminan sistem** (mis. membuka gerbang immutability, melepas
service_role) dan keputusan **produk/pajak**. Dokumen Audit Pra-Eksekusi T5
tetap dibuat — bukan untuk minta izin, tapi karena founder sendiri
menetapkannya 2026-07-28 sebagai pengganti reviewer kedua, dan ia disiplin yang
berguna untuk tahap paling berisiko.

~~0. **KEAMANAN: rotasi 4 password test**~~ — **DITUNDA atas keputusan founder
   2026-07-29.** Alasan founder: sistem belum dipakai operasional nyata, dan repo
   akan **dikembalikan ke private** sebelum go-live.
   ⚠️ **Syarat yang mengikat:** rotasi tetap WAJIB dilakukan **sebelum**
   (a) data operasional nyata masuk, ATAU (b) pengguna di luar founder diberi
   akses — mana yang lebih dulu. Nilai lama tetap ada di riwayat git; mengubah
   repo jadi private **tidak menghapus** yang sudah terlanjur ter-index/ter-clone.
~~1. Masking angka Cibuluh~~ — report SE47-vs-Cibuluh sudah tak ada di working
   tree (diverifikasi 2026-07-29). Ikut ditunda bersama keputusan #0 (alasan
   sama: repo akan private).
1b. Drop policy dev `"Allow all access on users"` (only-in-dev, permisif, tanpa
   migrasi pembuat — temuan schema-diff 4a) + konfirmasi migrasi 043–047
   (GL/asset/opname/SCM) tetap forward-draft.
1c. Izin A5 `--execute`: schema `test` residu di dev + residu CECEP
   (570 estimate_items dll — dry-run sudah dilaporkan).
   **+ TAMBAHAN 2026-07-31:** `lessons_learned_records` **668 baris, 668-nya
   `[TEST]` dan SELURUHNYA yatim** (project induk sudah terhapus; anaknya
   selamat karena trigger no-delete memblokir cascade). Nol baris nyata.
   Ini yang membuat modul Lessons Learned tampak "punya 668 data" di audit
   jalur hidup padahal isinya nol — dan karena itu sempat terlihat seperti
   fitur hidup yang cuma kurang UI. **Tidak dihapus tanpa izin** (CLAUDE.md:
   hapus data = berhenti & tanya).
2. GL in-app vs akuntansi eksternal (`docs/PETA-PRIORITAS-ERP.md` §5).
3. Entitas PT/CV kedua realistis 1–2 tahun? (`docs/KEPUTUSAN-MULTI-COMPANY.md` §2).
~~4. Aktifkan trigger audit append-only 073~~ — **SUDAH AKTIF** (diverifikasi
   query ke dev 2026-07-29: `trg_audit_logs_no_update`/`no_delete` tgenabled='O').
   Sempat dibuka SEKALI saat backfill T3 lalu dipasang kembali + dicek eksplisit.
5. **Pajak atas potongan DP** (baru 2026-07-28): saat DP dipotong di invoice
   progres, pajak invoice progres saat ini tetap dihitung dari nilai progres
   PENUH (sebelum potongan DP) — konsisten kalkulasi existing, TIDAK diubah.
   Porsi DP sudah kena pajak saat invoice DP diterbitkan → berpotensi pajak
   dobel atas porsi DP. Perlu keputusan owner + konfirmasi konsultan pajak:
   DPP invoice progres = nilai progres penuh ATAU dikurangi potongan DP.
   (`docs/DEVELOPMENT_LOG.md` entry 2026-07-28.)
