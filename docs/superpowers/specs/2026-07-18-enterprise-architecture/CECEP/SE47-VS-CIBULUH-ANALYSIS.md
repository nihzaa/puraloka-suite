# SE 47/2026 vs Cibuluh — Analisis Perbandingan (4d, REPORT ONLY)

> **Status:** analisis atas file, tidak ada yang dibangun. **UNTRACKED — jangan commit dulu**:
> memuat angka RAB Cibuluh nyata; repo sudah public dan keputusan masking angka Cibuluh
> masih menunggu founder (lihat laporan sweep dokumen publik).
> Sumber: `_source/ahsp/golden/RAB Gudang Cibuluh Sumedang bobot.xlsx` (SNI 2013 vintage)
> vs `AHSP CIPTA KARYA SE BINA KONTRUKSI NO. 47 TAHUN 2026.xlsm` (2669 analisa terekstrak).
> Artefak antara (JSON) di scratchpad sesi; skrip reproduksi `match_v5.py`.

## 0. Metode (sesuai instruksi: match by uraian bukan kode, HSD sama dua sisi)

1. **BoQ → analisa Cibuluh**: value-join `BoQ.harga_satuan == ANALISA.Dibulatkan` (75 baris BoQ).
2. **Analisa Cibuluh → SE 47**: setelah fuzzy-uraian terbukti rapuh (notasi beda vintage),
   pairing final memakai **sidik-jari KOEFISIEN** (signature match): wajib ≥2 koefisien
   MATERIAL identik persis ATAU (signature ≥0.6 + uraian ≥0.5); pembeda keras ketebalan
   bata (1 vs ½); sanity-gate rasio HSP 0.4–2.5 (buang salah-satuan).
3. **Recompute 3.5**: HSP_SE = Σ(koef_SE × **harga Cibuluh**) × 1.1 (BUK 10%) lalu TRUNC ke
   Rp10 — **metode & harga Cibuluh, hanya koefisien yang diganti** → selisih murni koefisien.

## 1. TEMUAN UTAMA — SE 47/2026 adalah SNI-2013 yang DIMODERNISASI, bukan tabel baru

Bukti keluarga Pasangan Dinding (verifikasi manual, bukan statistik):

| Cibuluh (SNI 2013) | Semen (kg) | SE 47/2026 | Semen (kg) |
|---|---|---|---|
| 1 bata, 1PC:2PS | 43.50 | 3.6.1.1 tipe M (fc' 17,2) | **43.50** |
| 1 bata, 1PC:3PS | 32.95 | 3.6.1.2 tipe S (fc' 12,5) | **32.95** |
| 1 bata, 1PC:4PS | 26.55 | 3.6.1.3 tipe N (fc' 5,2) | **26.55** |
| 1 bata, 1PC:5PS | 22.20 | 3.6.1.4 tipe O (fc' 2,4) | **22.20** |
| 1 bata, 1PC:6PS | 18.50 | 3.6.1.5 "1SP:6PP" | **18.50** |
| ½ bata (family sama) | 18.95/14.37/11.5/9.68/8.32 | 3.6.1.6–10 | **identik semua** |

- **Rasio campuran di-RELABEL jadi tipe mortar** M/S/N/O (≈1:2, 1:3, 1:4, 1:5). Pemetaan ini
  krusial untuk fitur perbandingan-antar-edisi (§3.5 desain edisi) — padanan TIDAK bisa
  dicari dari string uraian.
- **Bata di-rescale ×1.0272**: 140→143.81 (1 bata), 70→71.91 (½ bata).
- **Koefisien MATERIAL lain identik persis** (semen/pasir/batu belah, 79% dari komponen
  pasangan lolos-gerbang; hampir semua sisanya = rescale bata di atas).

## 2. Yang benar-benar BERUBAH: koefisien TENAGA KERJA dipangkas besar

Contoh terverifikasi penuh — Plesteran 1PC:3PS tebal 15mm (Cibuluh) vs SE 3.7.3 (1SP:3PP):

| Komponen | Cibuluh | SE 47 | Δ |
|---|---|---|---|
| Semen | 7.776 kg | 7.776 kg | 0% |
| Pasir pasang | 0.023 m3 | 0.023 m3 | 0% |
| Pekerja | 0.300 OH | 0.200 OH | **−33%** |
| Tukang batu | 0.150 OH | 0.100 OH | **−33%** |
| Kepala tukang | 0.015 OH | 0.010 OH | **−33%** |
| Mandor | 0.015 OH | 0.0033 OH | **−78%** |

Distribusi komponen (pasangan lolos-gerbang): **material 79% identik**; **tenaga kerja:
14/23 turun, hanya 1 naik** — pola konsisten: pekerja/tukang ~−33%, mandor −67…−78%.
Interpretasi: SE 47/2026 menaikkan asumsi produktivitas tenaga; material tetap fisika yang sama.

## 3. Struktur BoQ Cibuluh — kelas cakupan (75 baris, Rp 3.667.736.297*)

*(total sheet BoQ termasuk kerja tambah/duplikat rekap — bukan angka kontrak; dipakai
sebagai penyebut cakupan saja)*

| Kelas | Baris | Nilai | % | Arti |
|---|---|---|---|---|
| LUMPSUM / tanpa-analisa | 40 | Rp 2.328.431.560 | 63.5% | Item harga-langsung (air/listrik kerja, bored pile, baja WF per-kg harga pasar, dll) — kelas "bukan pekerjaan beranalisa" (§2.3 desain edisi) |
| KOMPOSIT beda granularitas | 9 | Rp 510.769.094 | 13.9% | Mega-analisa Cibuluh: "1 M3 PONDASI BETON BERTULANG (150kg besi + bekisting)" — SE memecahnya jadi 3 analisa atomik (beton + pembesian + bekisting). **Tidak bisa dibandingkan 1:1; butuh dekomposisi** |
| TAK-ADA-PADANAN-SE | 13 | Rp 551.492.048 | 15.0% | Analisa company/khusus (rangka baja canal C, plat besi konstruksi, trekstank, K-100 site mix, dll) — persis kelas `source='company'` |
| **RECOMPUTED (lolos gerbang)** | **11** | **Rp 274.729.398** | **7.5%** | Padanan SE meyakinkan → angka 3.5 di bawah |
| SANITY-GAGAL | 2 | Rp 2.314.196 | 0.1% | Pairing lolos tapi hasil recompute di luar 0.4–2.5× (salah satuan/harga) — dibuang jujur |

## 4. ANGKA 3.5 — RAB Cibuluh dihitung ulang dengan koefisien SE @ harga sama

**Cakupan**: Rp 274.729.398 (7.5% BoQ; ≈20.5% dari bagian yang beranalisa).
**TOTAL DELTA: Rp −37.012.561 (−13.47% dari cakupan)** — koefisien SE 47/2026 pada harga
Cibuluh menghasilkan RAB **lebih murah**, hampir seluruhnya dari pemangkasan koef tenaga kerja.

### 3.6 TOP dampak × volume (semua lolos verifikasi domain)
| Δ Rp | Δ% | Vol | Item (CIB → SE) |
|---|---|---|---|
| −23.639.040 | −27.2% | 1.036,8 m² | Plesteran 1:3 → 3.7.3 |
| −6.687.360 | −8.9% | 518,4 m² | Bata ½ 1PC:3PS → 3.6.1.7 (tipe S) |
| −2.627.712 | −24.3% | 115,2 m² | Plesteran 1:1 → 3.7.1 |
| −1.484.352 | −8.6% | 57,6 m² | Bata 1 bata 1PC:3PS → 3.6.1.2 (tipe S) |
| −1.337.472 | −2.7% | 1.036,8 m² | Acian → 3.7.8 |
| −1.236.625 | −3.6% | 32,5 m³ | Pondasi batu kali 1:5 → 2.2.2.1.8 (tipe O) |

(Catatan: pasangan bata −8.9% MESKIPUN bata di-rescale +2.7% — pangkas upah menang atas
kenaikan bata.)

## 5. Implikasi desain (mengikat ke keputusan yang sudah ada)

1. **Perbandingan antar-edisi (§3.5 desain edisi) TIDAK boleh mengandalkan uraian** —
   wajib signature koefisien + tabel padanan tipe-mortar↔rasio (M=1:2, S=1:3, N=1:4, O=1:5).
   Ini jadi spesifikasi fitur "laporan perbandingan antar-edisi".
2. **Dekomposisi komposit** = pekerjaan nyata saat seed Cibuluh: 9 mega-analisa beton harus
   dipecah ke (beton atomik + pembesian per kg + bekisting per m²) atau di-seed sebagai
   `source='company'` apa adanya. Rekomendasi: **seed apa adanya sebagai company** (Zero-Invention,
   Cibuluh = alat ukur), dekomposisi = fitur builder belakangan.
3. **63.5% nilai BoQ adalah lump-sum** → jalur "harga langsung/lump-sum" (§2.3) bukan kasus
   pinggiran — dia jalur utama nilai. Prioritas UI estimasi harus setara AHSP.
4. Pemangkasan koef upah SE menegaskan sumbu **EDISI ≠ VERSI**: pindah edisi mengubah angka
   signifikan (−13.5% pada cakupan terukur) → wajib pratinjau-selisih + approve (sudah di desain).

## 6. Keterbatasan (jujur)

- Cakupan recompute 7.5% BoQ — didominasi keluarga dinding/plesteran/pondasi batu. Beton
  komposit (13.9%) & lump-sum (63.5%) secara struktural TAK bisa dibandingkan koefisiennya.
- Kamus harga untuk komponen SE yang tak ada di analisa Cibuluh dipetakan fuzzy ke
  HS.UPAH/HS.BAHAN (threshold 0.75) — item MATCH-HARGA-KURANG (>30% komponen tanpa harga)
  dikeluarkan, tidak ditebak.
- `Dibulatkan`-join memakai nilai rupiah bulat — analisa berbeda dengan HSP identik akan
  salah-join (tak terdeteksi ada kasusnya di 35 baris ter-link).
