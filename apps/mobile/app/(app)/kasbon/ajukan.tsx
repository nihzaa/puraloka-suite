import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { api } from '@/lib/api';
import { antrekan } from '@/lib/antrean';
import { pesanGalat } from '@/lib/galat';
import { useTema } from '@/hooks/useTema';
import { FONT, HURUF, RADIUS, SENTUH_MIN, SPASI, type Palet } from '@/lib/tema';

interface Project { id: string; name: string }
interface WorkScope { id: string; scope_name: string; project_id: string; assignment?: { project?: { id: string; name: string } } }

const PURPOSES = [
  { value: 'gaji_tukang', label: 'Gaji Tukang' },
  { value: 'uang_makan', label: 'Uang Makan' },
  { value: 'pembelian_alat', label: 'Pembelian Alat' },
  { value: 'operasional', label: 'Operasional' },
  { value: 'lain_lain', label: 'Lain-lain' },
];

const FUND_SOURCES = [
  { value: 'owner_advance', label: 'Dana Owner' },
  { value: 'client_fund', label: 'Dana Klien' },
];

export default function AjukanKasbonScreen() {
  /*
    Gaya dirakit di dalam komponen — `StyleSheet.create` di lingkup
    modul berjalan sebelum satu hook pun, jadi ia tak bisa membaca
    `useTema()`. Lihat catatan panjangnya di `pekerjaan.tsx`.
  */
  const { c } = useTema();
  const styles = React.useMemo(() => gaya(c), [c]);
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [scopes, setScopes] = useState<WorkScope[]>([]);
  const [selectedScope, setSelectedScope] = useState<string>('');  // opsional
  const [amount, setAmount] = useState('');
  const [purpose, setPurpose] = useState('gaji_tukang');
  const [fundSource, setFundSource] = useState('owner_advance');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [galatMuat, setGalatMuat] = useState('');

  /*
    ══════════════════════════════════════════════════════════════════════
    LAYAR INI CRASH — dan penugasannya tak pernah terbaca
    ══════════════════════════════════════════════════════════════════════

    Diukur 2026-09-05 lewat potret:

        assignments.forEach is not a function

    `/api/v1/mandor/assignments` memulangkan `{ assignments: [...] }` —
    **18 baris**. Layar membaca `res.data ?? []`, jadi ia menyimpan OBJEK
    pembungkus ke variabel yang lalu dipanggil `.forEach()`.

    Kelas yang sama dengan dashboard, notifikasi, mandor, dan detail
    proyek: nama kunci yang meleset. Bedanya di sini ia CRASH alih-alih
    diam — dan crash itu justru lebih baik, karena terlihat.

    ⚠ Dan crash-nya tak terlihat di potret sebelum hari ini, karena layar
    tulis tak pernah ikut dipotret sama sekali.

    ── Dua permintaan jadi SATU

    Versi sebelumnya memanggil rute yang SAMA dua kali: sekali untuk
    daftar proyek, sekali untuk lingkup kerja — dan yang kedua diulang
    tiap kali proyek diganti.

    Datanya identik; yang berbeda cuma cara memilahnya. Di HP dengan
    sinyal lapangan, satu permintaan yang tak perlu berarti satu jeda yang
    tak perlu — dan mandor yang mengganti proyek tiga kali menunggu tiga
    kali.

    Sekarang: satu permintaan, hasilnya disimpan, lingkup kerja dipilah
    dari yang sudah ada.
  */
  const [penugasan, setPenugasan] = useState<any[]>([]);

  useEffect(() => {
    api
      .get('/api/v1/mandor/assignments')
      .then((res) => {
        const daftar: any[] = res.data?.assignments ?? [];
        setPenugasan(daftar);

        const petaProyek = new Map<string, Project>();
        for (const a of daftar) {
          const proj = a.project ?? a.projects;
          if (proj?.id) petaProyek.set(proj.id, { id: proj.id, name: proj.name });
        }
        const daftarProyek = Array.from(petaProyek.values());
        setProjects(daftarProyek);
        if (daftarProyek.length > 0) setSelectedProject(daftarProyek[0].id);
      })
      .catch((err: unknown) => {
        /*
          Galat tak lagi ditelan. `.finally()` sendirian membiarkan
          kegagalan jaringan tampil sebagai "Belum ada proyek yang
          di-assign" — kalimat yang terbaca seperti keadaan wajar bagi
          mandor baru, dan menghentikannya mengajukan kasbon yang sah.
        */
        setGalatMuat(pesanGalat(err, 'daftar proyek'));
      })
      .finally(() => setLoadingData(false));
  }, []);

  /*
    Lingkup kerja dipilah dari penugasan yang SUDAH dimuat — tanpa
    permintaan baru.
  */
  useEffect(() => {
    if (!selectedProject) {
      setScopes([]);
      return;
    }
    const kumpul: WorkScope[] = [];
    for (const a of penugasan) {
      const proj = a.project ?? a.projects;
      if (proj?.id === selectedProject && Array.isArray(a.work_scopes)) {
        for (const sc of a.work_scopes) kumpul.push({ ...sc, project_id: selectedProject });
      }
    }
    setScopes(kumpul);
    setSelectedScope(''); // reset lingkup saat ganti proyek
  }, [selectedProject, penugasan]);

  const handleSubmit = async () => {
    const amt = parseFloat(amount.replace(/\D/g, ''));
    if (!selectedProject) { Alert.alert('Pilih proyek terlebih dahulu'); return; }
    if (isNaN(amt) || amt <= 0) { Alert.alert('Masukkan jumlah kasbon yang valid'); return; }

    setLoading(true);

    // Disusun DI LUAR `try` supaya `catch` bisa mengantrekannya. Di dalam
    // `try`, `const` tak terlihat dari blok catch — ditangkap tsc, bukan review.
    const body: Record<string, any> = {
      project_id: selectedProject,
      amount: amt,
      purpose,
      fund_source: fundSource,
      notes: notes.trim() || undefined,
    };
    // Scope opsional — hanya kirim jika dipilih
    if (selectedScope) body.work_scope_id = selectedScope;

    try {
      await api.post('/api/v1/kasbons', body);
      Alert.alert('Berhasil', 'Pengajuan kasbon telah dikirim, menunggu persetujuan.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err: any) {
      /*
        TAK ADA BALASAN = tak ada sinyal, BUKAN pengajuan yang ditolak.

        Sebelumnya keduanya jatuh ke satu `Alert('Gagal')` dan pengajuannya
        HILANG — mandor di proyek tanpa sinyal tak bisa mengajukan kasbon sama
        sekali. Sekarang ia diantrekan dan dikirim sendiri begitu sinyal
        kembali, membawa kunci idempotensi supaya kiriman ulang yang timeout
        tak menjadi DUA kasbon.

        Galat ber-STATUS tetap ditampilkan apa adanya: server menjawab, jadi
        isinyalah yang bermasalah, dan mengantrekannya hanya akan gagal terus.
      */
      if (!err?.response) {
        await antrekan({
          jenis: 'kasbon',
          jalur: '/api/v1/kasbons',
          muatan: body,
          ringkas: `Kasbon ${new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amt)}`,
        });
        Alert.alert(
          'Disimpan — menunggu sinyal',
          'Tidak ada koneksi saat ini. Pengajuan Anda sudah disimpan di HP dan akan dikirim otomatis begitu sinyal kembali.',
          [{ text: 'OK', onPress: () => router.back() }],
        );
      } else {
        Alert.alert('Gagal', err?.response?.data?.error ?? 'Terjadi kesalahan');
      }
    } finally {
      setLoading(false);
    }
  };

  if (loadingData) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={c.navy} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button">
          <Text style={styles.backBtn}>← Kembali</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Ajukan Kasbon</Text>
      </View>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

        {/* Proyek — wajib */}
        <Card>
          <Text style={styles.label}>Proyek *</Text>
          {/*
            GAGAL MUAT dan KOSONG dipisah — disiplin yang sama dengan
            `uji-galat-muat-terpisah.mjs` di apps/web.

            "Belum ada proyek yang di-assign" pada layar yang sebenarnya
            GAGAL MEMUAT adalah kebohongan yang tenang: mandor
            menyimpulkan ia memang belum ditugaskan, lalu berhenti — dan
            kasbon yang sah tak pernah diajukan.
          */}
          {galatMuat ? (
            <Text style={styles.galatTeks}>{galatMuat}</Text>
          ) : projects.length === 0 ? (
            <Text style={styles.emptyText}>
              Belum ada proyek yang di-assign kepada Anda. Hubungi admin —
              kasbon hanya bisa diajukan atas proyek tempat Anda bertugas.
            </Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
              {projects.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.chip, selectedProject === p.id && styles.chipActive]}
                  onPress={() => setSelectedProject(p.id)}
                  accessibilityRole="button"
                >
                  <Text style={[styles.chipText, selectedProject === p.id && styles.chipTextActive]}>{p.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </Card>

        {/* Scope — opsional */}
        {scopes.length > 0 && (
          <Card style={styles.section}>
            <Text style={styles.label}>Scope Pekerjaan (opsional)</Text>
            <Text style={styles.helperText}>Bisa dikosongkan untuk kasbon umum proyek</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
              <TouchableOpacity
                style={[styles.chip, selectedScope === '' && styles.chipActive]}
                onPress={() => setSelectedScope('')}
                accessibilityRole="button"
              >
                <Text style={[styles.chipText, selectedScope === '' && styles.chipTextActive]}>— Tanpa Scope</Text>
              </TouchableOpacity>
              {scopes.map((s) => (
                <TouchableOpacity
                  key={s.id}
                  style={[styles.chip, selectedScope === s.id && styles.chipActive]}
                  onPress={() => setSelectedScope(s.id)}
                  accessibilityRole="button"
                >
                  <Text style={[styles.chipText, selectedScope === s.id && styles.chipTextActive]}>{s.scope_name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Card>
        )}

        {/* Jumlah */}
        <Card style={styles.section}>
          <Text style={styles.label}>Jumlah (Rp)</Text>
          <TextInput
            style={styles.amountInput}
            value={amount}
            onChangeText={setAmount}
            keyboardType="number-pad"
            placeholder="0"
            placeholderTextColor={c.textMuted}
          />
        </Card>

        {/* Tujuan */}
        <Card style={styles.section}>
          <Text style={styles.label}>Tujuan</Text>
          <View style={styles.optionGrid}>
            {PURPOSES.map((p) => (
              <TouchableOpacity
                key={p.value}
                style={[styles.option, purpose === p.value && styles.optionActive]}
                onPress={() => setPurpose(p.value)}
                accessibilityRole="button"
              >
                <Text style={[styles.optionText, purpose === p.value && styles.optionTextActive]}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>

        {/* Sumber Dana */}
        <Card style={styles.section}>
          <Text style={styles.label}>Sumber Dana</Text>
          <View style={styles.fundRow}>
            {FUND_SOURCES.map((f) => (
              <TouchableOpacity
                key={f.value}
                style={[styles.fundBtn, fundSource === f.value && styles.fundBtnActive, { flex: 1 }]}
                onPress={() => setFundSource(f.value)}
                accessibilityRole="button"
              >
                <Text style={[styles.fundBtnText, fundSource === f.value && styles.fundBtnTextActive]}>{f.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>

        {/* Catatan */}
        <Card style={styles.section}>
          <Text style={styles.label}>Catatan (opsional)</Text>
          <TextInput
            style={styles.textarea}
            value={notes}
            onChangeText={setNotes}
            placeholder="Keterangan tambahan..."
            placeholderTextColor={c.textMuted}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
        </Card>

        <Button title="Kirim Pengajuan" onPress={handleSubmit} loading={loading} />
      </ScrollView>
    </SafeAreaView>
  );
}

function gaya(c: Palet) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.surfaceSubtle },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surfaceSubtle },
    topBar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
    backBtn: { fontSize: 15, color: c.navy, fontFamily: FONT.isiTebal },
    title: { fontSize: 18, fontFamily: FONT.judul, color: c.textPrimary },
    container: { padding: 16, gap: 16 },
    section: { gap: 8 },
    label: { fontSize: 13, fontFamily: FONT.isiTebal, color: c.textPrimary },
    helperText: { fontSize: 12, color: c.textSecondary, marginTop: 2 },
    emptyText: { fontSize: 13, color: c.textSecondary, paddingVertical: 8 },
    galatTeks: {
      fontSize: 13, fontFamily: FONT.isi, color: c.danger,
      paddingVertical: 8, lineHeight: 19,
    },
    chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: c.border, marginRight: 8, backgroundColor: c.surfaceRaised },
    chipActive: { backgroundColor: c.navy, borderColor: c.navy },
    chipText: { fontSize: 13, color: c.textPrimary },
    chipTextActive: { color: c.surfaceRaised, fontFamily: FONT.isiTebal },
    amountInput: { fontSize: 32, fontFamily: FONT.judul, color: c.navy, borderBottomWidth: 2, borderColor: c.navy, paddingVertical: 8, textAlign: 'center' },
    optionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    option: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceRaised },
    optionActive: { backgroundColor: c.navy, borderColor: c.navy },
    optionText: { fontSize: 13, color: c.textPrimary },
    optionTextActive: { color: c.surfaceRaised, fontFamily: FONT.isiTebal },
    fundRow: { flexDirection: 'row', gap: 10 },
    fundBtn: { paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: c.border, alignItems: 'center' },
    fundBtnActive: { backgroundColor: c.navy, borderColor: c.navy },
    fundBtnText: { fontSize: 13, color: c.textPrimary, fontFamily: FONT.isiTebal },
    fundBtnTextActive: { color: c.surfaceRaised, fontFamily: FONT.isiTebal },
    textarea: { borderWidth: 1, borderColor: c.border, borderRadius: 10, padding: 12, fontSize: 14, color: c.textPrimary, minHeight: 80 },
  });
}
