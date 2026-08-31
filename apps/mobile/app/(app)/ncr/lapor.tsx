import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput, ActivityIndicator, Alert, StyleSheet,
} from 'react-native';
import { router } from 'expo-router';
import { api } from '@/lib/api';
import { antrekan } from '@/lib/antrean';
import { useAuth } from '@/hooks/useAuth';

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
  { nilai: 'minor', label: 'Minor', warna: '#059669' },
  { nilai: 'major', label: 'Major', warna: '#D97706' },
  { nilai: 'kritis', label: 'Kritis', warna: '#B91C1C' },
];

export default function LaporNcr() {
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
        <ActivityIndicator size="large" color="#003366" />
      </View>
    );
  }

  return (
    <ScrollView style={s.wadah} contentContainerStyle={s.isi} keyboardShouldPersistTaps="handled">
      <Text style={s.judulHalaman}>Lapor NCR</Text>
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
        <Text style={s.kosongIsi}>Belum ada proyek yang bisa Anda akses.</Text>
      ) : (
        <View style={s.pilihanBaris}>
          {proyek.map((p) => (
            <Pressable
              key={p.id}
              onPress={() => setProyekId(p.id)}
              style={[s.chip, proyekId === p.id && s.chipAktif]}
              accessibilityRole="button"
              accessibilityState={{ selected: proyekId === p.id }}
            >
              <Text style={[s.chipTeks, proyekId === p.id && s.chipTeksAktif]}>{p.nama}</Text>
            </Pressable>
          ))}
        </View>
      )}

      <Text style={[s.label, s.spasiAtas]}>Apa yang tidak sesuai</Text>
      <TextInput
        value={judul}
        onChangeText={setJudul}
        placeholder="mis. Selimut beton kolom kurang dari gambar"
        placeholderTextColor="#9CA3AF"
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
        placeholderTextColor="#9CA3AF"
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
        placeholderTextColor="#9CA3AF"
        style={s.input}
        accessibilityLabel="Lokasi ketidaksesuaian"
      />

      <Text style={[s.label, s.spasiAtas]}>Tingkat</Text>
      <View style={s.pilihanBaris}>
        {SEVERITY.map((sv) => {
          const aktif = severity === sv.nilai;
          return (
            <Pressable
              key={sv.nilai}
              onPress={() => setSeverity(sv.nilai)}
              style={[s.chip, aktif && { backgroundColor: sv.warna, borderColor: sv.warna }]}
              accessibilityRole="button"
              accessibilityState={{ selected: aktif }}
            >
              <Text style={[s.chipTeks, aktif && s.chipTeksAktif]}>{sv.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={[s.label, s.spasiAtas]}>Keterangan (opsional)</Text>
      <TextInput
        value={deskripsi}
        onChangeText={setDeskripsi}
        placeholder="Rincian yang membantu yang menindaklanjuti"
        placeholderTextColor="#9CA3AF"
        multiline
        style={[s.input, s.inputPanjang]}
        accessibilityLabel="Keterangan ketidaksesuaian"
      />

      <Pressable
        onPress={simpan}
        disabled={menyimpan || !proyekId || !judul.trim()}
        style={[s.simpan, (menyimpan || !proyekId || !judul.trim()) && s.simpanMati]}
        accessibilityRole="button"
      >
        <Text style={s.simpanTeks}>{menyimpan ? 'Menyimpan…' : 'Terbitkan NCR'}</Text>
      </Pressable>

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

const s = StyleSheet.create({
  wadah: { flex: 1, backgroundColor: '#F8FAFC' },
  isi: { padding: 16, paddingBottom: 40 },
  tengah: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#F8FAFC' },
  judulHalaman: { fontSize: 20, fontWeight: '700', color: '#111827', marginBottom: 6 },
  subJudul: { fontSize: 13, color: '#5A616B', lineHeight: 19, marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8 },
  bantuan: { fontSize: 12, color: '#6B7280', lineHeight: 17, marginTop: 6 },
  spasiAtas: { marginTop: 16 },
  pilihanBaris: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingVertical: 9, paddingHorizontal: 14, borderRadius: 10,
    borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#FFFFFF',
  },
  /* Yang terpilih dibedakan LATAR + border, bukan warna teks saja — WCAG
     1.4.1: informasi tak boleh disampaikan lewat warna semata. */
  chipAktif: { backgroundColor: '#003366', borderColor: '#003366' },
  chipTeks: { fontSize: 13, color: '#374151', fontWeight: '500' },
  chipTeksAktif: { color: '#FFFFFF' },
  input: {
    borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10,
    paddingVertical: 12, paddingHorizontal: 13, fontSize: 15,
    color: '#111827', backgroundColor: '#FFFFFF',
  },
  inputPanjang: { minHeight: 88, textAlignVertical: 'top' },
  simpan: {
    marginTop: 22, backgroundColor: '#003366', borderRadius: 12,
    paddingVertical: 15, alignItems: 'center',
  },
  simpanMati: { backgroundColor: '#9CA3AF' },
  simpanTeks: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  catatan: { fontSize: 12, color: '#6B7280', textAlign: 'center', marginTop: 12, lineHeight: 18 },
  galat: {
    backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA',
    borderRadius: 10, padding: 12, marginBottom: 14,
  },
  galatTeks: { fontSize: 13, color: '#991B1B', lineHeight: 19 },
  kosongJudul: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 6 },
  kosongIsi: { fontSize: 13, color: '#5A616B', lineHeight: 19, textAlign: 'center' },
});
