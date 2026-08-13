"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { KepalaHalaman } from "@/components/dasar";
import { bacaDenganCache, type HasilBaca } from "@/lib/cache-baca";
import { PenandaCache } from "@/components/PenandaCache";
import { api } from "@/lib/api";
import { useToast } from "@/components/toast";
import {
  ClipboardList, Plus, MapPin, CheckCircle2, X, Clock,
  AlertTriangle, ArrowRight, ChevronDown, Loader2, ListChecks,
} from "lucide-react";
import { ChecklistInspeksi } from "@/components/checklist-inspeksi";

// ═══════════════════════════════════════════════════════════════════════════
// REQUEST FOR INSPECTION — izin cor, izin tutup.
//
// Berbeda dari punch list, yang mendesak di sini bukan seberapa gawat
// cacatnya, melainkan BERAPA LAMA pekerjaan berhenti menunggu pemeriksa.
// Karena itu tampilannya berpusat pada waktu tunggu, bukan pada severity:
// satu permintaan yang tertahan sejak kemarin lebih penting daripada sepuluh
// yang baru diajukan tadi pagi.
//
// Yang tidak lolos boleh langsung melahirkan temuan punch list — tautannya
// ditampilkan supaya rantainya terlihat: gagal diperiksa → cacat apa → sudah
// ditutup belum.
// ═══════════════════════════════════════════════════════════════════════════

interface Ringkas { id: string; name: string }

interface Inspeksi {
  id: string;
  nomor: string;
  judul: string;
  lokasi: string | null;
  catatan: string | null;
  pekerjaan_lanjutan: string | null;
  status: "diminta" | "dijadwalkan" | "lolos" | "tidak_lolos" | "dibatalkan";
  diminta_untuk: string | null;
  diminta_oleh: string;
  diperiksa_pada: string | null;
  hasil_catatan: string | null;
  punch_item_id: string | null;
  pemohon: Ringkas | null;
  pemeriksa: Ringkas | null;
  temuan: { id: string; nomor: string; judul: string; status: string } | null;
  created_at: string;
}

interface MetaInspeksi {
  per_status: Record<string, number>;
  total: number;
  menunggu: number;
  terlambat: number;
  rekap_lengkap: boolean;
}

const STATUS_LABEL: Record<Inspeksi["status"], string> = {
  diminta: "Menunggu pemeriksa",
  dijadwalkan: "Sudah dijadwalkan",
  lolos: "Lolos",
  tidak_lolos: "Tidak lolos",
  dibatalkan: "Dibatalkan",
};

const URUTAN: Inspeksi["status"][] = [
  "diminta", "dijadwalkan", "lolos", "tidak_lolos", "dibatalkan",
];

/** Cerminan `TRANSISI` di API — tombol yang mustahil tidak ditampilkan. */
const LANJUTAN: Record<Inspeksi["status"], Inspeksi["status"][]> = {
  diminta: ["dijadwalkan", "lolos", "tidak_lolos", "dibatalkan"],
  dijadwalkan: ["lolos", "tidak_lolos", "dibatalkan", "diminta"],
  tidak_lolos: ["diminta", "dibatalkan"],
  lolos: ["diminta"],
  dibatalkan: ["diminta"],
};

const AKSI_LABEL: Record<Inspeksi["status"], string> = {
  diminta: "Ajukan ulang",
  dijadwalkan: "Jadwalkan",
  lolos: "Nyatakan lolos",
  tidak_lolos: "Tidak lolos",
  dibatalkan: "Batalkan",
};

/** Sudah berapa lama menunggu, dalam bahasa yang dipakai orang. */
function lamaMenunggu(sejak: string): string {
  const jam = Math.floor((Date.now() - new Date(sejak).getTime()) / 3_600_000);
  if (jam < 1) return "baru saja";
  if (jam < 24) return `${jam} jam`;
  const hari = Math.floor(jam / 24);
  return hari === 1 ? "1 hari" : `${hari} hari`;
}

const tanggalJam = (d: string | null) =>
  d ? new Date(d).toLocaleString("id-ID", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  }) : null;

/** Company aktif — kunci cache, sama seperti `antrean-offline.ts`. */
function companyAktif(): string {
  if (typeof localStorage === "undefined") return "";
  return localStorage.getItem("puraloka_company_id") ?? "";
}

export default function InspeksiPage() {
  const { showToast } = useToast();
  const [proyek, setProyek] = useState<Array<{ id: string; name: string }>>([]);
  const [proyekId, setProyekId] = useState<string>("");
  const [items, setItems] = useState<Inspeksi[]>([]);
  const [meta, setMeta] = useState<MetaInspeksi | null>(null);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);
  // Keadaan cache dipisah dari datanya: layar perlu tahu checklist ini SEGAR
  // atau TERSIMPAN, dan sejak kapan. Inspeksi yang diputuskan dari daftar
  // lama bisa menutup pekerjaan yang sudah berubah statusnya.
  const [asal, setAsal] = useState<Omit<HasilBaca<unknown>, "data">>({
    dariCache: false, diambil: null, usiaMenit: null, basi: false,
  });
  const [formTerbuka, bukaForm] = useState(false);
  const [sedangUbah, setSedangUbah] = useState<string | null>(null);
  const batalRef = useRef<AbortController | null>(null);

  // Daftar proyek ikut di-cache — ia PRASYARAT halaman ini.
  //
  // Ketahuan dari `uji-baca-offline.mjs`, bukan dari test unit: checklistnya
  // sudah tersimpan dengan benar, tapi halaman tetap kosong offline karena
  // tanpa proyek terpilih `muat()` tak pernah berjalan. Cache di lapisan
  // dalam tak berguna kalau lapisan luarnya gagal lebih dulu.
  useEffect(() => {
    let batal = false;
    void bacaDenganCache<Array<{ id: string; name: string }>>(
      companyAktif(), "/api/v1/projects",
      async () => {
        const r = await api.get("/api/v1/projects");
        return (r.data?.projects ?? []) as Array<{ id: string; name: string }>;
      },
    )
      .then((h) => {
        if (batal) return;
        setProyek(h.data);
        setProyekId((kini) => kini || h.data[0]?.id || "");
        if (h.data.length === 0) setMemuat(false);
      })
      .catch(() => {
        if (!batal) {
          setGalat("Daftar proyek tidak bisa dimuat, dan belum ada salinan tersimpan di perangkat ini.");
          setMemuat(false);
        }
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
      // Jaringan DULU, simpanan di perangkat hanya saat gagal.
      //
      // Checklist inspeksi dibuka DI LOKASI, dan lokasi proyek adalah tempat
      // sinyal paling sering hilang. Sebelum ini, layarnya kosong dengan
      // pesan "periksa koneksi" — benar, tapi tak menolong orang yang sedang
      // berdiri di depan pekerjaan yang harus diperiksa.
      const h = await bacaDenganCache<{ data: unknown[]; meta: unknown }>(
        companyAktif(), `/api/v1/projects/${pid}/inspections`,
        async () => {
          const r = await api.get(`/api/v1/projects/${pid}/inspections`, { signal: ac.signal });
          return { data: r.data?.data ?? [], meta: r.data?.meta ?? null };
        },
      );
      setItems(h.data.data as typeof items);
      setMeta(h.data.meta as typeof meta);
      setAsal({ dariCache: h.dariCache, diambil: h.diambil, usiaMenit: h.usiaMenit, basi: h.basi });
    } catch (e) {
      // Pembatalan BUKAN kegagalan — ia terjadi tiap kali proyek berganti,
      // dan menampilkan galat untuknya membuat layar berkedip merah saat
      // pengguna cuma memilih proyek lain.
      if ((e as { name?: string }).name === "CanceledError") return;
      setGalat("Daftar permintaan tidak bisa dimuat, dan belum ada salinan tersimpan di perangkat ini. Periksa koneksi lalu muat ulang.");
      setAsal({ dariCache: false, diambil: null, usiaMenit: null, basi: false });
    } finally {
      if (!ac.signal.aborted) setMemuat(false);
    }
  }, []);


  // setState dipanggil asinkron, bukan sinkron di badan efek — render berantai
  // terasa sebagai jeda pada HP lapangan.
  useEffect(() => {
    if (!proyekId) return;
    let batal = false;
    void Promise.resolve().then(() => { if (!batal) void muat(proyekId); });
    return () => { batal = true; };
  }, [proyekId, muat]);

  const ubahStatus = async (it: Inspeksi, baru: Inspeksi["status"]) => {
    let catatan: string | undefined;
    let buatTemuan = false;

    if (baru === "tidak_lolos") {
      const jawab = window.prompt(
        `Apa yang harus diperbaiki sebelum ${it.nomor} diperiksa ulang?\n\n` +
        "Catatan ini yang dibaca pemohon — tanpa itu ia tak tahu apa yang salah."
      );
      if (jawab === null) return;
      if (!jawab.trim()) { showToast("error", "Catatan hasil wajib diisi."); return; }
      catatan = jawab.trim();
      buatTemuan = window.confirm(
        "Buat temuan punch list dari kegagalan ini?\n\n" +
        "Pilih Ya kalau ini cacat yang harus ditelusuri sampai serah terima. " +
        "Pilih Tidak kalau ini sekadar kesiapan — bekisting belum rapi, besi " +
        "belum lengkap — yang selesai hari ini juga."
      );
    }

    setSedangUbah(it.id);
    try {
      const r = await api.patch(`/api/v1/inspections/${it.id}/status`, {
        status: baru,
        ...(catatan ? { hasil_catatan: catatan } : {}),
        ...(buatTemuan ? { buat_temuan: true } : {}),
      });
      setItems((kini) => kini.map((x) => (x.id === it.id ? r.data.data : x)));
      void muat(proyekId);
      const temuan = r.data?.temuan_dibuat;
      showToast(
        "success",
        temuan
          ? `${it.nomor} tidak lolos · temuan ${temuan.nomor} dibuat`
          : `${it.nomor} → ${STATUS_LABEL[baru].toLowerCase()}`
      );
    } catch (e) {
      const pesan = (e as { response?: { data?: { error?: string } } }).response?.data?.error;
      // Pesan server sudah menjelaskan sebabnya (mis. "Anda yang mengajukan
      // permintaan ini") — menggantinya dengan pesan generik membuang
      // informasi yang paling berguna.
      showToast("error", pesan ?? "Status tidak bisa diubah.");
    } finally {
      setSedangUbah(null);
    }
  };

  const perStatus = useMemo(() => {
    const p: Record<string, Inspeksi[]> = {};
    for (const s of URUTAN) p[s] = [];
    for (const i of items) (p[i.status] ??= []).push(i);
    return p;
  }, [items]);

  return (
    <div className="in-halaman">
      {/* `KepalaHalaman` — lihat catatan di `kontrak/rfi/page.tsx`. */}
      <header className="in-kepala">
        <KepalaHalaman
          judul="Permintaan inspeksi"
          keterangan="Izin melanjutkan atau menutup pekerjaan."
          ikon={<ClipboardList size={19} />}
        />

        <div className="in-kepala-aksi">
          <label className="in-pilih-bungkus">
            <select
              className="in-pilih"
              aria-label="Pilih proyek yang permintaannya ditampilkan"
              value={proyekId}
              onChange={(e) => setProyekId(e.target.value)}
            >
              {/* Opsi cadangan saat daftar masih kosong.
                  Tanpa ini, dropdown tampil sebagai kotak putih tanpa
                  teks apa pun — dan tombol "Minta diperiksa" di
                  sebelahnya mati tanpa satu pun petunjuk kenapa. */}
              {proyek.length === 0 && (
                <option value="">
                  {memuat ? "Memuat proyek…" : "Tak ada proyek"}
                </option>
              )}
              {proyek.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <ChevronDown size={16} className="in-pilih-ikon" aria-hidden />
          </label>
          <button className="in-tombol-utama" onClick={() => bukaForm(true)} disabled={!proyekId}>
            <Plus size={17} aria-hidden />
            Minta diperiksa
          </button>
        </div>
      </header>

      {/* Yang ditonjolkan: berapa banyak pekerjaan berhenti menunggu, dan
          berapa di antaranya sudah lewat waktu. Bukan total permintaan —
          permintaan yang sudah selesai tak menahan siapa pun. */}
      {meta && (
        <section className="in-ambang" aria-live="polite">
          <div className="in-ambang-utama">
            <span
              className="in-ambang-n"
              style={{ color: meta.menunggu ? "var(--warning)" : "var(--success)" }}
            >
              {meta.menunggu}
            </span>
            <span className="in-ambang-teks">
              {meta.menunggu === 0
                ? "Tidak ada pekerjaan yang menunggu pemeriksaan."
                : "pekerjaan menunggu diperiksa"}
            </span>
          </div>

          {meta.terlambat > 0 && (
            <p className="in-terlambat">
              <AlertTriangle size={15} aria-hidden />
              <strong>{meta.terlambat}</strong> sudah lewat waktu yang diminta —
              pekerjaan lanjutannya berhenti.
            </p>
          )}

          {!meta.rekap_lengkap && (
            <p className="in-peringatan">
              <AlertTriangle size={14} aria-hidden /> Rekap tidak lengkap.
            </p>
          )}
        </section>
      )}

      {/* Penanda cache SEBELUM daftar, bukan sesudahnya.
          Yang membacanya harus tahu checklist ini tersimpan SEBELUM ia
          memutuskan lolos/gagal — peringatan di bawah sampai terlambat. */}
      <PenandaCache
        dariCache={asal.dariCache}
        usiaMenit={asal.usiaMenit}
        basi={asal.basi}
        perihal="Daftar permintaan inspeksi"
      />

      {galat ? (
        <div className="in-galat" role="alert">
          <AlertTriangle size={18} aria-hidden />
          <span>{galat}</span>
          <button className="in-tombol-halus" onClick={() => void muat(proyekId)}>Muat ulang</button>
        </div>
      ) : memuat ? (
        <div className="in-memuat" aria-live="polite">
          <Loader2 size={18} className="in-putar" aria-hidden /> Memuat permintaan…
        </div>
      ) : items.length === 0 ? (
        <div className="in-kosong">
          <ClipboardList size={30} aria-hidden />
          <p className="in-kosong-judul">Belum ada permintaan di proyek ini.</p>
          <p className="in-kosong-teks">
            Ajukan permintaan sebelum pekerjaan ditutup — pengecoran, plesteran,
            pengurugan — supaya ada catatan siapa yang memberi izin dan kapan.
          </p>
          <button className="in-tombol-utama" onClick={() => bukaForm(true)}>
            <Plus size={17} aria-hidden /> Minta diperiksa
          </button>
        </div>
      ) : (
        <div className="in-papan">
          {URUTAN.filter((s) => perStatus[s].length > 0).map((s) => (
            <section key={s} className="in-kolom" aria-labelledby={`ik-${s}`}>
              <h2 id={`ik-${s}`} className="in-kolom-judul">
                {STATUS_LABEL[s]}
                <span className="in-kolom-n">{perStatus[s].length}</span>
              </h2>

              <ul className="in-daftar">
                {perStatus[s].map((it) => {
                  const menunggu = it.status === "diminta" || it.status === "dijadwalkan";
                  const lewat = menunggu && it.diminta_untuk
                    && new Date(it.diminta_untuk).getTime() < Date.now();
                  return (
                    <li key={it.id} className={`in-kartu${lewat ? " in-kartu-lewat" : ""}`}>
                      <div className="in-kartu-atas">
                        <span className="in-nomor">{it.nomor}</span>
                        {menunggu && (
                          <span className={`in-tunggu${lewat ? " in-tunggu-lewat" : ""}`}>
                            <Clock size={12} aria-hidden />
                            {lamaMenunggu(it.created_at)}
                          </span>
                        )}
                      </div>

                      <p className="in-kartu-judul">{it.judul}</p>

                      {it.lokasi && (
                        <p className="in-meta"><MapPin size={13} aria-hidden />{it.lokasi}</p>
                      )}

                      {it.pekerjaan_lanjutan && (
                        <p className="in-meta in-lanjutan">
                          <ArrowRight size={13} aria-hidden />
                          Menahan: {it.pekerjaan_lanjutan}
                        </p>
                      )}

                      {it.diminta_untuk && menunggu && (
                        <p className="in-meta">
                          Diminta untuk {tanggalJam(it.diminta_untuk)}
                        </p>
                      )}

                      {it.hasil_catatan && (
                        <p className="in-catatan">{it.hasil_catatan}</p>
                      )}

                      {it.pemeriksa && it.diperiksa_pada && (
                        <p className={`in-meta${it.status === "lolos" ? " in-lolos" : ""}`}>
                          <CheckCircle2 size={13} aria-hidden />
                          {it.pemeriksa.name} · {tanggalJam(it.diperiksa_pada)}
                        </p>
                      )}

                      {it.temuan && (
                        <p className="in-temuan">
                          Jadi temuan {it.temuan.nomor}
                          <span className="in-temuan-status">{it.temuan.status}</span>
                        </p>
                      )}

                      {/* Checklist — endpointnya hidup sejak G1d dengan 17 test,
                          dan sampai 2026-08-12 NOL halaman memanggilnya. Tanpa
                          ini, inspeksi diputuskan lolos/tidak lolos tanpa
                          daftar yang diperiksa.

                          Dilipat: sebagian besar inspeksi dibuka untuk melihat
                          statusnya, bukan butirnya — dan checklist yang selalu
                          terbuka membuat daftar inspeksi jadi gulungan panjang. */}
                      <details className="in-checklist">
                        <summary className="in-checklist-kepala">
                          <ListChecks size={13} aria-hidden /> Checklist pemeriksaan
                        </summary>
                        <div className="in-checklist-isi">
                          <ChecklistInspeksi
                            inspeksiId={it.id}
                            bolehUbah={it.status !== "dibatalkan"}
                            // Memuat ulang lewat `muat()` yang sudah ada, bukan
                            // state putaran baru: `muat` juga menyegarkan cache
                            // offline, dan dua jalur muat-ulang di satu layar
                            // pasti berselisih soal mana yang paling baru.
                            onBerubah={() => { void muat(proyekId); }}
                          />
                        </div>
                      </details>

                      <div className="in-aksi">
                        {LANJUTAN[it.status].map((baru) => (
                          <button
                            key={baru}
                            className={`in-aksi-tombol${
                              baru === "lolos" ? " in-aksi-lolos"
                                : baru === "tidak_lolos" ? " in-aksi-gagal" : ""}`}
                            onClick={() => void ubahStatus(it, baru)}
                            disabled={sedangUbah === it.id}
                          >
                            {sedangUbah === it.id ? (
                              <Loader2 size={13} className="in-putar" aria-hidden />
                            ) : baru === "lolos" ? <CheckCircle2 size={13} aria-hidden />
                              : baru === "tidak_lolos" ? <X size={13} aria-hidden />
                              : null}
                            {AKSI_LABEL[baru]}
                          </button>
                        ))}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      {formTerbuka && (
        <FormInspeksi
          proyekId={proyekId}
          onTutup={() => bukaForm(false)}
          onSimpan={() => { bukaForm(false); void muat(proyekId); }}
        />
      )}

      <style jsx>{`
        .in-halaman {
          padding: var(--pad-atas) var(--pad-x) var(--pad-bawah);
          width: 100%; max-width: var(--w-page); margin: 0 auto;
        }
        .in-kepala {
          display: flex; flex-wrap: wrap; gap: 16px;
          align-items: flex-end; justify-content: space-between; margin-bottom: 20px;
        }
        .in-judul {
          display: flex; align-items: center; gap: 9px; margin: 0;
          font-family: var(--font-display); font-size: 24px; font-weight: 600;
          color: var(--text-primary); letter-spacing: -0.01em;
        }
        .in-sub { margin: 4px 0 0; font-size: 14px; color: var(--text-secondary); }
        .in-kepala-aksi { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }

        .in-pilih-bungkus { position: relative; display: block; }
        .in-pilih {
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
        :global(.in-pilih-ikon) {
          position: absolute; right: 11px; top: 50%; transform: translateY(-50%);
          color: var(--text-muted); pointer-events: none;
        }
        .in-tombol-utama {
          display: inline-flex; align-items: center; gap: 7px;
          min-height: 44px; padding: 0 16px; border: none;
          border-radius: var(--radius-md); background: var(--navy);
          color: var(--on-navy); font-size: 14px; font-weight: 500;
          font-family: inherit; cursor: pointer; transition: background 140ms ease;
        }
        .in-tombol-utama:hover:not(:disabled) { background: var(--navy-mid); }
        .in-tombol-utama:disabled { opacity: 0.5; cursor: not-allowed; }
        .in-tombol-halus {
          min-height: 36px; padding: 0 12px; border: 1px solid var(--border);
          border-radius: var(--radius-sm); background: var(--surface);
          color: var(--text-primary); font-size: 13px; font-family: inherit; cursor: pointer;
        }

        .in-ambang {
          background: var(--surface); border: 1px solid var(--border);
          border-radius: var(--radius-lg); padding: 18px 20px; margin-bottom: 22px;
        }
        .in-ambang-utama { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
        .in-ambang-n {
          font-family: var(--font-display); font-size: 42px; font-weight: 700;
          line-height: 1; letter-spacing: -0.03em; font-variant-numeric: tabular-nums;
        }
        .in-ambang-teks { font-size: 14px; color: var(--text-secondary); }
        .in-terlambat {
          display: flex; align-items: center; gap: 7px; margin: 12px 0 0;
          padding: 9px 12px; font-size: 13px;
          background: var(--danger-bg); border: 1px solid var(--danger-border);
          border-radius: var(--radius-sm); color: var(--danger);
        }
        .in-peringatan {
          display: flex; align-items: center; gap: 6px; margin: 8px 0 0;
          font-size: 12.5px; color: var(--warning);
        }

        .in-papan {
          display: grid; gap: 16px;
          grid-template-columns: repeat(auto-fit, minmax(268px, 1fr));
          align-items: start;
        }
        .in-kolom-judul {
          display: flex; align-items: center; gap: 8px; margin: 0 0 10px;
          font-size: 12px; font-weight: 600; text-transform: uppercase;
          letter-spacing: 0.06em; color: var(--text-muted);
        }
        .in-kolom-n {
          font-size: 11px; padding: 1px 7px; border-radius: 9px;
          background: var(--surface-hover); color: var(--text-secondary);
          letter-spacing: 0; font-variant-numeric: tabular-nums;
        }
        .in-daftar { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }

        .in-kartu {
          background: var(--surface); border: 1px solid var(--border);
          border-radius: var(--radius-md); padding: 13px 14px;
        }
        /* Lewat waktu ditandai di TEPI, bukan dengan mewarnai seluruh kartu:
           yang perlu menonjol adalah mana yang terlambat, bukan membuat
           seluruh kolom berteriak. */
        .in-kartu-lewat { border-left: 3px solid var(--danger); }

        .in-kartu-atas {
          display: flex; align-items: center; justify-content: space-between;
          gap: 8px; margin-bottom: 8px;
        }
        .in-nomor {
          font-size: 11.5px; color: var(--text-muted);
          font-variant-numeric: tabular-nums; letter-spacing: 0.02em;
        }
        .in-tunggu {
          display: inline-flex; align-items: center; gap: 4px;
          font-size: 11.5px; padding: 2px 8px; border-radius: 4px;
          background: var(--warning-bg); color: var(--warning); font-weight: 500;
        }
        .in-tunggu-lewat { background: var(--danger-bg); color: var(--danger); }

        .in-kartu-judul {
          margin: 0 0 8px; font-size: 14.5px; font-weight: 500;
          color: var(--text-primary); line-height: 1.4;
        }
        .in-meta {
          display: flex; align-items: center; gap: 6px; margin: 0 0 5px;
          font-size: 12.5px; color: var(--text-secondary);
        }
        .in-lanjutan { color: var(--text-muted); }
        .in-lolos { color: var(--success); }
        .in-catatan {
          margin: 6px 0 0; padding: 7px 10px; font-size: 12.5px;
          background: var(--surface-subtle); border-left: 2px solid var(--border-strong);
          color: var(--text-secondary); border-radius: 0 4px 4px 0;
        }
        .in-temuan {
          display: flex; align-items: center; gap: 7px; margin: 7px 0 0;
          font-size: 12px; color: var(--danger);
        }
        .in-temuan-status {
          font-size: 11px; padding: 1px 7px; border-radius: 4px;
          background: var(--danger-bg); color: var(--danger);
        }

        /* Checklist dilipat: sebagian besar inspeksi dibuka untuk melihat
           STATUS-nya, bukan butirnya. Yang selalu terbuka membuat daftar
           inspeksi jadi gulungan panjang di layar HP lapangan. */
        .in-checklist { margin-top: 11px; border-top: 1px solid var(--border); }
        .in-checklist-kepala {
          display: flex; align-items: center; gap: 6px;
          padding: 8px 0; cursor: pointer;
          font-size: 12.5px; font-weight: 600; color: var(--text-secondary);
          list-style: none;
        }
        .in-checklist-kepala::-webkit-details-marker { display: none; }
        .in-checklist-kepala::after {
          content: "▸"; margin-inline-start: auto; color: var(--text-muted);
          transition: transform 140ms ease;
        }
        .in-checklist[open] .in-checklist-kepala::after { transform: rotate(90deg); }
        /* Fokus keyboard WAJIB terlihat — summary kehilangan outline bawaan
           begitu list-style disetel. */
        .in-checklist-kepala:focus-visible {
          outline: 2px solid var(--aksen); outline-offset: 2px; border-radius: 4px;
        }
        .in-checklist-isi { padding-bottom: 6px; }
        @media (prefers-reduced-motion: reduce) {
          .in-checklist-kepala::after { transition: none; }
        }

        .in-aksi { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 11px; }
        .in-aksi-tombol {
          display: inline-flex; align-items: center; gap: 5px;
          min-height: 34px; padding: 0 10px;
          border: 1px solid var(--border); border-radius: var(--radius-sm);
          background: var(--surface); color: var(--text-secondary);
          font-size: 12.5px; font-family: inherit; cursor: pointer;
          transition: background 130ms ease, color 130ms ease;
        }
        .in-aksi-tombol:hover:not(:disabled) {
          background: var(--surface-hover); color: var(--text-primary);
        }
        .in-aksi-tombol:disabled { opacity: 0.55; cursor: wait; }
        .in-aksi-lolos {
          border-color: var(--success-border); background: var(--success-bg);
          color: var(--success); font-weight: 500;
        }
        .in-aksi-gagal { border-color: var(--danger-border); color: var(--danger); }

        .in-memuat, .in-kosong, .in-galat {
          display: flex; align-items: center; justify-content: center;
          gap: 10px; padding: 40px 20px; color: var(--text-secondary); font-size: 14px;
        }
        .in-kosong {
          flex-direction: column; gap: 8px; text-align: center;
          background: var(--surface); border: 1px dashed var(--border-strong);
          border-radius: var(--radius-lg); color: var(--text-muted); padding: 48px 24px;
        }
        .in-kosong-judul {
          margin: 6px 0 0; font-size: 15px; font-weight: 500; color: var(--text-primary);
        }
        .in-kosong-teks { margin: 0 0 8px; max-width: 400px; line-height: 1.55; }
        .in-galat {
          background: var(--danger-bg); border: 1px solid var(--danger-border);
          border-radius: var(--radius-md); color: var(--danger); justify-content: flex-start;
        }
        .in-putar { animation: in-spin 900ms linear infinite; }
        @keyframes in-spin { to { transform: rotate(360deg); } }

        @media (max-width: 640px) {
          .in-kepala-aksi { width: 100%; }
          .in-pilih { max-width: none; width: 100%; }
          .in-pilih-bungkus { flex: 1; }
          .in-ambang-n { font-size: 36px; }
          .in-papan { grid-template-columns: 1fr; }
        }
        @media (prefers-reduced-motion: reduce) {
          .in-tombol-utama, .in-aksi-tombol { transition: none; }
          .in-putar { animation: none; }
        }
      `}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════

function FormInspeksi({
  proyekId, onTutup, onSimpan,
}: { proyekId: string; onTutup: () => void; onSimpan: () => void }) {
  const { showToast } = useToast();
  const [judul, setJudul] = useState("");
  const [lokasi, setLokasi] = useState("");
  const [lanjutan, setLanjutan] = useState("");
  const [kapan, setKapan] = useState("");
  const [catatan, setCatatan] = useState("");
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
      showToast("error", "Tulis dulu pekerjaan apa yang mau diperiksa.");
      judulRef.current?.focus();
      return;
    }
    setMenyimpan(true);
    try {
      const r = await api.post(`/api/v1/projects/${proyekId}/inspections`, {
        judul: judul.trim(),
        lokasi: lokasi.trim() || undefined,
        pekerjaan_lanjutan: lanjutan.trim() || undefined,
        diminta_untuk: kapan ? new Date(kapan).toISOString() : undefined,
        catatan: catatan.trim() || undefined,
      });
      // API melaporkan berapa orang benar-benar dikabari. `null` = query
      // penerima gagal, `0` = tak ada yang berwenang. Keduanya berarti
      // permintaan tersimpan TAPI tak ada yang tahu — dan itu harus dikatakan,
      // bukan disembunyikan di balik "berhasil".
      const n = r.data?.penerima_diberitahu;
      if (n === 0) {
        showToast("error", "Permintaan tersimpan, tapi belum ada yang berwenang memeriksa di perusahaan ini.");
      } else if (n === null || n === undefined) {
        showToast("error", "Permintaan tersimpan, tapi pemberitahuan ke pemeriksa gagal terkirim.");
      } else {
        showToast("success", `Permintaan terkirim ke ${n} pemeriksa.`);
      }
      onSimpan();
    } catch (e) {
      const pesan = (e as { response?: { data?: { error?: string } } }).response?.data?.error;
      showToast("error", pesan ?? "Permintaan tidak bisa disimpan.");
    } finally {
      setMenyimpan(false);
    }
  };

  return (
    <div className="fi-tirai" role="dialog" aria-modal="true" aria-labelledby="fi-judul">
      <div className="fi-panel">
        <header className="fi-kepala">
          <h2 id="fi-judul">Minta diperiksa</h2>
          <button className="fi-tutup" onClick={onTutup} aria-label="Tutup">
            <X size={18} aria-hidden />
          </button>
        </header>

        <div className="fi-isi">
          <label className="fi-baris">
            <span className="fi-label">Pekerjaan apa</span>
            <input
              ref={judulRef} className="fi-input" value={judul}
              onChange={(e) => setJudul(e.target.value)}
              placeholder="Pengecoran kolom lantai 2" maxLength={200}
            />
          </label>

          <label className="fi-baris">
            <span className="fi-label">Di mana</span>
            <input
              className="fi-input" value={lokasi}
              onChange={(e) => setLokasi(e.target.value)}
              placeholder="Grid B–D, as 3" maxLength={200}
            />
          </label>

          <label className="fi-baris">
            <span className="fi-label">Yang menunggu izin ini <em>(boleh dikosongkan)</em></span>
            <input
              className="fi-input" value={lanjutan}
              onChange={(e) => setLanjutan(e.target.value)}
              placeholder="Pengecoran" maxLength={200}
            />
            <span className="fi-bantu">
              Sebutkan pekerjaan yang berhenti sampai ini diperiksa — itu yang
              membuat permintaan Anda didahulukan.
            </span>
          </label>

          <label className="fi-baris">
            <span className="fi-label">Diminta diperiksa <em>(boleh dikosongkan)</em></span>
            <input
              type="datetime-local" className="fi-input" value={kapan}
              onChange={(e) => setKapan(e.target.value)}
            />
          </label>

          <label className="fi-baris">
            <span className="fi-label">Catatan <em>(boleh dikosongkan)</em></span>
            <textarea
              className="fi-input fi-area" value={catatan} rows={3}
              onChange={(e) => setCatatan(e.target.value)}
              placeholder="Besi sudah terpasang sesuai gambar S-04"
            />
          </label>
        </div>

        <footer className="fi-kaki">
          <button className="fi-batal" onClick={onTutup} disabled={menyimpan}>Batal</button>
          <button className="fi-simpan" onClick={() => void simpan()} disabled={menyimpan}>
            {menyimpan ? <Loader2 size={15} className="fi-putar" aria-hidden /> : null}
            Kirim permintaan
          </button>
        </footer>
      </div>

      <style jsx>{`
        .fi-tirai {
          position: fixed; inset: 0; z-index: 60;
          background: rgba(17,24,39,0.45);
          display: flex; align-items: center; justify-content: center; padding: 16px;
        }
        .fi-panel {
          background: var(--surface); border-radius: var(--radius-lg);
          width: 100%; max-width: 480px; max-height: 92vh;
          display: flex; flex-direction: column; overflow: hidden;
          box-shadow: 0 18px 44px rgba(0,0,0,0.18);
        }
        .fi-kepala {
          display: flex; align-items: center; justify-content: space-between;
          padding: 16px 18px; border-bottom: 1px solid var(--border);
        }
        .fi-kepala h2 {
          margin: 0; font-family: var(--font-display);
          font-size: 17px; font-weight: 600; color: var(--text-primary);
        }
        .fi-tutup {
          min-width: 36px; min-height: 36px; border: none; background: none;
          color: var(--text-muted); cursor: pointer; border-radius: var(--radius-sm);
          display: flex; align-items: center; justify-content: center;
        }
        .fi-tutup:hover { background: var(--surface-hover); color: var(--text-primary); }
        .fi-isi { padding: 18px; overflow-y: auto; display: grid; gap: 15px; }
        .fi-baris { display: grid; gap: 6px; }
        .fi-label { font-size: 13px; font-weight: 500; color: var(--text-primary); }
        .fi-label em { font-style: normal; font-weight: 400; color: var(--text-muted); }
        .fi-bantu { font-size: 12px; color: var(--text-muted); line-height: 1.45; }
        .fi-input {
          min-height: 44px; padding: 10px 12px; width: 100%; box-sizing: border-box;
          border: 1px solid var(--border); border-radius: var(--radius-md);
          background: var(--surface); color: var(--text-primary);
          font-size: 15px; font-family: inherit;
        }
        .fi-input:focus-visible {
          outline: 2px solid var(--navy); outline-offset: 1px; border-color: var(--navy);
        }
        .fi-area { min-height: 74px; resize: vertical; line-height: 1.5; }
        .fi-kaki {
          display: flex; gap: 9px; justify-content: flex-end;
          padding: 14px 18px; border-top: 1px solid var(--border);
          background: var(--surface-subtle);
        }
        .fi-batal, .fi-simpan {
          min-height: 44px; padding: 0 17px; border-radius: var(--radius-md);
          font-size: 14px; font-family: inherit; cursor: pointer;
          display: inline-flex; align-items: center; gap: 7px;
        }
        .fi-batal {
          border: 1px solid var(--border); background: var(--surface);
          color: var(--text-secondary);
        }
        .fi-simpan {
          border: none; background: var(--navy); color: var(--on-navy); font-weight: 500;
        }
        .fi-simpan:disabled, .fi-batal:disabled { opacity: 0.55; cursor: wait; }
        .fi-putar { animation: fi-spin 900ms linear infinite; }
        @keyframes fi-spin { to { transform: rotate(360deg); } }

        @media (max-width: 640px) {
          .fi-tirai { align-items: flex-end; padding: 0; }
          .fi-panel { max-width: none; max-height: 94vh; border-radius: 16px 16px 0 0; }
        }
        @media (prefers-reduced-motion: reduce) { .fi-putar { animation: none; } }
      `}</style>
    </div>
  );
}
