"use client";

/**
 * PENGATURAN → KANAL WHATSAPP
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA VERIFIKASI JADI PUSAT HALAMAN INI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Nomor yang terdaftar tanpa diverifikasi TIDAK bisa dipakai — dan itu bukan
 * detail teknis yang bisa disembunyikan. Siapa pun bisa mengetik nomor orang
 * lain; tanpa verifikasi, mendaftarkan nomor atasan sudah cukup untuk membaca
 * data yang jadi wewenangnya.
 *
 * Jadi status verifikasi adalah hal PERTAMA yang terlihat di tiap baris, bukan
 * lencana kecil di ujung. Admin yang melihat "menunggu verifikasi" tahu
 * nomornya belum berfungsi, alih-alih menunggu notifikasi yang tak akan datang.
 *
 * ── Kenapa kesiapan kanal dinyatakan di atas
 *
 * Tombol "Kirim kode" yang gagal setelah diklik memberi tahu terlambat. Kalau
 * kredensial Evolution belum dipasang, itu dinyatakan di kartu paling atas
 * lengkap dengan tautan ke halaman Kredensial — sebelum orang mengetik apa pun.
 *
 * ── Warna
 *
 * `ARAH-VISUAL-2026.md` §3d: satu aksen per layar. Navy hanya untuk tombol
 * aksi utama (Kirim kode). Hijau/oranye hanya untuk status verifikasi yang
 * memang perlu dibedakan sekilas.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useIzin } from "@/lib/use-izin";
import { api, getStoredUser } from "@/lib/api";
import { useData } from "@/lib/data-cache";
import {
  AlertTriangle, CheckCircle2, Info, Loader2, MessageCircle, Plus, ShieldAlert,
} from "lucide-react";

import { C } from "@/lib/warna-ui";
import { KepalaHalaman } from "@/components/dasar";
import { GAYA_KARTU } from "@/components/ui-dasar";
import { GAYA_ISIAN } from "@/components/isian";
import KartuSambungan from "./_sambungan";
import { PanduanHalaman } from "@/components/panduan-halaman";
import { Saklar } from "@/components/saklar";
import { Pilihan } from "@/components/pilihan";



interface Nomor {
  id: string;
  user_id: string;
  /**
   * Pemilik nomor — join dari `users` lewat `wa_nomor_pengguna_user_id_fkey`.
   *
   * Opsional karena PostgREST mengembalikan `null` bila barisnya tak ada
   * (pengguna terhapus). Halaman WAJIB menyiapkan keadaan itu: baris nomor
   * tanpa identitas apa pun terbaca sebagai galat tampilan, bukan sebagai
   * fakta bahwa pemiliknya sudah tidak ada.
   */
  pemilik: { id: string; name: string; email: string } | null;
  nomor: string;
  terverifikasi_pada: string | null;
  aktif: boolean;
  percobaan_gagal: number;
  dibuat_pada: string;
}

interface Muatan {
  data: Nomor[];
  kanal_siap: boolean;
}


/** `628123456789` → `+62 812-3456-789` — dibaca manusia, disimpan mesin. */
function tampilNomor(n: string): string {
  if (n.length < 8) return n;
  return `+${n.slice(0, 2)} ${n.slice(2, 5)}-${n.slice(5, 9)}-${n.slice(9)}`;
}

export default function WhatsAppPage() {
  const bolehKelola = useIzin("settings:wa:manage");

  /*
    ── PINDAH KE LAPIS CACHE BERSAMA (F4-2), 2026-08-16

    `useData` menggantikan useCallback+useEffect+queueMicrotask.
  */
  const { data: muatan, memuat, galat: galatMuat, muatUlang } = useData<Muatan>("/api/v1/wa/nomor");
  const muat = useCallback(async () => { await muatUlang(); }, [muatUlang]);
  const [nomorBaru, setNomorBaru] = useState("");
  /**
   * Siapa pemilik nomor yang sedang didaftarkan. Bawaannya diri sendiri —
   * kasus terbanyak, dan tetap satu klik.
   */
  const [pemilikBaru, setPemilikBaru] = useState("");
  const [pengguna, setPengguna] = useState<Array<{ id: string; name: string }>>([]);
  const [akuId, setAkuId] = useState("");
  const [sedang, setSedang] = useState<string | null>(null);
  const [kode, setKode] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<{ tipe: "ok" | "err"; pesan: string } | null>(null);

  /*
    Daftar orang untuk pemilih "nomor ini milik".

    Kegagalannya SENGAJA tak memunculkan galat merah: halaman ini tetap
    berguna tanpa daftar orang (melihat nomor terdaftar, memverifikasi,
    menonaktifkan). Yang hilang hanya kemampuan mendaftarkan untuk orang
    lain, dan pemilihnya sendiri sudah menunjukkan kekosongan itu.

    `/api/v1/users` sudah tersaring tenant di server (`idAnggotaCompany`),
    jadi tak ada penyaringan tambahan di sini yang bisa menyimpang darinya.
  */
  useEffect(() => {
    let batal = false;
    const aku = getStoredUser();
    if (aku?.id) { setAkuId(aku.id); setPemilikBaru((k) => k || aku.id); }
    api.get<{ users: Array<{ id: string; name: string }> }>("/api/v1/users")
      .then(({ data }) => {
        if (batal) return;
        const daftarOrang = data.users ?? [];
        setPengguna(daftarOrang);
        // Kalau akun sendiri tak ada di daftar (mis. bukan anggota company
        // aktif), jatuh ke orang pertama supaya pemilihnya tak pernah
        // mengirim string kosong sebagai `user_id`.
        setPemilikBaru((k) => k || daftarOrang[0]?.id || "");
      })
      .catch(() => { /* lihat komentar di atas */ });
    return () => { batal = true; };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  function pesanGalat(e: unknown, bawaan: string): string {
    return (
      (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? bawaan
    );
  }

  async function daftarkan() {
    const n = nomorBaru.trim();
    if (!n) return;
    setSedang("__daftar__");
    try {
      // `user_id` IKUT DIKIRIM. Tanpa ini, rute jatuh ke
      // `request.currentUser.id` — dan setiap nomor menempel diam-diam ke
      // orang yang sedang membuka halaman, berapa pun nama yang dipilih di
      // pemilih. Cacat yang paling sunyi: layarnya bertanya, jawabannya
      // dibuang di jalan.
      await api.post("/api/v1/wa/nomor", { nomor: n, user_id: pemilikBaru || undefined });
      const namaPemilik = pengguna.find((u) => u.id === pemilikBaru)?.name;
      setToast({
        tipe: "ok",
        pesan: namaPemilik
          // Menyebut NAMANYA, bukan cuma nomornya: yang perlu dipastikan orang
          // sesudah menekan tombol adalah "menempel ke siapa", dan itu
          // satu-satunya bagian yang tak bisa ia baca ulang dari isian.
          ? `Kode verifikasi dikirim ke ${n} — untuk ${namaPemilik}. Berlaku 10 menit.`
          : `Kode verifikasi dikirim ke ${n}. Berlaku 10 menit.`,
      });
      setNomorBaru("");
      await muat();
    } catch (e) {
      setToast({ tipe: "err", pesan: pesanGalat(e, "Gagal mendaftarkan nomor") });
      // Daftar tetap dimuat ulang: nomornya mungkin TERSIMPAN meski kodenya
      // gagal terkirim (503 dari rute), dan menyembunyikannya membuat orang
      // mendaftar ulang nomor yang sudah ada.
      await muat();
    } finally {
      setSedang(null);
    }
  }

  async function verifikasi(n: Nomor) {
    const k = (kode[n.id] ?? "").trim();
    if (!/^\d{6}$/.test(k)) {
      setToast({ tipe: "err", pesan: "Kode harus 6 digit" });
      return;
    }
    setSedang(n.id);
    try {
      await api.post(`/api/v1/wa/nomor/${n.id}/verifikasi`, { kode: k });
      setToast({ tipe: "ok", pesan: `${tampilNomor(n.nomor)} terverifikasi` });
      setKode((s) => ({ ...s, [n.id]: "" }));
      await muat();
    } catch (e) {
      setToast({ tipe: "err", pesan: pesanGalat(e, "Kode salah") });
      await muat();
    } finally {
      setSedang(null);
    }
  }

  async function ubahAktif(n: Nomor) {
    setSedang(n.id);
    try {
      await api.patch(`/api/v1/wa/nomor/${n.id}`, { aktif: !n.aktif });
      await muat();
    } catch (e) {
      setToast({ tipe: "err", pesan: pesanGalat(e, "Gagal mengubah status") });
    } finally {
      setSedang(null);
    }
  }

  const daftar = muatan?.data ?? [];

  return (
    <div
      style={{
        padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)",
        width: "100%",
        // `--w-page`, sama alasannya dengan Penyedia AI & layout Asisten:
        // halaman ini memuat kartu QR berdampingan dengan langkahnya, plus
        // daftar nomor. Dikurung 900px, panel QR dan petunjuknya bertumpuk
        // sementara separuh layar menganggur.
        maxWidth: "var(--w-page)",
        margin: "0 auto",
      }}
    >
      {toast && (
        <div
          role="status"
          style={{
            position: "fixed", top: 16, right: 16, zIndex: 60, maxWidth: 380,
            padding: "var(--pad-kartu)", borderRadius: 8, fontSize: 13, lineHeight: 1.55,
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
          judul="Kanal WhatsApp"
          keterangan="Nomor yang boleh bertanya ke asisten dan menerima notifikasi."
          ikon={<MessageCircle size={19} />}
        />
      </div>

      {/*
        Dua hal berbeda di halaman ini sering tertukar, dan panduan menyebut
        bedanya lebih dulu: nomor PENGIRIM (satu, milik perusahaan) vs nomor
        PENERIMA (banyak, milik orang). Tanpa itu, daftar di bawah terbaca
        seperti "nomor-nomor yang mengirim pesan".
      */}
      <PanduanHalaman
        untuk={
          <>
            Ada <strong>dua hal berbeda</strong> di sini. <strong>Sambungan</strong> adalah nomor
            perusahaan yang MENGIRIM pesan — satu saja. <strong>Daftar nomor</strong> di bawahnya
            adalah orang-orang yang boleh bertanya ke asisten dan menerima notifikasi.
          </>
        }
        langkah={[
          { teks: "Sambungkan nomor perusahaan dengan memindai QR", selesai: Boolean(muatan?.kanal_siap) },
          { teks: "Daftarkan nomor tiap orang yang perlu memakai asisten" },
          { teks: "Minta mereka memasukkan kode 6 digit — nomor yang belum diverifikasi tidak berfungsi" },
        ]}
        catatan="Asisten TIDAK akan membalas nomor yang tak terdaftar — ia diam sama sekali, tanpa memberi tahu penanyanya. Wewenang tiap orang mengikuti perannya di aplikasi, bukan diatur terpisah di sini."
      />

      {/* ── Kesiapan kanal — dinyatakan SEBELUM orang mengetik ── */}
      {!memuat && muatan && !muatan.kanal_siap && (
        <div
          style={{
            ...GAYA_KARTU, padding: "var(--pad-kartu)", marginBottom: "var(--gap-bagian)",
            display: "flex", gap: 10,
            borderColor: "var(--warning)", background: "var(--warning-bg)",
          }}
        >
          <ShieldAlert size={18} style={{ color: "var(--warning)", flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 13, color: C.text, lineHeight: 1.6 }}>
            {/*
              `WA_INSTANCE` sengaja TIDAK lagi disebut di sini.

              Sebelumnya kalimat ini menyuruh mengetiknya sendiri di halaman
              Kredensial — dan nama yang diketik manusia bisa bentrok dengan
              milik tenant lain di server Evolution yang sama. Yang kalah tak
              menerima galat; ia hanya memakai instance milik orang lain.

              Sekarang namanya diturunkan dari `company_id` oleh kartu
              Sambungan di bawah. Yang tersisa untuk diisi manual hanya alamat
              server dan kuncinya.
            */}
            <strong>Kanal belum terhubung.</strong> Nomor bisa didaftarkan, tetapi kode
            verifikasi tak akan terkirim sampai <code>WA_BASE_URL</code> dan{" "}
            <code>WA_API_KEY</code> diisi di{" "}
            <a href="/pengaturan/kredensial" style={{ color: C.aksen, textDecoration: "none", fontWeight: 600 }}>
              halaman Kredensial
            </a>
            . Instance-nya dibuat dari kartu <strong>Sambungan</strong> di bawah.
          </div>
        </div>
      )}

      {/* ── Sambungan: instance + QR, tanpa membuka Evolution sama sekali ── */}
      <KartuSambungan bolehKelola={bolehKelola} onToast={setToast} />

      {!bolehKelola && (
        <div style={{ ...GAYA_KARTU, padding: "var(--pad-kartu)", marginBottom: "var(--gap-bagian)", display: "flex", gap: 10 }}>
          <Info size={18} style={{ color: C.mid, flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 13, color: C.mid, lineHeight: 1.6 }}>
            Anda bisa melihat nomor terdaftar, tetapi tidak mengubahnya.
            Butuh kapabilitas <code>settings:wa:manage</code>.
          </div>
        </div>
      )}

      {/* ── Daftarkan nomor ── */}
      <section style={{ ...GAYA_KARTU, padding: "var(--pad-kartu-lega)", marginBottom: "var(--gap-bagian)" }}>
        <h2 style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: C.muted, margin: "0 0 10px" }}>
          Daftarkan nomor
        </h2>
        {/*
          DUA isian, bukan satu — "milik siapa" dan "nomor berapa".

          Sebelum ini formnya hanya menerima nomor, dan `daftarkan()` mengirim
          `{ nomor }` saja. Akibatnya setiap nomor menempel ke DIRI SENDIRI,
          diam-diam — padahal API menerima `user_id` dan memang dirancang
          supaya admin bisa mendaftarkan nomor untuk orang lain.

          Itulah sebabnya pertanyaan founder ("nyambungin ke user gimana?")
          tak punya jawaban: layarnya tak pernah menanyakan siapa, jadi tak
          pernah bisa menampilkan siapa. Kemampuannya ada di server dan
          hilang di jalan menuju layar.

          Bawaannya diri sendiri — kasus terbanyak, dan tetap satu klik.
        */}
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 200px", minWidth: 0 }}>
            <label htmlFor="pemilik-baru" style={{ display: "block", fontSize: "var(--t-kecil)", fontWeight: 600, color: C.mid, marginBottom: 4 }}>
              Nomor ini milik
            </label>
            <Pilihan className="isian-fokus"
              id="pemilik-baru"
              value={pemilikBaru}
              onChange={(e) => setPemilikBaru(e.target.value)}
              disabled={!bolehKelola || sedang === "__daftar__"}
              style={GAYA_ISIAN}
            >
              {pengguna.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}{u.id === akuId ? " (saya)" : ""}
                </option>
              ))}
            </Pilihan>
            <p style={{ fontSize: "var(--t-kecil)", color: C.muted, lineHeight: 1.55, margin: "6px 0 0" }}>
              Asisten menjawab memakai wewenang orang ini — bukan wewenang Anda.
            </p>
          </div>
          <div style={{ flex: "1 1 220px", minWidth: 0 }}>
            <label htmlFor="nomor-baru" style={{ display: "block", fontSize: "var(--t-kecil)", fontWeight: 600, color: C.mid, marginBottom: 4 }}>
              Nomor WhatsApp
            </label>
            <input className="isian-fokus"
              id="nomor-baru"
              value={nomorBaru}
              onChange={(e) => setNomorBaru(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") daftarkan(); }}
              placeholder="08123456789 atau +628123456789"
              disabled={!bolehKelola || sedang === "__daftar__"}
              style={GAYA_ISIAN}
            />
            <p style={{ fontSize: "var(--t-kecil)", color: C.muted, lineHeight: 1.55, margin: "6px 0 0" }}>
              Kode 6 digit dikirim ke nomor itu. Nomor baru berfungsi setelah kodenya
              dimasukkan — mengetik nomor saja tidak cukup.
            </p>
          </div>
          <button
            type="button"
            onClick={daftarkan}
            disabled={!bolehKelola || !nomorBaru.trim() || sedang === "__daftar__"}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              // Sejajar dengan ISIAN, bukan dengan labelnya: kedua kolom kini
              // punya label di atas, dan tombol yang rata-atas akan berdiri
              // sejajar tulisan "Nomor ini milik" alih-alih kotak isiannya.
              marginTop: 21,
              padding: "var(--pad-tombol)", borderRadius: 7, fontSize: 13,
              fontWeight: 550, border: "1px solid transparent", whiteSpace: "nowrap",
              background: bolehKelola && nomorBaru.trim() ? "var(--grad-aksen)" : "var(--surface-subtle)",
              color: bolehKelola && nomorBaru.trim() ? "var(--on-aksen)" : C.muted,
              cursor: bolehKelola && nomorBaru.trim() ? "pointer" : "not-allowed",
              fontFamily: "inherit",
            }}
          >
            {sedang === "__daftar__" ? <Loader2 size={14} className="berputar" /> : <Plus size={14} />}
            Kirim kode
          </button>
        </div>
      </section>

      {/* ── Daftar nomor ── */}
      {memuat ? (
        <div style={{ ...GAYA_KARTU, padding: "var(--pad-kartu-lega)", textAlign: "center", color: C.muted, fontSize: 13 }}>
          Memuat…
        </div>
      ) : galatMuat ? (
        <div role="alert" style={{ ...GAYA_KARTU, padding: "var(--pad-kartu-lega)", display: "flex", gap: 10 }}>
          <AlertTriangle size={18} style={{ color: "var(--danger)", flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 13, color: C.text, lineHeight: 1.65 }}>
            Gagal memuat daftar nomor.{" "}
            <button type="button" onClick={() => void muat()} style={{ color: C.aksen, background: "none", border: "none", padding: 0, cursor: "pointer", font: "inherit", textDecoration: "underline" }}>
              Coba lagi.
            </button>
          </div>
        </div>
      ) : daftar.length === 0 ? (
        <div style={{ ...GAYA_KARTU, padding: "var(--pad-kartu-lega)", display: "flex", gap: 10 }}>
          <Info size={18} style={{ color: C.mid, flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 13, color: C.mid, lineHeight: 1.65 }}>
            Belum ada nomor terdaftar. Selama daftarnya kosong, asisten hanya bisa diakses
            lewat aplikasi — dan tak ada notifikasi WhatsApp yang terkirim.
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {daftar.map((n) => {
            const sudah = Boolean(n.terverifikasi_pada);
            const idKode = `kode-${n.id}`;
            return (
              <section key={n.id} style={{ ...GAYA_KARTU, padding: "var(--pad-kartu-lega)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: sudah ? 0 : 12 }}>
                  {/* Status verifikasi PERTAMA, bukan lencana di ujung: nomor
                      yang belum terverifikasi tak berfungsi, dan itu harus
                      terbaca sebelum apa pun yang lain. */}
                  {sudah ? (
                    <CheckCircle2
                      size={16}
                      style={{ color: n.aktif ? "var(--success)" : C.muted, flexShrink: 0 }}
                    />
                  ) : (
                    <AlertTriangle
                      size={16}
                      style={{ color: n.aktif ? "var(--warning)" : C.muted, flexShrink: 0 }}
                    />
                  )}
                  {/*
                    Nomor nonaktif diredupkan lewat WARNA, bukan `opacity`.

                    `opacity: 0.5` pada #111827 di atas putih menghasilkan
                    #888C93 — diukur 3,38 : 1, di bawah ambang AA 4,5.
                    axe menandainya `color-contrast`, dan itu benar: yang
                    diredupkan di sini NOMOR TELEPON, satu-satunya cara
                    membedakan baris ini dari baris lain.

                    `C.muted` sudah 4,83 : 1 — lolos AA tanpa mengarang nilai
                    baru, dan tetap terbaca jelas lebih redup dari yang aktif.
                  */}
                  {/*
                    NAMA PEMILIK di depan, nomornya di belakang sebagai
                    keterangan.

                    Founder bertanya 2026-08-14: "cara tau nomor itu nyambung
                    ke user siapa gimana caranya?" — dan jawabannya, lewat
                    layar ini, TIDAK BISA. `user_id` sudah dikirim API sejak
                    awal dan dideklarasikan di `interface Nomor` di berkas ini,
                    lalu tak pernah dirender sekali pun.

                    Yang kurang bukan penjelasan, melainkan datanya. Menambah
                    paragraf "nomor tersambung ke pengguna lewat verifikasi"
                    tak akan menjawab pertanyaannya; menampilkan namanya
                    menjawabnya tanpa satu kalimat pun.

                    Urutannya sengaja dibalik dari versi lama. Endpoint ini
                    boleh mendaftarkan nomor UNTUK ORANG LAIN (`user_id` di
                    body POST), jadi pertanyaan pertama yang dibawa orang ke
                    layar ini adalah "punya siapa", bukan "nomor berapa".
                    Nomornya tetap ada — ia yang membedakan dua nomor milik
                    orang yang sama.

                    Kalau nama tak ada (pengguna terhapus, atau join gagal),
                    nomornya NAIK jadi label utama alih-alih menyisakan baris
                    tanpa identitas. Yang tak dikenal ditulis apa adanya
                    sebagai "pengguna terhapus" — bukan dikosongkan, karena
                    baris tanpa penjelasan terbaca sebagai galat tampilan.
                  */}
                  <span style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
                    <span
                      style={{
                        fontSize: 14, fontWeight: 600,
                        color: n.aktif ? C.text : C.muted,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}
                    >
                      {n.pemilik?.name ?? "Pengguna terhapus"}
                    </span>
                    <span
                      style={{
                        fontSize: 12.5,
                        color: C.muted,
                        fontFamily: "var(--font-mono, monospace)",
                      }}
                    >
                      {tampilNomor(n.nomor)}
                    </span>
                  </span>
                  {/*
                    Lencana MENYATU dengan status aktif, bukan dua penanda
                    terpisah. Tangkapan layar pertama menyingkapnya: nomor
                    nonaktif tampil hijau "Terverifikasi" di sebelah tombol
                    "Aktifkan" — dua tanda yang sekilas saling membantah.

                    Yang menentukan bisa-tidaknya nomor dipakai adalah KEDUANYA:
                    terverifikasi DAN aktif. Jadi lencananya menyatakan hasil
                    akhirnya, bukan salah satu syaratnya.
                  */}
                  <span
                    style={{
                      fontSize: "var(--t-kecil)", padding: "var(--pad-lencana)", borderRadius: 999,
                      whiteSpace: "nowrap",
                      color: !n.aktif ? C.muted : sudah ? "var(--success)" : "var(--warning)",
                      background: !n.aktif
                        ? "var(--surface-subtle)"
                        : sudah ? "var(--success-bg)" : "var(--warning-bg)",
                      border: `1px solid ${
                        !n.aktif ? C.border : sudah ? "var(--success)" : "var(--warning)"
                      }`,
                    }}
                  >
                    {!n.aktif
                      ? sudah ? "Nonaktif (terverifikasi)" : "Nonaktif"
                      : sudah ? "Terverifikasi" : "Menunggu verifikasi"}
                  </span>

                  <div style={{ flex: 1 }} />
                  <button
                    type="button"
                    onClick={() => ubahAktif(n)}
                    disabled={!bolehKelola || sedang === n.id}
                    style={{
                      padding: "var(--pad-lencana)", borderRadius: 6,
                      border: `1px solid ${C.border}`, background: "var(--surface-subtle)",
                      color: C.mid, fontSize: "var(--t-kecil)", fontFamily: "inherit",
                      cursor: bolehKelola ? "pointer" : "not-allowed", whiteSpace: "nowrap",
                    }}
                  >
                    {n.aktif ? "Nonaktifkan" : "Aktifkan"}
                  </button>
                </div>

                {!sudah && (
                  <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <div style={{ width: 140 }}>
                      <label htmlFor={idKode} style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
                        Kode verifikasi untuk {tampilNomor(n.nomor)}
                      </label>
                      <input className="isian-fokus"
                        id={idKode}
                        value={kode[n.id] ?? ""}
                        onChange={(e) => setKode((s) => ({ ...s, [n.id]: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === "Enter") verifikasi(n); }}
                        placeholder="6 digit"
                        inputMode="numeric"
                        maxLength={6}
                        disabled={!bolehKelola || sedang === n.id}
                        style={{ ...GAYA_ISIAN, letterSpacing: "0.15em", textAlign: "center" }}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => verifikasi(n)}
                      disabled={!bolehKelola || sedang === n.id}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 6,
                        padding: "var(--pad-tombol)", borderRadius: 7, fontSize: 13,
                        fontWeight: 550, border: `1px solid ${C.border}`,
                        background: "var(--surface-subtle)", color: C.text,
                        cursor: bolehKelola ? "pointer" : "not-allowed", fontFamily: "inherit",
                      }}
                    >
                      {sedang === n.id ? <Loader2 size={14} className="berputar" /> : null}
                      Verifikasi
                    </button>

                    {n.percobaan_gagal > 0 && (
                      <span style={{ fontSize: "var(--t-kecil)", color: "var(--warning)", alignSelf: "center", lineHeight: 1.5 }}>
                        {n.percobaan_gagal} percobaan gagal
                        {n.percobaan_gagal >= 5 ? " — daftarkan ulang untuk kode baru" : ""}
                      </span>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      <p style={{ fontSize: "var(--t-kecil)", color: C.muted, lineHeight: 1.6, margin: "14px 2px 0" }}>
        Nomor terikat ke akun pengguna, bukan sekadar daftar putih. Mencabut keanggotaan
        seseorang di perusahaan ini langsung menutup akses WhatsApp-nya — tanpa perlu
        menghapus nomornya di sini.
      </p>

      <PanelTemplate bolehUbah={useIzin("settings:wa:template")} />
    </div>
  );
}

interface Template {
  id: string;
  kode: string;
  label: string;
  isi: string;
  variabel: string[];
  aktif: boolean;
}

/** Placeholder yang dipakai sebuah teks — cermin `variabelDipakai` di API. */
function variabelDipakai(isi: string): string[] {
  return [...new Set([...isi.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]))];
}

/**
 * Contoh nilai untuk PRATINJAU.
 *
 * Nilai contoh, bukan nilai sungguhan: yang menyunting perlu melihat BENTUK
 * pesannya, dan kode verifikasi sungguhan tak boleh ada di layar pengaturan.
 * Yang tak dikenal ditampilkan sebagai nama variabelnya dalam kurung siku,
 * supaya jelas bagian itu diisi sistem — bukan tampak seperti teks kosong.
 */
const CONTOH: Record<string, string> = {
  kode: "482913",
  menit: "10",
  nama: "Budi Santoso",
  proyek: "Renovasi Kantor Pusat",
};
const contohNilai = (v: string) => CONTOH[v] ?? `[${v}]`;

/**
 * ISI PESAN sebagai data, bukan kode.
 *
 * Sebelum migrasi 270, tiap teks WhatsApp adalah literal di
 * `wa-nomor.ts:142` dan `wa-webhook.ts:200` — mengubah satu kata butuh
 * deploy, dan pemilik yang ingin nada pesannya berbeda tak punya jalan.
 *
 * Ditaruh di halaman yang SAMA dengan nomor, bukan halaman baru: keduanya
 * jawaban untuk satu pertanyaan ("kenapa pesannya begitu?"), dan memisahkannya
 * menuntut orang mengingat ada dua tempat.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PRATINJAU, DAN KENAPA IA TAK BOLEH JADI ATURAN KEDUA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Versi pertama panel ini hanya kotak teks. Saya menilainya sendiri dari
 * tangkapan layar dan menolaknya: seluruh guna template adalah APA YANG
 * DITERIMA ORANG, dan kotak berisi `{{kode}}` mentah tak menunjukkan itu.
 * Yang menyunting harus membayangkan hasilnya — dan yang dibayangkan tak
 * pernah salah, jadi salah ketik tak pernah tertangkap mata.
 *
 * Yang TIDAK dilakukan: menulis ulang aturan penolakan di sini. Pratinjau ini
 * hanya menandai variabel asing dan menampilkan contohnya; keputusan
 * menerima/menolak tetap milik `render()` di API. Dua tempat yang sama-sama
 * memutuskan akan berbeda pendapat cepat atau lambat, dan yang menang adalah
 * yang tak terlihat.
 *
 * ── Kenapa variabel bisa DIKLIK
 *
 * "Variabel: {{kode}} {{menit}}" sebagai teks mati menuntut orang mengetik
 * ulang persis — termasuk kurung ganda dan ejaannya. Itu justru cara utama
 * salah ketik masuk, dan aturan daftar-tertutup lalu menolak simpanannya.
 * Menyisipkan lewat klik menghapus seluruh kelas kesalahan itu.
 */
function PanelTemplate({ bolehUbah }: { bolehUbah: boolean }) {
  const [draf, setDraf] = useState<Record<string, string>>({});
  const [sedang, setSedang] = useState<string | null>(null);
  const [pesan, setPesan] = useState<{ tipe: "ok" | "err"; teks: string } | null>(null);
  const acuan = useRef<Record<string, HTMLTextAreaElement | null>>({});

  /*
    ── PINDAH KE LAPIS CACHE BERSAMA (F4-2), 2026-08-16

    `useData` menggantikan useCallback+useEffect+queueMicrotask. Urutan tetap
    DITETAPKAN di sini lewat `useMemo`, bukan mengikuti `kode` dari API —
    lihat alasannya di bawah.
  */
  const { data, memuat, galat: galatMuat, muatUlang } = useData<{ data: Template[] }>("/api/v1/wa/template");
  const muat = useCallback(async () => { await muatUlang(); }, [muatUlang]);

  const daftar = useMemo(() => {
    /*
     * Urutan DITETAPKAN di sini, bukan mengikuti `kode` dari API.
     *
     * Alfabetis menaruh `asisten_gagal` di atas dan `verifikasi_nomor` —
     * satu-satunya yang dilihat pelanggan yang sedang menunggu — di paling
     * bawah. Urutan yang tak berarti apa-apa tetap mengajarkan sesuatu ke
     * pembacanya, dan yang diajarkannya di sini keliru.
     */
    const urut = ["verifikasi_nomor", "asisten_tanpa_izin", "asisten_gagal"];
    const peringkat = (k: string) => {
      const i = urut.indexOf(k);
      return i === -1 ? urut.length : i;
    };
    return [...(data?.data ?? [])].sort(
      (a, b) => peringkat(a.kode) - peringkat(b.kode) || a.kode.localeCompare(b.kode),
    );
  }, [data]);


  async function simpan(t: Template, ubahan: { isi?: string; aktif?: boolean }) {
    setSedang(t.id);
    try {
      await api.put("/api/v1/wa/template", { id: t.id, ...ubahan });
      setPesan({ tipe: "ok", teks: `Template "${t.label}" tersimpan.` });
      setDraf((d) => { const x = { ...d }; delete x[t.id]; return x; });
      await muat();
    } catch (e) {
      setPesan({
        tipe: "err",
        teks:
          (e as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          "Gagal menyimpan template",
      });
    } finally {
      setSedang(null);
    }
  }

  /** Menyisipkan `{{v}}` di posisi kursor, bukan di ujung teks. */
  function sisipkan(t: Template, v: string) {
    const ta = acuan.current[t.id];
    const isi = draf[t.id] ?? t.isi;
    const a = ta?.selectionStart ?? isi.length;
    const b = ta?.selectionEnd ?? isi.length;
    const baru = `${isi.slice(0, a)}{{${v}}}${isi.slice(b)}`;
    setDraf((d) => ({ ...d, [t.id]: baru }));
    // Kursor dikembalikan ke SESUDAH sisipan supaya mengetik bisa lanjut —
    // tanpa ini kursor melompat ke awal dan kalimat tersusun terbalik.
    requestAnimationFrame(() => {
      const p = a + v.length + 4;
      ta?.focus();
      ta?.setSelectionRange(p, p);
    });
  }

  if (memuat) return null;

  // Galat MUAT dan galat AKSI (simpan template) sengaja terpisah — satu
  // state untuk keduanya membuat gagal menyimpan menghapus pesan gagal
  // memuat, dan daftar kosong (galat) tak bisa dibedakan dari daftar yang
  // memang belum berisi template.
  if (galatMuat) {
    return (
      <section style={{ ...GAYA_KARTU, padding: "var(--pad-kartu-lega)", marginTop: 16 }}>
        <p role="alert" style={{ fontSize: 13, color: "var(--danger)", margin: 0 }}>
          Gagal memuat template.{" "}
          <button type="button" onClick={() => void muat()} style={{ color: "inherit", background: "none", border: "none", padding: 0, cursor: "pointer", font: "inherit", textDecoration: "underline" }}>
            Coba lagi.
          </button>
        </p>
      </section>
    );
  }

  return (
    <section style={{ ...GAYA_KARTU, padding: "var(--pad-kartu-lega)", marginTop: 16 }}>
      <h2 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 4px", color: C.text }}>
        Isi pesan
      </h2>
      <p style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.6, margin: "0 0 16px" }}>
        Teks yang dikirim ke WhatsApp. Bagian dalam <code>{"{{ }}"}</code> diisi sistem —
        klik namanya untuk menyisipkan. Yang di luar daftar ditolak saat disimpan, supaya
        pesan berlubang tak sampai ke penerima.
      </p>

      <div style={{ display: "grid", gap: 18 }}>
        {daftar.map((t) => {
          const nilai = draf[t.id] ?? t.isi;
          const berubah = draf[t.id] !== undefined && draf[t.id] !== t.isi;
          const asing = variabelDipakai(nilai).filter((v) => !t.variabel.includes(v));
          const pratinjau = nilai.replace(/\{\{(\w+)\}\}/g, (_, k: string) => contohNilai(k));
          const sibuk = sedang === t.id;

          return (
            <div key={t.id} style={{ display: "grid", gap: 7 }}>
              {/* Judul + kode + saklar aktif. Kode DIIKAT ke judulnya, bukan
                  melayang di ujung kanan seperti label tanpa tuan. */}
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{t.label}</span>
                <code
                  style={{
                    fontSize: "var(--t-mikro)",
                    color: C.muted,
                    background: "var(--surface-2)",
                    padding: "1px 6px",
                    borderRadius: 5,
                  }}
                >
                  {t.kode}
                </code>
                <span style={{ flex: 1 }} />
                {bolehUbah && (
                  <Saklar
                    nyala={t.aktif}
                    nonaktif={sibuk}
                    onUbah={(v) => simpan(t, { aktif: v })}
                    label="Aktif"
                  />
                )}
              </div>

              {/*
                Template NONAKTIF dinyatakan, bukan hanya ditandai centang mati.
                `render()` menolaknya dan pemanggil jatuh ke teks bawaan — jadi
                yang terkirim BUKAN yang tertulis di kotak ini.
              */}
              {!t.aktif && (
                <p style={{ fontSize: "var(--t-kecil)", color: C.warning, margin: 0 }}>
                  Nonaktif — yang terkirim adalah teks bawaan sistem, bukan yang di bawah.
                </p>
              )}

              <textarea
                ref={(el) => { acuan.current[t.id] = el; }}
                value={nilai}
                disabled={!bolehUbah}
                rows={Math.max(2, nilai.split("\n").length)}
                aria-label={`Isi pesan — ${t.label}`}
                aria-invalid={asing.length > 0}
                onChange={(e) => setDraf((d) => ({ ...d, [t.id]: e.target.value }))}
                className="isian-fokus"
                style={{
                  ...GAYA_ISIAN,
                  lineHeight: 1.6,
                  resize: "vertical",
                  // Border merah saat template memuat variabel yang tak dikenal:
                  // `aria-invalid` di atas memberi tahu pembaca layar, dan ini
                  // memberi tahu yang melihat. Cincin fokusnya ikut merah lewat
                  // `.isian-fokus[aria-invalid="true"]` di globals.css.
                  ...(asing.length > 0 && { borderColor: C.danger }),
                }}
              />

              {/* Variabel yang bisa DIKLIK, bukan daftar untuk diketik ulang. */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                {t.variabel.length > 0 ? (
                  <>
                    <span style={{ fontSize: "var(--t-kecil)", color: C.muted }}>Sisipkan:</span>
                    {t.variabel.map((v) => (
                      <button
                        key={v}
                        type="button"
                        disabled={!bolehUbah}
                        onClick={() => sisipkan(t, v)}
                        title={`Sisipkan {{${v}}} — contoh: ${contohNilai(v)}`}
                        style={{
                          fontSize: "var(--t-kecil)",
                          fontFamily: "var(--font-mono, monospace)",
                          padding: "2px 7px",
                          borderRadius: 999,
                          border: `1px solid ${C.border}`,
                          background: "transparent",
                          color: C.text,
                          cursor: bolehUbah ? "pointer" : "default",
                        }}
                      >
                        {`{{${v}}}`}
                      </button>
                    ))}
                  </>
                ) : (
                  <span style={{ fontSize: "var(--t-kecil)", color: C.muted }}>Tanpa variabel.</span>
                )}
                <span style={{ flex: 1 }} />
                <span style={{ fontSize: "var(--t-kecil)", color: C.muted }}>{nilai.length} karakter</span>
              </div>

              {/*
                PRATINJAU — apa yang benar-benar diterima orang.
                Ini yang membuat salah ketik terlihat oleh mata, bukan hanya
                tertangkap validasi saat menyimpan.

                Disembunyikan kalau hasilnya PERSIS sama dengan yang diketik
                (template tanpa variabel). Pratinjau yang tak mungkin berbeda
                dari sumbernya hanya menggandakan teks, dan panel yang penuh
                pengulangan mengajari mata untuk melewatinya — termasuk saat
                pratinjaunya benar-benar berbeda.
              */}
              {asing.length > 0 ? (
                <p role="alert" style={{ fontSize: "var(--t-kecil)", color: C.danger, margin: 0, lineHeight: 1.55 }}>
                  Variabel tak dikenal: <code>{asing.map((v) => `{{${v}}}`).join(" ")}</code> —
                  akan ditolak saat disimpan. Yang tersedia:{" "}
                  {t.variabel.map((v) => `{{${v}}}`).join(" ") || "(tidak ada)"}.
                </p>
              ) : pratinjau === nilai ? null : (
                <div
                  style={{
                    borderLeft: `2px solid ${C.border}`,
                    paddingLeft: 10,
                    display: "grid",
                    gap: 2,
                  }}
                >
                  <span style={{ fontSize: "var(--t-mikro)", color: C.muted, letterSpacing: 0.3 }}>
                    YANG DITERIMA
                  </span>
                  <span
                    style={{
                      fontSize: 12.5, color: C.text, lineHeight: 1.55, whiteSpace: "pre-wrap",
                    }}
                  >
                    {pratinjau}
                  </span>
                </div>
              )}

              {bolehUbah && berubah && (
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button
                    onClick={() => simpan(t, { isi: nilai })}
                    disabled={sibuk || asing.length > 0}
                    style={{
                      padding: "6px 12px",
                      borderRadius: 8,
                      border: "none",
                      background: asing.length > 0 ? C.border : C.aksen,
                      color: asing.length > 0 ? C.muted : "#fff",
                      fontSize: 12.5,
                      fontWeight: 600,
                      cursor: sibuk ? "wait" : asing.length > 0 ? "not-allowed" : "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    {sibuk ? "Menyimpan…" : "Simpan"}
                  </button>
                  <button
                    onClick={() =>
                      setDraf((d) => { const x = { ...d }; delete x[t.id]; return x; })
                    }
                    disabled={sibuk}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 8,
                      border: `1px solid ${C.border}`,
                      background: "transparent",
                      color: C.muted,
                      fontSize: 12.5,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    Batalkan
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {pesan && (
        <p
          role="status"
          style={{
            marginTop: 14,
            fontSize: 12.5,
            color: pesan.tipe === "ok" ? C.success : C.danger,
          }}
        >
          {pesan.teks}
        </p>
      )}
    </section>
  );
}
