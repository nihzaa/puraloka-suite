"use client";

import { useCallback, useEffect, useState } from "react";
import { KepalaHalaman } from "@/components/dasar";
import { useTerpasang } from "@/lib/use-terpasang";
import { api } from "@/lib/api";
import { useData } from "@/lib/data-cache";
import { Globe, Save, Check, X, AlertTriangle, Eye, EyeOff, RefreshCw } from "lucide-react";
import { C } from "@/lib/warna-ui";
import { GAYA_KARTU } from "@/components/ui-dasar";
import { GAYA_ISIAN } from "@/components/isian";

// ─────────────────────────────────────────────────────────────────────────────
// Pengaturan konten situs publik (compro) — migrasi 205/206/207.
//
// Halaman ini adalah SATU-SATUNYA cara mengubah isi halaman depan. Aturan yang
// dijaga: nol string konten di berkas .tsx situs publik. Kalau sebuah kalimat
// bisa berubah tanpa deploy, ia diedit dari sini.
//
// Setelah menyimpan, revalidate dipanggil supaya halaman publik ikut berubah
// dalam hitungan detik — tanpa itu pengunjung tetap melihat versi cache sampai
// 5 menit berlalu, dan admin mengira perubahannya tak tersimpan.
// ─────────────────────────────────────────────────────────────────────────────



/** Varian tampilan seksi — cermin CHECK di migrasi 205. */
const VARIAN = ["baku", "grid", "carousel", "split"] as const;

/**
 * Label manusiawi per kunci konten. Kunci mentah (`hero.sub`) menyulitkan
 * admin menebak apa yang ia ubah dan di mana itu muncul.
 */
const LABEL: Record<string, string> = {
  "merek.nama": "Nama perusahaan",
  "merek.sejak": "Berdiri sejak (tahun)",
  "hero.judul": "Judul utama halaman depan",
  "hero.sub": "Kalimat pendukung di bawah judul",
  "bukti.judul": "Judul seksi linimasa",
  "bukti.sub": "Pengantar seksi linimasa",
  "proses.judul": "Judul seksi urutan membangun",
  "proses.sub": "Pengantar seksi urutan membangun",
  "porto.judul": "Judul seksi portofolio",
  "porto.sub": "Pengantar seksi portofolio",
  "legal.judul": "Judul seksi legalitas",
  "legal.sub": "Pengantar seksi legalitas",
  "kontak.judul": "Judul seksi kontak",
  "kontak.sub": "Pengantar seksi kontak",
  "kontak.whatsapp": "Nomor WhatsApp",
  "kontak.wa_template": "Pesan awal WhatsApp",
  "kontak.email": "Email",
  "kontak.alamat": "Alamat",
  "kontak.nib": "NIB",
  "meta.judul": "Judul untuk mesin pencari",
  "meta.deskripsi": "Deskripsi untuk mesin pencari",
};

const LABEL_SEKSI: Record<string, string> = {
  hero: "Hero (judul utama)",
  bukti: "Linimasa proyek",
  proses: "Urutan membangun",
  portofolio: "Portofolio foto",
  legalitas: "Izin & sertifikat",
  kontak: "Kontak",
};

type Seksi = { kunci: string; aktif: boolean; urutan: number; varian: string };
type Merek = { warna_utama: string; warna_aksen: string; logo_path: string | null };

function hasPerm(key: string): boolean {
  try {
    const raw = localStorage.getItem("puraloka_permissions");
    return raw ? (JSON.parse(raw) as string[]).includes(key) : false;
  } catch { return false; }
}

export default function SitusPage() {
  const mounted = useTerpasang();
  if (!mounted) return null;
  return <SitusContent />;
}

function SitusContent() {
  const canManage = hasPerm("situs:manage");

  const [konten, setKonten] = useState<Record<string, string>>({});
  // Kosong, BUKAN "#003366"/"#FFD600".
  //
  // Default warna merek sudah ada satu-satunya di skema
  // (`situs_merek.warna_utama DEFAULT '#003366'`, migrasi 205). Menuliskannya
  // lagi di sini membuat dua sumber kebenaran yang bisa berbeda diam-diam —
  // dan yang salah adalah yang terlihat pengguna.
  //
  // Aman untuk input terkendali: komponen ini `return` lebih dulu selama
  // `loading`, jadi saat form dirender nilainya sudah datang dari API.
  const [merek, setMerek] = useState<Merek>({
    warna_utama: "", warna_aksen: "", logo_path: null,
  });
  const [simpan, setSimpan] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  /*
    ── PINDAH KE LAPIS CACHE BERSAMA (F4-2), 2026-08-16

    Tiga endpoint independen → tiga `useData`, menggantikan `Promise.all`
    manual. `konten` dan `merek` tetap DRAF yang disunting lokal — nilainya
    dituang lewat `useEffect` begitu data datang, sama seperti perilaku lama.
  */
  const { data: dataKonten, memuat: memuatKonten, galat: galatKonten, muatUlang: muatUlangKonten } =
    useData<{ data: Record<string, unknown> }>("/api/v1/situs/konten");
  const { data: dataSeksi, memuat: memuatSeksi, galat: galatSeksi, muatUlang: muatUlangSeksi } =
    useData<{ data: Seksi[] }>("/api/v1/situs/seksi");
  const { data: dataMerek, memuat: memuatMerek, galat: galatMerek, muatUlang: muatUlangMerek } =
    useData<{ data: Merek | null }>("/api/v1/situs/merek");

  const loading = memuatKonten || memuatSeksi || memuatMerek;
  const galatMuat = galatKonten || galatSeksi || galatMerek;
  const load = useCallback(async () => {
    await Promise.all([muatUlangKonten(), muatUlangSeksi(), muatUlangMerek()]);
  }, [muatUlangKonten, muatUlangSeksi, muatUlangMerek]);

  const seksi = dataSeksi?.data ?? [];

  useEffect(() => {
    if (!dataKonten) return;
    const teks: Record<string, string> = {};
    for (const [kk, vv] of Object.entries(dataKonten.data ?? {})) {
      teks[kk] = typeof vv === "string" ? vv : JSON.stringify(vv);
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setKonten(teks);
  }, [dataKonten]);

  useEffect(() => {
    if (!dataMerek?.data) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMerek(dataMerek.data);
  }, [dataMerek]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  /**
   * Memberi tahu situs publik bahwa isinya berubah.
   *
   * Kegagalannya sengaja TIDAK memunculkan galat merah: penyimpanannya sendiri
   * sudah berhasil, dan halaman akan tetap menyegarkan diri dalam 5 menit.
   * Menampilkan "gagal" untuk hal yang berhasil membuat admin menyimpan
   * berulang kali tanpa perlu.
   */
  const revalidate = useCallback(async () => {
    try { await api.post("/api/v1/situs/revalidate"); } catch { /* lihat komentar */ }
  }, []);

  const simpanKonten = async (kunci: string) => {
    setSimpan(kunci);
    try {
      await api.put("/api/v1/situs/konten", { kunci, nilai: konten[kunci] ?? "" });
      await revalidate();
      setToast({ type: "success", msg: `"${LABEL[kunci] ?? kunci}" tersimpan` });
    } catch (e) {
      const err = e as { response?: { data?: { error?: string } } };
      setToast({ type: "error", msg: err.response?.data?.error ?? "Gagal menyimpan" });
    } finally { setSimpan(null); }
  };

  const simpanMerek = async () => {
    setSimpan("merek");
    try {
      await api.put("/api/v1/situs/merek", merek);
      await revalidate();
      setToast({ type: "success", msg: "Warna merek tersimpan" });
    } catch (e) {
      // Pesan API ditampilkan APA ADANYA — ia sudah menyebut rasio kontras dan
      // latar mana yang gagal. Menggantinya dengan "Terjadi kesalahan"
      // membuang satu-satunya informasi yang bisa ditindaklanjuti admin.
      const err = e as { response?: { data?: { error?: string; detail?: string[] } } };
      const d = err.response?.data;
      setToast({
        type: "error",
        msg: [d?.error, ...(d?.detail ?? [])].filter(Boolean).join(" "),
      });
    } finally { setSimpan(null); }
  };

  const ubahSeksi = async (kunci: string, patch: Partial<Seksi>) => {
    setSimpan(kunci);
    try {
      await api.patch<{ data: Seksi }>("/api/v1/situs/seksi", { kunci, ...patch });
      // Menyegarkan dari server lewat cache, bukan menimpa baris lokal
      // secara manual — `useData` sudah menjaga dedup & invalidasi.
      await muatUlangSeksi();
      await revalidate();
      setToast({ type: "success", msg: `Seksi "${LABEL_SEKSI[kunci] ?? kunci}" diperbarui` });
    } catch (e) {
      const err = e as { response?: { data?: { error?: string } } };
      setToast({ type: "error", msg: err.response?.data?.error ?? "Gagal memperbarui seksi" });
    } finally { setSimpan(null); }
  };

  if (loading) {
    return <div style={{ padding: "var(--pad-kartu-lega)", color: C.muted }}>Memuat konten situs…</div>;
  }

  // Galat MUAT dipisah dari `toast` (dipakai untuk galat AKSI simpan) — satu
  // state untuk keduanya membuat gagal menyimpan menghapus pesan gagal
  // memuat.
  if (galatMuat) {
    return (
      <div style={{ padding: "var(--pad-kartu-lega)" }}>
        <p role="alert" style={{ color: "var(--danger)", fontSize: 13 }}>
          Gagal memuat konten situs.{" "}
          <button onClick={() => void load()} style={{ color: "inherit", background: "none", border: "none", padding: 0, cursor: "pointer", font: "inherit", textDecoration: "underline" }}>
            Coba lagi.
          </button>
        </p>
      </div>
    );
  }

  const kunciKonten = Object.keys(LABEL).filter((k) => k in konten);

  return (
    // `--w-form`: halaman ini formulir satu kolom, bukan tabel padat.
    // Padding & lebar lewat token supaya white-label dan penyetelan kerapatan
    // berlaku di sini juga (penjaga `tata-letak-ratchet` + `kerapatan-ratchet`).
    <div style={{
      padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)",
      width: "100%", maxWidth: "var(--w-page)", margin: "0 auto",
    }}>
      {/* `KepalaHalaman` — lihat catatan di `kontrak/rfi/page.tsx`.
          `<h1>` di sini bahkan tak menyebut `font-display`, jadi judulnya
          memakai huruf badan teks sementara semua halaman lain memakai huruf
          display. */}
      <header style={{ marginBottom: "var(--gap-bagian)" }}>
        <KepalaHalaman judul="Situs Publik" ikon={<Globe size={19} />} />
        <p style={{ color: C.muted, marginTop: 6, fontSize: 13, maxWidth: "72ch" }}>
          Semua teks di halaman depan diedit dari sini. Perubahan langsung terbit —
          tidak perlu memasang ulang aplikasi.
        </p>
      </header>

      {toast && (
        <div
          role="status"
          style={{
            ...GAYA_KARTU, padding: "var(--pad-kartu)", marginBottom: "var(--gap-bagian)", display: "flex", gap: 10,
            alignItems: "flex-start", fontSize: 13,
            borderColor: toast.type === "success" ? "var(--success-border)" : "var(--danger-border)",
            background: toast.type === "success" ? "var(--success-bg)" : "var(--danger-bg)",
            color: toast.type === "success" ? "var(--success)" : "var(--danger)",
          }}
        >
          {toast.type === "success" ? <Check size={16} /> : <AlertTriangle size={16} />}
          <span>{toast.msg}</span>
          <button
            onClick={() => setToast(null)}
            aria-label="Tutup pesan"
            style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "inherit" }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── Seksi ─────────────────────────────────────────────────────────── */}
      <section style={{ ...GAYA_KARTU, padding: "var(--pad-kartu-lega)", marginBottom: "var(--gap-bagian)" }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Seksi halaman</h2>
        <p style={{ color: C.muted, fontSize: 12, marginBottom: 14 }}>
          Matikan seksi untuk menyembunyikannya dari pengunjung. Urutan menentukan
          posisinya dari atas ke bawah.
        </p>
        <div style={{ display: "grid", gap: 8 }}>
          {seksi.map((s) => (
            <div
              key={s.kunci}
              style={{
                display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 10,
                alignItems: "center", padding: "8px 10px",
                border: `1px solid ${C.border}`, borderRadius: 8,
                opacity: s.aktif ? 1 : 0.6,
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 600 }}>
                {LABEL_SEKSI[s.kunci] ?? s.kunci}
              </span>
              <span style={{ fontSize: 12, color: C.muted }}>urutan {s.urutan}</span>
              <select className="isian-fokus"
                value={s.varian}
                disabled={!canManage || simpan === s.kunci}
                onChange={(e) => ubahSeksi(s.kunci, { varian: e.target.value })}
                aria-label={`Varian tampilan ${LABEL_SEKSI[s.kunci] ?? s.kunci}`}
                style={{ ...GAYA_ISIAN, width: "auto", fontSize: 12, padding: "5px 8px" }}
              >
                {VARIAN.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
              <button
                onClick={() => ubahSeksi(s.kunci, { aktif: !s.aktif })}
                disabled={!canManage || simpan === s.kunci}
                title={s.aktif ? "Sembunyikan seksi" : "Tampilkan seksi"}
                style={{
                  display: "flex", alignItems: "center", gap: 6, fontSize: 12,
                  padding: "6px 10px", borderRadius: 6, cursor: canManage ? "pointer" : "not-allowed",
                  border: `1px solid ${C.border}`, background: "var(--surface)", color: C.text,
                }}
              >
                {s.aktif ? <Eye size={14} /> : <EyeOff size={14} />}
                {s.aktif ? "Tampil" : "Disembunyikan"}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* ── Merek ─────────────────────────────────────────────────────────── */}
      <section style={{ ...GAYA_KARTU, padding: "var(--pad-kartu-lega)", marginBottom: "var(--gap-bagian)" }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Warna merek</h2>
        <p style={{ color: C.muted, fontSize: 12, marginBottom: 14, maxWidth: "70ch" }}>
          Warna yang kontrasnya terlalu rendah akan ditolak — halaman publik harus
          tetap terbaca di semua latar. Pesan penolakan menyebut angka dan latar
          yang gagal.
        </p>
        <div style={{ display: "flex", gap: "var(--gap-bagian)", flexWrap: "wrap", alignItems: "flex-end" }}>
          {([
            ["warna_utama", "Warna utama (latar)"],
            ["warna_aksen", "Warna aksen (garis, nomor)"],
          ] as const).map(([field, label]) => (
            <label key={field} style={{ display: "grid", gap: 6, fontSize: 12 }}>
              <span style={{ fontWeight: 600 }}>{label}</span>
              <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="color"
                  value={merek[field]}
                  disabled={!canManage}
                  onChange={(e) => setMerek((m) => ({ ...m, [field]: e.target.value.toUpperCase() }))}
                  aria-label={label}
                  style={{ width: 44, height: 34, border: `1px solid ${C.border}`, borderRadius: 6, padding: 2, cursor: "pointer" }}
                />
                <input className="isian-fokus"
                  type="text"
                  value={merek[field]}
                  disabled={!canManage}
                  onChange={(e) => setMerek((m) => ({ ...m, [field]: e.target.value.toUpperCase() }))}
                  style={{ ...GAYA_ISIAN, width: 100, fontFamily: "ui-monospace, monospace" }}
                />
              </span>
            </label>
          ))}
          <button
            onClick={simpanMerek}
            disabled={!canManage || simpan === "merek"}
            style={{
              display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600,
              padding: "9px 16px", borderRadius: 8, border: "none",
              background: "var(--navy)", color: "var(--on-navy)",
              cursor: canManage ? "pointer" : "not-allowed",
            }}
          >
            <Save size={15} /> {simpan === "merek" ? "Menyimpan…" : "Simpan warna"}
          </button>
        </div>
      </section>

      {/* ── Konten teks ───────────────────────────────────────────────────── */}
      <section style={{ ...GAYA_KARTU, padding: "var(--pad-kartu-lega)" }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Teks halaman</h2>
        <p style={{ color: C.muted, fontSize: 12, marginBottom: 14 }}>
          Ubah lalu simpan per baris. Yang tersimpan langsung terbit.
        </p>
        <div style={{ display: "grid", gap: 12 }}>
          {kunciKonten.map((k) => {
            const panjang = (konten[k] ?? "").length > 70;
            return (
              <div key={k} style={{ display: "grid", gap: 5 }}>
                <label htmlFor={`konten-${k}`} style={{ fontSize: 12, fontWeight: 600 }}>
                  {LABEL[k]}
                  <span style={{ color: C.muted, fontWeight: 400, marginLeft: 8, fontFamily: "ui-monospace, monospace", fontSize: 11 }}>
                    {k}
                  </span>
                </label>
                <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  {panjang ? (
                    <textarea className="isian-fokus"
                      id={`konten-${k}`}
                      value={konten[k] ?? ""}
                      disabled={!canManage}
                      rows={3}
                      onChange={(e) => setKonten((c) => ({ ...c, [k]: e.target.value }))}
                      style={{ ...GAYA_ISIAN, resize: "vertical" }}
                    />
                  ) : (
                    <input className="isian-fokus"
                      id={`konten-${k}`}
                      type="text"
                      value={konten[k] ?? ""}
                      disabled={!canManage}
                      onChange={(e) => setKonten((c) => ({ ...c, [k]: e.target.value }))}
                      style={GAYA_ISIAN}
                    />
                  )}
                  <button
                    onClick={() => simpanKonten(k)}
                    disabled={!canManage || simpan === k}
                    aria-label={`Simpan ${LABEL[k]}`}
                    style={{
                      display: "flex", alignItems: "center", gap: 5, fontSize: 12,
                      padding: "8px 12px", borderRadius: 6, flexShrink: 0,
                      border: `1px solid ${C.border}`, background: "var(--surface)", color: C.text,
                      cursor: canManage ? "pointer" : "not-allowed",
                    }}
                  >
                    {simpan === k ? <RefreshCw size={13} /> : <Save size={13} />}
                    Simpan
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
