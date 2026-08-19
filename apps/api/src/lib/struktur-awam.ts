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
  'Lentur baja': {
    judul: 'Kekuatan balok baja menahan lenturan',
    apa: 'Balok baja yang dibebani melengkung ke bawah. Ini memeriksa apakah '
      + 'ukuran profilnya cukup — dan sekaligus apakah sisi atasnya cukup '
      + 'sering dipegang supaya tidak berputar ke samping saat melengkung.',
    risiko: 'Balok baja yang kurang kuat tidak langsung patah seperti beton — '
      + 'ia BERPUTAR ke samping sambil melengkung (disebut tekuk lateral), dan '
      + 'begitu mulai berputar, kemampuannya menahan beban anjlok cepat. '
      + 'Runtuhnya terlihat seperti balok yang tiba-tiba "terpelintir".',
    tindakan: 'Pakai profil yang lebih tinggi, atau tambahkan pengaku samping '
      + '(bracing/gording) supaya jarak antar pemegang sisi atasnya lebih '
      + 'rapat. Menambah pengaku biasanya jauh lebih murah daripada mengganti '
      + 'profil.',
  },
  'Geser baja': {
    judul: 'Kekuatan pelat tengah menahan gaya sobek',
    apa: 'Bagian tegak di tengah profil baja (badannya) yang menahan gaya '
      + 'sobek dekat tumpuan. Sayap atas dan bawah hampir tidak berperan '
      + 'untuk ini.',
    risiko: 'Badan profil yang terlalu tipis akan menekuk seperti kaleng '
      + 'penyok tepat di dekat tumpuan — mendadak, dan biasanya di tempat '
      + 'yang tak terlihat karena tertutup dinding atau plafon.',
    tindakan: 'Pakai profil dengan badan lebih tebal, atau pasang pelat '
      + 'pengaku (stiffener) di daerah dekat tumpuan.',
  },
  'Lendutan': {
    judul: 'Balok tidak melendut berlebihan',
    apa: 'Seberapa banyak balok turun di tengah saat dibebani sehari-hari. '
      + 'Berbeda dari kekuatan: balok bisa sangat kuat tetapi tetap terasa '
      + 'melendut saat dilewati orang.',
    risiko: 'Lantai terasa mengayun saat dilewati, keramik dan plafon retak, '
      + 'pintu dan jendela macet. Pada baja inilah yang PALING SERING jadi '
      + 'penentu ukuran profil — bukan kekuatannya — dan keluhan penghuni '
      + 'nomor satu pada bangunan berlantai baja.',
    tindakan: 'Pakai profil yang lebih TINGGI (paling efektif — lendutan '
      + 'sangat peka terhadap tinggi profil), perpendek bentang dengan '
      + 'menambah kolom, atau tambahkan balok anak di tengah bentang.',
  },
  'Tekan kolom baja': {
    judul: 'Kolom baja tidak menekuk',
    apa: 'Kolom baja yang dibebani dari atas bisa gagal dengan dua cara: '
      + 'bahannya remuk, atau batangnya melengkung ke samping seperti '
      + 'penggaris yang ditekan dari kedua ujung. Yang kedua terjadi jauh '
      + 'lebih dulu pada kolom yang tinggi dan ramping.',
    risiko: 'Kolom yang menekuk kehilangan kemampuannya menahan beban dengan '
      + 'sangat cepat begitu mulai melengkung — tidak ada tahap "melengkung '
      + 'sedikit lalu bertahan". Runtuhnya mendadak dan menjatuhkan seluruh '
      + 'lantai di atasnya.',
    tindakan: 'Pakai profil yang lebih besar, atau pasang pengaku samping '
      + '(bracing) di tengah tinggi kolom. Memberi pengaku di tengah membuat '
      + 'kolom berperilaku seperti dua kolom pendek — jauh lebih kuat, dan '
      + 'biasanya jauh lebih murah daripada memperbesar profil.',
  },
  'Kelangsingan kolom': {
    judul: 'Kolom tidak terlalu ramping untuk dipasang lurus',
    apa: 'Batas seberapa ramping sebuah kolom boleh dibuat. Bukan soal '
      + 'kekuatan di atas kertas, melainkan soal apakah ia bisa dipasang '
      + 'benar-benar lurus di lapangan.',
    risiko: 'Batang yang sangat ramping sudah melengkung sedikit sejak dari '
      + 'pabrik dan bertambah bengkok saat diangkut serta dipasang. '
      + 'Kelengkungan awal itu saja membuatnya jauh lebih lemah daripada '
      + 'hitungan mana pun — hitungan menganggap batangnya lurus sempurna.',
    tindakan: 'Pakai profil yang lebih gemuk, atau pasang pengaku samping '
      + 'supaya panjang bebasnya berkurang.',
  },
  'Geser baut': {
    judul: 'Baut tidak putus tergunting',
    apa: 'Baut yang menyambung dua pelat menahan gaya yang menggeser kedua '
      + 'pelat itu saling melewati — seperti gunting yang menjepit batang '
      + 'bautnya.',
    risiko: 'Baut yang putus membuat sambungan lepas seketika. Pada struktur '
      + 'baja, sambungan adalah titik gagal PALING SERING — bukan batangnya, '
      + 'karena batang dibuat pabrik sementara sambungan dikerjakan di '
      + 'lapangan dan jarang diperiksa ulang.',
    tindakan: 'Perbanyak jumlah baut, pakai diameter lebih besar, atau pakai '
      + 'mutu baut yang lebih tinggi. Menambah jumlah biasanya paling murah.',
  },
  'Tumpu pelat': {
    judul: 'Pelat tidak sobek di lubang bautnya',
    apa: 'Baut menekan dinding lubangnya. Kalau pelatnya tipis, lubang itu '
      + 'yang memanjang jadi lonjong — bukan bautnya yang putus.',
    risiko: 'Lubang yang memanjang membuat sambungan mengendur dan struktur '
      + 'bergoyang, lalu bebannya berpindah tak merata ke baut lain sampai '
      + 'ada yang putus. Memakai baut yang lebih kuat TIDAK menolong sama '
      + 'sekali untuk kegagalan ini.',
    tindakan: 'TEBALKAN pelatnya, atau perbanyak baut supaya bebannya '
      + 'terbagi. Mengganti baut dengan yang lebih kuat percuma.',
  },
  'Las sudut': {
    judul: 'Las cukup kuat menahan gayanya',
    apa: 'Las sudut mengisi sudut pertemuan dua pelat. Yang menahan bukan '
      + 'seluruh lebar lasnya, melainkan bagian tersempit di tengah '
      + 'segitiganya — sekitar 70% dari ukuran yang terlihat.',
    risiko: 'Las yang kurang panjang atau kurang tebal putus di sepanjang '
      + 'garisnya, dan sambungan lepas. Pada struktur baja, sambungan adalah '
      + 'titik gagal paling sering.',
    tindakan: 'Perpanjang lasnya (paling efektif dan paling murah), atau '
      + 'perbesar ukuran kakinya.',
  },
  'Logam induk di sisi las': {
    judul: 'Pelat tidak sobek di sebelah lasnya',
    apa: 'Las yang lebih kuat daripada pelat yang disambungnya tidak membuat '
      + 'sambungan lebih kuat — yang menyerah pelatnya, tepat di sisi las.',
    risiko: 'Kegagalan ini sering mengejutkan karena lasnya terlihat utuh '
      + 'sempurna: yang sobek justru pelatnya, memanjang mengikuti garis las. '
      + 'Memakai elektroda yang lebih kuat sama sekali tidak menolong.',
    tindakan: 'Perpanjang lasnya supaya gayanya terbagi di garis yang lebih '
      + 'panjang, atau tebalkan pelatnya.',
  },
  'Ukuran las minimum': {
    judul: 'Las tidak terlalu kecil untuk pelat setebal itu',
    apa: 'Ada ukuran las paling kecil yang boleh dipakai untuk tiap tebal '
      + 'pelat. Ini bukan soal kekuatan, melainkan soal panas: las kecil pada '
      + 'pelat tebal kehilangan panasnya terlalu cepat karena terserap pelat.',
    risiko: 'Las yang mendingin terlalu cepat menjadi getas — keras tetapi '
      + 'rapuh — lalu retak, kadang berminggu-minggu setelah dikerjakan dan '
      + 'tanpa beban apa pun. Hitungan kekuatan yang sudah cukup tidak '
      + 'membatalkan batas ini.',
    tindakan: 'Perbesar ukuran lasnya sampai memenuhi minimum, atau panaskan '
      + 'pelat lebih dulu (preheat) sesuai prosedur pengelasan.',
  },
  'Tumpu beton di bawah pelat': {
    judul: 'Beton di bawah kolom baja tidak melesak',
    apa: 'Kolom baja tak bisa berdiri langsung di atas beton — bajanya jauh '
      + 'lebih keras. Pelat landas di bawah kolom menyebarkan bebannya ke '
      + 'luasan yang cukup, seperti alas kaki di tanah lembek.',
    risiko: 'Beton yang tertekan melebihi kemampuannya akan hancur remuk di '
      + 'bawah pelat, dan kolom TURUN. Penurunan satu kolom saja membuat balok '
      + 'di atasnya melengkung dan dinding retak — dan memperbaikinya berarti '
      + 'mengangkat kembali bangunan yang sudah berdiri.',
    tindakan: 'Perbesar ukuran pelat landas, atau naikkan mutu beton '
      + 'pondasinya. Memperbesar pelat biasanya jauh lebih murah.',
  },
  'Tebal pelat landas': {
    judul: 'Pelat landas tidak melengkung',
    apa: 'Bagian pelat yang menjorok keluar dari penampang kolom ikut memikul '
      + 'beban, seperti papan yang ditopang di tengah. Kalau terlalu tipis, ia '
      + 'melengkung ke atas di tepinya.',
    risiko: 'Pelat yang melengkung tidak lagi menyebarkan beban ke seluruh '
      + 'luasnya — bebannya menumpuk di tengah, dan pemeriksaan beton di '
      + 'bawahnya jadi tak berlaku lagi. Yang tampak aman di atas kertas '
      + 'menjadi tidak aman di lapangan.',
    tindakan: 'TEBALKAN pelatnya, atau pasang pengaku (rusuk baja) di bagian '
      + 'yang menjorok. Perhatikan: MEMPERBESAR pelat justru memperburuk hal '
      + 'ini, karena bagian yang menjorok jadi lebih panjang.',
  },
  'Tarik baja angkur': {
    judul: 'Angkur tidak putus tertarik',
    apa: 'Angkur adalah besi yang ditanam di pondasi untuk mengikat kolom '
      + 'baja. Saat angin kencang mengangkat atap, angkur inilah yang menahan '
      + 'bangunan tetap di tempatnya.',
    risiko: 'Angkur yang putus membuat kolom lepas dari pondasi. Pada gudang '
      + 'dan kanopi, ini kegagalan yang terjadi saat angin kencang — bukan '
      + 'saat bangunan dibebani berat.',
    tindakan: 'Perbanyak jumlah angkur, atau pakai diameter yang lebih besar.',
  },
  'Jebol beton (cabut angkur)': {
    judul: 'Beton tidak jebol saat angkur tertarik',
    apa: 'Angkur yang ditarik kuat bisa mencabut sebongkah beton berbentuk '
      + 'kerucut di sekelilingnya — bukan angkurnya yang putus, melainkan '
      + 'betonnya yang terangkat bersama angkur itu.',
    risiko: 'Kegagalan ini terjadi pada beban yang jauh LEBIH KECIL daripada '
      + 'kekuatan angkurnya sendiri, terutama bila angkur ditanam dangkal. '
      + 'Memakai angkur bermutu lebih tinggi TIDAK menolong sama sekali.',
    tindakan: 'TANAM LEBIH DALAM — itu satu-satunya yang benar-benar '
      + 'menolong. Dan keputusan itu harus diambil sebelum beton dicor, bukan '
      + 'sesudah. Menjauhkan angkur dari tepi pondasi juga membantu.',
  },
  'Geser baja angkur': {
    judul: 'Angkur tidak putus tergunting',
    apa: 'Selain menahan tarikan ke atas, angkur juga menahan kolom agar tidak '
      + 'bergeser menyamping saat ada dorongan angin atau gempa.',
    risiko: 'Angkur yang tergunting membuat kolom bergeser dari posisinya, dan '
      + 'seluruh bangunan miring mengikuti.',
    tindakan: 'Perbanyak angkur, perbesar diameternya, atau tambahkan '
      + 'pengunci geser (shear key) di bawah pelat landas.',
  },
  'Seluruh batang rangka aman': {
    judul: 'Semua batang kuda-kuda memenuhi syarat',
    apa: 'Rangka kuda-kuda tersusun dari banyak batang yang saling menopang. '
      + 'Pemeriksaan ini merangkum apakah SEMUA batangnya memenuhi syarat.',
    risiko: 'Rangka batang tidak punya jalur beban cadangan: setiap batang '
      + 'memikul bagiannya sendiri, dan yang putus membuat seluruh rangka '
      + 'runtuh seketika. Ini berbeda dari struktur beton, yang masih bisa '
      + 'menyalurkan beban lewat jalur lain saat satu bagian menyerah.',
    tindakan: 'Perbaiki batang yang disebutkan gagal — memperkuat batang lain '
      + 'tidak menolong, karena masing-masing memikul bagiannya sendiri.',
  },
  'Lentur gording dua arah': {
    judul: 'Gording atap kuat menahan beban miring',
    apa: 'Gording adalah balok yang membentang di atas kuda-kuda, tempat '
      + 'penutup atap dipasang. Karena atapnya miring, beban dari atas tak '
      + 'jatuh lurus ke sumbu kuat gording — sebagian menekannya menyamping.',
    risiko: 'Bagian yang menekan menyamping ditahan oleh sisi LEMAH profil, '
      + 'yang hanya sekitar seperlima kekuatan sisi kuatnya. Gording yang '
      + 'dihitung seperti balok biasa akan melendut ke samping dan MEMUTIR, '
      + 'membuat atap bergelombang dan sambungannya kendur.',
    tindakan: 'Pasang sagrod — batang besi yang menahan gording agar tak '
      + 'melorot ke bawah sepanjang bidang atap. Sagrod di tengah bentang '
      + 'menaikkan kapasitas EMPAT KALI LIPAT, jauh lebih murah daripada '
      + 'memperbesar profilnya.',
  },
  'Lendutan gording': {
    judul: 'Gording tidak melendut berlebihan',
    apa: 'Seberapa jauh gording turun di tengah saat dibebani penutup atap, '
      + 'air hujan, dan orang yang memasangnya.',
    risiko: 'Gording yang melendut membuat atap bergelombang — air hujan '
      + 'menggenang di cekungannya alih-alih mengalir, dan genangan itu '
      + 'menambah beban yang membuatnya melendut lebih jauh lagi. Pada atap '
      + 'landai, ini bisa berakhir dengan atap yang jebol.',
    tindakan: 'Pakai profil yang lebih tinggi, atau perpendek bentang dengan '
      + 'menambah kuda-kuda.',
  },
  'Interaksi tekan + momen': {
    judul: 'Kolom kuat saat ditekan DAN didorong bersamaan',
    apa: 'Kolom tepi, kolom rangka, dan kolom yang menahan angin menerima dua '
      + 'hal sekaligus: beban dari atas yang menekannya, dan dorongan '
      + 'menyamping yang membengkokkannya.',
    risiko: 'Beban tekan MEMPERBESAR bengkokan: kolom yang sudah melengkung '
      + 'sedikit akan melengkung lebih jauh karena tekannya bekerja pada '
      + 'lengkungan itu. Kolom bisa lulus pemeriksaan tekan sendiri DAN '
      + 'pemeriksaan bengkokan sendiri, tetapi gagal saat keduanya bekerja '
      + 'bersamaan — dan itu kegagalan yang tak terlihat dari kedua angka itu.',
    tindakan: 'Perbesar profil, atau kurangi dorongan menyampingnya dengan '
      + 'memasang pengaku (bracing) atau dinding geser.',
  },
  'Tarik bracing': {
    judul: 'Batang pengaku tidak putus tertarik',
    apa: 'Bracing adalah batang miring yang menahan rangka agar tidak roboh '
      + 'menyamping — seperti tali penahan tenda. Saat angin mendorong, '
      + 'bracing inilah yang menahannya.',
    risiko: 'Bracing yang putus membuat rangka kehilangan penahan sampingnya, '
      + 'dan seluruh bangunan bisa roboh ke samping seperti kartu domino. '
      + 'Kegagalan ini terjadi saat angin kencang atau gempa, bukan saat '
      + 'bangunan dibebani berat.',
    tindakan: 'Perbesar profil bracing, atau tambah jumlahnya.',
  },
  'Tekan bracing': {
    judul: 'Batang pengaku tidak menekuk saat tertekan',
    apa: 'Bracing tunggal harus sanggup menahan dorongan dari DUA arah — saat '
      + 'angin dari kiri ia tertarik, saat dari kanan ia tertekan.',
    risiko: 'Bracing yang menekuk tak lagi menahan apa pun, dan rangkanya '
      + 'bebas bergoyang ke arah itu. Pada bracing silang hal ini disengaja '
      + '(pasangannya yang bekerja), tetapi pada bracing TUNGGAL ia berarti '
      + 'tak ada penahan sama sekali.',
    tindakan: 'Perbesar profil, perpendek batangnya dengan menambah titik '
      + 'sambung, atau pakai sistem silang (dua diagonal) supaya cukup '
      + 'mengandalkan tarikan saja.',
  },
  'Kelangsingan bracing': {
    judul: 'Batang pengaku cukup kaku, bukan cuma kuat',
    apa: 'Bracing punya syarat yang tak dimiliki batang lain: selain kuat, ia '
      + 'harus KAKU. Batang panjang dan tipis bisa sangat kuat menahan '
      + 'tarikan, tetapi ia meregang dulu sebelum benar-benar menahan.',
    risiko: 'Rangka sempat bergoyang lebih dulu sebelum bracingnya bekerja. '
      + 'Goyangan itulah yang meretakkan dinding pengisi, memecahkan kaca, '
      + 'dan membuat penghuni tak nyaman — meski strukturnya sendiri tak '
      + 'runtuh.',
    tindakan: 'Pakai profil yang lebih gemuk (bukan sekadar lebih kuat), atau '
      + 'perpendek batang bracingnya.',
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
  // ── TANGGA ────────────────────────────────────────────────────────────────
  //
  // Tiga pemeriksaan di bawah tak ada di elemen struktur mana pun, dan justru
  // ketiganya yang paling perlu diterjemahkan: mereka bukan soal kekuatan
  // melainkan soal orang yang menaikinya. "Blondel 617 mm" tak berarti apa-apa
  // bagi pemilik bangunan; "tangganya nyaman dinaiki" berarti.
  'Langkah nyaman (Blondel)': {
    judul: 'Tangganya nyaman dinaiki',
    apa: 'Tinggi dan lebar anak tangga harus cocok dengan panjang langkah kaki '
      + 'manusia. Ukurannya: dua kali tinggi anak tangga ditambah lebar '
      + 'injakannya, harus jatuh di 60–65 cm.',
    risiko: 'Kalau di luar itu, orang tersandung — terlalu curam membuat kaki '
      + 'terantuk saat naik, terlalu landai membuat langkah jadi setengah dan '
      + 'orang kehilangan irama saat turun. Jatuh di tangga adalah kecelakaan '
      + 'rumah tangga yang paling sering, dan yang paling sering melukai orang '
      + 'tua dan anak-anak.',
    tindakan: 'Ubah tinggi anak tangga atau lebar injakannya. Kalau ruangnya '
      + 'terbatas, tambah bordes di tengah supaya tangga tak perlu securam itu.',
  },
  'Tinggi anak tangga': {
    judul: 'Tinggi tiap anak tangga',
    apa: 'Seberapa tinggi kaki harus diangkat untuk naik satu anak tangga. '
      + 'Yang wajar 15–20 cm.',
    risiko: 'Anak tangga yang terlalu tinggi melelahkan dan berbahaya bagi '
      + 'orang tua; yang terlalu rendah membuat orang melangkahi dua sekaligus '
      + 'lalu salah perhitungan.',
    tindakan: 'Tambah jumlah anak tangganya — itu menurunkan tinggi tiap anak '
      + 'tangga, dengan konsekuensi tangga jadi lebih panjang.',
  },
  'Lebar injakan': {
    judul: 'Lebar tempat kaki berpijak',
    apa: 'Seberapa dalam tempat menapak. Telapak kaki dewasa butuh minimal '
      + '25 cm supaya tumit tidak menggantung di udara.',
    risiko: 'Injakan yang terlalu sempit membuat orang menuruni tangga dengan '
      + 'kaki menyamping atau hanya berpijak pada ujung jari — dan itu yang '
      + 'membuat orang terpeleset saat turun, bukan saat naik.',
    tindakan: 'Perlebar injakannya. Kalau panjang tangga terbatas, kurangi '
      + 'jumlah anak tangga dengan meninggikan tiap anaknya — selama masih di '
      + 'bawah 20 cm.',
  },
  'Tebal minimum (lendutan)': {
    judul: 'Ketebalan supaya tidak melendut',
    apa: 'Pelat yang terlalu tipis untuk bentangnya akan melengkung ke bawah '
      + 'meski kekuatannya cukup. Aturan praktisnya: tebal minimal 1/20 '
      + 'bentang.',
    risiko: 'Lendutan yang berlebihan tidak meruntuhkan apa pun, tetapi '
      + 'membuat lantai terasa "hidup" saat diinjak, meretakkan keramik di '
      + 'atasnya, dan merusak plafon di bawahnya. Keluhan yang muncul '
      + 'bertahun-tahun sesudah bangunan dipakai.',
    tindakan: 'Tebalkan pelatnya, atau perpendek bentangnya dengan menambah '
      + 'tumpuan di tengah (bordes untuk tangga).',
  },
  'Tulangan minimum': {
    judul: 'Besi minimum untuk menahan retak',
    apa: 'Beton menyusut saat mengering dan memuai saat panas. Besi minimum '
      + 'ini bukan untuk menahan beban, melainkan menahan retak akibat '
      + 'gerakan itu.',
    risiko: 'Tanpa besi minimum, pelat retak rambut di banyak tempat meski '
      + 'tak pernah dibebani berat. Retak itu meloloskan air, dan air '
      + 'mengaratkan besi di dalamnya — kerusakan yang berjalan pelan dan tak '
      + 'bisa dihentikan sesudah mulai.',
    tindakan: 'Rapatkan jarak tulangan atau perbesar diameternya sampai luas '
      + 'besinya memenuhi 0,18% luas penampang beton.',
  },
  'Kapasitas geser beton': {
    judul: 'Kekuatan menahan sobek di dekat tumpuan',
    apa: 'Di dekat tumpuan, pelat cenderung tersobek miring — bukan melengkung '
      + 'seperti di tengah bentang. Ini memeriksa apakah betonnya sendiri '
      + 'cukup kuat menahan sobekan itu tanpa besi tambahan.',
    risiko: 'Kegagalan geser terjadi TIBA-TIBA, tanpa lendutan atau retak yang '
      + 'memberi peringatan lebih dulu. Berbeda dengan kegagalan lentur yang '
      + 'melengkung dulu, yang ini langsung patah.',
    tindakan: 'Tebalkan pelatnya, naikkan mutu betonnya, atau tambahkan '
      + 'sengkang di daerah dekat tumpuan.',
  },
  // ── BALOK T & BEBAN LATERAL ───────────────────────────────────────────────
  'Lentur negatif (tumpuan)': {
    judul: 'Kekuatan di atas tumpuan',
    apa: 'Balok yang menerus di atas kolom melengkung ke ATAS di titik itu — '
      + 'kebalikan dari lengkungan di tengah bentang. Yang menahannya tulangan '
      + 'di sisi ATAS balok, bukan yang di bawah.',
    risiko: 'Kalau kurang, retak muncul di permukaan atas balok tepat di '
      + 'sebelah kolom — tertutup lantai dan tak terlihat sampai melebar. Ini '
      + 'titik paling sulit diperbaiki: membongkarnya berarti membongkar lantai '
      + 'di atasnya.',
    tindakan: 'Tambah tulangan di sisi ATAS balok pada daerah tumpuan, atau '
      + 'tinggikan baloknya.',
  },
  'Tinggi untuk prosedur statik': {
    judul: 'Bangunan cukup rendah untuk cara hitung ini',
    apa: 'Gaya gempa di sini dihitung dengan cara sederhana yang hanya berlaku '
      + 'untuk bangunan tidak terlalu tinggi. Bangunan tinggi bergoyang dengan '
      + 'pola yang lebih rumit.',
    risiko: 'Kalau bangunannya melewati batas, angka gempa di layar ini TIDAK '
      + 'SAH sebagai dasar desain — bukan berarti bangunannya bahaya, '
      + 'melainkan cara hitungnya yang tak berlaku dan hasilnya bisa meleset '
      + 'ke dua arah.',
    tindakan: 'Bangunan setinggi ini butuh analisa dinamik (respons spektrum) '
      + 'yang dikerjakan dengan perangkat lunak struktur khusus. Angka di sini '
      + 'boleh dipakai sebagai pembanding kasar saja.',
  },
  'Simpangan tingkat N': {
    judul: 'Seberapa jauh lantai bergoyang saat gempa',
    apa: 'Saat gempa, tiap lantai bergerak menyamping relatif terhadap lantai '
      + 'di bawahnya. Yang diperiksa: pergeseran itu tidak melebihi batas — '
      + 'sekitar 2 cm untuk tiap 1 meter tinggi lantai.',
    risiko: 'Kegagalannya TIDAK meruntuhkan bangunan. Yang rusak isinya: '
      + 'dinding retak menyilang, kusen terjepit sampai pintu tak bisa dibuka, '
      + 'kaca pecah, pipa dan kabel putus. Dan ini terjadi pada gempa SEDANG — '
      + 'yang pasti datang beberapa kali seumur bangunan, bukan gempa besar '
      + 'yang mungkin tak pernah terjadi.',
    tindakan: 'Perkaku bangunannya: perbesar kolom, tambah dinding geser, atau '
      + 'tambah bresing. Menambah tulangan saja tidak menolong — yang kurang '
      + 'kekakuan, bukan kekuatan.',
  },
  // ── PONDASI DANGKAL & DINDING ─────────────────────────────────────────────
  'Daya dukung tanah': {
    judul: 'Tanahnya sanggup memikul',
    apa: 'Setiap tanah punya batas berapa berat yang bisa dipikul tiap meter '
      + 'perseginya. Ini membandingkan tekanan yang benar-benar bekerja dengan '
      + 'batas itu.',
    risiko: 'Kalau melebihi, tanah di bawah pondasi tertekan keluar dan '
      + 'bangunan AMBLAS — turun perlahan sampai lantai miring, dinding retak '
      + 'menyilang, dan pintu tak bisa ditutup. Penurunan yang sudah terjadi '
      + 'tidak bisa dibalikkan; bangunannya harus diangkat atau pondasinya '
      + 'diperkuat dari bawah, dan keduanya jauh lebih mahal daripada membuat '
      + 'pondasi yang benar sejak awal.',
    tindakan: 'Perlebar pondasinya supaya bebannya tersebar, perdalam sampai '
      + 'lapisan tanah yang lebih keras, atau ganti ke pondasi tiang.',
  },
  'Sudut sebar batu kali': {
    judul: 'Bentuk pondasi batu kali masuk akal',
    apa: 'Pasangan batu kali hanya kuat menahan TEKAN, tidak menahan tarik '
      + 'seperti beton bertulang. Karena itu bentuknya harus cukup gemuk: '
      + 'tonjolan di kiri-kanan tak boleh terlalu lebar dibanding tingginya.',
    risiko: 'Pondasi yang terlalu ceper dan lebar akan PECAH di tepinya — '
      + 'bagian yang menonjol patah karena tak ada besi yang menahannya, dan '
      + 'beban dinding lalu terpusat di bagian tengah yang jadi terlalu sempit.',
    tindakan: 'Tinggikan pondasinya, sempitkan dasarnya, atau ganti ke beton '
      + 'bertulang yang memang kuat menahan tarik.',
  },
  'Stabilitas guling': {
    judul: 'Dinding tidak terguling ke depan',
    apa: 'Tanah di belakang dinding mendorongnya terus-menerus. Ini memeriksa '
      + 'apakah berat dinding dan tanah di atas telapaknya cukup untuk menahan '
      + 'dorongan itu — dengan cadangan dua kali lipat.',
    risiko: 'Dinding berputar ke depan mengelilingi ujung kakinya dan roboh '
      + 'sekaligus, membawa tanah di belakangnya. Ini bukan retak yang melebar '
      + 'pelan — ia terjadi dalam hitungan detik, dan yang tertimbun adalah '
      + 'apa pun yang ada di depan dinding.',
    tindakan: 'Perpanjang telapaknya ke belakang (tumit) supaya lebih banyak '
      + 'tanah menahan, atau tebalkan dindingnya.',
  },
  'Stabilitas geser': {
    judul: 'Dinding tidak melorot mendatar',
    apa: 'Selain terguling, dinding bisa MELUNCUR mendatar di atas tanah — '
      + 'terdorong utuh tanpa berputar. Yang menahannya gesekan antara dasar '
      + 'telapak dan tanah, bukan berat dindingnya.',
    risiko: 'Inilah yang paling sering dilewatkan. Dinding boleh sangat berat '
      + 'sehingga mustahil terguling, dan tetap melorot — karena pada tanah '
      + 'lempung basah gesekannya kecil. Yang terlihat: dinding bergeser '
      + 'beberapa sentimeter tiap musim hujan sampai akhirnya roboh.',
    tindakan: 'Tambahkan gigi (kunci geser) di bawah telapak, perpanjang '
      + 'telapaknya, atau perbaiki drainase supaya tanahnya tidak jenuh air.',
  },
  'Resultan di inti telapak': {
    judul: 'Telapak menapak penuh, tidak terangkat',
    apa: 'Beban yang tidak terpusat membuat tekanan tak merata di bawah '
      + 'telapak. Kalau terlalu tak merata, sebagian telapak justru TERANGKAT '
      + 'dari tanah dan tidak memikul apa-apa.',
    risiko: 'Seluruh beban lalu ditumpu bagian yang lebih kecil, dan tekanan '
      + 'di sana jauh lebih besar daripada yang dihitung — angka daya dukung '
      + 'di layar ini jadi tak berlaku. Bagian yang tertekan berlebih amblas '
      + 'lebih dulu, dan dindingnya makin miring, yang membuatnya makin '
      + 'terangkat: kerusakan yang mempercepat dirinya sendiri.',
    tindakan: 'Perpanjang telapak ke arah tumit supaya beban lebih terpusat, '
      + 'atau kurangi ketinggian tanah yang ditahan.',
  },
  'Kapasitas geser': {
    judul: 'Kekuatan menahan sobek mendatar',
    apa: 'Saat gempa, dinding didorong ke samping dan cenderung tersobek '
      + 'menyilang. Ini memeriksa apakah beton dan tulangan mendatarnya cukup '
      + 'menahan sobekan itu.',
    risiko: 'Kegagalan geser terjadi TIBA-TIBA — retak menyilang muncul dan '
      + 'melebar dalam hitungan detik, tanpa lendutan yang memberi peringatan '
      + 'lebih dulu.',
    tindakan: 'Tambah tulangan mendatar, tebalkan dindingnya, atau naikkan '
      + 'mutu betonnya.',
  },
  'Lentur leleh sebelum geser': {
    judul: 'Dinding memberi peringatan sebelum runtuh',
    apa: 'Dinding geser boleh rusak saat gempa besar — yang tidak boleh adalah '
      + 'runtuh mendadak. Ini memeriksa urutannya: tulangan harus MELELEH '
      + 'lebih dulu (dinding melengkung, retak melebar pelan) sebelum betonnya '
      + 'tersobek.',
    risiko: 'Kalau urutannya terbalik, dinding runtuh TIBA-TIBA tanpa retak '
      + 'yang memberi peringatan dan tanpa waktu bagi orang untuk keluar. '
      + 'Inilah yang dihindari seluruh filosofi bangunan tahan gempa: bangunan '
      + 'boleh rusak berat asal orangnya sempat keluar.',
    tindakan: 'Perbesar tulangan MENDATAR atau tebalkan dindingnya. Menambah '
      + 'tulangan di ujung dinding justru MEMPERBURUK — ia menaikkan kekuatan '
      + 'lentur sehingga gesernya makin tertinggal.',
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
  /*
    Ditemukan saat menguji 10 jenis baja lewat API hidup: rangka yang seluruh
    batangnya aman melaporkan "terpakai 0% dari kapasitasnya" — kalimat yang
    tak masuk akal, dan meteran menggambarnya sebagai batang kosong.

    Sama seperti dua di atasnya: yang ditanya "ada yang gagal atau tidak",
    bukan "seberapa terpakai".
  */
  'Seluruh batang rangka aman',
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
  if (isi) return { nama: namaPemeriksaan, ...isi }

  /*
    ══════════════════════════════════════════════════════════════════════════
    NAMA BERNOMOR dicocokkan ke pola — "Simpangan tingkat 3" → "Simpangan
    tingkat N".

    Sebagian pemeriksaan lahir per-tingkat, dan jumlah tingkatnya baru
    diketahui saat dihitung. Menyeragamkan namanya jadi "Simpangan" akan
    menghilangkan informasi TINGKAT MANA yang gagal — dan pada bangunan
    bertingkat itu justru yang pertama ditanyakan orang.

    Membuat entri kamus per tingkat juga bukan jalan keluar: jumlahnya tak
    terbatas, dan tingkat ke-9 akan lolos tanpa terjemahan tanpa ada yang tahu.
  */
  const bernomor = namaPemeriksaan.replace(/\s+\d+$/, ' N')
  if (bernomor !== namaPemeriksaan) {
    const pola = KAMUS[bernomor]
    if (pola) return { nama: namaPemeriksaan, ...pola }
  }
  return null
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
  /*
    Pemeriksaan BINER dikeluarkan dari perhitungan "seberapa terpakai".

    Rasionya 0 saat lulus — bukan karena kapasitasnya kosong, melainkan karena
    yang ditanya "terjadi atau tidak". Ikut dihitung, ia menghasilkan kalimat
    "terpakai 0% dari kapasitasnya, masih tersisa 100% cadangan" untuk elemen
    yang sebenarnya tak punya konsep cadangan sama sekali.

    Ditemukan saat menguji rangka batang lewat API hidup — verdict-nya benar,
    kalimatnya yang omong kosong.
  */
  const berskala = periksa.filter((p) => !apakahBiner(p.nama))
  if (berskala.length === 0) {
    return {
      tingkat: 'aman',
      kalimat: 'Aman — seluruh pemeriksaan terpenuhi.',
    }
  }

  const paling = berskala.reduce((a, b) => (b.rasio > a.rasio ? b : a))
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
