"use client";

/**
 * CUTI & IZIN KARYAWAN.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * DUA ATURAN YANG MENENTUKAN KEBENARAN ANGKANYA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * **1. Saldo diturunkan dari transaksi, tak pernah disimpan.**
 *
 * Kolom `sisa_cuti` yang di-update tiap pengajuan akan menyimpang diam-diam
 * dari riwayatnya. Yang paling berkepentingan angkanya benar adalah karyawan,
 * dan ia tak punya cara memeriksa — karena itu halaman ini menampilkan
 * hak, terpakai, dan tertahan SEBAGAI ANGKA TERPISAH, bukan cuma sisanya.
 *
 * **2. Jumlah hari dihitung sekali saat diajukan, lalu disimpan.**
 *
 * Kalender libur bisa berubah — cuti bersama sering diumumkan pemerintah di
 * tengah tahun. Cuti yang sudah disetujui tak boleh tiba-tiba memakan jatah
 * yang berbeda dari yang disepakati.
 *
 * ── Kenapa hanya cuti TAHUNAN yang memotong jatah
 *
 * Sakit, melahirkan, cuti penting, dan cuti besar adalah hak yang TERPISAH.
 * Memotongnya dari jatah berarti karyawan yang sakit kehilangan liburannya —
 * dan ia baru menyadarinya saat mengajukan cuti tahunan dan ditolak karena
 * "jatah habis".
 *
 * ── Satu aksen (§3d)
 *
 * Yang menonjol hanya kartu sisa jatah. Riwayat dan daftar hak tenang.
 */

import { useCallback, useEffect, useState } from "react";
import {
  CalendarDays, TriangleAlert, Check, X, Plus, Ban, Info, CalendarOff,
} from "lucide-react";
import { api, makeAbortController } from "@/lib/api";
import { C } from "@/lib/warna-ui";
import { Kosong } from "@/components/ui-dasar";
import { KepalaHalaman, Tabel, type Kolom } from "@/components/dasar";
import { DialogBersama } from "@/components/dialog-bersama";

type JenisCuti = "tahunan" | "sakit" | "melahirkan" | "penting" | "besar" | "tanpa_gaji";
type StatusCuti = "diajukan" | "disetujui" | "ditolak" | "dibatalkan";

interface Ambil {
  id: string;
  jenis: JenisCuti;
  tanggal_mulai: string;
  tanggal_selesai: string;
  jumlah_hari: string | number;
  hari_dilewati: string | null;
  alasan: string | null;
  status: StatusCuti;
  alasan_tolak: string | null;
  pemutus: { id: string; name: string } | null;
}

interface Hak {
  id: string;
  tahun: number;
  jumlah_hari: string | number;
  alasan: string;
  berlaku_sampai: string | null;
  pemberi: { id: string; name: string } | null;
}

interface Saldo {
  tahun: number;
  hak: number;
  terpakai: number;
  tertahan: number;
  sisa: number;
}

interface Pegawai {
  id: string;
  nomor_induk: string | null;
  jabatan: string | null;
  orang: { id: string; name: string } | null;
}

interface Detail {
  pegawai: Pegawai;
  tahun: number;
  hak: Hak[];
  ambil: Ambil[];
  saldo: Saldo;
}

/**
 * Arti tiap jenis — ditulis di layar, bukan diasumsikan diketahui.
 *
 * Yang paling penting: MANA yang memotong jatah. Karyawan yang mengira cuti
 * sakitnya memotong jatah akan menahan diri sakit, dan itu kebalikan dari
 * yang dimaksud aturannya.
 */
const JENIS: Record<JenisCuti, { label: string; jatah: boolean; arti: string }> = {
  tahunan: {
    label: "Tahunan", jatah: true,
    arti: "Memotong jatah cuti tahunan.",
  },
  sakit: {
    label: "Sakit", jatah: false,
    arti: "TIDAK memotong jatah tahunan — sakit adalah hak yang terpisah.",
  },
  melahirkan: {
    label: "Melahirkan", jatah: false,
    arti: "TIDAK memotong jatah tahunan — hak tersendiri menurut UU.",
  },
  penting: {
    label: "Penting", jatah: false,
    arti: "Menikah, keluarga wafat, dan sejenisnya. TIDAK memotong jatah tahunan.",
  },
  besar: {
    label: "Cuti besar", jatah: false,
    arti: "Hak setelah masa kerja tertentu. TIDAK memotong jatah tahunan.",
  },
  tanpa_gaji: {
    label: "Tanpa gaji", jatah: false,
    arti: "Memotong gaji, bukan jatah cuti.",
  },
};

const STATUS: Record<StatusCuti, { label: string; warna: string; bg: string; border: string }> = {
  diajukan: { label: "Diajukan", warna: "var(--warning-teks)", bg: "var(--warning-bg)", border: "var(--warning-border)" },
  disetujui: { label: "Disetujui", warna: "var(--success)", bg: "var(--success-bg)", border: "var(--success-border)" },
  ditolak: { label: "Ditolak", warna: "var(--danger)", bg: "var(--danger-bg)", border: "var(--danger-border)" },
  dibatalkan: { label: "Dibatalkan", warna: C.muted, bg: "var(--surface-2)", border: C.border },
};

/** `YYYY-MM-DD` → "Sen, 7 Sep" tanpa melewati zona waktu. */
const tanggalPendek = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const NAMA = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  const HARI = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
  const h = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${HARI[h]}, ${d} ${NAMA[m - 1]}`;
};

const hari = (v: string | number) => {
  const n = Number(v);
  return Number.isFinite(n)
    ? new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(n)
    : "—";
};

const buatKolom = (
  onPutuskan: (a: Ambil, setujui: boolean) => void,
  onBatal: (a: Ambil) => void,
): Array<Kolom<Ambil>> => [
  {
    kunci: "rentang", judul: "Tanggal", kepalaBaris: true,
    render: (a) => (
      <span style={{ display: "block" }}>
        <strong style={{ fontSize: 13, color: C.text }}>
          {tanggalPendek(a.tanggal_mulai)}
          {a.tanggal_selesai !== a.tanggal_mulai && ` – ${tanggalPendek(a.tanggal_selesai)}`}
        </strong>
        {a.alasan && (
          <span style={{ display: "block", fontSize: 12, color: C.mid, marginTop: 1, maxWidth: "38ch" }}>
            {a.alasan}
          </span>
        )}
        {a.status === "ditolak" && a.alasan_tolak && (
          <span style={{ display: "block", fontSize: 11, color: "var(--danger)", marginTop: 2, maxWidth: "38ch" }}>
            Ditolak: {a.alasan_tolak}
          </span>
        )}
      </span>
    ),
  },
  {
    kunci: "jenis", judul: "Jenis",
    render: (a) => {
      const j = JENIS[a.jenis];
      return (
        <span
          title={j.arti}
          style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700,
            // Yang MEMOTONG jatah diberi warna; yang tidak, tenang. Bedanya
            // itulah yang paling sering disalahpahami karyawan.
            color: j.jatah ? "var(--navy)" : C.mid,
            background: j.jatah ? "var(--navy-light)" : "var(--surface-2)",
            border: `1px solid ${j.jatah ? "var(--navy-light)" : C.border}`,
          }}
        >
          {j.label}
        </span>
      );
    },
  },
  {
    kunci: "hari", judul: "Hari",
    render: (a) => (
      <span style={{ display: "block", textAlign: "right" }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.text, fontVariantNumeric: "tabular-nums" }}>
          {hari(a.jumlah_hari)}
        </span>
        {a.hari_dilewati && (
          // Pegawai yang bertanya "kenapa cuma 3 hari padahal Senin sampai
          // Jumat" dijawab dari layarnya sendiri — SEBABNYA, bukan cuma
          // jumlahnya. Ditemukan dari layar: "2 hari dilewati" masih menuntut
          // hover untuk tahu apakah itu akhir pekan atau libur nasional, dan
          // bedanya penting (yang satu wajar, yang satu perlu diperiksa).
          <span style={{ display: "block", fontSize: 10, color: C.muted, maxWidth: "22ch" }}>
            {/* Sebab saja, tanpa tanggalnya — tanggal sudah ada di kolom kiri. */}
            −{a.hari_dilewati.split(",")
              .map((x) => x.replace(/^\s*\S+\s*\(/, "").replace(/\)\s*$/, ""))
              .join(", ")}
          </span>
        )}
      </span>
    ),
  },
  {
    kunci: "status", judul: "Status",
    render: (a) => {
      const s = STATUS[a.status];
      return (
        <span style={{ display: "block" }}>
          <span style={{
            display: "inline-block", padding: "2px 8px", borderRadius: 999,
            fontSize: 11, fontWeight: 700,
            color: s.warna, background: s.bg, border: `1px solid ${s.border}`,
          }}>{s.label}</span>
          {a.pemutus && (
            <span style={{ display: "block", fontSize: 10, color: C.muted, marginTop: 2 }}>
              {a.pemutus.name}
            </span>
          )}
        </span>
      );
    },
  },
  {
    kunci: "aksi", judul: "",
    render: (a) => (
      <span style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
        {a.status === "diajukan" && (
          <>
            <button
              type="button" onClick={() => onPutuskan(a, true)}
              aria-label={`Setujui cuti ${tanggalPendek(a.tanggal_mulai)}`}
              style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                padding: "5px 9px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                border: "1px solid var(--success-border)", background: "var(--surface)",
                color: "var(--success)", cursor: "pointer", whiteSpace: "nowrap",
              }}
            ><Check size={12} aria-hidden="true" /> Setujui</button>
            <button
              type="button" onClick={() => onPutuskan(a, false)}
              aria-label={`Tolak cuti ${tanggalPendek(a.tanggal_mulai)}`}
              style={{
                display: "inline-flex", alignItems: "center",
                padding: "5px 8px", borderRadius: 6,
                border: "1px solid var(--danger-border)", background: "var(--surface)",
                color: "var(--danger)", cursor: "pointer",
              }}
            ><X size={12} aria-hidden="true" /></button>
          </>
        )}
        {(a.status === "diajukan" || a.status === "disetujui") && (
          <button
            type="button" onClick={() => onBatal(a)}
            aria-label={`Batalkan cuti ${tanggalPendek(a.tanggal_mulai)}`}
            title="Dibatalkan, bukan dihapus — jejaknya tetap ada"
            style={{
              display: "inline-flex", alignItems: "center",
              padding: "5px 8px", borderRadius: 6,
              border: `1px solid ${C.border}`, background: "var(--surface)",
              color: C.mid, cursor: "pointer",
            }}
          ><Ban size={12} aria-hidden="true" /></button>
        )}
      </span>
    ),
  },
];

export default function CutiPage() {
  const [pegawai, setPegawai] = useState<Pegawai[]>([]);
  const [pegawaiId, setPegawaiId] = useState("");
  const [tahun, setTahun] = useState(() => new Date().getFullYear());
  const [detail, setDetail] = useState<Detail | null>(null);
  const [memuat, setMemuat] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  const [ajukan, setAjukan] = useState(false);
  const [fJenis, setFJenis] = useState<JenisCuti>("tahunan");
  const [fMulai, setFMulai] = useState("");
  const [fSelesai, setFSelesai] = useState("");
  const [fAlasan, setFAlasan] = useState("");

  const [tolakBaris, setTolakBaris] = useState<Ambil | null>(null);
  const [fTolak, setFTolak] = useState("");

  const [beriHak, setBeriHak] = useState(false);
  const [hJumlah, setHJumlah] = useState("");
  const [hAlasan, setHAlasan] = useState("");

  const [menyimpan, setMenyimpan] = useState(false);
  const [galatModal, setGalatModal] = useState<string | null>(null);
  const [penghalang, setPenghalang] = useState<Array<{ kode: string; pesan: string }>>([]);

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

  const muat = useCallback(async (id: string, th: number) => {
    if (!id) { setDetail(null); return; }
    setMemuat(true); setGalat(null);
    try {
      const r = await api.get<Detail>(`/api/v1/sdm/pegawai/${id}/cuti?tahun=${th}`);
      setDetail(r.data);
    } catch (e) {
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalat(m ?? "Gagal memuat data cuti");
      setDetail(null);
    } finally { setMemuat(false); }
  }, []);

  useEffect(() => { void muat(pegawaiId, tahun); }, [pegawaiId, tahun, muat]);

  const simpanAjukan = useCallback(async () => {
    if (!pegawaiId) return;
    if (!fMulai || !fSelesai) { setGalatModal("Tanggal mulai dan selesai wajib diisi"); return; }
    setMenyimpan(true); setGalatModal(null); setPenghalang([]);
    try {
      await api.post(`/api/v1/sdm/pegawai/${pegawaiId}/cuti`, {
        jenis: fJenis, tanggal_mulai: fMulai, tanggal_selesai: fSelesai,
        alasan: fAlasan.trim() || null,
      });
      setAjukan(false);
      setFMulai(""); setFSelesai(""); setFAlasan("");
      await muat(pegawaiId, tahun);
    } catch (e) {
      const d = (e as { response?: { data?: { error?: string; penghalang?: Array<{ kode: string; pesan: string }> } } })?.response?.data;
      setPenghalang(d?.penghalang ?? []);
      setGalatModal(d?.penghalang?.length ? null : (d?.error ?? "Gagal mengajukan cuti"));
    } finally { setMenyimpan(false); }
  }, [pegawaiId, fJenis, fMulai, fSelesai, fAlasan, muat, tahun]);

  const putuskan = useCallback(async (a: Ambil, setujui: boolean) => {
    if (!setujui) { setTolakBaris(a); setFTolak(""); setGalatModal(null); return; }
    setGalat(null);
    try {
      await api.post(`/api/v1/sdm/cuti/${a.id}/putuskan`, { setujui: true });
      await muat(pegawaiId, tahun);
    } catch (e) {
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalat(m ?? "Gagal menyetujui cuti");
    }
  }, [pegawaiId, tahun, muat]);

  const simpanTolak = useCallback(async () => {
    if (!tolakBaris) return;
    if (!fTolak.trim()) {
      setGalatModal("Alasan wajib diisi — cuti yang ditolak tanpa alasan akan diajukan lagi dengan bentuk yang sama");
      return;
    }
    setMenyimpan(true); setGalatModal(null);
    try {
      await api.post(`/api/v1/sdm/cuti/${tolakBaris.id}/putuskan`, {
        setujui: false, alasan: fTolak.trim(),
      });
      setTolakBaris(null);
      await muat(pegawaiId, tahun);
    } catch (e) {
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalatModal(m ?? "Gagal menolak cuti");
    } finally { setMenyimpan(false); }
  }, [tolakBaris, fTolak, pegawaiId, tahun, muat]);

  const batal = useCallback(async (a: Ambil) => {
    setGalat(null);
    try {
      await api.post(`/api/v1/sdm/cuti/${a.id}/batal`, {});
      await muat(pegawaiId, tahun);
    } catch (e) {
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalat(m ?? "Gagal membatalkan cuti");
    }
  }, [pegawaiId, tahun, muat]);

  const simpanHak = useCallback(async () => {
    if (!pegawaiId) return;
    if (!hJumlah.trim()) { setGalatModal("Jumlah hari wajib diisi"); return; }
    if (!hAlasan.trim()) { setGalatModal("Alasan wajib diisi"); return; }
    setMenyimpan(true); setGalatModal(null);
    try {
      await api.post(`/api/v1/sdm/pegawai/${pegawaiId}/cuti-hak`, {
        tahun, jumlah_hari: hJumlah, alasan: hAlasan.trim(),
      });
      setBeriHak(false); setHJumlah(""); setHAlasan("");
      await muat(pegawaiId, tahun);
    } catch (e) {
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalatModal(m ?? "Gagal menambah hak cuti");
    } finally { setMenyimpan(false); }
  }, [pegawaiId, tahun, hJumlah, hAlasan, muat]);

  const kartu: React.CSSProperties = {
    background: "var(--surface)", border: `1px solid ${C.border}`,
    borderRadius: 10, boxShadow: "var(--naik-1)",
  };

  const s = detail?.saldo;

  return (
    // `--w-luas`: tabel padat kolom (tanggal+alasan, jenis, hari, status, aksi).
    <div style={{
      padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)",
      width: "100%", maxWidth: "var(--w-luas)", margin: "0 auto",
    }}>
      <div className="rise" style={{ marginBottom: "var(--gap-bagian)" }}>
        <KepalaHalaman
          judul="Cuti & Izin"
          ikon={<CalendarOff size={20} aria-hidden="true" />}
          keterangan={
            <>
              Cuti dan izin karyawan. Saldo <strong>dihitung dari riwayatnya</strong>,
              bukan disimpan sebagai angka — supaya selalu bisa ditelusuri ke barisnya.
              Akhir pekan dan hari libur nasional <strong>tidak memotong jatah</strong>,
              dan hanya cuti <em>tahunan</em> yang mengurangi jatah tahunan.
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
          <label htmlFor="ct-pegawai" style={{
            fontSize: 11, fontWeight: 700, color: C.muted, display: "block",
            marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em",
          }}>Pegawai</label>
          <select
            id="ct-pegawai" value={pegawaiId} onChange={(e) => setPegawaiId(e.target.value)}
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

        <div className="rise" style={{ ...kartu, padding: "12px 16px", flex: "0 1 160px" }}>
          <label htmlFor="ct-tahun" style={{
            fontSize: 11, fontWeight: 700, color: C.muted, display: "block",
            marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em",
          }}>Tahun jatah</label>
          <input
            id="ct-tahun" type="number" min="2000" max="2200" value={tahun}
            onChange={(e) => setTahun(Number(e.target.value) || tahun)}
            style={{
              padding: "8px 10px", borderRadius: 6, border: `1px solid ${C.border}`,
              background: "var(--surface)", color: C.text, fontSize: 13, width: "100%",
            }}
          />
        </div>
      </div>

      {!pegawaiId ? (
        <Kosong
          ikon={<CalendarDays size={28} />}
          judul="Pilih pegawai dulu"
          sebab="Jatah cuti dan riwayat pengajuan dicatat per pegawai per tahun."
        />
      ) : memuat ? (
        <div style={{ ...kartu, padding: 40, textAlign: "center", color: C.mid, fontSize: 13 }}>Memuat…</div>
      ) : detail && s ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            gap: 8, marginBottom: 14 }}>
            {[
              { l: "Sisa jatah", v: hari(s.sisa), sub: `dari ${hari(s.hak)} hari`, tonjol: true },
              { l: "Terpakai", v: hari(s.terpakai), sub: "sudah disetujui" },
              { l: "Menunggu putusan", v: hari(s.tertahan), sub: s.tertahan > 0 ? "ikut menahan jatah" : "tidak ada" },
              { l: "Hak tahun ini", v: hari(s.hak), sub: `${detail.hak.filter((h) => h.tahun === tahun).length} pemberian` },
            ].map((k) => (
              <div key={k.l} style={{
                ...kartu, padding: "12px 14px",
                // Satu aksen: hanya sisa jatah yang diberi penekanan, dan
                // hanya saat NEGATIF ia berubah warna — jatah yang terlanjur
                // terpakai berlebih harus terlihat.
                borderColor: k.tonjol && s.sisa < 0 ? "var(--danger-border)" : C.border,
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.muted,
                  textTransform: "uppercase", letterSpacing: "0.05em" }}>{k.l}</div>
                <div style={{
                  fontSize: k.tonjol ? 26 : 22, fontWeight: 700, marginTop: 4,
                  color: k.tonjol && s.sisa < 0 ? "var(--danger)" : C.text,
                  fontVariantNumeric: "tabular-nums",
                }}>{k.v}</div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{k.sub}</div>
              </div>
            ))}
          </div>

          {s.sisa < 0 && (
            <div role="status" className="rise" style={{
              ...kartu, padding: "12px 16px", marginBottom: 14,
              borderColor: "var(--danger-border)", background: "var(--danger-bg)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <TriangleAlert size={14} aria-hidden="true" style={{ color: "var(--danger)" }} />
                <strong style={{ fontSize: 12.5, color: "var(--danger)" }}>
                  Jatah terpakai berlebih {hari(Math.abs(s.sisa))} hari
                </strong>
              </div>
              <p style={{ fontSize: 12, color: C.text, margin: "4px 0 0 20px", lineHeight: 1.5 }}>
                Angkanya sengaja tidak dipotong ke nol — yang berlebih justru
                yang perlu diputuskan: tambah hak, atau catat sebagai cuti tanpa gaji.
              </p>
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
            <button
              type="button" onClick={() => { setAjukan(true); setGalatModal(null); setPenghalang([]); }}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "8px 14px", borderRadius: 6, fontSize: 13, fontWeight: 700,
                border: "1px solid var(--navy)", background: "var(--navy)",
                color: "var(--on-navy)", cursor: "pointer",
              }}
            ><Plus size={14} aria-hidden="true" /> Ajukan cuti</button>

            <button
              type="button" onClick={() => { setBeriHak(true); setGalatModal(null); }}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "8px 14px", borderRadius: 6, fontSize: 13, fontWeight: 600,
                border: `1px solid ${C.border}`, background: "var(--surface)",
                color: C.text, cursor: "pointer",
              }}
            >Tetapkan jatah</button>
          </div>

          {detail.hak.filter((h) => h.tahun === tahun).length > 0 && (
            <div className="rise" style={{ ...kartu, padding: "14px 18px", marginBottom: 14 }}>
              <div style={{
                fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 8,
                textTransform: "uppercase", letterSpacing: "0.05em",
              }}>Dari mana jatah {tahun} berasal</div>
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex",
                flexDirection: "column", gap: 5 }}>
                {detail.hak.filter((h) => h.tahun === tahun).map((h) => {
                  const n = Number(h.jumlah_hari);
                  return (
                    <li key={h.id} style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 12.5 }}>
                      <span style={{
                        minWidth: 62, textAlign: "right", fontWeight: 700,
                        fontVariantNumeric: "tabular-nums",
                        // Koreksi negatif diberi warna supaya terbaca sebagai
                        // pengurangan, bukan salah baca angka.
                        color: n < 0 ? "var(--danger)" : C.text,
                      }}>{n > 0 ? "+" : ""}{hari(n)} hari</span>
                      <span style={{ color: C.text }}>{h.alasan}</span>
                      {h.berlaku_sampai && (
                        <span style={{ fontSize: 11, color: "var(--warning-teks)" }}>
                          hangus {tanggalPendek(h.berlaku_sampai)}
                        </span>
                      )}
                      {h.pemberi && (
                        <span style={{ fontSize: 11, color: C.muted, marginLeft: "auto" }}>
                          {h.pemberi.name}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {detail.ambil.length === 0 ? (
            <Kosong
              ikon={<CalendarDays size={28} />}
              judul="Belum ada pengajuan cuti"
              sebab="Pengajuan yang dibuat di sini menghitung hari kerjanya sendiri — akhir pekan dan hari libur nasional tak ikut memotong jatah."
            />
          ) : (
            <Tabel              berpermukaan
              kolom={buatKolom(putuskan, batal)}
              data={detail.ambil}
              kunciBaris={(a) => a.id}
              caption={`Riwayat cuti ${detail.pegawai.orang?.name ?? ""}`}
            />
          )}
        </>
      ) : null}

      {/* ── Modal: ajukan cuti ──────────────────────────────────────────── */}
      <DialogBersama
        terbuka={ajukan}
        onTutup={() => setAjukan(false)}
        judul="Ajukan cuti"
        keterangan="Jumlah hari dihitung dari hari kerja — akhir pekan dan hari libur tidak dihitung."
        kaki={
          <>
            <button type="button" onClick={() => setAjukan(false)} disabled={menyimpan}
              style={{
                padding: "8px 14px", borderRadius: 6, fontSize: 13, fontWeight: 600,
                border: `1px solid ${C.border}`, background: "var(--surface)",
                color: C.text, cursor: menyimpan ? "not-allowed" : "pointer",
              }}>Batal</button>
            <button type="button" onClick={() => void simpanAjukan()} disabled={menyimpan}
              style={{
                padding: "8px 14px", borderRadius: 6, fontSize: 13, fontWeight: 700,
                border: "1px solid var(--navy)", background: "var(--navy)",
                color: "var(--on-navy)", cursor: menyimpan ? "not-allowed" : "pointer",
                opacity: menyimpan ? 0.7 : 1,
              }}>{menyimpan ? "Mengajukan…" : "Ajukan"}</button>
          </>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label htmlFor="ct-jenis" style={{
              fontSize: 11, fontWeight: 700, color: C.muted, display: "block",
              marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em",
            }}>Jenis</label>
            <select
              id="ct-jenis" value={fJenis} onChange={(e) => setFJenis(e.target.value as JenisCuti)}
              style={{
                width: "100%", padding: "8px 10px", borderRadius: 6, fontSize: 13,
                border: `1px solid ${C.border}`, background: "var(--surface)", color: C.text,
              }}
            >
              {(Object.keys(JENIS) as JenisCuti[]).map((k) => (
                <option key={k} value={k}>{JENIS[k].label}</option>
              ))}
            </select>
            <p style={{
              fontSize: 11, marginTop: 4, lineHeight: 1.5,
              color: JENIS[fJenis].jatah ? C.mid : "var(--success)",
            }}>
              {JENIS[fJenis].arti}
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label htmlFor="ct-mulai" style={{
                fontSize: 11, fontWeight: 700, color: C.muted, display: "block",
                marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em",
              }}>Mulai</label>
              <input id="ct-mulai" type="date" value={fMulai}
                onChange={(e) => setFMulai(e.target.value)}
                style={{
                  width: "100%", padding: "8px 10px", borderRadius: 6, fontSize: 13,
                  border: `1px solid ${C.border}`, background: "var(--surface)", color: C.text,
                }} />
            </div>
            <div>
              <label htmlFor="ct-selesai" style={{
                fontSize: 11, fontWeight: 700, color: C.muted, display: "block",
                marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em",
              }}>Selesai</label>
              <input id="ct-selesai" type="date" value={fSelesai}
                onChange={(e) => setFSelesai(e.target.value)}
                style={{
                  width: "100%", padding: "8px 10px", borderRadius: 6, fontSize: 13,
                  border: `1px solid ${C.border}`, background: "var(--surface)", color: C.text,
                }} />
            </div>
          </div>

          <div>
            <label htmlFor="ct-alasan" style={{
              fontSize: 11, fontWeight: 700, color: C.muted, display: "block",
              marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em",
            }}>Alasan</label>
            <input id="ct-alasan" value={fAlasan} onChange={(e) => setFAlasan(e.target.value)}
              placeholder="mis. Acara keluarga di Solo"
              style={{
                width: "100%", padding: "8px 10px", borderRadius: 6, fontSize: 13,
                border: `1px solid ${C.border}`, background: "var(--surface)", color: C.text,
              }} />
          </div>

          {penghalang.length > 0 && (
            <div role="alert" style={{
              padding: "10px 12px", borderRadius: 8, fontSize: 12,
              border: "1px solid var(--warning-border)", background: "var(--warning-bg)",
              color: C.text,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <Info size={13} aria-hidden="true" style={{ color: "var(--warning-teks)" }} />
                <strong style={{ color: "var(--warning-teks)" }}>Belum bisa diajukan</strong>
              </div>
              <ul style={{ margin: "0 0 0 20px", padding: 0, lineHeight: 1.6 }}>
                {penghalang.map((p) => <li key={p.kode}>{p.pesan}</li>)}
              </ul>
            </div>
          )}

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
        judul="Tolak pengajuan cuti"
        keterangan={tolakBaris
          ? `${tanggalPendek(tolakBaris.tanggal_mulai)} – ${tanggalPendek(tolakBaris.tanggal_selesai)}`
          : undefined}
        kaki={
          <>
            <button type="button" onClick={() => setTolakBaris(null)} disabled={menyimpan}
              style={{
                padding: "8px 14px", borderRadius: 6, fontSize: 13, fontWeight: 600,
                border: `1px solid ${C.border}`, background: "var(--surface)",
                color: C.text, cursor: menyimpan ? "not-allowed" : "pointer",
              }}>Batal</button>
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
            <label htmlFor="ct-tolak" style={{
              fontSize: 11, fontWeight: 700, color: C.muted, display: "block",
              marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em",
            }}>Alasan <span style={{ color: "var(--danger)" }}>· wajib</span></label>
            <textarea id="ct-tolak" rows={3} value={fTolak}
              onChange={(e) => setFTolak(e.target.value)}
              placeholder="Kenapa ditolak, dan apa yang bisa diubah"
              style={{
                width: "100%", padding: "8px 10px", borderRadius: 6, fontSize: 13,
                border: `1px solid ${C.border}`, background: "var(--surface)",
                color: C.text, resize: "vertical", fontFamily: "inherit",
              }} />
            <p style={{ fontSize: 11, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>
              Cuti yang ditolak tanpa alasan akan diajukan lagi dengan bentuk
              yang sama.
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

      {/* ── Modal: tetapkan jatah ───────────────────────────────────────── */}
      <DialogBersama
        terbuka={beriHak}
        onTutup={() => setBeriHak(false)}
        judul={`Tetapkan jatah cuti ${tahun}`}
        keterangan="Jatah DITAMBAHKAN sebagai baris baru, tidak menimpa — koreksi pun dicatat sebagai baris tersendiri supaya jejaknya terlihat."
        kaki={
          <>
            <button type="button" onClick={() => setBeriHak(false)} disabled={menyimpan}
              style={{
                padding: "8px 14px", borderRadius: 6, fontSize: 13, fontWeight: 600,
                border: `1px solid ${C.border}`, background: "var(--surface)",
                color: C.text, cursor: menyimpan ? "not-allowed" : "pointer",
              }}>Batal</button>
            <button type="button" onClick={() => void simpanHak()} disabled={menyimpan}
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
            <label htmlFor="ct-hjumlah" style={{
              fontSize: 11, fontWeight: 700, color: C.muted, display: "block",
              marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em",
            }}>Jumlah hari</label>
            <input id="ct-hjumlah" type="number" step="0.5" value={hJumlah}
              onChange={(e) => setHJumlah(e.target.value)}
              placeholder="mis. 12, atau -2 untuk koreksi"
              style={{
                width: "100%", padding: "8px 10px", borderRadius: 6, fontSize: 13,
                border: `1px solid ${C.border}`, background: "var(--surface)", color: C.text,
              }} />
            <p style={{ fontSize: 11, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>
              Boleh <strong>negatif</strong> untuk mengoreksi jatah yang terlanjur
              berlebih — koreksi dicatat sebagai baris tersendiri, bukan dengan
              mengubah baris lama.
            </p>
          </div>

          <div>
            <label htmlFor="ct-halasan" style={{
              fontSize: 11, fontWeight: 700, color: C.muted, display: "block",
              marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em",
            }}>Alasan <span style={{ color: "var(--danger)" }}>· wajib</span></label>
            <input id="ct-halasan" value={hAlasan} onChange={(e) => setHAlasan(e.target.value)}
              placeholder="mis. Jatah tahunan 2026 (UU 13/2003 Ps. 79)"
              style={{
                width: "100%", padding: "8px 10px", borderRadius: 6, fontSize: 13,
                border: `1px solid ${C.border}`, background: "var(--surface)", color: C.text,
              }} />
            <p style={{ fontSize: 11, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>
              Angka jatah tanpa keterangan tak bisa dipertanggungjawabkan saat
              dipertanyakan.
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
