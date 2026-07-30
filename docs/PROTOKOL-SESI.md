# PROTOKOL SESI — baca ini dulu, di setiap sesi, sebelum aksi apa pun

**Sifat file ini:** cara membaca, bukan isi yang dibaca. Sengaja tidak memuat fase
aktif/tahap/tanggal — itu semua berubah (buktinya: 2026-07-28 berubah dua kali
dalam satu hari, lihat `STATUS.md`). Menyalin fakta ke sini = duplikasi yang pasti
basi. File ini hanya dibaca ulang tiap kali; isinya sendiri jarang berubah.

---

## 1. BOOT — urutan baca WAJIB, jangan lompat

```
git pull origin main          ← pedoman hidup di main, bukan di ingatanmu
  → AUTOPILOT.md               (charter + Red-Line §5)
  → STATUS.md (root)           (fase aktif SEKARANG + keputusan terbuka — SUMBER KEBENARAN)
  → docs/PETA-PRIORITAS-ERP.md (dokumen induk: registry semua dokumen AKTIF/STALE + ranking)
  → dokumen fase/ADR yang ditunjuk STATUS.md untuk misimu
```

Kalau misimu menyentuh sesuatu yang STATUS.md tandai sebagai **"Keputusan terbuka
menunggu Nizar"** atau **ditunda/dibekukan** → BERHENTI, laporkan, jangan mengisi
kekosongan dengan asumsi sendiri. STATUS.md sudah terbukti berubah arah drastis
dalam satu hari (lihat riwayat ADR-011) — kalau instruksi misimu ditulis sebelum
perubahan itu, **STATUS.md menang**, bukan instruksi lama.

## 2. HIERARKI OTORITAS kalau dokumen bentrok

```
AUTOPILOT §5 Red-Line
  > keputusan/ADR owner bertanggal PALING BARU (cek tanggal — bukan cek nama file)
  > DOMAIN.md + HARDCODE-CENSUS
  > roadmap 04 + Never Build List + ADR lain
  > desain per-modul (CECEP dkk)
  > STATUS.md / dokumen status
  > dokumen bertanda STALE di PETA-PRIORITAS (kalah dari semuanya — koreksi, jangan ikuti)
```

Kontradiksi baru → LAPORKAN + rekonsiliasi eksplisit. HARAM memilih satu sisi
diam-diam. Kalau kamu menemukan ADR yang mengamandemen ADR lain, ADR yang lebih
baru menang — tapi tetap laporkan keduanya, jangan berasumsi yang lama sudah tak
relevan sama sekali (bisa jadi diamandemen sebagian saja).

## 3. TRIPWIRE & GUARDRAIL YANG SUDAH TERBUKTI BEKERJA — jangan dilonggarkan

Ini bukan teori — `KEPUTUSAN-MULTI-COMPANY.md` §2 pernah menulis dua tripwire,
dan **keduanya benar-benar terpicu** di ADR-011 (lihat referensinya). Pola ini
akan terjadi lagi; jangan anggap tripwire sebagai dekorasi dokumen.

- **Cek STATUS.md untuk tripwire yang sedang AKTIF sekarang** — jangan asumsikan
  daftar tripwire selalu sama dengan sesi sebelumnya.
- Guardrail yang berlaku lintas-fase apa pun (tidak pernah dicabut tanpa Red-Line
  eksplisit): uang NUMERIC (bukan float) · timestamp TIMESTAMPTZ · config
  finansial effective-dated · tidak ada tabel single-row baru · config/numbering
  baru harus scope-able · jangan hardcode nama badan usaha di logic ·
  additive-first (nol fitur existing hilang) · RLS deny-by-default.
- Dicoret owner (jangan pernah usulkan ulang tanpa ADR baru): multi-currency/kolom
  kurs, i18n, SSO/SAML, GDPR/data-residency, IFRS (acuan tetap PSAK).

## 4. DISIPLIN BUKTI (AUTOPILOT §6, tanpa kecuali)

- Verify, jangan asumsi: klaim "ada/selesai/applied" wajib bukti file:line, grep,
  atau query DB. Tak terverifikasi → tulis "belum terverifikasi", jangan menebak.
- Bedakan TIGA LAPIS sebelum bilang fitur "ada": (a) migration tertulis ≠
  (b) di-apply + engine/test ≠ (c) route + UI hidup. Sebut lapisnya secara eksplisit.
- Menemukan dokumen keliru/basi saat kerja → PERBAIKI dokumennya sekalian
  (anti teks-basi) — termasuk STATUS.md, PETA-PRIORITAS, taksonomi.
- Klaim skala/status di dokumen lama (CLAUDE.md versi lawas, MODULE_STATUS,
  DATABASE_SCHEMA, API_ENDPOINTS) sudah pernah terbukti basi — jangan percaya
  angka di sana tanpa cek silang ke STATUS.md + kode nyata.

## 5. ETIKA MULTI-SESI (working tree sering dipakai bersama)

- File untracked/modified yang BUKAN buatanmu = pekerjaan sesi lain yang sedang
  berjalan. Jangan sentuh, commit-kan, hapus, atau "rapikan".
- Kerja di branch sendiri. Kalau perlu isolasi sementara pakai `git worktree`
  terpisah, bukan checkout di tree bersama.
- Merge policy: branch → PR → CI hijau → merge. Jangan commit langsung ke main.
- `git pull` di awal DAN sebelum menulis STATUS.md/PETA — dua sesi paralel bisa
  sama-sama mengubah fase aktif; jangan menimpa perubahan sesi lain tanpa membaca
  diff-nya dulu.

## 6. DEFINITION OF DONE

Belum selesai sebelum:
- Test/typecheck/lint hijau + bukti verifikasi dilampirkan di laporan.
- `STATUS.md` di-update (tanggal + fase aktif + keputusan terbuka baru bila ada)
  — bagian DoD, bukan opsional. Dokumen lain yang jadi basi akibat kerja ini
  ikut dikoreksi di PR yang sama.
- **`docs/ROADMAP.md` di-update** bila kerja ini menyelesaikan/mengubah item di
  sana: status + nomor PR + tanggal. **Status tanpa bukti PR tidak dihitung.**
  Inilah yang membedakan tracker hidup dari daftar keinginan yang membusuk —
  repo ini sudah punya 8 kontradiksi terdokumentasi akibat dokumen rencana yang
  tak pernah diperbarui (`PETA-PRIORITAS-ERP.md` §2).
- Laporan akhir memuat: (1) apa yang berubah + link PR, (2) bukti verifikasi,
  (3) dokumen apa yang di-update, (4) keputusan terbuka baru untuk founder,
  (5) apa yang SENGAJA tidak disentuh dan kenapa.

## 7. KAPAN BERHENTI

Berhenti HANYA untuk: Red-Line AUTOPILOT §5 · keputusan terbuka di STATUS.md yang
menghalangi misimu · trade-off produk milik owner · instruksi misi yang ternyata
bertentangan dengan STATUS.md terbaru (laporkan kontradiksinya, jangan diam-diam
memilih). Di luar itu: kerjakan sampai tuntas, lapor hasil — bukan minta izin
melangkah tiap step.
