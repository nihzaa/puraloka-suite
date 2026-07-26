# Ekstraktor AHSP SE 47/2026 → dataset kanonik (db/seeds/ahsp-se47-dataset.json)
#
# Zero-Invention (ADR-006): salin VERBATIM dari workbook resmi; tanpa tafsir angka.
# Jalankan lokal (workbook di _source/, TIDAK di git):
#   python db/seeds/tools/extract-ahsp-se47.py
#
# Aturan:
# - Blok analisa: kolom C kode (\d+(\.\d+)+), kolom D uraian; komponen di bawah
#   section A TENAGA KERJA / B BAHAN / C PERALATAN; berhenti di baris F.
# - Satuan: case-fold + peta eksplisit; TANPA tafsir semantik. Typo workbook
#   (loat/lkg) dipertahankan sebagai kode satuan tersendiri (baseline "SE bilang apa").
# - Satuan output: parse '1 <sat>' / 'per <sat>' dari uraian (verbatim di teks;
#   'tititk' = typo titik di teks SE, ikut ditangkap). Tak terparse → EXCLUDED,
#   masuk dataset.excluded utk ditinjau — TIDAK ditebak.
# - Resource: identitas EXACT (nama case-insensitive + satuan). Tanpa fuzzy-merge.
import json, re, hashlib, sys
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parents[3]  # tools → seeds → db → ROOT repo
SRC = ROOT / '_source' / 'ahsp' / 'AHSP CIPTA KARYA SE BINA KONTRUKSI NO. 47 TAHUN 2026.xlsm'
OUT = ROOT / 'db' / 'seeds' / 'ahsp-se47-dataset.json'

SKIP_SHEETS = {'Upah Bahan', 'Daftar Harga Satuan Pekerjaan', 'Pembesian Plat Lantai 1'}
CODE_RE = re.compile(r'^\d+(\.\d+)+$')

EXISTING_UNITS = {'oh': 'OH', 'oj': 'OJ', 'jam': 'jam', 'hari': 'hari', 'm': 'm', 'm2': 'm2',
  'm3': 'm3', 'kg': 'kg', 'buah': 'buah', 'bh': 'buah', 'unit': 'unit', 'liter': 'liter',
  'lembar': 'lembar', 'batang': 'batang', 'set': 'set', 'ton': 'ton', 'ls': 'ls',
  'sak': 'sak', 'titik': 'titik', 'rol': 'rol', 'minggu': 'minggu'}
NEW_UNITS = {"m'": 'm1', 'lot': 'lot', 'tube': 'tube', 'gulung': 'gulung', 'pohon': 'pohon',
  'polybag': 'polybag', 'ikat': 'ikat', 'dus': 'dus', 'cm': 'cm',
  'unit hari': 'unit_hari', 'buah hari': 'buah_hari', 'unit/hari': 'unit_hari',
  'loat': 'loat', 'lkg': 'lkg'}

def map_unit(raw: str):
    k = raw.strip().lower()
    return EXISTING_UNITS.get(k) or NEW_UNITS.get(k)

OUT1 = re.compile(r"\b1\s*(m3|m2|m'|m1|m|kg|buah|bh|unit|titik|tititk|ls|set|lembar|batang|zak|ton|liter)\b", re.I)
OUT2 = re.compile(r"\bper\s+(?:1\s+)?(m3|m2|m'|m1|m|kg|buah|unit|titik)\b", re.I)

def output_unit(uraian: str):
    u = uraian.lower().replace('m³', 'm3').replace('m²', 'm2')
    m = OUT1.search(u) or OUT2.search(u)
    if not m:
        return None
    tok = m.group(1).replace('tititk', 'titik')  # typo verbatim SE (2.4.5.6)
    return map_unit(tok) or tok

def extract():
    wb = openpyxl.load_workbook(SRC, read_only=True, data_only=True)
    raw = []
    for sname in wb.sheetnames:
        if sname in SKIP_SHEETS:
            continue
        ws = wb[sname]
        cur, section = None, None
        for row in ws.iter_rows(min_row=1, max_col=9, values_only=True):
            c = str(row[2]).strip() if row[2] is not None else ''
            d = str(row[3]).strip() if row[3] is not None else ''
            if CODE_RE.match(c) and d:
                cur = {'sheet': sname, 'code': c, 'uraian': d, 'components': []}
                raw.append(cur); section = None
                continue
            if cur is None:
                continue
            if c == 'A' or d.upper().startswith('TENAGA KERJA'):
                section = 'labor'; continue
            if c == 'B' or d.upper() == 'BAHAN':
                section = 'material'; continue
            if c == 'C' or d.upper() == 'PERALATAN':
                section = 'equipment'; continue
            if isinstance(row[2], str) and row[2].startswith('JUMLAH'):
                continue
            if c in ('D', 'E', 'F'):
                if c == 'F':
                    cur = None
                continue
            if d and row[5] is not None and row[6] is not None and section:
                try:
                    koef = float(row[6])
                except (TypeError, ValueError):
                    continue
                cur['components'].append({'name': d, 'sat': str(row[5]).strip(),
                                          'koef': koef, 'section': section})
    wb.close()
    return [a for a in raw if a['components']]

def main():
    raw = extract()
    res_index, resources = {}, []
    analyses, excluded = [], []
    for s in raw:
        ou = output_unit(s['uraian'])
        comps, badunit = [], []
        for cmp in s['components']:
            sat = map_unit(cmp['sat'])
            if not sat:
                badunit.append(cmp['sat']); continue
            key = (cmp['name'].strip().lower(), sat)
            if key not in res_index:
                code = f'AHSP-R{len(resources)+1:04d}'
                res_index[key] = code
                resources.append({'code': code, 'name': cmp['name'].strip(),
                                  'unit_code': sat, 'category': cmp['section']})
            comps.append({'r': res_index[key], 'k': cmp['koef']})
        if badunit:
            excluded.append({'code': s['code'], 'sheet': s['sheet'],
                             'reason': f'satuan tak terpeta: {sorted(set(badunit))}'})
            continue
        if not ou:
            excluded.append({'code': s['code'], 'sheet': s['sheet'],
                             'reason': 'satuan output tak tertulis di uraian'})
            continue
        analyses.append({'code': s['code'], 'sheet': s['sheet'], 'uraian': s['uraian'],
                         'output_unit': ou, 'components': comps})

    sha = hashlib.sha256(SRC.read_bytes()).hexdigest()
    dataset = {
        'meta': {
            'source_file': SRC.name, 'source_sha256': sha, 'edition_code': 'SE-47-2026',
            'extractor': 'db/seeds/tools/extract-ahsp-se47.py',
            'counts': {'analyses': len(analyses), 'resources': len(resources),
                       'components': sum(len(a['components']) for a in analyses),
                       'excluded': len(excluded)},
        },
        'new_units': sorted(set(NEW_UNITS.values())),
        'resources': resources,
        'analyses': analyses,
        'excluded': excluded,
    }
    OUT.write_text(json.dumps(dataset, ensure_ascii=False), encoding='utf-8')
    print(f"OK → {OUT}")
    print(json.dumps(dataset['meta']['counts']))

if __name__ == '__main__':
    sys.exit(main())
