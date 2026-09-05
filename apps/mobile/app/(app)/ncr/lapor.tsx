import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TextInput, ActivityIndicator, Alert, StyleSheet,
} from 'react-native';
import { Tekan } from '@/components/ui/Tekan';
import { KepalaLayar } from '@/components/ui/KepalaLayar';
import { router } from 'expo-router';
import { api } from '@/lib/api';
import { antrekan } from '@/lib/antrean';
import { useAuth } from '@/hooks/useAuth';
import { useTema } from '@/hooks/useTema';
import { FONT, HURUF, RADIUS, SENTUH_MIN, SPASI, type Palet } from '@/lib/tema';

/*
  ══════════════════════════════════════════════════════════════════════════
  LAPOR NCR — ketidaksesuaian mutu
  ══════════════════════════════════════════════════════════════════════════

  ── Bedanya dengan punch list, dan kenapa itu bukan duplikasi

  Sekilas dua layar ini kembar: judul, lokasi, tingkat, keterangan. Yang
  membedakannya satu medan — `acuan`.

  Punch list mencatat CACAT: sesuatu yang terlihat salah dan harus dirapikan
  sebelum serah terima. NCR mencatat KETIDAKSESUAIAN: pekerjaan yang
  menyimpang dari sesuatu yang TERTULIS — pasal spesifikasi, gambar kerja,
  SNI. Itu sebabnya NCR punya rantai status enam langkah (terbuka →
  disposisi → perbaikan → verifikasi → ditutup) sementara punch cukup
  terbuka/selesai, dan sebabnya NCR bisa berujung pada klaim biaya.

  Tanpa `acuan`, sebuah NCR hanyalah punch list dengan nama lebih menakutkan,
  dan pihak yang dituduh menyimpang tak punya apa pun untuk diperiksa.
  Karena itu medan itu ADA di layar ini meski rutenya menerimanya sebagai
  opsional — dan disertai contoh, karena "acuan" adalah istilah yang tak
  semua mandor pakai sehari-hari.

  ── Nilai severity DARI BASIS, dan tidak sama dengan punch

  `ncr_severity` = minor · major · kritis — TIGA nilai, bukan empat, dan
  namanya bukan ringan/sedang/berat. Diukur lewat `pg_enum` 2026-08-31.

  Menyalin daftar dari layar punch adalah kesalahan yang paling mudah
  terjadi di sini justru karena dua layarnya mirip: `'ringan'` akan ditolak
  basis dengan galat yang menyebut nama tipe enum — tak terbaca oleh siapa
  pun yang sedang berdiri di lokasi.

  ── Offline-first

  Lewat `lib/antrean`, sama dengan absensi, progres, dan punch. Sinyal buruk
  di proyek adalah keadaan normal, bukan pengecualian.
*/

type Proyek = { id: string; nama: string };

/*
  Diambil dari `pg_enum` tipe `ncr_severity`. Urutannya mengikuti
  `enumsortorder` basis — ringan ke berat, kiri ke kanan, arah yang sama
  dengan cara orang membaca.
*/
const SEVERITY = [
  { nilai: 'minor', label: 'Minor' },
  { nilai: 'major', label: 'Major' },
  { nilai: 'kritis', label: 'Kritis' },
] as const;

/**
 * Warna tingkat keparahan, dari palet aktif.
 *
 * ⚠ Dulu hex dipaku di dalam `SEVERITY` — dan DIHITUNG terhadap surface
 * gelap `#1A1D27`, dua dari tiganya gagal WCAG AA:
 *
 *     #059669 minor    4.46:1   lolos tipis
 *     #D97706 major    5.28:1   lolos
 *     #B91C1C kritis   2.60:1   ❌ GAGAL — dan yang TERBURUK justru
 *                               keparahan tertinggi
 *
 * Persis cacat yang sama sudah diperbaiki di `pekerjaan.tsx`. Ia muncul
 * dua kali karena hidup di dua berkas yang tak saling tahu: satu yang
 * MEMBUAT NCR, satu yang MENAMPILKANNYA.
 *
 * Token gelapnya, terhitung di latar yang sama: success 7.38:1 ·
 * warning 7.83:1 · danger 7.04:1.
 */
function warnaKeparahan(c: Palet, sev: string): string {
  switch (sev) {
    case 'minor':
      return c.success;
    case 'major':
      return c.warning;
    default:
      return c.danger;
  }
}

export default function LaporNcr() {
  /*
    Gaya dirakit di dalam komponen — `StyleSheet.create` di lingkup
    modul berjalan sebelum satu hook pun, jadi ia tak bisa membaca
    `useTema()`. Lihat catatan panjangnya di `pekerjaan.tsx`.
  */
  const { c } = useTema();
  const s = React.useMemo(() => gaya(c), [c]);
  const { punyaIzin } = useAuth();
  const [proyek, setProyek] = useState<Proyek[]>([]);
  const [proyekId, setProyekId] = useState<string | null>(null);
  const [judul, setJudul] = useState('');
  const [acuan, setAcuan] = useState('');
  const [lokasi, setLokasi] = useState('');
  const [deskripsi, setDeskripsi] = useState('');
  const [severity, setSeverity] = useState('major');
  const [memuat, setMemuat] = useState(true);
  const [menyimpan, setMenyimpan] = useState(false);
  const [galatMuat, setGalatMuat] = useState<string | null>(null);

  const boleh = punyaIzin('ncr:manage');

  useEffect(() => {
    let hidup = true;
    (async () => {
      try {
        const r = await api.get('/api/v1/projects');
        if (!hidup) return;
        const daftar: Proyek[] = (r.data?.projects ?? r.data ?? []).map(
          (p: { id: string; name: string }) => ({ id: p.id, nama: p.name }),
        );
        setProyek(daftar);
        if (daftar.length === 1) setProyekId(daftar[0].id);
      } catch {
        /*
          Galat MUAT terpisah dari galat SIMPAN — dua state berbeda. Berbagi
          satu state membuat gagal-simpan menghapus pesan gagal-muat; cacat
          yang sudah ditemukan di 11 halaman web.
        */
        if (hidup) setGalatMuat('Gagal memuat daftar proyek. Periksa koneksi.');
      } finally {
        if (hidup) setMemuat(false);
      }
    })();
    return () => { hidup = false; };
  }, []);

  async function simpan() {
    if (!proyekId) {
      Alert.alert('Pilih proyek', 'NCR dicatat pada satu proyek.');
      return;
    }
    const j = judul.trim();
    if (!j) {
      Alert.alert('Judul wajib diisi', 'Tulis singkat apa yang tidak sesuai.');
      return;
    }

    setMenyimpan(true);
    try {
      await antrekan({
        jenis: 'ncr',
        jalur: `/api/v1/projects/${proyekId}/ncr`,
        muatan: {
          judul: j,
          acuan: acuan.trim() || undefined,
          lokasi: lokasi.trim() || undefined,
          deskripsi: deskripsi.trim() || undefined,
          severity,
        },
        ringkas: `NCR: ${j.slice(0, 40)}`,
      });
      Alert.alert(
        'Tersimpan',
        'NCR masuk antrean kirim. Kalau sinyal ada, ia terkirim sekarang; kalau tidak, otomatis dicoba lagi.',
        [{ text: 'Selesai', onPress: () => router.back() }],
      );
    } catch {
      Alert.alert('Gagal menyimpan', 'NCR belum masuk antrean. Coba lagi.');
    } finally {
      setMenyimpan(false);
    }
  }

  if (!boleh) {
    return (
      <View style={s.tengah}>
        <Text style={s.kosongJudul}>Tidak ada akses</Text>
        <Text style={s.kosongIsi}>
          Menerbitkan NCR butuh izin kelola ketidaksesuaian. Hubungi admin bila ini keliru.
        </Text>
      </View>
    );
  }

  if (memuat) {
    return (
      <View style={s.tengah}>
        <ActivityIndicator size="large" color={c.navy} />
      </View>
    );
  }

  return (
    <ScrollView style={s.wadah} contentContainerStyle={s.isi} keyboardShouldPersistTaps="handled">
      {/*
        `penjelas` sengaja TIDAK diisi di sini, meski layar isian lain
        memakainya.

        Percobaan pertama mengisinya "Penyimpangan dari spesifikasi, gambar,
        atau standar" — dan itu mengulang kalimat PERTAMA `subJudul` di
        bawahnya nyaris kata per kata. Dua baris berurutan yang mengatakan
        hal sama membuat pembacanya melewati keduanya.

        Yang penting justru kalimat KEDUA `subJudul`: kapan harus memakai
        Lapor Temuan. NCR dan temuan mudah tertukar, dan salah pilih berarti
        pekerjaan yang menyimpang dicatat sebagai cacat rapi-rapi.
      */}
      <KepalaLayar judul="Lapor NCR" />
      <Text style={s.subJudul}>
        Pekerjaan yang menyimpang dari spesifikasi, gambar, atau standar. Untuk cacat
        biasa yang tinggal dirapikan, pakai Lapor Temuan.
      </Text>

      {galatMuat && (
        <View style={s.galat}>
          <Text style={s.galatTeks}>{galatMuat}</Text>
        </View>
      )}

      <Text style={s.label}>Proyek</Text>
      {proyek.length === 0 ? (
        <Text style={s.kosongIsi}>
          Belum ada proyek yang bisa Anda akses. Hubungi admin bila Anda
          seharusnya ditugaskan di salah satunya.
        </Text>
      ) : (
        <View style={s.pilihanBaris}>
          {proyek.map((p) => (
            <Tekan
              key={p.id}
              onPress={() => setProyekId(p.id)}
              style={[s.chip, proyekId === p.id && s.chipAktif]}
              accessibilityRole="button"
              accessibilityState={{ selected: proyekId === p.id }}
            >
              <Text style={[s.chipTeks, proyekId === p.id && s.chipTeksAktif]}>{p.nama}</Text>
            </Tekan>
          ))}
        </View>
      )}

      <Text style={[s.label, s.spasiAtas]}>Apa yang tidak sesuai</Text>
      <TextInput
        value={judul}
        onChangeText={setJudul}
        placeholder="mis. Selimut beton kolom kurang dari gambar"
        placeholderTextColor={c.textMuted}
        style={s.input}
        accessibilityLabel="Judul ketidaksesuaian"
      />

      {/*
        Medan yang membedakan NCR dari punch list. Bantuannya ditulis DI BAWAH
        kotak, bukan hanya sebagai placeholder — placeholder hilang begitu
        orang mulai mengetik, tepat saat contohnya paling dibutuhkan.
      */}
      <Text style={[s.label, s.spasiAtas]}>Acuan yang dilanggar</Text>
      <TextInput
        value={acuan}
        onChangeText={setAcuan}
        placeholder="mis. Gambar S-12 rev.3"
        placeholderTextColor={c.textMuted}
        style={s.input}
        accessibilityLabel="Acuan yang dilanggar"
      />
      <Text style={s.bantuan}>
        Pasal spesifikasi, nomor gambar, atau standar (SNI) yang jadi dasar. Tanpa ini,
        NCR sulit dibuktikan saat ditinjau.
      </Text>

      <Text style={[s.label, s.spasiAtas]}>Lokasi</Text>
      <TextInput
        value={lokasi}
        onChangeText={setLokasi}
        placeholder="mis. Lantai 2, grid C-4"
        placeholderTextColor={c.textMuted}
        style={s.input}
        accessibilityLabel="Lokasi ketidaksesuaian"
      />

      <Text style={[s.label, s.spasiAtas]}>Tingkat</Text>
      <View style={s.pilihanBaris}>
        {SEVERITY.map((sv) => {
          const aktif = severity === sv.nilai;
          return (
            <Tekan
              key={sv.nilai}
              onPress={() => setSeverity(sv.nilai)}
              style={[
                s.chip,
                aktif && {
                  backgroundColor: warnaKeparahan(c, sv.nilai),
                  borderColor: warnaKeparahan(c, sv.nilai),
                },
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: aktif }}
            >
              <Text style={[s.chipTeks, aktif && s.chipTeksAktif]}>{sv.label}</Text>
            </Tekan>
          );
        })}
      </View>

      <Text style={[s.label, s.spasiAtas]}>Keterangan (opsional)</Text>
      <TextInput
        value={deskripsi}
        onChangeText={setDeskripsi}
        placeholder="Rincian yang membantu yang menindaklanjuti"
        placeholderTextColor={c.textMuted}
        multiline
        style={[s.input, s.inputPanjang]}
        accessibilityLabel="Keterangan ketidaksesuaian"
      />

      <Tekan
        onPress={simpan}
        disabled={menyimpan || !proyekId || !judul.trim()}
        style={[s.simpan, (menyimpan || !proyekId || !judul.trim()) && s.simpanMati]}
        accessibilityRole="button"
      >
        <Text style={s.simpanTeks}>{menyimpan ? 'Menyimpan…' : 'Terbitkan NCR'}</Text>
      </Tekan>

      {/*
        Dua batas disebutkan, bukan didiamkan. Yang kedua penting: NCR
        BERJALAN sesudah diterbitkan — disposisi ke pihak yang harus
        memperbaiki dilakukan orang lain, dan mandor yang menunggunya di HP
        akan mengira laporannya mengendap.
      */}
      <Text style={s.catatan}>
        Tersimpan di HP dulu, lalu terkirim sendiri saat ada sinyal.{'\n'}
        Foto belum bisa dilampirkan dari sini — tambahkan lewat portal setelah NCR terkirim.{'\n'}
        Disposisi dan penutupan dilakukan di portal oleh QC/PM.
      </Text>
    </ScrollView>
  );
}

function gaya(c: Palet) {
  return StyleSheet.create({
    wadah: { flex: 1, backgroundColor: c.surfaceSubtle },
    isi: { padding: 16, paddingBottom: 40 },
    tengah: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: c.surfaceSubtle },
    subJudul: { fontSize: 13, color: c.textSecondary, lineHeight: 19, marginBottom: 16 },
    label: { fontSize: 13, fontFamily: FONT.isiTebal, color: c.textPrimary, marginBottom: 8 },
    bantuan: { fontSize: 12, color: c.textSecondary, lineHeight: 17, marginTop: 6 },
    spasiAtas: { marginTop: 16 },
    pilihanBaris: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    /*
      `maxWidth` WAJIB — ditemukan dari POTRET, bukan dari penjaga.

      Nama proyek nyata sepanjang "[UJI] Renovasi Fasad Kantor CV Makmur —
      Cihampelas" membentuk SATU chip yang lebih lebar daripada layar, dan
      `flexWrap` tak bisa menolong: ia membungkus ANTAR-chip, tak bisa
      mengecilkan satu chip yang sudah kebesaran. Ekornya terpotong di tepi
      kanan — "…CV Makmur — Cihampela" — jadi dua proyek berawalan sama tak
      bisa dibedakan sama sekali.

      ⚠ `potret-mobile.mjs` melapor HIJAU: "nol gulir mendatar". Benar untuk
      yang diukurnya (lebar dokumen vs viewport) — chip yang meluap terpotong
      DI DALAM wadahnya, bukan melebarkan halaman. Pengukuran yang benar atas
      hal yang salah.
    */
    chip: {
      maxWidth: '100%',
      paddingVertical: 9, paddingHorizontal: 14, borderRadius: 10,
      borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceRaised,
    },
    /* Yang terpilih dibedakan LATAR + border, bukan warna teks saja — WCAG
       1.4.1: informasi tak boleh disampaikan lewat warna semata. */
    chipAktif: { backgroundColor: c.navy, borderColor: c.navy },
    chipTeks: { fontSize: 13, color: c.textPrimary, fontFamily: FONT.isiTebal },
    chipTeksAktif: { color: c.surfaceRaised },
    input: {
      borderWidth: 1, borderColor: c.border, borderRadius: 10,
      paddingVertical: 12, paddingHorizontal: 13, fontSize: 15,
      color: c.textPrimary, backgroundColor: c.surfaceRaised,
    },
    inputPanjang: { minHeight: 88, textAlignVertical: 'top' },
    simpan: {
      marginTop: 22, backgroundColor: c.navy, borderRadius: 12,
      paddingVertical: 15, alignItems: 'center',
    },
    simpanMati: { backgroundColor: c.borderStrong },
    simpanTeks: { color: c.surfaceRaised, fontSize: 15, fontFamily: FONT.judul },
    catatan: { fontSize: 12, color: c.textSecondary, textAlign: 'center', marginTop: 12, lineHeight: 18 },
    galat: {
      backgroundColor: c.dangerBg, borderWidth: 1, borderColor: c.dangerBorder,
      borderRadius: 10, padding: 12, marginBottom: 14,
    },
    galatTeks: { fontSize: 13, color: c.danger, lineHeight: 19 },
    kosongJudul: { fontSize: 16, fontFamily: FONT.judul, color: c.textPrimary, marginBottom: 6 },
    kosongIsi: { fontSize: 13, color: c.textSecondary, lineHeight: 19, textAlign: 'center' },
  });
}
