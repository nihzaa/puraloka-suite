"use client";

/**
 * RENCANA MUTU PROYEK + INSPECTION & TEST PLAN.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA HALAMAN, BUKAN TAB
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `ARAH-VISUAL-2026.md` §6a: *tab = sudut pandang berbeda atas data yang
 * sama; halaman = entitas berbeda*.
 *
 * Rencana mutu adalah entitas yang berbeda dari hasil inspeksi: ia berumur
 * sepanjang proyek, punya revisi dan persetujuan sendiri, dan yang dikirim ke
 * konsultan adalah dokumennya — bukan cuplikan hasil.
 *
 * ── Yang dijawab halaman ini, dan kenapa ia satu kalimat
 *
 * "Boleh lanjut, atau ada yang menahan?"
 *
 * Sebelum modul ini, 24 inspeksi tercatat tanpa satu pun pernyataan berapa
 * yang SEHARUSNYA ada. Pertanyaan itu hanya bisa dijawab dengan mengingat.
 *
 * Karena itu halaman ini dibuka dengan VERDICT, bukan dengan tabel. Daftar
 * titik ada di bawahnya sebagai rincian — tetapi orang yang membuka halaman
 * ini di lokasi, di ponsel, sambil menunggu truk mixer, hanya butuh satu
 * kalimat.
 *
 * ── Satu aksen (§3d)
 *
 * Yang menonjol HANYA verdict. Kartu ringkasan, tabel, dan daftar cacat
 * semuanya tenang. Kalau tiga hal berwarna, tak ada yang menonjol.
 *
 * ── Kenapa HOLD dan WITNESS ditampilkan berbeda
 *
 * HOLD menahan pekerjaan; WITNESS tidak. Menyamakannya membuat salah satu
 * dari dua kesalahan: pekerjaan berhenti tanpa perlu (dan orang berhenti
 * mempercayai peringatannya), atau pekerjaan lanjut melewati titik yang
 * seharusnya menahannya. Alasan lengkapnya di `lib/rencana-mutu.ts`.
 */

import { useCallback, useEffect, useState } from "react";
import { ClipboardCheck, ShieldAlert, ShieldCheck, Eye, FileText, TriangleAlert , ListChecks } from "lucide-react";
import { api, makeAbortController } from "@/lib/api";
import { C } from "@/lib/warna-ui";
import { Kosong } from "@/components/ui-dasar";
import { KepalaHalaman, Tabel, type Kolom } from "@/components/dasar";
import { DialogBersama } from "@/components/dialog-bersama";

type JenisTitik = "hold" | "witness" | "review";
type StatusRmp = "draf" | "diajukan" | "disetujui" | "kedaluwarsa";

interface TitikItp {
  id: string;
  urutan: number;
  kode: string | null;
  tahap_pekerjaan: string;
  uraian: string;
  jenis_titik: JenisTitik;
  kriteria: string | null;
  acuan: string | null;
  metode_verifikasi: string | null;
  pihak_verifikasi: string | null;
  /** `null` = belum diperiksa — DIBEDAKAN dari `false` (ditolak). */
  lolos: boolean | null;
  catatan_hasil: string | null;
  diperiksa_pada: string | null;
  pemeriksa: { id: string; name: string } | null;
}

interface Ringkasan {
  total: number;
  lolos: number;
  gagal: number;
  belum: number;
  menahan: TitikItp[];
  menunggu_saksi: TitikItp[];
  pct_lolos: number | null;
  pct_selesai: number;
  /** `null` = ITP kosong. BUKAN "boleh lanjut". */
  boleh_lanjut: boolean | null;
}

interface Cacat {
  kode: "tanpa-acuan" | "tanpa-sasaran" | "tanpa-titik" | "tanpa-hold" | "titik-tanpa-kriteria";
  pesan: string;
  titik?: TitikItp[];
}

interface Rencana {
  id: string;
  nomor: string;
  judul: string;
  revisi: number;
  status: StatusRmp;
  standar_acuan: string | null;
  sasaran_mutu: string | null;
  disetujui_pada: string | null;
  pj: { id: string; name: string } | null;
  penyetuju: { id: string; name: string } | null;
}

interface Detail {
  rencana: Rencana;
  titik: TitikItp[];
  ringkasan: Ringkasan;
  cacat: Cacat[];
  persetujuan: { boleh: boolean; penghalang: Cacat[] };
}

interface Proyek { id: string; name: string }

interface Inspeksi {
  id: string;
  nomor: string;
  judul: string;
  status: string;
  diminta_untuk: string | null;
}

/**
 * Arti tiap jenis titik — ditulis di layar, bukan diasumsikan diketahui.
 *
 * "Hold point" adalah istilah kontrak yang tak semua orang di lokasi pernah
 * dengar, dan pengguna software ini sebagian berliterasi digital rendah.
 * Singkatan tanpa penjelasan hanya berguna bagi yang sudah tahu.
 */
const JENIS: Record<JenisTitik, { label: string; arti: string; warna: string; bg: string; border: string }> = {
  hold: {
    label: "Hold",
    arti: "Pekerjaan BERHENTI sampai titik ini lolos. Melewatinya menutup pekerjaan yang belum boleh ditutup.",
    warna: "var(--danger)", bg: "var(--danger-bg)", border: "var(--danger-border)",
  },
  witness: {
    label: "Witness",
    arti: "Pemilik/konsultan berhak hadir dan wajib diberi tahu — tetapi ketidakhadirannya tidak menahan pekerjaan.",
    warna: "var(--warning-teks)", bg: "var(--warning-bg)", border: "var(--warning-border)",
  },
  review: {
    label: "Review",
    arti: "Cukup dokumen (sertifikat, hasil lab). Tak ada yang perlu datang ke lokasi.",
    warna: C.mid, bg: "var(--surface-2)", border: C.border,
  },
};

const STATUS: Record<StatusRmp, { label: string; warna: string; bg: string; border: string }> = {
  draf: { label: "Draf", warna: C.mid, bg: "var(--surface-2)", border: C.border },
  diajukan: { label: "Diajukan", warna: "var(--warning-teks)", bg: "var(--warning-bg)", border: "var(--warning-border)" },
  disetujui: { label: "Disetujui", warna: "var(--success)", bg: "var(--success-bg)", border: "var(--success-border)" },
  kedaluwarsa: { label: "Kedaluwarsa", warna: C.muted, bg: "var(--surface-2)", border: C.border },
};

const tanggal = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
};

/** Tiga keadaan hasil — `null` bukan `false`. */
function HasilTitik({ t }: { t: TitikItp }) {
  if (t.lolos === true) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--success)" }}>
        <ShieldCheck size={13} aria-hidden="true" /> Lolos
      </span>
    );
  }
  if (t.lolos === false) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--danger)" }}>
        <ShieldAlert size={13} aria-hidden="true" /> Tidak lolos
      </span>
    );
  }
  // Belum diperiksa. Sengaja TIDAK memakai warna bahaya: "menunggu inspektur"
  // dan "ditolak inspektur" menuntut tindakan yang berbeda.
  return <span style={{ fontSize: 12, color: C.muted, fontStyle: "italic" }}>belum diperiksa</span>;
}

/**
 * Kolom dibuat lewat fungsi, bukan konstanta modul: kolom terakhir memuat
 * tombol yang harus memanggil kembali ke halaman. Konstanta modul tak punya
 * akses ke sana tanpa variabel global.
 */
const buatKolom = (onPeriksa: (t: TitikItp) => void): Array<Kolom<TitikItp>> => [
  {
    kunci: "tahap", judul: "Tahap & titik periksa", kepalaBaris: true,
    render: (t) => {
      const j = JENIS[t.jenis_titik];
      // Pita kiri hanya untuk HOLD yang belum lolos — satu-satunya yang
      // menahan. Memberi pita ke semuanya membuat tak ada yang menonjol.
      const menahan = t.jenis_titik === "hold" && t.lolos !== true;
      return (
        <span style={{
          display: "block", paddingLeft: 9,
          borderLeft: menahan ? `3px solid ${j.warna}` : "3px solid transparent",
        }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            {t.kode && (
              <span style={{ fontSize: 11, color: C.muted, fontVariantNumeric: "tabular-nums" }}>{t.kode}</span>
            )}
            <strong style={{ fontSize: 13, color: C.text }}>{t.tahap_pekerjaan}</strong>
          </span>
          <span style={{ display: "block", fontSize: 12, color: C.mid, marginTop: 1 }}>{t.uraian}</span>
          {t.acuan && (
            <span style={{ display: "block", fontSize: 11, color: C.muted, marginTop: 1 }}>{t.acuan}</span>
          )}
        </span>
      );
    },
  },
  {
    kunci: "jenis", judul: "Jenis",
    render: (t) => {
      const j = JENIS[t.jenis_titik];
      return (
        <span
          title={j.arti}
          style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700,
            color: j.warna, background: j.bg, border: `1px solid ${j.border}`,
          }}
        >
          {t.jenis_titik === "hold" ? <ShieldAlert size={11} aria-hidden="true" />
            : t.jenis_titik === "witness" ? <Eye size={11} aria-hidden="true" />
            : <FileText size={11} aria-hidden="true" />}
          {j.label}
        </span>
      );
    },
  },
  {
    kunci: "kriteria", judul: "Kriteria penerimaan",
    render: (t) => (
      t.kriteria
        ? <span style={{ fontSize: 12, color: C.mid }}>{t.kriteria}</span>
        // Titik tanpa kriteria menyerahkan lolos/tidaknya ke pendapat siapa
        // pun yang kebetulan hadir — dinyatakan, bukan dibiarkan kosong.
        : (
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            fontSize: 11, color: "var(--warning-teks)",
          }}>
            <TriangleAlert size={11} aria-hidden="true" /> belum ada kriteria
          </span>
        )
    ),
  },
  {
    kunci: "hasil", judul: "Hasil",
    render: (t) => (
      <span style={{ display: "block" }}>
        <HasilTitik t={t} />
        {t.diperiksa_pada && (
          <span style={{ display: "block", fontSize: 11, color: C.muted, marginTop: 1 }}>
            {tanggal(t.diperiksa_pada)}{t.pemeriksa ? ` · ${t.pemeriksa.name}` : ""}
          </span>
        )}
        {t.lolos === false && t.catatan_hasil && (
          <span style={{ display: "block", fontSize: 11, color: C.mid, marginTop: 2, maxWidth: "34ch" }}>
            {t.catatan_hasil}
          </span>
        )}
      </span>
    ),
  },
  {
    // Mencatat hasil tetap boleh pada dokumen yang SUDAH disetujui — yang
    // dikunci persetujuan adalah ISI rencananya (titik apa saja, mana yang
    // hold), bukan pelaksanaannya. Justru sesudah disetujuilah pemeriksaan
    // dilakukan.
    kunci: "aksi", judul: "",
    render: (t) => (
      <button
        type="button"
        onClick={() => onPeriksa(t)}
        style={{
          padding: "5px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600,
          border: `1px solid ${C.border}`, background: "var(--surface)",
          color: C.text, cursor: "pointer", whiteSpace: "nowrap",
        }}
      >
        {t.lolos === null ? "Catat hasil" : "Ubah"}
      </button>
    ),
  },
];

export default function RencanaMutuPage() {
  const [proyek, setProyek] = useState<Proyek[]>([]);
  const [projectId, setProjectId] = useState("");
  const [daftar, setDaftar] = useState<Rencana[]>([]);
  const [rmpId, setRmpId] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [memuat, setMemuat] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  // ── Modal pemeriksaan titik ──────────────────────────────────────────────
  const [titikDiperiksa, setTitikDiperiksa] = useState<TitikItp | null>(null);
  const [inspeksi, setInspeksi] = useState<Inspeksi[]>([]);
  const [fLolos, setFLolos] = useState<"lolos" | "tidak" | "">("");
  const [fCatatan, setFCatatan] = useState("");
  const [fInspeksi, setFInspeksi] = useState("");
  const [menyimpan, setMenyimpan] = useState(false);
  const [galatModal, setGalatModal] = useState<string | null>(null);

  useEffect(() => {
    const ac = makeAbortController();
    api.get<{ projects: Proyek[] }>("/api/v1/projects", { signal: ac.signal })
      .then((r) => setProyek(r.data.projects ?? []))
      .catch((e) => { if (e?.name !== "CanceledError") setGalat("Gagal memuat daftar proyek"); });
    return () => ac.abort();
  }, []);

  // Daftar RMP proyek terpilih.
  useEffect(() => {
    if (!projectId) { setDaftar([]); setRmpId(""); setDetail(null); return; }
    let batal = false;
    setGalat(null);
    api.get<{ rencana: Rencana[] }>(`/api/v1/projects/${projectId}/rencana-mutu`)
      .then((r) => {
        if (batal) return;
        const d = r.data.rencana ?? [];
        setDaftar(d);
        // Revisi terbaru dipilih otomatis — itu yang berlaku hari ini, dan
        // memaksa satu klik lagi untuk hal yang selalu sama adalah gesekan
        // tanpa guna.
        setRmpId(d[0]?.id ?? "");
      })
      .catch(() => { if (!batal) setGalat("Gagal memuat daftar rencana mutu"); });
    return () => { batal = true; };
  }, [projectId]);

  const muat = useCallback(async (id: string) => {
    if (!id) { setDetail(null); return; }
    setMemuat(true); setGalat(null);
    try {
      const r = await api.get<Detail>(`/api/v1/rencana-mutu/${id}`);
      setDetail(r.data);
    } catch (e) {
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalat(m ?? "Gagal memuat rencana mutu");
      setDetail(null);
    } finally { setMemuat(false); }
  }, []);

  useEffect(() => { void muat(rmpId); }, [rmpId, muat]);

  // Daftar inspeksi proyek — dipakai menautkan titik ITP ke inspeksi yang
  // menjawabnya. Tanpa jalan ini, `itp_titik_id` selamanya NULL dan rencana
  // tak pernah bertemu pelaksanaan (`audit-kolom-tak-tersambung`).
  useEffect(() => {
    if (!projectId) { setInspeksi([]); return; }
    let batal = false;
    // Kuncinya `data`, BUKAN `inspections`. Tebakan pertama saya salah, dan
    // akibatnya dropdown kosong tanpa satu pun galat — 24 inspeksi ada di
    // basis, endpoint mengembalikannya, dan layar menampilkan "tidak
    // ditautkan" saja. Ketahuan dari LAYAR, bukan dari tsc (keduanya
    // bertipe objek) maupun dari test.
    api.get<{ data: Inspeksi[] }>(`/api/v1/projects/${projectId}/inspections`)
      .then((r) => { if (!batal) setInspeksi(r.data.data ?? []); })
      // Gagal memuat daftar inspeksi TIDAK menghalangi pencatatan hasil —
      // penautan bersifat tambahan. Tapi ia tak boleh ditelan diam-diam:
      // kalau daftarnya kosong karena galat, pengguna akan mengira memang
      // belum ada inspeksi.
      .catch(() => { if (!batal) setGalat("Daftar inspeksi gagal dimuat — hasil tetap bisa dicatat, tapi penautan inspeksi tak tersedia"); });
    return () => { batal = true; };
  }, [projectId]);

  const bukaPeriksa = useCallback((t: TitikItp) => {
    setTitikDiperiksa(t);
    setFLolos(t.lolos === true ? "lolos" : t.lolos === false ? "tidak" : "");
    setFCatatan(t.catatan_hasil ?? "");
    setFInspeksi("");
    setGalatModal(null);
  }, []);

  const simpanHasil = useCallback(async () => {
    if (!titikDiperiksa) return;
    if (!fLolos) { setGalatModal("Pilih hasil pemeriksaan dulu"); return; }
    // Titik gagal WAJIB beralasan — dinyatakan di sini supaya pengguna tahu
    // sebelum mengirim, bukan sesudah ditolak server. Server dan constraint
    // DB tetap menegakkannya; ini bukan penggantinya.
    if (fLolos === "tidak" && !fCatatan.trim()) {
      setGalatModal("Titik yang tidak lolos wajib punya catatan — yang menerima tugas perbaikan harus tahu APA yang salah");
      return;
    }
    setMenyimpan(true); setGalatModal(null);
    try {
      await api.patch(`/api/v1/itp-titik/${titikDiperiksa.id}`, {
        lolos: fLolos === "lolos",
        catatan_hasil: fCatatan.trim() || null,
        ...(fInspeksi ? { inspection_id: fInspeksi } : {}),
      });
      setTitikDiperiksa(null);
      await muat(rmpId);
    } catch (e) {
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalatModal(m ?? "Gagal menyimpan hasil pemeriksaan");
    } finally { setMenyimpan(false); }
  }, [titikDiperiksa, fLolos, fCatatan, fInspeksi, muat, rmpId]);

  const [mengajukan, setMengajukan] = useState(false);

  const ajukan = useCallback(async () => {
    if (!rmpId) return;
    setMengajukan(true); setGalat(null);
    try {
      await api.post(`/api/v1/rencana-mutu/${rmpId}/ajukan`);
      await muat(rmpId);
    } catch (e) {
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalat(m ?? "Gagal mengajukan rencana mutu");
    } finally { setMengajukan(false); }
  }, [rmpId, muat]);

  const kartu: React.CSSProperties = {
    background: "var(--surface)", border: `1px solid ${C.border}`,
    borderRadius: 10, boxShadow: "var(--naik-1)",
  };

  const r = detail?.ringkasan;

  return (
    // `--w-luas`: tabel titik periksa padat kolom (tahap, jenis, kriteria,
    // hasil), dan kriteria penerimaan kehilangan arti begitu membungkus.
    <div style={{
      padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)",
      width: "100%", maxWidth: "var(--w-luas)", margin: "0 auto",
    }}>
      <div className="rise" style={{ marginBottom: "var(--gap-bagian)" }}>
        <KepalaHalaman
          judul="Rencana Mutu Proyek"
          ikon={<ListChecks size={20} aria-hidden="true" />}
          keterangan={
            <>
              Titik-titik pemeriksaan yang disepakati di awal proyek, beserta kriteria
              penerimaannya. <strong>Titik <em>hold</em> menahan pekerjaan</strong> sampai
              ia lolos — melewatinya berarti menutup pekerjaan yang belum boleh ditutup.
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
          <label htmlFor="rmp-proyek" style={{
            fontSize: 11, fontWeight: 700, color: C.muted, display: "block",
            marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em",
          }}>Proyek</label>
          <select
            id="rmp-proyek" value={projectId} onChange={(e) => setProjectId(e.target.value)}
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
          <div className="rise" style={{ ...kartu, padding: "12px 16px", minWidth: 280, flex: "1 1 280px", maxWidth: 420 }}>
            <label htmlFor="rmp-dokumen" style={{
              fontSize: 11, fontWeight: 700, color: C.muted, display: "block",
              marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em",
            }}>Dokumen</label>
            <select
              id="rmp-dokumen" value={rmpId} onChange={(e) => setRmpId(e.target.value)}
              style={{
                padding: "8px 10px", borderRadius: 6, border: `1px solid ${C.border}`,
                background: "var(--surface)", color: C.text, fontSize: 13, width: "100%",
              }}
            >
              {daftar.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nomor} · rev {d.revisi} — {d.judul}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {!projectId ? (
        <Kosong
          ikon={<ClipboardCheck size={28} />}
          judul="Pilih proyek dulu"
          sebab="Rencana mutu disusun per proyek — standar acuan, sasaran, dan titik-titik pemeriksaannya berbeda tiap kontrak."
        />
      ) : memuat ? (
        <div style={{ ...kartu, padding: 40, textAlign: "center", color: C.mid, fontSize: 13 }}>Memuat…</div>
      ) : daftar.length === 0 ? (
        <Kosong
          ikon={<ClipboardCheck size={28} />}
          judul="Belum ada rencana mutu untuk proyek ini"
          sebab="Tanpa rencana mutu, tak ada pernyataan berapa titik yang seharusnya diperiksa — sehingga 'ada yang terlewat?' hanya bisa dijawab dengan mengingat."
        />
      ) : detail && r ? (
        <>
          {/* ── VERDICT — satu-satunya hal yang menonjol di halaman ini ──── */}
          {r.boleh_lanjut === false ? (
            <div
              role="status"
              className="rise"
              style={{
                ...kartu, padding: "16px 18px", marginBottom: 14,
                borderColor: "var(--danger-border)", background: "var(--danger-bg)",
                borderLeftWidth: 4, borderLeftStyle: "solid", borderLeftColor: "var(--danger)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <ShieldAlert size={18} aria-hidden="true" style={{ color: "var(--danger)" }} />
                <strong style={{ fontSize: 15, color: "var(--danger)" }}>
                  Pekerjaan ditahan — {r.menahan.length} titik hold belum lolos
                </strong>
              </div>
              <ul style={{ margin: "0 0 0 26px", padding: 0, fontSize: 13, color: C.text, lineHeight: 1.7 }}>
                {r.menahan.map((t) => (
                  <li key={t.id}>
                    <strong>{t.tahap_pekerjaan}</strong> — {t.uraian}
                    {t.lolos === false
                      ? <span style={{ color: "var(--danger)" }}> · ditolak{t.catatan_hasil ? `: ${t.catatan_hasil}` : ""}</span>
                      : <span style={{ color: C.muted }}> · belum diperiksa</span>}
                  </li>
                ))}
              </ul>
            </div>
          ) : r.boleh_lanjut === true ? (
            <div role="status" className="rise" style={{
              ...kartu, padding: "14px 18px", marginBottom: 14,
              borderColor: "var(--success-border)", background: "var(--success-bg)",
              borderLeftWidth: 4, borderLeftStyle: "solid", borderLeftColor: "var(--success)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <ShieldCheck size={18} aria-hidden="true" style={{ color: "var(--success)" }} />
                <strong style={{ fontSize: 15, color: "var(--success)" }}>
                  Tidak ada titik hold yang menahan
                </strong>
              </div>
            </div>
          ) : (
            // `null` — ITP kosong. Sengaja TIDAK dibaca sebagai "boleh lanjut":
            // belum ada yang menyatakan apa pun.
            <div role="status" className="rise" style={{
              ...kartu, padding: "14px 18px", marginBottom: 14,
              borderColor: "var(--warning-border)", background: "var(--warning-bg)",
              borderLeftWidth: 4, borderLeftStyle: "solid", borderLeftColor: "var(--warning-teks)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <TriangleAlert size={18} aria-hidden="true" style={{ color: "var(--warning-teks)" }} />
                <strong style={{ fontSize: 14, color: "var(--warning-teks)" }}>
                  Belum ada titik periksa — ini bukan berarti boleh lanjut
                </strong>
              </div>
            </div>
          )}

          {/* Identitas dokumen — tenang, sebagai konteks bukan sebagai berita. */}
          <div className="rise" style={{ ...kartu, padding: "14px 18px", marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
              <strong style={{ fontSize: 14, color: C.text }}>{detail.rencana.nomor}</strong>
              <span style={{ fontSize: 12, color: C.muted }}>revisi {detail.rencana.revisi}</span>
              <span style={{
                padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700,
                color: STATUS[detail.rencana.status].warna,
                background: STATUS[detail.rencana.status].bg,
                border: `1px solid ${STATUS[detail.rencana.status].border}`,
              }}>{STATUS[detail.rencana.status].label}</span>
              {detail.rencana.disetujui_pada && (
                <span style={{ fontSize: 11, color: C.muted }}>
                  disetujui {tanggal(detail.rencana.disetujui_pada)}
                  {detail.rencana.penyetuju ? ` · ${detail.rencana.penyetuju.name}` : ""}
                </span>
              )}
            </div>
            <div style={{ fontSize: 13, color: C.mid, marginTop: 4 }}>{detail.rencana.judul}</div>

            {/* Draf → diajukan. Tanpa langkah ini, dokumen melompat ke
                disetujui dan penyetujunya harus menemukan sendiri bahwa ada
                yang menunggu — inbox persetujuan terpusat tak pernah terisi. */}
            {detail.rencana.status === "draf" && (
              <div style={{ marginTop: 10 }}>
                <button
                  type="button"
                  onClick={() => void ajukan()}
                  disabled={mengajukan}
                  style={{
                    padding: "7px 14px", borderRadius: 6, fontSize: 13, fontWeight: 600,
                    border: `1px solid ${C.border}`, background: "var(--surface)",
                    color: C.text, cursor: mengajukan ? "not-allowed" : "pointer",
                  }}
                >
                  {mengajukan ? "Mengajukan…" : "Ajukan untuk persetujuan"}
                </button>
                {detail.persetujuan.penghalang.length > 0 && (
                  <p style={{ fontSize: 11, color: "var(--warning-teks)", marginTop: 6, maxWidth: "60ch", lineHeight: 1.5 }}>
                    Catatan: dokumen ini belum bisa disetujui —{" "}
                    {detail.persetujuan.penghalang.map((p) => p.pesan).join(" ")}
                  </p>
                )}
              </div>
            )}

            {detail.rencana.status === "diajukan" && (
              <p style={{ fontSize: 12, color: C.mid, marginTop: 10 }}>
                Menunggu persetujuan — muncul di kotak masuk persetujuan mereka
                yang berwenang.
              </p>
            )}
            {detail.rencana.standar_acuan && (
              <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
                Acuan: {detail.rencana.standar_acuan}
              </div>
            )}
            {detail.rencana.sasaran_mutu && (
              <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                Sasaran: {detail.rencana.sasaran_mutu}
              </div>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            gap: 8, marginBottom: 14 }}>
            {[
              // "Titik hold menahan" SENGAJA tidak diulang di sini: verdict
              // tepat di atas sudah menyebutnya beserta daftar titiknya, dan
              // versi kartu justru lebih lemah — angka tanpa nama titik.
              { l: "Menunggu saksi", v: r.menunggu_saksi.length, sub: "witness — tidak menahan" },
              // Pecahan, bukan persen — dan sengaja tidak berdampingan dengan
              // persen lain. Dua persentase bersebelahan dengan PENYEBUT
              // BERBEDA (38% dari total vs 67% dari yang diperiksa) membuat
              // pembaca mengurangkan keduanya dan mendapat angka yang tak
              // berarti apa-apa. Ketahuan dari layar, bukan dari test.
              { l: "Sudah diperiksa", v: `${r.lolos + r.gagal}/${r.total}`, sub: "titik periksa" },
              { l: "Lolos", v: r.pct_lolos === null ? "—" : `${Math.round(r.pct_lolos)}%`, sub: r.pct_lolos === null ? "belum ada yang diperiksa" : "dari yang sudah diperiksa" },
              { l: "Tidak lolos", v: r.gagal, sub: r.gagal > 0 ? "perlu perbaikan" : "—" },
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

          {detail.cacat.length > 0 && (
            <div className="rise" style={{
              ...kartu, padding: "12px 16px", marginBottom: 14,
              borderColor: "var(--warning-border)", background: "var(--warning-bg)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <TriangleAlert size={14} aria-hidden="true" style={{ color: "var(--warning-teks)" }} />
                <strong style={{ fontSize: 12, color: "var(--warning-teks)" }}>
                  Yang membuat dokumen ini belum sepenuhnya berfungsi
                </strong>
              </div>
              <ul style={{ margin: "0 0 0 20px", padding: 0, fontSize: 12, color: C.text, lineHeight: 1.6 }}>
                {detail.cacat.map((c) => <li key={c.kode}>{c.pesan}</li>)}
              </ul>
            </div>
          )}

          <Tabel              berpermukaan
            kolom={buatKolom(bukaPeriksa)}
            data={detail.titik}
            kunciBaris={(t) => t.id}
            caption="Titik periksa ITP beserta kriteria penerimaan dan hasilnya"
          />
        </>
      ) : null}

      <DialogBersama
        terbuka={titikDiperiksa !== null}
        onTutup={() => setTitikDiperiksa(null)}
        judul="Catat hasil pemeriksaan"
        keterangan={titikDiperiksa
          ? `${titikDiperiksa.tahap_pekerjaan} — ${titikDiperiksa.uraian}`
          : undefined}
        kaki={
          <>
            <button
              type="button" onClick={() => setTitikDiperiksa(null)} disabled={menyimpan}
              style={{
                padding: "8px 14px", borderRadius: 6, fontSize: 13, fontWeight: 600,
                border: `1px solid ${C.border}`, background: "var(--surface)",
                color: C.text, cursor: menyimpan ? "not-allowed" : "pointer",
              }}
            >Batal</button>
            <button
              type="button" onClick={() => void simpanHasil()} disabled={menyimpan}
              style={{
                padding: "8px 14px", borderRadius: 6, fontSize: 13, fontWeight: 700,
                // `--navy` + `--on-navy`, bukan `--aksen` + putih dipaku:
                // `--navy` berbalik TERANG di mode gelap (#4D9FFF), dan putih
                // di atasnya terukur 2,72:1. `--on-navy` ikut berbalik bersama
                // latarnya. Komentar di globals.css:55 menuliskan jebakan ini,
                // dan saya hampir mengulanginya.
                border: "1px solid var(--navy)", background: "var(--navy)",
                color: "var(--on-navy)", cursor: menyimpan ? "not-allowed" : "pointer",
                opacity: menyimpan ? 0.7 : 1,
              }}
            >{menyimpan ? "Menyimpan…" : "Simpan hasil"}</button>
          </>
        }
      >
        {titikDiperiksa && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {titikDiperiksa.kriteria && (
              <div style={{
                padding: "10px 12px", borderRadius: 8, fontSize: 12,
                background: "var(--surface-2)", border: `1px solid ${C.border}`, color: C.mid,
              }}>
                <strong style={{ color: C.text }}>Kriteria penerimaan:</strong> {titikDiperiksa.kriteria}
                {titikDiperiksa.acuan && <> · {titikDiperiksa.acuan}</>}
              </div>
            )}

            {titikDiperiksa.jenis_titik === "hold" && (
              <div style={{
                padding: "10px 12px", borderRadius: 8, fontSize: 12,
                background: "var(--danger-bg)", border: "1px solid var(--danger-border)",
                color: "var(--danger)",
              }}>
                Titik <strong>hold</strong> — pekerjaan berhenti sampai ini lolos.
              </div>
            )}

            <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
              <legend style={{
                fontSize: 11, fontWeight: 700, color: C.muted, padding: 0,
                marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em",
              }}>Hasil pemeriksaan</legend>
              <div style={{ display: "flex", gap: 8 }}>
                {([
                  { v: "lolos" as const, l: "Lolos" },
                  { v: "tidak" as const, l: "Tidak lolos" },
                ]).map((o) => (
                  <label key={o.v} style={{
                    display: "flex", alignItems: "center", gap: 6, cursor: "pointer",
                    padding: "8px 12px", borderRadius: 6, fontSize: 13,
                    border: `1px solid ${fLolos === o.v ? "var(--aksen)" : C.border}`,
                    background: fLolos === o.v ? "var(--surface-2)" : "var(--surface)",
                    color: C.text,
                  }}>
                    <input
                      type="radio" name="hasil-titik" value={o.v}
                      checked={fLolos === o.v}
                      onChange={() => setFLolos(o.v)}
                    />
                    {o.l}
                  </label>
                ))}
              </div>
            </fieldset>

            <div>
              <label htmlFor="itp-catatan" style={{
                fontSize: 11, fontWeight: 700, color: C.muted, display: "block",
                marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em",
              }}>
                Catatan {fLolos === "tidak" && <span style={{ color: "var(--danger)" }}>· wajib</span>}
              </label>
              <textarea
                id="itp-catatan" rows={3} value={fCatatan}
                onChange={(e) => setFCatatan(e.target.value)}
                placeholder={fLolos === "tidak"
                  ? "Apa yang tidak sesuai, dan di bagian mana"
                  : "Opsional"}
                style={{
                  width: "100%", padding: "8px 10px", borderRadius: 6, fontSize: 13,
                  border: `1px solid ${C.border}`, background: "var(--surface)",
                  color: C.text, resize: "vertical", fontFamily: "inherit",
                }}
              />
            </div>

            <div>
              <label htmlFor="itp-inspeksi" style={{
                fontSize: 11, fontWeight: 700, color: C.muted, display: "block",
                marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em",
              }}>Tautkan ke inspeksi</label>
              <select
                id="itp-inspeksi" value={fInspeksi}
                onChange={(e) => setFInspeksi(e.target.value)}
                style={{
                  width: "100%", padding: "8px 10px", borderRadius: 6, fontSize: 13,
                  border: `1px solid ${C.border}`, background: "var(--surface)", color: C.text,
                }}
              >
                <option value="">— tidak ditautkan —</option>
                {inspeksi.map((i) => (
                  <option key={i.id} value={i.id}>{i.nomor} — {i.judul}</option>
                ))}
              </select>
              <p style={{ fontSize: 11, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>
                Menautkan membuat rencana dan pelaksanaannya bisa ditelusuri dua
                arah — dari titik ke inspeksi yang menjawabnya, dan sebaliknya.
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
        )}
      </DialogBersama>
    </div>
  );
}
