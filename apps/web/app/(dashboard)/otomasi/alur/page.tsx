"use client";

/**
 * AI & OTOMASI → ALUR OTOMASI
 *
 * ══════════════════════════════════════════════════════════════════════════
 * PERTANYAAN YANG DIBAWA KE HALAMAN INI: "KENAPA ITU TIDAK JALAN?"
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Hampir tak ada yang membuka halaman ini untuk mengagumi daftar alur. Yang
 * membukanya sedang menghadapi sesuatu yang DIAM: pengingat invoice tak
 * sampai, ringkasan harian tak datang, peringatan stok tak muncul.
 *
 * Maka yang ditaruh paling menonjol bukan nama alurnya, melainkan KAPAN
 * TERAKHIR JALAN dan BERHASIL ATAU TIDAK. Alur yang gagal naik ke atas dengan
 * sendirinya — mengurutkannya secara alfabetis berarti menyembunyikan yang
 * rusak di antara yang sehat.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * MELAMPAUI TJS, DAN BEDANYA TERUKUR
 * ══════════════════════════════════════════════════════════════════════════
 *
 * TJS punya 3 halaman automation dan 6 endpoint (diukur 2026-08-10). Dua
 * bentuknya ditiru karena terbukti — katalog terpisah dari n8n, kesehatan
 * dihitung ulang dari log. Yang DITAMBAHKAN di sini:
 *
 *   · Alur yang terdaftar tapi SUDAH TIDAK ADA di n8n dinyatakan. Itu keadaan
 *     yang tak punya gejala sama sekali: alurnya tenang, tak pernah gagal,
 *     karena tak pernah dipanggil. Tanpa dinyatakan, ketiadaannya baru
 *     ketahuan saat seseorang menunggu notifikasi yang tak akan datang.
 *
 *   · Alur tanpa `n8n_id` DAN tanpa webhook ditandai "belum tersambung",
 *     bukan ditampilkan seolah siap jalan. Tombol yang bisa diklik untuk
 *     sesuatu yang pasti gagal adalah tombol yang berbohong.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * WARNA — ARAH-VISUAL-2026 §3d: satu aksen per layar
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Halaman ini TAK punya aksi utama bernavy sama sekali — dan itu benar:
 * yang dilakukan di sini adalah memeriksa dan menjalankan, dan "Jalankan"
 * milik tiap baris, bukan milik halaman. Merah/hijau/kuning dipakai KHUSUS
 * untuk status jalan — satu-satunya hal di sini yang memang harus terbaca
 * sekilas tanpa membaca teksnya.
 */

import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { Workflow, Play, RefreshCw, Plus, Pencil, ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import { C } from "@/lib/warna-ui";
import { KepalaHalaman, Lencana, Tombol } from "@/components/dasar";
import { Kosong, Panel } from "@/components/ui-dasar";
import { BarisRail, KartuRail } from "@/components/shell/rail-kartu";
import { RailIsi } from "@/components/shell/rail-isi";
import { usePasangRail } from "@/lib/rail-context";
import { AlurFormModal, type AlurUntukForm } from "@/components/alur-form-modal";

interface Alur {
  id: string;
  kode: string;
  nama: string;
  keterangan: string | null;
  n8n_id: string | null;
  jalur_webhook: string | null;
  pemicu: string;
  jadwal_cron: string | null;
  kategori: string;
  aktif: boolean;
  kesehatan: string;
  kesehatan_pada: string | null;
  jalan_terakhir: string | null;
  sukses_terakhir: string | null;
  gagal_terakhir: string | null;
  pesan_gagal: string | null;
}

interface Jalan {
  id: string;
  status: string;
  sumber: string;
  n8n_jalan_id: string | null;
  dimulai_pada: string;
  selesai_pada: string | null;
  durasi_ms: number | null;
  pesan: string | null;
}

/** "3 menit lalu" — waktu mutlak tak menjawab "masih jalan atau sudah basi?". */
function sejak(iso: string | null): string {
  if (!iso) return "—";
  const detik = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (detik < 60) return `${detik} dtk lalu`;
  const menit = Math.floor(detik / 60);
  if (menit < 60) return `${menit} mnt lalu`;
  const jam = Math.floor(menit / 60);
  if (jam < 24) return `${jam} jam lalu`;
  return `${Math.floor(jam / 24)} hari lalu`;
}

const NADA: Record<string, "sukses" | "bahaya" | "peringatan" | "netral" | "info"> = {
  sehat: "sukses",
  gagal: "bahaya",
  jalan: "info",
  belum_diketahui: "netral",
};
const LABEL_SEHAT: Record<string, string> = {
  sehat: "Berhasil",
  gagal: "Gagal",
  jalan: "Sedang jalan",
  belum_diketahui: "Belum pernah jalan",
};
const LABEL_PEMICU: Record<string, string> = {
  jadwal: "Terjadwal",
  webhook: "Otomatis",
  manual: "Manual",
};

const HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

/**
 * `0 8 * * 1-6` → "tiap Senin–Sabtu, 08:00".
 *
 * Cron ditulis untuk mesin. CLAUDE.md §8a.3 menyebut banyak pengguna sistem
 * ini berliterasi digital rendah, dan "0 18 * * 1-6" bagi mereka bukan jadwal
 * — ia deretan simbol yang harus dipercaya begitu saja. Yang tak terbaca tak
 * bisa diperiksa, dan jadwal yang salah tak akan pernah dilaporkan siapa pun.
 *
 * Yang TIDAK dilakukan: mengurai seluruh tata bahasa cron. Bentuk di luar
 * yang dikenal dikembalikan APA ADANYA — terjemahan yang menebak lebih
 * berbahaya daripada teks mentah, karena ia terbaca meyakinkan justru saat
 * salah.
 */
function bacaCron(cron: string | null): string | null {
  if (!cron) return null;
  const b = cron.trim().split(/\s+/);
  if (b.length !== 5) return cron;
  const [menit, jam, tglBulan, bulan, hari] = b;

  if (!/^\d{1,2}$/.test(menit) || !/^\d{1,2}$/.test(jam)) return cron;
  if (tglBulan !== "*" || bulan !== "*") return cron;
  const waktu = `${jam.padStart(2, "0")}:${menit.padStart(2, "0")}`;

  if (hari === "*") return `tiap hari, ${waktu}`;
  const rentang = hari.match(/^([0-6])-([0-6])$/);
  if (rentang) return `tiap ${HARI[+rentang[1]]}–${HARI[+rentang[2]]}, ${waktu}`;
  if (/^[0-6]$/.test(hari)) return `tiap ${HARI[+hari]}, ${waktu}`;
  return cron;
}

/*
 * Izin dibaca dari localStorage — konvensi yang sudah dipakai 13 halaman lain
 * di repo ini (mis. `pengaturan/whatsapp`). Ini HANYA untuk menyembunyikan
 * kontrol; gerbang sesungguhnya ada di server (`requirePermission`), dan
 * localStorage yang diutak-atik tak memberi wewenang apa pun.
 */
function hasPerm(key: string): boolean {
  try {
    const raw = localStorage.getItem("puraloka_permissions");
    return raw ? (JSON.parse(raw) as string[]).includes(key) : false;
  } catch {
    return false;
  }
}

/*
 * Penjaga hidrasi: `hasPerm` membaca localStorage, yang tak ada di server.
 * Merendernya langsung membuat HTML server dan klien berbeda — React
 * membuangnya dengan peringatan, dan yang terlihat adalah kontrol yang
 * berkedip muncul-hilang.
 */
export default function HalamanAlurOtomasi() {
  const [mounted, mount] = useReducer(() => true, false);
  useEffect(mount, [mount]);
  if (!mounted) return null;
  return <Konten />;
}

function Konten() {
  const bolehJalankan = hasPerm("otomasi:alur:jalankan");
  const bolehKelola = hasPerm("otomasi:alur:kelola");

  const [daftar, setDaftar] = useState<Alur[]>([]);
  const [n8nSiap, setN8nSiap] = useState(true);
  const [memuat, setMemuat] = useState(true);
  const [jejak, setJejak] = useState<Record<string, Jalan[]>>({});
  const [terbuka, setTerbuka] = useState<string | null>(null);
  const [sedang, setSedang] = useState<string | null>(null);
  const [pesan, setPesan] = useState<{ tipe: "ok" | "err"; teks: string } | null>(null);
  const [formBuka, setFormBuka] = useState(false);
  const [ubah, setUbah] = useState<AlurUntukForm | null>(null);

  const muat = useCallback(async () => {
    try {
      const r = await api.get<{ data: Alur[]; n8n_siap: boolean }>("/api/v1/otomasi/alur");
      setDaftar(r.data.data ?? []);
      setN8nSiap(r.data.n8n_siap);
    } catch {
      setPesan({ tipe: "err", teks: "Gagal memuat katalog alur" });
    } finally {
      setMemuat(false);
    }
  }, []);

  useEffect(() => { muat(); }, [muat]);

  async function bukaJejak(a: Alur) {
    const baru = terbuka === a.id ? null : a.id;
    setTerbuka(baru);
    if (!baru || jejak[a.id]) return;
    try {
      const r = await api.get<{ data: Jalan[] }>(`/api/v1/otomasi/alur/${a.id}/jalan`);
      setJejak((j) => ({ ...j, [a.id]: r.data.data ?? [] }));
    } catch {
      setPesan({ tipe: "err", teks: `Gagal memuat jejak "${a.nama}"` });
    }
  }

  async function jalankan(a: Alur) {
    setSedang(a.id);
    setPesan(null);
    try {
      const r = await api.post<{ durasi_ms: number }>(`/api/v1/otomasi/alur/${a.id}/jalankan`, {});
      setPesan({ tipe: "ok", teks: `"${a.nama}" dijalankan (${r.data.durasi_ms} ms).` });
      setJejak((j) => { const x = { ...j }; delete x[a.id]; return x; });
      if (terbuka === a.id) {
        const jr = await api.get<{ data: Jalan[] }>(`/api/v1/otomasi/alur/${a.id}/jalan`);
        setJejak((j) => ({ ...j, [a.id]: jr.data.data ?? [] }));
      }
      await muat();
    } catch (e) {
      setPesan({
        tipe: "err",
        teks:
          (e as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          "Gagal menjalankan alur",
      });
      // Kegagalan pun MENGUBAH jejak — memuat ulang supaya barisnya terlihat,
      // bukan menyisakan daftar yang tampak seolah tak terjadi apa-apa.
      await muat();
    } finally {
      setSedang(null);
    }
  }

  /*
   * Urutan: YANG RUSAK DULU.
   *
   * Alfabetis menyembunyikan alur gagal di antara yang sehat, dan halaman ini
   * hampir selalu dibuka karena ada yang rusak. Nonaktif turun paling bawah:
   * ia memang tak jalan, dan itu bukan kabar buruk.
   */
  const terurut = useMemo(() => {
    const peringkat = (a: Alur) =>
      !a.aktif ? 4 : a.kesehatan === "gagal" ? 0 : a.kesehatan === "belum_diketahui" ? 1 : a.kesehatan === "jalan" ? 2 : 3;
    return [...daftar].sort(
      (x, y) => peringkat(x) - peringkat(y) || x.nama.localeCompare(y.nama),
    );
  }, [daftar]);

  const gagal = daftar.filter((a) => a.aktif && a.kesehatan === "gagal");
  const belumTersambung = daftar.filter((a) => a.aktif && !a.n8n_id && !a.jalur_webhook);

  usePasangRail(
    <RailIsi
      konteks={
        <>
          <KartuRail judul="Perlu diperiksa" kosong="Semua alur aktif berjalan normal.">
            {gagal.map((a) => (
              <BarisRail
                key={a.id}
                utama={a.nama}
                sub={a.pesan_gagal ?? "Jalan terakhir gagal"}
                kanan={sejak(a.gagal_terakhir)}
                nadaKanan="bahaya"
              />
            ))}
          </KartuRail>

          {/*
            "Belum tersambung" dipisah dari "gagal" karena bentuk diamnya
            BERBEDA: yang gagal punya pesan, yang belum tersambung tak pernah
            dicoba sama sekali. Menyatukannya membuat yang kedua terlihat
            seperti masalah n8n, padahal ia masalah pendaftaran.
          */}
          {/*
            Sub-teks TIDAK diulang per baris.

            Versi pertama menulis "Belum punya n8n_id maupun jalur webhook" di
            SETIAP baris — enam kali kalimat yang sama persis. Pengulangan itu
            tak menambah apa pun dan justru mengajari mata melewati kartunya,
            termasuk saat isinya berubah. Alasannya cukup disebut SEKALI, di
            kepala kartu; barisnya tinggal menyebut namanya.
          */}
          <KartuRail
            judul="Belum tersambung"
            kosong="Semua alur punya alamat di n8n."
          >
            {belumTersambung.length > 0 && (
              <p
                style={{
                  margin: "0 0 2px", fontSize: 11.5, color: C.muted,
                  lineHeight: 1.5,
                }}
              >
                Belum punya n8n_id maupun jalur webhook — takkan pernah dipicu.
              </p>
            )}
            {belumTersambung.map((a, i) => (
              <BarisRail
                key={a.id}
                pertama={i === 0}
                utama={a.nama}
                sub={LABEL_PEMICU[a.pemicu] ?? a.pemicu}
              />
            ))}
          </KartuRail>

          <KartuRail judul="Kredensial" tautan="/pengaturan/kredensial" kosong="">
            <BarisRail
              pertama
              utama={n8nSiap ? "N8N_BASE_URL terisi" : "N8N_BASE_URL belum diisi"}
              sub={n8nSiap ? "Alur bisa dipicu dari sini" : "Tombol Jalankan akan menolak"}
              href="/pengaturan/kredensial"
              nadaKanan={n8nSiap ? "baik" : "bahaya"}
              kanan={n8nSiap ? "siap" : "kosong"}
            />
          </KartuRail>
        </>
      }
    />,
    [daftar, n8nSiap],
  );

  return (
    <div>
      <KepalaHalaman
        ikon={<Workflow size={20} />}
        judul="Alur Otomasi"
        keterangan="Workflow yang berjalan sendiri — statusnya, jejaknya, dan pemicu manualnya."
        /*
          Tombol ini sempat DICABUT, dan kembalinya punya syarat.

          Versi pertama memasangnya menuju `/pengaturan/kredensial` sebagai
          penampung sementara — dilihat di tangkapan layar lalu dibuang: tombol
          aksi utama yang mendarat di halaman yang bukan tujuannya adalah
          kebohongan kecil yang membuat orang berhenti memercayai tombol lain.

          Sekarang ia punya tujuan sungguhan (formulirnya ada), jadi ia boleh
          ada. Urutannya disengaja: tombol menyusul fungsinya, bukan sebaliknya.
        */
        aksi={
          bolehKelola ? (
            <Tombol jenis="utama" ikon={<Plus size={15} />} onClick={() => { setUbah(null); setFormBuka(true); }}>
              Daftarkan alur
            </Tombol>
          ) : undefined
        }
      />

      {/*
        Kesiapan kanal dinyatakan SEBELUM orang mengklik apa pun — pola yang
        sama dengan halaman Kanal WhatsApp. Tombol yang baru gagal sesudah
        diklik memberi tahu terlambat.
      */}
      {!n8nSiap && (
        <div
          role="status"
          style={{
            display: "flex", gap: 10, alignItems: "flex-start",
            padding: "12px var(--pad-kartu-lega)", marginBottom: 14,
            background: C.yellowBg, border: `1px solid ${C.yellowBorder}`,
            borderRadius: 12, fontSize: 13, color: C.onWarningBg, lineHeight: 1.6,
          }}
        >
          <RefreshCw size={16} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>
            <strong>n8n belum tersambung.</strong> Katalog di bawah tetap bisa dibaca, tetapi
            alur tak bisa dipicu sampai <code>N8N_BASE_URL</code> diisi di{" "}
            <a href="/pengaturan/kredensial" style={{ color: "inherit", fontWeight: 600 }}>
              halaman Kredensial
            </a>.
          </span>
        </div>
      )}

      {pesan && (
        <p
          role="status"
          style={{
            marginBottom: 12, fontSize: 12.5,
            color: pesan.tipe === "ok" ? C.success : C.danger,
          }}
        >
          {pesan.teks}
        </p>
      )}

      <Panel judul="Katalog alur" padat>
        {memuat ? (
          <div style={{ padding: 24, color: C.muted, fontSize: 14 }}>Memuat…</div>
        ) : terurut.length === 0 ? (
          <Kosong
            ikon={<Workflow size={20} />}
            judul="Belum ada alur terdaftar"
            sebab="Daftarkan workflow n8n di sini supaya statusnya bisa dilihat tanpa membuka n8n."
          />
        ) : (
          <div style={{ display: "grid" }}>
            {terurut.map((a, i) => {
              const tersambung = Boolean(a.n8n_id || a.jalur_webhook);
              const bisaJalan = bolehJalankan && a.aktif && tersambung && n8nSiap;
              const isi = jejak[a.id];

              return (
                /*
                 * `<details>` — RINGKAS DULU, detail kalau diminta.
                 *
                 * Versi sebelumnya menampilkan semuanya sekaligus di tiap
                 * baris: nama, lencana, keterangan dua baris, pemicu, jadwal,
                 * waktu, dua tombol. Empat belas baris seragam, dan alur yang
                 * SEHAT memakan ruang persis sebanyak yang GAGAL — mata tak
                 * punya tempat berpijak.
                 *
                 * Elemen asli, bukan div + state: Enter/Space bekerja sendiri,
                 * pembaca layar mengumumkan terbuka/tertutup, dan Ctrl+F
                 * peramban menemukan teks di dalamnya walau tertutup. Tiga hal
                 * yang harus ditulis tangan — dan biasanya lupa ditulis —
                 * kalau memakai div.
                 */
                <details
                  key={a.id}
                  open={a.aktif && a.kesehatan === "gagal"}
                  style={{
                    borderTop: i === 0 ? "none" : `1px solid ${C.border}`,
                    opacity: a.aktif ? 1 : 0.66,
                  }}
                >
                  <summary
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "13px var(--pad-kartu-lega)",
                      cursor: "pointer", listStyle: "none",
                    }}
                  >
                    <ChevronRight
                      size={14}
                      aria-hidden
                      style={{ color: C.muted, flexShrink: 0, transition: "transform 160ms ease-out" }}
                      className="alur-panah"
                    />

                    {/*
                      Titik status, bukan lencana teks, di posisi pertama.
                      Empat belas lencana berjajar jadi dinding kata; satu
                      titik berwarna dibaca sekilas tanpa dieja.
                    */}
                    <span
                      aria-hidden
                      style={{
                        width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
                        /*
                          "Belum pernah jalan" digambar sebagai CINCIN kosong,
                          bukan titik abu — titik abu tak bisa dibedakan dari
                          nonaktif, dan dua keadaan yang berbeda artinya tak
                          boleh terlihat sama.
                        */
                        background:
                          a.aktif && a.kesehatan === "gagal" ? C.danger
                            : a.aktif && a.kesehatan === "sehat" ? C.success
                              : a.aktif && a.kesehatan === "jalan" ? C.info
                                : "transparent",
                        border:
                          a.aktif && a.kesehatan === "belum_diketahui"
                            ? `1.5px solid ${C.muted}`
                            : !a.aktif
                              ? `1.5px solid ${C.border}`
                              : "none",
                      }}
                    />

                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 600, color: C.text }}>
                        {a.nama}
                      </span>
                      {/* Status dieja untuk pembaca layar — titik warna saja
                          tak bisa dibaca, dan warna saja bukan informasi. */}
                      <span className="sr-only">
                        {" — "}
                        {a.aktif ? LABEL_SEHAT[a.kesehatan] ?? a.kesehatan : "Nonaktif"}
                      </span>
                      {!tersambung && (
                        <span style={{ marginInlineStart: 8 }}>
                          <Lencana nada="peringatan">Belum tersambung</Lencana>
                        </span>
                      )}
                    </span>

                    {/* Kolom kanan RINGKAS: kapan terakhir, itu saja. Sisanya
                        menunggu di dalam. */}
                    <span
                      style={{
                        fontSize: 11.5, color: C.muted, flexShrink: 0,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {/*
                        Kolom kanan menyatakan KEADAAN, bukan "—".
                        Versi pertama memanggil `sejak(null)` untuk alur yang
                        belum pernah jalan, jadi dua belas baris berisi strip
                        berjajar — kolom penuh tanda yang tak menjawab apa pun.
                      */}
                      {!a.aktif
                        ? "nonaktif"
                        : a.jalan_terakhir
                          ? sejak(a.jalan_terakhir)
                          : "belum jalan"}
                    </span>
                  </summary>

                  <div
                    style={{
                      padding: "0 var(--pad-kartu-lega) 14px",
                      display: "grid", gap: 10,
                      // Sejajar dengan teks judul di summary (panah 14 + gap 10
                      // + titik 7 + gap 10), supaya isi tak terlihat melayang.
                      paddingInlineStart: "calc(var(--pad-kartu-lega) + 41px)",
                    }}
                  >
                    {a.keterangan && (
                      <p style={{ margin: 0, fontSize: 12.5, color: C.muted, lineHeight: 1.6 }}>
                        {a.keterangan}
                      </p>
                    )}

                    {a.aktif && a.kesehatan === "gagal" && a.pesan_gagal && (
                      <p
                        style={{
                          margin: 0, padding: "8px 11px",
                          background: C.redBg, border: `1px solid ${C.redBorder}`,
                          borderRadius: 8, fontSize: 12, color: C.onDangerBg,
                          lineHeight: 1.55,
                        }}
                      >
                        {a.pesan_gagal}
                      </p>
                    )}

                    {/* Fakta alur sebagai pasangan label-nilai, bukan deretan
                        teks abu yang harus ditebak artinya. */}
                    <dl
                      style={{
                        margin: 0, display: "grid", gap: "3px 18px",
                        gridTemplateColumns: "auto 1fr",
                        fontSize: 12, fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      <dt style={{ color: C.muted }}>Pemicu</dt>
                      <dd style={{ margin: 0, color: C.text }}>
                        {LABEL_PEMICU[a.pemicu] ?? a.pemicu}
                        {a.jadwal_cron ? ` — ${bacaCron(a.jadwal_cron)}` : ""}
                        {a.jalur_webhook ? ` — ${a.jalur_webhook}` : ""}
                      </dd>

                      <dt style={{ color: C.muted }}>Terakhir jalan</dt>
                      <dd style={{ margin: 0, color: C.text }}>
                        {a.jalan_terakhir ? sejak(a.jalan_terakhir) : "belum pernah"}
                      </dd>

                      {a.sukses_terakhir && (
                        <>
                          <dt style={{ color: C.muted }}>Berhasil terakhir</dt>
                          <dd style={{ margin: 0, color: C.text }}>{sejak(a.sukses_terakhir)}</dd>
                        </>
                      )}
                    </dl>

                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      {bolehJalankan && (
                        <button
                          onClick={() => jalankan(a)}
                          disabled={!bisaJalan || sedang === a.id}
                          title={
                            !a.aktif ? "Alur nonaktif"
                              : !tersambung ? "Belum punya alamat di n8n"
                                : !n8nSiap ? "N8N_BASE_URL belum diisi"
                                  : "Jalankan sekarang"
                          }
                          style={{
                            display: "inline-flex", alignItems: "center", gap: 6,
                            padding: "6px 11px", borderRadius: 8,
                            border: `1px dashed ${C.border}`, background: "transparent",
                            color: C.muted, fontSize: 12.5, fontFamily: "inherit",
                            cursor: "not-allowed",
                            ...(bisaJalan && {
                              border: `1px solid ${C.border}`,
                              background: "var(--surface)",
                              color: C.text,
                              cursor: sedang === a.id ? "wait" : "pointer",
                              boxShadow: "var(--naik-1)",
                            }),
                          }}
                        >
                          <Play size={13} />
                          {sedang === a.id ? "Menjalankan…" : "Jalankan"}
                        </button>
                      )}

                      {bolehKelola && (
                        <button
                          onClick={() => { setUbah(a); setFormBuka(true); }}
                          aria-label={`Ubah ${a.nama}`}
                          style={{
                            display: "inline-flex", alignItems: "center", gap: 6,
                            padding: "6px 10px", borderRadius: 8,
                            border: `1px solid ${C.border}`, background: "transparent",
                            color: C.muted, fontSize: 12.5, fontFamily: "inherit",
                            cursor: "pointer",
                          }}
                        >
                          <Pencil size={13} />
                          Ubah
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => bukaJejak(a)}
                        aria-expanded={terbuka === a.id}
                        style={{
                          border: "none", background: "none", padding: "6px 2px",
                          color: C.aksen, fontSize: 12.5, cursor: "pointer",
                          fontFamily: "inherit", textDecoration: "underline",
                        }}
                      >
                        {terbuka === a.id ? "Tutup jejak" : "Lihat jejak"}
                      </button>
                    </div>

                    {terbuka === a.id && (
                      <div>
                        {!isi ? (
                          <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>Memuat jejak…</p>
                        ) : isi.length === 0 ? (
                          <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>
                            Belum pernah dijalankan.
                          </p>
                        ) : (
                          <div style={{ overflowX: "auto" }}>
                            <table
                              style={{
                                width: "100%", borderCollapse: "collapse", fontSize: 12.5,
                                fontVariantNumeric: "tabular-nums",
                              }}
                            >
                              <caption
                                style={{
                                  captionSide: "top", textAlign: "left",
                                  fontSize: 11, color: C.muted, paddingBottom: 5,
                                }}
                              >
                                50 jalan terakhir — {a.nama}
                              </caption>
                              <thead>
                                <tr style={{ background: "var(--surface-2)" }}>
                                  {["Waktu", "Status", "Pemicu", "Durasi", "Catatan"].map((h) => (
                                    <th
                                      key={h}
                                      scope="col"
                                      style={{
                                        textAlign: "left", padding: "6px 10px",
                                        fontSize: 11, fontWeight: 600, color: C.muted,
                                      }}
                                    >
                                      {h}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {isi.map((j) => (
                                  <tr key={j.id} style={{ borderTop: `1px solid ${C.border}` }}>
                                    <th
                                      scope="row"
                                      style={{
                                        padding: "6px 10px", textAlign: "left",
                                        fontWeight: 400, color: C.text, whiteSpace: "nowrap",
                                      }}
                                    >
                                      {sejak(j.dimulai_pada)}
                                    </th>
                                    <td style={{ padding: "6px 10px" }}>
                                      <Lencana
                                        nada={
                                          j.status === "sukses" ? "sukses"
                                            : j.status === "gagal" ? "bahaya" : "info"
                                        }
                                      >
                                        {j.status === "sukses" ? "Berhasil"
                                          : j.status === "gagal" ? "Gagal" : "Jalan"}
                                      </Lencana>
                                    </td>
                                    <td style={{ padding: "6px 10px", color: C.muted }}>{j.sumber}</td>
                                    <td style={{ padding: "6px 10px", color: C.muted, whiteSpace: "nowrap" }}>
                                      {j.durasi_ms != null ? `${j.durasi_ms} ms` : "—"}
                                    </td>
                                    <td style={{ padding: "6px 10px", color: C.muted, lineHeight: 1.5 }}>
                                      {j.pesan ?? "—"}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </Panel>

      <AlurFormModal
        terbuka={formBuka}
        awal={ubah}
        onTutup={() => setFormBuka(false)}
        onSimpan={() => {
          setPesan({ tipe: "ok", teks: ubah ? "Alur diperbarui." : "Alur terdaftar." });
          void muat();
        }}
      />
    </div>
  );
}
