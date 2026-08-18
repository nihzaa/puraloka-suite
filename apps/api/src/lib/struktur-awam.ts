// Menerjemahkan verdict struktur ke bahasa orang yang TIDAK mengerti teknik.
//
// ══════════════════════════════════════════════════════════════════════════════
// KENAPA BERKAS INI ADA
// ══════════════════════════════════════════════════════════════════════════════
//
// Keluaran modul struktur hari ini berbunyi begini:
//
//     Lentur     φMn = 0.9 · As · fy · (d − a/2)    153,15 ≥ 83,20 kNm    aman
//
// Itu benar, lengkap, dan bisa diperiksa ulang insinyur. Tetapi yang memutuskan
// membangun sering BUKAN insinyur: pemilik proyek, klien, manajer proyek,
// pengawas dari pihak pemberi kerja. Bagi mereka baris di atas tak bisa
// ditindak — dan yang tak bisa ditindak akan diterima begitu saja, termasuk
// saat ia MERAH.
//
// Yang berbahaya bukan ketidaktahuannya. Yang berbahaya adalah verdict merah
// yang tak dipahami lalu dilewati, karena "nanti insinyurnya yang urus" —
// padahal yang punya kuasa menunda pengecoran justru orang non-teknis itu.
//
// ── Tiga hal yang WAJIB ada untuk tiap pemeriksaan
//
//   1. APA yang diperiksa — dalam kalimat yang bisa dibayangkan
//   2. APA RISIKONYA kalau gagal — akibat fisiknya, bukan istilahnya
//   3. APA TINDAKANNYA — langkah nyata, bukan "konsultasikan ke ahli"
//
// Ketiganya WAJIB lewat tipe. Penjelasan tanpa tindakan adalah jalan buntu yang
// membuat orang merasa bersalah tanpa tahu harus apa.
//
// ── Yang berkas ini TIDAK lakukan
//
// Ia TIDAK menghitung apa pun dan TIDAK mengubah verdict. Ia hanya
// menerjemahkan. Kalau perhitungannya salah, penjelasan yang ramah justru
// membuat kesalahan itu lebih meyakinkan — karena itu berkas ini sengaja
// dipisah dari yang menghitung, dan tak pernah boleh jadi tempat "menghaluskan"
// verdict.
//
// ⚠ BATAS TANGGUNG JAWAB. Penjelasan di sini membantu MEMAHAMI, bukan
// menggantikan perhitungan bertanda tangan insinyur. Elemen yang verdict-nya
// merah tetap merah, betapa pun ramah kalimatnya.
// ══════════════════════════════════════════════════════════════════════════════

/** Seberapa mendesak, ditentukan dari rasio tuntutan/kapasitas. */
export type TingkatBahaya = 'aman' | 'mepet' | 'bahaya'

export interface PenjelasanAwam {
  /** Nama pemeriksaan versi teknis — tetap dibawa supaya bisa dicocokkan. */
  nama: string
  /** Judul versi awam, satu frasa. */
  judul: string
  /** APA yang sedang diperiksa. */
  apa: string
  /** APA yang terjadi secara fisik kalau ini gagal. */
  risiko: string
  /** APA yang harus dilakukan kalau merah — langkah nyata. */
  tindakan: string
}

/**
 * Ambang tingkat bahaya.
 *
 * `rasio` = tuntutan / kapasitas. Nilainya 1,0 berarti tepat di batas.
 *
 * 0,90 dipilih sebagai batas "mepet" bukan karena angka bulat: di bawah itu
 * masih ada ruang untuk ketidakpastian beban yang wajar (penambahan lantai
 * finishing, beban hidup yang lebih besar dari asumsi). Di atasnya, satu
 * perubahan kecil di lapangan sudah cukup melewati batas — dan perubahan kecil
 * di lapangan adalah hal yang PASTI terjadi.
 */
export const AMBANG_MEPET = 0.9

export function tingkatBahaya(rasio: number, aman: boolean): TingkatBahaya {
  if (!aman) return 'bahaya'
  return rasio >= AMBANG_MEPET ? 'mepet' : 'aman'
}

/**
 * Kamus penjelasan, dikunci nama pemeriksaan.
 *
 * Ditulis sebagai DATA, bukan rangkaian if: menambah pemeriksaan baru di modul
 * struktur berarti menambah satu baris di sini, dan penjaga
 * `struktur-awam.test.ts` merahkan pemeriksaan yang belum punya terjemahan —
 * sehingga istilah teknik tak bisa bocor ke layar orang awam tanpa ketahuan.
 */
const KAMUS: Record<string, Omit<PenjelasanAwam, 'nama'>> = {
  'Lentur': {
    judul: 'Kekuatan menahan lenturan',
    apa: 'Balok yang dibebani akan melengkung ke bawah, seperti papan yang '
      + 'diinjak di tengah. Ini memeriksa apakah tulangan di dalamnya cukup '
      + 'untuk menahan lenturan itu.',
    risiko: 'Kalau kurang, balok retak melintang di bagian bawah tengah — '
      + 'retak yang melebar terus dan berujung runtuh. Ini kegagalan yang '
      + 'PALING sering menyebabkan robohnya bangunan bertingkat.',
    tindakan: 'Tambah jumlah atau diameter tulangan bawah, atau tinggikan '
      + 'balok. Meninggikan balok jauh lebih efektif daripada menambah besi.',
  },
  'Geser': {
    judul: 'Kekuatan menahan gaya sobek',
    apa: 'Selain melengkung, balok juga cenderung "tersobek" miring di dekat '
      + 'tumpuannya — seperti kertas yang digunting. Sengkang (besi melingkar) '
      + 'yang menahannya.',
    risiko: 'Kegagalan geser terjadi TIBA-TIBA tanpa retak yang terlihat lebih '
      + 'dulu. Berbeda dari kegagalan lentur yang memberi peringatan berupa '
      + 'lendutan dan retak, yang ini langsung runtuh.',
    tindakan: 'Rapatkan jarak sengkang di dekat tumpuan, atau perbesar '
      + 'diameter sengkang.',
  },
  'Kapasitas aksial': {
    judul: 'Kekuatan menahan beban dari atas',
    apa: 'Kolom menahan berat seluruh lantai di atasnya. Ini memeriksa apakah '
      + 'penampang beton dan tulangannya cukup untuk beban itu.',
    risiko: 'Kolom yang kelebihan beban akan hancur remuk (bukan melengkung), '
      + 'dan runtuhnya kolom menjatuhkan seluruh lantai di atasnya sekaligus.',
    tindakan: 'Perbesar penampang kolom, naikkan mutu beton, atau tambah '
      + 'jumlah tulangan utama.',
  },
  'Titik beban pada diagram P-M': {
    judul: 'Kekuatan saat ditekan DAN didorong bersamaan',
    apa: 'Kolom jarang hanya ditekan lurus dari atas — angin, gempa, dan balok '
      + 'yang tak simetris juga mendorongnya ke samping. Ini memeriksa '
      + 'kombinasi keduanya.',
    risiko: 'Kolom bisa lulus pemeriksaan "beban dari atas" tetapi tetap gagal '
      + 'saat didorong ke samping. Inilah pemeriksaan yang paling sering '
      + 'terlewat dan paling sering jadi sebab runtuh saat gempa.',
    tindakan: 'Perbesar penampang, atau perbanyak tulangan di sisi yang '
      + 'menahan dorongan. Kalau dorongannya dari gempa, periksa ulang sistem '
      + 'penahan gempa bangunannya secara keseluruhan.',
  },
  'Tegangan tanah maksimum': {
    judul: 'Kekuatan tanah menahan pondasi',
    apa: 'Pondasi meneruskan berat bangunan ke tanah. Ini memeriksa apakah '
      + 'tanah di bawahnya sanggup memikul tekanan itu.',
    risiko: 'Tanah yang kelebihan beban akan AMBLAS — bangunan turun tak '
      + 'merata, dinding retak diagonal, pintu dan jendela macet. Perbaikannya '
      + 'jauh lebih mahal daripada memperbesar pondasi sejak awal.',
    tindakan: 'Perluas ukuran pondasi (paling murah), atau ganti ke pondasi '
      + 'tiang bila tanah kerasnya dalam.',
  },
  'Tanah tidak terangkat': {
    judul: 'Pondasi tidak terjungkit',
    apa: 'Kalau beban tidak tepat di tengah pondasi, satu sisi menekan kuat '
      + 'sementara sisi lain justru terangkat — seperti duduk di ujung bangku.',
    risiko: 'Sisi yang terangkat tidak lagi memikul apa pun, sehingga sisi '
      + 'lain menanggung tekanan jauh lebih besar dari yang dihitung. '
      + 'Bangunan miring, dan kemiringan hampir tak bisa diperbaiki.',
    tindakan: 'Perbesar pondasi, atau geser posisi kolom mendekati pusat '
      + 'pondasi.',
  },
  'Geser pons': {
    judul: 'Kolom tidak menembus pondasi',
    apa: 'Kolom yang berat bisa "melubangi" pelat pondasi di bawahnya — '
      + 'seperti pensil yang ditekan menembus kertas.',
    risiko: 'Kegagalan ini terjadi mendadak dan menjatuhkan kolom beserta '
      + 'seluruh beban di atasnya ke dalam tanah. Tidak ada tanda peringatan '
      + 'sebelumnya.',
    tindakan: 'Tebalkan pondasi (paling efektif), atau perbesar penampang '
      + 'kolom di bagian bawah.',
  },
  'Geser pons kolom': {
    judul: 'Kolom tidak menembus pilecap',
    apa: 'Sama seperti pada pondasi telapak: kolom yang berat bisa melubangi '
      + 'poer — pelat beton tebal yang menyatukan kelompok tiang di bawahnya.',
    risiko: 'Kolom jatuh menembus poer, dan tiang-tiang di bawahnya tak lagi '
      + 'menerima beban yang seharusnya. Runtuhnya mendadak, tanpa retak yang '
      + 'terlihat lebih dulu.',
    tindakan: 'Tebalkan pilecap, atau perbesar penampang kolom di bagian '
      + 'pangkalnya.',
  },
  'Geser satu arah X': {
    judul: 'Pondasi tidak patah melintang (arah X)',
    apa: 'Bagian pondasi yang menjorok keluar dari kolom bisa patah seperti '
      + 'papan yang dipijak di ujungnya.',
    risiko: 'Bagian tepi pondasi patah, luas tumpuan berkurang, dan tekanan '
      + 'ke tanah melonjak di sisa luasnya.',
    tindakan: 'Tebalkan pondasi, atau kurangi jarak menjorok dengan memperbesar '
      + 'kolom.',
  },
  'Geser satu arah Y': {
    judul: 'Pondasi tidak patah melintang (arah Y)',
    apa: 'Sama dengan pemeriksaan arah X, tetapi pada sisi pondasi yang tegak '
      + 'lurus terhadapnya. Pondasi persegi panjang bisa lulus di satu arah '
      + 'dan gagal di arah lainnya.',
    risiko: 'Bagian tepi pondasi pada sisi ini patah, luas tumpuan berkurang, '
      + 'dan tekanan ke tanah melonjak di sisa luasnya — persis seperti pada '
      + 'arah X, tetapi pada sisi yang berbeda.',
    tindakan: 'Tebalkan pondasi, atau kurangi jarak menjorok pada sisi ini '
      + 'dengan memperbesar kolom.',
  },
  'Daya dukung tiang': {
    judul: 'Kekuatan tiang menahan beban',
    apa: 'Tiang pancang memikul beban lewat dua cara: gesekan dengan tanah di '
      + 'sepanjang badannya, dan tumpuan di ujung bawahnya.',
    risiko: 'Tiang yang kelebihan beban akan terus turun (amblas) meski '
      + 'bangunannya tidak bertambah berat. Penurunan tak merata membuat '
      + 'bangunan retak dan miring.',
    tindakan: 'Perpanjang tiang sampai lapisan tanah yang lebih keras, '
      + 'perbesar diameter, atau tambah jumlah tiang.',
  },
  'Beban tiang maksimum': {
    judul: 'Tiang terberat masih sanggup',
    apa: 'Dalam kelompok tiang, beban tidak terbagi rata — tiang di sudut '
      + 'menanggung paling banyak saat ada dorongan ke samping.',
    risiko: 'Memeriksa rata-ratanya saja akan melewatkan tiang sudut yang '
      + 'sebenarnya sudah kelebihan beban. Satu tiang yang amblas membuat '
      + 'poer miring dan membebani tiang lain berlebihan — berantai.',
    tindakan: 'Tambah jumlah tiang, atau perbesar jarak antar tiang supaya '
      + 'momen terbagi lebih merata.',
  },
  'Tidak ada tiang tercabut': {
    judul: 'Tidak ada tiang yang tertarik ke atas',
    apa: 'Dorongan samping yang besar bisa membuat tiang di satu sisi justru '
      + 'tertarik ke atas, bukan tertekan.',
    risiko: 'Tiang pancang biasa dirancang menahan tekan, bukan tarik. '
      + 'Sambungannya ke poer bisa lepas.',
    tindakan: 'Tambah jumlah tiang, perlebar jarak antar tiang, atau rancang '
      + 'sambungan tiang–poer yang mampu menahan tarik.',
  },
  'Jarak antar tiang minimum': {
    judul: 'Tiang tidak terlalu berdekatan',
    apa: 'Tiang yang terlalu rapat membuat zona tanah yang dipadatkan '
      + 'masing-masing tiang saling tumpang tindih.',
    risiko: 'Daya dukung kelompok jadi lebih kecil daripada jumlah daya dukung '
      + 'tiang satu per satu — kekurangan yang tak terlihat dari hitungan '
      + 'per-tiang.',
    tindakan: 'Perlebar jarak antar tiang menjadi minimal 2,5 kali diameter.',
  },
  'Tebal pelat memadai': {
    judul: 'Pelat lantai cukup tebal',
    apa: 'Pelat yang terlalu tipis tidak bisa diperkuat hanya dengan menambah '
      + 'besi — bagian betonnya sendiri yang jadi batas.',
    risiko: 'Pelat melendut berlebihan (terasa "mengayun" saat dilewati), '
      + 'lantai retak, dan keramik di atasnya pecah.',
    tindakan: 'TEBALKAN pelatnya atau perkecil bentang dengan menambah balok. '
      + 'Menambah tulangan TIDAK menolong pada kasus ini.',
  },
  'As terpasang': {
    judul: 'Jumlah besi terpasang mencukupi',
    apa: 'Membandingkan luas besi yang benar-benar dipasang dengan yang '
      + 'dibutuhkan perhitungan.',
    risiko: 'Kurang besi berarti elemen gagal pada beban yang seharusnya masih '
      + 'sanggup ditahan.',
    tindakan: 'Rapatkan jarak tulangan atau perbesar diameternya.',
  },
  'As minimum': {
    judul: 'Besi minimum untuk menahan retak susut',
    apa: 'Beton menyusut saat mengering dan memuai saat panas. Besi minimum '
      + 'menahan retak akibat itu — terlepas dari bebannya.',
    risiko: 'Retak rambut menyebar di permukaan, air masuk, dan besi di '
      + 'dalamnya berkarat. Karat membuat besi mengembang dan beton pecah '
      + 'dari dalam — kerusakan yang butuh bertahun-tahun tapi tak bisa '
      + 'dihentikan setelah mulai.',
    tindakan: 'Tambah tulangan sampai memenuhi rasio minimum.',
  },
  'Rasio tulangan minimum': {
    judul: 'Besi tidak terlalu sedikit',
    apa: 'Balok dengan besi terlalu sedikit akan patah begitu betonnya retak, '
      + 'tanpa besi yang mengambil alih.',
    risiko: 'Runtuh GETAS — patah mendadak tanpa lendutan atau retak sebagai '
      + 'peringatan. Tidak ada waktu untuk menyelamatkan diri.',
    tindakan: 'Tambah tulangan tarik sampai memenuhi rasio minimum.',
  },
  'Rasio tulangan maksimum': {
    judul: 'Besi tidak terlalu banyak',
    apa: 'Terdengar aneh, tetapi besi yang TERLALU banyak juga berbahaya: '
      + 'betonnya yang akan hancur lebih dulu sebelum besinya sempat meleleh.',
    risiko: 'Sama dengan besi terlalu sedikit — runtuh mendadak tanpa '
      + 'peringatan. Struktur yang baik dirancang supaya BESINYA yang menyerah '
      + 'lebih dulu, karena besi meleleh perlahan dan memberi tanda.',
    tindakan: 'Perbesar penampang beton, atau kurangi jumlah tulangan.',
  },
  'Rasio tulangan': {
    judul: 'Jumlah besi dalam rentang yang benar',
    apa: 'Perbandingan luas besi terhadap luas beton harus berada di antara '
      + 'batas bawah dan batas atas.',
    risiko: 'Di luar rentang itu, elemen bisa runtuh mendadak tanpa '
      + 'peringatan — baik karena kekurangan maupun kelebihan besi.',
    tindakan: 'Sesuaikan jumlah tulangan, atau ubah ukuran penampang.',
  },
  'Jumlah tulangan minimum': {
    judul: 'Jumlah batang minimum terpenuhi',
    apa: 'Ada jumlah batang minimum yang harus dipasang supaya beton terkekang '
      + 'merata, terlepas dari hasil hitungan kekuatannya.',
    risiko: 'Beton yang tak terkekang merata pecah di sisi yang kosong.',
    tindakan: 'Tambah jumlah batang, meski hitungan kekuatannya sudah cukup.',
  },
  'Jarak sengkang maksimum': {
    judul: 'Sengkang tidak terlalu renggang',
    apa: 'Sengkang yang terlalu jarang membuat retak miring sempat terbentuk '
      + 'di antara dua sengkang tanpa ada yang menahannya.',
    risiko: 'Retak geser lolos di antara sengkang, dan balok gagal meski '
      + 'jumlah total besinya cukup.',
    tindakan: 'Rapatkan jarak sengkang, terutama di dekat tumpuan.',
  },
  'Jarak tulangan maksimum': {
    judul: 'Tulangan pelat tidak terlalu renggang',
    apa: 'Tulangan yang terlalu jarang membuat retak muncul di antara batang, '
      + 'di tempat yang tak ada besinya.',
    risiko: 'Retak melebar di permukaan lantai, air merembes, besi berkarat.',
    tindakan: 'Rapatkan jarak tulangan.',
  },
  'Eksentrisitas arah X': {
    judul: 'Beban tidak terlalu jauh dari tengah (arah X)',
    apa: 'Kalau kolom tidak berdiri di tengah pondasi, atau ada dorongan '
      + 'samping, beban jadi menepi.',
    risiko: 'Beban yang terlalu menepi membuat satu sisi pondasi terangkat, '
      + 'dan sisi lain menanggung tekanan jauh lebih besar dari hitungan.',
    tindakan: 'Perbesar pondasi ke arah itu, atau geser posisi kolom.',
  },
  'Eksentrisitas arah Y': {
    judul: 'Beban tidak terlalu jauh dari tengah (arah Y)',
    apa: 'Sama dengan pemeriksaan arah X, pada sisi pondasi yang tegak lurus '
      + 'terhadapnya. Beban bisa berada di tengah untuk satu arah tetapi '
      + 'menepi pada arah lainnya.',
    risiko: 'Satu sisi pondasi terangkat pada arah ini, sehingga sisi '
      + 'seberangnya menanggung tekanan jauh lebih besar dari yang dihitung. '
      + 'Bangunan miring ke arah tersebut.',
    tindakan: 'Perbesar pondasi ke arah ini, atau geser posisi kolom mendekati '
      + 'pusat pondasi.',
  },
  'bahan': {
    judul: 'Kekuatan bahan tiang itu sendiri',
    apa: 'Selain tanah, tiangnya sendiri punya batas: beton dan besinya hanya '
      + 'sanggup memikul beban tertentu.',
    risiko: 'Tiang retak atau pecah saat dipancang atau saat dibebani, '
      + 'meskipun tanahnya sanggup.',
    tindakan: 'Naikkan mutu beton tiang atau perbesar diameternya. '
      + 'Memperpanjang tiang TIDAK menolong untuk batas ini.',
  },
}

/**
 * Pemeriksaan yang jawabannya LULUS/GAGAL, bukan "seberapa terpakai".
 *
 * Keduanya memakai `rasio: 0` saat lulus — karena memang tak ada kapasitas
 * yang terpakai; yang ditanya cuma "terjadi atau tidak". Digambar sebagai
 * batang persen, hasilnya "0%" dengan alur kosong, dan pembaca non-teknis
 * menyangka kapasitasnya NOL — kebalikan dari artinya.
 *
 * Ditulis di sini, bukan di penggambar, supaya API dan UI membaca daftar yang
 * sama. Dijaga `struktur-awam.test.ts`: nama di sini wajib ada di kamus.
 */
export const PEMERIKSAAN_BINER: readonly string[] = [
  'Tanah tidak terangkat',
  'Tidak ada tiang tercabut',
]

export function apakahBiner(nama: string): boolean {
  return PEMERIKSAAN_BINER.includes(nama)
}

/**
 * Terjemahkan satu pemeriksaan. `null` bila belum ada terjemahannya.
 *
 * Sengaja memulangkan `null` alih-alih kalimat umum ("periksa ke insinyur"):
 * kalimat umum menyamarkan pemeriksaan yang belum diterjemahkan, sehingga tak
 * ada yang tahu ada yang kurang. `null` membuat penjaga bisa menghitungnya.
 */
export function jelaskan(namaPemeriksaan: string): PenjelasanAwam | null {
  const isi = KAMUS[namaPemeriksaan]
  return isi ? { nama: namaPemeriksaan, ...isi } : null
}

/** Semua nama pemeriksaan yang punya terjemahan. */
export function daftarTerjemahan(): string[] {
  return Object.keys(KAMUS)
}

/**
 * Ringkasan satu elemen dalam SATU kalimat untuk orang non-teknis.
 *
 * Yang dijawab: "elemen ini aman atau tidak, dan kalau tidak, kenapa?"
 *
 * Pemeriksaan yang GAGAL disebut namanya versi awam, bukan istilah teknis —
 * "kekuatan menahan lenturan" bisa dibayangkan, "φMn < Mu" tidak.
 */
export function ringkasanAwam(
  periksa: ReadonlyArray<{ nama: string; aman: boolean; rasio: number }>,
): { tingkat: TingkatBahaya; kalimat: string } {
  if (periksa.length === 0) {
    return { tingkat: 'aman', kalimat: 'Belum ada pemeriksaan yang dijalankan.' }
  }

  const gagal = periksa.filter((p) => !p.aman)
  if (gagal.length > 0) {
    const nama = gagal.map((p) => jelaskan(p.nama)?.judul ?? p.nama)
    return {
      tingkat: 'bahaya',
      kalimat: gagal.length === 1
        ? `TIDAK AMAN — ${nama[0].toLowerCase()} tidak terpenuhi. Elemen ini belum boleh dikerjakan.`
        : `TIDAK AMAN — ${gagal.length} pemeriksaan tidak terpenuhi: `
          + `${nama.join(', ').toLowerCase()}. Elemen ini belum boleh dikerjakan.`,
    }
  }

  /*
    "Aman tapi mepet" DISEBUT, bukan dibulatkan jadi "aman".

    Rasio 0,98 dan 0,42 sama-sama lulus, tetapi cuma satu yang masih aman
    kalau bebannya bertambah sedikit — dan beban bertambah sedikit adalah hal
    yang PASTI terjadi (finishing lebih tebal, penghuni lebih banyak, renovasi).

    Menyamakan keduanya jadi "aman" menghilangkan justru informasi yang paling
    berguna bagi yang memutuskan.
  */
  const paling = periksa.reduce((a, b) => (b.rasio > a.rasio ? b : a))
  if (paling.rasio >= AMBANG_MEPET) {
    const judul = jelaskan(paling.nama)?.judul ?? paling.nama
    return {
      tingkat: 'mepet',
      kalimat: `Aman, tetapi MEPET — ${judul.toLowerCase()} terpakai `
        + `${Math.round(paling.rasio * 100)}% dari kapasitasnya. Sisa cadangannya `
        + `tipis kalau beban bertambah.`,
    }
  }

  return {
    tingkat: 'aman',
    kalimat: `Aman — pemeriksaan terberat terpakai `
      + `${Math.round(paling.rasio * 100)}% dari kapasitasnya, `
      + `masih tersisa ${Math.round((1 - paling.rasio) * 100)}% cadangan.`,
  }
}
