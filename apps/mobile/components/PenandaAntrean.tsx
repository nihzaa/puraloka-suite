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
 *
 * ── Kenapa ada jalur BUANG, dan kenapa hanya untuk yang macet
 *
 * `hapusDariAntrean()` ada sejak antrean dibangun dan sampai kini TAK PUNYA
 * SATU PUN PEMANGGIL. Akibatnya kiriman yang ditolak server secara permanen
 * — muatan salah bentuk, proyek yang sudah dihapus, sesi yang sudah dicabut
 * — terkunci di penyimpanan SELAMANYA, lengkap dengan foto salinan yang
 * ikut menahan ruang HP.
 *
 * Lebih buruk dari sekadar sampah: penanda ini lalu tak pernah hilang dari
 * layar, dan penanda yang selalu menyala berhenti berarti apa-apa. Mandor
 * mengabaikannya — termasuk saat isinya kiriman BARU yang benar-benar
 * tertahan sinyal.
 *
 * Buang hanya ditawarkan untuk yang `perluPerhatian()`. Kiriman yang masih
 * menunggu sinyal TIDAK boleh punya tombol buang: ia akan terkirim sendiri,
 * dan tombol di sebelahnya hanya mengundang orang membuang pekerjaan yang
 * sebenarnya sehat.
 *
 * Konfirmasinya menyebut ISI kirimannya (`ringkas`), bukan "kiriman ini" —
 * yang menekan harus tahu absensi hari apa yang sedang ia hapus, karena
 * sesudah dibuang datanya tak bisa dipulihkan dari mana pun.
 */
import React, { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import {
  daftarAntrean, prosesAntrean, perluPerhatian, hapusDariAntrean, type Kiriman,
} from '@/lib/antrean'

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

  /**
   * Buang kiriman macet — dengan konfirmasi yang menyebut isinya.
   *
   * `Alert` bawaan sistem dipakai, bukan modal buatan sendiri: ini keputusan
   * menghapus data yang tak bisa dipulihkan, dan dialog sistem sudah menahan
   * sentuhan tak sengaja lebih baik daripada apa pun yang bisa digambar di
   * dalam kartu sekecil ini.
   */
  const buang = useCallback((k: Kiriman) => {
    Alert.alert(
      'Buang kiriman ini?',
      `${k.ringkas}\n\nData ini belum sampai ke server dan TIDAK bisa dipulihkan setelah dibuang. Isi ulang dari awal bila masih dibutuhkan.`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Buang',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              await hapusDariAntrean(k.id)
              await segarkan()
            })()
          },
        },
      ],
    )
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

  const yangMacet = isi.filter(perluPerhatian)
  const macet = yangMacet.length

  return (
    <View style={[styles.kotak, macet > 0 && styles.kotakMacet]}>
      <View style={styles.baris}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.judul, macet > 0 && styles.judulMacet]}>
            {macet > 0
              ? `${macet} kiriman perlu diperiksa`
              : `${isi.length} kiriman menunggu sinyal`}
          </Text>
          <Text style={styles.rinci} numberOfLines={2}>
            {macet > 0
              ? 'Sudah dicoba berkali-kali dan ditolak server. Tunjukkan ke admin, atau buang bila memang tak terpakai.'
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

      {/*
        Rincian per-kiriman HANYA untuk yang macet. Yang masih menunggu sinyal
        sengaja tak dirinci di sini: ia akan hilang sendiri, dan daftar yang
        berubah tiap 30 detik hanya menambah kebisingan.
      */}
      {yangMacet.map((k) => (
        <View key={k.id} style={styles.barisMacet}>
          <View style={{ flex: 1 }}>
            <Text style={styles.macetRingkas} numberOfLines={1}>{k.ringkas}</Text>
            {/*
              Alasan penolakan server ditampilkan APA ADANYA. Menerjemahkannya
              jadi "terjadi kesalahan" menghapus satu-satunya petunjuk yang
              bisa dibawa mandor ke admin.
            */}
            <Text style={styles.macetGalat} numberOfLines={2}>
              {k.galatTerakhir ?? 'Ditolak server'} · {k.percobaan}× dicoba
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => buang(k)}
            style={styles.tombolBuang}
            accessibilityRole="button"
            accessibilityLabel={`Buang kiriman ${k.ringkas}`}
          >
            <Text style={styles.tombolBuangTeks}>Buang</Text>
          </TouchableOpacity>
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  kotak: {
    gap: 10,
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
  baris: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  barisMacet: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#FECACA',
  },
  macetRingkas: { fontSize: 12, fontWeight: '600', color: '#7F1D1D' },
  // #B91C1C di atas #FEF2F2 = 6,4:1 — lolos WCAG AA.
  macetGalat: { fontSize: 11, color: '#B91C1C', marginTop: 1 },
  tombolBuang: {
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#FECACA',
    // 44x44 — WCAG 2.5.5, sama seperti tombol "Coba kirim" di atasnya.
    minHeight: 44,
    justifyContent: 'center',
  },
  tombolBuangTeks: { fontSize: 12, fontWeight: '700', color: '#B91C1C' },
})
