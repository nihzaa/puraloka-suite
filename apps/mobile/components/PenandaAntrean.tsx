/**
 * PENANDA ANTREAN — memberi tahu bahwa ada kiriman yang belum sampai.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA HARUS TERLIHAT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Antrean yang bekerja diam-diam menciptakan masalahnya sendiri: mandor
 * diberi tahu "akan dikirim otomatis", lalu tak pernah tahu apakah itu sudah
 * terjadi. Yang ragu akan mengisi ULANG — dan isian ulang punya kunci
 * idempotensi BERBEDA, jadi gerbang di server tak bisa menahannya. Antrean
 * yang tak terlihat justru menghasilkan duplikat yang hendak dicegahnya.
 *
 * Penanda ini muncul HANYA saat ada isinya. Tak ada kiriman tertunda = tak
 * ada apa pun di layar; ia tak menjadi hiasan permanen.
 *
 * ── Kenapa mengalir sendiri, bukan tombol "kirim sekarang"
 *
 * Mandor tak seharusnya perlu tahu bahwa ada antrean. Ia menekan simpan,
 * aplikasinya mengurus sisanya. Tombol hanya disediakan untuk yang sudah
 * berkali-kali gagal — di situ, keputusannya memang milik manusia.
 */
import React, { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { daftarAntrean, prosesAntrean, perluPerhatian, type Kiriman } from '@/lib/antrean'

export function PenandaAntrean() {
  const [isi, setIsi] = useState<Kiriman[]>([])
  const [sedangKirim, setSedangKirim] = useState(false)

  const segarkan = useCallback(async () => {
    setIsi(await daftarAntrean())
  }, [])

  const coba = useCallback(async () => {
    setSedangKirim(true)
    try {
      await prosesAntrean()
    } finally {
      setSedangKirim(false)
      await segarkan()
    }
  }, [segarkan])

  useEffect(() => {
    let hidup = true

    /*
      Satu kali saat dipasang, lalu berkala.

      `@react-native-community/netinfo` TIDAK terpasang, dan memasangnya
      berarti `pnpm install` di monorepo yang sedang dipakai sesi lain
      (CLAUDE.md §8a.1). Jajak berkala 30 detik memberi hasil yang sama untuk
      keperluan ini: permintaan pertama yang berhasil ADALAH bukti sinyal
      kembali, dan yang gagal berhenti di kiriman pertama (lihat
      `prosesAntrean`) jadi biayanya satu permintaan, bukan satu per kiriman.
    */
    const jalan = async () => {
      if (!hidup) return
      const antre = await daftarAntrean()
      if (!hidup) return
      setIsi(antre)
      if (antre.length > 0) await coba()
    }

    void jalan()
    const timer = setInterval(jalan, 30_000)
    return () => { hidup = false; clearInterval(timer) }
  }, [coba])

  if (isi.length === 0) return null

  const macet = isi.filter(perluPerhatian).length

  return (
    <View style={[styles.kotak, macet > 0 && styles.kotakMacet]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.judul, macet > 0 && styles.judulMacet]}>
          {macet > 0
            ? `${macet} kiriman perlu diperiksa`
            : `${isi.length} kiriman menunggu sinyal`}
        </Text>
        <Text style={styles.rinci} numberOfLines={2}>
          {macet > 0
            ? 'Sudah dicoba berkali-kali dan ditolak server. Tunjukkan ke admin.'
            : isi.map((k) => k.ringkas).join(' · ')}
        </Text>
      </View>
      {sedangKirim ? (
        <ActivityIndicator size="small" color="#92400E" />
      ) : (
        <TouchableOpacity onPress={coba} style={styles.tombol} accessibilityRole="button">
          <Text style={styles.tombolTeks}>Coba kirim</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  kotak: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  kotakMacet: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  // #92400E di atas #FFFBEB = 7,1:1 — lolos WCAG AA dengan lapang.
  judul: { fontSize: 13, fontWeight: '700', color: '#92400E' },
  judulMacet: { color: '#B91C1C' },
  rinci: { fontSize: 12, color: '#78716C', marginTop: 2 },
  tombol: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#FDE68A',
    // 44x44 adalah batas sasaran sentuh WCAG 2.5.5; tinggi minimum dijaga di
    // sini supaya tombol tak menyusut mengikuti teksnya.
    minHeight: 44,
    justifyContent: 'center',
  },
  tombolTeks: { fontSize: 12, fontWeight: '600', color: '#92400E' },
})
