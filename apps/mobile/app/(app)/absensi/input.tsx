import React, { useEffect, useMemo, useState } from 'react';
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
  ABSENSI HARIAN — layar native, karena inilah yang paling sering diisi
  ══════════════════════════════════════════════════════════════════════════

  Diukur 2026-08-31, jumlah baris di basis:

      absensi_harian   1279   ← terbanyak, dan BELUM ada layar mobile-nya
      progress_logs     272
      kasbons            67
      punch_items        40

  Absensi diisi tiap hari kerja oleh orang yang berdiri di lokasi. Menuntutnya
  membuka browser di HP untuk itu adalah alasan paling umum sebuah catatan
  berakhir di kertas — lalu tak pernah masuk sistem.

  ── Kenapa offline-first, bukan "tampilkan galat kalau gagal"

  Sinyal buruk di proyek bukan pengecualian, ia keadaan normal. `lib/antrean`
  sudah menangani ini untuk progres dan kasbon: kiriman disimpan dengan kunci
  idempotensi yang dibuat SEKALI, lalu dicoba ulang. Layar ini memakai jalur
  yang sama — bukan memanggil `api.post` langsung.

  Tanpa itu, mandor yang kehilangan sinyal saat menekan Simpan kehilangan
  seluruh isian hari itu, dan harus mengetik ulang 20 nama dari ingatan.

  ── Porsi hari, bukan jam masuk-keluar

  Kontrak API: `porsi_hari` antara 0 dan 1 (`0.5` = setengah hari), dan
  `jam_lembur` 0-16 terpisah. Itu cara kerja upah harian konstruksi — bukan
  absen jam masuk seperti kantor. Layar ini mengikuti bentuk itu, karena
  memaksakan bentuk kantoran akan membuat mandor menerjemahkannya sendiri di
  kepala, dan terjemahan itu yang salah.
*/

type Scope = { id: string; nama: string; proyek: string };
type Tukang = { id: string; name: string; tipe?: string };
type Entri = { hadir: boolean; porsi: number; lembur: string };

const PORSI = [
  { nilai: 1, label: 'Penuh' },
  { nilai: 0.5, label: '½ hari' },
  { nilai: 0.25, label: '¼ hari' },
];

export default function InputAbsensi() {
  /*
    Gaya dirakit di dalam komponen — `StyleSheet.create` di lingkup
    modul berjalan sebelum satu hook pun, jadi ia tak bisa membaca
    `useTema()`. Lihat catatan panjangnya di `pekerjaan.tsx`.
  */
  const { c } = useTema();
  const s = React.useMemo(() => gaya(c), [c]);
  const { izin } = useAuth();
  const [scopes, setScopes] = useState<Scope[]>([]);
  const [scopeId, setScopeId] = useState<string | null>(null);
  const [tukang, setTukang] = useState<Tukang[]>([]);
  const [entri, setEntri] = useState<Record<string, Entri>>({});
  const [memuat, setMemuat] = useState(true);
  const [menyimpan, setMenyimpan] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  /* Tanggal hari ini, zona perangkat — mandor mengisi untuk HARI INI. */
  const tanggal = useMemo(() => {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }, []);

  const boleh = izin?.has('mandor:wage:create');

  useEffect(() => {
    let hidup = true;
    (async () => {
      try {
        const [rs, rt] = await Promise.all([
          api.get('/api/v1/mandor/my-scopes'),
          api.get('/api/v1/mandor/workers'),
        ]);
        if (!hidup) return;

        /*
          Bentuk `my-scopes` bersarang: assignment → work_scopes[]. Diratakan
          di sini, bukan di render — komponen yang meratakan sambil menggambar
          akan mengulanginya tiap render.
        */
        const daftar: Scope[] = [];
        for (const a of rs.data?.assignments ?? rs.data ?? []) {
          const proyek = a.project?.name ?? a.projects?.name ?? 'Proyek';
          for (const w of a.work_scopes ?? []) {
            daftar.push({ id: w.id, nama: w.scope_name ?? 'Lingkup kerja', proyek });
          }
        }
        setScopes(daftar);
        if (daftar.length === 1) setScopeId(daftar[0].id);

        const tk: Tukang[] = (rt.data?.workers ?? rt.data ?? [])
          .filter((w: { is_active?: boolean }) => w.is_active !== false)
          .map((w: { id: string; name: string; tipe?: string }) => ({
            id: w.id, name: w.name, tipe: w.tipe,
          }));
        setTukang(tk);
      } catch (e) {
        if (hidup) {
          /*
            Galat MUAT dipisah dari galat SIMPAN — dua state berbeda. Berbagi
            satu state membuat gagal-simpan menghapus pesan gagal-muat, dan
            itu cacat yang sudah ditemukan di 11 halaman web (penjaga
            `uji-galat-muat-terpisah`).
          */
          setGalat(
            'Gagal memuat daftar tukang & lingkup kerja. Periksa koneksi lalu tarik untuk memuat ulang.',
          );
        }
      } finally {
        if (hidup) setMemuat(false);
      }
    })();
    return () => { hidup = false; };
  }, []);

  const ubah = (id: string, patch: Partial<Entri>) =>
    setEntri((s) => ({
      ...s,
      /*
        Bawaan DULU, lalu nilai yang sudah ada, lalu perubahan.

        Versi pertama menulis `{ hadir: true, porsi: 1, ...s[id], ...patch }`
        dengan kunci bawaan disebut ULANG sesudah spread — TypeScript
        menandainya TS2783 ("specified more than once"), dan yang menang
        adalah yang terakhir. Artinya perubahan pengguna akan ditimpa bawaan
        pada kunci yang sama.
      */
      [id]: { ...{ hadir: true, porsi: 1, lembur: '' }, ...s[id], ...patch },
    }));

  const hadirCount = Object.values(entri).filter((e) => e.hadir).length;

  async function simpan() {
    if (!scopeId) {
      Alert.alert('Pilih lingkup kerja', 'Absensi dicatat per lingkup kerja.');
      return;
    }
    const dipilih = Object.entries(entri).filter(([, e]) => e.hadir);
    if (dipilih.length === 0) {
      Alert.alert('Belum ada yang hadir', 'Tandai minimal satu tukang.');
      return;
    }

    /*
      Divalidasi DI SINI juga, bukan hanya mengandalkan API.

      Rutenya memang menolak nilai di luar 0-16, tapi penolakan itu datang
      SESUDAH kiriman masuk antrean — dan di antrean ia akan dicoba ulang
      terus, gagal terus, tanpa mandor tahu isian mana yang salah.
    */
    for (const [id, e] of dipilih) {
      const jam = e.lembur.trim() === '' ? 0 : Number(e.lembur);
      if (!Number.isFinite(jam) || jam < 0 || jam > 16) {
        const nama = tukang.find((t) => t.id === id)?.name ?? 'Tukang';
        Alert.alert('Jam lembur tidak masuk akal', `${nama}: isi 0 sampai 16 jam.`);
        return;
      }
    }

    setMenyimpan(true);
    try {
      await antrekan({
        jenis: 'absensi',
        jalur: '/api/v1/absensi',
        muatan: {
          scope_id: scopeId,
          tanggal,
          entri: dipilih.map(([worker_id, e]) => ({
            worker_id,
            porsi_hari: e.porsi,
            jam_lembur: e.lembur.trim() === '' ? 0 : Number(e.lembur),
          })),
        },
        ringkas: `Absensi ${tanggal} — ${dipilih.length} tukang`,
      });
      Alert.alert(
        'Tersimpan',
        'Absensi masuk antrean kirim. Kalau sinyal ada, ia terkirim sekarang; kalau tidak, otomatis dicoba lagi.',
        [{ text: 'Selesai', onPress: () => router.back() }],
      );
    } catch {
      Alert.alert('Gagal menyimpan', 'Absensi belum masuk antrean. Coba lagi.');
    } finally {
      setMenyimpan(false);
    }
  }

  if (!boleh) {
    return (
      <View style={s.tengah}>
        <Text style={s.kosongJudul}>Tidak ada akses</Text>
        <Text style={s.kosongIsi}>
          Mencatat absensi butuh izin membuat laporan upah. Hubungi admin bila ini keliru.
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
    <ScrollView style={s.wadah} contentContainerStyle={s.isi}>
      <Text style={s.judul}>Absensi {tanggal}</Text>

      {galat && (
        <View style={s.galat}>
          <Text style={s.galatTeks}>{galat}</Text>
        </View>
      )}

      <Text style={s.label}>Lingkup kerja</Text>
      {scopes.length === 0 ? (
        <Text style={s.kosongIsi}>
          Belum ada lingkup kerja yang ditugaskan kepada Anda. Hubungi admin
          proyek untuk menugaskannya — absensi belum bisa dicatat tanpa itu.
        </Text>
      ) : (
        <View style={s.pilihanBaris}>
          {scopes.map((sc) => (
            <Tekan
              key={sc.id}
              onPress={() => setScopeId(sc.id)}
              style={[s.chip, scopeId === sc.id && s.chipAktif]}
              accessibilityRole="button"
              accessibilityState={{ selected: scopeId === sc.id }}
            >
              <Text style={[s.chipTeks, scopeId === sc.id && s.chipTeksAktif]}>
                {sc.nama}
              </Text>
              <Text style={[s.chipSub, scopeId === sc.id && s.chipTeksAktif]}>{sc.proyek}</Text>
            </Tekan>
          ))}
        </View>
      )}

      <View style={s.pemisah} />

      <View style={s.barisJudul}>
        <Text style={s.label}>Tukang</Text>
        <Text style={s.hitung}>{hadirCount} hadir</Text>
      </View>

      {tukang.length === 0 ? (
        <Text style={s.kosongIsi}>
          Belum ada tukang terdaftar di bawah Anda. Minta admin mendaftarkan
          tim Anda lebih dulu.
        </Text>
      ) : (
        tukang.map((t) => {
          const e = entri[t.id];
          const hadir = e?.hadir ?? false;
          return (
            <View key={t.id} style={[s.kartu, hadir && s.kartuAktif]}>
              <Tekan
                style={s.kartuKepala}
                onPress={() => ubah(t.id, { hadir: !hadir })}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: hadir }}
                accessibilityLabel={`${t.name}, ${hadir ? 'hadir' : 'tidak hadir'}`}
              >
                <View style={[s.kotak, hadir && s.kotakAktif]}>
                  {hadir && <Text style={s.centang}>✓</Text>}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.nama}>{t.name}</Text>
                  {t.tipe ? <Text style={s.tipe}>{t.tipe}</Text> : null}
                </View>
              </Tekan>

              {hadir && (
                <View style={s.rinci}>
                  <View style={s.pilihanBaris}>
                    {PORSI.map((p) => (
                      <Tekan
                        key={p.nilai}
                        onPress={() => ubah(t.id, { porsi: p.nilai })}
                        style={[s.chipKecil, e?.porsi === p.nilai && s.chipAktif]}
                        accessibilityRole="button"
                        accessibilityState={{ selected: e?.porsi === p.nilai }}
                      >
                        <Text
                          style={[s.chipTeks, e?.porsi === p.nilai && s.chipTeksAktif]}
                        >
                          {p.label}
                        </Text>
                      </Tekan>
                    ))}
                  </View>
                  <View style={s.lemburBaris}>
                    <Text style={s.lemburLabel}>Lembur (jam)</Text>
                    <TextInput
                      value={e?.lembur ?? ''}
                      onChangeText={(v) => ubah(t.id, { lembur: v.replace(/[^0-9.]/g, '') })}
                      keyboardType="numeric"
                      placeholder="0"
                      placeholderTextColor={c.textMuted}
                      style={s.lemburInput}
                      accessibilityLabel={`Jam lembur ${t.name}`}
                    />
                  </View>
                </View>
              )}
            </View>
          );
        })
      )}

      <Tekan
        onPress={simpan}
        disabled={menyimpan || !scopeId || hadirCount === 0}
        style={[s.simpan, (menyimpan || !scopeId || hadirCount === 0) && s.simpanMati]}
        accessibilityRole="button"
      >
        <Text style={s.simpanTeks}>
          {menyimpan ? 'Menyimpan…' : `Simpan absensi (${hadirCount})`}
        </Text>
      </Tekan>

      <Text style={s.catatan}>
        Tersimpan di HP dulu, lalu terkirim sendiri saat ada sinyal.
      </Text>
    </ScrollView>
  );
}

function gaya(c: Palet) {
  return StyleSheet.create({
    wadah: { flex: 1, backgroundColor: c.surfaceSubtle },
    isi: { padding: 16, paddingBottom: 40 },
    tengah: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: c.surfaceSubtle },
    judul: { fontSize: 20, fontFamily: FONT.judul, color: c.textPrimary, marginBottom: 14 },
    label: { fontSize: 13, fontFamily: FONT.isiTebal, color: c.textPrimary, marginBottom: 8 },
    barisJudul: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    hitung: { fontSize: 13, color: c.navy, fontFamily: FONT.isiTebal },
    pemisah: { height: 1, backgroundColor: c.border, marginVertical: 16 },
    pilihanBaris: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      paddingVertical: 9, paddingHorizontal: 13, borderRadius: 10,
      borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceRaised,
    },
    chipKecil: {
      paddingVertical: 7, paddingHorizontal: 12, borderRadius: 8,
      borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceRaised,
    },
    /* Yang terpilih dibedakan LATAR + border, bukan warna teks saja — WCAG
       1.4.1: informasi tak boleh disampaikan lewat warna semata. */
    chipAktif: { backgroundColor: c.navy, borderColor: c.navy },
    chipTeks: { fontSize: 13, color: c.textPrimary, fontFamily: FONT.isiTebal },
    chipTeksAktif: { color: c.surfaceRaised },
    chipSub: { fontSize: 11, color: c.textSecondary, marginTop: 1 },
    kartu: {
      backgroundColor: c.surfaceRaised, borderRadius: 12, borderWidth: 1,
      borderColor: c.border, marginBottom: 8, overflow: 'hidden',
    },
    kartuAktif: { borderColor: c.navy },
    kartuKepala: { flexDirection: 'row', alignItems: 'center', padding: 13, gap: 12 },
    /* 26px — target sentuh efektifnya seluruh baris kartu, bukan kotak ini. */
    kotak: {
      width: 26, height: 26, borderRadius: 7, borderWidth: 2,
      borderColor: '#D1D5DB', alignItems: 'center', justifyContent: 'center',
    },
    kotakAktif: { backgroundColor: c.navy, borderColor: c.navy },
    centang: { color: c.surfaceRaised, fontSize: 15, fontFamily: FONT.judul },
    nama: { fontSize: 15, fontFamily: FONT.isiTebal, color: c.textPrimary },
    tipe: { fontSize: 12, color: c.textSecondary, marginTop: 1 },
    rinci: {
      borderTopWidth: 1, borderTopColor: c.surfaceHover,
      padding: 13, paddingTop: 11, gap: 10,
    },
    lemburBaris: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    lemburLabel: { fontSize: 13, color: c.textPrimary, flex: 1 },
    lemburInput: {
      width: 78, paddingVertical: 8, paddingHorizontal: 11,
      borderWidth: 1, borderColor: c.border, borderRadius: 8,
      fontSize: 15, color: c.textPrimary, textAlign: 'center', backgroundColor: c.surfaceRaised,
    },
    simpan: {
      marginTop: 18, backgroundColor: c.navy, borderRadius: 12,
      paddingVertical: 15, alignItems: 'center',
    },
    simpanMati: { backgroundColor: c.borderStrong },
    simpanTeks: { color: c.surfaceRaised, fontSize: 15, fontFamily: FONT.judul },
    catatan: { fontSize: 12, color: c.textSecondary, textAlign: 'center', marginTop: 10, lineHeight: 17 },
    galat: {
      backgroundColor: c.dangerBg, borderWidth: 1, borderColor: c.dangerBorder,
      borderRadius: 10, padding: 12, marginBottom: 14,
    },
    galatTeks: { fontSize: 13, color: c.danger, lineHeight: 19 },
    kosongJudul: { fontSize: 16, fontFamily: FONT.judul, color: c.textPrimary, marginBottom: 6 },
    kosongIsi: { fontSize: 13, color: c.textSecondary, lineHeight: 19, textAlign: 'center' },
  });
}
