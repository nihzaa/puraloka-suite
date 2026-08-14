"use client";

import {
useEffect, useState, useCallback, useRef, useMemo } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/components/toast";
import { KepalaHalaman } from "@/components/dasar";
import { Saklar } from "@/components/saklar";
import {
  PackageCheck, Plus, Send, CheckCircle2, X, AlertTriangle,
  ChevronDown, Loader2, RotateCcw, Ban, Paperclip,
} from "lucide-react";

// ═══════════════════════════════════════════════════════════════════════════
// SUBMITTAL REGISTER — pengajuan material & gambar untuk disetujui.
//
// Yang membedakan halaman ini dari punch list dan inspeksi: submittal
// DITOLAK BERKALI-KALI lalu diajukan ulang. Keramik ditolak karena warna,
// diganti, ditolak lagi karena ukuran. Karena itu yang ditonjolkan bukan
// status terkini melainkan RIWAYATNYA — "ditolak 3× sebelum disetujui"
// adalah fakta yang menjelaskan kenapa pengadaan terlambat, dan itu hilang
// kalau tiap percobaan tampil sebagai baris tak berkaitan.
//
// Revisi karena itu ditampilkan BERSARANG di bawah pengajuan pertamanya,
// bukan sebagai baris sejajar.
// ═══════════════════════════════════════════════════════════════════════════

interface Submittal {
  id: string;
  nomor: string;
  judul: string;
  jenis: "contoh_material" | "shop_drawing" | "data_teknis" | "hasil_uji" | "metode_kerja" | "lainnya";
  spesifikasi: string | null;
  referensi_spek: string | null;
  status: "draft" | "diajukan" | "disetujui" | "disetujui_catatan" | "ditolak" | "dibatalkan";
  revisi: number;
  induk_id: string | null;
  ditujukan_ke: string | null;
  diajukan_pada: string | null;
  keputusan_diharapkan: string | null;
  diputuskan_pada: string | null;
  catatan_reviewer: string | null;
  diputuskan_oleh: string | null;
  menghentikan_pekerjaan: boolean;
  hari_menunggu: number | null;
  pengaju: { id: string; name: string } | null;
  material: { id: string; name: string; code: string | null; unit: string } | null;
  created_at: string;
}

interface MetaSubmittal {
  per_status: Record<string, number>;
  total: number;
  menunggu: number;
  memblokir: number;
  menunggu_terlama_hari: number;
  pernah_direvisi: number;
  rekap_lengkap: boolean;
}

const STATUS_LABEL: Record<Submittal["status"], string> = {
  draft: "Konsep",
  diajukan: "Menunggu keputusan",
  disetujui: "Disetujui",
  disetujui_catatan: "Disetujui dengan catatan",
  ditolak: "Ditolak",
  dibatalkan: "Dibatalkan",
};

const STATUS_WARNA: Record<Submittal["status"], { warna: string; bg: string }> = {
  draft:             { warna: "var(--text-muted)", bg: "var(--surface-subtle)" },
  diajukan:          { warna: "var(--warning)",    bg: "var(--warning-bg)" },
  disetujui:         { warna: "var(--success)",    bg: "var(--success-bg)" },
  disetujui_catatan: { warna: "var(--info)",       bg: "var(--info-bg)" },
  ditolak:           { warna: "var(--danger)",     bg: "var(--danger-bg)" },
  dibatalkan:        { warna: "var(--text-muted)", bg: "var(--surface-subtle)" },
};

const JENIS_LABEL: Record<Submittal["jenis"], string> = {
  contoh_material: "Contoh material",
  shop_drawing: "Shop drawing",
  data_teknis: "Data teknis",
  hasil_uji: "Hasil uji",
  metode_kerja: "Metode kerja",
  lainnya: "Lainnya",
};

const tanggal = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : null;

export default function SubmittalPage() {
  const { showToast } = useToast();
  const [proyek, setProyek] = useState<Array<{ id: string; name: string }>>([]);
  const [proyekId, setProyekId] = useState<string>("");
  const [items, setItems] = useState<Submittal[]>([]);
  const [meta, setMeta] = useState<MetaSubmittal | null>(null);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);
  const [formTerbuka, bukaForm] = useState(false);
  const [sedangUbah, setSedangUbah] = useState<string | null>(null);
  const batalRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let batal = false;
    api.get("/api/v1/projects")
      .then((r) => {
        if (batal) return;
        const daftar = (r.data?.projects ?? []) as Array<{ id: string; name: string }>;
        setProyek(daftar);
        setProyekId((kini) => kini || daftar[0]?.id || "");
        if (daftar.length === 0) setMemuat(false);
      })
      .catch(() => {
        if (!batal) { setGalat("Daftar proyek tidak bisa dimuat."); setMemuat(false); }
      });
    return () => { batal = true; };
  }, []);

  const muat = useCallback(async (pid: string) => {
    if (!pid) return;
    batalRef.current?.abort();
    const ac = new AbortController();
    batalRef.current = ac;
    setMemuat(true);
    setGalat(null);
    try {
      const r = await api.get(`/api/v1/projects/${pid}/submittals`, { signal: ac.signal });
      setItems(r.data?.data ?? []);
      setMeta(r.data?.meta ?? null);
    } catch (e) {
      if ((e as { name?: string }).name === "CanceledError") return;
      setGalat("Daftar pengajuan tidak bisa dimuat. Periksa koneksi lalu muat ulang.");
    } finally {
      if (!ac.signal.aborted) setMemuat(false);
    }
  }, []);

  useEffect(() => {
    if (!proyekId) return;
    let batal = false;
    void Promise.resolve().then(() => { if (!batal) void muat(proyekId); });
    return () => { batal = true; };
  }, [proyekId, muat]);

  const ajukan = async (it: Submittal) => {
    setSedangUbah(it.id);
    try {
      await api.patch(`/api/v1/submittals/${it.id}/status`, { status: "diajukan" });
      void muat(proyekId);
      showToast("success", `${it.nomor} dicatat diajukan.`);
    } catch (e) {
      const p = (e as { response?: { data?: { error?: string } } }).response?.data?.error;
      showToast("error", p ?? "Status tidak bisa diubah.");
    } finally { setSedangUbah(null); }
  };

  const catatKeputusan = async (it: Submittal, keputusan: Submittal["status"]) => {
    let catatan = "";
    if (keputusan === "ditolak" || keputusan === "disetujui_catatan") {
      const tanya = keputusan === "ditolak"
        ? `Kenapa ${it.nomor} ditolak?\n\nPengaju perlu tahu apa yang harus diganti sebelum mengajukan ulang.`
        : `Syarat apa yang menyertai persetujuan ${it.nomor}?\n\n"Boleh dipakai" tanpa menyebut syaratnya membuat syaratnya hilang, dan pekerjaan berjalan dengan asumsi yang salah.`;
      const jawab = window.prompt(tanya);
      if (jawab === null) return;
      if (!jawab.trim()) { showToast("error", "Catatan wajib diisi."); return; }
      catatan = jawab.trim();
    }
    const dari = window.prompt("Diputuskan oleh siapa? (boleh dikosongkan)") ?? "";

    setSedangUbah(it.id);
    try {
      const r = await api.post(`/api/v1/submittals/${it.id}/keputusan`, {
        keputusan,
        ...(catatan ? { catatan } : {}),
        ...(dari.trim() ? { diputuskan_oleh: dari.trim() } : {}),
      });
      void muat(proyekId);
      // Rantai approval bisa berjenjang. Kalau belum langkah terakhir,
      // statusnya BELUM berubah — dan mengatakan "disetujui" saat sebenarnya
      // masih menunggu level berikutnya adalah kebohongan yang membuat orang
      // memesan material yang belum boleh dipakai.
      if (r.data?.pending_next_level) {
        showToast("success", r.data.message ?? "Persetujuan level ini tercatat.");
      } else {
        showToast("success", `${it.nomor} → ${STATUS_LABEL[keputusan].toLowerCase()}`);
      }
    } catch (e) {
      const p = (e as { response?: { data?: { error?: string } } }).response?.data?.error;
      showToast("error", p ?? "Keputusan tidak bisa disimpan.");
    } finally { setSedangUbah(null); }
  };

  const ajukanRevisi = async (it: Submittal) => {
    const usul = window.prompt(
      `Revisi untuk ${it.nomor}\n\n` +
      "Apa yang diusulkan sekarang? Kosongkan kalau usulannya sama dan yang " +
      "berubah hanya lampirannya."
    );
    if (usul === null) return;

    setSedangUbah(it.id);
    try {
      const r = await api.post(`/api/v1/submittals/${it.id}/revisi`, {
        ...(usul.trim() ? { spesifikasi: usul.trim() } : {}),
      });
      void muat(proyekId);
      showToast("success", `Revisi ${r.data?.data?.nomor ?? ""} dibuat.`);
    } catch (e) {
      const p = (e as { response?: { data?: { error?: string } } }).response?.data?.error;
      showToast("error", p ?? "Revisi tidak bisa dibuat.");
    } finally { setSedangUbah(null); }
  };

  // Revisi ditampilkan BERSARANG di bawah induknya, bukan sebagai baris
  // sejajar — riwayat satu perkara harus terbaca sebagai satu perkara.
  const berkelompok = useMemo(() => {
    const anak = new Map<string, Submittal[]>();
    const induk: Submittal[] = [];
    for (const s of items) {
      if (s.induk_id) {
        const d = anak.get(s.induk_id) ?? [];
        d.push(s);
        anak.set(s.induk_id, d);
      } else induk.push(s);
    }
    for (const d of anak.values()) d.sort((a, b) => a.revisi - b.revisi);
    // Yang menunggu keputusan didahulukan; sisanya urut terbaru.
    return induk
      .sort((a, b) => {
        const aktif = (s: Submittal) =>
          (anak.get(s.id)?.at(-1) ?? s).status === "diajukan" ? 0 : 1;
        if (aktif(a) !== aktif(b)) return aktif(a) - aktif(b);
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      })
      .map((s) => ({ induk: s, revisi: anak.get(s.id) ?? [] }));
  }, [items]);

  return (
    <div className="sb-halaman">
      {/* `KepalaHalaman` — lihat catatan di `kontrak/rfi/page.tsx`:
          ikon inline di dalam `<h1>` bukan ubin, dan judulnya 24px bukan 26px. */}
      <header className="sb-kepala">
        <KepalaHalaman
          judul="Submittal"
          keterangan="Material dan gambar kerja yang diajukan untuk disetujui sebelum dipakai."
          ikon={<PackageCheck size={19} />}
        />
        <div className="sb-kepala-aksi">
          <label className="sb-pilih-bungkus">
            <select
              className="sb-pilih"
              aria-label="Pilih proyek yang pengajuannya ditampilkan"
              value={proyekId}
              onChange={(e) => setProyekId(e.target.value)}
            >
              {/* Cadangan saat daftar kosong — tanpa ini dropdown tampil
                  sebagai kotak putih tanpa teks, dan tombol di sebelahnya
                  mati tanpa penjelasan. */}
              {proyek.length === 0 && (
                <option value="">
                  {memuat ? "Memuat proyek…" : "Tak ada proyek"}
                </option>
              )}
              {proyek.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <ChevronDown size={16} className="sb-pilih-ikon" aria-hidden />
          </label>
          <button className="sb-tombol-utama" onClick={() => bukaForm(true)} disabled={!proyekId}>
            <Plus size={17} aria-hidden /> Ajukan
          </button>
        </div>
      </header>

      {meta && (
        <section className="sb-ringkas" aria-live="polite">
          <div className="sb-angka">
            <span className="sb-angka-n" style={{
              color: meta.menunggu ? "var(--warning)" : "var(--success)",
            }}>{meta.menunggu}</span>
            <span className="sb-angka-label">menunggu keputusan</span>
          </div>
          <div className="sb-pisah" aria-hidden />
          <div className="sb-angka">
            <span className="sb-angka-n" style={{
              color: meta.menunggu_terlama_hari > 14 ? "var(--danger)"
                : meta.menunggu_terlama_hari > 7 ? "var(--warning)" : "var(--text-primary)",
            }}>{meta.menunggu_terlama_hari}</span>
            <span className="sb-angka-label">hari terlama menunggu</span>
          </div>
          <div className="sb-pisah" aria-hidden />
          <div className="sb-angka">
            <span className="sb-angka-n" style={{
              color: meta.pernah_direvisi ? "var(--info)" : "var(--text-primary)",
            }}>{meta.pernah_direvisi}</span>
            <span className="sb-angka-label">pernah diajukan ulang</span>
          </div>

          {meta.memblokir > 0 && (
            <p className="sb-catatan">
              <AlertTriangle size={14} aria-hidden />
              <strong>{meta.memblokir}</strong> di antaranya menghentikan pekerjaan.
            </p>
          )}
          {!meta.rekap_lengkap && (
            <p className="sb-catatan">
              <AlertTriangle size={14} aria-hidden /> Rekap tidak lengkap.
            </p>
          )}
        </section>
      )}

      {galat ? (
        <div className="sb-galat" role="alert">
          <AlertTriangle size={18} aria-hidden />
          <span>{galat}</span>
          <button className="sb-tombol-halus" onClick={() => void muat(proyekId)}>Muat ulang</button>
        </div>
      ) : memuat ? (
        <div className="sb-memuat" aria-live="polite">
          <Loader2 size={18} className="sb-putar" aria-hidden /> Memuat pengajuan…
        </div>
      ) : items.length === 0 ? (
        <div className="sb-kosong">
          <PackageCheck size={30} aria-hidden />
          <p className="sb-kosong-judul">Belum ada pengajuan di proyek ini.</p>
          <p className="sb-kosong-teks">
            Ajukan contoh material, shop drawing, atau data teknis sebelum
            dipesan — persetujuan yang tercatat beserta tanggalnya adalah bukti
            kalau kemudian ada perselisihan soal apa yang boleh dipakai.
          </p>
          <button className="sb-tombol-utama" onClick={() => bukaForm(true)}>
            <Plus size={17} aria-hidden /> Ajukan yang pertama
          </button>
        </div>
      ) : (
        <ul className="sb-daftar">
          {berkelompok.map(({ induk, revisi }) => {
            const terkini = revisi.at(-1) ?? induk;
            const seluruh = [induk, ...revisi];
            return (
              <li key={induk.id} className="sb-perkara">
                {seluruh.map((it, i) => {
                  const w = STATUS_WARNA[it.status];
                  const aktif = it.id === terkini.id;
                  return (
                    <div
                      key={it.id}
                      className={`sb-kartu${i > 0 ? " sb-kartu-revisi" : ""}${aktif ? "" : " sb-kartu-lampau"}`}
                    >
                      <div className="sb-baris-atas">
                        <span className="sb-nomor">{it.nomor}</span>
                        <span className="sb-status" style={{ color: w.warna, background: w.bg }}>
                          {STATUS_LABEL[it.status]}
                        </span>
                        <span className="sb-jenis">{JENIS_LABEL[it.jenis]}</span>
                        {it.menghentikan_pekerjaan && aktif && (
                          <span className="sb-blokir">
                            <Ban size={11} aria-hidden /> menahan pekerjaan
                          </span>
                        )}
                        {it.hari_menunggu !== null && (
                          <span className="sb-hari">
                            {it.hari_menunggu} hari
                            {it.status === "diajukan" ? "" : " (selesai)"}
                          </span>
                        )}
                      </div>

                      {/* Judul hanya di baris pertama — revisi memakai judul
                          yang sama, dan mengulangnya membuat riwayat sulit
                          dibaca sebagai satu perkara. */}
                      {i === 0 && <p className="sb-judul-kartu">{it.judul}</p>}

                      {it.spesifikasi && aktif && (
                        <p className="sb-spek">{it.spesifikasi}</p>
                      )}

                      {it.material && aktif && (
                        <p className="sb-meta">
                          {it.material.name}
                          {it.material.code && ` (${it.material.code})`}
                        </p>
                      )}

                      {(it.ditujukan_ke || it.diajukan_pada) && aktif && (
                        <p className="sb-meta">
                          {it.ditujukan_ke ? `Ke ${it.ditujukan_ke}` : ""}
                          {it.diajukan_pada && `${it.ditujukan_ke ? " · " : ""}diajukan ${tanggal(it.diajukan_pada)}`}
                        </p>
                      )}

                      {it.catatan_reviewer && (
                        <p className={`sb-catatan-reviewer${
                          it.status === "ditolak" ? " sb-catatan-tolak" : ""}`}>
                          {it.catatan_reviewer}
                          {it.diputuskan_oleh && (
                            <span className="sb-oleh"> — {it.diputuskan_oleh}</span>
                          )}
                        </p>
                      )}

                      {aktif && (
                        <div className="sb-aksi">
                          {it.status === "draft" && (
                            <button
                              className="sb-aksi-tombol sb-aksi-utama"
                              onClick={() => void ajukan(it)}
                              disabled={sedangUbah === it.id}
                            >
                              {sedangUbah === it.id
                                ? <Loader2 size={13} className="sb-putar" aria-hidden />
                                : <Send size={13} aria-hidden />}
                              Catat diajukan
                            </button>
                          )}
                          {it.status === "diajukan" && (
                            <>
                              <button
                                className="sb-aksi-tombol sb-aksi-setuju"
                                onClick={() => void catatKeputusan(it, "disetujui")}
                                disabled={sedangUbah === it.id}
                              >
                                <CheckCircle2 size={13} aria-hidden /> Disetujui
                              </button>
                              <button
                                className="sb-aksi-tombol"
                                onClick={() => void catatKeputusan(it, "disetujui_catatan")}
                                disabled={sedangUbah === it.id}
                              >
                                Disetujui dengan catatan
                              </button>
                              <button
                                className="sb-aksi-tombol sb-aksi-tolak"
                                onClick={() => void catatKeputusan(it, "ditolak")}
                                disabled={sedangUbah === it.id}
                              >
                                <X size={13} aria-hidden /> Ditolak
                              </button>
                            </>
                          )}
                          {(it.status === "ditolak" || it.status === "disetujui_catatan") && (
                            <button
                              className="sb-aksi-tombol sb-aksi-utama"
                              onClick={() => void ajukanRevisi(it)}
                              disabled={sedangUbah === it.id}
                            >
                              {sedangUbah === it.id
                                ? <Loader2 size={13} className="sb-putar" aria-hidden />
                                : <RotateCcw size={13} aria-hidden />}
                              Ajukan revisi
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {revisi.length > 0 && (
                  <p className="sb-riwayat">
                    <Paperclip size={12} aria-hidden />
                    {revisi.length === 1
                      ? "Diajukan ulang 1×"
                      : `Diajukan ulang ${revisi.length}×`}
                    {seluruh.filter((s) => s.status === "ditolak").length > 0 &&
                      ` · ditolak ${seluruh.filter((s) => s.status === "ditolak").length}×`}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {formTerbuka && (
        <FormSubmittal
          proyekId={proyekId}
          onTutup={() => bukaForm(false)}
          onSimpan={() => { bukaForm(false); void muat(proyekId); }}
        />
      )}

      <style jsx>{`
        .sb-halaman {
          padding: var(--pad-atas) var(--pad-x) var(--pad-bawah);
          width: 100%; max-width: var(--w-page); margin: 0 auto;
        }
        .sb-kepala {
          display: flex; flex-wrap: wrap; gap: var(--gap-bagian);
          align-items: flex-end; justify-content: space-between; margin-bottom: 20px;
        }
        .sb-judul {
          display: flex; align-items: center; gap: 9px; margin: 0;
          font-family: var(--font-display); font-size: 24px; font-weight: 600;
          color: var(--text-primary); letter-spacing: -0.01em;
        }
        .sb-sub { margin: 4px 0 0; font-size: 14px; color: var(--text-secondary); }
        .sb-kepala-aksi { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }

        /*
          inline-block, bukan block — lihat catatan yang sama di
          kontrak/rfi/page.tsx. Pembungkus block melebar mengikuti induknya
          sementara .sb-pilih dibatasi 240px, dan panahnya dipatok ke kanan
          PEMBUNGKUS sehingga melayang di luar kotak select.

          Halaman ini dan RFI identik baris-per-baris di seluruh blok gaya —
          satu disalin dari yang lain, cacatnya ikut tersalin.
        */
        .sb-pilih-bungkus { position: relative; display: block; }
        .sb-pilih {
          appearance: none; min-height: 44px; padding: 0 34px 0 13px;
          border: 1px solid var(--border); border-radius: var(--radius-md);
          background: var(--surface); color: var(--text-primary);
          font-size: 14px; font-family: inherit; cursor: pointer; max-width: 240px;
        }
        /*
          :global() WAJIB di sini. Blok ini <style jsx> tanpa "global", jadi tiap
          aturan di-scope dengan kelas jsx-<hash> yang Next sisipkan ke elemen
          JSX biasa. Ikon ini dirender komponen LAIN (<ChevronDown> dari lucide),
          dan komponen React tidak menerima atribut scope itu — jadi aturannya
          tak pernah cocok, panah tetap "position: static", dan ia jatuh ke tepi
          kiri select alih-alih menempel di kanannya.
        
          Gejalanya menyesatkan: terlihat seperti pembungkusnya salah lebar.
          Mengubah display pembungkus TIDAK memperbaikinya — diukur di peramban,
          panahnya tetap di luar kotak.
        */
        :global(.sb-pilih-ikon) {
          position: absolute; right: 11px; top: 50%; transform: translateY(-50%);
          color: var(--text-muted); pointer-events: none;
        }
        .sb-tombol-utama {
          display: inline-flex; align-items: center; gap: 7px;
          min-height: 44px; padding: 0 16px; border: none;
          border-radius: var(--radius-md); background: var(--navy);
          color: var(--on-navy); font-size: 14px; font-weight: 500;
          font-family: inherit; cursor: pointer; transition: background 140ms ease;
        }
        .sb-tombol-utama:hover:not(:disabled) { background: var(--navy-mid); }
        .sb-tombol-utama:disabled { opacity: 0.5; cursor: not-allowed; }
        .sb-tombol-halus {
          min-height: 36px; padding: 0 12px; border: 1px solid var(--border);
          border-radius: var(--radius-sm); background: var(--surface);
          color: var(--text-primary); font-size: 13px; font-family: inherit; cursor: pointer;
        }

        .sb-ringkas {
          display: flex; flex-wrap: wrap; align-items: center; gap: var(--gap-bagian);
          background: var(--surface); border: 1px solid var(--border);
          border-radius: var(--radius-lg); padding: var(--pad-kartu-lega) 22px; margin-bottom: 22px;
        }
        .sb-angka { display: flex; align-items: baseline; gap: 9px; }
        .sb-angka-n {
          font-family: var(--font-display); font-size: 34px; font-weight: 700;
          line-height: 1; letter-spacing: -0.03em; font-variant-numeric: tabular-nums;
        }
        .sb-angka-label { font-size: 13px; color: var(--text-secondary); }
        .sb-pisah { width: 1px; align-self: stretch; background: var(--border); }
        .sb-catatan {
          flex-basis: 100%; display: flex; align-items: center; gap: 7px;
          margin: 4px 0 0; font-size: 12.5px; color: var(--text-muted);
        }

        .sb-daftar { list-style: none; margin: 0; padding: 0; display: grid; gap: 14px; }
        /* Satu perkara = satu blok, berapa pun revisinya. Ini inti halaman ini. */
        .sb-perkara {
          background: var(--surface); border: 1px solid var(--border);
          border-radius: var(--radius-md); overflow: hidden;
        }
        .sb-kartu { padding: 13px 15px; }
        .sb-kartu + .sb-kartu { border-top: 1px solid var(--border); }
        /* Revisi menjorok — hubungan induk-anak terbaca tanpa garis penghubung. */
        .sb-kartu-revisi {
          padding-left: 27px; background: var(--surface-subtle);
          border-left: 2px solid var(--border-strong);
        }
        /* Percobaan lampau diredupkan: yang perlu ditindak hanya yang terkini. */
        .sb-kartu-lampau { opacity: 0.72; }

        .sb-baris-atas {
          display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 6px;
        }
        .sb-nomor {
          font-size: 11.5px; color: var(--text-muted);
          font-variant-numeric: tabular-nums; letter-spacing: 0.02em;
        }
        .sb-status { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 4px; }
        .sb-jenis { font-size: 11.5px; color: var(--text-muted); }
        .sb-blokir {
          display: inline-flex; align-items: center; gap: 4px;
          font-size: 11px; padding: 2px 8px; border-radius: 4px;
          background: var(--danger-bg); color: var(--danger); font-weight: 500;
        }
        .sb-hari {
          margin-left: auto; font-size: 11.5px; color: var(--text-muted);
          font-variant-numeric: tabular-nums;
        }
        .sb-judul-kartu {
          margin: 0 0 6px; font-size: 15px; font-weight: 500;
          color: var(--text-primary); line-height: 1.4;
        }
        .sb-spek {
          margin: 0 0 6px; font-size: 13.5px; color: var(--text-secondary); line-height: 1.55;
        }
        .sb-meta { margin: 0 0 4px; font-size: 12.5px; color: var(--text-secondary); }
        .sb-catatan-reviewer {
          margin: 7px 0 0; padding: 8px 11px; font-size: 13px; line-height: 1.55;
          background: var(--info-bg); border-left: 3px solid var(--info);
          border-radius: 0 5px 5px 0; color: var(--text-primary);
        }
        .sb-catatan-tolak {
          background: var(--danger-bg); border-left-color: var(--danger);
        }
        .sb-oleh { color: var(--text-muted); font-size: 12px; }

        .sb-aksi { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 11px; }
        .sb-aksi-tombol {
          display: inline-flex; align-items: center; gap: 5px;
          min-height: 36px; padding: 0 11px;
          border: 1px solid var(--border); border-radius: var(--radius-sm);
          background: var(--surface); color: var(--text-secondary);
          font-size: 12.5px; font-family: inherit; cursor: pointer;
          transition: background 130ms ease, color 130ms ease;
        }
        .sb-aksi-tombol:hover:not(:disabled) {
          background: var(--surface-hover); color: var(--text-primary);
        }
        .sb-aksi-tombol:disabled { opacity: 0.55; cursor: wait; }
        .sb-aksi-utama {
          border-color: var(--navy); background: var(--navy);
          color: var(--on-navy); font-weight: 500;
        }
        .sb-aksi-utama:hover:not(:disabled) { background: var(--navy-mid); color: var(--on-navy); }
        .sb-aksi-setuju {
          border-color: var(--success-border); background: var(--success-bg);
          color: var(--success); font-weight: 500;
        }
        .sb-aksi-tolak { border-color: var(--danger-border); color: var(--danger); }

        .sb-riwayat {
          display: flex; align-items: center; gap: 6px; margin: 0;
          padding: 8px 15px; font-size: 12px; color: var(--text-muted);
          background: var(--surface-subtle); border-top: 1px solid var(--border);
        }

        .sb-memuat, .sb-kosong, .sb-galat {
          display: flex; align-items: center; justify-content: center;
          gap: 10px; padding: 40px 20px; color: var(--text-secondary); font-size: 14px;
        }
        .sb-kosong {
          flex-direction: column; gap: 8px; text-align: center;
          background: var(--surface); border: 1px dashed var(--border-strong);
          border-radius: var(--radius-lg); color: var(--text-muted); padding: 48px 24px;
        }
        .sb-kosong-judul {
          margin: 6px 0 0; font-size: 15px; font-weight: 500; color: var(--text-primary);
        }
        .sb-kosong-teks { margin: 0 0 8px; max-width: 460px; line-height: 1.6; }
        .sb-galat {
          background: var(--danger-bg); border: 1px solid var(--danger-border);
          border-radius: var(--radius-md); color: var(--danger); justify-content: flex-start;
        }
        .sb-putar { animation: sb-spin 900ms linear infinite; }
        @keyframes sb-spin { to { transform: rotate(360deg); } }

        @media (max-width: 640px) {
          .sb-kepala-aksi { width: 100%; }
          .sb-pilih { max-width: none; width: 100%; }
          .sb-pilih-bungkus { flex: 1; }
          .sb-ringkas { gap: var(--gap-bagian); }
          .sb-pisah { display: none; }
          .sb-angka { flex-basis: 100%; }
          .sb-angka-n { font-size: 28px; }
          .sb-hari { margin-left: 0; }
          .sb-kartu-revisi { padding-left: 19px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .sb-tombol-utama, .sb-aksi-tombol { transition: none; }
          .sb-putar { animation: none; }
        }
      `}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════

function FormSubmittal({
  proyekId, onTutup, onSimpan,
}: { proyekId: string; onTutup: () => void; onSimpan: () => void }) {
  const { showToast } = useToast();
  const [judul, setJudul] = useState("");
  const [jenis, setJenis] = useState<Submittal["jenis"]>("contoh_material");
  const [spesifikasi, setSpesifikasi] = useState("");
  const [referensi, setReferensi] = useState("");
  const [tujuan, setTujuan] = useState("");
  const [diharapkan, setDiharapkan] = useState("");
  const [memblokir, setMemblokir] = useState(false);
  const [menyimpan, setMenyimpan] = useState(false);
  const judulRef = useRef<HTMLInputElement>(null);

  useEffect(() => { judulRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onTutup(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onTutup]);

  const simpan = async () => {
    if (!judul.trim()) {
      showToast("error", "Tulis dulu apa yang diajukan.");
      judulRef.current?.focus();
      return;
    }
    setMenyimpan(true);
    try {
      await api.post(`/api/v1/projects/${proyekId}/submittals`, {
        judul: judul.trim(),
        jenis,
        spesifikasi: spesifikasi.trim() || undefined,
        referensi_spek: referensi.trim() || undefined,
        ditujukan_ke: tujuan.trim() || undefined,
        keputusan_diharapkan: diharapkan || undefined,
        menghentikan_pekerjaan: memblokir,
      });
      showToast("success", "Pengajuan tersimpan sebagai konsep.");
      onSimpan();
    } catch (e) {
      const p = (e as { response?: { data?: { error?: string } } }).response?.data?.error;
      showToast("error", p ?? "Pengajuan tidak bisa disimpan.");
    } finally { setMenyimpan(false); }
  };

  return (
    <div className="fs-tirai" role="dialog" aria-modal="true" aria-labelledby="fs-judul">
      <div className="fs-panel">
        <header className="fs-kepala">
          <h2 id="fs-judul">Ajukan untuk disetujui</h2>
          <button className="fs-tutup" onClick={onTutup} aria-label="Tutup">
            <X size={18} aria-hidden />
          </button>
        </header>

        <div className="fs-isi">
          <label className="fs-baris">
            <span className="fs-label">Apa yang diajukan</span>
            <input
              ref={judulRef} className="fs-input" value={judul}
              onChange={(e) => setJudul(e.target.value)}
              placeholder="Keramik lantai 60x60 — ruang utama" maxLength={200}
            />
          </label>

          <label className="fs-baris">
            <span className="fs-label">Jenis</span>
            <select
              className="fs-input"
              aria-label="Jenis pengajuan"
              value={jenis}
              onChange={(e) => setJenis(e.target.value as Submittal["jenis"])}
            >
              {(Object.keys(JENIS_LABEL) as Submittal["jenis"][]).map((j) => (
                <option key={j} value={j}>{JENIS_LABEL[j]}</option>
              ))}
            </select>
          </label>

          <label className="fs-baris">
            <span className="fs-label">Rincian usulan</span>
            <textarea
              className="fs-input fs-area" value={spesifikasi} rows={3}
              onChange={(e) => setSpesifikasi(e.target.value)}
              placeholder="Merk X tipe Y, warna abu terang, finishing matte, 60x60 cm"
            />
            <span className="fs-bantu">
              Sebutkan merk, tipe, dan spesifikasi yang menentukan — usulan
              yang kabur akan ditolak dan harus diajukan ulang.
            </span>
          </label>

          <label className="fs-baris">
            <span className="fs-label">Pasal spesifikasi rujukan <em>(boleh dikosongkan)</em></span>
            <input
              className="fs-input" value={referensi}
              onChange={(e) => setReferensi(e.target.value)}
              placeholder="RKS pasal 7.3 — pekerjaan lantai" maxLength={200}
            />
          </label>

          <label className="fs-baris">
            <span className="fs-label">Ditujukan ke</span>
            <input
              className="fs-input" value={tujuan}
              onChange={(e) => setTujuan(e.target.value)}
              placeholder="Konsultan pengawas — PT Arsitama" maxLength={200}
            />
          </label>

          <label className="fs-baris">
            <span className="fs-label">Keputusan diharapkan sebelum <em>(boleh dikosongkan)</em></span>
            <input
              type="date" className="fs-input" value={diharapkan}
              onChange={(e) => setDiharapkan(e.target.value)}
            />
          </label>

          <div className="fs-baris">
            <Saklar
              nyala={memblokir}
              onUbah={setMemblokir}
              label="Pekerjaan berhenti sampai ini disetujui"
            />
            <span className="fs-bantu">
              Hanya centang kalau pemesanan atau pemasangan benar-benar
              menunggu. Yang dilebih-lebihkan membuat angka &ldquo;menahan
              pekerjaan&rdquo; berhenti dipercaya.
            </span>
          </div>
        </div>

        <footer className="fs-kaki">
          <button className="fs-batal" onClick={onTutup} disabled={menyimpan}>Batal</button>
          <button className="fs-simpan" onClick={() => void simpan()} disabled={menyimpan}>
            {menyimpan ? <Loader2 size={15} className="fs-putar" aria-hidden /> : null}
            Simpan konsep
          </button>
        </footer>
      </div>

      <style jsx>{`
        .fs-tirai {
          position: fixed; inset: 0; z-index: 60;
          background: rgba(17,24,39,0.45);
          display: flex; align-items: center; justify-content: center; padding: var(--pad-kartu-lega);
        }
        .fs-panel {
          background: var(--surface); border-radius: var(--radius-lg);
          width: 100%; max-width: 500px; max-height: 92vh;
          display: flex; flex-direction: column; overflow: hidden;
          box-shadow: 0 18px 44px rgba(0,0,0,0.18);
        }
        .fs-kepala {
          display: flex; align-items: center; justify-content: space-between;
          padding: 16px 18px; border-bottom: 1px solid var(--border);
        }
        .fs-kepala h2 {
          margin: 0; font-family: var(--font-display);
          font-size: 17px; font-weight: 600; color: var(--text-primary);
        }
        .fs-tutup {
          min-width: 36px; min-height: 36px; border: none; background: none;
          color: var(--text-muted); cursor: pointer; border-radius: var(--radius-sm);
          display: flex; align-items: center; justify-content: center;
        }
        .fs-tutup:hover { background: var(--surface-hover); color: var(--text-primary); }
        .fs-isi { padding: 18px; overflow-y: auto; display: grid; gap: 15px; }
        .fs-baris { display: grid; gap: 6px; }
        .fs-label { font-size: 13px; font-weight: 500; color: var(--text-primary); }
        .fs-label em { font-style: normal; font-weight: 400; color: var(--text-muted); }
        .fs-bantu { font-size: 12px; color: var(--text-muted); line-height: 1.5; }
        .fs-input {
          min-height: 44px; padding: 10px 12px; width: 100%; box-sizing: border-box;
          border: 1px solid var(--border); border-radius: var(--radius-md);
          background: var(--surface); color: var(--text-primary);
          font-size: 15px; font-family: inherit;
        }
        .fs-input:focus-visible {
          outline: 2px solid var(--navy); outline-offset: 1px; border-color: var(--navy);
        }
        .fs-area { min-height: 80px; resize: vertical; line-height: 1.55; }
        .fs-centang {
          display: flex; align-items: center; gap: 9px; min-height: 44px;
          font-size: 14px; color: var(--text-primary); cursor: pointer;
        }
        .fs-centang input { width: 18px; height: 18px; cursor: pointer; }
        .fs-kaki {
          display: flex; gap: 9px; justify-content: flex-end;
          padding: 14px 18px; border-top: 1px solid var(--border);
          background: var(--surface-subtle);
        }
        .fs-batal, .fs-simpan {
          min-height: 44px; padding: 0 17px; border-radius: var(--radius-md);
          font-size: 14px; font-family: inherit; cursor: pointer;
          display: inline-flex; align-items: center; gap: 7px;
        }
        .fs-batal {
          border: 1px solid var(--border); background: var(--surface);
          color: var(--text-secondary);
        }
        .fs-simpan {
          border: none; background: var(--navy); color: var(--on-navy); font-weight: 500;
        }
        .fs-simpan:disabled, .fs-batal:disabled { opacity: 0.55; cursor: wait; }
        .fs-putar { animation: fs-spin 900ms linear infinite; }
        @keyframes fs-spin { to { transform: rotate(360deg); } }

        @media (max-width: 640px) {
          .fs-tirai { align-items: flex-end; padding: 0; }
          .fs-panel { max-width: none; max-height: 94vh; border-radius: 16px 16px 0 0; }
        }
        @media (prefers-reduced-motion: reduce) { .fs-putar { animation: none; } }
      `}</style>
    </div>
  );
}
