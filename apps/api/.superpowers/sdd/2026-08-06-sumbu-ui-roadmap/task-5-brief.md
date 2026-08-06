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

