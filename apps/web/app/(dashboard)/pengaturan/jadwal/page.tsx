"use client";

/**
 * PENGATURAN → JADWAL TUGAS
 *
 * ══════════════════════════════════════════════════════════════════════════
 * PERTANYAAN YANG HARUS DIJAWAB HALAMAN INI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Bukan "apa jadwalnya" — itu mudah. Yang sulit dan sering tak terjawab:
 * **"kenapa ini belum jalan?"**
 *
 * Sebelum penjadwal ada, jawabannya butuh membuka log server. Karena itu tiap
 * baris di sini menampilkan `keputusan_sekarang` dari server — alasan persis
 * yang akan dipakai pemicu berikutnya: `belum-waktunya`,
 * `sudah-jalan-periode-ini`, `nonaktif`, `jam-tak-sah`.
 *
 * ── Kenapa status terakhir ditampilkan sebesar jadwalnya
 *
 * Tugas yang terjadwal rapi tapi selalu gagal terlihat persis sama dengan
 * tugas yang berhasil — itulah cacat yang membuat `BackupPolicy` TJS hidup
 * bertahun-tahun tanpa pernah bekerja. Kolom "terakhir" karenanya bukan
 * pelengkap; ia yang menjawab apakah jadwalnya nyata.
 *
 * ── Arah visual (ARAH-VISUAL-2026)
 *
 * §3d: **satu aksen per layar**, dan navy adalah aksen tunggal (indigo
 * ditolak §10 #1). Di halaman ini navy dipakai HANYA untuk tombol simpan yang
 * sedang aktif. Status memakai warna semantik (sukses/bahaya) — itu bukan
 * aksen, itu makna.
 */

import { useEffect, useState } from "react";
import { useIzin } from "@/lib/use-izin";
import { api } from "@/lib/api";
import { useData } from "@/lib/data-cache";
import { CalendarClock, Info, CheckCircle2, XCircle, CircleDashed, TriangleAlert } from "lucide-react";

import { C } from "@/lib/warna-ui";
import { KepalaHalaman } from "@/components/dasar";
import { GAYA_KARTU, Kosong } from "@/components/ui-dasar";
import { Saklar } from "@/components/saklar";
import { Pilihan } from "@/components/pilihan";


const kontrol: React.CSSProperties = {
  padding: "var(--pad-baris)",
  border: `1px solid ${C.border}`,
  borderRadius: 6,
  fontSize: 13,
  outline: "none",
  background: "var(--surface)",
  color: C.text,
  boxSizing: "border-box",
  fontFamily: "inherit",
};

type Jenis = "harian" | "mingguan" | "bulanan";
type AlasanKeputusan =
  | "nonaktif" | "jam-tak-sah" | "belum-waktunya"
  | "sudah-jalan-periode-ini" | "jatuh-tempo";

interface Tugas {
  id: string;
  tugas: string;
  label: string;
  keterangan: string | null;
  dikenal: boolean;
  jenis: Jenis;
  jam: string;
  hari_pekan: number | null;
  hari_bulan: number | null;
  aktif: boolean;
  terakhir_jalan: string | null;
  terakhir_status: "sukses" | "gagal" | null;
  terakhir_galat: string | null;
  terakhir_durasi_ms: number | null;
  jumlah_jalan: number;
  keputusan_sekarang: { jalan: boolean; alasan: AlasanKeputusan };
}

/**
 * Alasan dalam bahasa manusia.
 *
 * Menampilkan `sudah-jalan-periode-ini` apa adanya memaksa pembaca
 * menerjemahkan istilah mesin — dan yang paling butuh halaman ini justru yang
 * paling tak terbiasa dengan istilah itu.
 */
const ALASAN: Record<AlasanKeputusan, { teks: string; nada: "diam" | "siap" | "peringatan" }> = {
  "jatuh-tempo":             { teks: "Akan jalan pada pemicu berikutnya", nada: "siap" },
  "sudah-jalan-periode-ini": { teks: "Sudah jalan untuk periode ini",     nada: "diam" },
  "belum-waktunya":          { teks: "Menunggu jamnya",                    nada: "diam" },
  nonaktif:                  { teks: "Dinonaktifkan",                      nada: "diam" },
  "jam-tak-sah":             { teks: "Jam tidak sah — tugas ini TIDAK akan pernah jalan", nada: "peringatan" },
};

const HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];


function waktuRelatif(iso: string | null): string {
  if (!iso) return "belum pernah";
  const selisih = Date.now() - new Date(iso).getTime();
  const menit = Math.floor(selisih / 60_000);
  if (menit < 1) return "baru saja";
  if (menit < 60) return `${menit} menit lalu`;
  const jam = Math.floor(menit / 60);
  if (jam < 24) return `${jam} jam lalu`;
  const hari = Math.floor(jam / 24);
  return hari === 1 ? "kemarin" : `${hari} hari lalu`;
}

export default function JadwalPage() {
  const bolehKelola = useIzin("settings:schedule:manage");

  /*
    ── PINDAH KE LAPIS CACHE BERSAMA (F4-2), 2026-08-16

    `useData` menggantikan useCallback+useEffect+queueMicrotask. `draf`
    (perubahan belum tersimpan per tugas) dikosongkan lewat `useEffect`
    terpisah begitu `data` yang baru datang — sama seperti perilaku lama
    `setDraf({})` di dalam `muat()`.
  */
  const { data, memuat, galat: galatMuat, muatUlang } = useData<{ data: Tugas[]; penjadwal_siap: boolean }>("/api/v1/jadwal");
  const muat = async () => { await muatUlang(); };
  const daftar = data?.data ?? [];
  const siap = data ? data.penjadwal_siap !== false : true;

  const [draf, setDraf] = useState<Record<string, Partial<Tugas>>>({});
  const [menyimpan, setMenyimpan] = useState<string | null>(null);
  const [bukaUbah, setBukaUbah] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<{ tipe: "ok" | "err"; pesan: string } | null>(null);

  useEffect(() => {
    if (!data) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraf({});
  }, [data]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  function ubah(tugas: string, bagian: Partial<Tugas>) {
    setDraf((d) => ({ ...d, [tugas]: { ...d[tugas], ...bagian } }));
  }

  async function simpan(t: Tugas) {
    const perubahan = draf[t.tugas];
    if (!perubahan) return;
    setMenyimpan(t.tugas);
    try {
      await api.patch(`/api/v1/jadwal/${t.tugas}`, perubahan);
      setToast({ tipe: "ok", pesan: `Jadwal "${t.label}" disimpan` });
      setBukaUbah((b) => ({ ...b, [t.tugas]: false }));
      await muat();
    } catch (e) {
      const r = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setToast({ tipe: "err", pesan: r || "Gagal menyimpan jadwal" });
    } finally {
      setMenyimpan(null);
    }
  }

  return (
    <div
      style={{
        padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)",
        width: "100%",
        maxWidth: "var(--w-page)",
        margin: "0 auto",
      }}
    >
      {toast && (
        <div
          role="status"
          style={{
            position: "fixed", top: 16, right: 16, zIndex: 60,
            padding: "var(--pad-kartu)", borderRadius: 8, fontSize: 13,
            background: toast.tipe === "ok" ? "var(--success-bg)" : "var(--danger-bg)",
            color: toast.tipe === "ok" ? "var(--success)" : "var(--danger)",
            border: `1px solid ${toast.tipe === "ok" ? "var(--success)" : "var(--danger)"}`,
          }}
        >
          {toast.pesan}
        </div>
      )}

      <div style={{ marginBottom: "var(--gap-bagian)", display: "flex", alignItems: "center", gap: 12 }}>
        <KepalaHalaman
          judul="Jadwal Tugas"
          keterangan="Tugas berkala yang berjalan sendiri — tanpa perlu ada yang menekan tombol."
          ikon={<CalendarClock size={19} />}
        />
      </div>

      {!siap && (
        <div
          style={{
            ...GAYA_KARTU, padding: "var(--pad-kartu)", marginBottom: "var(--gap-bagian)",
            display: "flex", gap: 10,
            borderColor: "var(--warning)", background: "var(--warning-bg)",
          }}
        >
          <TriangleAlert size={18} style={{ color: "var(--warning)", flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 13, color: C.text, lineHeight: 1.6 }}>
            <strong>Pemicu otomatis belum aktif.</strong> Jadwal di bawah tersimpan, tetapi
            belum ada yang menjalankannya — <code>SCHEDULER_SECRET</code> belum disetel di
            server. Sementara itu, tugasnya masih bisa dipicu manual dari{" "}
            <a href="/sistem" style={{ color: C.aksen }}>Pemeliharaan Sistem</a>.
          </div>
        </div>
      )}

      {!bolehKelola && (
        <div style={{ ...GAYA_KARTU, padding: "var(--pad-kartu)", marginBottom: "var(--gap-bagian)", display: "flex", gap: 10 }}>
          <Info size={18} style={{ color: C.mid, flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 13, color: C.mid, lineHeight: 1.6 }}>
            Anda bisa melihat jadwal dan riwayatnya, tetapi tidak mengubahnya.
            Butuh kapabilitas <code>settings:schedule:manage</code>.
          </div>
        </div>
      )}

      {/* Ringkasan satu baris — menjawab "apakah penjadwal ini hidup" tanpa
          membaca tiap kartu. Halaman dengan dua kartu di kanvas tinggi terasa
          kosong; ringkasan ini mengisi bagian atas dengan sesuatu yang
          BERGUNA, bukan dekorasi. */}
      {!memuat && daftar.length > 0 && (
        <div
          style={{
            ...GAYA_KARTU, padding: "var(--pad-kartu)", marginBottom: 12,
            display: "flex", flexWrap: "wrap", gap: "var(--gap-bagian)", alignItems: "baseline",
          }}
        >
          {[
            { label: "Tugas aktif", nilai: `${daftar.filter((t) => t.aktif).length} dari ${daftar.length}` },
            { label: "Berhasil terakhir", nilai: `${daftar.filter((t) => t.terakhir_status === "sukses").length}` },
            {
              label: "Gagal terakhir",
              nilai: `${daftar.filter((t) => t.terakhir_status === "gagal").length}`,
              nada: daftar.some((t) => t.terakhir_status === "gagal") ? "bahaya" : undefined,
            },
            {
              label: "Belum pernah jalan",
              nilai: `${daftar.filter((t) => !t.terakhir_jalan).length}`,
            },
          ].map((k) => (
            <div key={k.label}>
              <div
                style={{
                  fontSize: 18, fontWeight: 600, lineHeight: 1.2,
                  color: k.nada === "bahaya" ? "var(--danger)" : C.text,
                }}
              >
                {k.nilai}
              </div>
              <div style={{ fontSize: "var(--t-kecil)", color: C.muted, marginTop: 2 }}>{k.label}</div>
            </div>
          ))}
        </div>
      )}

      {memuat ? (
        <div style={{ ...GAYA_KARTU, padding: "var(--pad-kartu-lega)", textAlign: "center", color: C.muted, fontSize: 13 }}>
          Memuat…
        </div>
      ) : galatMuat ? (
        // Galat MUAT dipisah dari `toast` (galat AKSI menyimpan jadwal) —
        // satu state untuk keduanya membuat gagal menyimpan menghapus pesan
        // gagal memuat, dan daftar kosong tak bisa dibedakan dari galat.
        <div role="alert" style={{ ...GAYA_KARTU, padding: "var(--pad-kartu-lega)", display: "flex", gap: 10, borderColor: "var(--danger)", background: "var(--danger-bg)" }}>
          <TriangleAlert size={18} style={{ color: "var(--danger)", flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 13, color: C.text, lineHeight: 1.6 }}>
            Gagal memuat jadwal tugas.{" "}
            <button type="button" onClick={() => void muat()} style={{ color: C.aksen, background: "none", border: "none", padding: 0, cursor: "pointer", font: "inherit", textDecoration: "underline" }}>
              Coba lagi.
            </button>
          </div>
        </div>
      ) : daftar.length === 0 ? (
        <Kosong
          judul="Belum ada tugas terjadwal"
          sebab="Tugas terjadwal menjalankan pengingat dan laporan otomatis tanpa ada yang perlu mengingatnya. Katalognya diisi lewat migrasi — kalau kosong di sini, hubungi pengelola sistem."
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {daftar.map((t) => {
            const d = draf[t.tugas] ?? {};
            const jenis = (d.jenis ?? t.jenis) as Jenis;
            const jam = d.jam ?? t.jam;
            const aktif = d.aktif ?? t.aktif;
            const hariPekan = d.hari_pekan ?? t.hari_pekan ?? 1;
            const hariBulan = d.hari_bulan ?? t.hari_bulan ?? 1;
            const berubah = Object.keys(d).length > 0;
            const alasan = ALASAN[t.keputusan_sekarang.alasan];

            return (
              <div key={t.tugas} style={{ ...GAYA_KARTU, padding: "var(--pad-kartu)" }}>
                <div
                  style={{
                    display: "flex", alignItems: "baseline",
                    justifyContent: "space-between", gap: 12, marginBottom: 4,
                  }}
                >
                  <h2 style={{ fontSize: 14, fontWeight: 600, color: C.text, margin: 0 }}>
                    {t.label}
                  </h2>

                  {/* Status terakhir — sengaja sejajar judul, bukan di bawah.
                      Tugas yang selalu gagal tak boleh terlihat sama dengan
                      yang berhasil. */}
                  {t.terakhir_status && (
                    <span
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 5,
                        fontSize: "var(--t-kecil)", padding: "var(--pad-lencana)", borderRadius: 999,
                        whiteSpace: "nowrap",
                        color: t.terakhir_status === "sukses" ? "var(--success)" : "var(--danger)",
                        background: t.terakhir_status === "sukses" ? "var(--success-bg)" : "var(--danger-bg)",
                        border: `1px solid ${t.terakhir_status === "sukses" ? "var(--success)" : "var(--danger)"}`,
                      }}
                    >
                      {t.terakhir_status === "sukses"
                        ? <CheckCircle2 size={12} aria-hidden="true" />
                        : <XCircle size={12} aria-hidden="true" />}
                      {t.terakhir_status === "sukses" ? "Berhasil" : "Gagal"} · {waktuRelatif(t.terakhir_jalan)}
                    </span>
                  )}
                </div>

                {t.keterangan && (
                  <p style={{ fontSize: 12.5, color: C.mid, lineHeight: 1.6, margin: "0 0 10px" }}>
                    {t.keterangan}
                  </p>
                )}

                {t.terakhir_status === "gagal" && t.terakhir_galat && (
                  <div
                    style={{
                      fontSize: 12, color: "var(--danger)", background: "var(--danger-bg)",
                      border: "1px solid var(--danger)", borderRadius: 6,
                      padding: "var(--pad-baris)", marginBottom: 10,
                      wordBreak: "break-word",
                    }}
                  >
                    {t.terakhir_galat}
                  </div>
                )}

                {/* Jadwalnya dinyatakan sebagai KALIMAT lebih dulu.
                    Pada versi pertama, "pukul 07:05" tenggelam di antara
                    dropdown dan kotak centang — padahal itulah informasi
                    utama halaman ini. Kontrolnya tetap di bawah untuk yang
                    ingin mengubah; yang cuma ingin TAHU tak perlu memindai
                    tiga kontrol untuk merakitnya sendiri. */}
                <p style={{ fontSize: 13, color: C.text, margin: "0 0 10px" }}>
                  {jenis === "harian" && <>Setiap hari pukul <strong>{jam}</strong></>}
                  {jenis === "mingguan" && <>Setiap {HARI[hariPekan]} pukul <strong>{jam}</strong></>}
                  {jenis === "bulanan" && <>Setiap tanggal {hariBulan} pukul <strong>{jam}</strong></>}
                  {!aktif && <span style={{ color: C.muted }}> — dinonaktifkan</span>}
                </p>

                {/* Kontrol disembunyikan sampai diminta.
                    Versi kedua menaruh kalimat DAN kontrol berdampingan, dan
                    keduanya mengatakan hal yang sama dua kali — "Setiap hari
                    pukul 07:05" tepat di atas dropdown "Harian" + "07:05".
                    Pengulangan itu menghabiskan ruang untuk pekerjaan yang
                    jarang dilakukan: jadwal disetel sekali, dibaca berkali-kali. */}
                {bolehKelola && (
                  <button
                    type="button"
                    onClick={() => setBukaUbah((b) => ({ ...b, [t.tugas]: !b[t.tugas] }))}
                    aria-expanded={Boolean(bukaUbah[t.tugas])}
                    style={{
                      padding: "var(--pad-tombol-kcl)", borderRadius: 6, fontSize: 12,
                      border: `1px solid ${C.border}`, cursor: "pointer",
                      background: "var(--surface)", color: C.mid, marginBottom: 10,
                    }}
                  >
                    {bukaUbah[t.tugas] ? "Tutup" : "Ubah jadwal"}
                  </button>
                )}

                <div
                  hidden={!bukaUbah[t.tugas]}
                  style={{ display: bukaUbah[t.tugas] ? "flex" : "none", gap: 8, flexWrap: "wrap", alignItems: "center" }}
                >
                  <label htmlFor={`jenis-${t.tugas}`} style={{ fontSize: 12, color: C.mid }}>
                    Ulang
                  </label>
                  <Pilihan
                    id={`jenis-${t.tugas}`}
                    disabled={!bolehKelola}
                    value={jenis}
                    onChange={(e) => ubah(t.tugas, { jenis: e.target.value as Jenis })}
                    style={{ ...kontrol, width: 120 }}
                  >
                    <option value="harian">Harian</option>
                    <option value="mingguan">Mingguan</option>
                    <option value="bulanan">Bulanan</option>
                  </Pilihan>

                  {jenis === "mingguan" && (
                    <>
                      <label htmlFor={`hp-${t.tugas}`} style={{ fontSize: 12, color: C.mid }}>tiap</label>
                      <Pilihan
                        id={`hp-${t.tugas}`}
                        disabled={!bolehKelola}
                        value={hariPekan}
                        onChange={(e) => ubah(t.tugas, { hari_pekan: Number(e.target.value) })}
                        style={{ ...kontrol, width: 110 }}
                      >
                        {HARI.map((h, i) => <option key={h} value={i}>{h}</option>)}
                      </Pilihan>
                    </>
                  )}

                  {jenis === "bulanan" && (
                    <>
                      <label htmlFor={`hb-${t.tugas}`} style={{ fontSize: 12, color: C.mid }}>tanggal</label>
                      <Pilihan
                        id={`hb-${t.tugas}`}
                        disabled={!bolehKelola}
                        value={hariBulan}
                        onChange={(e) => ubah(t.tugas, { hari_bulan: Number(e.target.value) })}
                        style={{ ...kontrol, width: 80 }}
                      >
                        {Array.from({ length: 31 }, (_, i) => i + 1).map((n) => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                      </Pilihan>
                    </>
                  )}

                  <label htmlFor={`jam-${t.tugas}`} style={{ fontSize: 12, color: C.mid }}>pukul</label>
                  <input
                    id={`jam-${t.tugas}`}
                    type="time"
                    disabled={!bolehKelola}
                    value={jam}
                    onChange={(e) => ubah(t.tugas, { jam: e.target.value })}
                    style={{ ...kontrol, width: 110 }}
                  />

                  <Saklar
                    nyala={aktif}
                    nonaktif={!bolehKelola}
                    onUbah={(v) => ubah(t.tugas, { aktif: v })}
                    label="Aktif"
                  />

                  {berubah && bolehKelola && (
                    <button
                      type="button"
                      onClick={() => simpan(t)}
                      disabled={menyimpan === t.tugas}
                      style={{
                        padding: "var(--pad-tombol)", borderRadius: 6, fontSize: 13, fontWeight: 500,
                        border: "none", cursor: "pointer",
                        background: "var(--grad-aksen)", color: "var(--on-aksen)",
                        marginInlineStart: "auto",
                      }}
                    >
                      {menyimpan === t.tugas ? "Menyimpan…" : "Simpan"}
                    </button>
                  )}
                </div>

                {/* Inilah yang menjawab "kenapa belum jalan" tanpa membuka log. */}
                <div
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    marginTop: 10, fontSize: 12,
                    color: alasan.nada === "peringatan" ? "var(--danger)"
                         : alasan.nada === "siap" ? C.text : C.muted,
                  }}
                >
                  {alasan.nada === "peringatan"
                    ? <TriangleAlert size={13} aria-hidden="true" />
                    : <CircleDashed size={13} aria-hidden="true" />}
                  <span>{alasan.teks}</span>
                  {t.jumlah_jalan > 0 && (
                    <span style={{ color: C.muted }}>
                      · {t.jumlah_jalan}× dijalankan
                      {t.terakhir_durasi_ms != null && ` · ${t.terakhir_durasi_ms} ms`}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
