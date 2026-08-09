# KEPUTUSAN SCOPE — ERP Kontraktor Lengkap, Terintegrasi, Berbasis AI

**Tanggal:** 2026-08-01 · **Diputuskan:** founder (Nizar) · **Sifat:** MEMBALIK
sebagian keputusan scope 2026-07-26. Dokumen ini menang atas pernyataan scope
mana pun yang lebih lama.

> ## ⚠️ AMANDEMEN 2026-08-09 — urutan §5 berubah
>
> Founder: *"untuk urusan ai saya mau tiru semua, dan termasuk konfigurasi api
> nya juga yg dikonfig dari ui semua … bila menabrak aturan, aturannya
> rubahlah."*
>
> **Yang berubah:** §5 menempatkan seluruh AI di Gelombang 4. **AI kini dipecah
> dua**, dan hanya separuhnya yang tetap di sana:
>
> | Bagian | Gelombang | Alasan |
> |---|---|---|
> | Lapisan platform AI — provider config dari UI, kredensial terenkripsi, pelacakan biaya, penjadwal, inbox approval | **SEKARANG** | Tak satu pun membaca angka finansial. Semuanya justru lantai yang harus ada supaya AI kelak aman dibangun |
> | Asisten read-only + WhatsApp + preview-approve | **SEKARANG, bertahap** | Aturan §4 #5 tetap ditegakkan sebagai urutan, bukan sebagai penundaan |
> | **Tool yang menjawab pertanyaan finansial** (laba-rugi, WIP, profitabilitas per proyek) | **TETAP MENUNGGU** #15 WIP/PSAK & #16 rantai kontrak | Bagian §4 yang alasannya masih berlaku penuh |
>
> **Yang TIDAK berubah:** kelima aturan mengikat di §4 — termasuk *no silent
> write* dan *pilot pertama read-only*. Keduanya diperiksa terhadap pola
> `preview_approve` TJS dan **terbukti terpenuhi**: di TJS, model secara
> arsitektur tak mampu menulis (hanya tool `preview_*` yang terdaftar;
> eksekutornya bukan tool sama sekali). Rinciannya, beserta sepuluh cacat TJS
> yang **diperbaiki alih-alih ditiru**, ada di:
>
> **`docs/superpowers/specs/2026-08-09-lapisan-ai-dan-platform-design.md`**
>
> Alinea "urutan mengikat" di §5 dibaca dengan amandemen ini.

---

## 1. Pernyataan tujuan

> **ERP kontraktor yang lengkap, terintegrasi, dan berbasis AI.**

Tiga kata itu masing-masing punya konsekuensi terukur. Ditulis di sini supaya
tak ditafsir ulang tiap sesi.

---

## 2. Apa yang BERUBAH dari keputusan 2026-07-26

Keputusan lama menetapkan target "kualitas sekelas ERP besar **untuk bisnis
sendiri**", dan mencoret empat kantong sebagai "sengaja tidak dibangun".
**Keempatnya kini MASUK.**

| Kantong | Status LAMA (2026-07-26) | Status BARU (2026-08-01) |
|---|---|---|
| QA/QC formal (§10) + HSE/K3 (§11) | 🔴 "bangun saat tender mensyaratkan" | **MASUK** — ±40 sub-menu |
| GL / jurnal / akuntansi in-app (Modul 10) | ⛔ keputusan owner terbuka: in-app vs eksternal | **MASUK — in-app** |
| Payroll staf + BPJS + PPh 21 (§12) | ⛔ "pakai tool eksternal" | **MASUK** |
| Aset & alat berat penuh (§13) | 🔽 diperkecil jadi "tracking sewa saja" | **MASUK penuh** — register, penyusutan, maintenance |

**Konsekuensi angka yang harus diterima jujur:** 71 sub-menu 🔴 di taksonomi yang
sebelumnya berstatus *keputusan sadar untuk tidak dibangun* kini berubah jadi
**utang pekerjaan**. Persentase progres ikut turun karena penyebutnya membesar —
itu bukan kemunduran, itu penyebut yang akhirnya jujur terhadap tujuan.

**Yang TETAP dicoret** (tak dibatalkan oleh keputusan ini): multi-currency,
i18n/multi-bahasa, SSO enterprise, IFRS (tetap PSAK), dan seluruh Never Build
List (EAV penuh · BIM 3D viewer · LMS · ESG native · FM/O&M · microservices
default · Kafka · rebuild Supabase Auth/Storage). Alasannya tak berubah: semua
proyek Rupiah, satu bahasa, satu negara.

---

## 3. "Terintegrasi" — keempat maknanya dipakai sekaligus

Founder memilih **keempat** bentuk integrasi, bukan salah satu:

| Bentuk | Isi | Catatan biaya/gerbang |
|---|---|---|
| **A. Antar-modul** | RAB → MR → PO → GR → stok → biaya → laporan → **GL** | Sebagian sudah jalan. GL adalah muara yang selama ini hilang |
| **B. WhatsApp permukaan utama** | Voice note, foto nota, approval dari WA | **Butuh WhatsApp Business API berbayar** + verifikasi bisnis Meta. Gerbang eksternal, bukan teknis |
| **C. Sistem luar** | Akuntansi, e-Faktur pajak, bank (rekening koran), marketplace material | Tiap integrasi butuh kredensial + API pihak ketiga. Gerbang eksternal |
| **D. Mobile lapangan penuh** | Absensi, progress, foto geotag, **offline-first** | Kriteria Kualitas #5 dinilai LEMAH persis karena ini |

**Catatan penting soal B dan C:** keduanya punya gerbang di luar kendali
pengembangan — akun bisnis terverifikasi, biaya per-pesan, kredensial API pihak
ketiga. Pekerjaan sisi kita bisa disiapkan lebih dulu (adaptor + antarmuka),
tapi "hidup"-nya menunggu gerbang itu dibuka founder.

---

## 4. "Berbasis AI" — urutannya diputuskan: ROADMAP dulu

Founder memilih **menyelesaikan 8 item ROADMAP sisa lebih dulu, baru AI.**

### Kenapa keputusan itu tepat secara teknis

Bukan sekadar preferensi urutan. Dua dari 8 item sisa adalah **data yang justru
akan dibaca AI**:

- **#15 WIP/PSAK** — pengakuan pendapatan. Tanpa ini, L/R per proyek tidak
  bermakna. AI yang ditanya "proyek mana yang rugi?" akan menjawab dari angka
  yang pembukuannya belum benar — **percaya diri dan salah**, kelas kesalahan
  paling berbahaya untuk sistem yang dipakai mengambil keputusan.
- **#16 Rantai kontrak** — denda, EOT, jaminan. Sama: uang nyata yang belum
  terekam berarti AI menghitung dari basis yang bolong.

Prinsip 6 doc 06 ("AI tidak pernah mengarang jawaban saat tidak yakin") tak bisa
ditegakkan kalau datanya sendiri yang bolong — AI tak punya cara tahu bahwa
angka yang dibacanya belum lengkap.

### Fakta yang perlu dicatat: gerbangnya sudah terbuka

Diverifikasi 2026-08-01 dari `06-agentic-ai-and-automation-architecture.md`:

```
140 automation terkatalog · Now 0 · Next 13 · Later 65 · Optional 62
AI Executive Assistant = "Next (setelah Phase 1-2)"  ← Phase 1 & 2 SELESAI
```

Artinya blocker lama sudah lunas — yang menahan sekarang **hanya kualitas data**,
dan itu persis yang dikerjakan 8 item sisa. Sementara itu, di kode: **nol baris
AI, nol dependency** (`openai`/`anthropic`/`langchain`/`pgvector` — nihil).

### Aturan yang mengikat saat AI mulai dibangun

Diwarisi penuh dari doc 06, dicatat di sini supaya tak perlu dibaca ulang:

1. **No silent write.** Setiap automation yang mengubah data finansial,
   kontraktual, atau status resmi berhenti di approval manusia — tanpa kecuali,
   sekecil apa pun nilainya.
2. **WhatsApp = client baru, bukan jalan pintas.** Lewat API dan permission
   engine yang SAMA dengan dashboard. Tak ada bypass otorisasi.
3. **Spending limit + rate limit per agent.** Tak ada agent berwenang finansial
   tak terbatas, bahkan dengan approval manusia.
4. **Explainability wajib.** Tiap jawaban finansial menyebut sumbernya
   ("berdasarkan 12 invoice bulan ini"), bukan angka telanjang.
5. **Pilot pertama read-only.** AI Executive Assistant — boleh ditanya, tak boleh
   menulis. Risiko finansial nol saat kepercayaan belum terbangun.

---

## 5. Urutan kerja yang mengikat

**Diagram di bawah sudah DIAMANDEMEN 2026-08-09** (lihat kotak di kepala
dokumen). Bentuk lamanya ada di git history.

```
SEKARANG ─→ 8 item ROADMAP sisa (#14,15,16,17,20,23,24 + E9/E10/E12 founder)
   ║         ↓ termasuk #15 WIP/PSAK & #16 rantai kontrak = fondasi angka
   ║
   ╚═ PARALEL ─→ LANTAI PLATFORM (amandemen 2026-08-09)
                 kredensial terenkripsi → penjadwal → inbox approval
                 → provider AI dari UI → pelacakan biaya
                 → asisten READ-ONLY → WhatsApp → preview-approve
                 ↑ tak satu pun membaca angka finansial, jadi tak
                   bergantung pada 8 item di atas

GELOMBANG 2 ─→ Kantong yang baru masuk: GL in-app · QA/QC+HSE · payroll · aset
             ↓ GL adalah muara integrasi antar-modul (bentuk A)
GELOMBANG 3 ─→ Mobile lapangan penuh + offline (bentuk D)
             ↓ menutup Kriteria Kualitas #5 yang kini LEMAH
GELOMBANG 4 ─→ TOOL AI FINANSIAL saja: laba-rugi, WIP, profitabilitas proyek
             ↓ inilah bagian yang benar-benar membaca GL
```

Urutan ini bukan selera. Tiap panah adalah **dependensi data**.

**Yang dikoreksi amandemen:** versi lama memperlakukan "AI" sebagai satu blok
tunggal yang seluruhnya bergantung pada GL. Itu terlalu kasar. Yang bergantung
pada GL adalah **jawaban finansialnya** — bukan konfigurasi provider, bukan
penjadwal, bukan kredensial, bukan asisten yang menjawab *"berapa progress
Cibuluh?"* dari `progress_logs`.

Menahan seluruh lapisan platform demi satu kelas pertanyaan berarti menunda
lantai yang justru dibutuhkan **supaya kelas pertanyaan itu kelak bisa dijawab
dengan aman**.

---

## 6. Yang harus diakui di depan

**Ini scope yang jauh lebih besar dari sebelumnya.** Jujur menyatakannya lebih
berguna daripada optimisme yang belakangan jadi kekecewaan:

- Progres terhadap ROADMAP saat ini 71% — angka itu **akan turun** begitu
  gelombang 2–4 masuk sebagai item, karena penyebutnya membesar.
- Dua gerbang di luar kendali teknis: **WhatsApp Business API** (berbayar,
  verifikasi Meta) dan **kredensial integrasi luar**. Pekerjaan sisi kita bisa
  siap lebih dulu, tapi tak bisa "hidup" tanpa itu.
- GL in-app adalah modul dengan konsekuensi terbesar: sekali angka masuk jurnal,
  ia jadi rujukan resmi. Chart of Accounts **wajib divalidasi akuntan** sebelum
  migrasi 047 di-apply — itu sebabnya ia sengaja jadi forward-draft selama ini.

**Yang TIDAK berubah:** disiplin kerjanya. Tiap modul baru tetap lewat
lib→test→mutation-test→API→UI, tetap §9a (tak "selesai" sebelum ada pemakainya),
tetap ratchet yang hanya boleh turun. Scope membesar bukan alasan menurunkan
standar — justru sebaliknya, karena permukaan yang salah jadi lebih luas.

---

## 7. Dokumen rujukan

| Untuk | Baca |
|---|---|
| Arsitektur AI & 140 automation | `superpowers/specs/…/06-agentic-ai-and-automation-architecture.md` |
| AI cost engineering (Excel-first) | `…/CECEP/48-phase10-ai-cost-engineering.md` |
| Peta menu & status per sub-menu | `ERP-KONTRAKTOR-TAKSONOMI-MENU.md` |
| Antrean pekerjaan + tracker | `ROADMAP.md` |
| Keputusan multi-company (tripwire) | `KEPUTUSAN-MULTI-COMPANY.md` |
