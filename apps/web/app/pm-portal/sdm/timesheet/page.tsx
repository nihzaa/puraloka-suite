"use client";

// ============================================================================
// Timesheet Staf — Portal PM (Task 39, Tahap 7).
//
// Picker pegawai (dari GET /sdm/pegawai — endpoint TAK menyaring "hanya diri
// sendiri", jadi seluruh pegawai aktif tampil, sama seperti versi web
// `/sdm/timesheet`) + picker bulan + ringkasan bulan (jam kerja, jam lembur,
// hari terisi/kosong, per-proyek) + daftar baris + form isi hari (BottomSheet)
// + tombol "Ajukan Bulan Ini".
//
// PM PUNYA `sdm:timesheet:view` + `sdm:timesheet:manage` (isi hari + ajukan
// bulan) — TIDAK punya `sdm:timesheet:approve` (setuju/tolak), jadi TANPA
// tombol putuskan di sini (itu wewenang atasan langsung/HRD lewat halaman
// approval, di luar scope halaman ini).
//
// Dua state galat level-halaman TERPISAH (pelajaran Tahap 2-7): galat MUAT
// (dari `useData`, tampil sebagai EmptyState) dan galat AKSI (simpan hari /
// ajukan bulan, tampil di dalam BottomSheet atau di bawah tombol) — gagal
// simpan tak boleh menghapus pesan galat muat, dan sebaliknya.
// ============================================================================

import { useMemo, useState } from "react";
import { CalendarClock, AlertTriangle, Send } from "lucide-react";
import { useData, invalidasi } from "@/lib/data-cache";
import { api } from "@/lib/api";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import BottomSheet from "@/components/portal/BottomSheet";
import type { RespDaftarPegawai, RespTimesheetPegawai, GalatApi } from "../../_bersama/tipe";
import { pesanGalat } from "../../_bersama/tipe";

function bulanIni(): string {
  return new Date().toISOString().slice(0, 7);
}
function fmtTanggal(s: string): string {
  return new Date(s + "T00:00:00").toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
}
const LABEL_STATUS: Record<string, string> = {
  draf: "Draf", diajukan: "Diajukan", disetujui: "Disetujui", ditolak: "Ditolak",
};

export default function PmTimesheetPage() {
  const [pegawaiId, setPegawaiId] = useState("");
  const [bulan, setBulan] = useState(bulanIni());
  const [sheetIsi, setSheetIsi] = useState<string | null>(null); // tanggal yang diisi
  const [form, setForm] = useState({ jam_kerja: "8", jam_lembur: "0", kegiatan: "" });
  const [mengirim, setMengirim] = useState(false);
  const [galatForm, setGalatForm] = useState<string | null>(null);
  const [mengajukan, setMengajukan] = useState(false);
  const [galatAjukan, setGalatAjukan] = useState<string | null>(null);

  const { data: dataPegawai, memuat: memuatPegawai, galat: galatPegawai } =
    useData<RespDaftarPegawai>("/api/v1/sdm/pegawai");
  const daftarPegawai = useMemo(() => dataPegawai?.pegawai ?? [], [dataPegawai]);
  const pegawaiAktif = pegawaiId || daftarPegawai[0]?.id || "";

  const url = pegawaiAktif ? `/api/v1/sdm/pegawai/${pegawaiAktif}/timesheet?bulan=${bulan}` : null;
  const { data, memuat, galat } = useData<RespTimesheetPegawai>(url);

  async function simpanHari() {
    if (!sheetIsi || !pegawaiAktif) return;
    setMengirim(true);
    setGalatForm(null);
    try {
      await api.post(`/api/v1/sdm/pegawai/${pegawaiAktif}/timesheet`, {
        tanggal: sheetIsi,
        jam_kerja: Number(form.jam_kerja) || 0,
        jam_lembur: Number(form.jam_lembur) || 0,
        kegiatan: form.kegiatan.trim() || undefined,
      });
      setSheetIsi(null);
      invalidasi(url ?? "");
    } catch (e) {
      setGalatForm(pesanGalat(e as GalatApi, "Gagal menyimpan timesheet"));
    } finally {
      setMengirim(false);
    }
  }

  async function ajukanBulan() {
    if (!pegawaiAktif) return;
    setMengajukan(true);
    setGalatAjukan(null);
    try {
      await api.post(`/api/v1/sdm/pegawai/${pegawaiAktif}/timesheet/ajukan?bulan=${bulan}`);
      invalidasi(url ?? "");
    } catch (e) {
      setGalatAjukan(pesanGalat(e as GalatApi, "Gagal mengajukan timesheet"));
    } finally {
      setMengajukan(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
        Timesheet
      </h1>

      {memuatPegawai && <SkeletonCard tinggi={44} />}
      {!memuatPegawai && galatPegawai && (
        <EmptyState icon={AlertTriangle} judul="Gagal memuat daftar pegawai"
          deskripsi={pesanGalat(galatPegawai as GalatApi, "Coba muat ulang.")} />
      )}
      {!memuatPegawai && !galatPegawai && daftarPegawai.length === 0 && (
        <EmptyState icon={CalendarClock} judul="Belum ada data pegawai" deskripsi="Daftar pegawai kosong." />
      )}

      {daftarPegawai.length > 0 && (
        <div style={{ display: "flex", gap: 8 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Pegawai</span>
            <select value={pegawaiAktif} onChange={(e) => setPegawaiId(e.target.value)}
              style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)" }}>
              {daftarPegawai.map((p) => (
                <option key={p.id} value={p.id}>{p.orang?.name ?? p.nomor_induk ?? p.id}</option>
              ))}
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6, width: 130 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Bulan</span>
            <input type="month" value={bulan} onChange={(e) => setBulan(e.target.value)}
              style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)" }} />
          </label>
        </div>
      )}

      {memuat && <SkeletonCard tinggi={140} />}
      {galat && (
        <EmptyState icon={AlertTriangle} judul="Gagal memuat timesheet" deskripsi={pesanGalat(galat as GalatApi, "Coba muat ulang.")} />
      )}

      {!memuat && !galat && data && (
        <>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <div style={{ background: "var(--surface)", borderRadius: 14, padding: 12, border: "1px solid color-mix(in srgb, var(--border) 40%, transparent)", boxShadow: "var(--naik-1)", flex: "1 1 120px" }}>
              <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Jam Kerja</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: "var(--text-primary)" }}>{data.ringkasan.total_jam_kerja}</div>
            </div>
            <div style={{ background: "var(--surface)", borderRadius: 14, padding: 12, border: "1px solid color-mix(in srgb, var(--border) 40%, transparent)", boxShadow: "var(--naik-1)", flex: "1 1 120px" }}>
              <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Jam Lembur</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: "var(--text-primary)" }}>{data.ringkasan.total_jam_lembur}</div>
            </div>
            <div style={{ background: "var(--surface)", borderRadius: 14, padding: 12, border: "1px solid color-mix(in srgb, var(--border) 40%, transparent)", boxShadow: "var(--naik-1)", flex: "1 1 120px" }}>
              <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Hari Terisi</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: "var(--text-primary)" }}>{data.ringkasan.hari_terisi}</div>
            </div>
          </div>

          {data.ringkasan.per_proyek.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)" }}>Jam per Proyek</div>
              {data.ringkasan.per_proyek.map((p) => (
                <div key={p.project_id ?? "overhead"} style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", borderRadius: 10, background: "var(--surface-subtle)" }}>
                  <span style={{ fontSize: 13, color: "var(--text-primary)" }}>{p.project_id ?? "Overhead Kantor"}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>
                    {p.jam}j{p.lembur > 0 ? ` +${p.lembur}j` : ""}
                  </span>
                </div>
              ))}
            </div>
          )}

          {data.ringkasan.hari_kosong.length > 0 && (
            <div role="status" style={{ fontSize: 12, color: "var(--on-warning-bg)", background: "var(--warning-bg)", border: "1px solid var(--warning-border)", borderRadius: 10, padding: 10 }}>
              {data.ringkasan.hari_kosong.length} hari kerja belum diisi: {data.ringkasan.hari_kosong.slice(0, 5).map(fmtTanggal).join(", ")}
              {data.ringkasan.hari_kosong.length > 5 ? "…" : ""}
            </div>
          )}

          {data.ringkasan.baris.length === 0 && (
            <EmptyState icon={CalendarClock} judul="Belum ada timesheet bulan ini" deskripsi="Pilih hari kerja pada kalender untuk mulai mengisi jam." />
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {data.ringkasan.baris.map((b) => (
              <button key={b.id} type="button" onClick={() => {
                setSheetIsi(b.tanggal);
                setGalatForm(null);
                setForm({ jam_kerja: String(b.jam_kerja_n), jam_lembur: String(b.jam_lembur_n), kegiatan: b.kegiatan ?? "" });
              }}
                disabled={b.status === "disetujui"}
                style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: 12, borderRadius: 12, border: "1px solid var(--border)",
                  background: "var(--surface)", textAlign: "left", cursor: b.status === "disetujui" ? "default" : "pointer",
                  opacity: b.status === "disetujui" ? 0.7 : 1,
                }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{fmtTanggal(b.tanggal)}</div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                    {LABEL_STATUS[b.status]}{b.melebihi_standar ? " · melebihi standar" : ""}{b.di_bawah_standar ? " · di bawah standar" : ""}
                  </div>
                </div>
                <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>
                  {b.jam_kerja_n}j{b.jam_lembur_n > 0 ? ` +${b.jam_lembur_n}j lembur` : ""}
                </span>
              </button>
            ))}
          </div>

          <button type="button" onClick={() => void ajukanBulan()} disabled={mengajukan || !data.pengajuan.boleh}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              minHeight: 48, borderRadius: "var(--portal-radius-pill)", border: "none",
              background: mengajukan || !data.pengajuan.boleh ? "var(--surface-subtle)" : "var(--grad-aksen)",
              color: mengajukan || !data.pengajuan.boleh ? "var(--text-muted)" : "var(--on-navy)",
              fontSize: 14, fontWeight: 700, cursor: mengajukan || !data.pengajuan.boleh ? "default" : "pointer",
            }}>
            <Send size={16} aria-hidden="true" /> {mengajukan ? "Mengajukan…" : "Ajukan Bulan Ini"}
          </button>
          {!data.pengajuan.boleh && data.pengajuan.penghalang.map((p, i) => (
            <div key={`${p.kode}-${i}`} style={{ fontSize: 12, color: "var(--text-secondary)" }}>{p.pesan}</div>
          ))}
          {data.pengajuan.peringatan.map((p, i) => (
            <div key={`${p.kode}-${i}`} style={{ fontSize: 12, color: "var(--text-secondary)" }}>{p.pesan}</div>
          ))}
          {galatAjukan && (
            <div role="alert" style={{ fontSize: 12, color: "var(--on-danger-bg)", padding: 10, borderRadius: 10, background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}>
              {galatAjukan}
            </div>
          )}
        </>
      )}

      <BottomSheet terbuka={!!sheetIsi} onTutup={() => setSheetIsi(null)} judul={sheetIsi ? fmtTanggal(sheetIsi) : "Isi Hari"}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Jam Kerja</span>
            <input type="number" min={0} max={24} value={form.jam_kerja} onChange={(e) => setForm((f) => ({ ...f, jam_kerja: e.target.value }))}
              style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Jam Lembur</span>
            <input type="number" min={0} max={24} value={form.jam_lembur} onChange={(e) => setForm((f) => ({ ...f, jam_lembur: e.target.value }))}
              style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Kegiatan</span>
            <input value={form.kegiatan} onChange={(e) => setForm((f) => ({ ...f, kegiatan: e.target.value }))}
              style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
          </label>
          {galatForm && (
            <div role="alert" style={{ fontSize: 12, color: "var(--on-danger-bg)", padding: 10, borderRadius: 10, background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}>
              {galatForm}
            </div>
          )}
          <button type="button" onClick={() => void simpanHari()} disabled={mengirim}
            style={{
              minHeight: 48, borderRadius: "var(--portal-radius-pill)", border: "none",
              background: mengirim ? "var(--surface-subtle)" : "var(--grad-aksen)",
              color: mengirim ? "var(--text-muted)" : "var(--on-navy)",
              fontSize: 14, fontWeight: 700, cursor: mengirim ? "default" : "pointer",
            }}>
            {mengirim ? "Menyimpan…" : "Simpan"}
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}
