"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/components/toast";
import {
  ClipboardCheck, Plus, MapPin, CheckCircle2, X, RotateCcw,
  AlertTriangle, Camera, ChevronDown, Loader2,
} from "lucide-react";

// ═══════════════════════════════════════════════════════════════════════════
// PUNCH LIST — daftar cacat yang masih menghalangi serah terima.
//
// Halaman ini dipakai orang yang BERDIRI DI LOKASI dengan satu tangan
// memegang HP, bukan orang yang duduk di depan monitor. Tiga konsekuensinya
// menentukan seluruh rancangan:
//
//   1. Bukan tabel. Punch list adalah ANTREAN KERJA — pertanyaannya selalu
//      "apa berikutnya", bukan "urutkan berdasarkan tanggal". Karena itu
//      dikelompokkan per status: kolom di layar lebar, tumpukan di HP.
//   2. Severity memakai WARNA, status memakai POSISI. Memberi keduanya warna
//      membuat keduanya tak terbaca — dan yang paling penting di lapangan
//      (seberapa gawat) kalah oleh yang sekadar administratif.
//   3. Target sentuh 44px ke atas, karena dipakai sambil berdiri, kadang
//      dengan sarung tangan.
// ═══════════════════════════════════════════════════════════════════════════

interface Ringkas { id: string; name: string }

interface PunchItem {
  id: string;
  nomor: string;
  judul: string;
  deskripsi: string | null;
  lokasi: string | null;
  severity: "ringan" | "sedang" | "berat" | "kritis";
  status: "terbuka" | "dikerjakan" | "menunggu_cek" | "ditutup" | "ditolak";
  target_selesai: string | null;
  alasan_penolakan: string | null;
  ditugaskan_ke: string | null;
  ditemukan_oleh: string;
  penemu: Ringkas | null;
  petugas: Ringkas | null;
  verifikator: Ringkas | null;
  rab_item: { id: string; name: string } | null;
  created_at: string;
}

interface MetaPunch {
  per_status: Record<string, number>;
  per_severity: Record<string, number>;
  total: number;
  belum_selesai: number;
  rekap_lengkap: boolean;
}

// ─── Bahasa ──────────────────────────────────────────────────────────────────
// Label ditulis sebagai yang diucapkan di lapangan, bukan sebagai nama kolom.

const STATUS_LABEL: Record<PunchItem["status"], string> = {
  terbuka: "Belum ditangani",
  dikerjakan: "Sedang diperbaiki",
  menunggu_cek: "Minta diperiksa",
  ditutup: "Selesai",
  ditolak: "Tidak berlaku",
};

/** Urutan kolom = alur kerja nyata, kiri ke kanan. */
const URUTAN: PunchItem["status"][] = [
  "terbuka", "dikerjakan", "menunggu_cek", "ditutup", "ditolak",
];

const SEVERITY: Record<PunchItem["severity"], { label: string; warna: string; bg: string }> = {
  kritis: { label: "Kritis",  warna: "var(--danger)",      bg: "var(--danger-bg)" },
  berat:  { label: "Berat",   warna: "var(--warning)",     bg: "var(--warning-bg)" },
  sedang: { label: "Sedang",  warna: "var(--info)",        bg: "var(--info-bg)" },
  ringan: { label: "Ringan",  warna: "var(--text-muted)",  bg: "var(--surface-subtle)" },
};

/** Transisi yang boleh — cerminan `TRANSISI_SAH` di API. Tombol yang mustahil
 *  tidak ditampilkan, bukan ditampilkan lalu ditolak server. */
const LANJUTAN: Record<PunchItem["status"], PunchItem["status"][]> = {
  terbuka: ["dikerjakan", "ditolak"],
  dikerjakan: ["menunggu_cek", "terbuka", "ditolak"],
  menunggu_cek: ["ditutup", "dikerjakan", "ditolak"],
  ditutup: ["dikerjakan"],
  ditolak: ["terbuka"],
};

const AKSI_LABEL: Record<PunchItem["status"], string> = {
  terbuka: "Buka lagi",
  dikerjakan: "Mulai perbaiki",
  menunggu_cek: "Minta diperiksa",
  ditutup: "Nyatakan selesai",
  ditolak: "Tandai tidak berlaku",
};

const tanggal = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short" }) : null;

export default function PunchListPage() {
  const { showToast } = useToast();
  const [proyek, setProyek] = useState<Array<{ id: string; name: string }>>([]);
  const [proyekId, setProyekId] = useState<string>("");
  const [items, setItems] = useState<PunchItem[]>([]);
  const [meta, setMeta] = useState<MetaPunch | null>(null);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);
  const [formTerbuka, bukaForm] = useState(false);
  const [sedangUbah, setSedangUbah] = useState<string | null>(null);
  const batalRef = useRef<AbortController | null>(null);

  // ── Muat daftar proyek ────────────────────────────────────────────────────
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

  // ── Muat temuan ───────────────────────────────────────────────────────────
  const muat = useCallback(async (pid: string) => {
    if (!pid) return;
    batalRef.current?.abort();
    const ac = new AbortController();
    batalRef.current = ac;
    setMemuat(true);
    setGalat(null);
    try {
      const r = await api.get(`/api/v1/projects/${pid}/punch-items`, { signal: ac.signal });
      setItems(r.data?.data ?? []);
      setMeta(r.data?.meta ?? null);
    } catch (e) {
      if ((e as { name?: string }).name === "CanceledError") return;
      // Katakan APA yang gagal dan apa yang bisa dilakukan — bukan "terjadi
      // kesalahan", yang tak memberi jalan keluar apa pun.
      setGalat("Daftar temuan tidak bisa dimuat. Periksa koneksi lalu muat ulang.");
    } finally {
      if (!ac.signal.aborted) setMemuat(false);
    }
  }, []);

  // `setMemuat(true)` di dalam `muat()` dipanggil ASINKRON (microtask), bukan
  // sinkron di badan efek. Bedanya bukan gaya: setState sinkron dalam efek
  // memicu render berantai — dan pada halaman yang dibuka di HP lapangan,
  // render tambahan tiap ganti proyek terasa sebagai jeda.
  useEffect(() => {
    if (!proyekId) return;
    let batal = false;
    void Promise.resolve().then(() => { if (!batal) void muat(proyekId); });
    return () => { batal = true; };
  }, [proyekId, muat]);

  // ── Ubah status ───────────────────────────────────────────────────────────
  const ubahStatus = async (item: PunchItem, baru: PunchItem["status"]) => {
    let alasan: string | undefined;
    if (baru === "ditolak") {
      const jawab = window.prompt(
        `Kenapa ${item.nomor} tidak berlaku?\n\n` +
        "Alasannya ikut tercatat — temuan yang ditolak tanpa alasan tak bisa " +
        "dibedakan dari yang dihapus diam-diam."
      );
      if (jawab === null) return;              // dibatalkan
      if (!jawab.trim()) {
        showToast("error", "Alasan wajib diisi.");
        return;
      }
      alasan = jawab.trim();
    }

    setSedangUbah(item.id);
    try {
      const r = await api.patch(`/api/v1/punch-items/${item.id}/status`, {
        status: baru,
        ...(alasan ? { alasan_penolakan: alasan } : {}),
      });
      setItems((kini) => kini.map((x) => (x.id === item.id ? r.data.data : x)));
      void muat(proyekId);                     // rekap ikut berubah
      showToast("success", `${item.nomor} → ${STATUS_LABEL[baru].toLowerCase()}`);
    } catch (e) {
      const pesan = (e as { response?: { data?: { error?: string } } })
        .response?.data?.error;
      // Pesan server ditampilkan apa adanya: ia sudah menjelaskan SEBABNYA
      // (mis. "Anda yang ditugaskan memperbaiki temuan ini"), dan menggantinya
      // dengan pesan generik justru membuang informasi yang paling berguna.
      showToast("error", pesan ?? "Status tidak bisa diubah.");
    } finally {
      setSedangUbah(null);
    }
  };

  const perStatus = useMemo(() => {
    const p: Record<string, PunchItem[]> = {};
    for (const s of URUTAN) p[s] = [];
    for (const i of items) (p[i.status] ??= []).push(i);
    return p;
  }, [items]);

  const menghalangi = meta?.belum_selesai ?? 0;

  /**
   * Tiga keadaan, bukan dua — dan versi sebelumnya menggabungkan dua di
   * antaranya jadi satu warna yang salah.
   *
   * Dulu: `bersih = menghalangi === 0 && meta.total > 0`. Syarat
   * `total > 0` dimaksudkan membedakan "sudah diperiksa dan bersih" dari
   * "belum ada temuan tercatat sama sekali" — niat yang benar. Tapi
   * akibatnya proyek TANPA temuan (total = 0) tak pernah dianggap bersih,
   * jadi angka "0" tampil MERAH dengan garis merah tebal. Proyek yang
   * paling tak bermasalah justru diberi alarm paling keras.
   *
   * Sekarang ketiganya dipisah, karena masing-masing menuntut tindakan
   * berbeda: yang merah minta dikerjakan, yang hijau boleh diserahkan,
   * yang netral minta DIPERIKSA dulu — nol di situ belum berarti apa-apa.
   */
  const adaYangMenghalangi = meta !== null && menghalangi > 0;
  const bersih = meta !== null && menghalangi === 0 && meta.total > 0;
  const belumDiperiksa = meta !== null && meta.total === 0;

  return (
    <div className="pl-halaman">
      {/* ── Judul + pemilih proyek ───────────────────────────────────────── */}
      <header className="pl-kepala">
        <div>
          <h1 className="pl-judul">
            <ClipboardCheck size={22} aria-hidden />
            Punch list
          </h1>
          <p className="pl-sub">Cacat yang masih menghalangi serah terima.</p>
        </div>

        <div className="pl-kepala-aksi">
          <label className="pl-pilih-bungkus">
            <span className="pl-label-tersembunyi">Proyek</span>
            <select
              className="pl-pilih"
              aria-label="Pilih proyek yang temuannya ditampilkan"
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
              {proyek.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <ChevronDown size={16} className="pl-pilih-ikon" aria-hidden />
          </label>

          <button className="pl-tombol-utama" onClick={() => bukaForm(true)} disabled={!proyekId}>
            <Plus size={17} aria-hidden />
            Catat temuan
          </button>
        </div>
      </header>

      {/* ── Ambang serah terima ──────────────────────────────────────────────
          Satu angka, satu garis. Garisnya merah selama masih ada yang
          menghalangi dan hijau hanya ketika benar-benar nol — itu satu-satunya
          pertanyaan yang orang bawa ke halaman ini. */}
      {meta && (
        <section className="pl-ambang" aria-live="polite">
          <div className="pl-ambang-angka">
            <span className="pl-ambang-n" style={{
              color: bersih ? "var(--success)"
                : adaYangMenghalangi ? "var(--danger)"
                : "var(--text-muted)",
            }}>
              {menghalangi}
            </span>
            <span className="pl-ambang-teks">
              {bersih
                ? "Tidak ada yang menghalangi serah terima."
                : belumDiperiksa
                  ? "temuan tercatat — proyek ini belum diperiksa"
                  : "temuan masih menghalangi serah terima"}
            </span>
          </div>

          <div
            className="pl-ambang-garis"
            role="img"
            aria-label={
              bersih
                ? "Semua temuan selesai"
                : belumDiperiksa
                  ? "Belum ada temuan tercatat di proyek ini"
                  : `${menghalangi} dari ${meta.total} temuan belum selesai`
            }
          >
            <span
              className="pl-ambang-isi"
              style={{
                // Saat belum ada temuan tercatat, batangnya KOSONG — bukan
                // penuh. Versi sebelumnya memakai lebar 100% berwarna merah
                // untuk keadaan itu, yang terbaca sebagai "seluruh proyek
                // terhalang" padahal belum ada yang diperiksa.
                width: meta.total ? `${100 - (menghalangi / meta.total) * 100}%` : "0%",
                background: bersih ? "var(--success)" : "var(--danger)",
              }}
            />
          </div>

          <div className="pl-ambang-kaki">
            {(["kritis", "berat", "sedang", "ringan"] as const)
              .filter((s) => meta.per_severity[s])
              .map((s) => (
                <span key={s} className="pl-sev-kecil" style={{ color: SEVERITY[s].warna }}>
                  <i style={{ background: SEVERITY[s].warna }} aria-hidden />
                  {meta.per_severity[s]} {SEVERITY[s].label.toLowerCase()}
                </span>
              ))}
            {!meta.rekap_lengkap && (
              <span className="pl-sev-kecil" style={{ color: "var(--warning)" }}>
                <AlertTriangle size={13} aria-hidden /> Rekap tidak lengkap
              </span>
            )}
          </div>
        </section>
      )}

      {/* ── Isi ──────────────────────────────────────────────────────────── */}
      {galat ? (
        <div className="pl-galat" role="alert">
          <AlertTriangle size={18} aria-hidden />
          <span>{galat}</span>
          <button className="pl-tombol-halus" onClick={() => void muat(proyekId)}>
            Muat ulang
          </button>
        </div>
      ) : memuat ? (
        <div className="pl-memuat" aria-live="polite">
          <Loader2 size={18} className="pl-putar" aria-hidden />
          Memuat temuan…
        </div>
      ) : items.length === 0 ? (
        <div className="pl-kosong">
          <ClipboardCheck size={30} aria-hidden />
          <p className="pl-kosong-judul">Belum ada temuan di proyek ini.</p>
          <p className="pl-kosong-teks">
            Catat cacat yang ditemukan di lapangan supaya ada yang bertanggung
            jawab menutupnya sebelum serah terima.
          </p>
          <button className="pl-tombol-utama" onClick={() => bukaForm(true)}>
            <Plus size={17} aria-hidden />
            Catat temuan pertama
          </button>
        </div>
      ) : (
        <div className="pl-papan">
          {URUTAN.filter((s) => perStatus[s].length > 0).map((s) => (
            <section key={s} className="pl-kolom" aria-labelledby={`kol-${s}`}>
              <h2 id={`kol-${s}`} className="pl-kolom-judul">
                {STATUS_LABEL[s]}
                <span className="pl-kolom-n">{perStatus[s].length}</span>
              </h2>

              <ul className="pl-daftar">
                {perStatus[s].map((it) => (
                  <li key={it.id} className="pl-kartu">
                    <div className="pl-kartu-atas">
                      <span
                        className="pl-sev"
                        style={{ color: SEVERITY[it.severity].warna, background: SEVERITY[it.severity].bg }}
                      >
                        {SEVERITY[it.severity].label}
                      </span>
                      <span className="pl-nomor">{it.nomor}</span>
                    </div>

                    <p className="pl-kartu-judul">{it.judul}</p>

                    {it.lokasi && (
                      <p className="pl-meta">
                        <MapPin size={13} aria-hidden />
                        {it.lokasi}
                      </p>
                    )}

                    {it.petugas && (
                      <p className="pl-meta">
                        <span className="pl-inisial" aria-hidden>
                          {it.petugas.name.charAt(0).toUpperCase()}
                        </span>
                        {it.petugas.name}
                        {it.target_selesai && <> · target {tanggal(it.target_selesai)}</>}
                      </p>
                    )}

                    {it.status === "ditolak" && it.alasan_penolakan && (
                      <p className="pl-alasan">{it.alasan_penolakan}</p>
                    )}

                    {it.status === "ditutup" && it.verifikator && (
                      <p className="pl-meta pl-terverifikasi">
                        <CheckCircle2 size={13} aria-hidden />
                        Diperiksa {it.verifikator.name}
                      </p>
                    )}

                    <div className="pl-aksi">
                      {LANJUTAN[it.status].map((baru) => (
                        <button
                          key={baru}
                          className={`pl-aksi-tombol${baru === "ditutup" ? " pl-aksi-utama" : ""}`}
                          onClick={() => void ubahStatus(it, baru)}
                          disabled={sedangUbah === it.id}
                        >
                          {sedangUbah === it.id ? (
                            <Loader2 size={13} className="pl-putar" aria-hidden />
                          ) : baru === "ditutup" ? (
                            <CheckCircle2 size={13} aria-hidden />
                          ) : baru === "ditolak" ? (
                            <X size={13} aria-hidden />
                          ) : baru === "terbuka" ? (
                            <RotateCcw size={13} aria-hidden />
                          ) : null}
                          {AKSI_LABEL[baru]}
                        </button>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {formTerbuka && (
        <FormTemuan
          proyekId={proyekId}
          onTutup={() => bukaForm(false)}
          onSimpan={() => { bukaForm(false); void muat(proyekId); }}
        />
      )}

      <style jsx>{`
        /* Token sistem, bukan angka sendiri: sebelum E11, 13 dari 26 halaman
           tak memusatkan diri dan di layar 1920px isinya melebar sampai 1700px.
           --w-page = daftar & kartu; padding-nya clamp(), jadi tak perlu media
           query terpisah untuk HP. */
        .pl-halaman {
          padding: var(--pad-atas) var(--pad-x) var(--pad-bawah);
          width: 100%; max-width: var(--w-page); margin: 0 auto;
        }

        .pl-kepala {
          display: flex; flex-wrap: wrap; gap: 16px;
          align-items: flex-end; justify-content: space-between; margin-bottom: 20px;
        }
        .pl-judul {
          display: flex; align-items: center; gap: 9px;
          font-family: var(--font-display); font-size: 24px; font-weight: 600;
          color: var(--text-primary); margin: 0; letter-spacing: -0.01em;
        }
        .pl-sub { margin: 4px 0 0; font-size: 14px; color: var(--text-secondary); }
        .pl-kepala-aksi { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }

        .pl-label-tersembunyi {
          position: absolute; width: 1px; height: 1px; overflow: hidden;
          clip: rect(0 0 0 0); white-space: nowrap;
        }
        .pl-pilih-bungkus { position: relative; display: block; }
        .pl-pilih {
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
        :global(.pl-pilih-ikon) {
          position: absolute; right: 11px; top: 50%; transform: translateY(-50%);
          color: var(--text-muted); pointer-events: none;
        }

        .pl-tombol-utama {
          display: inline-flex; align-items: center; gap: 7px;
          min-height: 44px; padding: 0 16px; border: none;
          border-radius: var(--radius-md); background: var(--navy);
          color: var(--on-navy); font-size: 14px; font-weight: 500;
          font-family: inherit; cursor: pointer;
          transition: background 140ms ease;
        }
        .pl-tombol-utama:hover:not(:disabled) { background: var(--navy-mid); }
        .pl-tombol-utama:disabled { opacity: 0.5; cursor: not-allowed; }

        .pl-tombol-halus {
          min-height: 36px; padding: 0 12px; border: 1px solid var(--border);
          border-radius: var(--radius-sm); background: var(--surface);
          color: var(--text-primary); font-size: 13px; font-family: inherit; cursor: pointer;
        }

        /* ── Ambang serah terima (elemen tanda tangan halaman ini) ───────── */
        .pl-ambang {
          background: var(--surface); border: 1px solid var(--border);
          border-radius: var(--radius-lg); padding: 18px 20px; margin-bottom: 22px;
        }
        .pl-ambang-angka { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
        .pl-ambang-n {
          font-family: var(--font-display); font-size: 42px; font-weight: 700;
          line-height: 1; letter-spacing: -0.03em; font-variant-numeric: tabular-nums;
        }
        .pl-ambang-teks { font-size: 14px; color: var(--text-secondary); }
        .pl-ambang-garis {
          height: 5px; border-radius: 3px; background: var(--surface-hover);
          margin: 14px 0 12px; overflow: hidden;
        }
        .pl-ambang-isi { display: block; height: 100%; transition: width 320ms ease; }
        .pl-ambang-kaki { display: flex; flex-wrap: wrap; gap: 14px; }
        .pl-sev-kecil {
          display: inline-flex; align-items: center; gap: 6px;
          font-size: 12.5px; font-weight: 500; font-variant-numeric: tabular-nums;
        }
        .pl-sev-kecil i { width: 7px; height: 7px; border-radius: 50%; display: block; }

        /* ── Papan kolom ─────────────────────────────────────────────────── */
        .pl-papan {
          display: grid; gap: 16px;
          grid-template-columns: repeat(auto-fit, minmax(268px, 1fr));
          align-items: start;
        }
        .pl-kolom-judul {
          display: flex; align-items: center; gap: 8px; margin: 0 0 10px;
          font-size: 12px; font-weight: 600; text-transform: uppercase;
          letter-spacing: 0.06em; color: var(--text-muted);
        }
        .pl-kolom-n {
          font-size: 11px; padding: 1px 7px; border-radius: 9px;
          background: var(--surface-hover); color: var(--text-secondary);
          letter-spacing: 0; font-variant-numeric: tabular-nums;
        }
        .pl-daftar { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }

        .pl-kartu {
          background: var(--surface); border: 1px solid var(--border);
          border-radius: var(--radius-md); padding: 13px 14px;
        }
        .pl-kartu-atas {
          display: flex; align-items: center; justify-content: space-between;
          gap: 8px; margin-bottom: 8px;
        }
        .pl-sev {
          font-size: 11px; font-weight: 600; padding: 2px 8px;
          border-radius: 4px; letter-spacing: 0.02em;
        }
        .pl-nomor {
          font-size: 11.5px; color: var(--text-muted);
          font-variant-numeric: tabular-nums; letter-spacing: 0.02em;
        }
        .pl-kartu-judul {
          margin: 0 0 8px; font-size: 14.5px; font-weight: 500;
          color: var(--text-primary); line-height: 1.4;
        }
        .pl-meta {
          display: flex; align-items: center; gap: 6px; margin: 0 0 5px;
          font-size: 12.5px; color: var(--text-secondary);
        }
        .pl-terverifikasi { color: var(--success); }
        .pl-inisial {
          width: 18px; height: 18px; border-radius: 50%;
          background: var(--navy-light); color: var(--navy);
          font-size: 10px; font-weight: 600;
          display: inline-flex; align-items: center; justify-content: center;
        }
        .pl-alasan {
          margin: 6px 0 0; padding: 7px 10px; font-size: 12.5px;
          background: var(--surface-subtle); border-left: 2px solid var(--border-strong);
          color: var(--text-secondary); border-radius: 0 4px 4px 0;
        }

        .pl-aksi { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 11px; }
        .pl-aksi-tombol {
          display: inline-flex; align-items: center; gap: 5px;
          min-height: 34px; padding: 0 10px;
          border: 1px solid var(--border); border-radius: var(--radius-sm);
          background: var(--surface); color: var(--text-secondary);
          font-size: 12.5px; font-family: inherit; cursor: pointer;
          transition: background 130ms ease, color 130ms ease;
        }
        .pl-aksi-tombol:hover:not(:disabled) {
          background: var(--surface-hover); color: var(--text-primary);
        }
        .pl-aksi-tombol:disabled { opacity: 0.55; cursor: wait; }
        .pl-aksi-utama {
          border-color: var(--success-border); background: var(--success-bg);
          color: var(--success); font-weight: 500;
        }
        .pl-aksi-utama:hover:not(:disabled) {
          background: var(--success-border); color: var(--success);
        }

        /* ── Keadaan ─────────────────────────────────────────────────────── */
        .pl-memuat, .pl-kosong, .pl-galat {
          display: flex; align-items: center; justify-content: center;
          gap: 10px; padding: 40px 20px; color: var(--text-secondary); font-size: 14px;
        }
        .pl-kosong {
          flex-direction: column; gap: 8px; text-align: center;
          background: var(--surface); border: 1px dashed var(--border-strong);
          border-radius: var(--radius-lg); color: var(--text-muted); padding: 48px 24px;
        }
        .pl-kosong-judul {
          margin: 6px 0 0; font-size: 15px; font-weight: 500; color: var(--text-primary);
        }
        .pl-kosong-teks { margin: 0 0 8px; max-width: 380px; line-height: 1.55; }
        .pl-galat {
          background: var(--danger-bg); border: 1px solid var(--danger-border);
          border-radius: var(--radius-md); color: var(--danger); justify-content: flex-start;
        }

        .pl-putar { animation: pl-spin 900ms linear infinite; }
        @keyframes pl-spin { to { transform: rotate(360deg); } }

        /* Di HP kolom jadi tumpukan — urutan status tetap jadi urutan baca. */
        @media (max-width: 640px) {
          .pl-kepala-aksi { width: 100%; }
          .pl-pilih { max-width: none; width: 100%; }
          .pl-pilih-bungkus { flex: 1; }
          .pl-ambang-n { font-size: 36px; }
          .pl-papan { grid-template-columns: 1fr; }
        }

        @media (prefers-reduced-motion: reduce) {
          .pl-ambang-isi, .pl-tombol-utama, .pl-aksi-tombol { transition: none; }
          .pl-putar { animation: none; }
        }
      `}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Form catat temuan
// ═══════════════════════════════════════════════════════════════════════════

function FormTemuan({
  proyekId, onTutup, onSimpan,
}: { proyekId: string; onTutup: () => void; onSimpan: () => void }) {
  const { showToast } = useToast();
  const [judul, setJudul] = useState("");
  const [lokasi, setLokasi] = useState("");
  const [deskripsi, setDeskripsi] = useState("");
  const [severity, setSeverity] = useState<PunchItem["severity"]>("sedang");
  const [target, setTarget] = useState("");
  const [menyimpan, setMenyimpan] = useState(false);
  const judulRef = useRef<HTMLInputElement>(null);

  useEffect(() => { judulRef.current?.focus(); }, []);

  // Esc menutup — orang yang salah menekan tombol harus bisa keluar tanpa
  // mencari tombol X di layar kecil.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onTutup(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onTutup]);

  const simpan = async () => {
    if (!judul.trim()) {
      showToast("error", "Tulis dulu apa yang salah.");
      judulRef.current?.focus();
      return;
    }
    setMenyimpan(true);
    try {
      await api.post(`/api/v1/projects/${proyekId}/punch-items`, {
        judul: judul.trim(),
        lokasi: lokasi.trim() || undefined,
        deskripsi: deskripsi.trim() || undefined,
        severity,
        target_selesai: target || undefined,
      });
      showToast("success", "Temuan tercatat.");
      onSimpan();
    } catch (e) {
      const pesan = (e as { response?: { data?: { error?: string } } }).response?.data?.error;
      showToast("error", pesan ?? "Temuan tidak bisa disimpan.");
    } finally {
      setMenyimpan(false);
    }
  };

  return (
    <div className="ft-tirai" role="dialog" aria-modal="true" aria-labelledby="ft-judul">
      <div className="ft-panel">
        <header className="ft-kepala">
          <h2 id="ft-judul">Catat temuan</h2>
          <button className="ft-tutup" onClick={onTutup} aria-label="Tutup">
            <X size={18} aria-hidden />
          </button>
        </header>

        <div className="ft-isi">
          <label className="ft-baris">
            <span className="ft-label">Apa yang salah</span>
            <input
              ref={judulRef}
              className="ft-input"
              value={judul}
              onChange={(e) => setJudul(e.target.value)}
              placeholder="Plafon bocor di kamar utama"
              maxLength={200}
            />
          </label>

          <label className="ft-baris">
            <span className="ft-label">Di mana</span>
            <input
              className="ft-input"
              value={lokasi}
              onChange={(e) => setLokasi(e.target.value)}
              placeholder="Lantai 2, sisi timur"
              maxLength={200}
            />
            <span className="ft-bantu">
              Tulis seperti kalau menunjukkan tempatnya ke orang lain.
            </span>
          </label>

          <fieldset className="ft-baris ft-fieldset">
            <legend className="ft-label">Seberapa gawat</legend>
            <div className="ft-sev-grup">
              {(["ringan", "sedang", "berat", "kritis"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`ft-sev${severity === s ? " ft-sev-pilih" : ""}`}
                  style={severity === s
                    ? { borderColor: SEVERITY[s].warna, background: SEVERITY[s].bg, color: SEVERITY[s].warna }
                    : undefined}
                  aria-pressed={severity === s}
                  onClick={() => setSeverity(s)}
                >
                  {SEVERITY[s].label}
                </button>
              ))}
            </div>
            <span className="ft-bantu">
              {severity === "kritis"
                ? "Keselamatan atau struktur — pekerjaan di sekitarnya berhenti."
                : severity === "berat"
                  ? "Menghalangi pekerjaan lanjutan."
                  : severity === "sedang"
                    ? "Harus selesai sebelum serah terima."
                    : "Kosmetik — tidak menghalangi serah terima."}
            </span>
          </fieldset>

          <label className="ft-baris">
            <span className="ft-label">Target selesai <em>(boleh dikosongkan)</em></span>
            <input
              type="date"
              className="ft-input"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
          </label>

          <label className="ft-baris">
            <span className="ft-label">Catatan tambahan <em>(boleh dikosongkan)</em></span>
            <textarea
              className="ft-input ft-area"
              value={deskripsi}
              onChange={(e) => setDeskripsi(e.target.value)}
              rows={3}
              placeholder="Rembes muncul setelah hujan dua hari"
            />
          </label>

          <p className="ft-catatan">
            <Camera size={14} aria-hidden />
            Lampirkan foto dari halaman dokumentasi proyek setelah temuan tersimpan.
          </p>
        </div>

        <footer className="ft-kaki">
          <button className="ft-batal" onClick={onTutup} disabled={menyimpan}>Batal</button>
          <button className="ft-simpan" onClick={() => void simpan()} disabled={menyimpan}>
            {menyimpan ? <Loader2 size={15} className="ft-putar" aria-hidden /> : null}
            Catat temuan
          </button>
        </footer>
      </div>

      <style jsx>{`
        .ft-tirai {
          position: fixed; inset: 0; z-index: 60;
          background: rgba(17, 24, 39, 0.45);
          display: flex; align-items: center; justify-content: center; padding: 16px;
        }
        .ft-panel {
          background: var(--surface); border-radius: var(--radius-lg);
          width: 100%; max-width: 480px; max-height: 92vh;
          display: flex; flex-direction: column; overflow: hidden;
          box-shadow: 0 18px 44px rgba(0,0,0,0.18);
        }
        .ft-kepala {
          display: flex; align-items: center; justify-content: space-between;
          padding: 16px 18px; border-bottom: 1px solid var(--border);
        }
        .ft-kepala h2 {
          margin: 0; font-family: var(--font-display);
          font-size: 17px; font-weight: 600; color: var(--text-primary);
        }
        .ft-tutup {
          min-width: 36px; min-height: 36px; border: none; background: none;
          color: var(--text-muted); cursor: pointer; border-radius: var(--radius-sm);
          display: flex; align-items: center; justify-content: center;
        }
        .ft-tutup:hover { background: var(--surface-hover); color: var(--text-primary); }

        .ft-isi { padding: 18px; overflow-y: auto; display: grid; gap: 15px; }
        .ft-baris { display: grid; gap: 6px; }
        .ft-fieldset { border: none; padding: 0; margin: 0; }
        .ft-label {
          font-size: 13px; font-weight: 500; color: var(--text-primary); padding: 0;
        }
        .ft-label em { font-style: normal; font-weight: 400; color: var(--text-muted); }
        .ft-bantu { font-size: 12px; color: var(--text-muted); line-height: 1.45; }

        .ft-input {
          min-height: 44px; padding: 10px 12px; width: 100%; box-sizing: border-box;
          border: 1px solid var(--border); border-radius: var(--radius-md);
          background: var(--surface); color: var(--text-primary);
          font-size: 15px; font-family: inherit;
        }
        .ft-input:focus-visible {
          outline: 2px solid var(--navy); outline-offset: 1px; border-color: var(--navy);
        }
        .ft-area { min-height: 74px; resize: vertical; line-height: 1.5; }

        .ft-sev-grup { display: flex; gap: 6px; flex-wrap: wrap; }
        .ft-sev {
          min-height: 44px; padding: 0 14px; flex: 1; min-width: 74px;
          border: 1px solid var(--border); border-radius: var(--radius-md);
          background: var(--surface); color: var(--text-secondary);
          font-size: 13.5px; font-family: inherit; cursor: pointer;
          transition: border-color 130ms ease, background 130ms ease;
        }
        .ft-sev-pilih { font-weight: 600; }

        .ft-catatan {
          display: flex; align-items: center; gap: 7px; margin: 0;
          font-size: 12.5px; color: var(--text-muted);
        }

        .ft-kaki {
          display: flex; gap: 9px; justify-content: flex-end;
          padding: 14px 18px; border-top: 1px solid var(--border);
          background: var(--surface-subtle);
        }
        .ft-batal, .ft-simpan {
          min-height: 44px; padding: 0 17px; border-radius: var(--radius-md);
          font-size: 14px; font-family: inherit; cursor: pointer;
          display: inline-flex; align-items: center; gap: 7px;
        }
        .ft-batal {
          border: 1px solid var(--border); background: var(--surface);
          color: var(--text-secondary);
        }
        .ft-simpan {
          border: none; background: var(--navy); color: var(--on-navy); font-weight: 500;
        }
        .ft-simpan:disabled, .ft-batal:disabled { opacity: 0.55; cursor: wait; }
        .ft-putar { animation: ft-spin 900ms linear infinite; }
        @keyframes ft-spin { to { transform: rotate(360deg); } }

        @media (max-width: 640px) {
          .ft-tirai { align-items: flex-end; padding: 0; }
          .ft-panel { max-width: none; max-height: 94vh; border-radius: 16px 16px 0 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .ft-sev { transition: none; }
          .ft-putar { animation: none; }
        }
      `}</style>
    </div>
  );
}
