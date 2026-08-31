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

  useEffect(() => {
    // Load daftar proyek yang di-assign ke mandor ini dari work scopes
    api.get('/api/v1/mandor/assignments').then((res) => {
      const assignments = res.data ?? [];
      // Extract unique projects dari assignments
      const projectMap = new Map<string, Project>();
      assignments.forEach((a: any) => {
        const proj = a.projects ?? a.project;
        if (proj?.id) projectMap.set(proj.id, { id: proj.id, name: proj.name });
      });
      const projectList = Array.from(projectMap.values());
      setProjects(projectList);
      if (projectList.length > 0) setSelectedProject(projectList[0].id);
    }).finally(() => setLoadingData(false));
  }, []);

  useEffect(() => {
    if (!selectedProject) { setScopes([]); return; }
    // Load work scopes untuk proyek yang dipilih
    api.get('/api/v1/mandor/assignments').then((res) => {
      const assignments = res.data ?? [];
      const allScopes: WorkScope[] = [];
      assignments.forEach((a: any) => {
        const proj = a.projects ?? a.project;
        if (proj?.id === selectedProject && a.work_scopes) {
          a.work_scopes.forEach((s: any) => allScopes.push({ ...s, project_id: selectedProject }));
        }
      });
      setScopes(allScopes);
      setSelectedScope('');  // reset scope saat ganti proyek
    }).catch(() => setScopes([]));
  }, [selectedProject]);

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
        <ActivityIndicator size="large" color="#003366" />
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
          {projects.length === 0 ? (
            <Text style={styles.emptyText}>Belum ada proyek yang di-assign</Text>
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
            placeholderTextColor="#9CA3AF"
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
            placeholderTextColor="#9CA3AF"
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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F9FA' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8F9FA' },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  backBtn: { fontSize: 15, color: '#003366', fontWeight: '500' },
  title: { fontSize: 18, fontWeight: '700', color: '#111827' },
  container: { padding: 16, gap: 16 },
  section: { gap: 8 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151' },
  helperText: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  emptyText: { fontSize: 13, color: '#6B7280', paddingVertical: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: '#E5E7EB', marginRight: 8, backgroundColor: '#fff' },
  chipActive: { backgroundColor: '#003366', borderColor: '#003366' },
  chipText: { fontSize: 13, color: '#374151' },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  amountInput: { fontSize: 32, fontWeight: '700', color: '#003366', borderBottomWidth: 2, borderColor: '#003366', paddingVertical: 8, textAlign: 'center' },
  optionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#fff' },
  optionActive: { backgroundColor: '#003366', borderColor: '#003366' },
  optionText: { fontSize: 13, color: '#374151' },
  optionTextActive: { color: '#fff', fontWeight: '600' },
  fundRow: { flexDirection: 'row', gap: 10 },
  fundBtn: { paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#E5E7EB', alignItems: 'center' },
  fundBtnActive: { backgroundColor: '#003366', borderColor: '#003366' },
  fundBtnText: { fontSize: 13, color: '#374151', fontWeight: '500' },
  fundBtnTextActive: { color: '#fff', fontWeight: '600' },
  textarea: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, padding: 12, fontSize: 14, color: '#111827', minHeight: 80 },
});
