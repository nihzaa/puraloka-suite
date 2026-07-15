const SATUAN = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan',
  'sepuluh', 'sebelas', 'dua belas', 'tiga belas', 'empat belas', 'lima belas',
  'enam belas', 'tujuh belas', 'delapan belas', 'sembilan belas']

const PULUHAN = ['', '', 'dua puluh', 'tiga puluh', 'empat puluh', 'lima puluh',
  'enam puluh', 'tujuh puluh', 'delapan puluh', 'sembilan puluh']

function belasan(n: number): string {
  if (n < 20) return SATUAN[n]
  const d = Math.floor(n / 10)
  const s = n % 10
  return s === 0 ? PULUHAN[d] : `${PULUHAN[d]} ${SATUAN[s]}`
}

function ratusan(n: number): string {
  if (n < 100) return belasan(n)
  const r = Math.floor(n / 100)
  const rest = n % 100
  const prefix = r === 1 ? 'seratus' : `${SATUAN[r]} ratus`
  return rest === 0 ? prefix : `${prefix} ${belasan(rest)}`
}

function ribuan(n: number): string {
  if (n < 1000) return ratusan(n)
  const r = Math.floor(n / 1000)
  const rest = n % 1000
  const prefix = r === 1 ? 'seribu' : `${ratusan(r)} ribu`
  return rest === 0 ? prefix : `${prefix} ${ratusan(rest)}`
}

export function terbilang(n: number): string {
  const bilangan = Math.floor(Math.abs(n))

  if (bilangan === 0) return 'nol rupiah'

  let hasil = ''

  const trilliun = Math.floor(bilangan / 1_000_000_000_000)
  const sisaTrilliun = bilangan % 1_000_000_000_000

  const miliar = Math.floor(sisaTrilliun / 1_000_000_000)
  const sisaMiliar = sisaTrilliun % 1_000_000_000

  const juta = Math.floor(sisaMiliar / 1_000_000)
  const sisaJuta = sisaMiliar % 1_000_000

  const ribu = Math.floor(sisaJuta / 1_000)
  const sisaRibu = sisaJuta % 1_000

  if (trilliun > 0) hasil += `${ribuan(trilliun)} triliun `
  if (miliar > 0) hasil += `${ribuan(miliar)} miliar `
  if (juta > 0) hasil += `${ribuan(juta)} juta `
  if (ribu > 0) hasil += `${ribuan(ribu)} ribu `
  if (sisaRibu > 0) hasil += `${ratusan(sisaRibu)} `

  return `${hasil.trim()} rupiah`
}

export function terbilangHari(n: number): string {
  const bilangan = Math.floor(Math.abs(n))
  if (bilangan === 0) return 'nol'
  return ribuan(bilangan)
}
