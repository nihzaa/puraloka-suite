"use client";

// ============================================================================
// Kendali Dokumen — Portal PM (Task 42, Tahap 7).
//
// Lima tab: Gambar (register + revisi usang), Transmittal (bukti serah
// dokumen + kirim/terima), Tindakan (butir notulen rapat gabungan, BUKAN
// per-notulen — lebih berguna untuk PM yang mengejar tenggat), Tanda
// Tangan (elektronik + verifikasi keutuhan isi), dan Distribusi (matriks
// penerima per jenis dokumen, READ-ONLY — nol endpoint tulis untuk
// `matriks_distribusi` di seluruh `kendali-dokumen.ts`, dikonfirmasi grep:
// kedua pemakaiannya SELECT, satu di sini dan satu di `kirim-laporan`).
//
// Tab Distribusi DITAMBAHKAN Task 45 (verifikasi akhir) — utang eksplisit
// dari Task 44: data `distribusi: MatriksDistribusiPM[]` sudah dikirim
// `RespKendaliDokumen` sejak Task 42, tapi UI-nya belum menampilkannya
// sebagai tab. Diukur ringan (tipe sudah lengkap, read-only, pola sama
// tab Tindakan) sehingga ditambahkan sekarang alih-alih dibiarkan sebagai
// utang lebih lanjut.
//
// SATU panggilan `GET /api/v1/kendali-dokumen?project_id=` mengembalikan
// seluruh sub-modul sekaligus (`lib/kendali-dokumen.ts:41-148`) — dipecah jadi
// beberapa endpoint akan membuat "gambar usang" (perbandingan LINTAS baris)
// dan status lain terlihat dari titik waktu yang berbeda-beda.
//
// ⚠️ MODUL TERPISAH dari `pm-portal/dokumen/page.tsx` (Register Dokumen,
// `dk-register`) yang SUDAH ADA sebelum Portal PM Lengkap dimulai — itu hanya
// memanggil `GET /projects/:id/documents`, tak menyentuh `kendali-dokumen.ts`
// sama sekali. Halaman ini route BARU supaya tak menimpa yang existing.
//
// ⚠️ Tab "Tindakan" READ-ONLY. Nol PATCH/POST untuk `notulen_tindakan` di
// seluruh `kendali-dokumen.ts` — tak ada endpoint mengubah status butir
// tindakan, jadi tak ada tombol "Selesaikan" di sini.
//
// ⚠️ Tak ada tombol "Kirim Sekarang" untuk jadwal laporan. Endpoint yang
// mengirim sungguhan (`GET /kendali-dokumen/kirim-laporan`) bergerbang
// `notifications:milestone:check` — diverifikasi lewat query DB LIVE
// (dipisah per role_id, bukan digabung): KEDUA baris role `pm` (global
// company_id NULL, dan tenant 48befb54-...) NOL baris grant untuk kunci itu.
// Endpoint tulis LAIN di berkas yang sama (gambar/transmittal/kirim/terima/
// notulen/tanda-tangan/verifikasi) semuanya bergerbang `documents:manage`,
// yang PM PUNYA PENUH di kedua role_id — satu berkas route bisa punya
// gerbang permission berbeda per-endpoint. Karena semua aksi di halaman ini
// adalah CRUD dasar yang PM pasti punya (bukan approve/reject/decide
// berbasis approval bertingkat), pola `hasPermission()` +
// `useSyncExternalStore` (rujukan `pm-portal/cecep/rab/[id]/page.tsx`) tidak
// diperlukan — tak ada tombol keputusan yang bisa salah gerbang di sini.
//
// ⚠️ KETERBATASAN BACKEND (bukan cacat frontend, dicatat sebagai utang Task
// 45): tab "Tindakan" dan "Tanda Tangan" menampilkan data SELURUH tenant,
// bukan hanya proyek yang dipilih — endpoint tak menyaring `tindakan`/
// `tandaTangan` ke `project_id` (lihat komentar `RespKendaliDokumen` di
// `_bersama/tipe.ts`). Tak bisa diperbaiki di klien: field `project_id`
// tak dikirim di kedua bentuk baris ini.
//
// Galat MUAT dan galat AKSI (`galatForm`) dipisah — pola konsisten seluruh
// Tahap 2-7: gagal simpan tak boleh menghapus pesan gagal muat.
// ============================================================================

import { useMemo, useState } from "react";
import { FileImage, Send, ClipboardList, PenTool, Plus, AlertTriangle, Users } from "lucide-react";
import { useData, invalidasi } from "@/lib/data-cache";
import { api } from "@/lib/api";
import { formatTanggalJam } from "@/lib/format";
import EmptyState from "@/components/portal/EmptyState";
import KepalaPortal from "@/components/portal/KepalaPortal";
import SkeletonCard from "@/components/portal/SkeletonCard";
import SegmentedTab from "@/components/portal/SegmentedTab";
import BottomSheet from "@/components/portal/BottomSheet";
import StatusBadge from "@/components/portal/StatusBadge";
import type { ProyekPM, RespKendaliDokumen, RespVerifikasiTtd, GalatApi } from "../_bersama/tipe";
import { pesanGalat } from "../_bersama/tipe";
import { Pilihan } from "@/components/pilihan";

interface RespProyek { projects: ProyekPM[] }

type Tab = "gambar" | "transmittal" | "notulen" | "ttd" | "distribusi";
type Sheet = "gambar" | "transmittal" | "notulen" | "ttd-buat" | "ttd-verifikasi" | null;

export default function PmDokumenKendaliPage() {
  const [proyekId, setProyekId] = useState("");
  const [tab, setTab] = useState<Tab>("gambar");
  const [sheet, setSheet] = useState<Sheet>(null);
  const [formGambar, setFormGambar] = useState({ nomor: "", judul: "", disiplin: "arsitektur", revisi: "0" });
  const [formTransmittal, setFormTransmittal] = useState({ nomor: "", perihal: "", tujuan_nama: "", uraianItem: "" });
  const [formNotulen, setFormNotulen] = useState({ nomor: "", judul: "", jenis: "mingguan" });
  const [formTtd, setFormTtd] = useState({ jenis_objek: "notulen", objek_id: "", isi: "" });
  const [hasilVerifikasi, setHasilVerifikasi] = useState<RespVerifikasiTtd | null>(null);
  const [mengirim, setMengirim] = useState(false);
  const [galatForm, setGalatForm] = useState<string | null>(null);

  const { data: dataProyek } = useData<RespProyek>("/api/v1/projects");
  const daftarProyek = useMemo(() => (dataProyek?.projects ?? []).filter((p) => p.pm), [dataProyek]);
  const proyekAktif = proyekId || daftarProyek[0]?.id || "";

  const url = proyekAktif ? `/api/v1/kendali-dokumen?project_id=${proyekAktif}` : null;
  const { data, memuat, galat } = useData<RespKendaliDokumen>(url);

  function bukaSheet(s: Sheet) {
    setSheet(s);
    setGalatForm(null);
  }

  async function buatGambar() {
    if (!proyekAktif || !formGambar.nomor.trim() || !formGambar.judul.trim()) {
      setGalatForm("Nomor dan judul gambar wajib diisi.");
      return;
    }
    setMengirim(true);
    setGalatForm(null);
    try {
      await api.post("/api/v1/kendali-dokumen/gambar", {
        project_id: proyekAktif,
        nomor: formGambar.nomor.trim(),
        judul: formGambar.judul.trim(),
        disiplin: formGambar.disiplin,
        revisi: Number(formGambar.revisi) || 0,
      });
      setSheet(null);
      setFormGambar({ nomor: "", judul: "", disiplin: "arsitektur", revisi: "0" });
      invalidasi(url ?? "");
    } catch (e) {
      setGalatForm(pesanGalat(e as GalatApi, "Gagal menyimpan gambar"));
    } finally {
      setMengirim(false);
    }
  }

  async function buatTransmittal() {
    if (!proyekAktif || !formTransmittal.nomor.trim() || !formTransmittal.perihal.trim() || !formTransmittal.tujuan_nama.trim()) {
      setGalatForm("Nomor, perihal, dan tujuan wajib diisi.");
      return;
    }
    setMengirim(true);
    setGalatForm(null);
    try {
      await api.post("/api/v1/kendali-dokumen/transmittal", {
        project_id: proyekAktif,
        nomor: formTransmittal.nomor.trim(),
        perihal: formTransmittal.perihal.trim(),
        tujuan_nama: formTransmittal.tujuan_nama.trim(),
        items: [{ uraian: formTransmittal.uraianItem.trim() || "Dokumen terlampir" }],
      });
      setSheet(null);
      setFormTransmittal({ nomor: "", perihal: "", tujuan_nama: "", uraianItem: "" });
      invalidasi(url ?? "");
    } catch (e) {
      setGalatForm(pesanGalat(e as GalatApi, "Gagal menyimpan transmittal"));
    } finally {
      setMengirim(false);
    }
  }

  async function kirimTransmittal(id: string) {
    try {
      await api.patch(`/api/v1/kendali-dokumen/transmittal/${id}/kirim`, {});
      invalidasi(url ?? "");
    } catch (e) {
      setGalatForm(pesanGalat(e as GalatApi, "Gagal menandai terkirim"));
    }
  }
  async function terimaTransmittal(id: string) {
    try {
      await api.patch(`/api/v1/kendali-dokumen/transmittal/${id}/terima`, {});
      invalidasi(url ?? "");
    } catch (e) {
      setGalatForm(pesanGalat(e as GalatApi, "Gagal menandai diterima"));
    }
  }

  async function buatNotulen() {
    if (!proyekAktif || !formNotulen.nomor.trim() || !formNotulen.judul.trim()) {
      setGalatForm("Nomor dan judul notulen wajib diisi.");
      return;
    }
    setMengirim(true);
    setGalatForm(null);
    try {
      await api.post("/api/v1/kendali-dokumen/notulen", {
        project_id: proyekAktif,
        nomor: formNotulen.nomor.trim(),
        judul: formNotulen.judul.trim(),
        jenis: formNotulen.jenis,
      });
      setSheet(null);
      setFormNotulen({ nomor: "", judul: "", jenis: "mingguan" });
      invalidasi(url ?? "");
    } catch (e) {
      setGalatForm(pesanGalat(e as GalatApi, "Gagal menyimpan notulen"));
    } finally {
      setMengirim(false);
    }
  }

  async function tandaTangani() {
    if (!formTtd.objek_id.trim() || !formTtd.isi.trim()) {
      setGalatForm("Objek dan isi wajib diisi.");
      return;
    }
    setMengirim(true);
    setGalatForm(null);
    try {
      await api.post("/api/v1/kendali-dokumen/tanda-tangan", formTtd);
      setSheet(null);
      setFormTtd({ jenis_objek: "notulen", objek_id: "", isi: "" });
      invalidasi(url ?? "");
    } catch (e) {
      setGalatForm(pesanGalat(e as GalatApi, "Gagal menandatangani"));
    } finally {
      setMengirim(false);
    }
  }

  async function verifikasiTtd() {
    if (!formTtd.objek_id.trim() || !formTtd.isi.trim()) {
      setGalatForm("Objek dan isi wajib diisi.");
      return;
    }
    setMengirim(true);
    setGalatForm(null);
    setHasilVerifikasi(null);
    try {
      const resp = await api.post<RespVerifikasiTtd>("/api/v1/kendali-dokumen/tanda-tangan/verifikasi", formTtd);
      setHasilVerifikasi(resp.data);
    } catch (e) {
      setGalatForm(pesanGalat(e as GalatApi, "Gagal memverifikasi"));
    } finally {
      setMengirim(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
      <KepalaPortal judul="Kendali Dokumen" />

      {daftarProyek.length > 1 && (
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Proyek</span>
          <Pilihan
            value={proyekAktif}
            onChange={(e) => setProyekId(e.target.value)}
            style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)" }}
          >
            {daftarProyek.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Pilihan>
        </label>
      )}

      {!proyekAktif && (
        <EmptyState icon={FileImage} judul="Pilih proyek" deskripsi="Kendali dokumen tercatat per proyek." />
      )}

      {proyekAktif && (
        <>
          <SegmentedTab
            opsi={[
              { value: "gambar", label: "Gambar" },
              { value: "transmittal", label: "Transmittal" },
              { value: "notulen", label: "Tindakan" },
              { value: "ttd", label: "Tanda Tangan" },
              { value: "distribusi", label: "Distribusi" },
            ]}
            aktif={tab}
            onUbah={(v) => setTab(v as Tab)}
          />

          {memuat && <SkeletonCard tinggi={140} />}
          {!memuat && galat && (
            <EmptyState icon={AlertTriangle} judul="Gagal memuat" deskripsi={pesanGalat(galat as GalatApi, "Coba muat ulang.")} />
          )}

          {!memuat && !galat && data && tab === "gambar" && (
            <>
              <button
                type="button"
                onClick={() => bukaSheet("gambar")}
                style={{ display: "flex", alignItems: "center", gap: 4, padding: "8px 14px", borderRadius: "var(--portal-radius-pill)", border: "none", background: "var(--grad-aksen)", color: "var(--on-navy)", fontSize: 13, fontWeight: 700, cursor: "pointer", minHeight: 40, alignSelf: "flex-start" }}
              >
                <Plus size={16} aria-hidden="true" /> Gambar
              </button>
              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ background: "var(--surface)", borderRadius: 14, padding: 12, border: "1px solid color-mix(in srgb, var(--border) 40%, transparent)", boxShadow: "var(--naik-1)", flex: 1 }}>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Judul Unik</div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: "var(--text-primary)" }}>{data.gambar.jumlahJudul}</div>
                </div>
                <div style={{ background: "var(--surface)", borderRadius: 14, padding: 12, border: "1px solid color-mix(in srgb, var(--border) 40%, transparent)", boxShadow: "var(--naik-1)", flex: 1 }}>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Usang</div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: data.gambar.usang > 0 ? "var(--danger)" : "var(--text-primary)" }}>
                    {data.gambar.usang}
                  </div>
                </div>
              </div>
              {data.gambar.gambar.length === 0 && (
                <EmptyState icon={FileImage} judul="Belum ada gambar" deskripsi="Register gambar kerja akan muncul di sini." />
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {data.gambar.gambar.map((g) => (
                  <div
                    key={g.id}
                    style={{ background: "var(--surface)", borderRadius: 12, padding: 12, border: `1px solid ${g.usang ? "var(--danger-border)" : "var(--border)"}` }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{g.nomor} — {g.judul ?? "—"}</span>
                      {g.usang && <StatusBadge status="rejected" label="Usang" />}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                      Rev.{g.revisi} (tertinggi: {g.revisiTertinggi}) · {g.disiplin ?? "—"}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {!memuat && !galat && data && tab === "transmittal" && (
            <>
              <button
                type="button"
                onClick={() => bukaSheet("transmittal")}
                style={{ display: "flex", alignItems: "center", gap: 4, padding: "8px 14px", borderRadius: "var(--portal-radius-pill)", border: "none", background: "var(--grad-aksen)", color: "var(--on-navy)", fontSize: 13, fontWeight: 700, cursor: "pointer", minHeight: 40, alignSelf: "flex-start" }}
              >
                <Plus size={16} aria-hidden="true" /> Transmittal
              </button>
              {data.transmittal.menggantung > 0 && (
                <div role="alert" style={{ fontSize: 12, color: "var(--on-warning-bg)", background: "var(--warning-bg)", border: "1px solid var(--warning-border)", borderRadius: 10, padding: 10 }}>
                  {data.transmittal.menggantung} transmittal menggantung (dikirim ≥7 hari tanpa konfirmasi terima).
                </div>
              )}
              {data.transmittal.transmittal.length === 0 && (
                <EmptyState icon={Send} judul="Belum ada transmittal" deskripsi="Bukti serah dokumen antar pihak akan muncul di sini." />
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {data.transmittal.transmittal.map((t) => (
                  <div
                    key={t.id}
                    style={{ background: "var(--surface)", borderRadius: 12, padding: 12, border: `1px solid ${t.menggantung ? "var(--warning-border)" : "var(--border)"}` }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{t.nomor}</div>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                      {t.status}{t.umurHari !== null ? ` · ${t.umurHari} hari` : ""}
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                      {t.status === "draf" && (
                        <button
                          type="button"
                          onClick={() => void kirimTransmittal(t.id)}
                          style={{ fontSize: 12, fontWeight: 700, color: "var(--navy)", background: "none", border: "none", padding: 0, cursor: "pointer" }}
                        >
                          Kirim
                        </button>
                      )}
                      {t.status === "dikirim" && (
                        <button
                          type="button"
                          onClick={() => void terimaTransmittal(t.id)}
                          style={{ fontSize: 12, fontWeight: 700, color: "var(--success)", background: "none", border: "none", padding: 0, cursor: "pointer" }}
                        >
                          Tandai Diterima
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {!memuat && !galat && data && tab === "notulen" && (
            <>
              <button
                type="button"
                onClick={() => bukaSheet("notulen")}
                style={{ display: "flex", alignItems: "center", gap: 4, padding: "8px 14px", borderRadius: "var(--portal-radius-pill)", border: "none", background: "var(--grad-aksen)", color: "var(--on-navy)", fontSize: 13, fontWeight: 700, cursor: "pointer", minHeight: 40, alignSelf: "flex-start" }}
              >
                <Plus size={16} aria-hidden="true" /> Notulen
              </button>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                {data.tindakan.persenSelesai !== null ? `${data.tindakan.persenSelesai}% selesai` : "Belum ada butir"} · {data.tindakan.lewatTenggat} lewat tenggat
              </div>
              {data.tindakan.tindakan.length === 0 && (
                <EmptyState icon={ClipboardList} judul="Belum ada butir tindakan" deskripsi="Tindak lanjut rapat akan muncul di sini." />
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {data.tindakan.tindakan.map((t) => (
                  <div
                    key={t.id}
                    style={{ background: "var(--surface)", borderRadius: 12, padding: 12, border: `1px solid ${t.lewatTenggat ? "var(--danger-border)" : "var(--border)"}` }}
                  >
                    <div style={{ fontSize: 13, color: "var(--text-primary)" }}>{t.uraian ?? "—"}</div>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                      {t.pj_nama ?? "Belum ada PJ"}{t.tenggat ? ` · tenggat ${t.tenggat}` : ""}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {!memuat && !galat && data && tab === "ttd" && (
            <>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => { setSheet("ttd-buat"); setGalatForm(null); setHasilVerifikasi(null); }}
                  style={{ display: "flex", alignItems: "center", gap: 4, padding: "8px 14px", borderRadius: "var(--portal-radius-pill)", border: "none", background: "var(--grad-aksen)", color: "var(--on-navy)", fontSize: 13, fontWeight: 700, cursor: "pointer", minHeight: 40 }}
                >
                  <PenTool size={14} aria-hidden="true" /> Tanda Tangani
                </button>
                <button
                  type="button"
                  onClick={() => { setSheet("ttd-verifikasi"); setGalatForm(null); setHasilVerifikasi(null); }}
                  style={{ display: "flex", alignItems: "center", gap: 4, padding: "8px 14px", borderRadius: "var(--portal-radius-pill)", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text-primary)", fontSize: 13, fontWeight: 700, cursor: "pointer", minHeight: 40 }}
                >
                  Verifikasi
                </button>
              </div>
              {data.tandaTangan.length === 0 && (
                <EmptyState icon={PenTool} judul="Belum ada tanda tangan" deskripsi="Dokumen yang ditandatangani elektronik akan muncul di sini." />
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {data.tandaTangan.map((t) => (
                  <div key={t.id} style={{ background: "var(--surface)", borderRadius: 12, padding: 12, border: "1px solid var(--border)" }}>
                    <div style={{ fontSize: 13, color: "var(--text-primary)" }}>{t.jenis_objek}: {t.objek_id.slice(0, 8)}…</div>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                      {t.peran_penanda ?? "—"} · {formatTanggalJam(t.ditandatangani_pada)}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {!memuat && !galat && data && tab === "distribusi" && (
            <>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                {data.distribusi.length} penerima terdaftar. Read-only — kelola dari halaman web.
              </div>
              {data.distribusi.length === 0 && (
                <EmptyState icon={Users} judul="Belum ada matriks distribusi" deskripsi="Daftar penerima per jenis dokumen akan muncul di sini." />
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {data.distribusi.map((d) => (
                  <div key={d.id} style={{ background: "var(--surface)", borderRadius: 12, padding: 12, border: "1px solid var(--border)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                      <div style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 600 }}>{d.penerima_nama}</div>
                      {!d.aktif && <StatusBadge status="netral" label="Nonaktif" />}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                      {d.jenis_dokumen}{d.organisasi ? ` · ${d.organisasi}` : ""}{d.peran ? ` · ${d.peran}` : ""}
                    </div>
                    {d.penerima_email && (
                      <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{d.penerima_email}</div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      <BottomSheet terbuka={sheet === "gambar"} onTutup={() => setSheet(null)} judul="Tambah Gambar">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Nomor Gambar *</span>
            <input
              value={formGambar.nomor}
              onChange={(e) => setFormGambar((f) => ({ ...f, nomor: e.target.value }))}
              style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Judul *</span>
            <input
              value={formGambar.judul}
              onChange={(e) => setFormGambar((f) => ({ ...f, judul: e.target.value }))}
              style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Disiplin</span>
            <Pilihan
              value={formGambar.disiplin}
              onChange={(e) => setFormGambar((f) => ({ ...f, disiplin: e.target.value }))}
              style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }}
            >
              <option value="arsitektur">Arsitektur</option>
              <option value="struktur">Struktur</option>
              <option value="mep">MEP</option>
              <option value="lansekap">Lansekap</option>
            </Pilihan>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Revisi</span>
            <input
              type="number"
              min={0}
              value={formGambar.revisi}
              onChange={(e) => setFormGambar((f) => ({ ...f, revisi: e.target.value }))}
              style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }}
            />
          </label>
          {galatForm && (
            <div role="alert" style={{ fontSize: 12, color: "var(--on-danger-bg)", padding: 10, borderRadius: 10, background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}>
              {galatForm}
            </div>
          )}
          <button
            type="button"
            onClick={() => void buatGambar()}
            disabled={mengirim}
            style={{ minHeight: 48, borderRadius: "var(--portal-radius-pill)", border: "none", background: mengirim ? "var(--surface-subtle)" : "var(--grad-aksen)", color: mengirim ? "var(--text-muted)" : "var(--on-navy)", fontSize: 14, fontWeight: 700, cursor: mengirim ? "default" : "pointer" }}
          >
            {mengirim ? "Menyimpan…" : "Simpan Gambar"}
          </button>
        </div>
      </BottomSheet>

      <BottomSheet terbuka={sheet === "transmittal"} onTutup={() => setSheet(null)} judul="Buat Transmittal">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Nomor *</span>
            <input
              value={formTransmittal.nomor}
              onChange={(e) => setFormTransmittal((f) => ({ ...f, nomor: e.target.value }))}
              style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Perihal *</span>
            <input
              value={formTransmittal.perihal}
              onChange={(e) => setFormTransmittal((f) => ({ ...f, perihal: e.target.value }))}
              style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Tujuan *</span>
            <input
              value={formTransmittal.tujuan_nama}
              onChange={(e) => setFormTransmittal((f) => ({ ...f, tujuan_nama: e.target.value }))}
              style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Isi (uraian item)</span>
            <input
              value={formTransmittal.uraianItem}
              onChange={(e) => setFormTransmittal((f) => ({ ...f, uraianItem: e.target.value }))}
              placeholder="mis. Gambar arsitektur rev.2"
              style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }}
            />
          </label>
          {galatForm && (
            <div role="alert" style={{ fontSize: 12, color: "var(--on-danger-bg)", padding: 10, borderRadius: 10, background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}>
              {galatForm}
            </div>
          )}
          <button
            type="button"
            onClick={() => void buatTransmittal()}
            disabled={mengirim}
            style={{ minHeight: 48, borderRadius: "var(--portal-radius-pill)", border: "none", background: mengirim ? "var(--surface-subtle)" : "var(--grad-aksen)", color: mengirim ? "var(--text-muted)" : "var(--on-navy)", fontSize: 14, fontWeight: 700, cursor: mengirim ? "default" : "pointer" }}
          >
            {mengirim ? "Menyimpan…" : "Simpan Transmittal"}
          </button>
        </div>
      </BottomSheet>

      <BottomSheet terbuka={sheet === "notulen"} onTutup={() => setSheet(null)} judul="Buat Notulen">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Nomor *</span>
            <input
              value={formNotulen.nomor}
              onChange={(e) => setFormNotulen((f) => ({ ...f, nomor: e.target.value }))}
              style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Judul *</span>
            <input
              value={formNotulen.judul}
              onChange={(e) => setFormNotulen((f) => ({ ...f, judul: e.target.value }))}
              style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Jenis</span>
            <Pilihan
              value={formNotulen.jenis}
              onChange={(e) => setFormNotulen((f) => ({ ...f, jenis: e.target.value }))}
              style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }}
            >
              <option value="mingguan">Mingguan</option>
              <option value="koordinasi">Koordinasi</option>
              <option value="khusus">Khusus</option>
            </Pilihan>
          </label>
          <p style={{ fontSize: 11, color: "var(--text-secondary)", margin: 0 }}>
            Butir tindakan ditambahkan lewat versi web (Dokumen → Kendali) — form
            mobile menyederhanakan ke kepala notulen saja.
          </p>
          {galatForm && (
            <div role="alert" style={{ fontSize: 12, color: "var(--on-danger-bg)", padding: 10, borderRadius: 10, background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}>
              {galatForm}
            </div>
          )}
          <button
            type="button"
            onClick={() => void buatNotulen()}
            disabled={mengirim}
            style={{ minHeight: 48, borderRadius: "var(--portal-radius-pill)", border: "none", background: mengirim ? "var(--surface-subtle)" : "var(--grad-aksen)", color: mengirim ? "var(--text-muted)" : "var(--on-navy)", fontSize: 14, fontWeight: 700, cursor: mengirim ? "default" : "pointer" }}
          >
            {mengirim ? "Menyimpan…" : "Simpan Notulen"}
          </button>
        </div>
      </BottomSheet>

      <BottomSheet terbuka={sheet === "ttd-buat"} onTutup={() => setSheet(null)} judul="Tanda Tangani Dokumen">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Jenis Objek</span>
            <Pilihan
              value={formTtd.jenis_objek}
              onChange={(e) => setFormTtd((f) => ({ ...f, jenis_objek: e.target.value }))}
              style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }}
            >
              <option value="notulen">Notulen</option>
              <option value="transmittal">Transmittal</option>
              <option value="berita_acara">Berita Acara</option>
              <option value="kontrak">Kontrak</option>
            </Pilihan>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>ID Objek *</span>
            <input
              value={formTtd.objek_id}
              onChange={(e) => setFormTtd((f) => ({ ...f, objek_id: e.target.value }))}
              style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Isi Dokumen (teks yang ditandatangani) *</span>
            <textarea
              value={formTtd.isi}
              onChange={(e) => setFormTtd((f) => ({ ...f, isi: e.target.value }))}
              rows={4}
              style={{ padding: 12, borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, resize: "vertical" }}
            />
          </label>
          {galatForm && (
            <div role="alert" style={{ fontSize: 12, color: "var(--on-danger-bg)", padding: 10, borderRadius: 10, background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}>
              {galatForm}
            </div>
          )}
          <button
            type="button"
            onClick={() => void tandaTangani()}
            disabled={mengirim}
            style={{ minHeight: 48, borderRadius: "var(--portal-radius-pill)", border: "none", background: mengirim ? "var(--surface-subtle)" : "var(--grad-aksen)", color: mengirim ? "var(--text-muted)" : "var(--on-navy)", fontSize: 14, fontWeight: 700, cursor: mengirim ? "default" : "pointer" }}
          >
            {mengirim ? "Menandatangani…" : "Tanda Tangani"}
          </button>
        </div>
      </BottomSheet>

      <BottomSheet terbuka={sheet === "ttd-verifikasi"} onTutup={() => setSheet(null)} judul="Verifikasi Tanda Tangan">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Jenis Objek</span>
            <Pilihan
              value={formTtd.jenis_objek}
              onChange={(e) => setFormTtd((f) => ({ ...f, jenis_objek: e.target.value }))}
              style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }}
            >
              <option value="notulen">Notulen</option>
              <option value="transmittal">Transmittal</option>
              <option value="berita_acara">Berita Acara</option>
              <option value="kontrak">Kontrak</option>
            </Pilihan>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>ID Objek *</span>
            <input
              value={formTtd.objek_id}
              onChange={(e) => setFormTtd((f) => ({ ...f, objek_id: e.target.value }))}
              style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Isi Dokumen (untuk diperiksa ulang) *</span>
            <textarea
              value={formTtd.isi}
              onChange={(e) => setFormTtd((f) => ({ ...f, isi: e.target.value }))}
              rows={4}
              style={{ padding: 12, borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, resize: "vertical" }}
            />
          </label>
          {galatForm && (
            <div role="alert" style={{ fontSize: 12, color: "var(--on-danger-bg)", padding: 10, borderRadius: 10, background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}>
              {galatForm}
            </div>
          )}
          <button
            type="button"
            onClick={() => void verifikasiTtd()}
            disabled={mengirim}
            style={{ minHeight: 48, borderRadius: "var(--portal-radius-pill)", border: "none", background: mengirim ? "var(--surface-subtle)" : "var(--grad-aksen)", color: mengirim ? "var(--text-muted)" : "var(--on-navy)", fontSize: 14, fontWeight: 700, cursor: mengirim ? "default" : "pointer" }}
          >
            {mengirim ? "Memeriksa…" : "Verifikasi"}
          </button>
          {hasilVerifikasi && (
            <div
              role="status"
              style={{
                padding: 12,
                borderRadius: 12,
                fontSize: 13,
                background: hasilVerifikasi.keadaan === "utuh" ? "var(--success-bg)" : hasilVerifikasi.keadaan === "berubah" ? "var(--danger-bg)" : "var(--surface-subtle)",
                color: hasilVerifikasi.keadaan === "utuh" ? "var(--on-success-bg)" : hasilVerifikasi.keadaan === "berubah" ? "var(--on-danger-bg)" : "var(--text-secondary)",
                border: hasilVerifikasi.keadaan === "utuh" ? "1px solid var(--success-border)" : hasilVerifikasi.keadaan === "berubah" ? "1px solid var(--danger-border)" : "1px solid var(--border)",
              }}
            >
              {hasilVerifikasi.pesan}
            </div>
          )}
        </div>
      </BottomSheet>
    </div>
  );
}
