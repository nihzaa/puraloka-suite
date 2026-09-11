import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTema } from '@/hooks/useTema';
import { Tekan } from '@/components/ui/Tekan';
import { Card } from '@/components/ui/Card';
import { FONT, HURUF, RADIUS, RAPAT, SENTUH_MIN, SPASI } from '@/lib/tema';

/**
 * Perbandingan berdampingan — kartu SEKARANG vs kartu POLES.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA LAYAR INI ADA, DAN KENAPA IA BUKAN LAYAR PRODUK
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Founder 2026-09-12: *"secara ui-ux udah seperti dibuat oleh designer
 * ternama belum? saya mau aplikasinya jangan kaku ui nya, harus terasa
 * fluid dan mahal"*.
 *
 * "Mahal" adalah penilaian selera, dan CLAUDE.md §8a.3 mengikat cara
 * mengambilnya: **usul yang bertentangan dengan keputusan founder yang
 * sudah turun dibangun sebagai perbandingan visual berdampingan, bukan
 * diterapkan. Founder memutuskan dari gambar.**
 *
 * Polanya sudah terbukti dan sudah pernah MEMBUNUH usul: `banding-aksen.mjs`
 * (4 tangkapan, 2 kandidat × 2 mode) menolak indigo pada `a38cb0d`. Di atas
 * kertas argumennya rapi; begitu dirender ia tidak menyatu.
 *
 * ── Kenapa route Expo, bukan mockup HTML
 *
 * Mockup dirender mesin LAIN. Yang sedang dinilai justru hal-hal yang cuma
 * muncul di mesin sungguhan: metrik font Plus Jakarta Sans, hairline di
 * kerapatan piksel perangkat, dan gerak yang dijalankan driver native.
 * Gambar yang cantik di HTML lalu meleset di APK adalah keputusan yang
 * diambil atas barang yang salah.
 *
 * ── Kenapa tak menyentuh satu pun layar produk
 *
 * Sampai founder memutuskan, 19 layar tetap seperti sekarang. Biaya kalau
 * usulnya ditolak: satu berkas dibuang, nol layar dipulihkan.
 *
 * ⚠ Berkas ini ada di `app/_banding/` — awalan garis bawah membuat
 * expo-router TIDAK memperlakukannya sebagai rute produk, jadi ia tak
 * muncul di navigasi mana pun dan tak bisa dicapai pengguna.
 */

/**
 * Data contoh — DISALIN dari potret `mobile-persetujuan-kecil.png`.
 *
 * Angka dan teksnya sengaja sama persis dengan layar sungguhan, termasuk
 * dua baris "Gaji Tukang · Rp 2.000.000 · 87 hari" yang identik. Data
 * karangan yang lebih rapi akan membuat perbandingannya bohong: yang
 * sedang diuji justru apakah rancangan ini sanggup membedakan baris-baris
 * yang MIRIP, dan itu keadaan nyata layar Persetujuan.
 */
const CONTOH = [
  { jenis: 'Kasbon', judul: 'Gaji Tukang', nilai: 'Rp 2.000.000', kode: null, hari: 87, tanggal: '16 Jun 2026' },
  { jenis: 'Kasbon', judul: 'Gaji Tukang', nilai: 'Rp 2.000.000', kode: null, hari: 87, tanggal: '16 Jun 2026' },
  { jenis: 'Kasbon', judul: 'Uang Makan', nilai: 'Rp 1.000.000', kode: null, hari: 87, tanggal: '16 Jun 2026' },
  {
    jenis: 'Permintaan Material',
    judul: 'Kebutuhan pasir dan batu split untuk pengecoran pondasi',
    /*
      Permintaan material TAK PUNYA nominal — yang dimintanya barang, dan
      harganya baru ada sesudah penawaran masuk. `nilai: null` di sini
      bukan data yang belum diisi melainkan bentuk entitas yang berbeda.
    */
    nilai: null,
    kode: 'MR-2026-002',
    hari: 79,
    tanggal: '24 Jun 2026',
  },
] as const;

type Baris = (typeof CONTOH)[number];

/**
 * Ambang umur.
 *
 * ⚠ Versi pertama memakai 7 hari — sama dengan layar produk — dan hasilnya
 * KEEMPAT kartu bertanda mendesak. Penanda yang menyala di semua baris tak
 * menandai apa pun; ia cuma menambah warna.
 *
 * Yang dipakai di sini 85 hari: ia MEMBELAH data contoh (tiga di 87, satu
 * di 79), jadi perbandingannya memperlihatkan apa yang sebenarnya sedang
 * diuji — apakah pembedaan lewat batang tepi itu terbaca.
 *
 * ⚠ Angka ini milik HALAMAN BANDING, bukan usulan untuk layar produk.
 * Ambang produk adalah keputusan domain (kapan sebuah persetujuan disebut
 * terlambat), bukan keputusan visual, dan tak boleh diubah dari sini.
 */
const AMBANG_MENDESAK = 85;

// ══════════════════════════════════════════════════════════════════════════
// KANDIDAT A — SEKARANG
// ══════════════════════════════════════════════════════════════════════════

/**
 * Persis bentuk yang berjalan hari ini: border 1px penuh, tanpa gerak,
 * semua kartu berbobot sama.
 */
function KartuSekarang({ b }: { b: Baris }) {
  const { c } = useTema();
  return (
    <View style={[gA.kartu, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={gA.atas}>
        <View style={[gA.lencana, { backgroundColor: c.infoBg }]}>
          <Text style={[gA.lencanaTeks, { color: c.info }]}>{b.jenis}</Text>
        </View>
        <View style={[gA.umur, { backgroundColor: c.dangerBg }]}>
          <Text style={[gA.umurTeks, { color: c.danger }]}>{b.hari} hari</Text>
        </View>
      </View>
      <Text style={[gA.judul, { color: c.textPrimary }]}>{b.judul}</Text>
      <Text style={[gA.nilai, { color: c.textPrimary }]}>{b.nilai ?? b.kode}</Text>
      <View style={gA.meta}>
        <Ionicons name="calendar-outline" size={13} color={c.textMuted} />
        <Text style={[gA.metaTeks, { color: c.textMuted }]}>{b.tanggal}</Text>
      </View>
    </View>
  );
}

const gA = StyleSheet.create({
  kartu: { borderRadius: RADIUS.lg, borderWidth: 1, padding: SPASI.lg, marginBottom: SPASI.md },
  atas: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  lencana: { paddingHorizontal: SPASI.sm, paddingVertical: SPASI.xs, borderRadius: RADIUS.sm },
  lencanaTeks: { fontSize: HURUF.xs, fontFamily: FONT.isiTebal },
  umur: { paddingHorizontal: SPASI.sm, paddingVertical: SPASI.xs, borderRadius: RADIUS.sm },
  umurTeks: { fontSize: HURUF.xs, fontFamily: FONT.isiTebal },
  judul: { fontSize: HURUF.lg, fontFamily: FONT.isi, marginTop: SPASI.md },
  nilai: { fontSize: HURUF.xl, fontFamily: FONT.isi, marginTop: SPASI.xs },
  meta: { flexDirection: 'row', alignItems: 'center', gap: SPASI.xs, marginTop: SPASI.sm },
  metaTeks: { fontSize: HURUF.sm, fontFamily: FONT.isi },
});

// ══════════════════════════════════════════════════════════════════════════
// KANDIDAT B — POLES
// ══════════════════════════════════════════════════════════════════════════

/**
 * Empat perubahan, dan tiap satunya menjawab satu keluhan terukur.
 *
 * 1. **Border 1px → hairline.** Garis tetap ada (mandor membaca di bawah
 *    matahari) tetapi berhenti bersaing dengan isi. Lihat `Card`.
 *
 * 2. **Uang jadi subjek.** Nominal naik ke `xxl` dengan `fontVariant:
 *    tabular-nums`, dan jenisnya turun jadi teks kecil tanpa kotak. Di
 *    layar keputusan uang, yang dicari mata adalah ANGKANYA — versi
 *    sekarang justru memberi kotak berwarna pada kata "Kasbon", hal yang
 *    paling tidak membedakan satu baris dari baris lain (tiga dari empat
 *    baris contoh berbunyi "Kasbon").
 *
 * 3. **Umur jadi garis tepi, bukan pil kedua.** Dua pil berwarna
 *    berdampingan adalah cacat yang sudah tercatat (§8a.3: *"dua pil merah
 *    berdampingan — keduanya benar sendiri-sendiri; yang salah artinya
 *    BERSAMA"*). Diganti batang 3px di tepi kiri: hadir, terbaca sebagai
 *    tingkat, dan tak menambah satu objek pun ke layar.
 *
 * 4. **Angka hari tetap TERTULIS.** Warna saja melanggar WCAG 1.4.1, dan
 *    aturan ini sudah ditegakkan di halaman aset & lapangan (§10h).
 */
function KartuPoles({ b, indeks }: { b: Baris; indeks: number }) {
  const { c } = useTema();
  const mendesak = b.hari > AMBANG_MENDESAK;

  return (
    <Card indeks={indeks} menonjol={mendesak} style={gB.kartu}>
      {/*
        Batang tepi menggantikan pil umur. `borderLeftWidth` pada kartu itu
        sendiri, bukan View terpisah — satu elemen lebih sedikit per baris,
        dikali 24 baris di layar sungguhan.
      */}
      <View
        style={[
          gB.tepi,
          { backgroundColor: mendesak ? c.danger : 'transparent' },
        ]}
      />
      <View style={gB.isi}>
        <View style={gB.atas}>
          <Text style={[gB.jenis, { color: c.textMuted }]}>{b.jenis.toUpperCase()}</Text>
          <Text style={[gB.umur, { color: mendesak ? c.danger : c.textMuted }]}>
            {b.hari} hari
          </Text>
        </View>

        {/*
          Yang naik ke ukuran terbesar adalah hal yang membedakan baris ini
          dari tetangganya — dan itu TIDAK selalu sama jenisnya.

          Kasbon dibedakan oleh NOMINALNYA. Permintaan material tak punya
          nominal sama sekali; yang membedakannya adalah APA yang diminta.
          Versi pertama memaksa keduanya ke satu slot, dan hasilnya
          "MR-2026-002" tercetak 24px tebal — nomor dokumen mengalahkan
          isi permintaan, padahal nomor itu justru yang paling tak berarti
          bagi orang yang sedang memutuskan.
        */}
        {b.nilai ? (
          <>
            <Text style={[gB.nilai, { color: c.textPrimary }]}>{b.nilai}</Text>
            <Text style={[gB.judul, { color: c.textSecondary }]} numberOfLines={2}>
              {b.judul}
            </Text>
          </>
        ) : (
          <>
            <Text style={[gB.judulUtama, { color: c.textPrimary }]} numberOfLines={2}>
              {b.judul}
            </Text>
            <Text style={[gB.kode, { color: c.textMuted }]}>{b.kode}</Text>
          </>
        )}

        <Text style={[gB.tanggal, { color: c.textMuted }]}>{b.tanggal}</Text>
      </View>
    </Card>
  );
}

const gB = StyleSheet.create({
  kartu: { marginBottom: SPASI.md, padding: 0, overflow: 'hidden', flexDirection: 'row' },
  tepi: { width: 3 },
  isi: { flex: 1, padding: SPASI.lg },
  atas: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  jenis: {
    fontSize: HURUF.xs,
    fontFamily: FONT.isiTebal,
    /*
      Jarak huruf dilebarkan. Teks kecil huruf besar tanpa tracking terbaca
      rapat dan murah; pelebarannya justru yang membuatnya terbaca sebagai
      label yang disengaja, bukan teks yang mengecil.
    */
    letterSpacing: 0.8,
  },
  umur: { fontSize: HURUF.xs, fontFamily: FONT.isiTebal, fontVariant: ['tabular-nums'] },
  nilai: {
    fontSize: HURUF.xxl,
    fontFamily: FONT.judul,
    marginTop: SPASI.sm,
    /*
      Angka lebar-tetap. Tanpa ini "Rp 2.000.000" dan "Rp 1.000.000" punya
      lebar berbeda, dan kolom nominal bergoyang saat digulir — hal yang
      tak seorang pun bisa tunjuk sebabnya tetapi semua orang rasakan.
    */
    fontVariant: ['tabular-nums'],
  },
  judul: { fontSize: HURUF.base, fontFamily: FONT.isi, marginTop: SPASI.xs, lineHeight: 22 },
  /*
    Judul sebagai subjek — dipakai saat baris ini tak punya nominal.
    Sedikit lebih kecil daripada nominal (20 vs 24) karena kalimat panjang
    pada 24px memakan dua baris penuh dan mendorong sisanya keluar layar.
  */
  judulUtama: {
    fontSize: HURUF.xl,
    fontFamily: FONT.judul,
    marginTop: SPASI.sm,
    lineHeight: 26,
  },
  kode: {
    fontSize: HURUF.sm,
    fontFamily: FONT.isi,
    marginTop: SPASI.xs,
    fontVariant: ['tabular-nums'],
  },
  tanggal: { fontSize: HURUF.xs, fontFamily: FONT.isi, marginTop: SPASI.md },
});

// ══════════════════════════════════════════════════════════════════════════
// KANDIDAT C — POLES+ (sesudah mengukur ke Linear · Ramp · Revolut)
// ══════════════════════════════════════════════════════════════════════════

/**
 * Yang berubah dari B, dan tiap satunya dari angka rujukan — bukan selera.
 *
 * ── 1. Nominal naik ke tingkat DISPLAY (24 → 38px), tracking dirapatkan
 *
 * Diukur: jangkauan skala huruf kita 2,50x; Linear 6,00x; Ramp 6,40x.
 * Pada 2,5x tak ada yang bisa MEMIMPIN, jadi hierarki jatuh ke warna dan
 * kotak — persis kerataan yang terlihat di potret.
 *
 * Ketiga rujukan memimpin dengan UKURAN, lalu meredam sisanya. Revolut
 * bahkan menaruh headline 136px dengan tracking -2,72px: *"otoritas dari
 * ukuran dan tracking, bukan dari ketebalan"*.
 *
 * ── 2. Sisa baris DIREDAM, bukan ikut membesar
 *
 * Menaikkan nominal saja tak cukup — kalau tetangganya ikut tebal, yang
 * didapat cuma layar yang lebih berisik. Judul turun ke `textSecondary`,
 * tanggal ke `textMuted`. Ramp menyebutnya sistem hitam-putih editorial
 * dengan SATU aksen; keberaniannya dibelanjakan di satu tempat.
 *
 * ── 3. Label kapital diregangkan (+0,8)
 *
 * Ramp memakai +0,018em pada label kapital 10px. Huruf besar tak punya
 * ascender/descender yang memberi ritme; tanpa regangan ia terbaca sebagai
 * blok padat, dan itu salah satu penanda paling cepat dari UI murah.
 *
 * ── 4. Nol kotak pada jenis, dan umur hanya BERWARNA saat mendesak
 *
 * Lencana biru di kartu Kasbon menandai hal yang tiga dari empat barisnya
 * SAMA — ia memakan perhatian tanpa membedakan apa pun.
 *
 * ── Yang SENGAJA tidak diambil dari rujukan
 *
 * Linear & Ramp sama-sama memimpin dengan tipografi RAKSASA (64-72px),
 * tetapi keduanya halaman PEMASARAN di layar lebar. Di HP 390px, 48px
 * untuk nominal berarti "Rp 2.000.000" pecah dua baris. Karena itu
 * `display` (38) yang dipakai, bukan `displayBesar` (48) — angka rujukan
 * DITIMBANG terhadap lebar layar kita, tidak disalin.
 */
function KartuPolesPlus({ b, indeks }: { b: Baris; indeks: number }) {
  const { c } = useTema();
  const mendesak = b.hari > AMBANG_MENDESAK;

  return (
    <Card indeks={indeks} menonjol={mendesak} style={gC.kartu}>
      <View style={[gC.tepi, { backgroundColor: mendesak ? c.danger : 'transparent' }]} />
      <View style={gC.isi}>
        <View style={gC.atas}>
          <Text style={[gC.jenis, { color: c.textMuted }]}>{b.jenis.toUpperCase()}</Text>
          <Text style={[gC.umur, { color: mendesak ? c.danger : c.textMuted }]}>
            {b.hari} hari
          </Text>
        </View>

        {b.nilai ? (
          <>
            <Text style={[gC.nilai, { color: c.textPrimary }]} numberOfLines={1}>
              {b.nilai}
            </Text>
            <Text style={[gC.judul, { color: c.textSecondary }]} numberOfLines={2}>
              {b.judul}
            </Text>
          </>
        ) : (
          <>
            <Text style={[gC.judulUtama, { color: c.textPrimary }]} numberOfLines={2}>
              {b.judul}
            </Text>
            <Text style={[gC.kode, { color: c.textMuted }]}>{b.kode}</Text>
          </>
        )}

        <Text style={[gC.tanggal, { color: c.textMuted }]}>{b.tanggal}</Text>
      </View>
    </Card>
  );
}

const gC = StyleSheet.create({
  kartu: { marginBottom: SPASI.md, padding: 0, overflow: 'hidden', flexDirection: 'row' },
  tepi: { width: 3 },
  isi: { flex: 1, padding: SPASI.xl },
  atas: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  jenis: {
    fontSize: HURUF.xs,
    fontFamily: FONT.isiTebal,
    letterSpacing: RAPAT.labelKapital,
  },
  umur: { fontSize: HURUF.xs, fontFamily: FONT.isiTebal, fontVariant: ['tabular-nums'] },
  nilai: {
    fontSize: HURUF.display,
    fontFamily: FONT.judul,
    letterSpacing: RAPAT.display,
    marginTop: SPASI.sm,
    /*
      lineHeight dipaku 42 (≈1,1× ukuran). Bawaan RN untuk 38px memberi
      ruang atas-bawah yang berlebih, dan angka besar lalu tampak melayang
      di tengah kartu alih-alih memimpin blok teks di bawahnya. Linear
      memakai line-height 1,00 pada seluruh tingkat display.
    */
    lineHeight: 42,
    fontVariant: ['tabular-nums'],
  },
  judul: { fontSize: HURUF.base, fontFamily: FONT.isi, marginTop: SPASI.xs, lineHeight: 22 },
  judulUtama: {
    fontSize: HURUF.xxl,
    fontFamily: FONT.judul,
    letterSpacing: RAPAT.xxl,
    marginTop: SPASI.sm,
    lineHeight: 30,
  },
  kode: {
    fontSize: HURUF.sm,
    fontFamily: FONT.isi,
    marginTop: SPASI.sm,
    fontVariant: ['tabular-nums'],
  },
  tanggal: { fontSize: HURUF.xs, fontFamily: FONT.isi, marginTop: SPASI.lg },
});

// ══════════════════════════════════════════════════════════════════════════
// Layar perbandingan
// ══════════════════════════════════════════════════════════════════════════

export default function BandingKartu() {
  const { c } = useTema();
  const [kandidat, setKandidat] = useState<'sekarang' | 'poles' | 'poles-plus'>('sekarang');

  return (
    <SafeAreaView style={[gL.layar, { backgroundColor: c.surfaceSubtle }]} edges={['top']}>
      <View style={gL.kepala}>
        <Text style={[gL.judul, { color: c.textPrimary }]}>Persetujuan</Text>
        <Text style={[gL.sub, { color: c.textSecondary }]}>24 menunggu keputusan Anda</Text>
      </View>

      {/*
        Dua tombol, bukan satu sakelar. Sakelar menuntut orang mengingat
        keadaan mana yang sedang aktif; dua tombol berlabel menyebut
        keduanya sekaligus, dan yang aktif terbaca tanpa ditafsirkan.
      */}
      <View style={gL.pilih}>
        {([
          ['Sekarang', 'sekarang'],
          ['Poles', 'poles'],
          ['Poles+', 'poles-plus'],
        ] as const).map(([label, nilai]) => {
          const aktif = kandidat === nilai;
          return (
            <Tekan
              key={label}
              onPress={() => setKandidat(nilai)}
              accessibilityRole="button"
              accessibilityLabel={`Tampilkan versi ${label}`}
              accessibilityState={{ selected: aktif }}
              style={[
                gL.tombol,
                {
                  backgroundColor: aktif ? c.merekBidang : c.surface,
                  borderColor: aktif ? c.merekBidang : c.border,
                },
              ]}
            >
              <Text
                style={[
                  gL.tombolTeks,
                  { color: aktif ? c.onMerek : c.textSecondary },
                ]}
              >
                {label}
              </Text>
            </Tekan>
          );
        })}
      </View>

      <ScrollView contentContainerStyle={gL.isi}>
        {/*
          `key` berubah saat kandidat bertukar supaya kartu POLES dipasang
          ulang — tanpa itu animasi masuknya cuma terlihat sekali, dan
          founder yang menekan bolak-balik menilai gerak yang tak berjalan.
        */}
        <View key={kandidat}>
          {CONTOH.map((b, i) => {
            if (kandidat === 'sekarang') return <KartuSekarang key={i} b={b} />;
            if (kandidat === 'poles') return <KartuPoles key={i} b={b} indeks={i} />;
            return <KartuPolesPlus key={i} b={b} indeks={i} />;
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const gL = StyleSheet.create({
  layar: { flex: 1 },
  kepala: { paddingHorizontal: SPASI.lg, paddingTop: SPASI.lg },
  judul: { fontSize: HURUF.xxxl, fontFamily: FONT.judul },
  sub: { fontSize: HURUF.base, fontFamily: FONT.isi, marginTop: SPASI.xs },
  pilih: { flexDirection: 'row', gap: SPASI.sm, padding: SPASI.lg },
  tombol: {
    minHeight: SENTUH_MIN,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.pil,
    borderWidth: 1,
  },
  tombolTeks: { fontSize: HURUF.base, fontFamily: FONT.isiTebal },
  isi: { paddingHorizontal: SPASI.lg, paddingBottom: SPASI.xxxl },
});
