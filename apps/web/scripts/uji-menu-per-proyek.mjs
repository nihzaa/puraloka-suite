#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// BUKTI PERILAKU — rantai "menu per-proyek" utuh dari sidebar sampai isinya.
//
// ── Kenapa perlu diuji di peramban, bukan unit test
//
// Rantainya melibatkan tiga bagian yang masing-masing bisa benar sendiri tapi
// putus saat disambung:
//
//   1. menu  ->  /m/<key>            (migrasi 224)
//   2. /m/<key> menampilkan DAFTAR PROYEK, lalu menaut /proyek/<id>#<anchor>
//   3. halaman proyek MENGGULIR ke anchor itu
//
// Ketiganya pernah rusak sekaligus, dan tak satu pun test menangkapnya:
//
//   • `/m/<key>` membaca `data.data` padahal API menjawab `{ total, projects }`
//     -> selamanya kosong, dan `?? []` mengubahnya jadi "Belum ada proyek.
//     Buat proyek dulu." pada basis berisi 15 proyek. Kalimatnya masuk akal,
//     jadi tak seorang pun curiga. Galatnya pun ditelan `.catch(() => {})`.
//   • `tabProyek` bernilai 'kurva-s'/'change-order' padahal anchor nyatanya
//     `sec-kurvas`/`sec-co` — tak satu pun dari 19 tautan cocok.
//   • halaman proyek tak punya penanganan hash sama sekali; peramban memproses
//     hash saat dokumen dimuat, dan saat itu halaman masih skeleton.
//
// Yang diperiksa di sini adalah HASILNYA: apakah orang yang mengklik "Kurva S"
// benar-benar sampai di kurva S.
//
// Pakai (dari apps/web, butuh server :3000 & :3001 hidup):
//   LAYAR_EMAIL=... LAYAR_SANDI=... node scripts/uji-menu-per-proyek.mjs
//
// Kredensial LEWAT ENV, tidak pernah ditulis ke berkas — repo ini publik.
// ════════════════════════════════════════════════════════════════════════════
import { chromium } from '@playwright/test'
const B='http://localhost:3000'
const p=await chromium.launch()
const k=await p.newContext({viewport:{width:1440,height:950}})
const h=await k.newPage()
await h.goto(`${B}/login`,{waitUntil:'domcontentloaded'})
await h.waitForSelector('#login-email',{timeout:20000})
await h.fill('#login-email',process.env.LAYAR_EMAIL)
await h.fill('#login-password',process.env.LAYAR_SANDI)
await h.click('button[type=submit]')
await h.waitForURL(u=>!u.pathname.includes('/login'),{timeout:30000})
let gagal=0
await h.goto(`${B}/m/jd-kurva-s`,{waitUntil:'networkidle',timeout:30000})
await h.waitForTimeout(1500)
const teks=await h.locator('body').innerText()
if(teks.includes('Pilih proyek')) console.log('✅ /m/jd-kurva-s menampilkan "Pilih proyek"')
else { console.log('❌ tidak ada pemilih proyek'); gagal++ }
// Selektor pertama `a[href*="/proyek/"]` menangkap `/proyek/keterlambatan`
// (tautan lain di halaman) — kartu proyek yang dicari ber-href memuat '#'.
const href=await h.locator('a[href*="#sec-"]').first().getAttribute('href').catch(()=>null)
console.log('   tautan pertama:',href)
if(href && href.includes('#sec-kurvas')) console.log('✅ anchor #sec-kurvas cocok id nyata')
else { console.log('❌ anchor salah/absen'); gagal++ }
if(href){
  await h.goto(`${B}${href}`,{waitUntil:'networkidle',timeout:30000})
  await h.waitForTimeout(2500)
  const y=await h.evaluate(()=>{const el=document.getElementById('sec-kurvas');
    return el?{ada:true,scrollY:Math.round(window.scrollY)}:{ada:false}})
  console.log('   sec-kurvas:',JSON.stringify(y))
  if(y.ada && y.scrollY>100) console.log('✅ halaman MENGGULIR ke bagian itu')
  else if(y.ada){ console.log('⚠️  anchor ada tapi tak menggulir'); gagal++ }
  else { console.log('❌ anchor tak ada'); gagal++ }
}
await h.screenshot({path:'E:/Project/puraloka-suite/apps/web/.layar/pemilih-proyek.png'})
await p.close()
console.log(gagal===0?'\n✅ SEMUA LULUS':`\n❌ ${gagal} gagal`)
process.exit(gagal===0?0:1)
