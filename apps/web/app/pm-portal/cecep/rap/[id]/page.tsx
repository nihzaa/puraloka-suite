"use client";

// ============================================================================
// RAP — detail: total pagu, baris material (qty_ahsp beku vs qty_adjusted
// bisa disunting via BottomSheet HANYA saat status !== 'locked'), baris
// tenaga kerja/borongan, dan tombol "Kunci RAP" (Tahap 3, Task 20).
//
// ── Kunci itu TAK BISA DIBATALKAN — dan backend TEGAS soal itu
//
// `PATCH /rap/:id/lock` (`rap.ts:326-385`) tak punya jalur buka kunci sama
// sekali — sekali `status = 'locked'`, satu-satunya cara mengubah pagu adalah
// `POST /rap/:id/change-log` beralasan wajib (dicatat, bukan menimpa angka).
// Karena itu tombol Kunci di sini pakai dialog konfirmasi ketik-ulang
// ("KUNCI"), bukan tombol langsung — pola sama peringatan "tak bisa
// dibatalkan" yang lain di portal ini.
//
// ── `--on-warning` TIDAK ADA di globals.css — diperiksa sebelum dipakai
//
// Brief awal task ini menulis `color: "var(--on-warning)"` untuk teks tombol
// Kunci (latar solid `--warning`). Token itu diperiksa langsung ke
// `app/globals.css` — TIDAK ADA (hanya `--on-warning-bg`, dirancang untuk
// teks DI ATAS `--warning-bg` yang muda, bukan di atas `--warning` yang
// pekat). Pola yang SUDAH dipakai di repo untuk tombol solid warna gelap
// (`--danger`, `--warning`) + teks terang adalah `--on-navy` (putih) — lihat
// `kontrak-lengkap/register/page.tsx:360` (tombol `--danger` + `--on-navy`).
// `--warning` (#B45309) diukur 5,02:1 terhadap putih — lolos AA. Dipakai di
// sini, bukan token yang tak pernah ada.
//
// Bentuk `RespRapDetail`/`RapMaterialLine`/`RapLaborLine` diverifikasi PERSIS
// ke `apps/api/src/routes/v1/rap.ts:213-236` untuk Task 20, langsung ke kode.
// ============================================================================

import { useState } from "react";
import { useParams } from "next/navigation";
import { Wallet, Lock, Pencil } from "lucide-react";
import { useData, invalidasi } from "@/lib/data-cache";
import { api } from "@/lib/api";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import StatusBadge from "@/components/portal/StatusBadge";
import BottomSheet from "@/components/portal/BottomSheet";
import type { RespRapDetail, RapMaterialLine, GalatApi } from "../../../_bersama/tipe";
import { pesanGalat } from "../../../_bersama/tipe";

function fmtRupiah(v: number | string | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const n = typeof v === "string" ? Number(v) : v;
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}

export default function PmRapDetailPage() {
  const params = useParams<{ id: string }>();
  const rapId = params.id;

  const [sheetTerbuka, setSheetTerbuka] = useState(false);
  const [baris, setBaris] = useState<RapMaterialLine | null>(null);
  const [qtyBaru, setQtyBaru] = useState("");
  const [alasan, setAlasan] = useState("");
  const [sheetKunciTerbuka, setSheetKunciTerbuka] = useState(false);
  const [konfirmasiKunci, setKonfirmasiKunci] = useState("");
  const [mengirim, setMengirim] = useState(false);
  const [mengunci, setMengunci] = useState(false);
  const [galatAksi, setGalatAksi] = useState<string | null>(null);

  const url = `/api/v1/rap/${rapId}`;
  const { data, memuat, galat: galatMuat } = useData<RespRapDetail>(url);
  const galat = galatMuat ? pesanGalat(galatMuat as GalatApi, "RAP tidak ditemukan.") : null;

  function bukaEdit(m: RapMaterialLine) {
    setBaris(m);
    setQtyBaru(String(m.qty_adjusted));
    setAlasan("");
    setGalatAksi(null);
    setSheetTerbuka(true);
  }

  async function simpanQty() {
    if (!baris) return;
    if (!qtyBaru || Number(qtyBaru) < 0) {
      setGalatAksi("Kuantitas wajib angka >= 0.");
      return;
    }
    if (alasan.trim().length < 5) {
      setGalatAksi("Alasan perubahan minimal 5 karakter — dicatat di riwayat.");
      return;
    }
    setMengirim(true);
    setGalatAksi(null);
    try {
      await api.patch(`/api/v1/rap/${rapId}/material/${baris.id}`, {
        qty_adjusted: Number(qtyBaru),
      });
      await api.post(`/api/v1/rap/${rapId}/change-log`, {
        line_table: "rap_material_line",
        line_id: baris.id,
        field_name: "qty_adjusted",
        old_value: String(baris.qty_adjusted),
        new_value: qtyBaru,
        reason: alasan.trim(),
      });
      setSheetTerbuka(false);
      invalidasi(url);
    } catch (e) {
      setGalatAksi(pesanGalat(e as GalatApi, "Gagal menyimpan perubahan"));
    } finally {
      setMengirim(false);
    }
  }

  async function kunciRap() {
    if (konfirmasiKunci !== "KUNCI") {
      setGalatAksi('Ketik "KUNCI" untuk mengonfirmasi — tindakan ini tak bisa dibatalkan.');
      return;
    }
    setMengunci(true);
    setGalatAksi(null);
    try {
      await api.patch(`/api/v1/rap/${rapId}/lock`);
      setSheetKunciTerbuka(false);
      invalidasi(url);
    } catch (e) {
      setGalatAksi(pesanGalat(e as GalatApi, "Gagal mengunci RAP"));
    } finally {
      setMengunci(false);
    }
  }

  if (memuat) return <SkeletonCard tinggi={200} />;
  if (galat || !data) {
    return <EmptyState icon={Wallet} judul="Gagal memuat" deskripsi={galat ?? "RAP tidak ditemukan."} />;
  }

  const terkunci = data.data.status === "locked";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
      <div>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>{data.data.name}</h1>
        <div style={{ marginTop: 4 }}>
          <StatusBadge status={terkunci ? "approved" : "netral"} label={terkunci ? "Terkunci" : "Draf"} />
        </div>
      </div>

      <div
        style={{
          padding: "var(--pad-kartu)",
          borderRadius: "var(--portal-radius-card)",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Material</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{fmtRupiah(data.total.material)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Tenaga kerja</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{fmtRupiah(data.total.labor)}</span>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            paddingTop: 6,
            borderTop: "1px solid var(--border)",
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>Total pagu</span>
          <span style={{ fontSize: 18, fontWeight: 700, color: "var(--navy)" }}>{fmtRupiah(data.total.pagu)}</span>
        </div>
      </div>

      {galatAksi && !sheetTerbuka && !sheetKunciTerbuka && (
        <div
          role="alert"
          style={{ padding: 10, borderRadius: 10, background: "var(--danger-bg)", color: "var(--on-danger-bg)", fontSize: 12 }}
        >
          {galatAksi}
        </div>
      )}

      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-secondary)" }}>Material</div>
      {data.material.length === 0 && (
        <EmptyState icon={Wallet} judul="Belum ada baris material" deskripsi="RAP ini belum punya pagu material." />
      )}
      {data.material.map((m) => (
        <div
          key={m.id}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
            padding: "var(--pad-kartu)",
            borderRadius: "var(--portal-radius-card)",
            background: "var(--surface)",
            border: "1px solid var(--border)",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{m.resource?.name ?? "—"}</div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
              {m.qty_adjusted} {m.unit_code} · {fmtRupiah(m.supplier_price)}/{m.unit_code}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--navy)" }}>{fmtRupiah(m.pagu)}</div>
            {!terkunci && (
              <button
                type="button"
                onClick={() => bukaEdit(m)}
                aria-label={`Ubah kuantitas ${m.resource?.name ?? ""}`}
                style={{
                  minHeight: 32,
                  minWidth: 32,
                  borderRadius: 8,
                  background: "var(--surface-subtle)",
                  border: "none",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Pencil size={13} color="var(--text-secondary)" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      ))}

      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-secondary)" }}>Tenaga kerja / borongan</div>
      {data.labor.length === 0 && (
        <EmptyState icon={Wallet} judul="Belum ada baris tenaga kerja" deskripsi="RAP ini belum punya pagu borongan." />
      )}
      {data.labor.map((l) => (
        <div
          key={l.id}
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "var(--pad-kartu)",
            borderRadius: "var(--portal-radius-card)",
            background: "var(--surface)",
            border: "1px solid var(--border)",
          }}
        >
          <div style={{ fontSize: 13, color: "var(--text-primary)" }}>{l.description}</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--navy)" }}>{fmtRupiah(l.borongan_value)}</div>
        </div>
      ))}

      {!terkunci && (
        <button
          type="button"
          onClick={() => {
            setKonfirmasiKunci("");
            setGalatAksi(null);
            setSheetKunciTerbuka(true);
          }}
          style={{
            minHeight: 48,
            borderRadius: "var(--portal-radius-pill)",
            background: "var(--warning)",
            color: "var(--on-navy)",
            border: "none",
            fontSize: 14,
            fontWeight: 700,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          <Lock size={16} aria-hidden="true" /> Kunci RAP
        </button>
      )}

      <BottomSheet terbuka={sheetTerbuka} onTutup={() => setSheetTerbuka(false)} judul={`Ubah — ${baris?.resource?.name ?? ""}`}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Kuantitas baru ({baris?.unit_code})</span>
            <input
              type="number"
              value={qtyBaru}
              onChange={(e) => setQtyBaru(e.target.value)}
              style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Alasan perubahan</span>
            <textarea
              value={alasan}
              onChange={(e) => setAlasan(e.target.value)}
              rows={3}
              style={{ padding: 12, borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }}
            />
          </label>
          {galatAksi && (
            <div role="alert" style={{ fontSize: 12, color: "var(--danger)" }}>
              {galatAksi}
            </div>
          )}
          <button
            type="button"
            onClick={simpanQty}
            disabled={mengirim}
            style={{
              minHeight: 48,
              borderRadius: "var(--portal-radius-pill)",
              background: "var(--grad-aksen)",
              color: "var(--on-navy)",
              border: "none",
              fontSize: 14,
              fontWeight: 700,
              cursor: mengirim ? "wait" : "pointer",
            }}
          >
            {mengirim ? "Menyimpan…" : "Simpan"}
          </button>
        </div>
      </BottomSheet>

      <BottomSheet terbuka={sheetKunciTerbuka} onTutup={() => setSheetKunciTerbuka(false)} judul="Kunci RAP — tak bisa dibatalkan">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <p style={{ fontSize: 13, color: "var(--text-primary)", margin: 0 }}>
            Setelah dikunci, kuantitas tak bisa diubah langsung — hanya lewat riwayat perubahan beralasan. Tak ada jalur buka
            kunci.
          </p>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Ketik KUNCI untuk konfirmasi</span>
            <input
              value={konfirmasiKunci}
              onChange={(e) => setKonfirmasiKunci(e.target.value)}
              style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }}
            />
          </label>
          {galatAksi && (
            <div role="alert" style={{ fontSize: 12, color: "var(--danger)" }}>
              {galatAksi}
            </div>
          )}
          <button
            type="button"
            onClick={kunciRap}
            disabled={mengunci}
            style={{
              minHeight: 48,
              borderRadius: "var(--portal-radius-pill)",
              background: "var(--warning)",
              color: "var(--on-navy)",
              border: "none",
              fontSize: 14,
              fontWeight: 700,
              cursor: mengunci ? "wait" : "pointer",
            }}
          >
            {mengunci ? "Mengunci…" : "Kunci Sekarang"}
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}
