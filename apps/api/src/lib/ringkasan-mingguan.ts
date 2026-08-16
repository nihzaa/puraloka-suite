/**
 * RINGKASAN MINGGUAN — satu pesan seminggu, menggantikan membaca semuanya.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA SATU, BUKAN TIGA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Rencana memuat tiga automation ringkasan: 1.14 Weekly Digest, 8.11 Morning
 * Briefing + Evening Wrap, 8.12 Anomaly Digest. Yang dibangun SATU.
 *
 * Founder menyatakan tak mau banyak pesan, dan pengukuran 2026-08-16
 * membenarkannya dengan angka: 9.009 notifikasi, 3 dibaca. Menambah tiga
 * pengirim baru ke sistem yang baru saja dibersihkan adalah cara tercepat
 * mengulang cacat yang baru diperbaiki.
 *
 * 8.11 (briefing pagi + rangkuman sore) berarti DUA pesan sehari — empat belas
 * seminggu. Itu kebalikan arah dari jeda melandai yang baru dipasang.
 * 8.12 (anomali mingguan) adalah himpunan bagian dari ini: anomali sudah
 * menjadi notifikasi, jadi ia sudah terhitung di sini.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * CACAT YANG PALING MUDAH LOLOS: DIGEST MERANGKUM DIRINYA SENDIRI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Ringkasan ini menulis notifikasi. Minggu depan ia membaca notifikasi tujuh
 * hari terakhir — termasuk ringkasan minggu lalu.
 *
 * Akibatnya bukan sekadar angka yang meleset: pada minggu yang benar-benar
 * sepi, satu-satunya isi ringkasan adalah ringkasan sebelumnya, sehingga ia
 * tak pernah "kosong" dan terkirim SELAMANYA. Alarm yang berbunyi tiap minggu
 * untuk mengabarkan bahwa minggu lalu ada alarm.
 *
 * Tak ada galat, tak ada gejala — kecuali orang berhenti membacanya.
 */

export interface BarisNotifikasi {
  type: string
  priority: string | null | undefined
  /** Sudah dibaca? Dipakai untuk memisahkan "baru" dari "diabaikan". */
  sudahDibaca: boolean
}

export interface RingkasJenis {
  type: string
  jumlah: number
  belumDibaca: number
}

export interface HasilRingkasan {
  total: number
  belumDibaca: number
  mendesak: number
  perJenis: RingkasJenis[]
  /** Layak dikirim? Minggu tanpa apa-apa TIDAK menghasilkan pesan. */
  layakKirim: boolean
}

/**
 * @param jenisSendiri jenis notifikasi ringkasan itu sendiri — dibuang supaya
 *                     ia tak merangkum dirinya. WAJIB diisi pemanggil; default
 *                     tersembunyi di sini akan jadi cacat yang tak terlihat
 *                     ketika namanya berubah.
 * @param minJenis     berapa jenis berbeda minimum sebelum ringkasan dikirim
 */
export function susunRingkasan(
  baris: BarisNotifikasi[],
  jenisSendiri: string,
  minJenis: number,
): HasilRingkasan {
  const bersih = baris.filter((b) => b.type && b.type !== jenisSendiri)

  const peta = new Map<string, RingkasJenis>()
  let belumDibaca = 0
  let mendesak = 0

  for (const b of bersih) {
    const p = peta.get(b.type) ?? { type: b.type, jumlah: 0, belumDibaca: 0 }
    p.jumlah++
    if (!b.sudahDibaca) { p.belumDibaca++; belumDibaca++ }
    peta.set(b.type, p)

    /*
      'urgent' DAN 'high' dihitung mendesak.

      Kode di repo ini memakai keduanya, dan memeriksa satu saja membuat
      separuh peringatan penting hilang dari baris terpenting ringkasan —
      tanpa gejala apa pun selain angka yang terlihat tenang.
    */
    const pr = String(b.priority ?? '').toLowerCase()
    if (pr === 'urgent' || pr === 'high') mendesak++
  }

  const perJenis = [...peta.values()].sort(
    (a, b) => b.belumDibaca - a.belumDibaca || b.jumlah - a.jumlah,
  )

  return {
    total: bersih.length,
    belumDibaca,
    mendesak,
    perJenis,
    /*
      Minggu sepi TIDAK menghasilkan pesan.

      "Tidak ada apa-apa minggu ini" yang dikirim tiap Senin adalah pesan yang
      selalu benar dan tak pernah berguna. Ia melatih orang mengabaikan
      pengirimnya, dan ketika minggu yang ramai tiba, pesannya sudah tak
      dibaca lagi.
    */
    layakKirim: perJenis.length >= Math.max(1, minJenis),
  }
}
