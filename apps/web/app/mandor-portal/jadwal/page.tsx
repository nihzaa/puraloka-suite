"use client";

// ============================================================================
// Jadwal Proyek — jalur kritis (CPM), BACA SAJA untuk mandor.
//
// ── Endpoint yang dipakai, dan yang SENGAJA tidak
//
// `GET /api/v1/jadwal-cpm/:projectId` (`apps/api/src/routes/v1/jadwal-cpm.ts`)
// — preHandler-nya `requirePermission('projects:view')` SAJA, persis
// permission yang dipegang mandor. Tak ada cabang mandor-vs-lainnya di rute
// itu: penyaringan tenant lewat `company_id` proyek sudah cukup, jadi tak
// perlu endpoint terpisah.
//
// `POST /api/v1/jadwal-cpm/dependensi`, `/libur`, `/sumber-daya` BUTUH
// `milestones:manage` — mandor tidak punya itu, jadi halaman ini tak
// menuliskan apa pun ke sana. Tak ada tombol ubah/set baseline di sini.
//
// `GET /api/v1/projects/:id/rab/gantt` (dipakai portal KLIEN di
// `app/portal/proyek/[id]/page.tsx`) BUKAN yang dipilih — jadwal itu berbasis
// item RAB (bar per baris RAB), sedangkan CPM di sini berbasis MILESTONE +
// dependensi + kalender kerja, yang justru menjawab pertanyaan mandor:
// "pekerjaan mana yang kalau telat SEHARI membuat proyek telat".
//
// ── Kenapa BUKAN Gantt horizontal (beda dari portal klien)
//
// Portal klien merender bar timeline sendiri (bukan frappe-gantt, meski
// pustaka itu ada di package.json) — lihat `GanttTab` di
// `app/portal/proyek/[id]/page.tsx`. Di layar 390px, bar horizontal
// menuntut scroll DUA ARAH (vertikal utk daftar, horizontal utk garis waktu)
// dan label kolom tanggal yang sudah sempit di desktop akan tumpang tindih
// atau hilang di ponsel.
//
// Halaman ini malah merender DAFTAR VERTIKAL terurut tanggal mulai — satu
// kartu per pekerjaan, dengan bar progres HORIZONTAL PENDEK di dalam kartu
// (bukan pada garis waktu bersama). Ini pola "list ber-progress" yang sama
// dengan `k3/page.tsx`/`punch-list/page.tsx`, jadi konsisten dengan modul
// lain — dan satu tangan cukup untuk menggulirnya di lapangan.
// ============================================================================

import { useMemo, useState } from "react";
import { CalendarDays, AlertTriangle, Flag } from "lucide-react";
import { useData } from "@/lib/data-cache";
import EmptyState from "@/components/portal/EmptyState";
import KepalaPortal from "@/components/portal/KepalaPortal";
import SkeletonCard from "@/components/portal/SkeletonCard";
import StatusBadge from "@/components/portal/StatusBadge";
import type { Penugasan, GalatApi } from "../_bersama/tipe";
import { pesanGalat } from "../_bersama/tipe";
import { Pilihan } from "@/components/pilihan";

interface RespAssignments { assignments: Penugasan[] }

/** Satu pekerjaan hasil hitung CPM. Bentuk dari `HasilPekerjaan` di `lib/cpm.ts`. */
interface PekerjaanCpm {
  id: string;
  nama: string;
  durasi: number;
  mulaiPalingAwal: string | null;
  selesaiPalingAwal: string | null;
  mulaiPalingLambat: string | null;
  selesaiPalingLambat: string | null;
  float: number | null;
  kritis: boolean;
}

interface RespJadwalCpm {
  proyek: { id: string; nama: string; mulai: string | null; akhir: string | null };
  kalender: {
    hariKerjaProyek: number | null;
  };
  cpm: {
    pekerjaan: PekerjaanCpm[];
    jalurKritis: string[];
    selesaiProyek: string | null;
    lingkaran: string[];
    tanpaDurasi: string[];
  };
}

function fmtTanggal(s: string | null): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

export default function JadwalProyekPage() {
  const [proyekId, setProyekId] = useState<string>("");

  const { data: dataAsg, memuat: memuatAsg, galat: galatAsg } =
    useData<RespAssignments>("/api/v1/mandor/assignments");

  const daftarProyek = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of dataAsg?.assignments ?? []) {
      if (a.project?.id) map.set(a.project.id, a.project.name);
    }
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [dataAsg]);

  // Mandor umumnya hanya punya satu penugasan aktif — pilih otomatis begitu
  // daftarnya tersedia, sama seperti pola di k3/page.tsx.
  const proyekAktif = proyekId || daftarProyek[0]?.id || "";

  const urlJadwal = proyekAktif ? `/api/v1/jadwal-cpm/${proyekAktif}` : null;
  const { data, memuat, galat } = useData<RespJadwalCpm>(urlJadwal);

  const pekerjaan = useMemo(() => {
    const list = data?.cpm?.pekerjaan ?? [];
    // Terurut tanggal mulai paling awal — pekerjaan tanpa tanggal (belum
    // bisa dijadwalkan) ditaruh di akhir, bukan disembunyikan.
    return [...list].sort((a, b) => {
      if (!a.mulaiPalingAwal && !b.mulaiPalingAwal) return 0;
      if (!a.mulaiPalingAwal) return 1;
      if (!b.mulaiPalingAwal) return -1;
      return a.mulaiPalingAwal.localeCompare(b.mulaiPalingAwal);
    });
  }, [data]);

  const jumlahKritis = pekerjaan.filter((p) => p.kritis).length;
  const adaLingkaran = (data?.cpm?.lingkaran?.length ?? 0) > 0;

  if (galatAsg) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
        <KepalaPortal judul="Jadwal Proyek" />
        <EmptyState
          icon={CalendarDays}
          judul="Gagal memuat penugasan"
          deskripsi={pesanGalat(galatAsg as GalatApi, "Coba muat ulang halaman ini.")}
        />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
      <KepalaPortal judul="Jadwal Proyek" />

      {memuatAsg && <SkeletonCard tinggi={44} />}

      {!memuatAsg && daftarProyek.length === 0 && (
        <EmptyState
          icon={CalendarDays}
          judul="Belum ada penugasan"
          deskripsi="Jadwal proyek akan muncul di sini setelah Anda ditugaskan ke sebuah proyek."
        />
      )}

      {!memuatAsg && daftarProyek.length > 1 && (
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Proyek</span>
          <Pilihan
            value={proyekAktif}
            onChange={(e) => setProyekId(e.target.value)}
            style={{
              minHeight: 44, padding: "0 12px", borderRadius: 12,
              border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)",
              color: "var(--text-primary)",
            }}
          >
            {daftarProyek.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Pilihan>
        </label>
      )}

      {proyekAktif && memuat && (
        <>
          <SkeletonCard tinggi={80} />
          <SkeletonCard tinggi={80} />
          <SkeletonCard tinggi={80} />
        </>
      )}

      {proyekAktif && galat && (
        <EmptyState
          icon={CalendarDays}
          judul="Gagal memuat jadwal"
          deskripsi={pesanGalat(galat as GalatApi, "Coba muat ulang halaman ini.")}
        />
      )}

      {proyekAktif && !memuat && !galat && data && (
        <>
          {/* Ringkasan proyek */}
          <div
            style={{
              padding: "var(--pad-kartu-lega)", borderRadius: "var(--portal-radius-card)", background: "var(--navy-light)",
              display: "flex", flexDirection: "column", gap: 10,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Flag size={16} color="var(--navy)" aria-hidden="true" />
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--navy)" }}>
                  Estimasi selesai
                </span>
              </div>
              <span style={{ fontSize: 14, fontWeight: 800, color: "var(--navy)" }}>
                {fmtTanggal(data.cpm?.selesaiProyek ?? null)}
              </span>
            </div>
            <div style={{ display: "flex", gap: "var(--gap-bagian)", flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: "var(--t-kecil)", color: "var(--navy)" }}>Total pekerjaan</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "var(--navy)" }}>{pekerjaan.length}</div>
              </div>
              <div>
                <div style={{ fontSize: "var(--t-kecil)", color: "var(--navy)" }}>Jalur kritis</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "var(--navy)" }}>{jumlahKritis}</div>
              </div>
              {data.kalender.hariKerjaProyek !== null && (
                <div>
                  <div style={{ fontSize: "var(--t-kecil)", color: "var(--navy)" }}>Hari kerja</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "var(--navy)" }}>
                    {data.kalender.hariKerjaProyek}
                  </div>
                </div>
              )}
            </div>
          </div>

          {adaLingkaran && (
            <div
              style={{
                display: "flex", alignItems: "flex-start", gap: 10, padding: 14,
                borderRadius: "var(--portal-radius-card)", background: "var(--warning-bg)",
                border: "1px solid var(--warning-border)",
              }}
            >
              <AlertTriangle size={18} color="var(--on-warning-bg)" aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
              <span style={{ fontSize: 12, color: "var(--on-warning-bg)" }}>
                Ada dependensi yang saling melingkar pada jadwal ini — sebagian pekerjaan tak bisa
                dihitung jalur kritisnya sampai ini diperbaiki oleh PM.
              </span>
            </div>
          )}

          {pekerjaan.length === 0 && (
            <EmptyState
              icon={CalendarDays}
              judul="Jadwal belum diinput"
              deskripsi="Milestone dan tanggal rencana proyek ini belum diisi."
            />
          )}

          {/* Daftar pekerjaan — vertikal, terurut tanggal mulai */}
          {pekerjaan.map((p) => {
            const progresWaktu = hitungProgresWaktu(p.mulaiPalingAwal, p.selesaiPalingAwal);
            return (
              <div
                key={p.id}
                style={{
                  padding: "var(--pad-kartu-lega)", borderRadius: 16, background: "var(--surface)",
                  border: p.kritis ? "1px solid var(--danger-border)" : "1px solid var(--border)",
                  display: "flex", flexDirection: "column", gap: 8,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", flex: 1 }}>
                    {p.nama}
                  </span>
                  {p.kritis && <StatusBadge status="rejected" label="Kritis" />}
                </div>

                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                  {fmtTanggal(p.mulaiPalingAwal)} – {fmtTanggal(p.selesaiPalingAwal)}
                  {p.durasi > 0 && ` · ${p.durasi} hari kerja`}
                </div>

                {/* Bar progres waktu — seberapa jauh rentang tanggal pekerjaan ini
                    sudah dilalui hari ini, BUKAN progres fisik (yang dicatat lewat
                    modul Progress terpisah). Dilabeli eksplisit di teks di bawah
                    supaya tak tertukar dengan progres fisik lapangan. */}
                <div style={{ height: 8, background: "var(--jalur-progres)", borderRadius: 6, overflow: "hidden" }}>
                  <div
                    style={{
                      height: "100%", borderRadius: 6, width: `${progresWaktu}%`,
                      background: p.kritis ? "var(--danger)" : "var(--navy)",
                      transition: "width 0.3s ease",
                    }}
                  />
                </div>
                <div style={{ fontSize: "var(--t-kecil)", color: "var(--text-muted)" }}>
                  {progresWaktu >= 100
                    ? "Rentang waktu rencana sudah lewat"
                    : progresWaktu <= 0
                    ? "Belum dimulai menurut rencana"
                    : `${progresWaktu}% rentang waktu rencana telah berjalan`}
                  {!p.kritis && p.float !== null && p.float > 0 && ` · float ${p.float} hari`}
                </div>
              </div>
            );
          })}

          {/*
            Pagar `?.` dipasang di `cpm` juga, bukan hanya di `tanpaDurasi`.

            Blok ini dijaga `data &&` di atasnya — yang menjamin `data` ada,
            TIDAK `data.cpm`. Kalau server memulangkan objek tanpa `cpm`
            (proyek tanpa jadwal, balasan galat berbentuk objek, versi rute
            yang berbeda), `data.cpm.tanpaDurasi` melempar dan seluruh
            halaman mati — bukan menampilkan pesan, melainkan layar putih.

            Tipe `RespJadwalCpm` menjanjikan `cpm` selalu ada, tetapi tipe
            TypeScript tak menjamin apa yang sungguh dikirim server. Ia
            dihapus saat kompilasi.

            Dua baris lain di berkas ini (106, 118) sudah memakai
            `data?.cpm?.` — yang tak konsisten justru yang di sini.
          */}
          {(data.cpm?.tanpaDurasi?.length ?? 0) > 0 && (
            <div style={{ fontSize: "var(--t-kecil)", color: "var(--text-muted)", textAlign: "center", padding: "0 8px" }}>
              {data.cpm?.tanpaDurasi?.length ?? 0} pekerjaan belum punya durasi/tanggal target — tak ikut dihitung di atas.
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Persentase rentang waktu [mulai, selesai] yang sudah dilalui HARI INI.
 *
 * Ini progres WAKTU (rencana vs hari ini), bukan progres FISIK pekerjaan di
 * lapangan — dua hal berbeda. Progres fisik dicatat lewat modul Progress
 * (`/mandor-portal/progress`) dan sengaja tak digabung di sini: jadwal CPM
 * ini tak membawa angka progres fisik sama sekali.
 */
function hitungProgresWaktu(mulai: string | null, selesai: string | null): number {
  if (!mulai || !selesai) return 0;
  const m = new Date(mulai).getTime();
  const s = new Date(selesai).getTime();
  const now = Date.now();
  if (s <= m) return now >= s ? 100 : 0;
  const pct = ((now - m) / (s - m)) * 100;
  return Math.max(0, Math.min(100, Math.round(pct)));
}
