"use client";

/**
 * SERTIFIKASI · KINERJA · REKRUTMEN.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA SATU HALAMAN TIGA TAB
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `ARAH-VISUAL-2026.md` §6a: *tab = sudut pandang berbeda atas data yang
 * sama; halaman = entitas berbeda*.
 *
 * Ketiganya adalah sudut pandang atas ORANG YANG SAMA — apa kompetensinya,
 * bagaimana kinerjanya, dan dari mana ia masuk. Tiga halaman terpisah berarti
 * memuat pegawai yang sama tiga kali, dan tiga tautan sidebar yang menyala
 * bergantian untuk hal yang sama.
 *
 * ── Yang jadi pusat: sertifikat yang KEDALUWARSA
 *
 * Dari tiga item ini, hanya sertifikasi yang punya pemicu nyata — syarat
 * prakualifikasi tender. Dan yang membuatnya berbahaya: **sertifikat mati
 * yang dipakai memenuhi syarat tender adalah dokumen palsu di mata panitia**,
 * sementara yang menandatangani penawaran adalah direktur, bukan yang
 * menginput datanya.
 *
 * Karena itu halaman ini membuka dengan keadaan sertifikat, dan membedakan
 * TIGA keadaan — bukan dua:
 *
 *   berlaku      sah
 *   akan habis   masih sah, tapi perlu diperpanjang sebelum tender berikutnya
 *   kedaluwarsa  tak boleh dipakai
 *
 * "Akan habis" dipisahkan karena tindakannya BERBEDA. Menyamakannya membuat
 * peringatan menyala untuk yang masih sah, dan orang berhenti membacanya.
 *
 * ── Satu aksen (§3d)
 *
 * Yang menonjol hanya kartu sertifikat kedaluwarsa. Kinerja dan rekrutmen
 * tenang — keduanya belum punya pemicu, dan memberi mereka penekanan yang
 * sama akan menyembunyikan yang benar-benar mendesak.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Award, TriangleAlert, ShieldCheck, Clock, Plus, UserPlus, ChevronRight,
} from "lucide-react";
import { api, makeAbortController } from "@/lib/api";
import { C } from "@/lib/warna-ui";
import { Kosong } from "@/components/ui-dasar";
import { KepalaHalaman, Tabel, type Kolom } from "@/components/dasar";
import { DialogBersama } from "@/components/dialog-bersama";
import { TabBagian } from "@/components/tab-bagian";

type StatusSertifikat = "berlaku" | "akan_habis" | "kedaluwarsa";
type TahapLamaran = "masuk" | "seleksi_berkas" | "wawancara" | "tawaran" | "diterima" | "ditolak";

interface Sertifikat {
  id: string;
  jenis: string;
  nama: string;
  nomor: string | null;
  penerbit: string | null;
  klasifikasi: string | null;
  kualifikasi: string | null;
  tanggal_terbit: string | null;
  berlaku_sampai: string | null;
  berjangka: boolean;
  status: StatusSertifikat;
  sisa_hari: number | null;
}

interface Penilaian {
  id: string;
  periode: string;
  skala_maks: string | number;
  skor: string | number | null;
  status: "draf" | "final";
  kekuatan: string | null;
  perbaikan: string | null;
  yang_menilai: { id: string; name: string } | null;
}

interface Detail {
  pegawai: {
    id: string; nomor_induk: string | null; jabatan: string | null;
    orang: { id: string; name: string } | null;
  };
  pada: string;
  sertifikat: {
    baris: Sertifikat[];
    berlaku: number;
    akan_habis: number;
    kedaluwarsa: number;
    perlu_tindakan: Sertifikat[];
  };
  penilaian: Penilaian[];
  kinerja: {
    tren: Array<{ periode: string; persen: number | null; status: "draf" | "final" }>;
    rata_final: number | null;
    jumlah_final: number;
    jumlah_draf: number;
  };
}

interface Lamaran {
  id: string;
  nama: string;
  email: string | null;
  telepon: string | null;
  posisi: string;
  sumber: string | null;
  tahap: TahapLamaran;
  catatan_tahap: string | null;
  pegawai_id: string | null;
  created_at: string;
}

interface Pegawai {
  id: string; nomor_induk: string | null; jabatan: string | null;
  orang: { id: string; name: string } | null;
}

const ARTI: Record<StatusSertifikat, { label: string; warna: string; bg: string; border: string; arti: string }> = {
  berlaku: {
    label: "Berlaku", warna: "var(--success)", bg: "var(--success-bg)", border: "var(--success-border)",
    arti: "Sah pada tanggal yang diperiksa.",
  },
  akan_habis: {
    label: "Akan habis", warna: "var(--warning-teks)", bg: "var(--warning-bg)", border: "var(--warning-border)",
    arti: "Masih sah, tetapi perlu diperpanjang sebelum tender berikutnya.",
  },
  kedaluwarsa: {
    label: "Kedaluwarsa", warna: "var(--danger)", bg: "var(--danger-bg)", border: "var(--danger-border)",
    arti: "TIDAK boleh dipakai memenuhi syarat tender — sertifikat mati yang dilampirkan adalah dokumen palsu di mata panitia.",
  },
};

const TAHAP: Record<TahapLamaran, { label: string; warna: string; bg: string; border: string }> = {
  masuk: { label: "Masuk", warna: C.mid, bg: "var(--surface-2)", border: C.border },
  seleksi_berkas: { label: "Seleksi berkas", warna: C.mid, bg: "var(--surface-2)", border: C.border },
  wawancara: { label: "Wawancara", warna: "var(--navy)", bg: "var(--navy-light)", border: "var(--navy-light)" },
  tawaran: { label: "Tawaran", warna: "var(--warning-teks)", bg: "var(--warning-bg)", border: "var(--warning-border)" },
  diterima: { label: "Diterima", warna: "var(--success)", bg: "var(--success-bg)", border: "var(--success-border)" },
  ditolak: { label: "Ditolak", warna: C.muted, bg: "var(--surface-2)", border: C.border },
};

const tanggal = (iso: string | null) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const NAMA = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  return `${d} ${NAMA[m - 1]} ${y}`;
};

const KOLOM_SERTIFIKAT: Array<Kolom<Sertifikat>> = [
  {
    kunci: "sertifikat", judul: "Sertifikat", kepalaBaris: true,
    render: (s) => {
      const a = ARTI[s.status];
      return (
        <span style={{
          display: "block", paddingLeft: 9,
          // Pita kiri HANYA untuk yang kedaluwarsa — satu-satunya yang tak
          // boleh dipakai. Memberi pita ke "akan habis" membuat keduanya
          // tampak sama mendesaknya, padahal tindakannya berbeda.
          borderLeft: s.status === "kedaluwarsa"
            ? `3px solid ${a.warna}` : "3px solid transparent",
        }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, color: C.muted, fontWeight: 700 }}>{s.jenis}</span>
            <strong style={{ fontSize: 13, color: C.text }}>{s.nama}</strong>
          </span>
          <span style={{ display: "block", fontSize: 11.5, color: C.mid, marginTop: 1 }}>
            {[s.kualifikasi, s.klasifikasi, s.penerbit].filter(Boolean).join(" · ") || "—"}
          </span>
        </span>
      );
    },
  },
  {
    kunci: "berlaku", judul: "Masa berlaku",
    render: (s) => (
      <span style={{ display: "block", fontSize: 12, color: C.mid }}>
        {!s.berjangka ? (
          // Seumur hidup dinyatakan eksplisit — bukan strip kosong yang
          // terbaca "datanya belum diisi".
          <span style={{ color: C.text }}>Seumur hidup</span>
        ) : (
          <>
            <span style={{ color: C.text }}>{tanggal(s.berlaku_sampai)}</span>
            {s.sisa_hari !== null && (
              <span style={{ display: "block", fontSize: 11, color: C.muted }}>
                {s.sisa_hari < 0
                  ? `lewat ${Math.abs(s.sisa_hari)} hari`
                  : `${s.sisa_hari} hari lagi`}
              </span>
            )}
          </>
        )}
      </span>
    ),
  },
  {
    kunci: "status", judul: "Status",
    render: (s) => {
      const a = ARTI[s.status];
      return (
        <span
          title={a.arti}
          style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700,
            color: a.warna, background: a.bg, border: `1px solid ${a.border}`,
          }}
        >
          {s.status === "kedaluwarsa" ? <TriangleAlert size={11} aria-hidden="true" />
            : s.status === "akan_habis" ? <Clock size={11} aria-hidden="true" />
            : <ShieldCheck size={11} aria-hidden="true" />}
          {a.label}
        </span>
      );
    },
  },
];

const KOLOM_LAMARAN = (onPindah: (l: Lamaran) => void): Array<Kolom<Lamaran>> => [
  {
    kunci: "pelamar", judul: "Pelamar", kepalaBaris: true,
    render: (l) => (
      <span style={{ display: "block" }}>
        <strong style={{ fontSize: 13, color: C.text }}>{l.nama}</strong>
        <span style={{ display: "block", fontSize: 11.5, color: C.mid, marginTop: 1 }}>
          {l.posisi}{l.sumber ? ` · ${l.sumber}` : ""}
        </span>
        {l.tahap === "ditolak" && l.catatan_tahap && (
          <span style={{ display: "block", fontSize: 11, color: C.muted, marginTop: 2, maxWidth: "40ch" }}>
            {l.catatan_tahap}
          </span>
        )}
      </span>
    ),
  },
  {
    kunci: "tahap", judul: "Tahap",
    render: (l) => {
      const t = TAHAP[l.tahap];
      return (
        <span style={{
          display: "inline-block", padding: "2px 8px", borderRadius: 999,
          fontSize: 11, fontWeight: 700,
          color: t.warna, background: t.bg, border: `1px solid ${t.border}`,
        }}>{t.label}</span>
      );
    },
  },
  {
    kunci: "aksi", judul: "",
    render: (l) => (
      l.tahap === "diterima" || l.tahap === "ditolak"
        // Keduanya akhir — tombolnya dihilangkan supaya tak menjanjikan
        // sesuatu yang akan ditolak server.
        ? <span style={{ fontSize: 11, color: C.muted }}>selesai</span>
        : (
          <button
            type="button" onClick={() => onPindah(l)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              padding: "5px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600,
              border: `1px solid ${C.border}`, background: "var(--surface)",
              color: C.text, cursor: "pointer", whiteSpace: "nowrap",
            }}
          >Pindah tahap <ChevronRight size={12} aria-hidden="true" /></button>
        )
    ),
  },
];

export default function KompetensiPage() {
  const [tab, setTab] = useState<"sertifikat" | "kinerja" | "rekrutmen">("sertifikat");
  const [pegawai, setPegawai] = useState<Pegawai[]>([]);
  const [pegawaiId, setPegawaiId] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [lamaran, setLamaran] = useState<Lamaran[]>([]);
  const [memuat, setMemuat] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  const [tambahSer, setTambahSer] = useState(false);
  const [sJenis, setSJenis] = useState("SKA");
  const [sNama, setSNama] = useState("");
  const [sKualifikasi, setSKualifikasi] = useState("");
  const [sKlasifikasi, setSKlasifikasi] = useState("");
  const [sTerbit, setSTerbit] = useState("");
  const [sSampai, setSSampai] = useState("");
  const [sBerjangka, setSBerjangka] = useState(true);

  const [pindahBaris, setPindahBaris] = useState<Lamaran | null>(null);
  const [lTahap, setLTahap] = useState<TahapLamaran>("seleksi_berkas");
  const [lCatatan, setLCatatan] = useState("");
  const [lPegawai, setLPegawai] = useState("");

  const [menyimpan, setMenyimpan] = useState(false);
  const [galatModal, setGalatModal] = useState<string | null>(null);

  useEffect(() => {
    const ac = makeAbortController();
    api.get<{ pegawai: Pegawai[] }>("/api/v1/sdm/pegawai", { signal: ac.signal })
      .then((r) => {
        const d = r.data.pegawai ?? [];
        setPegawai(d);
        setPegawaiId((s) => s || d[0]?.id || "");
      })
      .catch((e) => { if (e?.name !== "CanceledError") setGalat("Gagal memuat daftar pegawai"); });
    return () => ac.abort();
  }, []);

  const muat = useCallback(async (id: string) => {
    if (!id) { setDetail(null); return; }
    setMemuat(true); setGalat(null);
    try {
      const r = await api.get<Detail>(`/api/v1/sdm/pegawai/${id}/kompetensi`);
      setDetail(r.data);
    } catch (e) {
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalat(m ?? "Gagal memuat kompetensi");
      setDetail(null);
    } finally { setMemuat(false); }
  }, []);

  useEffect(() => { void muat(pegawaiId); }, [pegawaiId, muat]);

  const muatLamaran = useCallback(async () => {
    try {
      const r = await api.get<{ lamaran: Lamaran[] }>("/api/v1/sdm/lamaran");
      setLamaran(r.data.lamaran ?? []);
    } catch {
      setGalat("Gagal memuat daftar lamaran");
    }
  }, []);

  useEffect(() => { if (tab === "rekrutmen") void muatLamaran(); }, [tab, muatLamaran]);

  const simpanSertifikat = useCallback(async () => {
    if (!pegawaiId) return;
    if (!sNama.trim()) { setGalatModal("Nama sertifikat wajib diisi"); return; }
    setMenyimpan(true); setGalatModal(null);
    try {
      await api.post(`/api/v1/sdm/pegawai/${pegawaiId}/sertifikat`, {
        jenis: sJenis.trim(), nama: sNama.trim(),
        kualifikasi: sKualifikasi.trim() || null,
        klasifikasi: sKlasifikasi.trim() || null,
        tanggal_terbit: sTerbit || null,
        berlaku_sampai: sSampai || null,
        berjangka: sBerjangka,
      });
      setTambahSer(false);
      setSNama(""); setSKualifikasi(""); setSKlasifikasi(""); setSTerbit(""); setSSampai("");
      await muat(pegawaiId);
    } catch (e) {
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalatModal(m ?? "Gagal menambah sertifikat");
    } finally { setMenyimpan(false); }
  }, [pegawaiId, sJenis, sNama, sKualifikasi, sKlasifikasi, sTerbit, sSampai, sBerjangka, muat]);

  const simpanPindah = useCallback(async () => {
    if (!pindahBaris) return;
    setMenyimpan(true); setGalatModal(null);
    try {
      await api.post(`/api/v1/sdm/lamaran/${pindahBaris.id}/tahap`, {
        tahap: lTahap,
        catatan: lCatatan.trim() || null,
        ...(lPegawai ? { pegawai_id: lPegawai } : {}),
      });
      setPindahBaris(null); setLCatatan(""); setLPegawai("");
      await muatLamaran();
    } catch (e) {
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalatModal(m ?? "Gagal memindah tahap");
    } finally { setMenyimpan(false); }
  }, [pindahBaris, lTahap, lCatatan, lPegawai, muatLamaran]);

  const kartu: React.CSSProperties = {
    background: "var(--surface)", border: `1px solid ${C.border}`,
    borderRadius: 10, boxShadow: "var(--naik-1)",
  };

  const s = detail?.sertifikat;

  return (
    // `--w-luas`: tabel sertifikat padat kolom (nama+kualifikasi, masa
    // berlaku, status), dan klasifikasi kehilangan arti begitu membungkus.
    <div style={{
      padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)",
      width: "100%", maxWidth: "var(--w-luas)", margin: "0 auto",
    }}>
      <div className="rise" style={{ marginBottom: "var(--gap-bagian)" }}>
        <KepalaHalaman
          judul="Sertifikasi & Kompetensi"
          ikon={<Award size={20} aria-hidden="true" />}
          keterangan={
            <>
              Kompetensi, kinerja, dan asal-usul tiap orang. Yang paling menentukan:{" "}
              <strong>sertifikat yang kedaluwarsa tak boleh dipakai memenuhi syarat
              tender</strong> — melampirkannya adalah dokumen palsu di mata panitia,
              dan yang menandatangani penawaran adalah direktur.
            </>
          }
        />
      </div>

      {galat && (
        <div role="alert" style={{
          marginBottom: 14, padding: "10px 14px", borderRadius: 8, fontSize: 13,
          border: "1px solid var(--danger-border)", background: "var(--danger-bg)",
          color: "var(--danger)",
        }}>{galat}</div>
      )}

      {/* ── Tab: sudut pandang atas ORANG YANG SAMA (§6a) ──────────────────
          *
          * `TabBagian`, bukan tab yang digambar sendiri: komponen bersama
          * sudah menangani `role="tablist"` + `aria-selected` dan TIGA
          * penanda aktif sekaligus (warna, tebal, garis bawah) — WCAG 1.4.1
          * melarang bergantung warna saja. `audit-tab-seragam` menangkap
          * versi pertama halaman ini yang menggambarnya sendiri. */}
      <TabBagian
        label="Sudut pandang kompetensi"
        aktif={tab}
        onPilih={setTab}
        bagian={[
          {
            kunci: "sertifikat" as const, label: "Sertifikasi & Kompetensi",
            // Jumlah kedaluwarsa muncul di TABNYA — supaya terlihat tanpa
            // harus membuka tab itu dulu.
            jumlah: s?.kedaluwarsa || undefined,
            mendesak: (s?.kedaluwarsa ?? 0) > 0,
            artiJumlah: "sertifikat kedaluwarsa",
          },
          { kunci: "kinerja" as const, label: "Penilaian Kinerja" },
          {
            kunci: "rekrutmen" as const, label: "Rekrutmen",
            jumlah: lamaran.filter(
              (l) => l.tahap !== "diterima" && l.tahap !== "ditolak").length || undefined,
            artiJumlah: "lamaran masih berjalan",
          },
        ]}
      />

      {tab !== "rekrutmen" && (
        <div className="rise" style={{ ...kartu, padding: "12px 16px", marginBottom: 16, maxWidth: 420 }}>
          <label htmlFor="km-pegawai" style={{
            fontSize: 11, fontWeight: 700, color: C.muted, display: "block",
            marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em",
          }}>Pegawai</label>
          <select
            id="km-pegawai" value={pegawaiId} onChange={(e) => setPegawaiId(e.target.value)}
            style={{
              padding: "8px 10px", borderRadius: 6, border: `1px solid ${C.border}`,
              background: "var(--surface)", color: C.text, fontSize: 13, width: "100%",
            }}
          >
            <option value="">— pilih pegawai —</option>
            {pegawai.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nomor_induk ? `${p.nomor_induk} · ` : ""}{p.orang?.name ?? "(tanpa nama)"}
                {p.jabatan ? ` — ${p.jabatan}` : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* ── TAB SERTIFIKAT ───────────────────────────────────────────────── */}
      {tab === "sertifikat" && (
        !pegawaiId ? (
          <Kosong
            ikon={<Award size={28} />}
            judul="Pilih pegawai dulu"
            sebab="Sertifikat dicatat per orang — SKA/SKT tenaga ahli inilah yang diperiksa panitia saat prakualifikasi tender."
          />
        ) : memuat ? (
          <div style={{ ...kartu, padding: 40, textAlign: "center", color: C.mid, fontSize: 13 }}>Memuat…</div>
        ) : detail && s ? (
          <>
            {s.kedaluwarsa > 0 && (
              <div role="status" className="rise" style={{
                ...kartu, padding: "16px 18px", marginBottom: 14,
                borderColor: "var(--danger-border)", background: "var(--danger-bg)",
                borderLeftWidth: 4, borderLeftStyle: "solid", borderLeftColor: "var(--danger)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <TriangleAlert size={18} aria-hidden="true" style={{ color: "var(--danger)" }} />
                  <strong style={{ fontSize: 15, color: "var(--danger)" }}>
                    {s.kedaluwarsa} sertifikat kedaluwarsa — tak boleh dipakai tender
                  </strong>
                </div>
                <ul style={{ margin: "0 0 0 26px", padding: 0, fontSize: 13, color: C.text, lineHeight: 1.7 }}>
                  {s.perlu_tindakan.filter((x) => x.status === "kedaluwarsa").map((x) => (
                    <li key={x.id}>
                      <strong>{x.jenis}</strong> {x.nama}
                      {x.sisa_hari !== null
                        ? <span style={{ color: C.muted }}> · lewat {Math.abs(x.sisa_hari)} hari</span>
                        : <span style={{ color: C.muted }}> · tanggal kedaluwarsa belum diisi</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
              gap: 8, marginBottom: 14 }}>
              {[
                { l: "Berlaku", v: s.berlaku, sub: "sah dipakai" },
                { l: "Akan habis", v: s.akan_habis, sub: "≤60 hari lagi" },
                { l: "Kedaluwarsa", v: s.kedaluwarsa, sub: "tak boleh dipakai", bahaya: true },
                { l: "Total", v: s.baris.length, sub: "sertifikat tercatat" },
              ].map((k) => (
                <div key={k.l} style={{
                  ...kartu, padding: "12px 14px",
                  borderColor: k.bahaya && s.kedaluwarsa > 0 ? "var(--danger-border)" : C.border,
                }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.muted,
                    textTransform: "uppercase", letterSpacing: "0.05em" }}>{k.l}</div>
                  <div style={{
                    fontSize: "var(--teks-kpi)", fontWeight: 700, marginTop: 4, lineHeight: 1.1,
                    color: k.bahaya && s.kedaluwarsa > 0 ? "var(--danger)" : C.text,
                    fontVariantNumeric: "tabular-nums",
                  }}>{k.v}</div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{k.sub}</div>
                </div>
              ))}
            </div>

            <div style={{ marginBottom: 14 }}>
              <button
                type="button" onClick={() => { setTambahSer(true); setGalatModal(null); }}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "8px 14px", borderRadius: 6, fontSize: 13, fontWeight: 700,
                  border: "1px solid var(--navy)", background: "var(--navy)",
                  color: "var(--on-navy)", cursor: "pointer",
                }}
              ><Plus size={14} aria-hidden="true" /> Tambah sertifikat</button>
            </div>

            {s.baris.length === 0 ? (
              <Kosong
                ikon={<Award size={28} />}
                judul="Belum ada sertifikat tercatat"
                sebab="SKA/SKT tenaga ahli, sertifikat K3, dan ijazah dicatat di sini — beserta masa berlakunya, supaya yang mati tak ikut terpakai memenuhi syarat tender."
              />
            ) : (
              <Tabel
                kolom={KOLOM_SERTIFIKAT}
                data={s.baris}
                kunciBaris={(x) => x.id}
                caption={`Sertifikat ${detail.pegawai.orang?.name ?? ""} pada ${tanggal(detail.pada)}`}
              />
            )}
          </>
        ) : null
      )}

      {/* ── TAB KINERJA ──────────────────────────────────────────────────── */}
      {tab === "kinerja" && (
        !pegawaiId ? (
          <Kosong ikon={<Award size={28} />} judul="Pilih pegawai dulu"
            sebab="Penilaian kinerja dicatat per orang per periode." />
        ) : memuat ? (
          <div style={{ ...kartu, padding: 40, textAlign: "center", color: C.mid, fontSize: 13 }}>Memuat…</div>
        ) : detail ? (
          detail.penilaian.length === 0 ? (
            <Kosong
              ikon={<Award size={28} />}
              judul="Belum ada penilaian"
              sebab="Skor disimpan bersama SKALANYA — skala berubah antar-periode (1–5 lalu 1–100), dan skor 4 tanpa skalanya bisa berarti bagus atau buruk."
            />
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                gap: 8, marginBottom: 14 }}>
                {[
                  {
                    l: "Rata-rata final",
                    // `null`, bukan 0 — nol berarti "dinilai buruk", dan itu
                    // klaim yang tak dimiliki datanya.
                    v: detail.kinerja.rata_final === null ? "—" : `${detail.kinerja.rata_final}%`,
                    sub: detail.kinerja.rata_final === null
                      ? "belum ada penilaian final" : "dinormalkan ke persen",
                  },
                  { l: "Final", v: detail.kinerja.jumlah_final, sub: "sudah disampaikan" },
                  { l: "Draf", v: detail.kinerja.jumlah_draf, sub: "masih bisa berubah" },
                ].map((k) => (
                  <div key={k.l} style={{ ...kartu, padding: "12px 14px" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.muted,
                      textTransform: "uppercase", letterSpacing: "0.05em" }}>{k.l}</div>
                    <div style={{ fontSize: "var(--teks-kpi)", fontWeight: 700, marginTop: 4, lineHeight: 1.1, color: C.text,
                      fontVariantNumeric: "tabular-nums" }}>{k.v}</div>
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{k.sub}</div>
                  </div>
                ))}
              </div>

              <div className="rise" style={{ ...kartu, padding: "14px 18px" }}>
                <div style={{
                  fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 10,
                  textTransform: "uppercase", letterSpacing: "0.05em",
                }}>Riwayat penilaian</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {detail.penilaian.map((p) => {
                    const persen = detail.kinerja.tren.find((t) => t.periode === p.periode)?.persen;
                    return (
                      <div key={p.id} style={{
                        display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap",
                        paddingBottom: 8, borderBottom: "1px solid var(--surface-hover)",
                      }}>
                        <strong style={{ fontSize: 13, color: C.text, minWidth: 80 }}>{p.periode}</strong>
                        <span style={{
                          fontSize: 15, fontWeight: 700, color: C.text,
                          fontVariantNumeric: "tabular-nums", minWidth: 60,
                        }}>{persen === null || persen === undefined ? "—" : `${persen}%`}</span>
                        {/* Skor MENTAH beserta skalanya — dinormalkan untuk
                            perbandingan, tapi angka aslinya tetap terlihat
                            supaya cocok dengan lembar penilaian di kertas. */}
                        <span style={{ fontSize: 11.5, color: C.muted, minWidth: 90 }}>
                          {p.skor ?? "—"} dari {p.skala_maks}
                        </span>
                        <span style={{
                          padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700,
                          color: p.status === "final" ? "var(--success)" : C.mid,
                          background: p.status === "final" ? "var(--success-bg)" : "var(--surface-2)",
                          border: `1px solid ${p.status === "final" ? "var(--success-border)" : C.border}`,
                        }}>{p.status === "final" ? "Final" : "Draf"}</span>
                        {p.yang_menilai && (
                          <span style={{ fontSize: 11, color: C.muted }}>{p.yang_menilai.name}</span>
                        )}
                        {p.kekuatan && (
                          <span style={{ fontSize: 12, color: C.mid, flex: "1 1 100%", marginTop: 2 }}>
                            {p.kekuatan}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )
        ) : null
      )}

      {/* ── TAB REKRUTMEN ────────────────────────────────────────────────── */}
      {tab === "rekrutmen" && (
        lamaran.length === 0 ? (
          <Kosong
            ikon={<UserPlus size={28} />}
            judul="Belum ada lamaran tercatat"
            sebab="Lamaran dicatat beserta tahapnya. Tahap tak bisa mundur — mundur menghapus jejak bahwa pelamar pernah sampai sejauh itu."
          />
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: 8, marginBottom: 14 }}>
              {(["masuk", "seleksi_berkas", "wawancara", "tawaran"] as TahapLamaran[]).map((t) => (
                <div key={t} style={{ ...kartu, padding: "12px 14px" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.muted,
                    textTransform: "uppercase", letterSpacing: "0.05em" }}>{TAHAP[t].label}</div>
                  <div style={{ fontSize: "var(--teks-kpi)", fontWeight: 700, marginTop: 4, lineHeight: 1.1, color: C.text,
                    fontVariantNumeric: "tabular-nums" }}>
                    {lamaran.filter((l) => l.tahap === t).length}
                  </div>
                </div>
              ))}
            </div>

            <Tabel
              kolom={KOLOM_LAMARAN((l) => {
                setPindahBaris(l);
                setLTahap("seleksi_berkas");
                setLCatatan(""); setLPegawai(""); setGalatModal(null);
              })}
              data={lamaran}
              kunciBaris={(l) => l.id}
              caption="Lamaran kerja beserta tahap seleksinya"
            />
          </>
        )
      )}

      {/* ── Modal: tambah sertifikat ────────────────────────────────────── */}
      <DialogBersama
        terbuka={tambahSer}
        onTutup={() => setTambahSer(false)}
        judul="Tambah sertifikat"
        keterangan="Sertifikat berjangka WAJIB punya tanggal kedaluwarsa — tanpa itu ia terbaca 'berlaku selamanya' dan bisa dipakai memenuhi syarat tender."
        kaki={
          <>
            <button type="button" onClick={() => setTambahSer(false)} disabled={menyimpan}
              style={{
                padding: "8px 14px", borderRadius: 6, fontSize: 13, fontWeight: 600,
                border: `1px solid ${C.border}`, background: "var(--surface)",
                color: C.text, cursor: menyimpan ? "not-allowed" : "pointer",
              }}>Batal</button>
            <button type="button" onClick={() => void simpanSertifikat()} disabled={menyimpan}
              style={{
                padding: "8px 14px", borderRadius: 6, fontSize: 13, fontWeight: 700,
                border: "1px solid var(--navy)", background: "var(--navy)",
                color: "var(--on-navy)", cursor: menyimpan ? "not-allowed" : "pointer",
                opacity: menyimpan ? 0.7 : 1,
              }}>{menyimpan ? "Menyimpan…" : "Simpan"}</button>
          </>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10 }}>
            <div>
              <label htmlFor="km-jenis" style={{
                fontSize: 11, fontWeight: 700, color: C.muted, display: "block",
                marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em",
              }}>Jenis</label>
              <input id="km-jenis" value={sJenis} onChange={(e) => setSJenis(e.target.value)}
                placeholder="SKA / SKT / Ijazah"
                style={{
                  width: "100%", padding: "8px 10px", borderRadius: 6, fontSize: 13,
                  border: `1px solid ${C.border}`, background: "var(--surface)", color: C.text,
                }} />
            </div>
            <div>
              <label htmlFor="km-nama" style={{
                fontSize: 11, fontWeight: 700, color: C.muted, display: "block",
                marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em",
              }}>Nama <span style={{ color: "var(--danger)" }}>· wajib</span></label>
              <input id="km-nama" value={sNama} onChange={(e) => setSNama(e.target.value)}
                placeholder="mis. Ahli Madya Teknik Bangunan Gedung"
                style={{
                  width: "100%", padding: "8px 10px", borderRadius: 6, fontSize: 13,
                  border: `1px solid ${C.border}`, background: "var(--surface)", color: C.text,
                }} />
            </div>
            <div>
              <label htmlFor="km-kualifikasi" style={{
                fontSize: 11, fontWeight: 700, color: C.muted, display: "block",
                marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em",
              }}>Kualifikasi</label>
              <input id="km-kualifikasi" value={sKualifikasi}
                onChange={(e) => setSKualifikasi(e.target.value)} placeholder="Ahli Madya"
                style={{
                  width: "100%", padding: "8px 10px", borderRadius: 6, fontSize: 13,
                  border: `1px solid ${C.border}`, background: "var(--surface)", color: C.text,
                }} />
            </div>
            <div>
              <label htmlFor="km-klasifikasi" style={{
                fontSize: 11, fontWeight: 700, color: C.muted, display: "block",
                marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em",
              }}>Klasifikasi</label>
              <input id="km-klasifikasi" value={sKlasifikasi}
                onChange={(e) => setSKlasifikasi(e.target.value)}
                placeholder="Teknik Bangunan Gedung"
                style={{
                  width: "100%", padding: "8px 10px", borderRadius: 6, fontSize: 13,
                  border: `1px solid ${C.border}`, background: "var(--surface)", color: C.text,
                }} />
            </div>
          </div>

          <label style={{
            display: "flex", alignItems: "center", gap: 8, fontSize: 13,
            color: C.text, cursor: "pointer",
          }}>
            <input type="checkbox" checked={!sBerjangka}
              onChange={(e) => setSBerjangka(!e.target.checked)} />
            Seumur hidup (ijazah, pelatihan tanpa masa berlaku)
          </label>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label htmlFor="km-terbit" style={{
                fontSize: 11, fontWeight: 700, color: C.muted, display: "block",
                marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em",
              }}>Tanggal terbit</label>
              <input id="km-terbit" type="date" value={sTerbit}
                onChange={(e) => setSTerbit(e.target.value)}
                style={{
                  width: "100%", padding: "8px 10px", borderRadius: 6, fontSize: 13,
                  border: `1px solid ${C.border}`, background: "var(--surface)", color: C.text,
                }} />
            </div>
            {sBerjangka && (
              <div>
                <label htmlFor="km-sampai" style={{
                  fontSize: 11, fontWeight: 700, color: C.muted, display: "block",
                  marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em",
                }}>Berlaku sampai <span style={{ color: "var(--danger)" }}>· wajib</span></label>
                <input id="km-sampai" type="date" value={sSampai}
                  onChange={(e) => setSSampai(e.target.value)}
                  style={{
                    width: "100%", padding: "8px 10px", borderRadius: 6, fontSize: 13,
                    border: `1px solid ${C.border}`, background: "var(--surface)", color: C.text,
                  }} />
              </div>
            )}
          </div>

          {galatModal && (
            <div role="alert" style={{
              padding: "10px 12px", borderRadius: 8, fontSize: 12,
              border: "1px solid var(--danger-border)", background: "var(--danger-bg)",
              color: "var(--danger)",
            }}>{galatModal}</div>
          )}
        </div>
      </DialogBersama>

      {/* ── Modal: pindah tahap lamaran ─────────────────────────────────── */}
      <DialogBersama
        terbuka={pindahBaris !== null}
        onTutup={() => setPindahBaris(null)}
        judul="Pindah tahap lamaran"
        keterangan={pindahBaris ? `${pindahBaris.nama} — ${pindahBaris.posisi}` : undefined}
        kaki={
          <>
            <button type="button" onClick={() => setPindahBaris(null)} disabled={menyimpan}
              style={{
                padding: "8px 14px", borderRadius: 6, fontSize: 13, fontWeight: 600,
                border: `1px solid ${C.border}`, background: "var(--surface)",
                color: C.text, cursor: menyimpan ? "not-allowed" : "pointer",
              }}>Batal</button>
            <button type="button" onClick={() => void simpanPindah()} disabled={menyimpan}
              style={{
                padding: "8px 14px", borderRadius: 6, fontSize: 13, fontWeight: 700,
                border: "1px solid var(--navy)", background: "var(--navy)",
                color: "var(--on-navy)", cursor: menyimpan ? "not-allowed" : "pointer",
                opacity: menyimpan ? 0.7 : 1,
              }}>{menyimpan ? "Memindah…" : "Pindah"}</button>
          </>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label htmlFor="km-tahap" style={{
              fontSize: 11, fontWeight: 700, color: C.muted, display: "block",
              marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em",
            }}>Tahap baru</label>
            <select id="km-tahap" value={lTahap}
              onChange={(e) => setLTahap(e.target.value as TahapLamaran)}
              style={{
                width: "100%", padding: "8px 10px", borderRadius: 6, fontSize: 13,
                border: `1px solid ${C.border}`, background: "var(--surface)", color: C.text,
              }}
            >
              {(["seleksi_berkas", "wawancara", "tawaran", "diterima", "ditolak"] as TahapLamaran[])
                .map((t) => <option key={t} value={t}>{TAHAP[t].label}</option>)}
            </select>
            <p style={{ fontSize: 11, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>
              Tahap boleh melompat maju, tapi <strong>tak bisa mundur</strong> —
              mundur menghapus jejak bahwa pelamar pernah sampai sejauh itu.
            </p>
          </div>

          {lTahap === "diterima" && (
            <div>
              <label htmlFor="km-lpegawai" style={{
                fontSize: 11, fontWeight: 700, color: C.muted, display: "block",
                marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em",
              }}>Tautkan ke data pegawai <span style={{ color: "var(--danger)" }}>· wajib</span></label>
              <select id="km-lpegawai" value={lPegawai}
                onChange={(e) => setLPegawai(e.target.value)}
                style={{
                  width: "100%", padding: "8px 10px", borderRadius: 6, fontSize: 13,
                  border: `1px solid ${C.border}`, background: "var(--surface)", color: C.text,
                }}
              >
                <option value="">— pilih pegawai —</option>
                {pegawai.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nomor_induk ? `${p.nomor_induk} · ` : ""}{p.orang?.name ?? "(tanpa nama)"}
                  </option>
                ))}
              </select>
              <p style={{ fontSize: 11, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>
                Buat dulu data kepegawaiannya, lalu tautkan di sini — lamaran
                "diterima" tanpa pegawai tak bisa ditelusuri: siapa yang masuk?
              </p>
            </div>
          )}

          <div>
            <label htmlFor="km-lcatatan" style={{
              fontSize: 11, fontWeight: 700, color: C.muted, display: "block",
              marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em",
            }}>
              Catatan
              {lTahap === "ditolak" && <span style={{ color: "var(--danger)" }}> · wajib</span>}
            </label>
            <textarea id="km-lcatatan" rows={3} value={lCatatan}
              onChange={(e) => setLCatatan(e.target.value)}
              placeholder={lTahap === "ditolak"
                ? "Kenapa tidak diteruskan"
                : "Opsional"}
              style={{
                width: "100%", padding: "8px 10px", borderRadius: 6, fontSize: 13,
                border: `1px solid ${C.border}`, background: "var(--surface)",
                color: C.text, resize: "vertical", fontFamily: "inherit",
              }} />
            {lTahap === "ditolak" && (
              <p style={{ fontSize: 11, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>
                Tanpa catatan, pelamar yang sama akan dihubungi lagi untuk
                lowongan yang sama.
              </p>
            )}
          </div>

          {galatModal && (
            <div role="alert" style={{
              padding: "10px 12px", borderRadius: 8, fontSize: 12,
              border: "1px solid var(--danger-border)", background: "var(--danger-bg)",
              color: "var(--danger)",
            }}>{galatModal}</div>
          )}
        </div>
      </DialogBersama>
    </div>
  );
}
