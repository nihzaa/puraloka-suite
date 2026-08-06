# Sumbu UI/UX + Penjaga Status — Implementation Plan

> ## ✅ SELESAI 2026-08-06 — kotak centang di bawah TIDAK ikut diperbarui
>
> Ketiga penjaga sudah dibangun, di-commit, dan terdaftar di CI:
>
> | Task | Commit |
> |---|---|
> | F8-1 `audit-taksonomi-vs-kode` ber-ratchet | `869bc60` |
> | F8-2 `audit-modul-tanpa-ui` | `defb8c5` |
> | F8-3 sebaran coverage route | `4b7df3b` |
>
> Kotak `- [ ]` di bawah dibiarkan apa adanya sebagai catatan sejarah. **Jangan
> membaca kotak itu sebagai status** — ukur dengan menjalankan penjaganya:
>
> ```bash
> node apps/api/scripts/audit-taksonomi-vs-kode.mjs
> node apps/api/scripts/audit-modul-tanpa-ui.mjs
> ```
>
> **Catatan nama:** judul dokumen menyebut "Sumbu UI/UX", tapi isinya penjaga
> CI untuk *status dokumen vs kode* — **bukan** perombakan visual. Rombak
> visual menyeluruh belum pernah dikerjakan sebagai satu pekerjaan terencana.
>
> **Penjaga ini langsung membayar ongkosnya.** Dijalankan 2026-08-06 sesudah
> RFQ selesai: `basi naik 0 → 1` — "RFQ ke vendor" masih 🔴 di taksonomi
> padahal tabelnya sudah ada. Persis kelas cacat yang ia dibuat untuk
> menangkap, dan yang tertangkap adalah pekerjaan yang baru selesai satu jam
> sebelumnya. Empat status dikoreksi, empat entri PETA ditambahkan, lantai
> `takDipetakan` mengeras 33 → 29.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menutup buta-sumbu-produk pada roadmap dengan penjaga CI yang menangkap status dokumen membusuk, modul tanpa UI, dan coverage yang tak merata.

**Architecture:** Tiga penjaga baru, semuanya ber-ratchet dengan berkas lantai JSON (pola `coverage-lantai.json`). Peta modul→bukti **ditulis tangan**, bukan diturunkan dari nama modul. Tiap penjaga dibuktikan bisa merah lewat mutasi sengaja sebelum dianggap selesai.

**Tech Stack:** Node.js ESM (`.mjs`, tanpa dependency eksternal), GitHub Actions, Vitest.

## Global Constraints

- Skrip penjaga: Node ESM murni di `apps/api/scripts/`, **tanpa dependency baru**.
- Path root: `const AKAR = new URL('../../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')` — pola Windows-safe yang dipakai semua penjaga repo ini.
- Berkas lantai: JSON dengan kunci `_catatan`, `_diukur`, `_riwayat` — nilai lantai **diukur**, tidak diasumsikan.
- Menaikkan lantai lewat flag `--naikkan`. **Menurunkan lantai tidak disediakan sebagai perintah** (pola `coverage-ratchet.mjs`).
- Tiap penjaga wajib punya bukti mutasi: suntikkan pelanggaran → penjaga MERAH → kembalikan → HIJAU.
- Baca `docs/execution/CHARTER.md` §8 sebelum mulai. Kalau kenyataan ≠ dokumen, **kenyataan menang**.
- Angka schema apa pun HARUS dari `scripts/db/introspect.mjs` (CLAUDE.md §1).

---

## Temuan yang mengubah rancangan — baca sebelum Task 1

Spec awal menyatakan penjaga gagal karena `audit-taksonomi-vs-kode.mjs` tak
punya `exit` dan tak ada di CI. **Itu benar tapi bukan sebab utamanya.**

Dijalankan 2026-08-06:

```
Ditandai 🔴 di taksonomi : 56
  status BASI (ada bukti): 0      ← nol, padahal enam modul hidup
  benar belum ada        : 19
  belum dipetakan skrip  : 37     ← enam modul itu ADA DI SINI
```

Enam modul basi (Retensi, Klaim, Surat, Instruksi, NCR, Absensi) **tak punya
entri di `PETA`**, jadi tak pernah diperiksa. Menambahkan `exit 1` saja tidak
akan menangkap apa pun — `basi.length` tetap 0.

**Konsekuensi:** Task 2 harus menutup `PETA` lebih dulu, dan `takDipetakan`
harus jadi kondisi merah tersendiri. Kalau tidak, penjaganya hijau abadi.

---

## File Structure

| Berkas | Tanggung jawab |
|---|---|
| `docs/ERP-KONTRAKTOR-TAKSONOMI-MENU.md` | Sumber status per sub-menu. Task 1 mengoreksi 6 baris. |
| `docs/execution/F5-1-TRIASE-SUBMENU.md` | Triase INTI/PEMBEDA/TUNDA. Task 1 mengoreksi tabel INTI. |
| `apps/api/scripts/audit-taksonomi-vs-kode.mjs` | Task 2: `PETA` diperluas + `exit 1` + ratchet. |
| `apps/api/scripts/status-lantai.json` | **Baru.** Lantai `takDipetakan` + `basi`. |
| `apps/api/scripts/audit-modul-tanpa-ui.mjs` | **Baru.** Task 4. Endpoint INTI dipanggil dari web. |
| `apps/api/scripts/ui-lantai.json` | **Baru.** Lantai modul tanpa UI (nilai awal 1). |
| `apps/api/scripts/route-nol-lantai.json` | **Baru.** Task 5. Lantai jumlah route ber-coverage nol. |
| `.github/workflows/ci.yml` | Task 2/4/5: daftarkan tiap penjaga. |
| `docs/execution/QUEUE.yaml` | Task 3: 9 item INTI. |

---

## Task 1: Koreksi status basi di dua dokumen

**Files:**
- Modify: `docs/ERP-KONTRAKTOR-TAKSONOMI-MENU.md` (baris 91, 96, 187, 206, 210, 369)
- Modify: `docs/execution/F5-1-TRIASE-SUBMENU.md` (tabel INTI §3, baris ~163-171)

**Interfaces:**
- Consumes: —
- Produces: status taksonomi yang benar; Task 2 memakainya sebagai kebenaran dasar.

- [ ] **Step 1: Verifikasi ulang keenam modul — jangan percaya plan ini**

```bash
cd /e/Project/puraloka-suite
for p in claims letters field-instructions ncr absensi retensi; do
  echo "--- $p ---"
  grep -rloE "/api/v1/[a-z/{}$-]*$p" apps/web/app apps/web/components 2>/dev/null | head -3
done
```

Diharapkan tiap modul menyebut minimal satu berkas di `apps/web/`. Kalau ada
yang kosong, **jangan koreksi baris itu** — catat dan laporkan.

- [ ] **Step 2: Koreksi 6 baris taksonomi**

Ubah kolom Status `🔴` → `🟡`, dan isi kolom Catatan dengan bukti berkasnya.
`🟡` (bukan `✅`) karena yang terbukti baru "UI-nya ada", belum "lengkap".

| Baris | Sub-menu | Catatan yang diisi |
|---|---|---|
| 91 | Claims management | `klaim-section.tsx` → `/projects/{id}/claims` |
| 96 | Surat masuk/keluar | `surat-section.tsx` → `/projects/{id}/letters` |
| 187 | Retensi subkontrak | `mandor/retensi/page.tsx` + `retensi-section.tsx` |
| 206 | Instruksi lapangan | `instruksi-lapangan-section.tsx` → `/field-instructions` |
| 210 | Non-Conformance Report (NCR) | `mutu/ncr/page.tsx` |
| 369 | Absensi lapangan | `mandor/absensi/page.tsx` |

Contoh bentuk akhir baris 91:

```markdown
| Claims management | 🟡 | UI hidup: `klaim-section.tsx` → `/api/v1/projects/{id}/claims` (diukur 2026-08-06) |
```

- [ ] **Step 3: Koreksi tabel INTI di dokumen triase**

Di `F5-1-TRIASE-SUBMENU.md` §3, kolom **Mulai dari** untuk INTI #3,4,5,6,7,9
saat ini berbunyi `🔴 nol`. Ganti jadi `🟡 UI hidup (2026-08-06)`.
INTI #8 (geotag) juga: `🟡 foto sudah hidup (097/098)` → `🟡 UI + migrasi 190`.

- [ ] **Step 4: Tambahkan §3b — kenapa ini terjadi lagi**

Sisipkan sesudah §3a:

```markdown
### 3b. Koreksi kedua — enam item, 2026-08-06

§3a mencatat satu item salah status. Diukur ulang 2026-08-06: **enam item lagi**
(#3,4,5,6,7,9) ditulis "🔴 nol" padahal UI-nya hidup, dan #8 sudah punya migrasi
190 + `penanda-lokasi.tsx`.

Sekali adalah kekeliruan; tujuh kali adalah cacat sistemik tanpa penjaga.
`audit-taksonomi-vs-kode.mjs` sebenarnya bisa mendeteksinya, tetapi keenam modul
itu **tak punya entri `PETA`** sehingga tak pernah diperiksa — ia melaporkan
"status BASI: 0" dengan percaya diri. F8-1 menutup lubang itu.
```

- [ ] **Step 5: Jalankan penjaga yang sudah ada — pastikan tak ada yang pecah**

```bash
cd /e/Project/puraloka-suite/apps/api
node scripts/audit-triase-submenu.mjs
node scripts/gen-indeks-docs.mjs --check
```

Expected: keduanya exit 0. `audit-triase-submenu` memeriksa tiap 🔴 muncul tepat
sekali di golongan triase — mengubah 🔴→🟡 mengurangi himpunan yang dituntut,
jadi tetap lolos.

- [ ] **Step 6: Commit**

```bash
git add docs/ERP-KONTRAKTOR-TAKSONOMI-MENU.md docs/execution/F5-1-TRIASE-SUBMENU.md
git commit -m "docs(triase): enam status 🔴 yang ternyata hidup — koreksi kedua

Diukur terhadap kode, bukan dibaca dari dokumen: Retensi, Klaim, Surat,
Instruksi lapangan, NCR, Absensi semuanya punya UI yang memanggil endpoint.

§3a sudah pernah mencatat satu koreksi serupa. Ini enam lagi.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: F8-1 — `audit-taksonomi-vs-kode` jadi penjaga ber-ratchet

**Files:**
- Modify: `apps/api/scripts/audit-taksonomi-vs-kode.mjs`
- Create: `apps/api/scripts/status-lantai.json`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: taksonomi hasil Task 1.
- Produces: `status-lantai.json` dengan kunci `takDipetakan` dan `basi` (dua integer).

- [ ] **Step 1: Ukur angka awal**

```bash
cd /e/Project/puraloka-suite/apps/api && node scripts/audit-taksonomi-vs-kode.mjs
```

Catat `status BASI` dan `belum dipetakan skrip`. Sesudah Task 1, `takDipetakan`
diperkirakan tetap 37 (koreksi status tak menambah entri PETA).

- [ ] **Step 2: Perluas `PETA` — 6 modul yang baru dikoreksi**

Tambahkan ke objek `PETA` di `audit-taksonomi-vs-kode.mjs`. Perhatikan field
baru `web`: potongan path endpoint yang dicari di `apps/web/**`.

```js
  'Retensi subkontrak': { berkas: ['mandor'], web: ['/mandor/retensi'] },
  'Claims management': { berkas: ['contracts'], web: ['/claims'] },
  'Surat masuk/keluar (correspondence)': { berkas: ['surat'], web: ['/letters'] },
  'Instruksi lapangan': { berkas: ['instruksi-lapangan'], web: ['/field-instructions'] },
  'Non-Conformance Report (NCR)': { berkas: ['ncr'], web: ['/ncr'] },
  'Absensi lapangan': { berkas: ['absensi'], web: ['/absensi'] },
```

⚠️ `'Claims management'` sudah ada di `PETA` dengan `{ tabel: ['claims'] }` —
**gabungkan, jangan gandakan kuncinya** (kunci ganda di object literal JS
menimpa diam-diam). Bentuk akhirnya:
`{ berkas: ['contracts'], tabel: ['claims'], web: ['/claims'] }`.

- [ ] **Step 3: Tambahkan pemindaian `apps/web/` ke fungsi `bukti`**

Sisipkan sesudah blok `const sqlAll = ...`:

```js
import { readdirSync as rdSync } from 'node:fs'
const D_WEB_SRC = [join(AKAR, 'apps/web/app'), join(AKAR, 'apps/web/components')]

/** Baca rekursif semua .tsx/.ts di apps/web, LEWATI .next (artefak build). */
function sumberWeb(dirs) {
  const out = []
  const walk = (d) => {
    if (!existsSync(d)) return
    for (const e of rdSync(d, { withFileTypes: true })) {
      if (e.name === '.next' || e.name === 'node_modules') continue
      const p = join(d, e.name)
      if (e.isDirectory()) walk(p)
      else if (/\.tsx?$/.test(e.name)) out.push(readFileSync(p, 'utf8'))
    }
  }
  dirs.forEach(walk)
  return out.join('\n')
}
const teksWeb = sumberWeb(D_WEB_SRC)
```

Lalu di dalam `function bukti(spec)`, sebelum `return b`:

```js
  for (const w of spec.web ?? []) if (teksWeb.includes(w)) b.push(`web:${w}`)
```

⚠️ `.next/` **wajib** dilewati — pencarian awal saat merancang spec ini
menemukan `ncr` di `apps/web/.next/...` dan nyaris menyimpulkan hal yang salah.

- [ ] **Step 4: Tambahkan ratchet + exit code**

Ganti blok `console.log` penutup dengan:

```js
const LANTAI = join(AKAR, 'apps/api/scripts/status-lantai.json')
const naikkan = process.argv.includes('--naikkan')
const lantai = JSON.parse(readFileSync(LANTAI, 'utf8'))
const kini = { basi: basi.length, takDipetakan: takDipetakan.length }

if (naikkan) {
  writeFileSync(LANTAI, JSON.stringify({ ...lantai, ...kini }, null, 2) + '\n')
  console.log(`Lantai diperbarui: basi=${kini.basi} takDipetakan=${kini.takDipetakan}`)
  process.exit(0)
}

let merah = false
for (const k of ['basi', 'takDipetakan']) {
  if (kini[k] > lantai[k]) {
    console.error(`MERAH: ${k} naik ${lantai[k]} -> ${kini[k]}`)
    merah = true
  } else if (kini[k] < lantai[k]) {
    console.log(`Turun: ${k} ${lantai[k]} -> ${kini[k]}. Kunci: --naikkan`)
  }
}
process.exit(merah ? 1 : 0)
```

Tambahkan `writeFileSync` ke import `node:fs` di kepala berkas.

- [ ] **Step 5: Buat berkas lantai dengan angka terukur**

```bash
cd /e/Project/puraloka-suite/apps/api
cat > scripts/status-lantai.json <<'EOF'
{
  "_catatan": "Lantai status-vs-kode. Boleh turun, TIDAK boleh naik. Lihat audit-taksonomi-vs-kode.mjs.",
  "_diukur": "2026-08-06, sesudah koreksi enam status basi (Task 1).",
  "_riwayat": "Nilai awal diisi lewat --naikkan pada run pertama.",
  "basi": 0,
  "takDipetakan": 0
}
EOF
node scripts/audit-taksonomi-vs-kode.mjs --naikkan
```

Perintah kedua mengisi angka terukur. **Jangan tulis angka manual.**

- [ ] **Step 6: BUKTI MUTASI — penjaga harus bisa merah**

```bash
cd /e/Project/puraloka-suite/apps/api
# Mutasi: hapus satu entri PETA -> takDipetakan naik 1
cp scripts/audit-taksonomi-vs-kode.mjs /tmp/asli.mjs
sed -i "/'Non-Conformance Report (NCR)': {/d" scripts/audit-taksonomi-vs-kode.mjs
node scripts/audit-taksonomi-vs-kode.mjs; echo "EXIT=$?  (harus 1)"
cp /tmp/asli.mjs scripts/audit-taksonomi-vs-kode.mjs
node scripts/audit-taksonomi-vs-kode.mjs; echo "EXIT=$?  (harus 0)"
```

Expected: MERAH lalu HIJAU. **Kalau mutasi tidak membuatnya merah, penjaganya
tidak berfungsi — jangan lanjut.**

- [ ] **Step 7: Daftarkan di CI**

Di `.github/workflows/ci.yml`, sesudah langkah `audit-triase-submenu.mjs`:

```yaml
      # Status sub-menu yang membusuk sementara kode maju. Terbukti terjadi
      # TUJUH kali (F5-1 §3a satu item, §3b enam item) tanpa satu pun penjaga
      # menabraknya — skrip ini sudah ada sejak lama tetapi tak pernah
      # dijalankan CI, dan keenam modul basi tak punya entri PETA sehingga
      # ia melaporkan "BASI: 0" dengan percaya diri.
      #
      # Ratchet dua angka: `basi` (🔴 tapi buktinya ada) dan `takDipetakan`
      # (belum punya entri PETA, jadi tak terperiksa sama sekali).
      - name: Status sub-menu vs kode (F8-1)
        run: node scripts/audit-taksonomi-vs-kode.mjs
        working-directory: apps/api
```

⚠️ Periksa `working-directory` langkah tetangganya — kalau job sudah ber-default
`apps/api`, baris itu tidak perlu.

- [ ] **Step 8: Commit**

```bash
git add apps/api/scripts/audit-taksonomi-vs-kode.mjs apps/api/scripts/status-lantai.json .github/workflows/ci.yml
git commit -m "feat(ci): F8-1 — penjaga status-vs-kode, dengan PETA yang akhirnya menutupi modulnya

Skrip ini sudah bisa mendeteksi status basi sejak lama, tapi melaporkan
'BASI: 0' karena enam modul yang benar-benar basi tak punya entri PETA.
Menambahkan exit 1 saja tidak akan menangkap apa pun.

Ratchet dua angka: basi + takDipetakan. Bukti mutasi: hapus satu entri
PETA -> MERAH; dikembalikan -> HIJAU.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: F5-2 — 9 INTI jadi item QUEUE

**Files:**
- Modify: `docs/execution/QUEUE.yaml`

**Interfaces:**
- Consumes: status terkoreksi Task 1.
- Produces: item `F5-INTI-1` … `F5-INTI-9`.

- [ ] **Step 1: Periksa yang sudah ada**

```bash
cd /e/Project/puraloka-suite && grep -n "F5-INTI" docs/execution/QUEUE.yaml
```

`F5-INTI-2`, `-3`, `-4` sudah ada. **Jangan gandakan** — hanya tambahkan yang
belum: #1, #5, #6, #7, #8, #9.

- [ ] **Step 2: Tambahkan enam item**

Ikuti bentuk item tetangganya persis. Contoh untuk #7:

```yaml
  - id: F5-INTI-7
    fase: 5
    judul: "NCR — siklus tutup ketidaksesuaian mutu"
    kenapa: >
      Tender pemerintah mensyaratkan siklus NCR yang bisa ditutup dan diaudit.
      Diukur 2026-08-06: UI hidup di app/(dashboard)/mutu/ncr/page.tsx.
    kriteria_selesai:
      - "UI: halaman NCR bisa membuat, menutup, dan menampilkan riwayat"
      - "endpoint dipanggil dari apps/web (bukan hanya terdaftar)"
    cara_verifikasi: "node apps/api/scripts/audit-modul-tanpa-ui.mjs + buka halamannya"
    status: done
```

Status per item, sesuai bukti Task 1: #1 `wip` (neraca/L-R sebagian) · #5 `done`
· #6 `done` · #7 `done` · #8 `done` · #9 `done`.

⚠️ `kriteria_selesai` **wajib menyebut UI**, bukan hanya endpoint — inilah
cacat yang membuat lima modul sempat dilaporkan selesai tanpa UI (commit `db463d9`).

- [ ] **Step 3: Validasi YAML**

```bash
cd /e/Project/puraloka-suite
node -e "const y=require('fs').readFileSync('docs/execution/QUEUE.yaml','utf8');console.log('baris:',y.split('\n').length)"
node apps/api/scripts/audit-docs-vs-roadmap.mjs
```

Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add docs/execution/QUEUE.yaml
git commit -m "feat(queue): F5-2 — sembilan INTI turun jadi item QUEUE

Triase mengidentifikasi 9 INTI; QUEUE hanya memuat tiga. Enam sisanya
kini punya item dengan kriteria_selesai yang MENYEBUT UI, bukan endpoint.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: F8-2 — `audit-modul-tanpa-ui`

**Files:**
- Create: `apps/api/scripts/audit-modul-tanpa-ui.mjs`
- Create: `apps/api/scripts/ui-lantai.json`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: pola `sumberWeb()` dari Task 2 (disalin, bukan diimpor — penjaga repo ini berdiri sendiri).
- Produces: `ui-lantai.json` dengan kunci `tanpaUi`.

- [ ] **Step 1: Tulis penjaga**

```js
#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// MODUL INTI TANPA UI — endpoint yang tak pernah dipanggil dari mana pun.
//
// ── Kenapa penjaga ini ada
//
// Commit db463d9: "Endpoint `retensi-register` yang saya banggakan tak pernah
// dipanggil dari mana pun. Tiap PR saya laporkan 'INTI #N selesai' — itu tidak
// akurat. Yang selesai fondasinya; produknya belum ada."
//
// Lima modul berturut-turut dibangun sampai endpoint lalu dilaporkan selesai.
// CLAUDE.md §8 sudah melarangnya ("Kolom DB sudah ada BUKAN selesai"), tapi
// larangan tanpa penjaga hanya konvensi.
//
// ── Kenapa PETA ditulis tangan
//
// Pola `/api/v1/<modul>` GAGAL menemukan Klaim/Surat/Instruksi — endpoint-nya
// bersarang di `/api/v1/projects/{id}/claims`. Penjaga berpola naif akan merah
// palsu di empat modul sehat, dan penjaga yang merah palsu akan dimatikan orang.
// Preseden sama tercatat di header audit-taksonomi-vs-kode.mjs.
// ════════════════════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const AKAR = new URL('../../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const LANTAI = join(AKAR, 'apps/api/scripts/ui-lantai.json')

/** INTI → potongan path endpoint yang harus muncul di apps/web. Ditulis tangan. */
const INTI = {
  '#1 Laporan keuangan': ['/api/v1/gl/'],
  '#2 IPC': ['/api/v1/termin', '/api/v1/ipc'],
  '#3 Retensi subkontrak': ['/mandor/retensi'],
  '#4 Klaim': ['/claims'],
  '#5 Surat': ['/letters'],
  '#6 Instruksi lapangan': ['/field-instructions'],
  '#7 NCR': ['/api/v1/ncr'],
  '#8 Geotag foto': ['latitude', 'longitude'],
  '#9 Absensi lapangan': ['/api/v1/absensi'],
}

function sumberWeb() {
  const out = []
  const walk = (d) => {
    if (!existsSync(d)) return
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name === '.next' || e.name === 'node_modules') continue
      const p = join(d, e.name)
      if (e.isDirectory()) walk(p)
      else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) {
        out.push(readFileSync(p, 'utf8'))
      }
    }
  }
  walk(join(AKAR, 'apps/web/app'))
  walk(join(AKAR, 'apps/web/components'))
  return out.join('\n')
}

const web = sumberWeb()
const tanpaUi = []
for (const [nama, pola] of Object.entries(INTI)) {
  if (!pola.some((p) => web.includes(p))) tanpaUi.push(nama)
}

console.log(`INTI diperiksa : ${Object.keys(INTI).length}`)
console.log(`tanpa UI       : ${tanpaUi.length}`)
for (const n of tanpaUi) console.log(`   ${n}`)

const naikkan = process.argv.includes('--naikkan')
const lantai = JSON.parse(readFileSync(LANTAI, 'utf8'))
if (naikkan) {
  writeFileSync(LANTAI, JSON.stringify({ ...lantai, tanpaUi: tanpaUi.length }, null, 2) + '\n')
  console.log(`Lantai diperbarui: ${tanpaUi.length}`)
  process.exit(0)
}
if (tanpaUi.length > lantai.tanpaUi) {
  console.error(`\nMERAH: modul tanpa UI naik ${lantai.tanpaUi} -> ${tanpaUi.length}`)
  process.exit(1)
}
if (tanpaUi.length < lantai.tanpaUi) {
  console.log(`\nTurun ${lantai.tanpaUi} -> ${tanpaUi.length}. Kunci: --naikkan`)
}
process.exit(0)
```

⚠️ Berkas `.test.tsx` **dikecualikan** — test yang menyebut endpoint tidak
membuktikan ada UI yang memakainya.

- [ ] **Step 2: Buat lantai + ukur**

```bash
cd /e/Project/puraloka-suite/apps/api
cat > scripts/ui-lantai.json <<'EOF'
{
  "_catatan": "Lantai modul INTI tanpa UI. Boleh turun, TIDAK boleh naik.",
  "_diukur": "2026-08-06 — 8 dari 9 INTI sudah punya UI; sisa #2 IPC.",
  "tanpaUi": 99
}
EOF
node scripts/audit-modul-tanpa-ui.mjs --naikkan
cat scripts/ui-lantai.json
```

Expected: `tanpaUi` jadi **1** (INTI #2 IPC). Kalau ternyata >1, **hentikan dan
laporkan** — berarti asumsi Task 1 meleset.

- [ ] **Step 3: BUKTI MUTASI**

```bash
cd /e/Project/puraloka-suite/apps/api
cp scripts/audit-modul-tanpa-ui.mjs /tmp/ui-asli.mjs
sed -i "s|'/api/v1/ncr'|'/api/v1/tidak-ada-ini'|" scripts/audit-modul-tanpa-ui.mjs
node scripts/audit-modul-tanpa-ui.mjs; echo "EXIT=$?  (harus 1)"
cp /tmp/ui-asli.mjs scripts/audit-modul-tanpa-ui.mjs
node scripts/audit-modul-tanpa-ui.mjs; echo "EXIT=$?  (harus 0)"
```

- [ ] **Step 4: Daftarkan di CI + commit**

```yaml
      # CLAUDE.md §8: "Kolom DB sudah ada BUKAN selesai." Dilanggar lima kali
      # berturut-turut sebelum db463d9 memperbaikinya. Lantai 1 = INTI #2 (IPC).
      - name: Modul INTI tanpa UI (F8-2)
        run: node scripts/audit-modul-tanpa-ui.mjs
        working-directory: apps/api
```

```bash
git add apps/api/scripts/audit-modul-tanpa-ui.mjs apps/api/scripts/ui-lantai.json .github/workflows/ci.yml
git commit -m "feat(ci): F8-2 — modul INTI tanpa UI, lantai 1

Menjaga cacat commit db463d9: endpoint dibangun, dilaporkan selesai,
tak pernah dipanggil dari mana pun. Peta ditulis tangan karena pola
/api/v1/<modul> gagal pada endpoint bersarang /projects/{id}/claims.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: F8-3 — coverage sebaran route

**Files:**
- Create: `apps/api/scripts/audit-route-coverage-nol.mjs`
- Create: `apps/api/scripts/route-nol-lantai.json`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `apps/api/coverage/coverage-summary.json` (dihasilkan langkah test CI).
- Produces: `route-nol-lantai.json` dengan kunci `routeNol`.

- [ ] **Step 1: Ukur ulang daftar route ber-coverage nol**

Daftar 27 di `COVERAGE-BASELINE.md` **sudah basi** (F1-8 menutup `companies.ts`).

```bash
cd /e/Project/puraloka-suite/apps/api
npx vitest run --coverage --coverage.include='src/**/*.ts' \
  --coverage.exclude='src/**/*.test.ts' --coverage.exclude='src/**/__tests__/**' \
  --coverage.thresholds.lines=0 --coverage.thresholds.functions=0 \
  --coverage.thresholds.branches=0 --coverage.thresholds.statements=0 \
  --coverage.reporter=json-summary --coverage.reportsDirectory=./coverage
```

⚠️ Butuh DB nyata (integration test). Kalau gagal karena env, **laporkan** —
jangan mengarang angka.

- [ ] **Step 2: Tulis penjaga**

```js
#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// ROUTE BER-COVERAGE NOL — masalahnya SEBARAN, bukan kedalaman.
//
// COVERAGE-BASELINE.md: lines 32%, branches 68%, functions 82%. Pola khas
// integration test — yang diuji, diuji dalam; tapi sebagian berkas route tak
// tersentuh sama sekali. Mengejar "70% lines global" adalah target yang salah
// dan akan mendorong test dangkal demi angka.
//
// Yang dijaga: JUMLAH berkas routes/v1/*.ts ber-coverage NOL. Boleh turun.
// ════════════════════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const AKAR = new URL('../../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const RINGKASAN = join(AKAR, 'apps/api/coverage/coverage-summary.json')
const LANTAI = join(AKAR, 'apps/api/scripts/route-nol-lantai.json')

if (!existsSync(RINGKASAN)) {
  console.error(`FATAL: ${RINGKASAN} tidak ada. Jalankan vitest --coverage lebih dulu.`)
  process.exit(1)
}

const ringkasan = JSON.parse(readFileSync(RINGKASAN, 'utf8'))
const nol = []
for (const [berkas, m] of Object.entries(ringkasan)) {
  if (berkas === 'total') continue
  if (!/routes[\/\\]v1[\/\\][^\/\\]+\.ts$/.test(berkas)) continue
  if ((m.lines?.pct ?? 0) === 0) nol.push(berkas.split(/[\/\\]/).pop())
}

console.log(`Route ber-coverage NOL : ${nol.length}`)
for (const n of nol.sort()) console.log(`   ${n}`)

const naikkan = process.argv.includes('--naikkan')
const lantai = JSON.parse(readFileSync(LANTAI, 'utf8'))
if (naikkan) {
  writeFileSync(LANTAI, JSON.stringify({ ...lantai, routeNol: nol.length }, null, 2) + '\n')
  console.log(`Lantai diperbarui: ${nol.length}`)
  process.exit(0)
}
if (nol.length > lantai.routeNol) {
  console.error(`\nMERAH: route ber-coverage nol naik ${lantai.routeNol} -> ${nol.length}`)
  process.exit(1)
}
process.exit(0)
```

- [ ] **Step 3: Buat lantai dari angka terukur**

```bash
cd /e/Project/puraloka-suite/apps/api
cat > scripts/route-nol-lantai.json <<'EOF'
{
  "_catatan": "Jumlah berkas routes/v1/*.ts ber-coverage NOL. Boleh turun, TIDAK boleh naik.",
  "_diukur": "2026-08-06 — diukur ulang; daftar 27 di COVERAGE-BASELINE.md sudah basi (F1-8 menutup companies.ts).",
  "routeNol": 999
}
EOF
node scripts/audit-route-coverage-nol.mjs --naikkan
```

- [ ] **Step 4: BUKTI MUTASI**

```bash
cd /e/Project/puraloka-suite/apps/api
node -e "
const f='scripts/route-nol-lantai.json';const j=JSON.parse(require('fs').readFileSync(f));
j.routeNol=Math.max(0,j.routeNol-1);require('fs').writeFileSync(f,JSON.stringify(j,null,2))"
node scripts/audit-route-coverage-nol.mjs; echo "EXIT=$?  (harus 1)"
node scripts/audit-route-coverage-nol.mjs --naikkan
node scripts/audit-route-coverage-nol.mjs; echo "EXIT=$?  (harus 0)"
```

- [ ] **Step 5: Daftarkan di CI + commit**

Pasang di job yang sama dengan `coverage-ratchet` (sesudah shard digabung) —
penjaga ini butuh `coverage-summary.json` gabungan.

```yaml
      - name: Route ber-coverage NOL (F8-3)
        run: node scripts/audit-route-coverage-nol.mjs
        working-directory: apps/api
```

```bash
git add apps/api/scripts/audit-route-coverage-nol.mjs apps/api/scripts/route-nol-lantai.json .github/workflows/ci.yml
git commit -m "feat(ci): F8-3 — jaga SEBARAN coverage, bukan persentase global

Lines 32% vs branches 68% vs functions 82%: yang diuji diuji dalam,
sebagian berkas route tak tersentuh. Menjaga jumlah route ber-coverage
NOL, bukan mengejar 70% global yang mendorong test dangkal.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: Catat di JOURNAL

**Files:**
- Modify: `docs/execution/JOURNAL.md`

- [ ] **Step 1: Tulis entri**

Sesuai CHARTER §7, entri wajib memuat "saya salah" bila ada koreksi. Tempel
ringkasan run penjaga yang sungguhan — **jangan mengklaim hijau tanpa bukti**.

```markdown
## 2026-08-06 — Sumbu UI/UX: tiga penjaga, dan dua koreksi terhadap diri sendiri

**Saya salah dua kali dalam satu sesi.**

Pertama: merancang penjaga UI dengan lantai 3 karena percaya INTI #7/#8/#9
"🔴 nol". Diukur ke kode — ketiganya hidup. 8 dari 9 INTI sudah punya UI.
Lantai sebenarnya 1.

Kedua: menulis di spec bahwa `audit-taksonomi-vs-kode.mjs` gagal karena tak
punya `exit`. Benar, tapi bukan sebab utamanya — enam modul basi itu tak punya
entri `PETA`, jadi ia melaporkan "BASI: 0". Menambahkan exit 1 saja tak akan
menangkap apa pun.

Yang dipasang: F8-1 (status vs kode) · F8-2 (modul tanpa UI, lantai 1) ·
F8-3 (route ber-coverage nol). Ketiganya ber-ratchet, ketiganya dibuktikan
bisa merah lewat mutasi sengaja.
```

- [ ] **Step 2: Commit**

```bash
git add docs/execution/JOURNAL.md
git commit -m "docs(journal): sumbu UI/UX + dua koreksi terhadap diri sendiri

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Verifikasi akhir

- [ ] Semua penjaga hijau berurutan:

```bash
cd /e/Project/puraloka-suite/apps/api
for s in audit-taksonomi-vs-kode audit-modul-tanpa-ui audit-route-coverage-nol \
         audit-triase-submenu audit-rancangan-submenu; do
  node scripts/$s.mjs >/dev/null 2>&1; echo "$s EXIT=$?"
done
cd ../.. && node apps/api/scripts/gen-indeks-docs.mjs --check; echo "indeks EXIT=$?"
```

- [ ] Tiga bukti mutasi terdokumentasi di JOURNAL (Task 2/4/5 Step "BUKTI MUTASI").
- [ ] `git log --oneline -7` menunjukkan enam commit terpisah.
- [ ] Tempel ringkasan run sungguhan — CHARTER §7 melarang klaim hijau tanpa bukti.
