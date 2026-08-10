"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/components/toast";
import {
  MessageSquareQuote, Plus, Send, CheckCircle2, X, AlertTriangle,
  ChevronDown, Loader2, FileText, Ban,
} from "lucide-react";

// ═══════════════════════════════════════════════════════════════════════════
// REQUEST FOR INFORMATION — pertanyaan resmi ke konsultan / pemberi kerja.
//
// Ini BUKAN halaman lapangan. Yang membukanya duduk di kantor proyek, dan
// yang ia cari bukan "apa berikutnya" melainkan "apa yang masih menggantung
// dan sudah berapa lama". Karena itu bentuknya daftar berurut waktu, bukan
// kolom antrean seperti punch list dan inspeksi.
//
// Angka yang paling menentukan: HARI MENGGANTUNG. Ia dihitung di server —
// dua tempat yang menghitung sendiri-sendiri pada akhirnya akan berbeda, dan
// angka ini masuk berkas klaim perpanjangan waktu.
// ═══════════════════════════════════════════════════════════════════════════

interface Rfi {
  id: string;
  nomor: string;
  perihal: string;
  pertanyaan: string;
  ditujukan_ke: string | null;
  referensi_gambar: string | null;
  status: "draft" | "terkirim" | "dijawab" | "ditutup" | "dibatalkan";
  dikirim_pada: string | null;
  jawaban_diharapkan: string | null;
  dijawab_pada: string | null;
  jawaban: string | null;
  dijawab_oleh: string | null;
  menghentikan_pekerjaan: boolean;
  pekerjaan_terdampak: string | null;
  eot_id: string | null;
  eot: { id: string; eot_number: string; days_requested: number; status: string } | null;
  pengaju: { id: string; name: string } | null;
  hari_menggantung: number | null;
  terlambat: boolean;
  created_at: string;
}

interface MetaRfi {
  per_status: Record<string, number>;
  total: number;
  menggantung: number;
  terlambat: number;
  memblokir: number;
  menggantung_terlama_hari: number;
  rekap_lengkap: boolean;
}

const STATUS_LABEL: Record<Rfi["status"], string> = {
  draft: "Konsep",
  terkirim: "Menunggu jawaban",
  dijawab: "Sudah dijawab",
  ditutup: "Selesai",
  dibatalkan: "Dibatalkan",
};

const STATUS_WARNA: Record<Rfi["status"], { warna: string; bg: string }> = {
  draft:      { warna: "var(--text-muted)", bg: "var(--surface-subtle)" },
  terkirim:   { warna: "var(--warning)",    bg: "var(--warning-bg)" },
  dijawab:    { warna: "var(--info)",       bg: "var(--info-bg)" },
  ditutup:    { warna: "var(--success)",    bg: "var(--success-bg)" },
  dibatalkan: { warna: "var(--text-muted)", bg: "var(--surface-subtle)" },
};

const tanggal = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : null;

export default function RfiPage() {
  const { showToast } = useToast();
  const [proyek, setProyek] = useState<Array<{ id: string; name: string }>>([]);
  const [proyekId, setProyekId] = useState<string>("");
  const [items, setItems] = useState<Rfi[]>([]);
  const [meta, setMeta] = useState<MetaRfi | null>(null);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);
  const [formTerbuka, bukaForm] = useState(false);
  const [sedangUbah, setSedangUbah] = useState<string | null>(null);
  const [terbuka, setTerbuka] = useState<Set<string>>(new Set());
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
      const r = await api.get(`/api/v1/projects/${pid}/rfis`, { signal: ac.signal });
      setItems(r.data?.data ?? []);
      setMeta(r.data?.meta ?? null);
    } catch (e) {
      if ((e as { name?: string }).name === "CanceledError") return;
      setGalat("Daftar RFI tidak bisa dimuat. Periksa koneksi lalu muat ulang.");
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

  const kirim = async (it: Rfi) => {
    setSedangUbah(it.id);
    try {
      const r = await api.patch(`/api/v1/rfis/${it.id}/status`, { status: "terkirim" });
      setItems((k) => k.map((x) => (x.id === it.id ? r.data.data : x)));
      void muat(proyekId);
      showToast("success", `${it.nomor} dicatat terkirim.`);
    } catch (e) {
      const p = (e as { response?: { data?: { error?: string } } }).response?.data?.error;
      showToast("error", p ?? "Status tidak bisa diubah.");
    } finally { setSedangUbah(null); }
  };

  const catatJawaban = async (it: Rfi) => {
    const jawaban = window.prompt(
      `Jawaban untuk ${it.nomor} — ${it.perihal}\n\n` +
      "Tulis isi jawabannya, bukan ringkasan: dokumen ini yang dipakai " +
      "kalau kemudian ada perselisihan."
    );
    if (jawaban === null) return;
    if (!jawaban.trim()) { showToast("error", "Isi jawaban wajib diisi."); return; }
    const dari = window.prompt("Dijawab oleh siapa? (boleh dikosongkan)") ?? "";

    setSedangUbah(it.id);
    try {
      const r = await api.patch(`/api/v1/rfis/${it.id}/status`, {
        status: "dijawab",
        jawaban: jawaban.trim(),
        ...(dari.trim() ? { dijawab_oleh: dari.trim() } : {}),
      });
      setItems((k) => k.map((x) => (x.id === it.id ? r.data.data : x)));
      void muat(proyekId);
      const hari = r.data?.data?.hari_menggantung;
      showToast(
        "success",
        typeof hari === "number"
          ? `Jawaban tercatat — menggantung ${hari} hari.`
          : "Jawaban tercatat."
      );
    } catch (e) {
      const p = (e as { response?: { data?: { error?: string } } }).response?.data?.error;
      showToast("error", p ?? "Jawaban tidak bisa disimpan.");
    } finally { setSedangUbah(null); }
  };

  const ubahStatus = async (it: Rfi, status: Rfi["status"]) => {
    setSedangUbah(it.id);
    try {
      const r = await api.patch(`/api/v1/rfis/${it.id}/status`, { status });
      setItems((k) => k.map((x) => (x.id === it.id ? r.data.data : x)));
      void muat(proyekId);
      showToast("success", `${it.nomor} → ${STATUS_LABEL[status].toLowerCase()}`);
    } catch (e) {
      const p = (e as { response?: { data?: { error?: string } } }).response?.data?.error;
      showToast("error", p ?? "Status tidak bisa diubah.");
    } finally { setSedangUbah(null); }
  };

  // Yang menggantung didahulukan, lalu yang paling lama. Urutan waktu murni
  // menyembunyikan pertanyaan lama di bawah pertanyaan baru yang belum
  // mendesak — dan yang lama itulah yang jadi perkara.
  const urut = useMemo(() => {
    const bobot: Record<Rfi["status"], number> = {
      terkirim: 0, dijawab: 1, draft: 2, ditutup: 3, dibatalkan: 4,
    };
    return [...items].sort((a, b) => {
      if (bobot[a.status] !== bobot[b.status]) return bobot[a.status] - bobot[b.status];
      return (b.hari_menggantung ?? -1) - (a.hari_menggantung ?? -1);
    });
  }, [items]);

  const togel = (id: string) =>
    setTerbuka((k) => {
      const b = new Set(k);
      if (b.has(id)) b.delete(id); else b.add(id);
      return b;
    });

  return (
    <div className="rf-halaman">
      <header className="rf-kepala">
        <div>
          <h1 className="rf-judul">
            <MessageSquareQuote size={22} aria-hidden />
            Request for Information
          </h1>
          <p className="rf-sub">
            Pertanyaan resmi ke konsultan atau pemberi kerja, beserta jawabannya.
          </p>
        </div>
        <div className="rf-kepala-aksi">
          <label className="rf-pilih-bungkus">
            <select
              className="rf-pilih"
              aria-label="Pilih proyek yang RFI-nya ditampilkan"
              value={proyekId}
              onChange={(e) => setProyekId(e.target.value)}
            >
              {proyek.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <ChevronDown size={16} className="rf-pilih-ikon" aria-hidden />
          </label>
          <button className="rf-tombol-utama" onClick={() => bukaForm(true)} disabled={!proyekId}>
            <Plus size={17} aria-hidden /> Ajukan pertanyaan
          </button>
        </div>
      </header>

      {/* Tiga angka, bukan grid KPI. Yang ditanyakan orang saat membuka halaman
          ini persis tiga: berapa menggantung, berapa lama yang terlama, berapa
          yang menghentikan pekerjaan. */}
      {meta && (
        <section className="rf-ringkas" aria-live="polite">
          <div className="rf-angka">
            <span className="rf-angka-n" style={{
              color: meta.menggantung ? "var(--warning)" : "var(--success)",
            }}>{meta.menggantung}</span>
            <span className="rf-angka-label">menunggu jawaban</span>
          </div>
          <div className="rf-pisah" aria-hidden />
          <div className="rf-angka">
            <span className="rf-angka-n" style={{
              color: meta.menggantung_terlama_hari > 14 ? "var(--danger)"
                : meta.menggantung_terlama_hari > 7 ? "var(--warning)" : "var(--text-primary)",
            }}>{meta.menggantung_terlama_hari}</span>
            <span className="rf-angka-label">hari terlama menggantung</span>
          </div>
          <div className="rf-pisah" aria-hidden />
          <div className="rf-angka">
            <span className="rf-angka-n" style={{
              color: meta.memblokir ? "var(--danger)" : "var(--text-primary)",
            }}>{meta.memblokir}</span>
            <span className="rf-angka-label">menghentikan pekerjaan</span>
          </div>

          {meta.memblokir > 0 && (
            <p className="rf-catatan-klaim">
              <AlertTriangle size={14} aria-hidden />
              Pertanyaan yang menghentikan pekerjaan dan lama dijawab bisa jadi
              dasar klaim perpanjangan waktu — tautkan ke klaim EOT setelah
              jawabannya masuk.
            </p>
          )}
          {!meta.rekap_lengkap && (
            <p className="rf-catatan-klaim">
              <AlertTriangle size={14} aria-hidden /> Rekap tidak lengkap.
            </p>
          )}
        </section>
      )}

      {galat ? (
        <div className="rf-galat" role="alert">
          <AlertTriangle size={18} aria-hidden />
          <span>{galat}</span>
          <button className="rf-tombol-halus" onClick={() => void muat(proyekId)}>Muat ulang</button>
        </div>
      ) : memuat ? (
        <div className="rf-memuat" aria-live="polite">
          <Loader2 size={18} className="rf-putar" aria-hidden /> Memuat RFI…
        </div>
      ) : items.length === 0 ? (
        <div className="rf-kosong">
          <MessageSquareQuote size={30} aria-hidden />
          <p className="rf-kosong-judul">Belum ada pertanyaan resmi di proyek ini.</p>
          <p className="rf-kosong-teks">
            Catat pertanyaan ke konsultan di sini, bukan lewat pesan pribadi.
            Jawaban yang tercatat beserta tanggalnya adalah bukti kalau kemudian
            ada perselisihan soal siapa yang menahan pekerjaan.
          </p>
          <button className="rf-tombol-utama" onClick={() => bukaForm(true)}>
            <Plus size={17} aria-hidden /> Ajukan pertanyaan pertama
          </button>
        </div>
      ) : (
        <ul className="rf-daftar">
          {urut.map((it) => {
            const w = STATUS_WARNA[it.status];
            const buka = terbuka.has(it.id);
            return (
              <li key={it.id} className={`rf-kartu${it.terlambat ? " rf-kartu-lewat" : ""}`}>
                <button
                  className="rf-kartu-kepala"
                  onClick={() => togel(it.id)}
                  aria-expanded={buka}
                >
                  <div className="rf-kartu-kiri">
                    <div className="rf-baris-atas">
                      <span className="rf-nomor">{it.nomor}</span>
                      <span className="rf-status" style={{ color: w.warna, background: w.bg }}>
                        {STATUS_LABEL[it.status]}
                      </span>
                      {it.menghentikan_pekerjaan && (
                        <span className="rf-blokir">
                          <Ban size={11} aria-hidden /> menghentikan pekerjaan
                        </span>
                      )}
                    </div>
                    <p className="rf-perihal">{it.perihal}</p>
                    <p className="rf-meta">
                      {it.ditujukan_ke ? `Ke ${it.ditujukan_ke}` : "Tujuan belum diisi"}
                      {it.dikirim_pada && ` · dikirim ${tanggal(it.dikirim_pada)}`}
                    </p>
                  </div>

                  {/* Hari menggantung adalah angka yang dibaca duluan — ia
                      diletakkan di kanan dengan ukuran yang menuntut perhatian
                      tanpa berteriak. */}
                  {it.hari_menggantung !== null && (
                    <div className="rf-hari">
                      <span
                        className="rf-hari-n"
                        style={{
                          color: it.status === "terkirim"
                            ? (it.hari_menggantung > 14 ? "var(--danger)"
                              : it.hari_menggantung > 7 ? "var(--warning)" : "var(--text-primary)")
                            : "var(--text-muted)",
                        }}
                      >
                        {it.hari_menggantung}
                      </span>
                      <span className="rf-hari-label">
                        hari{it.status === "terkirim" ? "" : " (selesai)"}
                      </span>
                    </div>
                  )}
                  <ChevronDown
                    size={17}
                    className={`rf-panah${buka ? " rf-panah-buka" : ""}`}
                    aria-hidden
                  />
                </button>

                {buka && (
                  <div className="rf-isi">
                    <div className="rf-blok">
                      <span className="rf-blok-label">Pertanyaan</span>
                      <p className="rf-blok-teks">{it.pertanyaan}</p>
                      {it.referensi_gambar && (
                        <p className="rf-referensi">
                          <FileText size={13} aria-hidden /> {it.referensi_gambar}
                        </p>
                      )}
                    </div>

                    {it.pekerjaan_terdampak && (
                      <div className="rf-blok">
                        <span className="rf-blok-label">Pekerjaan terdampak</span>
                        <p className="rf-blok-teks">{it.pekerjaan_terdampak}</p>
                      </div>
                    )}

                    {it.jawaban && (
                      <div className="rf-blok rf-blok-jawaban">
                        <span className="rf-blok-label">
                          Jawaban
                          {it.dijawab_oleh && ` — ${it.dijawab_oleh}`}
                          {it.dijawab_pada && ` · ${tanggal(it.dijawab_pada)}`}
                        </span>
                        <p className="rf-blok-teks">{it.jawaban}</p>
                      </div>
                    )}

                    {it.eot && (
                      <p className="rf-eot">
                        Ditautkan ke klaim {it.eot.eot_number} ({it.eot.days_requested} hari,
                        {" "}{it.eot.status})
                      </p>
                    )}

                    <div className="rf-aksi">
                      {it.status === "draft" && (
                        <button
                          className="rf-aksi-tombol rf-aksi-utama"
                          onClick={() => void kirim(it)}
                          disabled={sedangUbah === it.id}
                        >
                          {sedangUbah === it.id
                            ? <Loader2 size={13} className="rf-putar" aria-hidden />
                            : <Send size={13} aria-hidden />}
                          Catat terkirim
                        </button>
                      )}
                      {it.status === "terkirim" && (
                        <button
                          className="rf-aksi-tombol rf-aksi-utama"
                          onClick={() => void catatJawaban(it)}
                          disabled={sedangUbah === it.id}
                        >
                          {sedangUbah === it.id
                            ? <Loader2 size={13} className="rf-putar" aria-hidden />
                            : <CheckCircle2 size={13} aria-hidden />}
                          Catat jawaban
                        </button>
                      )}
                      {it.status === "dijawab" && (
                        <>
                          <button
                            className="rf-aksi-tombol rf-aksi-utama"
                            onClick={() => void ubahStatus(it, "ditutup")}
                            disabled={sedangUbah === it.id}
                          >
                            <CheckCircle2 size={13} aria-hidden /> Tutup
                          </button>
                          <button
                            className="rf-aksi-tombol"
                            onClick={() => void ubahStatus(it, "terkirim")}
                            disabled={sedangUbah === it.id}
                          >
                            Jawaban belum menjawab
                          </button>
                        </>
                      )}
                      {(it.status === "draft" || it.status === "terkirim") && (
                        <button
                          className="rf-aksi-tombol"
                          onClick={() => void ubahStatus(it, "dibatalkan")}
                          disabled={sedangUbah === it.id}
                        >
                          <X size={13} aria-hidden /> Batalkan
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {formTerbuka && (
        <FormRfi
          proyekId={proyekId}
          onTutup={() => bukaForm(false)}
          onSimpan={() => { bukaForm(false); void muat(proyekId); }}
        />
      )}

      <style jsx>{`
        .rf-halaman {
          padding: var(--pad-atas) var(--pad-x) var(--pad-bawah);
          width: 100%; max-width: var(--w-page); margin: 0 auto;
        }
        .rf-kepala {
          display: flex; flex-wrap: wrap; gap: var(--gap-bagian);
          align-items: flex-end; justify-content: space-between; margin-bottom: 20px;
        }
        .rf-judul {
          display: flex; align-items: center; gap: 9px; margin: 0;
          font-family: var(--font-display); font-size: 24px; font-weight: 600;
          color: var(--text-primary); letter-spacing: -0.01em;
        }
        .rf-sub { margin: 4px 0 0; font-size: 14px; color: var(--text-secondary); }
        .rf-kepala-aksi { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }

        /*
          inline-block, bukan block. Pembungkus block melebar mengikuti
          induknya sementara .rf-pilih di dalamnya dibatasi 240px — dan
          panahnya dipatok ke kanan PEMBUNGKUS, jadi ia melayang di luar kotak
          select. Di layar 1500px panah itu jatuh ke bawah dropdown, terlihat
          seperti kontrolnya rusak.

          (Tanpa backtick: blok gaya ini template literal, dan backtick di
          dalam komentar CSS mengakhirinya — berkasnya berhenti mem-parse.)
        */
        .rf-pilih-bungkus { position: relative; display: block; }
        .rf-pilih {
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
        :global(.rf-pilih-ikon) {
          position: absolute; right: 11px; top: 50%; transform: translateY(-50%);
          color: var(--text-muted); pointer-events: none;
        }
        .rf-tombol-utama {
          display: inline-flex; align-items: center; gap: 7px;
          min-height: 44px; padding: 0 16px; border: none;
          border-radius: var(--radius-md); background: var(--navy);
          color: var(--on-navy); font-size: 14px; font-weight: 500;
          font-family: inherit; cursor: pointer; transition: background 140ms ease;
        }
        .rf-tombol-utama:hover:not(:disabled) { background: var(--navy-mid); }
        .rf-tombol-utama:disabled { opacity: 0.5; cursor: not-allowed; }
        .rf-tombol-halus {
          min-height: 36px; padding: 0 12px; border: 1px solid var(--border);
          border-radius: var(--radius-sm); background: var(--surface);
          color: var(--text-primary); font-size: 13px; font-family: inherit; cursor: pointer;
        }

        .rf-ringkas {
          display: flex; flex-wrap: wrap; align-items: center; gap: var(--gap-bagian);
          background: var(--surface); border: 1px solid var(--border);
          border-radius: var(--radius-lg); padding: var(--pad-kartu-lega) 22px; margin-bottom: 22px;
        }
        .rf-angka { display: flex; align-items: baseline; gap: 9px; }
        .rf-angka-n {
          font-family: var(--font-display); font-size: 34px; font-weight: 700;
          line-height: 1; letter-spacing: -0.03em; font-variant-numeric: tabular-nums;
        }
        .rf-angka-label { font-size: 13px; color: var(--text-secondary); }
        .rf-pisah { width: 1px; align-self: stretch; background: var(--border); }
        .rf-catatan-klaim {
          flex-basis: 100%; display: flex; align-items: flex-start; gap: 7px;
          margin: 4px 0 0; font-size: 12.5px; color: var(--text-muted); line-height: 1.5;
        }

        .rf-daftar { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
        .rf-kartu {
          background: var(--surface); border: 1px solid var(--border);
          border-radius: var(--radius-md); overflow: hidden;
        }
        .rf-kartu-lewat { border-left: 3px solid var(--danger); }

        .rf-kartu-kepala {
          width: 100%; display: flex; align-items: center; gap: 14px;
          padding: 14px 16px; background: none; border: none; cursor: pointer;
          text-align: left; font-family: inherit;
        }
        .rf-kartu-kepala:hover { background: var(--surface-subtle); }
        .rf-kartu-kiri { flex: 1; min-width: 0; }
        .rf-baris-atas {
          display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 5px;
        }
        .rf-nomor {
          font-size: 11.5px; color: var(--text-muted);
          font-variant-numeric: tabular-nums; letter-spacing: 0.02em;
        }
        .rf-status {
          font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 4px;
        }
        .rf-blokir {
          display: inline-flex; align-items: center; gap: 4px;
          font-size: 11px; padding: 2px 8px; border-radius: 4px;
          background: var(--danger-bg); color: var(--danger); font-weight: 500;
        }
        .rf-perihal {
          margin: 0 0 3px; font-size: 14.5px; font-weight: 500;
          color: var(--text-primary); line-height: 1.4;
        }
        .rf-meta { margin: 0; font-size: 12.5px; color: var(--text-secondary); }

        .rf-hari { text-align: right; flex-shrink: 0; }
        .rf-hari-n {
          display: block; font-family: var(--font-display); font-size: 22px;
          font-weight: 700; line-height: 1; font-variant-numeric: tabular-nums;
        }
        .rf-hari-label { font-size: 11px; color: var(--text-muted); }
        .rf-panah {
          color: var(--text-muted); flex-shrink: 0;
          transition: transform 180ms ease;
        }
        .rf-panah-buka { transform: rotate(180deg); }

        .rf-isi {
          padding: 4px 16px 16px; border-top: 1px solid var(--border);
          display: grid; gap: 14px;
        }
        .rf-blok { display: grid; gap: 5px; }
        .rf-blok-label {
          font-size: 11px; font-weight: 600; text-transform: uppercase;
          letter-spacing: 0.05em; color: var(--text-muted);
        }
        .rf-blok-teks {
          margin: 0; font-size: 14px; color: var(--text-primary);
          line-height: 1.6; white-space: pre-wrap;
        }
        .rf-blok-jawaban {
          padding: 11px 13px; background: var(--info-bg);
          border-left: 3px solid var(--info); border-radius: 0 6px 6px 0;
        }
        .rf-referensi {
          display: flex; align-items: center; gap: 6px; margin: 2px 0 0;
          font-size: 12.5px; color: var(--text-secondary);
        }
        .rf-eot {
          margin: 0; padding: 8px 11px; font-size: 12.5px;
          background: var(--warning-bg); border-radius: var(--radius-sm);
          color: var(--warning);
        }

        .rf-aksi { display: flex; flex-wrap: wrap; gap: 7px; }
        .rf-aksi-tombol {
          display: inline-flex; align-items: center; gap: 6px;
          min-height: 38px; padding: 0 13px;
          border: 1px solid var(--border); border-radius: var(--radius-sm);
          background: var(--surface); color: var(--text-secondary);
          font-size: 13px; font-family: inherit; cursor: pointer;
          transition: background 130ms ease, color 130ms ease;
        }
        .rf-aksi-tombol:hover:not(:disabled) {
          background: var(--surface-hover); color: var(--text-primary);
        }
        .rf-aksi-tombol:disabled { opacity: 0.55; cursor: wait; }
        .rf-aksi-utama {
          border-color: var(--navy); background: var(--navy);
          color: var(--on-navy); font-weight: 500;
        }
        .rf-aksi-utama:hover:not(:disabled) { background: var(--navy-mid); color: var(--on-navy); }

        .rf-memuat, .rf-kosong, .rf-galat {
          display: flex; align-items: center; justify-content: center;
          gap: 10px; padding: 40px 20px; color: var(--text-secondary); font-size: 14px;
        }
        .rf-kosong {
          flex-direction: column; gap: 8px; text-align: center;
          background: var(--surface); border: 1px dashed var(--border-strong);
          border-radius: var(--radius-lg); color: var(--text-muted); padding: 48px 24px;
        }
        .rf-kosong-judul {
          margin: 6px 0 0; font-size: 15px; font-weight: 500; color: var(--text-primary);
        }
        .rf-kosong-teks { margin: 0 0 8px; max-width: 460px; line-height: 1.6; }
        .rf-galat {
          background: var(--danger-bg); border: 1px solid var(--danger-border);
          border-radius: var(--radius-md); color: var(--danger); justify-content: flex-start;
        }
        .rf-putar { animation: rf-spin 900ms linear infinite; }
        @keyframes rf-spin { to { transform: rotate(360deg); } }

        @media (max-width: 640px) {
          .rf-kepala-aksi { width: 100%; }
          .rf-pilih { max-width: none; width: 100%; }
          .rf-pilih-bungkus { flex: 1; }
          .rf-ringkas { gap: var(--gap-bagian); }
          .rf-pisah { display: none; }
          .rf-angka { flex-basis: 100%; }
          .rf-angka-n { font-size: 28px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .rf-panah, .rf-tombol-utama, .rf-aksi-tombol { transition: none; }
          .rf-putar { animation: none; }
        }
      `}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════

function FormRfi({
  proyekId, onTutup, onSimpan,
}: { proyekId: string; onTutup: () => void; onSimpan: () => void }) {
  const { showToast } = useToast();
  const [perihal, setPerihal] = useState("");
  const [pertanyaan, setPertanyaan] = useState("");
  const [tujuan, setTujuan] = useState("");
  const [referensi, setReferensi] = useState("");
  const [diharapkan, setDiharapkan] = useState("");
  const [memblokir, setMemblokir] = useState(false);
  const [terdampak, setTerdampak] = useState("");
  const [menyimpan, setMenyimpan] = useState(false);
  const perihalRef = useRef<HTMLInputElement>(null);

  useEffect(() => { perihalRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onTutup(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onTutup]);

  const simpan = async () => {
    if (!perihal.trim()) {
      showToast("error", "Perihal wajib diisi.");
      perihalRef.current?.focus();
      return;
    }
    if (!pertanyaan.trim()) { showToast("error", "Tulis pertanyaannya."); return; }

    setMenyimpan(true);
    try {
      await api.post(`/api/v1/projects/${proyekId}/rfis`, {
        perihal: perihal.trim(),
        pertanyaan: pertanyaan.trim(),
        ditujukan_ke: tujuan.trim() || undefined,
        referensi_gambar: referensi.trim() || undefined,
        jawaban_diharapkan: diharapkan || undefined,
        menghentikan_pekerjaan: memblokir,
        pekerjaan_terdampak: terdampak.trim() || undefined,
      });
      showToast("success", "RFI tersimpan sebagai konsep.");
      onSimpan();
    } catch (e) {
      const p = (e as { response?: { data?: { error?: string } } }).response?.data?.error;
      showToast("error", p ?? "RFI tidak bisa disimpan.");
    } finally { setMenyimpan(false); }
  };

  return (
    <div className="fr-tirai" role="dialog" aria-modal="true" aria-labelledby="fr-judul">
      <div className="fr-panel">
        <header className="fr-kepala">
          <h2 id="fr-judul">Ajukan pertanyaan</h2>
          <button className="fr-tutup" onClick={onTutup} aria-label="Tutup">
            <X size={18} aria-hidden />
          </button>
        </header>

        <div className="fr-isi">
          <label className="fr-baris">
            <span className="fr-label">Perihal</span>
            <input
              ref={perihalRef} className="fr-input" value={perihal}
              onChange={(e) => setPerihal(e.target.value)}
              placeholder="Detail sambungan balok B3 tidak jelas" maxLength={200}
            />
          </label>

          <label className="fr-baris">
            <span className="fr-label">Pertanyaan</span>
            <textarea
              className="fr-input fr-area" value={pertanyaan} rows={4}
              onChange={(e) => setPertanyaan(e.target.value)}
              placeholder="Pada gambar S-04 rev.2, sambungan balok B3 ke kolom K2 tidak menunjukkan jumlah baut. Mohon konfirmasi jumlah dan diameter yang dipakai."
            />
            <span className="fr-bantu">
              Tulis selengkap yang Anda ingin dijawab. Pertanyaan yang kabur
              dijawab kabur, dan jawabannya tak berguna saat ada perselisihan.
            </span>
          </label>

          <label className="fr-baris">
            <span className="fr-label">Ditujukan ke</span>
            <input
              className="fr-input" value={tujuan}
              onChange={(e) => setTujuan(e.target.value)}
              placeholder="Konsultan struktur — PT Rekayasa Utama" maxLength={200}
            />
          </label>

          <label className="fr-baris">
            <span className="fr-label">Gambar / dokumen rujukan <em>(boleh dikosongkan)</em></span>
            <input
              className="fr-input" value={referensi}
              onChange={(e) => setReferensi(e.target.value)}
              placeholder="Gambar S-04 rev.2, detail B3" maxLength={200}
            />
          </label>

          <label className="fr-baris">
            <span className="fr-label">Jawaban diharapkan sebelum <em>(boleh dikosongkan)</em></span>
            <input
              type="date" className="fr-input" value={diharapkan}
              onChange={(e) => setDiharapkan(e.target.value)}
            />
          </label>

          <div className="fr-baris">
            <label className="fr-centang">
              <input
                type="checkbox" checked={memblokir}
                onChange={(e) => setMemblokir(e.target.checked)}
              />
              <span>Pekerjaan berhenti sampai ini dijawab</span>
            </label>
            <span className="fr-bantu">
              Hanya centang kalau benar-benar berhenti. Pertanyaan yang
              menghentikan pekerjaan dan lama dijawab bisa jadi dasar klaim
              perpanjangan waktu — dan klaim yang dilebih-lebihkan merusak
              seluruh berkasnya.
            </span>
          </div>

          {memblokir && (
            <label className="fr-baris">
              <span className="fr-label">Pekerjaan apa yang berhenti</span>
              <input
                className="fr-input" value={terdampak}
                onChange={(e) => setTerdampak(e.target.value)}
                placeholder="Pemasangan balok lantai 3 as B–D" maxLength={200}
              />
            </label>
          )}
        </div>

        <footer className="fr-kaki">
          <button className="fr-batal" onClick={onTutup} disabled={menyimpan}>Batal</button>
          <button className="fr-simpan" onClick={() => void simpan()} disabled={menyimpan}>
            {menyimpan ? <Loader2 size={15} className="fr-putar" aria-hidden /> : null}
            Simpan konsep
          </button>
        </footer>
      </div>

      <style jsx>{`
        .fr-tirai {
          position: fixed; inset: 0; z-index: 60;
          background: rgba(17,24,39,0.45);
          display: flex; align-items: center; justify-content: center; padding: var(--pad-kartu-lega);
        }
        .fr-panel {
          background: var(--surface); border-radius: var(--radius-lg);
          width: 100%; max-width: 520px; max-height: 92vh;
          display: flex; flex-direction: column; overflow: hidden;
          box-shadow: 0 18px 44px rgba(0,0,0,0.18);
        }
        .fr-kepala {
          display: flex; align-items: center; justify-content: space-between;
          padding: 16px 18px; border-bottom: 1px solid var(--border);
        }
        .fr-kepala h2 {
          margin: 0; font-family: var(--font-display);
          font-size: 17px; font-weight: 600; color: var(--text-primary);
        }
        .fr-tutup {
          min-width: 36px; min-height: 36px; border: none; background: none;
          color: var(--text-muted); cursor: pointer; border-radius: var(--radius-sm);
          display: flex; align-items: center; justify-content: center;
        }
        .fr-tutup:hover { background: var(--surface-hover); color: var(--text-primary); }
        .fr-isi { padding: 18px; overflow-y: auto; display: grid; gap: 15px; }
        .fr-baris { display: grid; gap: 6px; }
        .fr-label { font-size: 13px; font-weight: 500; color: var(--text-primary); }
        .fr-label em { font-style: normal; font-weight: 400; color: var(--text-muted); }
        .fr-bantu { font-size: 12px; color: var(--text-muted); line-height: 1.5; }
        .fr-input {
          min-height: 44px; padding: 10px 12px; width: 100%; box-sizing: border-box;
          border: 1px solid var(--border); border-radius: var(--radius-md);
          background: var(--surface); color: var(--text-primary);
          font-size: 15px; font-family: inherit;
        }
        .fr-input:focus-visible {
          outline: 2px solid var(--navy); outline-offset: 1px; border-color: var(--navy);
        }
        .fr-area { min-height: 96px; resize: vertical; line-height: 1.55; }
        .fr-centang {
          display: flex; align-items: center; gap: 9px; min-height: 44px;
          font-size: 14px; color: var(--text-primary); cursor: pointer;
        }
        .fr-centang input { width: 18px; height: 18px; cursor: pointer; }
        .fr-kaki {
          display: flex; gap: 9px; justify-content: flex-end;
          padding: 14px 18px; border-top: 1px solid var(--border);
          background: var(--surface-subtle);
        }
        .fr-batal, .fr-simpan {
          min-height: 44px; padding: 0 17px; border-radius: var(--radius-md);
          font-size: 14px; font-family: inherit; cursor: pointer;
          display: inline-flex; align-items: center; gap: 7px;
        }
        .fr-batal {
          border: 1px solid var(--border); background: var(--surface);
          color: var(--text-secondary);
        }
        .fr-simpan {
          border: none; background: var(--navy); color: var(--on-navy); font-weight: 500;
        }
        .fr-simpan:disabled, .fr-batal:disabled { opacity: 0.55; cursor: wait; }
        .fr-putar { animation: fr-spin 900ms linear infinite; }
        @keyframes fr-spin { to { transform: rotate(360deg); } }

        @media (max-width: 640px) {
          .fr-tirai { align-items: flex-end; padding: 0; }
          .fr-panel { max-width: none; max-height: 94vh; border-radius: 16px 16px 0 0; }
        }
        @media (prefers-reduced-motion: reduce) { .fr-putar { animation: none; } }
      `}</style>
    </div>
  );
}
