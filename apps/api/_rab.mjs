import { readFileSync, writeFileSync } from 'node:fs'

const p = 'src/lib/struktur-ke-rab.ts'
let s = readFileSync(p, 'utf8')

// ── 1. Tipe pekerjaan bertambah ─────────────────────────────────────────────
const T_LAMA = `export type JenisPekerjaan =
  | 'beton'
  | 'bekisting'
  | 'pembesian'
  | 'baja-profil'`
const T_BARU = `export type JenisPekerjaan =
  | 'beton'
  | 'bekisting'
  | 'pembesian'
  | 'baja-profil'
  /*
    Kayu dan baja ringan punya AHSP yang SAMA SEKALI BERBEDA dari beton
    maupun baja profil berat, dan satuannya pun lain (kayu m³, baja ringan m).

    Sebelum keduanya dipisahkan, kuda-kuda kayu masuk usulan sebagai
    "Beton kuda_kuda_kayu" dan dicarikan AHSP beton — "tak ketemu" itu justru
    yang menyelamatkannya dari harga yang keliru. Baja ringan lebih buruk: ia
    TERPASANGKAN ke \`2.3.1.1\` "Pabrikasi dan Ereksi Baja Profil", yaitu AHSP
    baja WF berat, dan harganya jauh berbeda.
  */
  | 'kayu'
  | 'baja-ringan'`
if (!s.includes(T_LAMA)) { console.error('anchor tipe'); process.exit(1) }
s = s.replace(T_LAMA, T_BARU)

// ── 2. Pola pencarian AHSP ──────────────────────────────────────────────────
const P_LAMA = `const POLA_BAJA_PROFIL: string[] = [`
const P_BARU = `/**
 * Pola AHSP kuda-kuda kayu — diukur di basis: \`2.1.2.1\` "Pemasangan 1 m3
 * konstruksi kuda-kuda konvensional, kayu kelas II" dan \`CIB-STD-47/48\`.
 *
 * Satuannya m³, sama dengan beton — karena itu \`assemblyCocok\` yang
 * mensyaratkan satuan cocok TIDAK cukup membedakannya. Polanya harus
 * menyebut kayu.
 */
const POLA_KAYU: string[] = [
  'konstruksi kuda-kuda kayu', 'kuda-kuda kayu', 'konstruksi kayu',
]

/**
 * Pola AHSP baja ringan — diukur di basis: \`2.1.1.3\` "Pemasangan 1 m Kaso
 * Baja Ringan C75 tebal 0,75 mm" (satuan m) dan \`2.1.1.1\` rangka atap per m².
 *
 * DIPISAHKAN dari baja profil: \`2.3.1.1\` "Pabrikasi dan Ereksi Baja Profil"
 * adalah AHSP baja WF berat dengan las dan crane. Memakainya untuk baja ringan
 * memberi harga yang jauh meleset — dan hasilnya tetap terlihat wajar.
 */
const POLA_BAJA_RINGAN: string[] = [
  'kaso baja ringan', 'baja ringan', 'rangka atap baja ringan',
]

const POLA_BAJA_PROFIL: string[] = [`
if (!s.includes(P_LAMA)) { console.error('anchor pola'); process.exit(1) }
s = s.replace(P_LAMA, P_BARU)

// ── 3. Cabang beton mengenali kayu ──────────────────────────────────────────
const B_LAMA = `  if (el.volume.betonM3 > 0) {
    usulan.push({
      jenis: 'beton',
      uraian: \`Beton \${namaElemen(el.jenis)} \${el.kode}\`,
      kuantitas: el.volume.betonM3,
      satuan: 'm3',
      assemblyPola: polaBeton(el.fcMpa),
      asal,
      catatan,
    })
  }`
const B_BARU = `  if (el.volume.betonM3 > 0) {
    /*
      Medan \`betonM3\` menampung volume bahan utama, dan untuk kuda-kuda kayu
      isinya KAYU — bukan beton. Modul kayu memakai medan yang sama supaya
      rekap proyek bisa menjumlahkannya (satuannya sama, m³), tetapi AHSP dan
      harganya berbeda sama sekali.

      Tanpa pembedaan ini, usulan berbunyi "Beton kuda_kuda_kayu" dan dicari
      di AHSP beton — dan kalau kebetulan ada yang cocok satuannya, kayu akan
      dihargai sebagai beton.
    */
    const kayu = el.jenis === 'kuda_kuda_kayu'
    usulan.push({
      jenis: kayu ? 'kayu' : 'beton',
      uraian: kayu
        ? \`Konstruksi kayu \${el.kode}\`
        : \`Beton \${namaElemen(el.jenis)} \${el.kode}\`,
      kuantitas: el.volume.betonM3,
      satuan: 'm3',
      assemblyPola: kayu ? POLA_KAYU : polaBeton(el.fcMpa),
      asal,
      catatan,
    })
  }`
if (!s.includes(B_LAMA)) { console.error('anchor beton'); process.exit(1) }
s = s.replace(B_LAMA, B_BARU)

// ── 4. Baris besi mengenali baja ringan ─────────────────────────────────────
const R_LAMA = `    const profil = b.peran.startsWith('profil ')`
const R_BARU = `    const profil = b.peran.startsWith('profil ')
    /*
      Baja RINGAN dipisahkan dari baja profil berat. Keduanya berperan
      \`profil …\`, tetapi AHSP-nya berbeda jauh: baja ringan dipasang per
      meter kaso oleh tukang atap, baja profil difabrikasi dan diereksi dengan
      las dan crane.
    */
    const ringan = el.jenis === 'baja_ringan'`
if (!s.includes(R_LAMA)) { console.error('anchor profil'); process.exit(1) }
s = s.replace(R_LAMA, R_BARU)

const J_LAMA = `      jenis: profil ? 'baja-profil' : 'pembesian',`
const J_BARU = `      jenis: ringan ? 'baja-ringan' : profil ? 'baja-profil' : 'pembesian',`
if (!s.includes(J_LAMA)) { console.error('anchor jenis besi'); process.exit(1) }
s = s.replace(J_LAMA, J_BARU)

const A_LAMA = `      assemblyPola: profil ? POLA_BAJA_PROFIL : POLA_PEMBESIAN,`
const A_BARU = `      assemblyPola: ringan
        ? POLA_BAJA_RINGAN
        : profil ? POLA_BAJA_PROFIL : POLA_PEMBESIAN,`
if (!s.includes(A_LAMA)) { console.error('anchor pola besi'); process.exit(1) }
s = s.replace(A_LAMA, A_BARU)

// ── 5. Urutan pengerjaan ────────────────────────────────────────────────────
const U_LAMA = `    beton: 1, bekisting: 2, pembesian: 3, 'baja-profil': 4,`
const U_BARU = `    beton: 1, bekisting: 2, pembesian: 3, 'baja-profil': 4,
    /* Rangka atap dikerjakan terakhir — mengikuti urutan lapangan. */
    kayu: 5, 'baja-ringan': 6,`
if (!s.includes(U_LAMA)) { console.error('anchor urutan'); process.exit(1) }
s = s.replace(U_LAMA, U_BARU)

writeFileSync(p, s)
console.log('OK')
