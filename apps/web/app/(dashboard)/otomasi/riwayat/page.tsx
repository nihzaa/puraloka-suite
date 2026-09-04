"use client";

/**
 * AI & OTOMASI → RIWAYAT ASISTEN
 *
 * ══════════════════════════════════════════════════════════════════════════
 * PERTANYAAN YANG DIBAWA KE HALAMAN INI: "ASISTEN ITU SEBENARNYA NGAPAIN?"
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Founder memintanya eksplisit: "ada juga log aktivitas (termasuk history
 * percakapan dengan ai assistant)". Founder TJS meminta hal yang sama dengan
 * kalimatnya sendiri — dan itu masuk akal, karena asisten yang bisa membaca
 * seluruh data perusahaan adalah pihak yang paling tak terlihat di sistem.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * DUA KOLOM, DAN BEDANYA ADALAH INTINYA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Kiri: apa yang DIBICARAKAN. Kanan: apa yang benar-benar TERJADI.
 *
 * TJS menulis alasan menggabungkannya dengan tepat: supaya pemilik "tidak
 * perlu buka beberapa halaman berbeda untuk 'apa yang dibicarakan' vs 'apa
 * yang benar-benar dieksekusi'." Keduanya BISA BERBEDA — asisten bisa
 * membicarakan sesuatu yang tak pernah tersimpan, dan bisa menyimpan sesuatu
 * yang tak terbaca jelas di percakapan. Bedanya itulah yang perlu terlihat.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ISI PERCAKAPAN TIDAK DITAMPILKAN DI DAFTAR
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Server memang tak mengirimkannya (lihat `ai-riwayat.ts`), dan halaman ini
 * tak mencoba menyiasatinya. Layar yang memuat potongan percakapan semua
 * orang sekaligus mengubah "log aktivitas" jadi papan pengumuman: satu layar
 * yang tak sengaja terlihat rekan kerja membocorkan pertanyaan orang lain
 * tentang gaji, kasbon, atau sengketa.
 *
 * Membuka satu percakapan adalah tindakan yang DISENGAJA — dan kalau itu
 * milik orang lain, server mencatatnya. Halaman yang dibuat agar pemilik bisa
 * mengawasi asisten tak boleh jadi jendela sepihak untuk mengintip bawahan.
 *
 * ── Warna (ARAH-VISUAL-2026 §3d: satu aksen per layar)
 *
 * Tak ada aksi utama bernavy di sini — halaman ini untuk MEMBACA. Merah
 * dipakai khusus untuk dua hal yang memang harus menonjol: galat tool, dan
 * entitas asing (I-4, penanda paling awal upaya injeksi lewat dokumen).
 */

import { useState } from "react";
import { useData } from "@/lib/data-cache";
import { useTerpasang } from "@/lib/use-terpasang";
import { History, AlertTriangle, ShieldAlert } from "lucide-react";
import { api } from "@/lib/api";
import { C } from "@/lib/warna-ui";
import { KepalaHalaman, Lencana } from "@/components/dasar";
import { Kosong, Panel } from "@/components/ui-dasar";
import { PanduanHalaman } from "@/components/panduan-halaman";
import { BarisRail, KartuRail } from "@/components/shell/rail-kartu";
import { RailIsi } from "@/components/shell/rail-isi";
import { usePasangRail } from "@/lib/rail-context";

interface Percakapan {
  id: string;
  user_id: string | null;
  nama: string;
  asisten: string;
  judul: string | null;
  kanal: string;
  dibuat_pada: string;
  diperbarui_pada: string;
  jumlah_pesan: number;
  jumlah_galat: number;
}

interface Pesan {
  id: string;
  peran: string;
  urutan: number;
  teks: string | null;
  ronde: number | null;
  ada_galat_tool: boolean | null;
  dibuat_pada: string;
}

interface Keputusan {
  id: string;
  action: string;
  record_id: string | null;
  user_id: string | null;
  new_values: Record<string, unknown> | null;
  severity: string | null;
  created_at: string;
}

interface Ringkas {
  percakapan: number;
  pesan: number;
  galat_tool: number;
  entitas_asing: number;
  tulis_berhasil: number;
  tulis_gagal: number;
  biaya_idr: number;
}

function sejak(iso: string): string {
  const detik = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (detik < 60) return `${detik} dtk lalu`;
  const menit = Math.floor(detik / 60);
  if (menit < 60) return `${menit} mnt lalu`;
  const jam = Math.floor(menit / 60);
  if (jam < 24) return `${jam} jam lalu`;
  return `${Math.floor(jam / 24)} hari lalu`;
}

const rupiah = (n: number) =>
  `Rp ${Math.round(n).toLocaleString("id-ID")}`;

/**
 * Nama tindakan yang bisa dibaca manusia.
 *
 * `ai.tulis.berhasil` benar untuk mesin dan tak berarti apa-apa bagi yang
 * sedang memeriksa. Yang tak dikenal ditampilkan APA ADANYA — menerjemahkan
 * dengan menebak lebih buruk daripada tak menerjemahkan, karena hasilnya
 * terbaca meyakinkan justru saat salah.
 */
const LABEL_AKSI: Record<string, string> = {
  "ai.tulis.berhasil": "Catatan tersimpan",
  "ai.tulis.gagal": "Gagal menyimpan",
  "ai.tulis.ditolak": "Ditolak",
  "ai.entitas.asing": "Entitas asing terdeteksi",
  "ai.riwayat.baca_milik_orang_lain": "Membaca percakapan orang lain",
};

/** Alasan penolakan yang bisa ditindaklanjuti, bukan kode mesin. */
const LABEL_ALASAN: Record<string, string> = {
  bukan_pemilik_token:
    "Token dibuat untuk orang lain — meneruskan tautan konfirmasi tak memindahkan wewenang.",
  kedaluwarsa: "Token sudah lewat batas waktunya.",
  sudah_dipakai: "Token sekali-pakai, dan sudah terpakai sebelumnya.",
  entitas_tak_diizinkan: "Jenis data ini di luar daftar putih tulis asisten.",
};

/**
 * Kalimat penjelas untuk satu baris keputusan.
 *
 * Tiap aksi menyimpan BENTUK MUATAN yang berbeda — diukur, bukan ditebak:
 * `berhasil` punya `ringkasan`, `gagal` punya `galat`, `ditolak` punya
 * `alasan`, dan `entitas.asing` punya `entitas_asing`. Versi pertama halaman
 * ini hanya membaca `ringkasan` dan `galat`, jadi SELURUH baris "Ditolak"
 * tampil kosong — dan baris penolakan tanpa sebab adalah baris paling tak
 * berguna di halaman yang justru dibuka untuk mencari sebab.
 */
function penjelas(k: Keputusan): string | null {
  const v = k.new_values ?? {};
  if (typeof v.ringkasan === "string") return v.ringkasan;
  if (typeof v.galat === "string") {
    return typeof v.jenis === "string" ? `${v.jenis}: ${v.galat}` : v.galat;
  }
  if (typeof v.alasan === "string") return LABEL_ALASAN[v.alasan] ?? v.alasan;
  if (Array.isArray(v.entitas_asing)) {
    return `Disebut di jawaban tapi tak ada di hasil tool: ${v.entitas_asing
      .slice(0, 5)
      .map(String)
      .join(", ")}`;
  }
  return null;
}

export default function HalamanRiwayatAsisten() {
  const mounted = useTerpasang();
  if (!mounted) return null;
  return <Konten />;
}

function Konten() {
  /*
    Lapis cache bersama (F4-2) — dua permintaan ini dibagi lintas navigasi.

    Sebelumnya: dua `api.get` di dalam `useCallback` + `useEffect`, yang
    berarti tiap kali halaman ini dibuka permintaannya diulang meski datanya
    baru saja diambil. `useData` men-dedup permintaan yang sama dan menahan
    hasilnya, jadi berpindah halaman lalu kembali tak menembak API lagi.
  */
  const riwayat = useData<{ data: Percakapan[]; ringkas: Ringkas }>("/api/v1/ai/riwayat");
  const kep = useData<{ data: Keputusan[] }>("/api/v1/ai/riwayat/keputusan");

  const daftar = riwayat.data?.data ?? [];
  const ringkas = riwayat.data?.ringkas ?? null;
  const keputusan = kep.data?.data ?? [];
  const memuat = riwayat.memuat || kep.memuat;
  const [terbuka, setTerbuka] = useState<string | null>(null);
  const [isi, setIsi] = useState<Record<string, Pesan[]>>({});
  const [pesan, setPesan] = useState<string | null>(null);
  const galatMuat = riwayat.galat || kep.galat ? "Gagal memuat riwayat asisten" : null;

  /*
    Tak ada `muat()` lagi: sesudah pindah ke `useData`, nol pemanggil
    tersisa (diperiksa `grep "muat("`). Membiarkannya hanya menambah warning
    untuk fungsi yang tak pernah dipanggil, dan ratchet lint berambang NOL
    untuk `no-unused-vars`. Muat ulang manual: `riwayat.muatUlang()`.
  */

  /*
    Effect pemuatan awal DIHAPUS — `useData` yang mengambil datanya, termasuk
    penanganan galat dan status memuat. Menyisakan effect ini akan membuat
    permintaan GANDA tiap halaman dibuka.
  */

  async function buka(p: Percakapan) {
    const baru = terbuka === p.id ? null : p.id;
    setTerbuka(baru);
    if (!baru || isi[p.id]) return;
    try {
      const r = await api.get<{ pesan: Pesan[] }>(`/api/v1/ai/riwayat/${p.id}`);
      setIsi((x) => ({ ...x, [p.id]: r.data.pesan ?? [] }));
    } catch {
      setPesan(`Gagal memuat isi percakapan "${p.judul ?? p.id.slice(0, 8)}"`);
    }
  }

  usePasangRail(
    <RailIsi
      konteks={
        <>
          {/*
            Entitas asing dipisah dan ditaruh PALING ATAS. Ia bukan sekadar
            galat: I-4 menandai asisten melihat entitas di luar hasil tool —
            penanda paling awal upaya injeksi lewat dokumen, dan satu-satunya
            yang muncul SEBELUM ada kerusakan yang bisa dilihat.
          */}
          <KartuRail judul="Perlu diperiksa" kosong="Tak ada penanda mencurigakan.">
            {ringkas && ringkas.entitas_asing > 0 && (
              <BarisRail
                pertama
                utama="Entitas asing terdeteksi"
                sub="Asisten menyebut entitas di luar hasil tool (I-4)"
                kanan={String(ringkas.entitas_asing)}
                nadaKanan="bahaya"
              />
            )}
            {ringkas && ringkas.galat_tool > 0 && (
              <BarisRail
                utama="Pesan dengan galat tool"
                sub="Tool gagal di tengah jawaban"
                kanan={String(ringkas.galat_tool)}
                nadaKanan="bahaya"
              />
            )}
            {ringkas && ringkas.tulis_gagal > 0 && (
              <BarisRail
                utama="Tulisan gagal / ditolak"
                sub="Disiapkan asisten, tak jadi tersimpan"
                kanan={String(ringkas.tulis_gagal)}
                nadaKanan="bahaya"
              />
            )}
          </KartuRail>

          <KartuRail judul="Ringkasan" kosong="">
            <BarisRail
              pertama
              utama="Percakapan"
              sub={`${ringkas?.pesan ?? 0} pesan seluruhnya`}
              kanan={String(ringkas?.percakapan ?? 0)}
            />
            <BarisRail
              utama="Tulisan berhasil"
              sub="Lewat konfirmasi manusia"
              kanan={String(ringkas?.tulis_berhasil ?? 0)}
              nadaKanan="baik"
            />
            <BarisRail
              utama="Biaya token"
              sub="Sejak awal pemakaian"
              kanan={rupiah(ringkas?.biaya_idr ?? 0)}
              href="/pengaturan/biaya-ai"
            />
          </KartuRail>
        </>
      }
    />,
    [ringkas],
  );

  return (
    <div style={{
      // --w-luas — dua kolom pilih-lalu-lihat; kolom kanan panjang. Tanpa container, isi halaman ini melebar
      // mengikuti induknya: diukur 1080px di layar 1600px sementara
      // halaman lain 1380px — terlihat seperti dua aplikasi berbeda.
      padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)",
      width: "100%", maxWidth: "var(--w-luas)", margin: "0 auto",
    }}>
      <KepalaHalaman
        ikon={<History size={20} />}
        judul="Riwayat Asisten"
        keterangan="Apa yang dibicarakan, dan apa yang benar-benar terjadi."
      />

      {/*
        "Riwayat" bisa terbaca sebagai arsip yang tak berguna. Panduan
        menyebutkan KENAPA orang membukanya: memeriksa apa yang asisten
        jawab, dan apa yang benar-benar ia baca untuk menjawabnya.
      */}
      <PanduanHalaman
        untuk={
          <>
            Tiap percakapan dengan asisten tersimpan di sini, beserta{" "}
            <strong>data apa yang ia baca</strong> untuk menjawab. Dipakai saat jawabannya terasa
            janggal — Anda bisa melihat sendiri dari mana angkanya datang.
          </>
        }
        langkah={[
          { teks: "Pilih percakapan yang ingin diperiksa" },
          { teks: "Baca langkah yang diambil asisten — tiap pembacaan data tercatat" },
          { teks: "Bandingkan dengan data aslinya di modul terkait bila ada yang tak cocok" },
        ]}
        catatan="Lama simpan riwayat diatur di halaman Asisten AI. Percakapan memuat kutipan data operasional, jadi menyimpannya tanpa batas bukan pilihan yang netral."
      />

      {/*
        Galat MUAT dan galat AKSI ditampilkan TERPISAH — dijaga
        `uji-galat-muat-terpisah.mjs` (ambang NOL). Satu state bersama
        membuat gagal-simpan MENGHAPUS pesan gagal-muat, dan pengguna
        kehilangan alasan halamannya kosong.
      */}
      {galatMuat && (
        <p role="status" style={{ marginBottom: 12, fontSize: 12.5, color: C.danger }}>
          {galatMuat}
        </p>
      )}

      {pesan && (
        <p role="status" style={{ marginBottom: 12, fontSize: 12.5, color: C.danger }}>
          {pesan}
        </p>
      )}

      {/*
        `kolom-pilih-isi` (globals.css) — daftar pilih di kiri, isi panjang di
        kanan. Versi sebelumnya `repeat(auto-fit, minmax(…, 1fr))` membagi
        lebar SAMA RATA, dan diukur di layar 1600px hasilnya timpang: kolom
        "Percakapan" berisi satu baris menempati ruang yang sama dengan kolom
        kanan berisi dua puluh. Menumpuk di bawah 780px, seperti sebelumnya.
      */}
      <div className="kolom-pilih-isi">
        <Panel judul="Percakapan" padat>
          {memuat ? (
            <div style={{ padding: 20, color: C.muted, fontSize: 13 }}>Memuat…</div>
          ) : daftar.length === 0 ? (
            <Kosong
              ikon={<History size={18} />}
              judul="Belum ada percakapan"
              sebab="Asisten belum pernah ditanya lewat web maupun WhatsApp."
            />
          ) : (
            <div style={{ display: "grid" }}>
              {daftar.map((p, i) => (
                <div
                  key={p.id}
                  style={{
                    borderTop: i === 0 ? "none" : `1px solid ${C.border}`,
                    padding: "13px var(--pad-kartu-lega)",
                  }}
                >
                  <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: C.text }}>
                      {p.judul ?? "(tanpa judul)"}
                    </span>
                    <Lencana nada={p.kanal === "wa" ? "info" : "netral"}>
                      {p.kanal === "wa" ? "WhatsApp" : "Web"}
                    </Lencana>
                    {p.jumlah_galat > 0 && (
                      <Lencana nada="bahaya" ikon={<AlertTriangle size={11} />}>
                        {p.jumlah_galat} galat
                      </Lencana>
                    )}
                  </div>
                  <div
                    style={{
                      display: "flex", gap: 12, flexWrap: "wrap", marginTop: 4,
                      fontSize: "var(--t-kecil)", color: C.muted,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    <span>{p.nama}</span>
                    <span>{p.jumlah_pesan} pesan</span>
                    <span>{sejak(p.diperbarui_pada)}</span>
                    <button
                      type="button"
                      onClick={() => buka(p)}
                      aria-expanded={terbuka === p.id}
                      style={{
                        border: "none", background: "none", padding: 0,
                        color: C.aksen, fontSize: "var(--t-kecil)", cursor: "pointer",
                        fontFamily: "inherit", textDecoration: "underline",
                      }}
                    >
                      {terbuka === p.id ? "Tutup" : "Baca"}
                    </button>
                  </div>

                  {terbuka === p.id && (
                    <div style={{ marginTop: 9, display: "grid", gap: 7 }}>
                      {!isi[p.id] ? (
                        <span style={{ fontSize: 12, color: C.muted }}>Memuat isi…</span>
                      ) : isi[p.id].length === 0 ? (
                        <span style={{ fontSize: 12, color: C.muted }}>Percakapan kosong.</span>
                      ) : (
                        isi[p.id].map((m) => (
                          <div
                            key={m.id}
                            style={{
                              borderLeft: `2px solid ${
                                m.ada_galat_tool ? C.danger : C.border
                              }`,
                              paddingLeft: 9,
                            }}
                          >
                            <div style={{ fontSize: "var(--t-mikro)", color: C.muted, letterSpacing: 0.3 }}>
                              {m.peran === "user" ? "PENANYA" : m.peran === "assistant" ? "ASISTEN" : m.peran.toUpperCase()}
                              {m.ada_galat_tool ? " · TOOL GAGAL" : ""}
                            </div>
                            <div
                              style={{
                                fontSize: 12.5, color: C.text, lineHeight: 1.55,
                                whiteSpace: "pre-wrap", wordBreak: "break-word",
                              }}
                            >
                              {m.teks ?? "(tanpa teks)"}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel judul="Yang benar-benar terjadi" padat>
          {memuat ? (
            <div style={{ padding: 20, color: C.muted, fontSize: 13 }}>Memuat…</div>
          ) : keputusan.length === 0 ? (
            <Kosong
              ikon={<ShieldAlert size={18} />}
              judul="Belum ada tindakan"
              sebab="Asisten belum pernah menyiapkan tulisan yang dikonfirmasi manusia."
            />
          ) : (
            <div style={{ display: "grid" }}>
              {keputusan.map((k, i) => {
                const bahaya =
                  k.action === "ai.entitas.asing" ||
                  k.action === "ai.tulis.gagal" ||
                  k.action === "ai.tulis.ditolak";
                const ringkasan = penjelas(k);
                return (
                  <div
                    key={k.id}
                    style={{
                      borderTop: i === 0 ? "none" : `1px solid ${C.border}`,
                      padding: "12px var(--pad-kartu-lega)",
                    }}
                  >
                    <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                      <Lencana nada={bahaya ? "bahaya" : "sukses"}>
                        {LABEL_AKSI[k.action] ?? k.action}
                      </Lencana>
                      <span
                        style={{
                          fontSize: "var(--t-kecil)", color: C.muted, marginLeft: "auto",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {sejak(k.created_at)}
                      </span>
                    </div>
                    {ringkasan && (
                      <p
                        style={{
                          margin: "4px 0 0", fontSize: 12, color: C.muted,
                          lineHeight: 1.5, wordBreak: "break-word",
                        }}
                      >
                        {ringkasan}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
