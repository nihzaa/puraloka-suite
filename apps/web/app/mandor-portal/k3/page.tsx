"use client";

// ============================================================================
// K3 Lapangan — insiden, JSA, inspeksi rutin.
//
// ── Kenapa halaman ini butuh pemilih proyek
//
// Endpoint sumber datanya BERBEDA bentuk per tab:
//   · Insiden  → GET /api/v1/k3/insiden?proyek=<id>   (lintas proyek, opsional
//     disaring — dipakai APA ADANYA, tanpa `proyek` untuk melihat semua)
//   · JSA      → GET /api/v1/k3/jsa                   (tak ber-proyek sama sekali)
//   · Inspeksi rutin K3 → BUKAN endpoint tersendiri. Ia bagian dari payload
//     `GET /api/v1/proyek/:id/k3` (field `inspeksi`), yang WAJIB menyebut
//     proyek — tak ada versi lintas-proyeknya.
//
// Karena tab ketiga tak bisa jalan tanpa proyek terpilih, pemilih proyek
// dipasang di seluruh halaman (bukan hanya tab itu) — konsisten lebih mudah
// dipahami daripada UI yang berubah bentuk per tab.
//
// Path endpoint di brief awal (`/api/v1/k3/insiden`, `/api/v1/k3/jsa`,
// `/api/v1/k3/inspeksi` seragam) SEBAGIAN benar: insiden dan JSA memang ada
// di path itu, tapi "inspeksi" sebagai tab berdiri sendiri TIDAK ADA —
// diverifikasi ke `apps/api/src/routes/v1/k3-lapangan.ts`.
// ============================================================================

import { useMemo, useState } from "react";
import { ShieldAlert, Plus, HardHat, ClipboardCheck } from "lucide-react";
import { useData, invalidasi } from "@/lib/data-cache";
import { kirimLapangan } from "@/lib/kirim-lapangan";
import SegmentedTab from "@/components/portal/SegmentedTab";
import BottomSheet from "@/components/portal/BottomSheet";
import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import type { InsidenK3, JsaK3, InspeksiK3, Penugasan, GalatApi } from "../_bersama/tipe";
import { pesanGalat } from "../_bersama/tipe";

interface RespAssignments { assignments: Penugasan[] }
interface RespInsiden { insiden: InsidenK3[]; jumlah: number; terpotong: boolean }
interface RespJsa { jsa: JsaK3[] }
interface RespK3Proyek {
  proyek: { id: string; name: string };
  insiden: InsidenK3[];
  inspeksi: InspeksiK3[];
}

const JENIS_INSIDEN: Array<{ value: string; label: string }> = [
  { value: "nyaris_celaka", label: "Nyaris celaka" },
  { value: "kecelakaan_ringan", label: "Kecelakaan ringan" },
  { value: "kecelakaan_berat", label: "Kecelakaan berat" },
  { value: "fatal", label: "Fatal" },
  { value: "kerusakan_properti", label: "Kerusakan properti" },
  { value: "pencemaran_lingkungan", label: "Pencemaran lingkungan" },
];

/** Status insiden: dilaporkan/diselidiki/tindakan_berjalan/ditutup. */
const VARIAN_STATUS_INSIDEN: Record<string, VarianStatus> = {
  dilaporkan: "pending",
  diselidiki: "pending",
  tindakan_berjalan: "pending",
  ditutup: "approved",
};

function labelStatus(status: string | null | undefined, kamus: Record<string, string>): string {
  if (!status) return "—";
  return kamus[status] ?? status;
}

const LABEL_STATUS_INSIDEN: Record<string, string> = {
  dilaporkan: "Dilaporkan",
  diselidiki: "Diselidiki",
  tindakan_berjalan: "Tindakan berjalan",
  ditutup: "Ditutup",
};

const LABEL_JENIS: Record<string, string> = Object.fromEntries(
  JENIS_INSIDEN.map((j) => [j.value, j.label]),
);

export default function K3Page() {
  const [tab, setTab] = useState<"insiden" | "jsa" | "inspeksi">("insiden");
  const [proyekId, setProyekId] = useState<string>("");
  const [sheetTerbuka, setSheetTerbuka] = useState(false);
  const [jenis, setJenis] = useState("nyaris_celaka");
  const [tanggal, setTanggal] = useState("");
  const [lokasi, setLokasi] = useState("");
  const [kronologi, setKronologi] = useState("");
  const [melukai, setMelukai] = useState(false);
  const [korbanNama, setKorbanNama] = useState("");
  const [mengirim, setMengirim] = useState(false);
  const [galatForm, setGalatForm] = useState<string | null>(null);

  const { data: dataAsg } = useData<RespAssignments>("/api/v1/mandor/assignments");
  const daftarProyek = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of dataAsg?.assignments ?? []) {
      if (a.project?.id) map.set(a.project.id, a.project.name);
    }
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [dataAsg]);

  // Proyek aktif dipilih otomatis begitu daftarnya tersedia — mandor
  // umumnya hanya punya satu penugasan aktif, dan memaksa pilih manual
  // untuk kasus paling umum hanya menambah gesekan.
  const proyekAktif = proyekId || daftarProyek[0]?.id || "";

  const urlInsiden = "/api/v1/k3/insiden" + (proyekAktif ? `?proyek=${proyekAktif}` : "");
  const {
    data: dataInsiden, memuat: memuatInsiden, galat: galatInsiden,
  } = useData<RespInsiden>(tab === "insiden" ? urlInsiden : null);

  const {
    data: dataJsa, memuat: memuatJsa, galat: galatJsa,
  } = useData<RespJsa>(tab === "jsa" ? "/api/v1/k3/jsa" : null);

  const urlK3Proyek = proyekAktif ? `/api/v1/proyek/${proyekAktif}/k3` : null;
  const {
    data: dataK3Proyek, memuat: memuatInspeksi, galat: galatInspeksi,
  } = useData<RespK3Proyek>(tab === "inspeksi" ? urlK3Proyek : null);

  async function submitInsiden() {
    if (!proyekAktif) {
      setGalatForm("Pilih proyek terlebih dahulu.");
      return;
    }
    setMengirim(true);
    setGalatForm(null);
    const hasil = await kirimLapangan(
      "POST",
      `/api/v1/proyek/${proyekAktif}/k3/insiden`,
      {
        jenis,
        tanggal: tanggal || undefined,
        lokasi: lokasi.trim() || undefined,
        kronologi: kronologi.trim(),
        melukai,
        korban_nama: melukai ? korbanNama.trim() || undefined : undefined,
      },
      "Insiden dilaporkan",
      "Gagal melapor insiden",
    );
    setMengirim(false);
    if (!hasil.aman) {
      setGalatForm(hasil.pesan);
      return;
    }
    setSheetTerbuka(false);
    setJenis("nyaris_celaka");
    setTanggal("");
    setLokasi("");
    setKronologi("");
    setMelukai(false);
    setKorbanNama("");
    invalidasi("/api/v1/k3/insiden");
    invalidasi(`/api/v1/proyek/${proyekAktif}/k3`);
  }

  const kronologiValid = kronologi.trim().length >= 10;
  const korbanValid = !melukai || korbanNama.trim().length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
        K3 Lapangan
      </h1>

      {daftarProyek.length > 1 && (
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Proyek</span>
          <select
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
          </select>
        </label>
      )}

      <SegmentedTab
        opsi={[
          { value: "insiden", label: "Insiden" },
          { value: "jsa", label: "JSA" },
          { value: "inspeksi", label: "Inspeksi" },
        ]}
        aktif={tab}
        onUbah={(v) => setTab(v as typeof tab)}
      />

      {tab === "insiden" && (
        <button
          onClick={() => setSheetTerbuka(true)}
          disabled={!proyekAktif}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            padding: 14, borderRadius: "var(--portal-radius-pill)",
            background: "var(--grad-merek)", color: "var(--on-navy)",
            border: "none", fontSize: 14, fontWeight: 700,
            cursor: proyekAktif ? "pointer" : "default",
            opacity: proyekAktif ? 1 : 0.5,
          }}
        >
          <Plus size={18} aria-hidden="true" /> Lapor Insiden
        </button>
      )}

      {tab === "insiden" && (
        <>
          {memuatInsiden && <SkeletonCard tinggi={80} />}
          {galatInsiden && (
            <EmptyState
              icon={ShieldAlert}
              judul="Gagal memuat insiden"
              deskripsi={pesanGalat(galatInsiden as GalatApi, "Coba muat ulang halaman ini.")}
            />
          )}
          {!memuatInsiden && !galatInsiden && (dataInsiden?.insiden?.length ?? 0) === 0 && (
            <EmptyState
              icon={ShieldAlert}
              judul="Belum ada insiden tercatat"
              deskripsi="Insiden K3 yang Anda laporkan akan muncul di sini, lengkap dengan status penanganannya."
            />
          )}
          {!memuatInsiden && (dataInsiden?.insiden ?? []).map((item) => (
            <div
              key={item.id}
              style={{
                padding: 16, borderRadius: 16, background: "var(--surface)",
                border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 8,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
                    {labelStatus(item.jenis, LABEL_JENIS)}
                  </span>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                    {item.tanggal ?? "—"}{item.lokasi ? ` · ${item.lokasi}` : ""}
                  </div>
                </div>
                <StatusBadge
                  status={VARIAN_STATUS_INSIDEN[item.status ?? ""] ?? "netral"}
                  label={labelStatus(item.status, LABEL_STATUS_INSIDEN)}
                />
              </div>
              {item.kronologi && (
                <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{item.kronologi}</div>
              )}
              {item.melukai && (
                <StatusBadge status="rejected" label={`Melukai${item.korban_nama ? ` — ${item.korban_nama}` : ""}`} />
              )}
            </div>
          ))}
        </>
      )}

      {tab === "jsa" && (
        <>
          {memuatJsa && <SkeletonCard tinggi={80} />}
          {galatJsa && (
            <EmptyState
              icon={HardHat}
              judul="Gagal memuat JSA"
              deskripsi={pesanGalat(galatJsa as GalatApi, "Coba muat ulang halaman ini.")}
            />
          )}
          {!memuatJsa && !galatJsa && (dataJsa?.jsa?.length ?? 0) === 0 && (
            <EmptyState
              icon={HardHat}
              judul="Belum ada Job Safety Analysis"
              deskripsi="JSA yang berlaku untuk pekerjaan Anda akan tampil di sini, lengkap dengan langkah dan pengendalian bahayanya."
            />
          )}
          {!memuatJsa && (dataJsa?.jsa ?? []).map((item) => (
            <div
              key={item.id}
              style={{
                padding: 16, borderRadius: 16, background: "var(--surface)",
                border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 8,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
                    {item.jenis_pekerjaan ?? "—"}
                  </span>
                  {item.kode && (
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>{item.kode}</div>
                  )}
                </div>
                <StatusBadge
                  status={item.berlaku ? "approved" : "netral"}
                  label={item.berlaku ? "Berlaku" : "Tidak berlaku"}
                />
              </div>
              {item.uraian && (
                <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{item.uraian}</div>
              )}
            </div>
          ))}
        </>
      )}

      {tab === "inspeksi" && (
        <>
          {!proyekAktif && (
            <EmptyState
              icon={ClipboardCheck}
              judul="Pilih proyek"
              deskripsi="Inspeksi rutin K3 tercatat per proyek — pilih proyek untuk melihatnya."
            />
          )}
          {proyekAktif && memuatInspeksi && <SkeletonCard tinggi={80} />}
          {proyekAktif && galatInspeksi && (
            <EmptyState
              icon={ClipboardCheck}
              judul="Gagal memuat inspeksi"
              deskripsi={pesanGalat(galatInspeksi as GalatApi, "Coba muat ulang halaman ini.")}
            />
          )}
          {proyekAktif && !memuatInspeksi && !galatInspeksi && (dataK3Proyek?.inspeksi?.length ?? 0) === 0 && (
            <EmptyState
              icon={ClipboardCheck}
              judul="Belum ada inspeksi K3 rutin"
              deskripsi="Inspeksi rutin K3 di proyek ini (area, temuan, pemeriksa) akan muncul di sini."
            />
          )}
          {proyekAktif && !memuatInspeksi && (dataK3Proyek?.inspeksi ?? []).map((item) => (
            <div
              key={item.id}
              style={{
                padding: 16, borderRadius: 16, background: "var(--surface)",
                border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 6,
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
                {item.area ?? item.nomor ?? "Inspeksi"}
              </span>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                {item.tanggal ?? "—"}{item.pemeriksa_nama ? ` · ${item.pemeriksa_nama}` : ""}
              </div>
              {item.ringkasan && (
                <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{item.ringkasan}</div>
              )}
            </div>
          ))}
        </>
      )}

      <BottomSheet terbuka={sheetTerbuka} onTutup={() => setSheetTerbuka(false)} judul="Lapor Insiden K3">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Jenis insiden
            <select
              value={jenis}
              onChange={(e) => setJenis(e.target.value)}
              style={{
                width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12,
                border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)",
                color: "var(--text-primary)",
              }}
            >
              {JENIS_INSIDEN.map((j) => (
                <option key={j.value} value={j.value}>{j.label}</option>
              ))}
            </select>
          </label>

          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Tanggal (kosongkan untuk hari ini)
            <input
              type="date"
              value={tanggal}
              onChange={(e) => setTanggal(e.target.value)}
              max={new Date().toISOString().slice(0, 10)}
              style={{
                width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12,
                border: "1px solid var(--border)", fontSize: 14,
              }}
            />
          </label>

          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Lokasi
            <input
              type="text"
              value={lokasi}
              onChange={(e) => setLokasi(e.target.value)}
              placeholder="mis. Lantai 3 area kolom"
              style={{
                width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12,
                border: "1px solid var(--border)", fontSize: 14,
              }}
            />
          </label>

          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Kronologi kejadian (minimal 10 huruf)
            <textarea
              value={kronologi}
              onChange={(e) => setKronologi(e.target.value)}
              rows={4}
              style={{
                width: "100%", marginTop: 6, padding: 12, borderRadius: 12,
                border: "1px solid var(--border)", fontSize: 14, fontFamily: "inherit",
              }}
            />
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, color: "var(--text-primary)", minHeight: 44 }}>
            <input
              type="checkbox"
              checked={melukai}
              onChange={(e) => setMelukai(e.target.checked)}
              style={{ width: 20, height: 20 }}
            />
            Ada korban terluka
          </label>

          {melukai && (
            <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
              Nama korban
              <input
                type="text"
                value={korbanNama}
                onChange={(e) => setKorbanNama(e.target.value)}
                style={{
                  width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12,
                  border: "1px solid var(--border)", fontSize: 14,
                }}
              />
            </label>
          )}

          {galatForm && <div style={{ fontSize: 12, color: "var(--danger)" }}>{galatForm}</div>}

          <button
            onClick={submitInsiden}
            disabled={mengirim || !kronologiValid || !korbanValid}
            style={{
              padding: 14, borderRadius: "var(--portal-radius-pill)",
              background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none",
              fontSize: 14, fontWeight: 700, cursor: mengirim ? "default" : "pointer",
              opacity: mengirim || !kronologiValid || !korbanValid ? 0.5 : 1,
            }}
          >
            {mengirim ? "Mengirim…" : "Kirim Laporan"}
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}
