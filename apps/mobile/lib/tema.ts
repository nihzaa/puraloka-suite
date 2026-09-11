/**
 * Token warna, tipografi, dan spasi untuk aplikasi mobile.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA BERKAS INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-09-04, sebelum berkas ini dibuat:
 *
 *     berkas token/tema        : 0
 *     warna hex ditulis langsung: 39 unik, 400+ pemakaian
 *     mode gelap               : 0
 *
 * Web punya 105 token dengan riwayat WCAG tertulis di `globals.css`
 * (ARAH-VISUAL-2026 §2 menyebutnya "disiplin yang jarang ada bahkan di
 * produk berbayar"). Mobile tak mewarisi satu pun — tiap layar menulis
 * `#003366` sendiri, 88 kali.
 *
 * Akibatnya bukan sekadar berantakan: satu perubahan merek berarti 400
 * suntingan, dan tak ada cara menambahkan mode gelap tanpa membuka ulang
 * seluruh layar.
 *
 * ── Angka DISALIN dari web, tidak dikarang ulang
 *
 * Tiap nilai di bawah diambil dari `apps/web/app/globals.css`. Itu bukan
 * kemalasan — token web sudah melewati audit axe-core berkali-kali, dan
 * angka yang "kelihatan mirip" akan menghasilkan dua produk yang terasa
 * berbeda tanpa ada yang bisa menunjuk sebabnya.
 *
 * Contoh yang tercatat di globals.css: `#9CA3AF` dibuang 2026-07-31 karena
 * kontrasnya 2,53:1 — ditemukan axe-core di halaman LOGIN. Mobile memakai
 * warna itu 24 kali saat berkas ini ditulis.
 *
 * ── Mode gelap: keputusan founder 2026-09-04
 *
 * Dibuat berpasangan SEJAK AWAL, bukan ditambahkan nanti. Alasannya
 * praktis: menambahkannya belakangan berarti membuka ulang 16 layar, dan
 * warna gelap yang menyusul biasanya tak konsisten dengan yang pertama.
 *
 * ⚠ Warna gelap BUKAN kebalikan warna terang. `--navy` terang `#003366`
 * jadi `#4D9FFF` di gelap — lebih terang, bukan lebih gelap. Navy pekat di
 * atas latar gelap tak terbaca sama sekali.
 */

/** Satu-satunya sumber warna. Tiap kunci punya pasangan terang + gelap. */
export interface Palet {
  /* Permukaan */
  surface: string
  surfaceRaised: string
  surfaceSubtle: string
  surfaceHover: string
  border: string
  borderStrong: string

  /* Teks */
  textPrimary: string
  textSecondary: string
  textMuted: string
  onNavy: string

  /* Merek — navy #003366 adalah identitas Puraloka (ARAH-VISUAL §2) */
  navy: string
  navyMid: string
  navyLight: string

  /**
   * BIDANG merek — panel besar, bukan teks maupun ikon.
   *
   * ⚠ Dipisah dari `navy` pada 2026-09-05 sesudah panel dashboard terender
   * BIRU MUDA di mode gelap. Sebabnya bukan salah ketik: satu nama dipakai
   * untuk DUA peran yang menuntut arah berlawanan.
   *
   *   `navy` sebagai AKSEN teks/ikon  → di mode gelap wajib TERANG (#73B4FF),
   *                                     sebab ia dibaca di atas latar gelap
   *   `navy` sebagai BIDANG merek     → wajib TETAP PEKAT di kedua mode,
   *                                     sebab ia LATAR bagi teks putih
   *
   * Memakai yang pertama untuk yang kedua membalik seluruh rancangan: panel
   * merek jadi benda paling TERANG di layar gelap, dan teks `onNavy` yang
   * hampir hitam duduk di atasnya. Tiap token benar untuk perannya sendiri;
   * yang salah cuma pemakaiannya.
   *
   * Di mode gelap nilainya sedikit lebih gelap dari #003366 — bidang navy
   * penuh di layar gelap terasa menyala kalau dibiarkan sama persis.
   */
  merekBidang: string
  /** Teks/ikon di atas `merekBidang`. Putih di KEDUA mode. */
  onMerek: string

  /* Semantik */
  success: string
  successBg: string
  successBorder: string
  warning: string
  warningBg: string
  warningBorder: string
  danger: string
  dangerBg: string
  dangerBorder: string
  info: string
  infoBg: string
  infoBorder: string
}

export const TERANG: Palet = {
  surface: '#FFFFFF',
  surfaceRaised: '#FFFFFF',
  surfaceSubtle: '#F9FAFB',
  surfaceHover: '#F3F4F6',
  border: '#E5E7EB',
  borderStrong: '#D1D5DB',

  textPrimary: '#111827',
  textSecondary: '#505660',
  textMuted: '#53595E',
  onNavy: '#FFFFFF',

  navy: '#003366',
  navyMid: '#0050A0',
  navyLight: '#EBF2FF',

  merekBidang: '#003366',
  onMerek: '#FFFFFF',

  success: '#10612E',
  successBg: '#F0FDF4',
  successBorder: '#BBF7D0',
  warning: '#8D4107',
  warningBg: '#FFFBEB',
  warningBorder: '#FDE68A',
  danger: '#A31919',
  dangerBg: '#FEF2F2',
  dangerBorder: '#FECACA',
  info: '#1A47C4',
  infoBg: '#EFF6FF',
  infoBorder: '#BFDBFE',
}

export const GELAP: Palet = {
  surface: '#1A1D27',
  surfaceRaised: '#212536',
  surfaceSubtle: '#161921',
  surfaceHover: '#252840',
  border: '#2A2D3E',
  borderStrong: '#363A52',

  textPrimary: '#F1F3F9',
  textSecondary: '#AAB1C9',
  textMuted: '#AAB0C6',
  /*
    Tetap putih. Tombol navy di mode gelap memakai `navy` yang sudah
    diterangkan (#4D9FFF) sebagai LATAR — dan teks di atasnya butuh
    kontras terhadap biru terang itu, bukan terhadap latar layar.
  */
  onNavy: '#08111F',

  navy: '#73B4FF',
  navyMid: '#5FA9FF',
  navyLight: 'rgba(115,180,255,0.10)',

  /*
    Sedikit lebih gelap dari #003366: bidang navy penuh di layar gelap
    terasa menyala kalau dibiarkan sama persis dengan mode terang.
    Hue & saturation dipertahankan; hanya lightness yang turun.
  */
  merekBidang: '#00284F',
  onMerek: '#FFFFFF',

  success: '#24D264',
  successBg: 'rgba(36,210,100,0.10)',
  successBorder: 'rgba(36,210,100,0.25)',
  warning: '#F6A927',
  warningBg: 'rgba(246,169,39,0.10)',
  warningBorder: 'rgba(246,169,39,0.25)',
  danger: '#FCA1A1',
  dangerBg: 'rgba(252,161,161,0.10)',
  dangerBorder: 'rgba(252,161,161,0.25)',
  info: '#8BBDFB',
  infoBg: 'rgba(139,189,251,0.10)',
  infoBorder: 'rgba(139,189,251,0.25)',
}

/**
 * Skala spasi — kelipatan 4, mengikuti Material 8dp rhythm.
 *
 * Diukur sebelum ditetapkan: layar mobile memakai 27 nilai padding/margin
 * berbeda (4, 6, 8, 10, 12, 14, 16, 18, 20, 24, 26, 28, 32, …). Skala
 * ini menutup semuanya dengan tujuh langkah.
 */
export const SPASI = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const

/**
 * Skala tipografi.
 *
 * ⚠ `xs: 12` adalah LANTAI, bukan pilihan bebas. Diukur 2026-08-31: 18
 * tempat memakai fontSize di bawah 12, tiga di antaranya 9–10px. Mandor
 * membaca layar ini di bawah matahari, sering dengan tangan kotor dan
 * layar tergores.
 *
 * Nilai di bawah 12 sengaja TIDAK disediakan — kalau sesuatu tak muat,
 * yang salah tata letaknya, bukan ukuran hurufnya.
 */
export const HURUF = {
  xs: 12,
  sm: 13,
  base: 15,
  lg: 17,
  xl: 20,
  xxl: 24,
  xxxl: 30,

  /*
    ── Tingkat DISPLAY, ditambahkan 2026-09-12 ────────────────────────────

    Founder: *"harus terasa fluid dan mahal"*. Diukur terhadap tiga sistem
    yang memang dibaca mahal, dan selisihnya BUKAN soal selera:

        JANGKAUAN SKALA (terbesar ÷ terkecil)
          Puraloka   2,50x   (12 → 30)
          Linear     6,00x   (12 → 72)
          Ramp       6,40x   (10 → 64)

    Jangkauan 2,5x berarti tak ada apa pun yang bisa tampil JAUH lebih
    penting daripada yang lain. Hierarki lalu terpaksa dititipkan ke warna
    dan kotak — dan itulah kerataan yang terlihat di tiap potret: kartu
    berbobot sama, dibedakan cuma oleh lencana kecil di pojok.

    Menambah tingkat display TIDAK memaksa layar mana pun berubah: tujuh
    nilai di atas tak disentuh, jadi 19 layar merender sama persis sampai
    seseorang memakai tingkat ini dengan sengaja.

    ⚠ Dipakai HEMAT — satu per layar, untuk angka atau judul yang memang
    memimpin. Kalau dua hal memakai `display` di satu layar, tak ada yang
    memimpin dan skalanya kembali rata dengan angka yang lebih besar.
  */
  /** Angka utama sebuah kartu ringkasan. */
  display: 38,
  /** Angka pahlawan — nilai tunggal yang menjadi alasan layar itu dibuka. */
  displayBesar: 48,
} as const

/**
 * Kerapatan huruf (tracking), TERIKAT pada ukuran.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA INI TOKEN, BUKAN ANGKA DI TIAP LAYAR
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-09-12: `letterSpacing` dipakai 12 tempat dengan DELAPAN nilai
 * berbeda (0.8 · -0.5 · -0.3 · 4.5 · 0.6 · 0.4 · -1 · -0.4), nol token.
 * Delapan tebakan yang masing-masing masuk akal sendiri-sendiri.
 *
 * Ketiga rujukan justru menanganinya sebagai FUNGSI UKURAN, bukan pilihan
 * bebas — makin besar teksnya, makin rapat trackingnya:
 *
 *     Linear   72px → -1,584   48px → -1,056   32px → -0,704   16px → 0
 *     Ramp     10px uppercase → +0,018em       body & display → 0
 *
 * Alasannya optik, bukan gaya: pada ukuran besar, jarak antar-huruf
 * tampak MELEBAR sendiri, jadi tracking negatif mengembalikannya ke rapat
 * yang terbaca disengaja. Pada teks kecil kebalikannya — huruf saling
 * berdempet, dan label kapital butuh diregangkan supaya tak terbaca murah.
 *
 * Angka di bawah memakai rasio Linear (≈ -0,022 × ukuran) yang dibulatkan
 * ke sepersepuluh piksel — React Native menerima pecahan, tetapi selisih
 * di bawah 0,1px tak terlihat di kerapatan layar mana pun.
 */
export const RAPAT = {
  /** 48px — angka pahlawan. */
  displayBesar: -1.1,
  /** 38px — angka utama kartu. */
  display: -0.8,
  /** 30px — judul layar. */
  xxxl: -0.7,
  /** 24px — nominal di kartu daftar. */
  xxl: -0.5,
  /** 20px — subjudul. */
  xl: -0.4,
  /**
   * Label KAPITAL kecil — satu-satunya yang POSITIF.
   *
   * Huruf besar tak punya ascender/descender yang memberi ritme, jadi
   * tanpa regangan ia terbaca sebagai blok padat. Ramp memakai +0,018em
   * pada 10px; di 12px itu ≈ +0,2px, dibulatkan naik karena Plus Jakarta
   * Sans lebih rapat daripada Lausanne.
   */
  labelKapital: 0.8,
  /** Teks isi — jangan diutak-atik. Tracking pada teks badan merusak baca. */
  isi: 0,
} as const

/**
 * Nama keluarga font — DIDAFTARKAN di `_layout.tsx` lewat `expo-font`.
 *
 * Sama dengan web (ARAH-VISUAL §2): Bricolage Grotesque untuk judul,
 * Plus Jakarta Sans untuk isi. Sebelum ini mobile memakai font sistem,
 * yang membuat aplikasi terlihat generik — dan "bukan Inter" adalah
 * salah satu hal yang arah visual repo ini justru banggakan.
 *
 * ⚠ Kalau font gagal dimuat, React Native TIDAK melempar galat — ia diam
 * dan memakai font sistem. Karena itu `_layout.tsx` menahan splash sampai
 * `useFonts` selesai, dan `audit-font-mobile-terpasang.mjs` menjaga
 * berkasnya benar-benar ada di disk.
 */
export const FONT = {
  /** Judul & angka besar. Berkarakter, dipakai hemat. */
  judul: 'BricolageGrotesque_700Bold',
  /** Isi, label, tombol. */
  isi: 'PlusJakartaSans_400Regular',
  isiTebal: 'PlusJakartaSans_600SemiBold',
} as const

/**
 * Radius sudut — jangan mengarang nilai lain.
 *
 * `xl` (26) ditambahkan 2026-09-05 untuk panel merek: bidang navy besar
 * yang menutup bagian atas layar. Radius 16 pada bidang selebar layar
 * terlihat seperti kartu kebesaran, bukan seperti permukaan.
 *
 * ── Concentricity: radius DALAM = radius LUAR − padding
 *
 * Apple HIG (WWDC25) menyebutnya prinsip yang membuat kontrol bersarang
 * terasa dirancang, bukan ditempel. Gratis, nol biaya GPU.
 *
 * Praktiknya di sini: kartu ber-`RADIUS.lg` (16) dengan padding 14
 * seharusnya membungkus isian ber-radius ~2, bukan 16 lagi. Bukan aturan
 * mati — tetapi kalau dua radius sama sementara ada padding di antaranya,
 * itu tanda salah satunya belum dipikirkan.
 */
export const RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 26,
  pil: 999,
} as const

/**
 * Elevasi — TIGA tingkat, dan bayangannya BERNADA NAVY.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA BUKAN HITAM
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `#000` pada opacity berapa pun mencuci warna di bawahnya jadi KELABU.
 * Yang benar: hue latar dengan saturation dan lightness diturunkan. Navy
 * `#003366` ≈ `hsl(210 100% 20%)`, jadi bayangannya `hsl(210 40% 25%)` —
 * `#26425C`. Bedanya halus per-elemen dan jelas di satu layar penuh.
 *
 * ── Kenapa hanya TIGA, dan kenapa `kartu` TANPA bayangan
 *
 * Material 3 memilih *tonal elevation* (pergeseran warna permukaan) sebagai
 * default dan menyisakan bayangan hanya untuk yang benar-benar mengambang.
 * Di React Native itu bukan sekadar selera:
 *
 *   - tiap lapis bayangan = satu alpha blending, dan Android menggambar
 *     bagian yang tertutup juga (overdraw). Di daftar 60 baris, bayangan
 *     per-kartu terbayar 60 kali tiap frame.
 *   - anggaran satu frame 16ms untuk 60fps. HP mandor bukan perangkat uji.
 *
 * Jadi kartu daftar memakai `surfaceRaised` + border 1px — kedalaman dari
 * WARNA, bukan dari bayangan. Bayangan disediakan untuk yang jumlahnya
 * satu-dua per layar.
 *
 * ── Saat naik: offset↑ blur↑ tetapi OPACITY TURUN
 *
 * Yang murah menaikkan opacity saat elevasi naik, dan hasilnya terlihat
 * seperti noda. Benda yang lebih tinggi melempar bayangan lebih LEBAR dan
 * lebih SAMAR, bukan lebih pekat.
 *
 * ⚠ `shadowOffset`/`shadowRadius` hanya berlaku di iOS; Android memakai
 * `elevation`, yang TIDAK bisa diberi warna sebelum API 28 dan tetap
 * mengabaikan `shadowColor` di banyak perangkat. Nilai `elevation` di sini
 * karena itu perkiraan yang mendekati, bukan padanan persis — dan itulah
 * alasan tambahan kartu daftar memakai border, yang tampil SAMA di kedua
 * sistem.
 */
export const ELEVASI = {
  /** Kartu daftar & isian: nol bayangan. Kedalaman dari border + permukaan. */
  datar: {
    borderWidth: 1,
  },
  /** Kartu ringkasan tunggal — satu per layar, bukan per baris. */
  angkat: {
    shadowColor: '#26425C',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  /** Yang benar-benar MENGAMBANG: kartu di atas panel, lembar bawah, FAB. */
  ambang: {
    shadowColor: '#26425C',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 7,
  },
} as const

/**
 * Ukuran sasaran sentuh minimum.
 *
 * 44 dari Apple HIG; Material menuntut 48dp. Dipakai 44 karena itu yang
 * sudah dipakai komponen `ui/` yang ada, dan menaikkannya ke 48 akan
 * menggeser tata letak 16 layar sekaligus — perubahan yang perlu dilihat
 * di layar sungguhan, bukan disunting massal.
 */
export const SENTUH_MIN = 44
