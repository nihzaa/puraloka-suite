"use client";

/**
 * AUDIT MUTU — pemeriksaan berkala penerapan SISTEM mutu.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA HALAMAN, BUKAN TAB
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `ARAH-VISUAL-2026.md` §6a: *tab = sudut pandang berbeda atas data yang
 * sama; halaman = entitas berbeda*.
 *
 * Audit adalah entitas tersendiri dengan siklus hidupnya: dijadwalkan,
 * dijalankan, diselesaikan, dan laporannya dirujuk auditor eksternal
 * bertahun kemudian. Ia bukan sudut pandang lain atas NCR — meski temuan
 * major-nya melahirkan NCR.
 *
 * ── Yang dijawab halaman ini
 *
 * "Apakah sistem mutunya benar-benar dijalankan — dan kalau tidak, apa yang
 *  sedang dikerjakan tentang itu?"
 *
 * Bedanya dari inspeksi menentukan seluruh isinya: inspeksi memeriksa
 * PEKERJAAN ("beton ini kuat berapa?"), audit memeriksa SISTEM ("ITP
 * benar-benar diikuti?"). Auditor tak mengukur beton.
 *
 * ── Satu aksen (§3d)
 *
 * Yang menonjol HANYA verdict "boleh diselesaikan / masih ada major
 * menggantung". Kartu ringkasan dan tabel temuan tenang. Kalau tiga hal
 * berwarna, tak ada yang menonjol.
 *
 * ── Kenapa major dibedakan setegas ini
 *
 * MAJOR = sistem mutunya gagal di titik itu → wajib melahirkan NCR, dan
 * menghalangi audit diselesaikan. MINOR wajib diperbaiki tapi tak wajib
 * jadi NCR. OBSERVASI adalah catatan.
 *
 * Menyamakannya membuat salah satu dari dua kesalahan: observasi
 * diperlakukan seperti kegagalan (dan orang berhenti mencatat observasi —
 * kehilangan peringatan dini), atau major diperlakukan seperti catatan (dan
 * sistemnya gagal tanpa ada yang bertanggung jawab).
 */

import { useCallback, useEffect, useState } from "react";
import {
  ClipboardList, ShieldAlert, ShieldCheck, Eye, TriangleAlert, Link2, ClipboardCheck,
} from "lucide-react";
import { api } from "@/lib/api";
import { useData } from "@/lib/data-cache";
import { C } from "@/lib/warna-ui";
import { Kosong } from "@/components/ui-dasar";
import { KepalaHalaman, Tabel, type Kolom } from "@/components/dasar";
import { DialogBersama } from "@/components/dialog-bersama";
import { Saklar } from "@/components/saklar";

type Klasifikasi = "major" | "minor" | "observasi";
type StatusAudit = "rencana" | "berjalan" | "selesai" | "dibatalkan";

interface Temuan {
  id: string;
  urutan: number;
  kode: string | null;
  uraian: string;
  klausul: string;
  bukti: string | null;
  klasifikasi: Klasifikasi;
  ncr_id: string | null;
  ditutup_pada: string | null;
  catatan_penutupan: string | null;
  ncr: { id: string; nomor: string; judul: string; status: string } | null;
}

interface Ringkasan {
  total: number;
  major: number;
  minor: number;
  observasi: number;
  ditutup: number;
  terbuka: number;
  /** Major + minor, TANPA observasi — observasi tak menuntut penutupan. */
  menuntut_tindakan: number;
  tindakan_ditutup: number;
  major_tanpa_ncr: Temuan[];
  major_terbuka: Temuan[];
  boleh_diselesaikan: boolean;
}

interface Penghalang {
  kode: "major-tanpa-ncr" | "tanpa-auditor" | "sudah-selesai" | "dibatalkan";
  pesan: string;
  temuan?: Temuan[];
}

interface AuditMutu {
  id: string;
  nomor: string;
  judul: string;
  status: StatusAudit;
  lingkup: string | null;
  kriteria: string | null;
  tanggal_rencana: string | null;
  tanggal_mulai: string | null;
  tanggal_selesai: string | null;
  teraudit: string | null;
  kesimpulan: string | null;
  pemeriksa: { id: string; name: string } | null;
  rencana: { id: string; nomor: string; judul: string } | null;
}

interface Detail {
  audit: AuditMutu;
  temuan: Temuan[];
  ringkasan: Ringkasan;
  penyelesaian: { boleh: boolean; penghalang: Penghalang[] };
}

interface Proyek { id: string; name: string }
interface Ncr { id: string; nomor: string; judul: string }

/**
 * Arti tiap klasifikasi — ditulis di layar, bukan diasumsikan diketahui.
 *
 * "Major finding" adalah istilah audit yang tak semua orang di proyek pernah
 * dengar, dan sebagian pengguna software ini berliterasi digital rendah.
 * Label tanpa penjelasan hanya berguna bagi yang sudah tahu artinya.
 */
const ARTI: Record<Klasifikasi, {
  label: string; warna: string; bg: string; border: string; arti: string;
}> = {
  major: {
    label: "Major", warna: "var(--danger)", bg: "var(--danger-bg)", border: "var(--danger-border)",
    arti: "Sistem mutunya gagal di titik ini. Wajib melahirkan NCR — dengan penanggung jawab, target selesai, dan verifikasi — dan menghalangi audit diselesaikan sampai itu ada.",
  },
  minor: {
    label: "Minor", warna: "var(--warning-teks)", bg: "var(--warning-bg)", border: "var(--warning-border)",
    arti: "Penyimpangan tunggal yang tak membatalkan sistem. Wajib diperbaiki, tetapi tak wajib jadi NCR.",
  },
  observasi: {
    label: "Observasi", warna: C.mid, bg: "var(--surface-2)", border: C.border,
    arti: "Belum menyimpang, tetapi berpotensi. Catatan untuk diperhatikan, bukan tuntutan perbaikan.",
  },
};

const STATUS: Record<StatusAudit, { label: string; warna: string; bg: string; border: string }> = {
  rencana: { label: "Rencana", warna: C.mid, bg: "var(--surface-2)", border: C.border },
  berjalan: { label: "Berjalan", warna: "var(--warning-teks)", bg: "var(--warning-bg)", border: "var(--warning-border)" },
  selesai: { label: "Selesai", warna: "var(--success)", bg: "var(--success-bg)", border: "var(--success-border)" },
  dibatalkan: { label: "Dibatalkan", warna: C.muted, bg: "var(--surface-2)", border: C.border },
};

const tanggal = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
};

const buatKolom = (onTaut: (t: Temuan) => void): Array<Kolom<Temuan>> => [
  {
    kunci: "temuan", judul: "Temuan & klausul", kepalaBaris: true,
    render: (t) => {
      const a = ARTI[t.klasifikasi];
      // Pita kiri HANYA untuk major yang belum ber-NCR — satu-satunya yang
      // menghalangi. Memberi pita ke semua major membuat yang sudah
      // ditindaklanjuti tampak sama mendesaknya dengan yang belum.
      const menghalangi = t.klasifikasi === "major" && !t.ncr_id;
      return (
        <span style={{
          display: "block", paddingLeft: 9,
          borderLeft: menghalangi ? `3px solid ${a.warna}` : "3px solid transparent",
        }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            {t.kode && (
              <span style={{ fontSize: 11, color: C.muted, fontVariantNumeric: "tabular-nums" }}>{t.kode}</span>
            )}
            <strong style={{ fontSize: 13, color: C.text }}>{t.uraian}</strong>
          </span>
          <span style={{ display: "block", fontSize: 11, color: C.muted, marginTop: 2 }}>
            {t.klausul}
          </span>
          {t.bukti && (
            <span style={{ display: "block", fontSize: 11, color: C.mid, marginTop: 2, maxWidth: "56ch" }}>
              Bukti: {t.bukti}
            </span>
          )}
        </span>
      );
    },
  },
  {
    kunci: "klasifikasi", judul: "Klasifikasi",
    render: (t) => {
      const a = ARTI[t.klasifikasi];
      return (
        <span
          title={a.arti}
          style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700,
            color: a.warna, background: a.bg, border: `1px solid ${a.border}`,
          }}
        >
          {t.klasifikasi === "major" ? <ShieldAlert size={11} aria-hidden="true" />
            : t.klasifikasi === "minor" ? <TriangleAlert size={11} aria-hidden="true" />
            : <Eye size={11} aria-hidden="true" />}
          {a.label}
        </span>
      );
    },
  },
  {
    kunci: "ncr", judul: "Tindak lanjut",
    render: (t) => {
      if (t.ncr) {
        return (
          <span style={{ display: "block" }}>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              fontSize: 12, color: C.text, fontVariantNumeric: "tabular-nums",
            }}>
              <Link2 size={12} aria-hidden="true" /> {t.ncr.nomor}
            </span>
            <span style={{ display: "block", fontSize: 11, color: C.muted, marginTop: 1 }}>
              {t.ncr.status}
            </span>
          </span>
        );
      }
      if (t.klasifikasi === "major") {
        return (
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            fontSize: 11, fontWeight: 700, color: "var(--danger)",
          }}>
            <TriangleAlert size={11} aria-hidden="true" /> belum ada NCR
          </span>
        );
      }
      // Minor & observasi tanpa NCR itu SAH — jangan tampilkan seperti cacat.
      return <span style={{ fontSize: 11, color: C.muted }}>—</span>;
    },
  },
  {
    kunci: "status", judul: "Status",
    render: (t) => (
      t.ditutup_pada
        ? (
          <span style={{ display: "block" }}>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              fontSize: 12, color: "var(--success)",
            }}>
              <ShieldCheck size={13} aria-hidden="true" /> Ditutup
            </span>
            <span style={{ display: "block", fontSize: 11, color: C.muted, marginTop: 1 }}>
              {tanggal(t.ditutup_pada)}
            </span>
          </span>
        )
        : <span style={{ fontSize: 12, color: C.mid }}>Terbuka</span>
    ),
  },
  {
    kunci: "aksi", judul: "",
    render: (t) => (
      <button
        type="button"
        onClick={() => onTaut(t)}
        style={{
          padding: "5px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600,
          border: `1px solid ${t.klasifikasi === "major" && !t.ncr_id ? "var(--danger-border)" : C.border}`,
          background: "var(--surface)", color: C.text, cursor: "pointer", whiteSpace: "nowrap",
        }}
      >
        {t.ncr_id ? "Ubah" : "Tindak lanjuti"}
      </button>
    ),
  },
];

export default function AuditMutuPage() {
  const [projectId, setProjectId] = useState("");
  const [auditId, setAuditId] = useState("");

  const [temuanAktif, setTemuanAktif] = useState<Temuan | null>(null);
  const [fNcr, setFNcr] = useState("");
  const [fTutup, setFTutup] = useState(false);
  const [fCatatan, setFCatatan] = useState("");
  const [menyimpan, setMenyimpan] = useState(false);
  const [galatModal, setGalatModal] = useState<string | null>(null);
  const [menyelesaikan, setMenyelesaikan] = useState(false);

  /*
    ── PINDAH KE LAPIS CACHE BERSAMA (F4-2), 2026-08-16

    Empat `useData`: proyek (prasyarat), daftar audit per proyek, daftar NCR
    per proyek (untuk menautkan temuan), dan detail audit terpilih. URL kedua
    hingga keempat DINAMIS mengikuti `projectId`/`auditId` — `null` sampai
    prasyaratnya terpilih.
  */
  const { data: dataProyek, galat: galatProyek } =
    useData<{ projects: Proyek[] }>("/api/v1/projects");
  const proyek = dataProyek?.projects ?? [];

  const jalurDaftar = projectId ? `/api/v1/projects/${projectId}/audit-mutu` : null;
  const { data: dataDaftar, memuat: memuatDaftar, galat: galatDaftar } =
    useData<{ audit: AuditMutu[] }>(jalurDaftar);
  const daftar = dataDaftar?.audit ?? [];

  // Audit pertama dipilih otomatis begitu daftar proyek berganti — efek
  // tersendiri, bergantung `dataDaftar` saja, bukan state pilihan pengguna.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAuditId(dataDaftar?.audit?.[0]?.id ?? "");
  }, [dataDaftar]);

  const jalurNcr = projectId ? `/api/v1/projects/${projectId}/ncr` : null;
  const { data: dataNcr, galat: galatNcr } = useData<{ data: Ncr[] }>(jalurNcr);
  const ncrList = dataNcr?.data ?? [];

  const jalurDetail = auditId ? `/api/v1/audit-mutu/${auditId}` : null;
  const { data: detail, memuat: memuatDetail, galat: galatDetail, muatUlang: muatUlangDetail } =
    useData<Detail>(jalurDetail);
  // Daftar audit dan detail dimuat berurutan (daftar → pilih auditId →
  // detail) — gabungkan status muatnya supaya keadaan "memuat daftar, detail
  // belum diminta" tak terbaca sebagai "sudah selesai memuat".
  const memuat = memuatDaftar || memuatDetail;

  // Galat MUAT vs galat AKSI (menyelesaikan audit) dipisah — satu state
  // untuk keduanya membuat gagal menyelesaikan menghapus pesan gagal memuat.
  const [galatAksi, setGalatAksi] = useState<string | null>(null);
  const galat = galatAksi ?? (
    galatProyek
      ? "Gagal memuat daftar proyek"
      : galatDaftar
        ? "Gagal memuat daftar audit"
        // Tak menghalangi pencatatan, tapi tak boleh ditelan diam-diam:
        // daftar kosong karena galat akan terbaca "belum ada NCR".
        : galatNcr
          ? "Daftar NCR gagal dimuat — penautan temuan tak tersedia"
          : galatDetail
            ? "Gagal memuat audit"
            : null
  );

  const muat = useCallback(async () => { await muatUlangDetail(); }, [muatUlangDetail]);

  const bukaTaut = useCallback((t: Temuan) => {
    setTemuanAktif(t);
    setFNcr(t.ncr_id ?? "");
    setFTutup(t.ditutup_pada !== null);
    setFCatatan(t.catatan_penutupan ?? "");
    setGalatModal(null);
  }, []);

  const simpanTemuan = useCallback(async () => {
    if (!temuanAktif) return;
    setMenyimpan(true); setGalatModal(null);
    try {
      await api.patch(`/api/v1/temuan-audit/${temuanAktif.id}`, {
        ncr_id: fNcr || null,
        tutup: fTutup,
        catatan_penutupan: fCatatan.trim() || null,
      });
      setTemuanAktif(null);
      await muat();
    } catch (e) {
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalatModal(m ?? "Gagal menyimpan tindak lanjut");
    } finally { setMenyimpan(false); }
  }, [temuanAktif, fNcr, fTutup, fCatatan, muat]);

  const selesaikan = useCallback(async () => {
    if (!auditId) return;
    setMenyelesaikan(true); setGalatAksi(null);
    try {
      await api.post(`/api/v1/audit-mutu/${auditId}/selesaikan`, {});
      await muat();
    } catch (e) {
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalatAksi(m ?? "Gagal menyelesaikan audit");
    } finally { setMenyelesaikan(false); }
  }, [auditId, muat]);

  const kartu: React.CSSProperties = {
    background: "var(--surface)", border: `1px solid ${C.border}`,
    borderRadius: 10, boxShadow: "var(--naik-1)",
  };

  const r = detail?.ringkasan;

  return (
    // `--w-luas`: tabel temuan padat kolom (uraian, klausul, klasifikasi,
    // tindak lanjut, status), dan klausul kehilangan arti begitu membungkus.
    <div style={{
      padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)",
      width: "100%", maxWidth: "var(--w-luas)", margin: "0 auto",
    }}>
      <div className="rise" style={{ marginBottom: "var(--gap-bagian)" }}>
        <KepalaHalaman
          judul="Audit Mutu"
          ikon={<ClipboardCheck size={20} aria-hidden="true" />}
          keterangan={
            <>
              Pemeriksaan berkala apakah sistem mutu benar-benar dijalankan — bukan
              apakah pekerjaannya kuat. <strong>Temuan <em>major</em> wajib melahirkan
              NCR</strong>, karena audit yang menghasilkan dokumen tanpa akibat tak
              mengubah apa pun di lapangan.
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
        <div className="rise" style={{ ...kartu, padding: "12px 16px", minWidth: 280, flex: "1 1 280px", maxWidth: 420 }}>
          <label htmlFor="am-proyek" style={{
            fontSize: 11, fontWeight: 700, color: C.muted, display: "block",
            marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em",
          }}>Proyek</label>
          <select
            id="am-proyek" value={projectId} onChange={(e) => setProjectId(e.target.value)}
            style={{
              padding: "8px 10px", borderRadius: 6, border: `1px solid ${C.border}`,
              background: "var(--surface)", color: C.text, fontSize: 13, width: "100%",
            }}
          >
            <option value="">— pilih proyek —</option>
            {proyek.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        {daftar.length > 0 && (
          <div className="rise" style={{ ...kartu, padding: "12px 16px", minWidth: 280, flex: "1 1 280px", maxWidth: 460 }}>
            <label htmlFor="am-audit" style={{
              fontSize: 11, fontWeight: 700, color: C.muted, display: "block",
              marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em",
            }}>Audit</label>
            <select
              id="am-audit" value={auditId} onChange={(e) => setAuditId(e.target.value)}
              style={{
                padding: "8px 10px", borderRadius: 6, border: `1px solid ${C.border}`,
                background: "var(--surface)", color: C.text, fontSize: 13, width: "100%",
              }}
            >
              {daftar.map((d) => (
                <option key={d.id} value={d.id}>{d.nomor} — {d.judul}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {!projectId ? (
        <Kosong
          ikon={<ClipboardList size={28} />}
          judul="Pilih proyek dulu"
          sebab="Audit mutu dijalankan per proyek — lingkup, kriteria, dan temuannya berbeda tiap kontrak."
        />
      ) : memuat ? (
        <div style={{ ...kartu, padding: 40, textAlign: "center", color: C.mid, fontSize: 13 }}>Memuat…</div>
      ) : daftar.length === 0 ? (
        <Kosong
          ikon={<ClipboardList size={28} />}
          judul="Belum ada audit mutu untuk proyek ini"
          sebab="Tanpa audit berkala, tak ada yang memeriksa apakah rencana mutu benar-benar dijalankan — dokumennya ada, penerapannya tak pernah diuji."
        />
      ) : detail && r ? (
        <>
          {/* ── VERDICT — satu-satunya yang menonjol ────────────────────── */}
          {detail.audit.status === "selesai" ? (
            <div role="status" className="rise" style={{
              ...kartu, padding: "14px 18px", marginBottom: 14,
              borderColor: "var(--success-border)", background: "var(--success-bg)",
              borderLeftWidth: 4, borderLeftStyle: "solid", borderLeftColor: "var(--success)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <ShieldCheck size={18} aria-hidden="true" style={{ color: "var(--success)" }} />
                <strong style={{ fontSize: 15, color: "var(--success)" }}>
                  Audit selesai — {tanggal(detail.audit.tanggal_selesai)}
                </strong>
              </div>
              {detail.audit.kesimpulan && (
                <p style={{ fontSize: 13, color: C.text, margin: "6px 0 0 26px", lineHeight: 1.55 }}>
                  {detail.audit.kesimpulan}
                </p>
              )}
            </div>
          ) : r.major_tanpa_ncr.length > 0 ? (
            <div role="status" className="rise" style={{
              ...kartu, padding: "16px 18px", marginBottom: 14,
              borderColor: "var(--danger-border)", background: "var(--danger-bg)",
              borderLeftWidth: 4, borderLeftStyle: "solid", borderLeftColor: "var(--danger)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <ShieldAlert size={18} aria-hidden="true" style={{ color: "var(--danger)" }} />
                <strong style={{ fontSize: 15, color: "var(--danger)" }}>
                  Audit belum bisa diselesaikan — {r.major_tanpa_ncr.length} temuan major belum punya NCR
                </strong>
              </div>
              <ul style={{ margin: "0 0 0 26px", padding: 0, fontSize: 13, color: C.text, lineHeight: 1.7 }}>
                {r.major_tanpa_ncr.map((t) => (
                  <li key={t.id}>{t.uraian} <span style={{ color: C.muted }}>· {t.klausul}</span></li>
                ))}
              </ul>
              <p style={{ fontSize: 12, color: C.mid, margin: "8px 0 0 26px", maxWidth: "68ch", lineHeight: 1.5 }}>
                Tanpa NCR, temuan major tak punya penanggung jawab, target selesai,
                maupun verifikasi — jadi tak ada yang berubah di lapangan.
              </p>
            </div>
          ) : (
            <div role="status" className="rise" style={{
              ...kartu, padding: "14px 18px", marginBottom: 14,
              borderColor: "var(--success-border)", background: "var(--success-bg)",
              borderLeftWidth: 4, borderLeftStyle: "solid", borderLeftColor: "var(--success)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <ShieldCheck size={18} aria-hidden="true" style={{ color: "var(--success)" }} />
                <strong style={{ fontSize: 15, color: "var(--success)" }}>
                  Semua temuan major sudah ditindaklanjuti
                </strong>
                <button
                  type="button"
                  onClick={() => void selesaikan()}
                  disabled={menyelesaikan}
                  style={{
                    marginLeft: "auto",
                    padding: "7px 14px", borderRadius: 6, fontSize: 13, fontWeight: 700,
                    border: "1px solid var(--navy)", background: "var(--navy)",
                    color: "var(--on-navy)", cursor: menyelesaikan ? "not-allowed" : "pointer",
                    opacity: menyelesaikan ? 0.7 : 1,
                  }}
                >
                  {menyelesaikan ? "Menyelesaikan…" : "Selesaikan audit"}
                </button>
              </div>
              {detail.penyelesaian.penghalang.length > 0 && (
                <p style={{ fontSize: 12, color: "var(--warning-teks)", margin: "8px 0 0 26px", lineHeight: 1.5 }}>
                  {detail.penyelesaian.penghalang.map((p) => p.pesan).join(" ")}
                </p>
              )}
            </div>
          )}

          {/* Identitas audit — konteks, bukan berita. */}
          <div className="rise" style={{ ...kartu, padding: "14px 18px", marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
              <strong style={{ fontSize: 14, color: C.text }}>{detail.audit.nomor}</strong>
              <span style={{
                padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700,
                color: STATUS[detail.audit.status].warna,
                background: STATUS[detail.audit.status].bg,
                border: `1px solid ${STATUS[detail.audit.status].border}`,
              }}>{STATUS[detail.audit.status].label}</span>
              {detail.audit.pemeriksa && (
                <span style={{ fontSize: 11, color: C.muted }}>
                  auditor: {detail.audit.pemeriksa.name}
                </span>
              )}
              {detail.audit.teraudit && (
                <span style={{ fontSize: 11, color: C.muted }}>
                  diaudit: {detail.audit.teraudit}
                </span>
              )}
            </div>
            <div style={{ fontSize: 13, color: C.mid, marginTop: 4 }}>{detail.audit.judul}</div>
            {detail.audit.lingkup && (
              <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
                Lingkup: {detail.audit.lingkup}
              </div>
            )}
            {detail.audit.kriteria && (
              <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                Kriteria: {detail.audit.kriteria}
              </div>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            gap: 8, marginBottom: 14 }}>
            {[
              { l: "Major", v: r.major, sub: r.major_tanpa_ncr.length > 0 ? `${r.major_tanpa_ncr.length} belum ber-NCR` : "semua ber-NCR" },
              { l: "Minor", v: r.minor, sub: "wajib diperbaiki" },
              { l: "Observasi", v: r.observasi, sub: "catatan, bukan tuntutan" },
              // Penyebutnya yang MENUNTUT TINDAKAN, bukan seluruh temuan.
              //
              // Versi pertama menampilkan "0/4" — menghitung observasi, yang
              // tak menuntut penutupan sama sekali. Terbaca seperti nol dari
              // empat pekerjaan selesai, dan menciptakan hutang yang tak ada.
              // Ketahuan dari layar, bukan dari test.
              {
                l: "Ditutup",
                v: `${r.tindakan_ditutup}/${r.menuntut_tindakan}`,
                sub: r.observasi > 0
                  ? `major & minor · ${r.observasi} observasi tak dihitung`
                  : "major & minor terverifikasi",
              },
            ].map((k) => (
              <div key={k.l} style={{ ...kartu, padding: "12px 14px" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.muted,
                  textTransform: "uppercase", letterSpacing: "0.05em" }}>{k.l}</div>
                {/* Angka tenang — penekanan sudah dipakai verdict (§3d). */}
                <div style={{ fontSize: "var(--teks-kpi)", fontWeight: 700, marginTop: 4, lineHeight: 1.1, color: C.text,
                  fontVariantNumeric: "tabular-nums" }}>{k.v}</div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{k.sub}</div>
              </div>
            ))}
          </div>

          {detail.temuan.length === 0 ? (
            <Kosong
              ikon={<ShieldCheck size={28} />}
              judul="Tak ada temuan"
              sebab="Audit yang tak menemukan apa pun adalah hasil yang sah — dan auditnya sendiri yang menjadi bukti pemeriksaan dilakukan."
            />
          ) : (
            <Tabel
              berpermukaan
              kolom={buatKolom(bukaTaut)}
              data={detail.temuan}
              kunciBaris={(t) => t.id}
              caption="Temuan audit beserta klausul, klasifikasi, dan tindak lanjutnya"
            />
          )}
        </>
      ) : null}

      <DialogBersama
        terbuka={temuanAktif !== null}
        onTutup={() => setTemuanAktif(null)}
        judul="Tindak lanjut temuan"
        keterangan={temuanAktif ? temuanAktif.uraian : undefined}
        kaki={
          <>
            <button
              type="button" onClick={() => setTemuanAktif(null)} disabled={menyimpan}
              style={{
                padding: "8px 14px", borderRadius: 6, fontSize: 13, fontWeight: 600,
                border: `1px solid ${C.border}`, background: "var(--surface)",
                color: C.text, cursor: menyimpan ? "not-allowed" : "pointer",
              }}
            >Batal</button>
            <button
              type="button" onClick={() => void simpanTemuan()} disabled={menyimpan}
              style={{
                padding: "8px 14px", borderRadius: 6, fontSize: 13, fontWeight: 700,
                border: "1px solid var(--navy)", background: "var(--navy)",
                color: "var(--on-navy)", cursor: menyimpan ? "not-allowed" : "pointer",
                opacity: menyimpan ? 0.7 : 1,
              }}
            >{menyimpan ? "Menyimpan…" : "Simpan"}</button>
          </>
        }
      >
        {temuanAktif && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{
              padding: "10px 12px", borderRadius: 8, fontSize: 12,
              background: "var(--surface-2)", border: `1px solid ${C.border}`, color: C.mid,
            }}>
              <strong style={{ color: C.text }}>Klausul:</strong> {temuanAktif.klausul}
            </div>

            {temuanAktif.klasifikasi === "major" && (
              <div style={{
                padding: "10px 12px", borderRadius: 8, fontSize: 12,
                background: "var(--danger-bg)", border: "1px solid var(--danger-border)",
                color: "var(--danger)",
              }}>
                Temuan <strong>major</strong> — wajib ditautkan ke NCR sebelum audit
                bisa diselesaikan.
              </div>
            )}

            <div>
              <label htmlFor="am-ncr" style={{
                fontSize: 11, fontWeight: 700, color: C.muted, display: "block",
                marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em",
              }}>Tautkan ke NCR</label>
              <select
                id="am-ncr" value={fNcr} onChange={(e) => setFNcr(e.target.value)}
                style={{
                  width: "100%", padding: "8px 10px", borderRadius: 6, fontSize: 13,
                  border: `1px solid ${C.border}`, background: "var(--surface)", color: C.text,
                }}
              >
                <option value="">— belum ditautkan —</option>
                {ncrList.map((n) => (
                  <option key={n.id} value={n.id}>{n.nomor} — {n.judul}</option>
                ))}
              </select>
              <p style={{ fontSize: 11, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>
                NCR memberi temuan ini penanggung jawab, target selesai, dan
                verifikasi penutupan — tiga hal yang tak dimiliki catatan audit
                sendirian.
              </p>
            </div>

            <Saklar
              nyala={fTutup}
              onUbah={setFTutup}
              label="Tutup temuan ini (perbaikannya sudah diverifikasi)"
            />

            <div>
              <label htmlFor="am-catatan" style={{
                fontSize: 11, fontWeight: 700, color: C.muted, display: "block",
                marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em",
              }}>Catatan penutupan</label>
              <textarea
                id="am-catatan" rows={3} value={fCatatan}
                onChange={(e) => setFCatatan(e.target.value)}
                placeholder="Apa yang diperbaiki, dan bagaimana diverifikasi"
                style={{
                  width: "100%", padding: "8px 10px", borderRadius: 6, fontSize: 13,
                  border: `1px solid ${C.border}`, background: "var(--surface)",
                  color: C.text, resize: "vertical", fontFamily: "inherit",
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
        )}
      </DialogBersama>
    </div>
  );
}
