import React from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useTema } from '@/hooks/useTema';
import { SENTUH_MIN } from '@/lib/tema';

interface TekanProps extends Omit<PressableProps, 'style'> {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Padamkan umpan balik visual — hanya untuk pembungkus yang bukan sasaran tekan. */
  tanpaUmpan?: boolean;
  /** Perbesar area sentuh di luar batas visual (untuk ikon kecil). */
  hitSlop?: number;
}

/**
 * `Pressable` yang SELALU memberi umpan balik saat ditekan.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA KOMPONEN INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-09-04 dengan pembacaan tag utuh (bukan `grep -A2`, yang
 * memotong tag multi-baris dan memberi angka yang salah):
 *
 *     <Pressable>  17 dipakai · 1 punya umpan balik · **16 TELANJANG**
 *     <TouchableOpacity> 26 — aman, bawaannya memudar ke 0.2
 *
 * `Pressable` BAWAANNYA TIDAK MELAKUKAN APA-APA saat ditekan. Tak ada
 * ripple, tak ada pudar, tak ada apa pun — kecuali `style` ditulis sebagai
 * fungsi `({ pressed }) => …` atau `android_ripple` dipasang.
 *
 * Itu membuatnya lebih berbahaya daripada `TouchableOpacity`: keduanya
 * terlihat sama di kode, tapi yang satu diam total.
 *
 * ── Kenapa ini bukan soal kehalusan
 *
 * Tiga dari enam berkas yang terdampak adalah layar TULIS: `ncr/lapor`,
 * `punch/lapor`, `izin-kerja/ajukan`. Mandor menekan tombol dengan sarung
 * tangan, layar berdebu, di bawah matahari. Tanpa umpan balik, tekanan
 * pertama tak terasa terjadi — jadi ditekan lagi.
 *
 * Untuk layar tulis itu berarti dua NCR dari satu temuan, atau dua izin
 * kerja untuk satu pekerjaan. Tak ada galat; yang muncul cuma baris kembar
 * yang kemudian disalahkan pada "mandornya dobel input".
 *
 * `ui-ux-pro-max` menempatkan ini di prioritas 2 (CRITICAL, Touch &
 * Interaction): *"Instant state changes (0ms)"* adalah anti-pattern, dan
 * umpan balik wajib muncul dalam 100ms.
 *
 * ── Kenapa DUA mekanisme, bukan satu
 *
 * Android memakai `android_ripple` (riak dari titik sentuh) karena itu
 * bahasa Material yang dikenali penggunanya. iOS tak punya ripple, jadi
 * memakai opasitas — bahasa yang dikenali di sana.
 *
 * Memaksa satu mekanisme di kedua platform membuat salah satunya terasa
 * asing. `ui-ux-pro-max` menyebutnya `platform-adaptive`.
 *
 * ── Kenapa `Pressable`, bukan `TouchableOpacity`
 *
 * Pedoman stack `react-native`: *"Pressable for touch interactions, don't
 * use TouchableOpacity for new code"*. `Pressable` memberi keadaan tekan
 * yang sesungguhnya, mendukung `hitSlop` yang benar, dan tak dideprecate.
 *
 * ```tsx
 * <Tekan onPress={simpan} accessibilityRole="button" accessibilityLabel="Simpan">
 *   <Text>Simpan</Text>
 * </Tekan>
 * ```
 */
export function Tekan({
  children,
  style,
  tanpaUmpan,
  hitSlop,
  disabled,
  ...props
}: TekanProps) {
  const { c, gelap } = useTema();

  /*
    Riak Android memakai warna teks, bukan navy: navy di atas kartu navy
    tak terlihat, dan riak yang tak terlihat sama saja dengan tak ada.
    Opasitas rendah menjaganya tetap terbaca sebagai sentuhan, bukan
    sebagai perubahan warna.
  */
  const riak =
    Platform.OS === 'android' && !tanpaUmpan && !disabled
      ? {
          color: gelap ? 'rgba(255,255,255,0.12)' : 'rgba(0,51,102,0.10)',
          borderless: false,
        }
      : undefined;

  return (
    <Pressable
      /*
        `accessibilityRole="button"` ditulis SEBELUM `{...props}` — urutan
        ini yang membuatnya bawaan, bukan paksaan: pemanggil yang mengirim
        role lain (`link`, `checkbox`, `tab`) tetap menang karena `{...props}`
        menimpanya sesudah ini.

        Kenapa bawaannya "button" dan bukan dibiarkan kosong: `Pressable`
        tanpa role dibacakan TalkBack/VoiceOver sebagai teks biasa —
        penggunanya tahu ada tulisan di layar, tapi tak diberi tahu itu bisa
        ditekan. Yang lupa memasangnya akan tetap dapat perilaku yang benar.

        Ia juga membuat `audit-a11y-mobile.mjs` bisa MELIHAT kontrak ini.
        Alternatifnya adalah mengecualikan berkas ini dari penjaga — dan
        pengecualian diam-diam adalah cara penjaga kehilangan jangkauan
        tanpa gejala.
      */
      accessibilityRole="button"
      {...props}
      disabled={disabled}
      android_ripple={riak}
      hitSlop={hitSlop ?? undefined}
      style={({ pressed }) => [
        style,
        /*
          iOS: opasitas. Android sudah dapat riak, jadi tak ikut memudar —
          dua umpan balik sekaligus terasa berlebihan dan membuat elemen
          terlihat "berkedip".

          0.6, bukan 0.2 seperti bawaan TouchableOpacity: pada layar di
          bawah matahari langsung, 0.2 membuat elemennya nyaris hilang
          selama jari masih menempel — pengguna kehilangan konteks apa yang
          sedang ditekannya.
        */
        pressed && !tanpaUmpan && Platform.OS !== 'android' && { opacity: 0.6 },
        /*
          ⚠ Pudar HANYA saat `disabled` DAN masih dimaksudkan sebagai
          tombol — bukan saat `tanpaUmpan` juga dipasang.

          Terlihat dari potret RAB: baris item yang tak punya anak dipasang
          `disabled` (tak ada yang bisa dibuka-tutup) plus `tanpaUmpan`,
          dan seluruh barisnya memudar jadi 0.45. Nama pekerjaan, harga,
          dan persentase progres ikut pucat — pada baris yang justru paling
          banyak dibaca di layar itu.

          Bedanya nyata: `disabled` sendirian berarti "tombol ini sedang
          tak bisa ditekan" (dan memang harus terlihat begitu). `disabled`
          + `tanpaUmpan` berarti "ini bukan tombol sama sekali" — isinya
          tetap harus terbaca penuh.

          Kelas yang sama dengan pil status yang ikut memerah di
          `pekerjaan.tsx`: satu isyarat visual dipakai untuk dua arti,
          dan yang kalah adalah arti yang lebih sering muncul.
        */
        disabled && !tanpaUmpan && gaya.mati,
      ]}
    >
      {children}
    </Pressable>
  );
}

const gaya = StyleSheet.create({
  mati: { opacity: 0.45 },
});

/**
 * Area sentuh minimum untuk ikon kecil, dipakai sebagai `hitSlop`.
 *
 * Ikon 20px di dalam kotak 24px punya sasaran sentuh 24×24 — jauh di bawah
 * 44 (Apple HIG) / 48 (Material). `hitSlop` memperbesar area TANPA menggeser
 * tata letak, jadi ia tak merusak susunan yang sudah rapat.
 */
export const SLOP_IKON = Math.round((SENTUH_MIN - 24) / 2);
