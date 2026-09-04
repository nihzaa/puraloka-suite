import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TextInput, ActivityIndicator, Alert, StyleSheet,
} from 'react-native';
import { Tekan } from '@/components/ui/Tekan';
import { router } from 'expo-router';
import { api } from '@/lib/api';
import { antrekan } from '@/lib/antrean';
import { useAuth } from '@/hooks/useAuth';
import { useTema } from '@/hooks/useTema';
import { FONT, HURUF, RADIUS, SENTUH_MIN, SPASI, type Palet } from '@/lib/tema';

/*
  ══════════════════════════════════════════════════════════════════════════
  LAPOR TEMUAN (PUNCH LIST) — layar lapangan
  ══════════════════════════════════════════════════════════════════════════

  Diukur 2026-08-31, tabel lapangan yang BELUM punya layar mobile:

      punch_items    40 baris   <- terbanyak
      ncr_items      19
      izin_kerja      4
      daily_wage_logs 2

  Temuan cacat ditemukan orang yang sedang BERDIRI di depannya. Menuntutnya
  mengingat lalu mengetik ulang di kantor adalah cara paling umum sebuah
  temuan menguap — dan yang menguap bukan catatan, melainkan pekerjaan
  perbaikan yang tak pernah terjadi.

  ── Nilai severity diambil dari basis, bukan dikarang

  `punch_severity` adalah enum PostgreSQL: ringan · sedang · berat · kritis.
  Diukur lewat `pg_enum`, bukan ditebak dari nama. Nilai karangan akan
  ditolak basis dengan galat yang menyebut nama constraint — tak terbaca oleh
  mandor di lapangan.

  ── Kenapa TANPA foto, dan itu disebutkan di layar

  Foto punch dikaitkan lewat rute TERPISAH (`POST /punch-items/:id/photos`)
  yang menuntut `photo_id` dari unggahan yang sudah selesai. Itu dua langkah
  berurutan, dan antrean offline hanya menangani satu tembakan per kiriman:
  langkah kedua butuh `id` yang baru ada setelah langkah pertama sampai
  server.

  Menyambungkannya butuh antrean yang bisa merantai kiriman — pekerjaan
  tersendiri. Sampai itu ada, layar ini menyebutkan batasnya kepada
  penggunanya alih-alih diam: mandor yang mengira fotonya terkirim akan
  berhenti memotret dengan cara lain.

  ── Offline-first

  Sama dengan absensi dan progres: lewat `lib/antrean` dengan kunci
  idempotensi, bukan `api.post` langsung. Sinyal buruk di proyek adalah
  keadaan normal.
*/

type Proyek = { id: string; nama: string };

const SEVERITY = [
  { nilai: 'ringan', label: 'Ringan', warna: '#059669' },
  { nilai: 'sedang', label: 'Sedang', warna: '#D97706' },
  { nilai: 'berat', label: 'Berat', warna: '#DC2626' },
  { nilai: 'kritis', label: 'Kritis', warna: '#7F1D1D' },
];

export default function LaporTemuan() {
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
  const [deskripsi, setDeskripsi] = useState('');
  const [lokasi, setLokasi] = useState('');
  const [severity, setSeverity] = useState('sedang');
  const [memuat, setMemuat] = useState(true);
  const [menyimpan, setMenyimpan] = useState(false);
  const [galatMuat, setGalatMuat] = useState<string | null>(null);

  const boleh = punyaIzin('punch:manage');

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
      Alert.alert('Pilih proyek', 'Temuan dicatat pada satu proyek.');
      return;
    }
    const j = judul.trim();
    if (!j) {
      Alert.alert('Judul wajib diisi', 'Tulis singkat apa yang ditemukan.');
      return;
    }

    setMenyimpan(true);
    try {
      await antrekan({
        jenis: 'punch',
        jalur: `/api/v1/projects/${proyekId}/punch-items`,
        muatan: {
          judul: j,
          deskripsi: deskripsi.trim() || undefined,
          lokasi: lokasi.trim() || undefined,
          severity,
        },
        ringkas: `Temuan: ${j.slice(0, 40)}`,
      });
      Alert.alert(
        'Tersimpan',
        'Temuan masuk antrean kirim. Kalau sinyal ada, ia terkirim sekarang; kalau tidak, otomatis dicoba lagi.',
        [{ text: 'Selesai', onPress: () => router.back() }],
      );
    } catch {
      Alert.alert('Gagal menyimpan', 'Temuan belum masuk antrean. Coba lagi.');
    } finally {
      setMenyimpan(false);
    }
  }

  if (!boleh) {
    return (
      <View style={s.tengah}>
        <Text style={s.kosongJudul}>Tidak ada akses</Text>
        <Text style={s.kosongIsi}>
          Melaporkan temuan butuh izin kelola punch list. Hubungi admin bila ini keliru.
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
      <Text style={s.judulHalaman}>Lapor Temuan</Text>

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

      <Text style={[s.label, s.spasiAtas]}>Apa yang ditemukan</Text>
      <TextInput
        value={judul}
        onChangeText={setJudul}
        placeholder="mis. Retak rambut di kolom K3 lantai 2"
        placeholderTextColor={c.textMuted}
        style={s.input}
        accessibilityLabel="Judul temuan"
      />

      <Text style={[s.label, s.spasiAtas]}>Lokasi</Text>
      <TextInput
        value={lokasi}
        onChangeText={setLokasi}
        placeholder="mis. Lantai 2, grid C-4"
        placeholderTextColor={c.textMuted}
        style={s.input}
        accessibilityLabel="Lokasi temuan"
      />

      <Text style={[s.label, s.spasiAtas]}>Tingkat</Text>
      <View style={s.pilihanBaris}>
        {SEVERITY.map((sv) => {
          const aktif = severity === sv.nilai;
          return (
            <Tekan
              key={sv.nilai}
              onPress={() => setSeverity(sv.nilai)}
              style={[s.chip, aktif && { backgroundColor: sv.warna, borderColor: sv.warna }]}
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
        placeholder="Rincian yang membantu yang memperbaiki"
        placeholderTextColor={c.textMuted}
        multiline
        style={[s.input, s.inputPanjang]}
        accessibilityLabel="Keterangan temuan"
      />

      <Tekan
        onPress={simpan}
        disabled={menyimpan || !proyekId || !judul.trim()}
        style={[s.simpan, (menyimpan || !proyekId || !judul.trim()) && s.simpanMati]}
        accessibilityRole="button"
      >
        <Text style={s.simpanTeks}>{menyimpan ? 'Menyimpan…' : 'Simpan temuan'}</Text>
      </Tekan>

      {/*
        Batasnya DISEBUTKAN, bukan didiamkan. Mandor yang mengira fotonya
        ikut terkirim akan berhenti memotret dengan cara lain — dan temuan
        tanpa gambar jauh lebih sulit ditindaklanjuti.
      */}
      <Text style={s.catatan}>
        Tersimpan di HP dulu, lalu terkirim sendiri saat ada sinyal.{'\n'}
        Foto belum bisa dilampirkan dari sini — tambahkan lewat portal setelah temuan terkirim.
      </Text>
    </ScrollView>
  );
}

function gaya(c: Palet) {
  return StyleSheet.create({
    wadah: { flex: 1, backgroundColor: c.surfaceSubtle },
    isi: { padding: 16, paddingBottom: 40 },
    tengah: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: c.surfaceSubtle },
    judulHalaman: { fontSize: 20, fontFamily: FONT.judul, color: c.textPrimary, marginBottom: 14 },
    label: { fontSize: 13, fontFamily: FONT.isiTebal, color: c.textPrimary, marginBottom: 8 },
    spasiAtas: { marginTop: 16 },
    pilihanBaris: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
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
