"use client";

// ============================================================================
// Jadwal & Baseline — versi PM.
//
// Dua bagian yang endpoint-nya BEDA modul, digabung satu halaman:
//
// 1. CPM (jalur kritis) — endpoint & pola tampilan SAMA PERSIS dengan
//    `mandor-portal/jadwal/page.tsx` (list vertikal, bukan Gantt horizontal —
//    lihat alasannya di komentar berkas itu). PM py permission yang sama
//    (`projects:view`), jadi dipakai apa adanya, baca saja di halaman ini.
//
// 2. Baseline — `apps/api/src/routes/v1/baseline-jadwal.ts`. PM py
//    `projects:baseline:manage` sehingga BISA menetapkan baseline baru
//    (POST /proyek/:id/baseline). Baseline TIDAK BISA disunting/dihapus —
//    hanya baseline BARU, yang lama otomatis jadi riwayat (append-only,
//    ditegakkan trigger DB). `pergeseran` menjawab "SPI 0,98 itu jujur atau
//    menipu" — dihitung terhadap tanggal baseline yang TAK IKUT bergeser,
//    bukan `planned_start/end` yang bisa digeser kapan saja.
// ============================================================================

import { useMemo, useState } from "react";
import { CalendarDays, Flag, AlertTriangle, ClipboardList, Users2 } from "lucide-react";
import { useData, invalidasi } from "@/lib/data-cache";
import { api } from "@/lib/api";
import EmptyState from "@/components/portal/EmptyState";
import KepalaPortal from "@/components/portal/KepalaPortal";
import SkeletonCard from "@/components/portal/SkeletonCard";
import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
import BottomSheet from "@/components/portal/BottomSheet";
import SegmentedTab from "@/components/portal/SegmentedTab";
import type { ProyekPM, GalatApi } from "../_bersama/tipe";
import { pesanGalat } from "../_bersama/tipe";

interface RespProyek { projects: ProyekPM[] }

interface PekerjaanCpm {
  id: string; nama: string; durasi: number;
  mulaiPalingAwal: string | null; selesaiPalingAwal: string | null;
  mulaiPalingLambat: string | null; selesaiPalingLambat: string | null;
  float: number | null; kritis: boolean;
}
interface PeriodeSumberDaya {
  minggu: string;
  dibutuhkan: number;
  tersedia: number | null;
  kelebihan: number;
}
interface HistogramSumberDaya {
  nama: string;
  jenis: string;
  periode: PeriodeSumberDaya[];
  puncak: number;
  mingguPuncak: string | null;
  tersedia: number | null;
  mingguKelebihan: string[];
}
interface MethodStatementItem {
  id: string;
  milestone_id: string | null;
  nomor: string | null;
  judul: string;
  status: "diajukan" | "disetujui" | "ditolak";
  alasan_tolak: string | null;
  diputuskan_pada: string | null;
  pengendalian_risiko: string | null;
}
interface RespJadwalCpm {
  proyek: { id: string; nama: string; mulai: string | null; akhir: string | null };
  cpm: { pekerjaan: PekerjaanCpm[]; jalurKritis: string[]; selesaiProyek: string | null; lingkaran: string[] };
  histogram: HistogramSumberDaya[];
  methodStatement: MethodStatementItem[];
}

const LABEL_METHOD: Record<string, string> = { diajukan: "Diajukan", disetujui: "Disetujui", ditolak: "Ditolak" };
const VARIAN_METHOD: Record<string, VarianStatus> = { diajukan: "pending", disetujui: "approved", ditolak: "rejected" };

interface BaselineRingkas { id: string; nomor: number; nama: string; aktif: boolean; ditetapkan_pada: string | null }
interface RespBaselineList { baseline: BaselineRingkas[] }

/** Bentuk dari `lib/baseline-jadwal.ts` (`RingkasPergeseran`) — diverifikasi ke kode, bukan ditebak. */
interface RingkasPergeseran {
  total_item: number; bergeser: number; mundur: number; maju: number;
  hilang: number; baru: number;
  mundur_terparah_hari: number | null; bobot_mundur_pct: number;
  geser_tertimbang_hari: number | null;
}
/** Bentuk dari `lib/baseline-jadwal.ts` (`Pergeseran`). */
interface BarisPergeseran {
  rab_item_id: string; uraian: string | null;
  geser_mulai_hari: number | null; geser_selesai_hari: number | null;
  hilang: boolean; baru: boolean;
}
interface RespPergeseran {
  baseline: BaselineRingkas | null;
  pergeseran: BarisPergeseran[];
  ringkas: RingkasPergeseran | null;
  alasan?: string;
}

function fmtTanggal(s: string | null): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

export default function PmJadwalPage() {
  const [tab, setTab] = useState<"cpm" | "histogram" | "method" | "baseline">("cpm");
  const [proyekId, setProyekId] = useState("");
  const [sheetTerbuka, setSheetTerbuka] = useState(false);
  const [namaBaseline, setNamaBaseline] = useState("");
  const [alasanBaseline, setAlasanBaseline] = useState("");
  const [mengirim, setMengirim] = useState(false);
  const [galatForm, setGalatForm] = useState<string | null>(null);

  const { data: dataProyek } = useData<RespProyek>("/api/v1/projects");
  const daftarProyek = useMemo(() => (dataProyek?.projects ?? []).filter((p) => p.pm), [dataProyek]);
  const proyekAktif = proyekId || daftarProyek[0]?.id || "";

  const urlCpm = proyekAktif ? `/api/v1/jadwal-cpm/${proyekAktif}` : null;
  const { data: dataCpm, memuat: memuatCpm, galat: galatCpm } = useData<RespJadwalCpm>(tab === "cpm" ? urlCpm : null);

  const urlPergeseran = proyekAktif ? `/api/v1/proyek/${proyekAktif}/baseline/pergeseran` : null;
  const { data: dataPergeseran, memuat: memuatPergeseran, galat: galatPergeseran } =
    useData<RespPergeseran>(tab === "baseline" ? urlPergeseran : null);

  const urlBaselineList = proyekAktif ? `/api/v1/proyek/${proyekAktif}/baseline` : null;
  const { data: dataBaselineList } = useData<RespBaselineList>(tab === "baseline" ? urlBaselineList : null);

  const pekerjaan = useMemo(() => {
    const list = dataCpm?.cpm?.pekerjaan ?? [];
    return [...list].sort((a, b) => {
      if (!a.mulaiPalingAwal && !b.mulaiPalingAwal) return 0;
      if (!a.mulaiPalingAwal) return 1;
      if (!b.mulaiPalingAwal) return -1;
      return a.mulaiPalingAwal.localeCompare(b.mulaiPalingAwal);
    });
  }, [dataCpm]);

  async function tetapkanBaseline() {
    if (!proyekAktif) return;
    setMengirim(true);
    setGalatForm(null);
    try {
      await api.post(`/api/v1/proyek/${proyekAktif}/baseline`, {
        nama: namaBaseline.trim() || undefined,
        alasan: alasanBaseline.trim() || undefined,
      });
      setSheetTerbuka(false);
      setNamaBaseline("");
      setAlasanBaseline("");
      invalidasi(urlPergeseran ?? "");
      invalidasi(urlBaselineList ?? "");
    } catch (e) {
      setGalatForm(pesanGalat(e as GalatApi, "Gagal menetapkan baseline"));
    } finally {
      setMengirim(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
      <KepalaPortal judul="Jadwal &amp; Baseline" />

      {daftarProyek.length > 1 && (
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Proyek</span>
          <select
            value={proyekAktif}
            onChange={(e) => setProyekId(e.target.value)}
            style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)" }}
          >
            {daftarProyek.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      )}

      <SegmentedTab
        opsi={[
          { value: "cpm", label: "Jalur Kritis" },
          { value: "histogram", label: "Sumber Daya" },
          { value: "method", label: "Method Statement" },
          { value: "baseline", label: "Baseline" },
        ]}
        aktif={tab}
        onUbah={(v) => setTab(v as typeof tab)}
      />

      {!proyekAktif && <EmptyState icon={CalendarDays} judul="Pilih proyek" deskripsi="Jadwal tercatat per proyek." />}

      {proyekAktif && tab === "cpm" && (
        <>
          {memuatCpm && <><SkeletonCard tinggi={80} /><SkeletonCard tinggi={80} /></>}
          {galatCpm && <EmptyState icon={CalendarDays} judul="Gagal memuat jadwal" deskripsi={pesanGalat(galatCpm as GalatApi, "Coba muat ulang.")} />}
          {!memuatCpm && !galatCpm && pekerjaan.length === 0 && (
            <EmptyState icon={CalendarDays} judul="Belum ada jadwal" deskripsi="Milestone dan dependensi proyek ini belum diatur." />
          )}
          {!memuatCpm && pekerjaan.map((p) => (
            <div key={p.id} style={{ padding: 14, borderRadius: 14, background: "var(--surface)", border: "1px solid color-mix(in srgb, var(--border) 40%, transparent)", boxShadow: "var(--naik-1)", display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{p.nama}</span>
                {p.kritis && <StatusBadge status="rejected" label="Kritis" />}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                {fmtTanggal(p.mulaiPalingAwal)} — {fmtTanggal(p.selesaiPalingAwal)} · {p.durasi} hari
                {p.float !== null && !p.kritis ? ` · float ${p.float} hari` : ""}
              </div>
            </div>
          ))}
        </>
      )}

      {proyekAktif && tab === "histogram" && (
        <>
          {memuatCpm && <SkeletonCard tinggi={100} />}
          {!memuatCpm && (dataCpm?.histogram?.length ?? 0) === 0 && (
            <EmptyState icon={Users2} judul="Belum ada kebutuhan sumber daya" deskripsi="Kebutuhan tenaga/alat per milestone belum diatur." />
          )}
          {!memuatCpm && dataCpm?.histogram.map((h) => (
            <div key={`${h.jenis}-${h.nama}`} style={{ padding: "var(--pad-kartu)", borderRadius: 14, background: "var(--surface)", border: "1px solid color-mix(in srgb, var(--border) 40%, transparent)", boxShadow: "var(--naik-1)", display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{h.nama}</span>
                <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>Puncak {h.puncak}{h.tersedia !== null ? ` / tersedia ${h.tersedia}` : ""}</span>
              </div>
              {/* Daftar angka per minggu, BUKAN dirata-rata — puncak adalah sinyal yang dijaga backend, rata-rata menyembunyikannya. */}
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {h.periode.map((p) => (
                  <div key={p.minggu} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "4px 0", borderTop: "1px solid var(--border)" }}>
                    <span style={{ color: "var(--text-secondary)" }}>{p.minggu}</span>
                    <span style={{ color: p.kelebihan > 0 ? "var(--danger)" : "var(--text-primary)", fontWeight: p.kelebihan > 0 ? 700 : 400 }}>
                      {p.dibutuhkan}{p.tersedia !== null ? ` / ${p.tersedia}` : ""}
                      {p.kelebihan > 0 && ` · kurang ${p.kelebihan}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </>
      )}

      {proyekAktif && tab === "method" && (
        <>
          {memuatCpm && <SkeletonCard tinggi={100} />}
          {!memuatCpm && (dataCpm?.methodStatement?.length ?? 0) === 0 && (
            <EmptyState icon={ClipboardList} judul="Belum ada method statement" deskripsi="Cara kerja pekerjaan berisiko belum diajukan." />
          )}
          {!memuatCpm && dataCpm?.methodStatement.map((m) => (
            <div key={m.id} style={{ padding: "var(--pad-kartu)", borderRadius: 14, background: "var(--surface)", border: "1px solid color-mix(in srgb, var(--border) 40%, transparent)", boxShadow: "var(--naik-1)", display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{m.nomor ?? m.judul}</span>
                <StatusBadge status={VARIAN_METHOD[m.status] ?? "netral"} label={LABEL_METHOD[m.status] ?? m.status} />
              </div>
              {m.nomor && <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{m.judul}</div>}
              <div style={{ fontSize: 12, padding: "6px 10px", borderRadius: 8, background: m.pengendalian_risiko ? "var(--surface-subtle)" : "var(--danger-bg)", color: m.pengendalian_risiko ? "var(--text-secondary)" : "var(--on-danger-bg)" }}>
                {m.pengendalian_risiko ?? "Pengendalian risiko K3 belum diisi"}
              </div>
              {m.status === "ditolak" && m.alasan_tolak && (
                <div style={{ fontSize: 12, color: "var(--danger)" }}>Alasan tolak: {m.alasan_tolak}</div>
              )}
            </div>
          ))}
          {/* Tanpa tombol putuskan — grep ulang `method_statement` di apps/api/src/routes/v1/*.ts mengonfirmasi tak ada rute PATCH untuk keputusan method statement (satu-satunya kemunculan adalah baca, jadwal-cpm.ts:66). */}
        </>
      )}

      {proyekAktif && tab === "baseline" && (
        <>
          {memuatPergeseran && <SkeletonCard tinggi={100} />}
          {galatPergeseran && <EmptyState icon={Flag} judul="Gagal memuat baseline" deskripsi={pesanGalat(galatPergeseran as GalatApi, "Coba muat ulang.")} />}

          {!memuatPergeseran && !galatPergeseran && !dataPergeseran?.baseline && (
            <EmptyState
              icon={Flag}
              judul="Belum ada baseline"
              deskripsi={dataPergeseran?.alasan ?? "Tetapkan baseline supaya progress bisa dibandingkan terhadap rencana yang tak ikut bergeser."}
            />
          )}

          {!memuatPergeseran && dataPergeseran?.baseline && (
            <div style={{ padding: "var(--pad-kartu-lega)", borderRadius: 16, background: "var(--surface)", border: "1px solid color-mix(in srgb, var(--border) 40%, transparent)", boxShadow: "var(--naik-1)", display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
                  #{dataPergeseran.baseline.nomor} {dataPergeseran.baseline.nama}
                </span>
                <StatusBadge status="approved" label="Aktif" />
              </div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                Ditetapkan {fmtTanggal(dataPergeseran.baseline.ditetapkan_pada)}
              </div>
              {dataPergeseran.ringkas && (
                <div style={{ display: "flex", gap: "var(--gap-bagian)", marginTop: 4, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)" }}>{dataPergeseran.ringkas.mundur}</div>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>dari {dataPergeseran.ringkas.total_item} mundur</div>
                  </div>
                  {dataPergeseran.ringkas.mundur_terparah_hari !== null && (
                    <div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: "var(--danger)" }}>
                        +{dataPergeseran.ringkas.mundur_terparah_hari}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>mundur terparah (hari)</div>
                    </div>
                  )}
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)" }}>{dataPergeseran.ringkas.bobot_mundur_pct}%</div>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>bobot mundur</div>
                  </div>
                </div>
              )}
              {dataPergeseran.pergeseran
                .filter((p) => (p.geser_selesai_hari ?? 0) !== 0 || p.hilang || p.baru)
                .slice(0, 5)
                .map((p) => (
                  <div key={p.rab_item_id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-secondary)", borderTop: "1px solid var(--border)", paddingTop: 8 }}>
                    <span>{p.uraian ?? "—"}</span>
                    {p.hilang ? (
                      <StatusBadge status="rejected" label="Hilang dari lingkup" />
                    ) : p.baru ? (
                      <StatusBadge status="pending" label="Lingkup baru" />
                    ) : (
                      <span style={{ color: (p.geser_selesai_hari ?? 0) > 0 ? "var(--danger)" : "var(--text-primary)", fontWeight: 600 }}>
                        {(p.geser_selesai_hari ?? 0) > 0 ? "+" : ""}{p.geser_selesai_hari} hari
                      </span>
                    )}
                  </div>
                ))}
            </div>
          )}

          {(dataBaselineList?.baseline?.length ?? 0) > 0 && (
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              {dataBaselineList!.baseline.length} baseline tercatat sebagai riwayat.
            </div>
          )}

          <button
            type="button"
            onClick={() => { setSheetTerbuka(true); setNamaBaseline(""); setAlasanBaseline(""); setGalatForm(null); }}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              padding: 14, borderRadius: "var(--portal-radius-pill)",
              background: "var(--grad-merek)", color: "var(--on-navy)",
              border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer",
            }}
          >
            <Flag size={18} aria-hidden="true" /> Tetapkan Baseline Baru
          </button>
        </>
      )}

      <BottomSheet terbuka={sheetTerbuka} onTutup={() => setSheetTerbuka(false)} judul="Tetapkan Baseline Baru">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div role="alert" style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12, color: "var(--text-secondary)", padding: 10, borderRadius: 10, background: "var(--surface-subtle)" }}>
            <AlertTriangle size={16} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
            <span>Baseline tak bisa disunting/dihapus setelah ditetapkan — hanya baseline baru, yang lama otomatis jadi riwayat.</span>
          </div>

          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Nama
            <input
              type="text"
              value={namaBaseline}
              onChange={(e) => setNamaBaseline(e.target.value)}
              placeholder="mis. Kontrak awal"
              style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }}
            />
          </label>

          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Alasan
            <textarea
              value={alasanBaseline}
              onChange={(e) => setAlasanBaseline(e.target.value)}
              rows={3}
              placeholder="mis. Kontrak ditandatangani, jadwal ini yang mengikat"
              style={{ width: "100%", marginTop: 6, padding: 12, borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, fontFamily: "inherit" }}
            />
          </label>

          {galatForm && (
            <div role="alert" style={{ fontSize: 12, color: "var(--on-danger-bg)", padding: 10, borderRadius: 10, background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}>
              {galatForm}
            </div>
          )}

          <button
            type="button"
            onClick={tetapkanBaseline}
            disabled={mengirim}
            style={{
              padding: 14, borderRadius: "var(--portal-radius-pill)",
              background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none",
              fontSize: 14, fontWeight: 700, cursor: mengirim ? "default" : "pointer",
            }}
          >
            {mengirim ? "Menetapkan…" : "Tetapkan Baseline"}
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}
