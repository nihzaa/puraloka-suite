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
import { KepalaLayar } from '@/components/ui/KepalaLayar';
import { Card } from '@/components/ui/Card';
import { api } from '@/lib/api';
import { antrekan } from '@/lib/antrean';
import { ambilKoordinat } from '@/lib/lokasi';
import * as FileSystem from 'expo-file-system';
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
  /*
    Galat MUAT terpisah dari galat SIMPAN — pola yang sama dengan
    `punch/lapor.tsx`. Berbagi satu state membuat gagal-simpan menghapus
    pesan gagal-muat; cacat yang sudah ditemukan di 11 halaman web
    (`uji-galat-muat-terpisah.mjs`).
  */
  const [galatProyek, setGalatProyek] = useState<string | null>(null);
  const [galatRab, setGalatRab] = useState<string | null>(null);

  useEffect(() => {
    api
      .get('/api/v1/projects')
      .then((res) => {
        const active = (res.data?.projects ?? []).filter((p: any) => p.status === 'active');
        setProjects(active);
        setGalatProyek(null);
        if (active.length > 0) setSelectedProject(active[0].id);
      })
      /*
        Sebelumnya rantai ini TAK punya `.catch` sama sekali. Permintaan yang
        gagal menyisakan `projects` kosong dan `loadingProjects` false — dan
        layar memperlihatkan pemilih proyek kosong tanpa satu pun keterangan.

        Mandor menyimpulkan ia belum ditugaskan ke proyek mana pun, lalu
        berhenti. Laporan progres hari itu tak pernah masuk, dan tak ada
        yang tahu kenapa.
      */
      .catch(() => setGalatProyek('Gagal memuat daftar proyek. Periksa koneksi.'))
      .finally(() => setLoadingProjects(false));
  }, []);

  useEffect(() => {
    if (mode === 'detail' && selectedProject) {
      setLoadingRab(true);
      setSelectedRabItem('');
      setGalatRab(null);
      api.get(`/api/v1/projects/${selectedProject}/rab/items`)
        .then(res => {
          const items = res.data?.items ?? [];
          setRabItems(items);
          if (items.length > 0) setSelectedRabItem(items[0].id);
        })
        /*
          ⚠ `.catch(() => setRabItems([]))` — bentuk lamanya — mengubah
          GAGAL MUAT jadi "Belum ada RAB untuk proyek ini". Dua keadaan yang
          berbeda jauh: yang pertama perlu dicoba lagi, yang kedua perlu
          menghubungi PM.

          Kebohongan yang sama sudah diperbaiki dua kali di repo ini
          (`notifications/index.tsx`, `proyek/[id].tsx`), dan berkas ini
          yang tersisa. Penjaga `audit-catch-senyap.mjs` tak menangkapnya
          karena ia hanya memindai `apps/api/src` — nolnya benar untuk
          cakupannya sendiri, dan tak mengatakan apa pun tentang mobile.
        */
        .catch(() => {
          setRabItems([]);
          setGalatRab('Gagal memuat item RAB. Periksa koneksi, lalu coba lagi.');
        })
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

    /*
      ── KOORDINAT diambil SEKALI, di awal, sebelum percabangan ──────────

      Bukan di dalam tiap cabang. Kalau diambil dua kali, jalur online dan
      jalur antrean bisa membawa titik yang BERBEDA untuk satu kejadian
      yang sama — dan selisih itu tak akan pernah terlihat sebagai galat.

      ⚠ TIDAK PERNAH menggagalkan kiriman. `ambilKoordinat()` memulangkan
      `null` saat izin ditolak, GPS mati, atau fix tak datang dalam 8
      detik. Laporan progres jauh lebih berharga daripada titiknya, dan
      API sudah siap menerima kiriman tanpa koordinat (`progress.ts:156`
      menolak koordinat SETENGAH terisi, bukan yang kosong).

      Alasan lengkapnya di kepala `lib/lokasi.ts`.
    */
    const koordinat = await ambilKoordinat();

    try {
      if (mode === 'daily') {
        const pct = parseFloat(progress);
        if (isNaN(pct) || pct < 0 || pct > 100) { Alert.alert('Progress harus antara 0–100'); setLoading(false); return; }
        /*
          ══════════════════════════════════════════════════════════════
          FOTO DIUNGGAH TERPISAH — dan sebelum 2026-09-12 ia TAK PERNAH
          SAMPAI sama sekali.
          ══════════════════════════════════════════════════════════════

          Layar ini dulu mengirim `FormData` ke `/progress-logs`. Rute itu
          membaca `request.body` sebagai JSON biasa — TAK ADA penanganan
          multipart di dalamnya. Jadi fotonya tak pernah diurai, dan
          kiriman tetap membalas sukses.

          Terukur di basis produksi 2026-09-12:

              progress_logs mode=daily : 101 · terakhir 1 Sep 2026
              project_photos           :  36 · terakhir 16 Jun 2026
              foto TERTAUT ke log      :   0   <- nol, dari 101 laporan

          Layar berkata "Berhasil", mandor mengira fotonya tersimpan, dan
          tak satu pun galat muncul di mana pun.

          ⚠ Cacat ini SUDAH TERCATAT di CLAUDE.md §6 sebagai asal-usul
          `audit-antrean-punya-rute.mjs` — "foto progres yang TAK PERNAH
          sampai (multipart vs JSON)". Penjaga itu menjaga JALUR-nya, dan
          kepala berkasnya menyatakan sendiri bahwa ia TIDAK menjaga
          bentuk muatannya. Jadi ia hijau, dan benar hijau.

          ── Yang dipakai sekarang

          `POST /photos/upload` — base64 JSON, sudah ada sejak lama, sudah
          menangani geotag lengkap (`progress.ts:163`), dan TAK SATU PUN
          klien memanggilnya.

          Urutannya: log dibuat DULU supaya `progress_log_id` ada, baru
          fotonya menyusul. Terbalik berarti foto yatim di Storage kalau
          pembuatan log gagal.
        */
        /*
          Bentuk balasan DIBACA dari `progress.ts:475`, bukan ditebak:
          `reply.send({ data: fullLog, new_overall_pct })`. Dengan axios
          membungkusnya sekali lagi, id-nya ada di `res.data.data.id`.

          ⚠ Ini kelas cacat yang dijaga `audit-bentuk-balasan-mobile.mjs`:
          `res.data` bertipe `any`, jadi salah sarang TIDAK memerahkan
          tsc — ia cuma menghasilkan `undefined` yang diterima diam-diam
          sebagai "foto tanpa log", lalu foto jadi yatim.
        */
        const balasan = await api.post<{ data?: { id?: string } }>(
          `/api/v1/projects/${selectedProject}/progress-logs`,
          {
            mode: 'daily',
            log_date: new Date().toISOString().split('T')[0],
            pct_overall: pct,
            ...(notes.trim() ? { notes: notes.trim() } : {}),
          },
        );

        /*
          Kegagalan unggah foto TIDAK membatalkan laporan yang sudah
          tersimpan. Angka progresnya yang paling berharga; foto adalah
          bukti pendukung.

          Tapi kegagalannya WAJIB diberitahukan — mandor yang mengira
          fotonya terkirim tak akan memotret ulang, dan itu persis
          keadaan yang baru saja diperbaiki.
        */
        const idLog = balasan.data?.data?.id;

        let fotoGagal = 0;
        for (const uri of photos) {
          try {
            const base64 = await FileSystem.readAsStringAsync(uri, {
              encoding: 'base64',
            });
            const ext = (uri.split('.').pop() ?? 'jpg').toLowerCase();
            await api.post(`/api/v1/projects/${selectedProject}/photos/upload`, {
              file_base64: base64,
              file_name: `progres_${Date.now()}.${ext}`,
              progress_log_id: idLog,
              /*
                Koordinat menempel PER FOTO — itu bentuk yang dipakai
                basis (`project_photos.lintang`), bukan per log.
              */
              ...(koordinat ?? {}),
            });
          } catch {
            fotoGagal += 1;
          }
        }

        Alert.alert(
          'Berhasil',
          fotoGagal === 0
            ? 'Progress harian berhasil disimpan!'
            : `Progres tersimpan, tetapi ${fotoGagal} dari ${photos.length} foto gagal diunggah. Coba unggah ulang dari layar proyek.`,
        );
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
          /*
            ⚠ Koordinat TIDAK dikirim di sini, dan itu bukan kelalaian.

            Dibaca dari `progress.ts:271` — geotag hidup PER FOTO
            (`photos[].lintang`), bukan per log. Mode `detail` tak
            mengirim foto sama sekali, jadi tak ada tempat yang sah
            untuk menaruhnya.

            Versi pertama saya menaruhnya di tingkat atas muatan. Rute
            akan mengabaikannya diam-diam — bidang yang tak dikenal tidak
            menggagalkan apa pun, jadi cacatnya tak akan pernah berbunyi.
          */
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
              /* Tanpa foto -> tanpa geotag. Lihat catatan di jalur online. */
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
      <KepalaLayar judul="Input Progress" penjelas="Laporan kemajuan pekerjaan di lapangan" />
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

        {/* Proyek */}
        <Card>
          <Text style={styles.label}>Proyek</Text>
          {/*
            TIGA keadaan, bukan dua. Sebelumnya nol proyek merender
            penggulung mendatar yang KOSONG — bukan kalimat yang kurang
            menolong, melainkan tak ada tulisan sama sekali. Pembacanya
            melihat strip kosong dan tak diberi tahu apa pun.
          */}
          {galatProyek ? (
            <Text style={styles.galatTeks}>{galatProyek}</Text>
          ) : projects.length === 0 ? (
            <Text style={styles.emptyText}>
              Belum ada proyek aktif yang bisa Anda akses. Hubungi admin bila
              Anda seharusnya ditugaskan di salah satunya.
            </Text>
          ) : (
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
          )}
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
                <ActivityIndicator size="small" color={c.navy} style={{ marginTop: 8 }} />
              ) : galatRab ? (
                <Text style={styles.galatTeks}>{galatRab}</Text>
              ) : rabItems.length === 0 ? (
                /*
                  Yang ditambahkan bukan hiasan: mode "Harian Umum" TIDAK
                  butuh RAB sama sekali. Tanpa kalimat kedua, pembacanya
                  menyimpulkan laporan hari ini mustahil — padahal jalan
                  keluarnya ada satu ketukan di atas layar ini.
                */
                <Text style={styles.emptyText}>
                  RAB proyek ini belum disusun, jadi progres per item belum
                  bisa dicatat. Pakai mode Harian Umum, atau hubungi PM
                  proyek untuk menyusun RAB-nya.
                </Text>
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
    fotoMati: { fontSize: 12, color: c.warning, lineHeight: 17, flex: 1 },
    rabList: { maxHeight: 280, marginTop: 4 },
    rabItem: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: c.border, marginBottom: 6, backgroundColor: c.surfaceRaised },
    rabItemActive: { backgroundColor: c.navy, borderColor: c.navy },
    rabItemRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    rabItemNo: { fontSize: 12, color: c.textSecondary, width: 36, flexShrink: 0 },
    rabItemName: { flex: 1, fontSize: 13, color: c.textPrimary, fontFamily: FONT.isiTebal },
    rabItemPct: { fontSize: 12, color: c.navy, fontFamily: FONT.judul, flexShrink: 0 },
    rabItemTextActive: { color: c.surfaceRaised },
    emptyText: {
      fontSize: 13,
      color: c.textSecondary,
      textAlign: 'center',
      paddingVertical: 16,
      lineHeight: 19,
    },
    galatTeks: {
      fontSize: 13,
      color: c.danger,
      textAlign: 'center',
      paddingVertical: 16,
      lineHeight: 19,
    },
    infoRow: { flexDirection: 'column', gap: 2, marginTop: 4 },
    infoText: { fontSize: 12, color: c.textSecondary },
  });
}
