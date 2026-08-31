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
  AJUKAN IZIN KERJA (WORK PERMIT) — K3
  ══════════════════════════════════════════════════════════════════════════

  ── Ini GERBANG, bukan catatan

  Beda mendasar dari punch dan NCR: keduanya mencatat sesuatu yang SUDAH
  terjadi. Izin kerja menahan sesuatu yang BELUM terjadi — pekerjaan panas,
  ketinggian, ruang terbatas, galian. Orang bisa mati kalau gerbang ini
  dilewati.

  Basis menjaganya sungguh-sungguh (diukur dari `pg_constraint`, bukan
  ditebak):

      izin_pemutus_bukan_pengaju      pemutus <> pengaju
      izin_setuju_ada_pengendalian    setuju wajib pengendalian >= 10 huruf
      izin_tolak_beralasan            tolak wajib alasan >= 10 huruf
      izin_jendela_maju               berlaku_sampai > berlaku_dari

  Dan izinnya TERPISAH: `k3:permit:manage` untuk mengajukan,
  `k3:permit:decide` untuk memutuskan. Mandor memegang yang pertama saja
  (diukur lewat `get_role_permissions('mandor')`). Layar ini karena itu
  hanya bisa MENGAJUKAN — dan mengatakannya, supaya tak ada yang menunggu
  tombol setujui yang memang tak akan pernah muncul di sini.

  ── Kenapa nomor diisi sendiri, dan kenapa itu belum sepenuhnya aman

  `nomor` wajib DAN unik. Menuntut mandor mengarangnya dari HP adalah jalan
  pasti ke tabrakan. Layar ini mengusulkan nomor berikutnya dari daftar yang
  sudah ada (pola terukur di basis: WP-2026-001 … WP-2026-004).

  Tapi usulan itu dihitung di KLIEN, dan dua HP yang offline akan mengusulkan
  nomor yang sama. Yang menahan tabrakan bukan layar ini melainkan indeks
  unik di basis, yang menjawab 409 dengan pesan yang terbaca —
  "Izin kerja WP-2026-005 sudah ada". Antrean MEMPERTAHANKAN kiriman 4xx dan
  menampilkan pesannya alih-alih membuangnya, jadi nomornya bisa diperbaiki
  lalu dikirim ulang. Nomornya karena itu tetap BISA DISUNTING di sini.

  Yang benar-benar rapi adalah penomoran di server (`document_number_series`
  sudah ada di repo ini untuk dokumen lain). Menyambungkannya ke izin kerja
  mengubah kontrak rute — pekerjaan API, bukan mobile, dan bukan lingkup
  layar ini.

  ── `ajukan: true`, bukan draft

  Rute menerima `ajukan` yang menentukan status draft atau diajukan. Dari
  lapangan, draft tak ada gunanya: orang membuka layar ini justru karena
  pekerjaannya mau dimulai. Draft dibuat di portal, oleh yang menyiapkan
  dokumen.
*/

type Proyek = { id: string; nama: string };

/*
  Kesembilan nilai diambil dari CHECK `izin_kerja_jenis_check`. Nilai
  karangan ditolak basis dengan galat yang menyebut nama constraint — tak
  terbaca oleh siapa pun yang sedang berdiri di lokasi.

  Labelnya sengaja bahasa lapangan, bukan salinan nilai enum: yang mengisi
  layar ini mandor, bukan penulis skema.
*/
const JENIS = [
  { nilai: 'pekerjaan_panas', label: 'Pekerjaan panas', ket: 'Las, gerinda, api terbuka' },
  { nilai: 'ketinggian', label: 'Ketinggian', ket: 'Di atas 1,8 m' },
  { nilai: 'ruang_terbatas', label: 'Ruang terbatas', ket: 'Tangki, sumur, gorong-gorong' },
  { nilai: 'galian', label: 'Galian', ket: 'Kedalaman lebih 1,5 m' },
  { nilai: 'listrik', label: 'Listrik', ket: 'Panel bertegangan' },
  { nilai: 'pengangkatan', label: 'Pengangkatan', ket: 'Crane, hoist, beban berat' },
  { nilai: 'bahan_kimia', label: 'Bahan kimia', ket: 'B3, cairan mudah terbakar' },
  { nilai: 'radiografi', label: 'Radiografi', ket: 'Uji tak rusak bersinar' },
  { nilai: 'lainnya', label: 'Lainnya', ket: 'Di luar delapan di atas' },
];

/* `berlaku_dari`/`berlaku_sampai` timestamptz. Bawaan: mulai sekarang,
   berakhir akhir hari ini — izin kerja lazimnya berlaku satu shift. */
function jendelaBawaan() {
  const mulai = new Date();
  const selesai = new Date();
  selesai.setHours(23, 59, 0, 0);
  return { mulai: mulai.toISOString(), selesai: selesai.toISOString() };
}

function jam(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}.${String(d.getMinutes()).padStart(2, '0')}`;
}

/* Usulan nomor: WP-<tahun>-<urut+1>, dari nomor tahun berjalan yang sudah ada. */
function usulkanNomor(adaNomor: string[]) {
  const tahun = new Date().getFullYear();
  const awalan = `WP-${tahun}-`;
  const tertinggi = adaNomor
    .filter((n) => n.startsWith(awalan))
    .map((n) => parseInt(n.slice(awalan.length), 10))
    .filter((n) => Number.isFinite(n))
    .reduce((a, b) => Math.max(a, b), 0);
  return `${awalan}${String(tertinggi + 1).padStart(3, '0')}`;
}

export default function AjukanIzinKerja() {
  const { punyaIzin } = useAuth();
  const [proyek, setProyek] = useState<Proyek[]>([]);
  const [proyekId, setProyekId] = useState<string | null>(null);
  const [nomor, setNomor] = useState('');
  const [jenis, setJenis] = useState<string | null>(null);
  const [uraian, setUraian] = useState('');
  const [lokasi, setLokasi] = useState('');
  const [pengendalian, setPengendalian] = useState('');
  const [apd, setApd] = useState('');
  const [memuat, setMemuat] = useState(true);
  const [menyimpan, setMenyimpan] = useState(false);
  const [galatMuat, setGalatMuat] = useState<string | null>(null);
  const [jendela] = useState(jendelaBawaan);

  const boleh = punyaIzin('k3:permit:manage');

  useEffect(() => {
    let hidup = true;
    (async () => {
      try {
        const [rp, ri] = await Promise.all([
          api.get('/api/v1/projects'),
          api.get('/api/v1/kepatuhan/izin-kerja'),
        ]);
        if (!hidup) return;
        const daftar: Proyek[] = (rp.data?.projects ?? rp.data ?? []).map(
          (p: { id: string; name: string }) => ({ id: p.id, nama: p.name }),
        );
        setProyek(daftar);
        if (daftar.length === 1) setProyekId(daftar[0].id);
        const adaNomor: string[] = (ri.data?.izin ?? ri.data ?? [])
          .map((x: { nomor?: string }) => x.nomor)
          .filter(Boolean);
        setNomor(usulkanNomor(adaNomor));
      } catch {
        /*
          Galat MUAT terpisah dari galat SIMPAN — dua state berbeda. Dan
          nomor tetap diisi meski daftarnya gagal dimuat: lebih baik
          mengusulkan WP-<tahun>-001 yang mungkin bentrok (basis menolak
          dengan pesan terbaca) daripada kotak kosong yang tak bisa dikirim
          sama sekali.
        */
        if (hidup) {
          setGalatMuat('Gagal memuat daftar. Nomor di bawah mungkin sudah terpakai — periksa sebelum kirim.');
          setNomor(usulkanNomor([]));
        }
      } finally {
        if (hidup) setMemuat(false);
      }
    })();
    return () => { hidup = false; };
  }, []);

  const siap = !!proyekId && !!jenis && !!nomor.trim() && uraian.trim().length > 0;

  async function simpan() {
    if (!siap) return;
    setMenyimpan(true);
    try {
      await antrekan({
        jenis: 'izin-kerja',
        jalur: '/api/v1/kepatuhan/izin-kerja',
        muatan: {
          project_id: proyekId,
          nomor: nomor.trim(),
          jenis,
          uraian_pekerjaan: uraian.trim(),
          lokasi: lokasi.trim() || undefined,
          berlaku_dari: jendela.mulai,
          berlaku_sampai: jendela.selesai,
          pengendalian_risiko: pengendalian.trim() || undefined,
          apd_wajib: apd.trim() || undefined,
          ajukan: true,
        },
        ringkas: `Izin kerja ${nomor.trim()}`,
      });
      Alert.alert(
        'Terkirim untuk persetujuan',
        'Izin masuk antrean. Pekerjaan BELUM boleh dimulai sampai ada persetujuan — periksa statusnya sebelum mulai.',
        [{ text: 'Mengerti', onPress: () => router.back() }],
      );
    } catch {
      Alert.alert('Gagal menyimpan', 'Izin belum masuk antrean. Coba lagi.');
    } finally {
      setMenyimpan(false);
    }
  }

  if (!boleh) {
    return (
      <View style={s.tengah}>
        <Text style={s.kosongJudul}>Tidak ada akses</Text>
        <Text style={s.kosongIsi}>
          Mengajukan izin kerja butuh izin kelola work permit. Hubungi admin bila ini keliru.
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
      <Text style={s.judulHalaman}>Ajukan Izin Kerja</Text>

      {/*
        Peringatan di ATAS, sebelum satu medan pun diisi. Menaruhnya di bawah
        tombol berarti orang membacanya sesudah mengira pekerjaan sudah boleh
        jalan.
      */}
      <View style={s.gerbang}>
        <Text style={s.gerbangTeks}>
          Pekerjaan berbahaya tidak boleh dimulai sebelum izin ini DISETUJUI.
          Mengirim dari sini bukan persetujuan.
        </Text>
      </View>

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

      <Text style={[s.label, s.spasiAtas]}>Jenis pekerjaan</Text>
      <View style={s.jenisKisi}>
        {JENIS.map((j) => {
          const aktif = jenis === j.nilai;
          return (
            <Pressable
              key={j.nilai}
              onPress={() => setJenis(j.nilai)}
              style={[s.jenisKotak, aktif && s.jenisKotakAktif]}
              accessibilityRole="button"
              accessibilityState={{ selected: aktif }}
              accessibilityLabel={`${j.label} — ${j.ket}`}
            >
              <Text style={[s.jenisJudul, aktif && s.jenisJudulAktif]}>{j.label}</Text>
              <Text style={[s.jenisKet, aktif && s.jenisKetAktif]}>{j.ket}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={[s.label, s.spasiAtas]}>Uraian pekerjaan</Text>
      <TextInput
        value={uraian}
        onChangeText={setUraian}
        placeholder="mis. Las sambungan balok baja BJ-4 lantai 3"
        placeholderTextColor="#9CA3AF"
        multiline
        style={[s.input, s.inputPanjang]}
        accessibilityLabel="Uraian pekerjaan"
      />

      <Text style={[s.label, s.spasiAtas]}>Lokasi</Text>
      <TextInput
        value={lokasi}
        onChangeText={setLokasi}
        placeholder="mis. Lantai 3, grid B-2"
        placeholderTextColor="#9CA3AF"
        style={s.input}
        accessibilityLabel="Lokasi pekerjaan"
      />

      <Text style={[s.label, s.spasiAtas]}>Pengendalian risiko</Text>
      <TextInput
        value={pengendalian}
        onChangeText={setPengendalian}
        placeholder="mis. Alas tahan api, APAR siaga, pengawas kebakaran 30 menit sesudah selesai"
        placeholderTextColor="#9CA3AF"
        multiline
        style={[s.input, s.inputPanjang]}
        accessibilityLabel="Pengendalian risiko"
      />
      <Text style={s.bantuan}>
        Boleh dikosongkan sekarang, tapi izin TIDAK BISA disetujui tanpa ini (minimal
        10 huruf) — mengisinya sekarang mempercepat persetujuan.
      </Text>

      <Text style={[s.label, s.spasiAtas]}>APD wajib</Text>
      <TextInput
        value={apd}
        onChangeText={setApd}
        placeholder="mis. Helm, sarung tangan las, pelindung wajah, sepatu safety"
        placeholderTextColor="#9CA3AF"
        style={s.input}
        accessibilityLabel="APD wajib"
      />

      <Text style={[s.label, s.spasiAtas]}>Nomor izin</Text>
      <TextInput
        value={nomor}
        onChangeText={setNomor}
        placeholder="WP-2026-005"
        placeholderTextColor="#9CA3AF"
        autoCapitalize="characters"
        style={s.input}
        accessibilityLabel="Nomor izin kerja"
      />
      <Text style={s.bantuan}>
        Diusulkan otomatis dari nomor terakhir. Kalau ternyata sudah dipakai orang lain,
        kiriman ditolak dengan pesan yang menyebut nomornya — ubah di sini lalu kirim ulang.
      </Text>

      <Text style={[s.label, s.spasiAtas]}>Berlaku</Text>
      <View style={s.jendela}>
        <Text style={s.jendelaTeks}>
          Hari ini, {jam(jendela.mulai)} – {jam(jendela.selesai)}
        </Text>
        <Text style={s.bantuan}>
          Satu shift. Untuk jendela lain, ajukan lewat portal.
        </Text>
      </View>

      <Pressable
        onPress={simpan}
        disabled={menyimpan || !siap}
        style={[s.simpan, (menyimpan || !siap) && s.simpanMati]}
        accessibilityRole="button"
      >
        <Text style={s.simpanTeks}>
          {menyimpan ? 'Mengirim…' : 'Kirim untuk persetujuan'}
        </Text>
      </Pressable>

      {/*
        Batas yang paling penting disebutkan lagi di sini, dan alasannya
        bukan pengulangan: yang membaca sesudah menekan tombol adalah orang
        yang sudah menganggap urusannya selesai.
      */}
      <Text style={s.catatan}>
        Tersimpan di HP dulu, lalu terkirim sendiri saat ada sinyal.{'\n'}
        Yang memutuskan bukan Anda — pengaju dan pemutus wajib orang berbeda.{'\n'}
        Periksa status izin sebelum pekerjaan dimulai.
      </Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wadah: { flex: 1, backgroundColor: '#F8FAFC' },
  isi: { padding: 16, paddingBottom: 40 },
  tengah: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#F8FAFC' },
  judulHalaman: { fontSize: 20, fontWeight: '700', color: '#111827', marginBottom: 12 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8 },
  bantuan: { fontSize: 12, color: '#6B7280', lineHeight: 17, marginTop: 6 },
  spasiAtas: { marginTop: 16 },
  /* Gerbang: kuning-oranye, bukan merah. Merah dipakai untuk galat di layar
     ini; memakainya juga untuk peringatan membuat keduanya saling meredam. */
  gerbang: {
    backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A',
    borderLeftWidth: 4, borderLeftColor: '#D97706',
    borderRadius: 10, padding: 12, marginBottom: 16,
  },
  gerbangTeks: { fontSize: 13, color: '#78350F', lineHeight: 19, fontWeight: '500' },
  pilihanBaris: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingVertical: 9, paddingHorizontal: 14, borderRadius: 10,
    borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#FFFFFF',
  },
  chipAktif: { backgroundColor: '#003366', borderColor: '#003366' },
  chipTeks: { fontSize: 13, color: '#374151', fontWeight: '500' },
  chipTeksAktif: { color: '#FFFFFF' },
  /* Jenis pekerjaan pakai kotak dua-kolom, bukan chip: tiap pilihan membawa
     keterangan ("Di atas 1,8 m") yang menentukan benar-tidaknya pilihan. */
  jenisKisi: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  jenisKotak: {
    width: '48%', paddingVertical: 11, paddingHorizontal: 12, borderRadius: 10,
    borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#FFFFFF',
  },
  jenisKotakAktif: { backgroundColor: '#003366', borderColor: '#003366' },
  jenisJudul: { fontSize: 13, fontWeight: '600', color: '#111827' },
  jenisJudulAktif: { color: '#FFFFFF' },
  jenisKet: { fontSize: 12, color: '#6B7280', marginTop: 3, lineHeight: 15 },
  jenisKetAktif: { color: '#C7D7E8' },
  input: {
    borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10,
    paddingVertical: 12, paddingHorizontal: 13, fontSize: 15,
    color: '#111827', backgroundColor: '#FFFFFF',
  },
  inputPanjang: { minHeight: 78, textAlignVertical: 'top' },
  jendela: {
    borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10,
    padding: 13, backgroundColor: '#FFFFFF',
  },
  jendelaTeks: { fontSize: 15, color: '#111827', fontWeight: '600' },
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
