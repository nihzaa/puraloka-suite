'use client'

import { Canvas, useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'

// ════════════════════════════════════════════════════════════════════════════
// Massing prosedural — geometri dari kode, NOL berkas model.
//
// ── Kenapa prosedural, bukan .glb
//
// Yang diceritakan adalah URUTAN MEMBANGUN, dan itu butuh kontrol per-elemen
// yang tak diberikan model statis. Bonus: nol MB unduhan, dan tak ada aset yang
// bisa dikenali orang dari tempat lain.
//
// ── JANGAN panggil convertSRGBToLinear() di sini ────────────────────────────
//
// Three.js modern (r152+) sudah memakai manajemen warna otomatis:
// `THREE.Color` menganggap hex sebagai sRGB dan mengonversinya sendiri saat
// render. Memanggil `convertSRGBToLinear()` membuat konversinya terjadi DUA
// KALI, dan hasilnya warna yang jauh lebih gelap dari yang ditulis.
//
// Cacat itu memakan empat percobaan yang semuanya salah sasaran: menaikkan hex
// PADAM tiga kali (#0A3A6B → #2F4F73 → #4E7098 → #5F80A6) dan menambah
// hemisphereLight, semuanya berdasarkan kesimpulan "adegannya kurang cahaya"
// yang saya tarik dari melihat potret HALAMAN.
//
// Yang akhirnya menemukannya: memotret CANVAS-nya sendiri (lantai bawah
// ternyata sudah biru terang — pencahayaan tak pernah bermasalah), lalu
// mengganti seluruh material dengan `meshBasicMaterial` yang mengabaikan
// cahaya sepenuhnya. Pelat tetap gelap → penyebabnya bukan cahaya, bukan
// warna, melainkan konversi ganda.
//
// Pelajarannya: kalau perbaikan ketiga masih tidak bekerja, berhenti menebak
// dan matikan variabelnya satu per satu.
// ════════════════════════════════════════════════════════════════════════════
const PADAM = new THREE.Color('#5F80A6')
const NYALA = new THREE.Color('#2E6FC4')
const AKSEN = new THREE.Color('#FFD600')
const RANGKA = new THREE.Color('#93B6DD')
const GELAP = new THREE.Color('#000000')

type Lantai = { i: number; y: number; lebar: number; dalam: number }

/** Pelat lantai. Yang paling atas saat ini diberi aksen — penanda "sampai sini". */
function Pelat({ l, nyala, terdepan }: { l: Lantai; nyala: boolean; terdepan: boolean }) {
  return (
    <mesh position={[0, l.y, 0]}>
      <boxGeometry args={[l.lebar, 0.12, l.dalam]} />
      <meshStandardMaterial
        color={terdepan ? AKSEN : nyala ? NYALA : PADAM}
        emissive={terdepan ? AKSEN : GELAP}
        emissiveIntensity={terdepan ? 0.4 : 0}
        roughness={0.5}
        metalness={0.25}
      />
    </mesh>
  )
}

/** Empat kolom sudut — tanpa ini pelat terlihat melayang, bukan bertumpu. */
function Kolom({ l, tinggi }: { l: Lantai; tinggi: number }) {
  const kx = l.lebar / 2 - 0.1
  const kz = l.dalam / 2 - 0.1
  const posisi: Array<[number, number]> = [
    [kx, kz],
    [-kx, kz],
    [kx, -kz],
    [-kx, -kz],
  ]
  return (
    <>
      {posisi.map(([x, z], n) => (
        <mesh key={n} position={[x, l.y + tinggi / 2 + 0.06, z]}>
          <boxGeometry args={[0.075, tinggi, 0.075]} />
          <meshStandardMaterial color={RANGKA} roughness={0.6} metalness={0.35} />
        </mesh>
      ))}
    </>
  )
}

/** Putaran sangat lambat — memperlihatkan bahwa ini objek ruang, bukan gambar. */
function Bangunan({
  lantai,
  aktifSampai,
  jedaGerak,
}: {
  lantai: Lantai[]
  aktifSampai: number
  jedaGerak: boolean
}) {
  const ref = useRef<THREE.Group>(null)
  useFrame((_, delta) => {
    if (!jedaGerak && ref.current) ref.current.rotation.y += delta * 0.12
  })

  return (
    <group ref={ref} position={[0, -1.15, 0]}>
      {lantai.map((l) => {
        const nyala = l.i < aktifSampai
        const terdepan = l.i === aktifSampai - 1
        return (
          <group key={l.i}>
            <Pelat l={l} nyala={nyala} terdepan={terdepan} />
            {/* Kolom hanya untuk tingkat yang SUDAH dilewati — bangunannya
                tumbuh ke atas, bukan sekadar berubah warna. */}
            {nyala && l.i < lantai.length - 1 && <Kolom l={l} tinggi={0.42} />}
          </group>
        )
      })}
    </group>
  )
}

export function Massing({
  tahap,
  progress,
  jedaGerak = false,
}: {
  tahap: number
  progress: number
  jedaGerak?: boolean
}) {
  // Minimal satu lantai selalu menyala. Adegan yang seluruhnya padam terbaca
  // sebagai gagal-muat, bukan sebagai "belum mulai".
  const aktifSampai = Math.max(1, Math.round(progress * tahap))

  // Penyusutan per lantai sengaja KECIL (0,06 dari 2,2 ≈ 3%). Nilai sebelumnya
  // (0,15) membuat lantai teratas 30% lebih sempit dari dasar, dan siluetnya
  // terbaca sebagai piramida — bukan gedung bertingkat. Setback tipis justru
  // yang dikenali orang sebagai massing bangunan.
  const lantai = useMemo<Lantai[]>(
    () =>
      Array.from({ length: tahap }, (_, i) => ({
        i,
        y: i * 0.44,
        lebar: 2.2 - i * 0.06,
        dalam: 1.6 - i * 0.045,
      })),
    [tahap],
  )

  return (
    <Canvas
      // Kamera mundur dan naik: pada jarak sebelumnya bangunan terpotong di
      // dasar canvas saat kelima lantai sudah tumbuh.
      camera={{ position: [4.1, 3.1, 4.6], fov: 40 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      // Budget performa yang tak bisa dilanggar (spec §4.2, rem ketiga):
      // berapa pun DPR perangkat, render tak melampaui 1,75x. Tanpa batas ini
      // layar 3x menggambar 9x piksel dan HP kelas bawah tersendat.
      dpr={[1, 1.75]}
      style={{ height: '46vh', minHeight: '18rem', width: '100%' }}
    >
      {/* Empat sumber: hemisphere memberi warna langit-tanah pada bidang atas
          dan bawah, dua directional membentuk sisi dan bayangan. Nilainya
          disetel SETELAH konversi ganda diperbaiki — sebelum itu, menambah
          cahaya cuma menutupi gejala tanpa menyentuh sebabnya. */}
      <hemisphereLight args={[RANGKA, PADAM, 1.1]} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[4, 6, 4]} intensity={1.2} />
      <directionalLight position={[-4, 1, -3]} intensity={0.45} color={RANGKA} />
      <Bangunan lantai={lantai} aktifSampai={aktifSampai} jedaGerak={jedaGerak} />
    </Canvas>
  )
}
