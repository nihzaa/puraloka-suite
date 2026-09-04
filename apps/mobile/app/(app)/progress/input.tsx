import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
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
import { useTema } from '@/hooks/useTema';
import { FONT, HURUF, RADIUS, SENTUH_MIN, SPASI, type Palet } from '@/lib/tema';

interface Project { id: string; name: string }
interface RabItem { id: string; no_urut: string; uraian: string; progress_pct: number; weight_pct: number }

/*
  Saklar satu tempat, supaya menyalakannya kembali cukup satu baris begitu
  rute unggahnya ada — bukan mencari-cari `false` di tengah JSX.
*/
const FOTO_AKTIF = false;

export default function InputProgressScreen() {
  /*
    Gaya dirakit di dalam komponen — `StyleSheet.create` di lingkup
    modul berjalan sebelum satu hook pun, jadi ia tak bisa membaca
    `useTema()`. Lihat catatan panjangnya di `pekerjaan.tsx`.
  */
  const { c } = useTema();
  const styles = React.useMemo(() => gaya(c), [c]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [mode, setMode] = useState<'daily' | 'detail'>('daily');

  // daily mode
  const [progress, setProgress] = useState('');
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);

  // detail mode
  const [rabItems, setRabItems] = useState<RabItem[]>([]);
  const [loadingRab, setLoadingRab] = useState(false);
  const [selectedRabItem, setSelectedRabItem] = useState<string>('');
  const [pctCompletion, setPctCompletion] = useState('');

  const [loading, setLoading] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(true);

  useEffect(() => {
    api.get('/api/v1/projects').then((res) => {
      const active = (res.data?.projects ?? []).filter((p: any) => p.status === 'active');
      setProjects(active);
      if (active.length > 0) setSelectedProject(active[0].id);
    }).finally(() => setLoadingProjects(false));
  }, []);

  useEffect(() => {
    if (mode === 'detail' && selectedProject) {
      setLoadingRab(true);
      setSelectedRabItem('');
      api.get(`/api/v1/projects/${selectedProject}/rab/items`)
        .then(res => {
          const items = res.data?.items ?? [];
          setRabItems(items);
          if (items.length > 0) setSelectedRabItem(items[0].id);
        })
        .catch(() => setRabItems([]))
        .finally(() => setLoadingRab(false));
    }
  }, [mode, selectedProject]);

  const pickPhoto = async () => {
    if (photos.length >= 5) { Alert.alert('Maksimal 5 foto per log'); return; }
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Izin diperlukan', 'Aktifkan izin galeri di pengaturan.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      allowsMultipleSelection: false,
    });
    if (!result.canceled && result.assets[0]) setPhotos(prev => [...prev, result.assets[0].uri]);
  };

  const takePhoto = async () => {
    if (photos.length >= 5) { Alert.alert('Maksimal 5 foto per log'); return; }
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Izin diperlukan', 'Aktifkan izin kamera di pengaturan.'); return; }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!result.canceled && result.assets[0]) setPhotos(prev => [...prev, result.assets[0].uri]);
  };

  const handleSubmit = async () => {
    if (!selectedProject) { Alert.alert('Pilih proyek terlebih dahulu'); return; }

    setLoading(true);
    try {
      if (mode === 'daily') {
        const pct = parseFloat(progress);
        if (isNaN(pct) || pct < 0 || pct > 100) { Alert.alert('Progress harus antara 0–100'); setLoading(false); return; }
        const formData = new FormData();
        formData.append('mode', 'daily');
        formData.append('log_date', new Date().toISOString().split('T')[0]);
        formData.append('pct_overall', String(pct));
        if (notes.trim()) formData.append('notes', notes.trim());
        photos.forEach((uri, i) => {
          const ext = uri.split('.').pop() ?? 'jpg';
          formData.append('photos', {
            uri: Platform.OS === 'ios' ? uri.replace('file://', '') : uri,
            name: `photo_${i}.${ext}`,
            type: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
          } as any);
        });
        await api.post(`/api/v1/projects/${selectedProject}/progress-logs`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        Alert.alert('Berhasil', 'Progress harian berhasil disimpan!');
        setProgress(''); setNotes(''); setPhotos([]);
      } else {
        // detail mode
        const pct = parseFloat(pctCompletion);
        if (!selectedRabItem) { Alert.alert('Pilih item pekerjaan terlebih dahulu'); setLoading(false); return; }
        if (isNaN(pct) || pct < 0 || pct > 100) { Alert.alert('% selesai harus antara 0–100'); setLoading(false); return; }
        const res = await api.post(`/api/v1/projects/${selectedProject}/progress-logs`, {
          mode: 'detail',
          log_date: new Date().toISOString().split('T')[0],
          rab_item_id: selectedRabItem,
          pct_completion: pct,
        });
        const newPct = res.data?.new_overall_pct;
        Alert.alert('Berhasil', newPct != null
          ? `Progress item diperbarui ke ${pct}%.\nProgress proyek sekarang: ${Number(newPct).toFixed(1)}%`
          : 'Progress item berhasil disimpan!',
        );
        setPctCompletion('');
      }
    } catch (err: any) {
      /*
        ══════════════════════════════════════════════════════════════════
        TAK ADA SINYAL ≠ KIRIMAN DITOLAK
        ══════════════════════════════════════════════════════════════════

        Inilah layar yang paling butuh antrean: mandor MENGISI progres justru
        saat berada di proyek, dan proyek adalah tempat sinyalnya paling
        buruk. Sebelumnya kegagalan jaringan berarti pekerjaan sehari itu
        tak tercatat sama sekali.

        Fotonya DISALIN ke folder aplikasi saat diantrekan (lihat
        `lib/antrean.ts`) — URI dari kamera menunjuk direktori cache, dan
        Android boleh mengosongkannya kapan saja. Menyimpan URI-nya saja akan
        menghasilkan antrean yang fotonya lenyap saat sinyal kembali.

        Formulir dikosongkan SESUDAH diantrekan, sama seperti sesudah berhasil
        kirim: bagi mandor keduanya berarti "sudah tercatat". Membiarkan
        formulir terisi akan mengundang ia mengisi ulang, dan itu menghasilkan
        dua kiriman dengan kunci idempotensi BERBEDA — yang tak bisa ditahan
        gerbang mana pun.
      */
      if (!err?.response) {
        const tanggal = new Date().toISOString().split('T')[0];
        if (mode === 'daily') {
          await antrekan({
            jenis: 'progres-harian',
            jalur: `/api/v1/projects/${selectedProject}/progress-logs`,
            muatan: {
              mode: 'daily',
              log_date: tanggal,
              pct_overall: parseFloat(progress),
              ...(notes.trim() ? { notes: notes.trim() } : {}),
            },
            fotoUri: photos,
            ringkas: `Progres harian ${progress}%${photos.length ? ` · ${photos.length} foto` : ''}`,
          });
          setProgress(''); setNotes(''); setPhotos([]);
        } else {
          await antrekan({
            jenis: 'progres-detail',
            jalur: `/api/v1/projects/${selectedProject}/progress-logs`,
            muatan: {
              mode: 'detail',
              log_date: tanggal,
              rab_item_id: selectedRabItem,
              pct_completion: parseFloat(pctCompletion),
            },
            ringkas: `Item pekerjaan ${pctCompletion}%`,
          });
          setPctCompletion('');
        }
        Alert.alert(
          'Disimpan — menunggu sinyal',
          'Tidak ada koneksi saat ini. Catatan Anda sudah disimpan di HP (termasuk fotonya) dan akan dikirim otomatis begitu sinyal kembali.',
        );
      } else {
        Alert.alert('Gagal', err?.response?.data?.error ?? 'Terjadi kesalahan');
      }
    } finally {
      setLoading(false);
    }
  };

  if (loadingProjects) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={c.navy} />
      </SafeAreaView>
    );
  }

  const selectedItem = rabItems.find(r => r.id === selectedRabItem);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Input Progress</Text>
      </View>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

        {/* Proyek */}
        <Card>
          <Text style={styles.label}>Proyek</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
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
        </Card>

        {/* Mode toggle */}
        <Card style={styles.section}>
          <Text style={styles.label}>Mode Input</Text>
          <View style={styles.modeRow}>
            <TouchableOpacity
              style={[styles.modeBtn, mode === 'daily' && styles.modeBtnActive]}
              onPress={() => setMode('daily')}
              accessibilityRole="button"
            >
              <Text style={[styles.modeBtnText, mode === 'daily' && styles.modeBtnTextActive]}>📋 Harian Umum</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeBtn, mode === 'detail' && styles.modeBtnActive]}
              onPress={() => setMode('detail')}
              accessibilityRole="button"
            >
              <Text style={[styles.modeBtnText, mode === 'detail' && styles.modeBtnTextActive]}>📊 Per Item RAB</Text>
            </TouchableOpacity>
          </View>
          {mode === 'daily' && (
            <Text style={styles.modeDesc}>Log harian: cuaca, pekerja, foto. Progress keseluruhan opsional.</Text>
          )}
          {mode === 'detail' && (
            <Text style={styles.modeDesc}>Per item RAB: pilih item → isi % selesai → otomatis update progress proyek.</Text>
          )}
        </Card>

        {/* Daily mode fields */}
        {mode === 'daily' && (
          <>
            <Card style={styles.section}>
              <Text style={styles.label}>Progress Fisik Keseluruhan (%) — opsional</Text>
              <View style={styles.progressInput}>
                <TextInput
                  style={styles.bigInput}
                  value={progress}
                  onChangeText={setProgress}
                  keyboardType="decimal-pad"
                  placeholder="—"
                  placeholderTextColor={c.textMuted}
                  maxLength={5}
                />
                <Text style={styles.pctSymbol}>%</Text>
              </View>
            </Card>
            <Card style={styles.section}>
              <Text style={styles.label}>Catatan (opsional)</Text>
              <TextInput
                style={styles.textarea}
                value={notes}
                onChangeText={setNotes}
                placeholder="Deskripsi pekerjaan hari ini..."
                placeholderTextColor={c.textMuted}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            </Card>
            <Card style={styles.section}>
              <Text style={styles.label}>Foto Dokumentasi ({photos.length}/5)</Text>
              <View style={styles.photoRow}>
                {photos.map((uri, i) => (
                  <TouchableOpacity key={i} onPress={() => setPhotos(prev => prev.filter((_, idx) => idx !== i))} style={styles.photoThumb} accessibilityRole="button">
                    <Image source={{ uri }} style={styles.thumbImg} />
                    <View style={styles.removeX}><Text style={styles.removeXText}>✕</Text></View>
                  </TouchableOpacity>
                ))}
                {/*
                  ⚠ FOTO BELUM SAMPAI KE SERVER — diukur 2026-09-01.

                  Antrean mengirim foto sebagai multipart (`FormData`,
                  field `photos`), sementara rute progres membaca
                  `body.photos` sebagai array JSON berisi `{ url }`. Dua
                  bentuk yang tak cocok.

                  Diuji ke API produksi:

                      JSON tanpa foto  -> 201  tersimpan
                      multipart+foto   -> 500  Internal Server Error

                  Dan `@fastify/multipart` TERDAFTAR di index.ts tetapi NOL
                  rute memakainya — plugin terpasang yang tak pernah dipakai,
                  pola yang sama dengan `expo-secure-store` dulu. Itu yang
                  membuat 500-nya: plugin mem-parsing multipart, lalu
                  `body.photos` berisi objek berkas alih-alih array URL.

                  `project_photos` 36 baris, NOL dalam 30 hari terakhir.

                  Perbaikannya di API (rute unggah yang memulangkan `url`,
                  atau `file_base64` seperti `/mandor/kasbon-photo/upload`) —
                  di luar lingkup sesi ini, dan sudah dilaporkan.

                  Sampai itu ada, tombolnya DIMATIKAN alih-alih membiarkan
                  mandor memotret lalu kirimannya tertahan di antrean dengan
                  "500" yang tak ia mengerti. Yang dimatikan dengan sebab
                  tertulis lebih jujur daripada yang gagal diam-diam.
                */}
                {FOTO_AKTIF && photos.length < 5 && (
                  <>
                    <TouchableOpacity style={styles.addPhoto} onPress={takePhoto} accessibilityRole="button">
                      <Text style={styles.addPhotoIcon}>📷</Text>
                      <Text style={styles.addPhotoText}>Kamera</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.addPhoto} onPress={pickPhoto} accessibilityRole="button">
                      <Text style={styles.addPhotoIcon}>🖼️</Text>
                      <Text style={styles.addPhotoText}>Galeri</Text>
                    </TouchableOpacity>
                  </>
                )}
                {!FOTO_AKTIF && (
                  <Text style={styles.fotoMati}>
                    Foto belum bisa dikirim dari aplikasi — sedang diperbaiki.
                    Laporan tanpa foto tetap terkirim seperti biasa.
                  </Text>
                )}
              </View>
            </Card>
          </>
        )}

        {/* Detail mode fields */}
        {mode === 'detail' && (
          <>
            <Card style={styles.section}>
              <Text style={styles.label}>Item Pekerjaan (RAB)</Text>
              {loadingRab ? (
                <ActivityIndicator size="small" color="#003366" style={{ marginTop: 8 }} />
              ) : rabItems.length === 0 ? (
                <Text style={styles.emptyText}>Belum ada RAB untuk proyek ini</Text>
              ) : (
                <ScrollView style={styles.rabList} nestedScrollEnabled>
                  {rabItems.map(item => (
                    <TouchableOpacity
                      key={item.id}
                      style={[styles.rabItem, selectedRabItem === item.id && styles.rabItemActive]}
                      onPress={() => setSelectedRabItem(item.id)}
                      accessibilityRole="button"
                    >
                      <View style={styles.rabItemRow}>
                        <Text style={[styles.rabItemNo, selectedRabItem === item.id && styles.rabItemTextActive]}>
                          {item.no_urut}
                        </Text>
                        <Text style={[styles.rabItemName, selectedRabItem === item.id && styles.rabItemTextActive]} numberOfLines={2}>
                          {item.uraian}
                        </Text>
                        <Text style={[styles.rabItemPct, selectedRabItem === item.id && styles.rabItemTextActive]}>
                          {item.progress_pct ?? 0}%
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </Card>

            {selectedItem && (
              <Card style={styles.section}>
                <Text style={styles.label}>% Selesai untuk "{selectedItem.uraian}"</Text>
                <View style={styles.progressInput}>
                  <TextInput
                    style={styles.bigInput}
                    value={pctCompletion}
                    onChangeText={setPctCompletion}
                    keyboardType="decimal-pad"
                    placeholder={String(selectedItem.progress_pct ?? 0)}
                    placeholderTextColor={c.textMuted}
                    maxLength={5}
                  />
                  <Text style={styles.pctSymbol}>%</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoText}>Bobot item ini: {selectedItem.weight_pct?.toFixed(1) ?? '—'}% dari proyek</Text>
                  <Text style={styles.infoText}>Progress saat ini: {selectedItem.progress_pct ?? 0}%</Text>
                </View>
              </Card>
            )}
          </>
        )}

        <Button title="Simpan Progress" onPress={handleSubmit} loading={loading} />
      </ScrollView>
    </SafeAreaView>
  );
}

function gaya(c: Palet) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.surfaceSubtle },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surfaceSubtle },
    header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
    title: { fontSize: 22, fontFamily: FONT.judul, color: c.textPrimary },
    container: { padding: 16, gap: 16 },
    section: { gap: 10 },
    label: { fontSize: 13, fontFamily: FONT.isiTebal, color: c.textPrimary, marginBottom: 4 },
    chipRow: { flexDirection: 'row', marginTop: 4 },
    chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: c.border, marginRight: 8, backgroundColor: c.surfaceRaised },
    chipActive: { backgroundColor: c.navy, borderColor: c.navy },
    chipText: { fontSize: 13, color: c.textPrimary },
    chipTextActive: { color: c.surfaceRaised, fontFamily: FONT.isiTebal },
    modeRow: { flexDirection: 'row', gap: 10 },
    modeBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: c.border, alignItems: 'center', backgroundColor: c.surfaceRaised },
    modeBtnActive: { backgroundColor: c.navy, borderColor: c.navy },
    modeBtnText: { fontSize: 13, color: c.textPrimary, fontFamily: FONT.isiTebal },
    modeBtnTextActive: { color: c.surfaceRaised, fontFamily: FONT.isiTebal },
    modeDesc: { fontSize: 12, color: c.textSecondary, marginTop: 6, lineHeight: 18 },
    progressInput: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    bigInput: { flex: 1, fontSize: 42, fontFamily: FONT.judul, color: c.navy, borderBottomWidth: 2, borderColor: c.navy, paddingVertical: 8, textAlign: 'center' },
    pctSymbol: { fontSize: 28, fontFamily: FONT.judul, color: c.navy },
    textarea: { borderWidth: 1, borderColor: c.border, borderRadius: 10, padding: 12, fontSize: 14, color: c.textPrimary, minHeight: 100 },
    photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
    photoThumb: { width: 72, height: 72, borderRadius: 8, position: 'relative' },
    thumbImg: { width: 72, height: 72, borderRadius: 8 },
    removeX: { position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 10, backgroundColor: c.danger, alignItems: 'center', justifyContent: 'center' },
    removeXText: { color: c.surfaceRaised, fontSize: 10, fontFamily: FONT.judul },
    addPhoto: { width: 72, height: 72, borderRadius: 8, borderWidth: 1.5, borderColor: c.border, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 4 },
    addPhotoIcon: { fontSize: 20 },
    /* 10 -> 12px. "Kamera"/"Galeri" adalah TEKS, bukan simbol seperti ✕ dan
       ▶ yang boleh kecil. Muat dihitung, bukan ditaksir: kotak 72x72, ikon
       20px + gap 4 + teks = tinggi isi ~40px dari 72 tersedia; "Kamera" pada
       12px sekitar 43px lebar. Tak ada yang bergeser. */
    addPhotoText: { fontSize: 12, color: c.textSecondary },
    /* Cokelat-oranye, bukan merah: ini keadaan sementara yang diketahui, bukan
       galat yang baru terjadi. Merah membuat mandor mengira laporannya gagal. */
    fotoMati: { fontSize: 12, color: '#92400E', lineHeight: 17, flex: 1 },
    rabList: { maxHeight: 280, marginTop: 4 },
    rabItem: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: c.border, marginBottom: 6, backgroundColor: c.surfaceRaised },
    rabItemActive: { backgroundColor: c.navy, borderColor: c.navy },
    rabItemRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    rabItemNo: { fontSize: 12, color: c.textSecondary, width: 36, flexShrink: 0 },
    rabItemName: { flex: 1, fontSize: 13, color: c.textPrimary, fontFamily: FONT.isiTebal },
    rabItemPct: { fontSize: 12, color: c.navy, fontFamily: FONT.judul, flexShrink: 0 },
    rabItemTextActive: { color: c.surfaceRaised },
    emptyText: { fontSize: 13, color: c.textSecondary, textAlign: 'center', paddingVertical: 16 },
    infoRow: { flexDirection: 'column', gap: 2, marginTop: 4 },
    infoText: { fontSize: 12, color: c.textSecondary },
  });
}
