"use client";

/**
 * TIMESHEET STAF KANTOR — jam kerja yang dibebankan ke proyek.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG DIJAWAB HALAMAN INI, DAN YANG TIDAK
 * ══════════════════════════════════════════════════════════════════════════
 *
 * **Dijawab:** berapa jam waktu staf kantor jatuh ke tiap proyek.
 * **Tidak dijawab:** berapa gaji staf itu.
 *
 * Staf digaji bulanan tetap — jamnya tak menentukan gajinya. Yang ditentukan
 * jamnya adalah biaya overhead yang dibebankan ke proyek A dan ke proyek B.
 * Menyamakan keduanya membuat gaji terlihat bergantung kehadiran (padahal
 * tidak), dan biaya proyek kehilangan komponen overhead-nya (padahal ada).
 *
 * Upah harian mandor & tukang punya modulnya sendiri (`/mandor/upah`) —
 * mereka dibayar per hari hadir, aturannya berbeda.
 *
 * ── Kenapa "belum diisi" dibedakan tegas dari "nol jam"
 *
 * Hari tanpa baris berarti BELUM DIISI. Menghitungnya nol membuat pegawai
 * yang lupa mengisi terbaca seperti tidak bekerja — dan angka itu masuk ke
 * laporan biaya proyek.
 *
 * Akhir pekan sengaja TIDAK ikut diperingatkan: peringatan yang selalu
 * menyala berhenti dibaca.
 *
 * ── Satu aksen (§3d)
 *
 * Yang menonjol hanya kartu total jam dan spanduk hari kosong. Tabel tenang.
 */

import { useCallback, useEffect, useState } from "react";
import {
  CalendarClock, TriangleAlert, Send, Check, X, Plus, Building2, Clock,
} from "lucide-react";
import { api, makeAbortController } from "@/lib/api";
import { C } from "@/lib/warna-ui";
import { Kosong } from "@/components/ui-dasar";
import { KepalaHalaman, Tabel, type Kolom } from "@/components/dasar";
import { DialogBersama } from "@/components/dialog-bersama";

type StatusTs = "draf" | "diajukan" | "disetujui" | "ditolak";

interface Baris {
  id: string;
  tanggal: string;
  jam_kerja: number | string;
  jam_lembur: number | string;
  jam_kerja_n: number;
  jam_lembur_n: number;
  total: number;
  melebihi_standar: boolean;
  di_bawah_standar: boolean;
  project_id: string | null;
  kegiatan: string | null;
  status: StatusTs;
  alasan_tolak: string | null;
  proyek: { id: string; name: string } | null;
}

interface Ringkasan {
  baris: Baris[];
  total_jam_kerja: number;
  total_jam_lembur: number;
  hari_terisi: number;
  hari_kosong: string[];
  per_status: Record<StatusTs, number>;
  per_proyek: Array<{ project_id: string | null; jam: number; lembur: number }>;
  perlu_ditanya: Baris[];
}

interface Pegawai {
  id: string;
  nomor_induk: string | null;
  jabatan: string | null;
  departemen: string | null;
  jam_standar: number | string;
  orang: { id: string; name: string; email: string } | null;
}

interface Detail {
  pegawai: Pegawai;
  bulan: string;
  rentang: { awal: string; akhir: string };
  ringkasan: Ringkasan;
  pengajuan: {
    boleh: boolean;
    penghalang: Array<{ kode: string; pesan: string }>;
    peringatan: Array<{ kode: string; pesan: string; tanggal?: string[] }>;
  };
}

interface Proyek { id: string; name: string }

const STATUS: Record<StatusTs, { label: string; warna: string; bg: string; border: string }> = {
  draf: { label: "Draf", warna: C.mid, bg: "var(--surface-2)", border: C.border },
  diajukan: { label: "Diajukan", warna: "var(--warning-teks)", bg: "var(--warning-bg)", border: "var(--warning-border)" },
  disetujui: { label: "Disetujui", warna: "var(--success)", bg: "var(--success-bg)", border: "var(--success-border)" },
  ditolak: { label: "Ditolak", warna: "var(--danger)", bg: "var(--danger-bg)", border: "var(--danger-border)" },
};

const jam = (n: number) =>
  new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(n);

const tanggalPendek = (iso: string) => {
  // `T00:00:00` TIDAK ditambahkan: balasan API sudah berupa `YYYY-MM-DD`
  // murni, dan `new Date('2026-08-03')` menafsirkannya sebagai UTC — yang
  // benar untuk perbandingan tapi bisa menggeser tampilan di zona barat.
  // Memecahnya sendiri menghilangkan seluruh persoalan zona waktu.
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const NAMA = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  const HARI = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
  const h = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${HARI[h]}, ${d} ${NAMA[m - 1]}`;
};

const buatKolom = (
  onIsi: (b: Baris) => void,
  onPutuskan: (b: Baris, setujui: boolean) => void,
): Array<Kolom<Baris>> => [
  {
    kunci: "tanggal", judul: "Tanggal", kepalaBaris: true,
    render: (b) => (
      <span style={{
        display: "block", paddingLeft: 9,
        // Pita kiri HANYA untuk yang perlu ditanya — jam kerja normal
        // melebihi standar tanpa dicatat lembur.
        borderLeft: b.melebihi_standar
          ? "3px solid var(--warning-teks)" : "3px solid transparent",
      }}>
        <strong style={{ fontSize: 13, color: C.text }}>{tanggalPendek(b.tanggal)}</strong>
        {b.kegiatan && (
          <span style={{ display: "block", fontSize: 12, color: C.mid, marginTop: 1, maxWidth: "42ch" }}>
            {b.kegiatan}
          </span>
        )}
        {b.status === "ditolak" && b.alasan_tolak && (
          <span style={{ display: "block", fontSize: 11, color: "var(--danger)", marginTop: 2 }}>
            Ditolak: {b.alasan_tolak}
          </span>
        )}
      </span>
    ),
  },
  {
    kunci: "proyek", judul: "Dibebankan ke",
    render: (b) => (
      b.proyek
        ? <span style={{ fontSize: 12, color: C.text }}>{b.proyek.name}</span>
        // Overhead kantor BUKAN kekurangan data — sebagian waktu staf memang
        // tak melekat ke proyek mana pun, dan menampilkannya seperti kosong
        // membuat orang mengisinya dengan proyek asal.
        : (
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            fontSize: 12, color: C.muted,
          }}>
            <Building2 size={12} aria-hidden="true" /> Overhead kantor
          </span>
        )
    ),
  },
  {
    kunci: "jam", judul: "Jam",
    render: (b) => (
      <span style={{ display: "block", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{jam(b.jam_kerja_n)}</span>
        {b.jam_lembur_n > 0 && (
          <span style={{ fontSize: 12, color: "var(--warning-teks)" }}> +{jam(b.jam_lembur_n)} lembur</span>
        )}
        {b.melebihi_standar && (
          <span
            title="Jam kerja normal melebihi jam standar tanpa dicatat sebagai lembur. Bisa jadi memang disepakati — yang penting selisihnya terlihat sebelum masuk laporan biaya."
            style={{
              display: "block", fontSize: 10, fontWeight: 700,
              color: "var(--warning-teks)",
            }}
          >di atas jam standar</span>
        )}
      </span>
    ),
  },
  {
    kunci: "status", judul: "Status",
    render: (b) => {
      const s = STATUS[b.status];
      return (
        <span style={{
          display: "inline-block", padding: "2px 8px", borderRadius: 999,
          fontSize: 11, fontWeight: 700,
          color: s.warna, background: s.bg, border: `1px solid ${s.border}`,
        }}>{s.label}</span>
      );
    },
  },
  {
    kunci: "aksi", judul: "",
    render: (b) => (
      <span style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
        {b.status === "diajukan" ? (
          <>
            <button
              type="button" onClick={() => onPutuskan(b, true)}
              // Peringatan diangkat ke TEMPAT KEPUTUSAN DIAMBIL, bukan hanya
              // ke kolom Jam. Ditemukan dari layar: baris 9 jam bertanda "di
              // atas jam standar" di kolom lain, sementara tombol Setujui di
              // sini tampak biasa saja — yang menyetujui bisa mengklik tanpa
              // menyadari ada yang perlu ditanya lebih dulu.
              aria-label={
                b.melebihi_standar
                  ? `Setujui timesheet ${tanggalPendek(b.tanggal)} — perhatian: jam kerja di atas standar tanpa dicatat lembur`
                  : `Setujui timesheet ${tanggalPendek(b.tanggal)}`
              }
              title={b.melebihi_standar
                ? "Jam kerja hari ini di atas jam standar tanpa dicatat sebagai lembur. Tanyakan dulu sebelum menyetujui."
                : undefined}
              style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                padding: "5px 9px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                border: b.melebihi_standar
                  ? "1px solid var(--warning-border)" : "1px solid var(--success-border)",
                background: b.melebihi_standar ? "var(--warning-bg)" : "var(--surface)",
                color: b.melebihi_standar ? "var(--warning-teks)" : "var(--success)",
                cursor: "pointer", whiteSpace: "nowrap",
              }}
            >
              {b.melebihi_standar
                ? <TriangleAlert size={12} aria-hidden="true" />
                : <Check size={12} aria-hidden="true" />}
              Setujui
            </button>
            <button
              type="button" onClick={() => onPutuskan(b, false)}
              aria-label={`Tolak timesheet ${tanggalPendek(b.tanggal)}`}
              style={{
                display: "inline-flex", alignItems: "center",
                padding: "5px 8px", borderRadius: 6,
                border: "1px solid var(--danger-border)", background: "var(--surface)",
                color: "var(--danger)", cursor: "pointer",
              }}
            ><X size={12} aria-hidden="true" /></button>
          </>
        ) : b.status === "disetujui" ? (
          // Yang sudah disetujui tak bisa diubah — persetujuan mengikat pada
          // isi yang disetujui. Tombolnya dihilangkan supaya tak menjanjikan
          // sesuatu yang akan ditolak server.
          <span style={{ fontSize: 11, color: C.muted }}>terkunci</span>
        ) : (
          <button
            type="button" onClick={() => onIsi(b)}
            style={{
              padding: "5px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600,
              border: `1px solid ${C.border}`, background: "var(--surface)",
              color: C.text, cursor: "pointer", whiteSpace: "nowrap",
            }}
          >Ubah</button>
        )}
      </span>
    ),
  },
];

export default function TimesheetPage() {
  const [pegawai, setPegawai] = useState<Pegawai[]>([]);
  const [pegawaiId, setPegawaiId] = useState("");
  const [bulan, setBulan] = useState(() => new Date().toISOString().slice(0, 7));
  const [detail, setDetail] = useState<Detail | null>(null);
  const [proyek, setProyek] = useState<Proyek[]>([]);
  const [memuat, setMemuat] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  const [isiHari, setIsiHari] = useState<Baris | "baru" | null>(null);
  const [fTanggal, setFTanggal] = useState("");
  const [fJam, setFJam] = useState("");
  const [fLembur, setFLembur] = useState("");
  const [fProyek, setFProyek] = useState("");
  const [fKegiatan, setFKegiatan] = useState("");

  const [tolakBaris, setTolakBaris] = useState<Baris | null>(null);
  const [fAlasan, setFAlasan] = useState("");

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
    api.get<{ projects: Proyek[] }>("/api/v1/projects", { signal: ac.signal })
      .then((r) => setProyek(r.data.projects ?? []))
      .catch(() => { /* proyek hanya untuk pilihan — tak menghalangi */ });
    return () => ac.abort();
  }, []);

  const muat = useCallback(async (id: string, bln: string) => {
    if (!id) { setDetail(null); return; }
    setMemuat(true); setGalat(null);
    try {
      const r = await api.get<Detail>(`/api/v1/sdm/pegawai/${id}/timesheet?bulan=${bln}`);
      setDetail(r.data);
    } catch (e) {
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalat(m ?? "Gagal memuat timesheet");
      setDetail(null);
    } finally { setMemuat(false); }
  }, []);

  useEffect(() => { void muat(pegawaiId, bulan); }, [pegawaiId, bulan, muat]);

  const bukaIsi = useCallback((b: Baris | "baru") => {
    setIsiHari(b);
    setGalatModal(null);
    if (b === "baru") {
      setFTanggal(""); setFJam(""); setFLembur(""); setFProyek(""); setFKegiatan("");
    } else {
      setFTanggal(b.tanggal);
      setFJam(String(b.jam_kerja_n));
      setFLembur(b.jam_lembur_n ? String(b.jam_lembur_n) : "");
      setFProyek(b.project_id ?? "");
      setFKegiatan(b.kegiatan ?? "");
    }
  }, []);

  const simpanHari = useCallback(async () => {
    if (!pegawaiId) return;
    if (!fTanggal) { setGalatModal("Tanggal wajib diisi"); return; }
    setMenyimpan(true); setGalatModal(null);
    try {
      await api.post(`/api/v1/sdm/pegawai/${pegawaiId}/timesheet`, {
        tanggal: fTanggal,
        jam_kerja: fJam, jam_lembur: fLembur,
        project_id: fProyek || null,
        kegiatan: fKegiatan.trim() || null,
      });
      setIsiHari(null);
      await muat(pegawaiId, bulan);
    } catch (e) {
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalatModal(m ?? "Gagal menyimpan timesheet");
    } finally { setMenyimpan(false); }
  }, [pegawaiId, fTanggal, fJam, fLembur, fProyek, fKegiatan, muat, bulan]);

  const ajukan = useCallback(async () => {
    if (!pegawaiId) return;
    setMenyimpan(true); setGalat(null);
    try {
      await api.post(`/api/v1/sdm/pegawai/${pegawaiId}/timesheet/ajukan?bulan=${bulan}`, {});
      await muat(pegawaiId, bulan);
    } catch (e) {
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalat(m ?? "Gagal mengajukan timesheet");
    } finally { setMenyimpan(false); }
  }, [pegawaiId, bulan, muat]);

  const putuskan = useCallback(async (b: Baris, setujui: boolean) => {
    if (!setujui) { setTolakBaris(b); setFAlasan(""); setGalatModal(null); return; }
    setGalat(null);
    try {
      await api.post(`/api/v1/sdm/timesheet/${b.id}/putuskan`, { setujui: true });
      await muat(pegawaiId, bulan);
    } catch (e) {
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalat(m ?? "Gagal menyetujui timesheet");
    }
  }, [pegawaiId, bulan, muat]);

  const simpanTolak = useCallback(async () => {
    if (!tolakBaris) return;
    if (!fAlasan.trim()) {
      setGalatModal("Alasan wajib diisi — yang mengajukan harus tahu apa yang perlu diperbaiki");
      return;
    }
    setMenyimpan(true); setGalatModal(null);
    try {
      await api.post(`/api/v1/sdm/timesheet/${tolakBaris.id}/putuskan`, {
        setujui: false, alasan: fAlasan.trim(),
      });
      setTolakBaris(null);
      await muat(pegawaiId, bulan);
    } catch (e) {
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalatModal(m ?? "Gagal menolak timesheet");
    } finally { setMenyimpan(false); }
  }, [tolakBaris, fAlasan, pegawaiId, bulan, muat]);

  const kartu: React.CSSProperties = {
    background: "var(--surface)", border: `1px solid ${C.border}`,
    borderRadius: 10, boxShadow: "var(--naik-1)",
  };

  const r = detail?.ringkasan;
  const namaProyek = (id: string | null) =>
    id === null ? "Overhead kantor" : (proyek.find((p) => p.id === id)?.name ?? "Proyek lain");

  return (
    // `--w-luas`: tabel padat kolom (tanggal+kegiatan, proyek, jam, status,
    // aksi), dan kegiatan kehilangan arti begitu membungkus.
    <div style={{
      padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)",
      width: "100%", maxWidth: "var(--w-luas)", margin: "0 auto",
    }}>
      <div className="rise" style={{ marginBottom: "var(--gap-bagian)" }}>
        <KepalaHalaman
          judul="Absensi & Timesheet"
          ikon={<Clock size={20} aria-hidden="true" />}
          keterangan={
            <>
              Jam kerja staf kantor yang <strong>dibebankan ke proyek</strong> — bukan
              penentu gajinya. Staf digaji bulanan tetap; yang ditentukan jamnya adalah
              berapa besar biaya overhead yang jatuh ke tiap proyek. Upah harian mandor
              &amp; tukang ada di menu Mandor &amp; Subkon.
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

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <div className="rise" style={{ ...kartu, padding: "12px 16px", minWidth: 260, flex: "1 1 260px", maxWidth: 400 }}>
          <label htmlFor="ts-pegawai" style={{
            fontSize: 11, fontWeight: 700, color: C.muted, display: "block",
            marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em",
          }}>Pegawai</label>
          <select
            id="ts-pegawai" value={pegawaiId} onChange={(e) => setPegawaiId(e.target.value)}
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

        <div className="rise" style={{ ...kartu, padding: "12px 16px", minWidth: 180, flex: "0 1 220px" }}>
          <label htmlFor="ts-bulan" style={{
            fontSize: 11, fontWeight: 700, color: C.muted, display: "block",
            marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em",
          }}>Bulan</label>
          <input
            id="ts-bulan" type="month" value={bulan} onChange={(e) => setBulan(e.target.value)}
            style={{
              padding: "8px 10px", borderRadius: 6, border: `1px solid ${C.border}`,
              background: "var(--surface)", color: C.text, fontSize: 13, width: "100%",
            }}
          />
        </div>
      </div>

      {!pegawaiId ? (
        <Kosong
          ikon={<CalendarClock size={28} />}
          judul="Pilih pegawai dulu"
          sebab="Timesheet dicatat per pegawai per bulan — jam kerjanya lalu dibebankan ke proyek yang dikerjakan."
        />
      ) : memuat ? (
        <div style={{ ...kartu, padding: 40, textAlign: "center", color: C.mid, fontSize: 13 }}>Memuat…</div>
      ) : detail && r ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            gap: 8, marginBottom: 14 }}>
            {[
              { l: "Jam kerja", v: jam(r.total_jam_kerja), sub: `${r.hari_terisi} hari terisi` },
              { l: "Lembur", v: jam(r.total_jam_lembur), sub: r.total_jam_lembur > 0 ? "dicatat terpisah" : "tidak ada" },
              { l: "Menunggu putusan", v: r.per_status.diajukan, sub: "diajukan ke atasan" },
              { l: "Disetujui", v: r.per_status.disetujui, sub: `dari ${r.hari_terisi} baris` },
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

          {r.hari_kosong.length > 0 && (
            <div role="status" className="rise" style={{
              ...kartu, padding: "12px 16px", marginBottom: 14,
              borderColor: "var(--warning-border)", background: "var(--warning-bg)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <TriangleAlert size={14} aria-hidden="true" style={{ color: "var(--warning-teks)" }} />
                <strong style={{ fontSize: 12.5, color: "var(--warning-teks)" }}>
                  {r.hari_kosong.length} hari kerja belum diisi
                </strong>
              </div>
              <p style={{ fontSize: 12, color: C.text, margin: 0, lineHeight: 1.55 }}>
                {r.hari_kosong.slice(0, 8).map(tanggalPendek).join(" · ")}
                {r.hari_kosong.length > 8 && ` · +${r.hari_kosong.length - 8} lagi`}
              </p>
              <p style={{ fontSize: 11, color: C.mid, margin: "6px 0 0", maxWidth: "68ch", lineHeight: 1.5 }}>
                Kalau memang tak bekerja (cuti, libur, sakit), abaikan — yang kosong
                <strong> tidak dihitung nol jam</strong>. Akhir pekan tak ikut disebut.
              </p>
            </div>
          )}

          {r.per_proyek.length > 0 && (
            <div className="rise" style={{ ...kartu, padding: "14px 18px", marginBottom: 14 }}>
              <div style={{
                fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 8,
                textTransform: "uppercase", letterSpacing: "0.05em",
              }}>Jam per proyek</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {r.per_proyek.map((p) => {
                  const total = r.total_jam_kerja + r.total_jam_lembur;
                  const bagian = total > 0 ? ((p.jam + p.lembur) / total) * 100 : 0;
                  return (
                    <div key={p.project_id ?? "kantor"} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 12.5, color: C.text, minWidth: 180, flex: "0 1 240px" }}>
                        {namaProyek(p.project_id)}
                      </span>
                      <span aria-hidden="true" style={{
                        flex: 1, height: 6, borderRadius: 999,
                        background: "var(--surface-2)", overflow: "hidden", minWidth: 60,
                      }}>
                        <span style={{
                          display: "block", height: "100%", width: `${bagian}%`,
                          background: p.project_id === null ? C.muted : "var(--navy)",
                        }} />
                      </span>
                      <span style={{
                        fontSize: 12.5, color: C.text, fontVariantNumeric: "tabular-nums",
                        minWidth: 90, textAlign: "right",
                      }}>
                        {jam(p.jam)} jam{p.lembur > 0 ? ` +${jam(p.lembur)}` : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
            <button
              type="button" onClick={() => bukaIsi("baru")}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "8px 14px", borderRadius: 6, fontSize: 13, fontWeight: 700,
                border: "1px solid var(--navy)", background: "var(--navy)",
                color: "var(--on-navy)", cursor: "pointer",
              }}
            ><Plus size={14} aria-hidden="true" /> Isi hari</button>

            {detail.pengajuan.boleh && (
              <button
                type="button" onClick={() => void ajukan()} disabled={menyimpan}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "8px 14px", borderRadius: 6, fontSize: 13, fontWeight: 600,
                  border: `1px solid ${C.border}`, background: "var(--surface)",
                  color: C.text, cursor: menyimpan ? "not-allowed" : "pointer",
                }}
              >
                <Send size={14} aria-hidden="true" />
                {menyimpan ? "Mengajukan…" : `Ajukan ${r.per_status.draf} draf`}
              </button>
            )}
          </div>

          {r.baris.length === 0 ? (
            <Kosong
              ikon={<CalendarClock size={28} />}
              judul="Belum ada timesheet bulan ini"
              sebab="Isi jam kerja per hari beserta proyek yang dikerjakan — itulah yang membuat biaya overhead bisa dibebankan ke proyek yang benar."
            />
          ) : (
            <Tabel              berpermukaan
              kolom={buatKolom(bukaIsi, putuskan)}
              data={r.baris}
              kunciBaris={(b) => b.id}
              caption={`Timesheet ${detail.pegawai.orang?.name ?? ""} bulan ${bulan}`}
            />
          )}
        </>
      ) : null}

      {/* ── Modal: isi / ubah hari ──────────────────────────────────────── */}
      <DialogBersama
        terbuka={isiHari !== null}
        onTutup={() => setIsiHari(null)}
        judul={isiHari === "baru" ? "Isi timesheet" : "Ubah timesheet"}
        keterangan={
          detail
            ? `Jam standar ${jam(Number(detail.pegawai.jam_standar) || 8)} jam/hari — lembur dicatat terpisah, tidak dihitung dari selisih.`
            : undefined
        }
        kaki={
          <>
            <button type="button" onClick={() => setIsiHari(null)} disabled={menyimpan}
              style={{
                padding: "8px 14px", borderRadius: 6, fontSize: 13, fontWeight: 600,
                border: `1px solid ${C.border}`, background: "var(--surface)",
                color: C.text, cursor: menyimpan ? "not-allowed" : "pointer",
              }}>Batal</button>
            <button type="button" onClick={() => void simpanHari()} disabled={menyimpan}
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
          <div>
            <label htmlFor="ts-tanggal" style={{
              fontSize: 11, fontWeight: 700, color: C.muted, display: "block",
              marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em",
            }}>Tanggal <span style={{ color: "var(--danger)" }}>· wajib</span></label>
            <input
              id="ts-tanggal" type="date" value={fTanggal}
              onChange={(e) => setFTanggal(e.target.value)}
              disabled={isiHari !== "baru" && isiHari !== null}
              style={{
                width: "100%", padding: "8px 10px", borderRadius: 6, fontSize: 13,
                border: `1px solid ${C.border}`, background: "var(--surface)", color: C.text,
              }}
            />
            <p style={{ fontSize: 11, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>
              Satu baris per hari. Mengisi tanggal yang sudah ada akan
              <strong> memperbaruinya</strong>, bukan menambah baris kedua.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label htmlFor="ts-jam" style={{
                fontSize: 11, fontWeight: 700, color: C.muted, display: "block",
                marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em",
              }}>Jam kerja</label>
              <input
                id="ts-jam" type="number" step="0.5" min="0" max="24" inputMode="decimal"
                value={fJam} onChange={(e) => setFJam(e.target.value)}
                style={{
                  width: "100%", padding: "8px 10px", borderRadius: 6, fontSize: 13,
                  border: `1px solid ${C.border}`, background: "var(--surface)", color: C.text,
                }}
              />
            </div>
            <div>
              <label htmlFor="ts-lembur" style={{
                fontSize: 11, fontWeight: 700, color: C.muted, display: "block",
                marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em",
              }}>Jam lembur</label>
              <input
                id="ts-lembur" type="number" step="0.5" min="0" max="24" inputMode="decimal"
                value={fLembur} onChange={(e) => setFLembur(e.target.value)}
                placeholder="0"
                style={{
                  width: "100%", padding: "8px 10px", borderRadius: 6, fontSize: 13,
                  border: `1px solid ${C.border}`, background: "var(--surface)", color: C.text,
                }}
              />
            </div>
          </div>
          <p style={{ fontSize: 11, color: C.muted, margin: 0, lineHeight: 1.5 }}>
            Lembur diisi <strong>sendiri</strong>, tidak dihitung dari selisih jam
            standar: lembur harus diperintahkan, dan lembur di hari libur tetap
            penuh meski totalnya di bawah standar.
          </p>

          <div>
            <label htmlFor="ts-proyek" style={{
              fontSize: 11, fontWeight: 700, color: C.muted, display: "block",
              marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em",
            }}>Dibebankan ke proyek</label>
            <select
              id="ts-proyek" value={fProyek} onChange={(e) => setFProyek(e.target.value)}
              style={{
                width: "100%", padding: "8px 10px", borderRadius: 6, fontSize: 13,
                border: `1px solid ${C.border}`, background: "var(--surface)", color: C.text,
              }}
            >
              <option value="">— overhead kantor (tak melekat proyek) —</option>
              {proyek.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <p style={{ fontSize: 11, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>
              Kosongkan kalau waktunya memang overhead kantor. Memilih proyek asal
              justru merusak angka yang dicari.
            </p>
          </div>

          <div>
            <label htmlFor="ts-kegiatan" style={{
              fontSize: 11, fontWeight: 700, color: C.muted, display: "block",
              marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em",
            }}>Kegiatan</label>
            <input
              id="ts-kegiatan" value={fKegiatan} onChange={(e) => setFKegiatan(e.target.value)}
              placeholder="mis. Rapat koordinasi & tinjau RAB"
              style={{
                width: "100%", padding: "8px 10px", borderRadius: 6, fontSize: 13,
                border: `1px solid ${C.border}`, background: "var(--surface)", color: C.text,
              }}
            />
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

      {/* ── Modal: tolak ────────────────────────────────────────────────── */}
      <DialogBersama
        terbuka={tolakBaris !== null}
        onTutup={() => setTolakBaris(null)}
        judul="Tolak timesheet"
        keterangan={tolakBaris ? tanggalPendek(tolakBaris.tanggal) : undefined}
        kaki={
          <>
            <button type="button" onClick={() => setTolakBaris(null)} disabled={menyimpan}
              style={{
                padding: "8px 14px", borderRadius: 6, fontSize: 13, fontWeight: 600,
                border: `1px solid ${C.border}`, background: "var(--surface)",
                color: C.text, cursor: menyimpan ? "not-allowed" : "pointer",
              }}>Batal</button>
            {/* Latar LEMBUT + `--on-danger-bg`, bukan `--danger` pekat dengan
                putih dipaku. Tak ada token untuk teks di atas `--danger`
                pekat, dan putih dipaku akan gagal kontras saat `--danger`
                berbalik terang di mode gelap — jebakan yang sama dengan
                `--navy`/`--on-navy` (globals.css:55). */}
            <button type="button" onClick={() => void simpanTolak()} disabled={menyimpan}
              style={{
                padding: "8px 14px", borderRadius: 6, fontSize: 13, fontWeight: 700,
                border: "1px solid var(--danger-border)", background: "var(--danger-bg)",
                color: "var(--on-danger-bg)", cursor: menyimpan ? "not-allowed" : "pointer",
                opacity: menyimpan ? 0.7 : 1,
              }}>{menyimpan ? "Menolak…" : "Tolak"}</button>
          </>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label htmlFor="ts-alasan" style={{
              fontSize: 11, fontWeight: 700, color: C.muted, display: "block",
              marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em",
            }}>Alasan <span style={{ color: "var(--danger)" }}>· wajib</span></label>
            <textarea
              id="ts-alasan" rows={3} value={fAlasan} onChange={(e) => setFAlasan(e.target.value)}
              placeholder="Apa yang perlu diperbaiki"
              style={{
                width: "100%", padding: "8px 10px", borderRadius: 6, fontSize: 13,
                border: `1px solid ${C.border}`, background: "var(--surface)",
                color: C.text, resize: "vertical", fontFamily: "inherit",
              }}
            />
            <p style={{ fontSize: 11, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>
              Yang mengajukan harus tahu <strong>apa</strong> yang perlu diperbaiki,
              bukan sekadar bahwa ditolak.
            </p>
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
