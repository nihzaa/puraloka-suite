"use client";

/**
 * DOKUMEN PENAWARAN — surat yang dikirim ke calon pemberi kerja.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA HALAMAN SENDIRI, BUKAN TAB DI /tender
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `ARAH-VISUAL-2026` §6a: tab = sudut pandang berbeda atas data yang SAMA;
 * halaman = entitas berbeda.
 *
 * Register tender menjawab "tender apa yang kita ikuti dan bagaimana
 * hasilnya" — satu baris per tender. Penawaran adalah DOKUMEN: ia punya
 * nomor surat, penerima, masa berlaku, dan rincian sendiri, dan satu tender
 * bisa punya beberapa (revisi bernomor baru saat harga berubah).
 *
 * Mengirim tautan ke rekan juga harus membuka SURAT yang dimaksud, bukan tab
 * mana pun yang terakhir ia buka.
 *
 * ── Tiga lapis (§5b)
 *
 *   LAPIS 1  empat kartu            "apa yang terjadi?"
 *   LAPIS 2  yang menggantung       "mana yang harus saya tagih jawabannya?"
 *   LAPIS 3  tabel surat            "apa yang harus saya kerjakan?"
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileText, Plus, RefreshCw, Clock, ExternalLink } from "lucide-react";
import { api, makeAbortController } from "@/lib/api";
import { C } from "@/lib/warna-ui";
import { Kosong, KartuKPI } from "@/components/ui-dasar";
import { KepalaHalaman, Tabel, type Kolom } from "@/components/dasar";
import { useIzin } from "@/lib/use-izin";
import {
  ModalSuratPenawaran, ModalRincianPenawaran, ModalStatusPenawaran,
  type Penawaran,
} from "@/components/penawaran-aksi";
import { ModalHapusBerstatus, ATURAN_HAPUS } from "@/components/hapus-berstatus";

const rupiah = (n: number) => new Intl.NumberFormat("id-ID", {
  style: "currency", currency: "IDR", maximumFractionDigits: 0,
}).format(n || 0);

const tanggal = (s: string | null) =>
  s ? new Date(s).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "—";

const STATUS_META: Record<string, { teks: string; warna: string; bg: string; border: string }> = {
  draft:    { teks: "Draft",    warna: C.muted,  bg: "var(--surface-subtle)", border: C.border },
  terkirim: { teks: "Terkirim", warna: C.yellow, bg: C.yellowBg, border: C.yellowBorder },
  menang:   { teks: "Menang",   warna: C.green,  bg: C.greenBg,  border: C.greenBorder },
  kalah:    { teks: "Kalah",    warna: C.red,    bg: C.redBg,    border: C.redBorder },
  batal:    { teks: "Batal",    warna: C.muted,  bg: "var(--surface-subtle)", border: C.border },
};

/** Hari sejak dikirim — dipakai menandai yang menggantung terlalu lama. */
function umurHari(sejak: string | null): number | null {
  if (!sejak) return null;
  const ms = Date.now() - new Date(sejak).getTime();
  return Math.floor(ms / 86_400_000);
}

export default function PenawaranPage() {
  const [daftar, setDaftar] = useState<Penawaran[]>([]);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);

  const [suratBaru, setSuratBaru] = useState(false);
  const [ubah, setUbah] = useState<Penawaran | null>(null);
  const [rincian, setRincian] = useState<string | null>(null);
  const [status, setStatus] = useState<Penawaran | null>(null);
  const [hapus, setHapus] = useState<Penawaran | null>(null);

  // ADR-004: permission, bukan peran. `projects:edit` adalah kunci yang
  // dipakai rute tulisnya — disalin dari sana, bukan ditebak.
  const bolehSunting = useIzin("projects:edit");

  const muat = useCallback((signal?: AbortSignal) => {
    setMemuat(true);
    return api.get<{ data: Penawaran[] }>("/api/v1/penawaran", { signal })
      .then((r) => { setDaftar(r.data.data ?? []); setGalat(null); })
      .catch((e) => {
        if ((e as { name?: string })?.name === "CanceledError") return;
        // Daftar kosong dan daftar-yang-gagal-dimuat terlihat sama persis.
        // Membedakannya penting: "belum ada penawaran" adalah kabar yang
        // salah kalau sebenarnya API-nya mati.
        setDaftar([]);
        setGalat((e as { response?: { data?: { error?: string } } })?.response?.data?.error
          ?? "Gagal memuat daftar penawaran.");
      })
      .finally(() => setMemuat(false));
  }, []);

  useEffect(() => {
    const ac = makeAbortController();
    queueMicrotask(() => { void muat(ac.signal); });
    return () => ac.abort();
  }, [muat]);

  const ringkas = useMemo(() => {
    const nilai = (p: Penawaran) => p.hitung?.total ?? 0;
    const terkirim = daftar.filter((p) => p.status === "terkirim");
    const menang = daftar.filter((p) => p.status === "menang");
    const diputus = daftar.filter((p) => p.status === "menang" || p.status === "kalah");
    return {
      draft: daftar.filter((p) => p.status === "draft").length,
      menunggu: terkirim.length,
      nilaiMenunggu: terkirim.reduce((s, p) => s + nilai(p), 0),
      nilaiMenang: menang.reduce((s, p) => s + nilai(p), 0),
      winRate: diputus.length === 0 ? null
        : Math.round((menang.length / diputus.length) * 100),
    };
  }, [daftar]);

  // Yang sudah dikirim > 30 hari dan belum diputus. Angka ini yang memberi
  // tahu kapan harus menagih jawaban — dan ia hilang begitu surat penawaran
  // hanya ada di folder Word.
  const menggantung = useMemo(
    () => daftar
      .filter((p) => p.status === "terkirim" && (umurHari(p.dikirim_pada) ?? 0) > 30)
      .sort((a, b) => (umurHari(b.dikirim_pada) ?? 0) - (umurHari(a.dikirim_pada) ?? 0)),
    [daftar]);

  const kolom: Array<Kolom<Penawaran>> = useMemo(() => [
    {
      kunci: "surat", judul: "Surat", kepalaBaris: true,
      render: (p) => (
        <span style={{ display: "block" }}>
          <strong style={{ fontSize: 12.5, color: C.text }}>{p.nomor}</strong>
          <span style={{ display: "block", fontSize: 11.5, color: C.mid, marginTop: 1 }}>
            {p.perihal}
          </span>
        </span>
      ),
    },
    {
      kunci: "kepada", judul: "Kepada",
      render: (p) => <span style={{ color: C.mid }}>{p.kepada ?? "—"}</span>,
    },
    {
      kunci: "tanggal", judul: "Tanggal",
      render: (p) => (
        <span style={{ color: C.mid, whiteSpace: "nowrap" }}>{tanggal(p.tanggal)}</span>
      ),
    },
    {
      kunci: "berlaku", judul: "Berlaku s.d.",
      render: (p) => {
        if (!p.berlaku_sampai) {
          // Disebut, bukan dikosongkan: masa berlaku yang belum diisi
          // menghalangi pengiriman, dan itu perlu terlihat dari daftar.
          return <span style={{ color: "var(--warning)", fontSize: 11.5 }}>belum diisi</span>;
        }
        const lewat = p.berlaku_sampai < new Date().toISOString().slice(0, 10);
        return (
          <span style={{ color: lewat ? C.red : C.mid, whiteSpace: "nowrap" }}>
            {tanggal(p.berlaku_sampai)}
            {lewat && <span style={{ display: "block", fontSize: 10.5 }}>kedaluwarsa</span>}
          </span>
        );
      },
    },
    {
      kunci: "nilai", judul: "Nilai", rata: "kanan",
      render: (p) => (
        <span style={{ fontWeight: 600, color: C.text }}>
          {rupiah(p.hitung?.total ?? 0)}
        </span>
      ),
    },
    {
      kunci: "baris", judul: "Rincian", rata: "kanan",
      render: (p) => (
        <span style={{ color: (p.jumlah_baris ?? 0) === 0 ? "var(--warning)" : C.mid }}>
          {(p.jumlah_baris ?? 0) === 0 ? "kosong" : `${p.jumlah_baris} baris`}
        </span>
      ),
    },
    {
      kunci: "status", judul: "Status",
      // Status ditulis sebagai KATA, bukan diwakili warna saja — WCAG 1.4.1.
      render: (p) => {
        const s = STATUS_META[p.status] ?? STATUS_META.draft;
        return (
          <span style={{
            display: "inline-block", padding: "2px 8px", borderRadius: 99,
            fontSize: 11, fontWeight: 700, whiteSpace: "nowrap",
            color: s.warna, background: s.bg, border: `1px solid ${s.border}`,
          }}>{s.teks}</span>
        );
      },
    },
    {
      kunci: "aksi", judul: "Tindakan", rata: "kanan",
      render: (p) => (
        <span style={{ display: "inline-flex", gap: 6, whiteSpace: "nowrap" }}>
          <button type="button" onClick={() => setRincian(p.id)} style={tombolKecil}>
            Rincian
          </button>
          <a
            href={`${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/v1/penawaran/${p.id}/pdf`}
            target="_blank" rel="noreferrer"
            style={{ ...tombolKecil, display: "inline-flex", alignItems: "center", gap: 4,
              textDecoration: "none" }}
          >
            PDF <ExternalLink size={10} aria-hidden="true" />
          </a>
          {bolehSunting && (
            <>
              <button type="button" onClick={() => setUbah(p)} style={tombolKecil}>Ubah</button>
              <button type="button" onClick={() => setStatus(p)} style={tombolKecil}>Status</button>
              {/*
                Tombol hapus TIDAK disembunyikan untuk yang sudah dikirim.
                Modalnya yang menjelaskan kenapa tak bisa dan apa gantinya —
                tombol yang menghilang tanpa jejak membuat orang menyimpulkan
                fiturnya tak ada, lalu mencari ke tempat yang salah.
              */}
              <button type="button" onClick={() => setHapus(p)}
                style={{ ...tombolKecil, color: C.red }}>Hapus</button>
            </>
          )}
        </span>
      ),
    },
  ], [bolehSunting]);

  return (
    <div style={{
      padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)",
      width: "100%", maxWidth: "var(--w-luas)", margin: "0 auto",
    }}>
      <header style={{
        display: "flex", alignItems: "flex-start", justifyContent: "space-between",
        gap: "var(--gap-bagian)", flexWrap: "wrap", marginBottom: 20,
      }}>
        <div style={{ minWidth: 0 }}>
          <KepalaHalaman
            judul="Dokumen Penawaran"
            ikon={<FileText size={19} />}
            keterangan="Surat penawaran beserta rincian dan masa berlakunya — dokumennya, bukan sekadar angkanya."
          />
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <button type="button" onClick={() => void muat()} style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.border}`,
            background: "var(--surface)", color: C.mid, fontSize: 12, cursor: "pointer",
          }}>
            <RefreshCw size={13} aria-hidden="true" /> Muat ulang
          </button>
          {bolehSunting && (
            <button type="button" onClick={() => setSuratBaru(true)} style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "8px 16px", borderRadius: 10, border: "none",
              background: "var(--grad-aksen)", color: "var(--on-aksen)",
              fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}>
              <Plus size={15} aria-hidden="true" /> Surat baru
            </button>
          )}
        </div>
      </header>

      {galat && (
        <div role="alert" style={{
          padding: "12px 14px", borderRadius: 10, marginBottom: 14,
          background: C.redBg, border: `1px solid ${C.redBorder}`,
          color: C.onDangerBg, fontSize: 13,
        }}>{galat}</div>
      )}

      {/* ── LAPIS 1 ─────────────────────────────────────────────────────── */}
      <div style={{
        display: "grid", gap: "var(--gap-grid)", marginBottom: "var(--gap-bagian)",
        gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
      }}>
        <KartuKPI label="Masih draft" nilai={String(ringkas.draft)}
          keterangan="belum dikirim ke siapa pun" />
        <KartuKPI label="Menunggu jawaban" nilai={String(ringkas.menunggu)}
          keterangan={rupiah(ringkas.nilaiMenunggu)} />
        <KartuKPI label="Nilai dimenangkan" nilai={rupiah(ringkas.nilaiMenang)}
          keterangan="dari penawaran yang diterima" />
        <KartuKPI
          label="Win rate"
          nilai={ringkas.winRate === null ? "—" : `${ringkas.winRate}%`}
          keterangan={ringkas.winRate === null
            ? "belum ada yang diputuskan"
            : "dari penawaran yang sudah diputus"} />
      </div>

      {/* ── LAPIS 2: yang menggantung ───────────────────────────────────── */}
      {menggantung.length > 0 && (
        <div style={{
          padding: "12px 16px", borderRadius: 10, marginBottom: "var(--gap-bagian)",
          background: C.yellowBg, border: `1px solid ${C.yellowBorder}`,
          display: "flex", gap: 10, alignItems: "flex-start",
        }}>
          <Clock size={16} aria-hidden="true" style={{ color: C.yellow, flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 13, color: "var(--on-warning-bg)", lineHeight: 1.55 }}>
            <strong>
              {menggantung.length} penawaran menunggu jawaban lebih dari 30 hari
            </strong>
            <div style={{ marginTop: 3 }}>
              {menggantung.slice(0, 4).map((p) => (
                <span key={p.id} style={{ display: "block" }}>
                  {p.nomor} · {p.kepada ?? "—"} · {umurHari(p.dikirim_pada)} hari
                </span>
              ))}
            </div>
            <div style={{ marginTop: 4 }}>
              Penawaran yang menggantung selama ini sering sudah diputuskan tanpa
              kita diberi tahu — dan masa berlakunya terus berjalan.
            </div>
          </div>
        </div>
      )}

      {/* ── LAPIS 3 ─────────────────────────────────────────────────────── */}
      {memuat ? (
        <p style={{ fontSize: 13, color: C.muted, padding: "24px 0" }}>Memuat…</p>
      ) : daftar.length === 0 ? (
        <Kosong
          ikon={<FileText size={28} />}
          judul="Belum ada dokumen penawaran"
          sebab={
            <>
              Register tender menyimpan <strong>angka</strong> penawaran; halaman ini
              menyimpan <strong>suratnya</strong> — nomor, penerima, masa berlaku, dan
              rinciannya. Tanpa itu, yang dikirim ke owner tak pernah sama dengan yang
              tercatat, dan selisihnya baru ketahuan saat RAB disusun.
            </>
          }
          aksi={bolehSunting ? (
            <button type="button" onClick={() => setSuratBaru(true)} style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "8px 16px", borderRadius: 10, border: "none",
              background: "var(--grad-aksen)", color: "var(--on-aksen)",
              fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}>
              <Plus size={15} aria-hidden="true" /> Buat surat pertama
            </button>
          ) : undefined}
        />
      ) : (
        <div style={{ borderRadius: 10, border: `1px solid ${C.border}`, overflow: "hidden" }}>
          <Tabel<Penawaran>
            berpermukaan
            caption="Daftar surat penawaran beserta penerima, masa berlaku, nilai, dan statusnya."
            kolom={kolom}
            data={daftar}
            kunciBaris={(p) => p.id}
          />
        </div>
      )}

      {suratBaru && (
        <ModalSuratPenawaran
          awal={null}
          onClose={() => setSuratBaru(false)}
          onSukses={(id) => {
            setSuratBaru(false);
            void muat();
            // Langsung membuka rinciannya: surat tanpa rincian tak bisa
            // dikirim, jadi membiarkan orang kembali ke daftar hanya menunda
            // langkah yang pasti dibutuhkan.
            setRincian(id);
          }}
        />
      )}

      {ubah && (
        <ModalSuratPenawaran
          awal={ubah}
          onClose={() => setUbah(null)}
          onSukses={() => { setUbah(null); void muat(); }}
        />
      )}

      {rincian && (
        <ModalRincianPenawaran
          penawaranId={rincian}
          onClose={() => setRincian(null)}
          onSukses={() => { void muat(); }}
        />
      )}

      {status && (
        <ModalStatusPenawaran
          penawaran={status}
          onClose={() => setStatus(null)}
          onSukses={() => { setStatus(null); void muat(); }}
        />
      )}

      {hapus && (
        <ModalHapusBerstatus
          sasaran={{
            // Literal jalur dan `api.delete` berdampingan DI SINI — lihat
            // catatan `jalankan` di `hapus-berstatus.tsx`.
            jalankan: async () => { await api.delete(`/api/v1/penawaran/${hapus.id}`); },
            nama: hapus.nomor,
            status: hapus.status,
            ...ATURAN_HAPUS.penawaran,
          }}
          onClose={() => setHapus(null)}
          onSukses={() => { setHapus(null); void muat(); }}
        />
      )}
    </div>
  );
}

/** Tombol aksi dalam sel tabel — padding dari token, bukan angka dipaku. */
const tombolKecil: React.CSSProperties = {
  cursor: "pointer", padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)",
  borderRadius: 5, fontSize: 11.5, border: `1px solid ${C.border}`,
  background: "var(--surface)", color: C.text,
};
