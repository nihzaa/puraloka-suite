"use client";

// ============================================================================
// ABSENSI HARIAN — Portal Mandor
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA HALAMAN INI ADA, PADAHAL SUDAH ADA DI DASHBOARD
// ══════════════════════════════════════════════════════════════════════════
//
// Diukur 2026-08-27: `absensi` hidup di `(dashboard)/mandor/absensi` — dan
// TIDAK ADA di `mandor-portal`. Padahal portal itulah yang dipakai mandor:
// ia PWA, bisa dipasang ke layar utama HP, dan dirancang untuk layar kecil.
//
// Akibatnya mandor harus membuka dashboard versi desktop — di HP, di lokasi
// proyek — untuk mencatat sesuatu yang ia lakukan setiap pagi. Itu bentuk
// penyunatan yang paling mudah luput: fiturnya ADA, jadi tak ada yang
// terbaca "hilang" di audit mana pun; yang hilang cuma jangkauannya.
//
// ── Yang BERBEDA dari versi dashboard, dan kenapa
//
// 1. TULIS LEWAT `kirimLapangan` (antrean offline). Absensi dicatat di
//    lokasi, dan lokasi proyek adalah tempat sinyal paling buruk. Versi
//    dashboard memanggil `api.post` langsung — kalau jaringan mati, absensi
//    sepagi itu hilang dan mandor harus mengingat ulang siapa yang hadir.
//
// 2. Tata letak KARTU, bukan tabel. Tabel 4 kolom di layar 360px memaksa
//    gulir mendatar, dan tombol porsi jadi lebih kecil daripada batas
//    sasaran sentuh WCAG 2.5.5 (44px).
//
// 3. `SegmentedTab` untuk porsi hari — tiga pilihan yang selalu terlihat,
//    bukan dropdown. Mandor mengetuk sekali per tukang, bukan dua kali.
//
// Logika intinya SENGAJA sama persis dengan versi dashboard (porsi 1/½/0,
// jam lembur, kirim seluruh entri sekaligus, upsert di server) — bukan
// varian yang perlahan menyimpang.
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, CheckCheck, Save, Users } from "lucide-react";
import { useData } from "@/lib/data-cache";
import { useIzin } from "@/lib/use-izin";
import { kirimLapangan } from "@/lib/kirim-lapangan";
import EmptyState from "@/components/portal/EmptyState";
import KepalaPortal from "@/components/portal/KepalaPortal";
import SkeletonCard from "@/components/portal/SkeletonCard";
import SegmentedTab from "@/components/portal/SegmentedTab";

/*
  Bentuk disalin dari API (`routes/v1/absensi.ts`, `mandor.ts`), bukan
  ditebak — alasan yang sama tertulis di `_bersama/tipe.ts`.
*/
type Scope = {
  id: string;
  scope_name: string;
  payment_system: string;
  project?: { id: string; name: string } | null;
};
type Assignment = {
  id: string;
  project?: { id: string; name: string } | null;
  work_scopes?: Scope[];
};
type Worker = { id: string; name: string; tipe: string | null; is_active: boolean };
type BarisAbsen = {
  id: string;
  worker_id: string;
  tanggal: string;
  porsi_hari: number | string;
  jam_lembur: number | string;
};

/** Nilai porsi yang bisa dipilih — sengaja hanya tiga (sama dengan dashboard). */
const PILIHAN = [
  { value: "1", label: "Penuh" },
  { value: "0.5", label: "½ hari" },
  { value: "0", label: "Absen" },
];

function hariIni() {
  return new Date().toISOString().slice(0, 10);
}

/** "Senin, 6 Agu 2026" — tanggal yang dibaca manusia, bukan 2026-08-06. */
function tanggalPanjang(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("id-ID", {
    weekday: "long", day: "numeric", month: "short", year: "numeric",
  });
}

export default function AbsensiPortalPage() {
  const [tanggal, setTanggal] = useState(hariIni);
  const [scopeId, setScopeId] = useState("");
  const [absen, setAbsen] = useState<Record<string, { porsi: number; lembur: number }>>({});
  const [tersimpan, setTersimpan] = useState<Record<string, { porsi: number; lembur: number }>>({});
  const [menyimpan, setMenyimpan] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const bolehCatat = useIzin("mandor:wage:create");

  const { data: dataAsg, memuat: memuatAsg, galat: galatAsg } =
    useData<{ assignments: Assignment[] }>("/api/v1/mandor/assignments");
  const { data: dataWk, memuat: memuatWk, galat: galatWk } =
    useData<{ workers: Worker[] }>("/api/v1/mandor/workers");

  const memuat = memuatAsg || memuatWk;

  /*
    GALAT MUAT terpisah dari `toast` (galat AKSI simpan).

    Satu state untuk keduanya membuat gagal-simpan menghapus pesan
    gagal-memuat — pengguna lalu mengira datanya sudah termuat padahal
    tidak. Ditegakkan `uji-galat-muat-terpisah.mjs` (ambang NOL).
  */
  const galatMuat = galatAsg || galatWk
    ? "Gagal memuat data penugasan/pekerja."
    : null;

  const assignments = useMemo(() => dataAsg?.assignments ?? [], [dataAsg]);
  const workers = useMemo(
    () => (dataWk?.workers ?? []).filter((x) => x.is_active !== false),
    [dataWk],
  );

  const semuaScope = useMemo(
    () => assignments.flatMap((a) =>
      (a.work_scopes ?? []).map((s) => ({ ...s, project: a.project ?? s.project }))),
    [assignments],
  );

  /*
    Lingkup yang sedang dilihat — DITURUNKAN saat render, bukan lewat
    `useEffect` + `setState`. Efek yang menulis state pada render pertama
    menghasilkan render kedua dengan daftar kosong di antaranya, dan halaman
    berkedip (aturan `react-hooks/set-state-in-effect`, dijaga lint:ratchet).
  */
  const scopeEfektif = scopeId || semuaScope[0]?.id || "";
  const scopeAktif = semuaScope.find((s) => s.id === scopeEfektif) ?? null;

  const jalurAbsensi = scopeEfektif && tanggal
    ? `/api/v1/absensi?scope_id=${encodeURIComponent(scopeEfektif)}&dari=${tanggal}&sampai=${tanggal}`
    : null;
  const { data: dataAbsensi, muatUlang: muatUlangAbsensi } =
    useData<{ absensi: BarisAbsen[] }>(jalurAbsensi);

  /*
    Menyalin jawaban server ke state edit lokal.

    `absen` SENGAJA tak masuk dependensi: tanpa itu, jawaban lama yang datang
    belakangan akan menimpa perubahan yang sedang diketik mandor.
  */
  useEffect(() => {
    const peta: Record<string, { porsi: number; lembur: number }> = {};
    for (const b of dataAbsensi?.absensi ?? []) {
      peta[b.worker_id] = { porsi: Number(b.porsi_hari), lembur: Number(b.jam_lembur) };
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAbsen(peta);
    setTersimpan(peta);
  }, [dataAbsensi]);

  const berubah = useMemo(() => {
    const k = new Set([...Object.keys(absen), ...Object.keys(tersimpan)]);
    return [...k].filter((id) => {
      const a = absen[id], b = tersimpan[id];
      if (!a && !b) return false;
      if (!a || !b) return true;
      return a.porsi !== b.porsi || a.lembur !== b.lembur;
    });
  }, [absen, tersimpan]);

  const belumDijawab = workers.filter((w) => !absen[w.id]).length;
  const totalHari = Object.values(absen).reduce((s, v) => s + v.porsi, 0);

  function setPorsi(workerId: string, porsi: number) {
    setAbsen((p) => ({ ...p, [workerId]: { porsi, lembur: p[workerId]?.lembur ?? 0 } }));
  }
  function setLembur(workerId: string, jam: number) {
    setAbsen((p) => ({ ...p, [workerId]: { porsi: p[workerId]?.porsi ?? 1, lembur: jam } }));
  }

  /*
    Isi seluruh baris yang BELUM dijawab dengan "penuh". Tidak menimpa yang
    sudah dijawab — jalan pintas tak boleh menghapus keputusan yang sudah
    dibuat mandor.
  */
  function isiSisaPenuh() {
    setAbsen((p) => {
      const baru = { ...p };
      for (const w of workers) if (!baru[w.id]) baru[w.id] = { porsi: 1, lembur: 0 };
      return baru;
    });
  }

  async function simpan() {
    if (!scopeEfektif || berubah.length === 0) return;
    setMenyimpan(true);
    setToast(null);

    const hasil = await kirimLapangan(
      "POST",
      "/api/v1/absensi",
      {
        scope_id: scopeEfektif,
        tanggal,
        entri: Object.entries(absen).map(([worker_id, v]) => ({
          worker_id, porsi_hari: v.porsi, jam_lembur: v.lembur,
        })),
      },
      `Absensi ${tanggalPanjang(tanggal)} tersimpan.`,
      "Gagal menyimpan absensi",
    );

    /*
      `aman` (bukan `terkirim`) yang menentukan state lokal ditandai
      tersimpan: kiriman yang MASUK ANTREAN belum sampai server, tetapi
      sudah pasti terkirim nanti. Menahan tandanya akan membuat mandor
      mengisi ulang — dan isian ulang jadi kiriman KEDUA.
    */
    if (hasil.aman) setTersimpan(absen);
    if (hasil.terkirim) muatUlangAbsensi();

    setToast({ msg: hasil.pesan, ok: hasil.aman });
    setMenyimpan(false);
  }

  if (memuat) {
    return (
      <div style={{ display: "grid", gap: "var(--gap-grid)" }}>
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: "var(--gap-bagian)" }}>
      <KepalaPortal judul="Absensi Harian" />

      {galatMuat && (
        <div role="alert" style={gayaGalat}>
          {galatMuat}
        </div>
      )}

      {semuaScope.length === 0 ? (
        <EmptyState
          icon={Users}
          judul="Belum ada lingkup kerja"
          deskripsi="Absensi dicatat per lingkup kerja. Hubungi PM untuk penugasan."
        />
      ) : (
        <>
          {/* ── Pemilih lingkup + tanggal ─────────────────────────────── */}
          <div style={kartu}>
            <label style={label} htmlFor="pilih-scope">Lingkup kerja</label>
            <select
              id="pilih-scope"
              value={scopeEfektif}
              onChange={(e) => setScopeId(e.target.value)}
              style={isian}
            >
              {semuaScope.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.project?.name ? `${s.project.name} — ` : ""}{s.scope_name}
                </option>
              ))}
            </select>

            <label style={{ ...label, marginTop: 12 }} htmlFor="pilih-tanggal">
              Tanggal
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <CalendarDays size={18} aria-hidden style={{ color: "var(--text-secondary)" }} />
              <input
                id="pilih-tanggal"
                type="date"
                value={tanggal}
                max={hariIni()}
                onChange={(e) => setTanggal(e.target.value)}
                style={{ ...isian, flex: 1 }}
              />
            </div>
            <p style={{ margin: "8px 0 0", fontSize: "var(--t-kecil)", color: "var(--text-secondary)" }}>
              {tanggalPanjang(tanggal)}
            </p>
          </div>

          {/* ── Ringkasan ─────────────────────────────────────────────── */}
          <div style={{ ...kartu, display: "flex", gap: "var(--gap-bagian)", flexWrap: "wrap" }}>
            <Ringkas label="Tukang" nilai={String(workers.length)} />
            <Ringkas label="Total hari" nilai={totalHari.toFixed(1).replace(/\.0$/, "")} />
            <Ringkas
              label="Belum diisi"
              nilai={String(belumDijawab)}
              sorot={belumDijawab > 0}
            />
          </div>

          {workers.length === 0 ? (
            <EmptyState
              icon={Users}
              judul="Belum ada tukang"
              deskripsi="Tambahkan tukang lebih dulu di menu Tukang."
            />
          ) : (
            <>
              {belumDijawab > 0 && bolehCatat && (
                <button type="button" onClick={isiSisaPenuh} style={tombolSekunder}>
                  <CheckCheck size={16} aria-hidden />
                  Isi sisanya &ldquo;Penuh&rdquo; ({belumDijawab})
                </button>
              )}

              {/* ── Satu kartu per tukang ───────────────────────────── */}
              <div style={{ display: "grid", gap: "var(--gap-grid)" }}>
                {workers.map((w) => {
                  const nilai = absen[w.id];
                  return (
                    <div key={w.id} style={kartu}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                        <span style={{ fontWeight: 600 }}>{w.name}</span>
                        {w.tipe && (
                          <span style={{ fontSize: "var(--t-kecil)", color: "var(--text-secondary)" }}>
                            {w.tipe}
                          </span>
                        )}
                      </div>

                      <div style={{ marginTop: 10 }}>
                        <SegmentedTab
                          opsi={PILIHAN}
                          aktif={nilai ? String(nilai.porsi) : ""}
                          onUbah={(v) => setPorsi(w.id, Number(v))}
                        />
                      </div>

                      <label style={{ ...label, marginTop: 10 }} htmlFor={`lembur-${w.id}`}>
                        Jam lembur
                      </label>
                      <input
                        id={`lembur-${w.id}`}
                        type="number"
                        min={0}
                        max={12}
                        step={0.5}
                        inputMode="decimal"
                        value={nilai?.lembur ?? 0}
                        onChange={(e) => setLembur(w.id, Number(e.target.value) || 0)}
                        style={isian}
                      />
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}

      {/* ── Simpan — menempel di bawah supaya terjangkau ibu jari ────── */}
      {workers.length > 0 && bolehCatat && (
        <div style={bilahSimpan}>
          {berubah.length > 0 && (
            <span style={{ fontSize: "var(--t-kecil)", color: "var(--warning-teks)" }}>
              {berubah.length} perubahan belum tersimpan
            </span>
          )}
          <button
            type="button"
            onClick={simpan}
            disabled={menyimpan || berubah.length === 0}
            style={{
              ...tombolUtama,
              // Warna solid saat nonaktif, BUKAN opacity — aturan
              // ARAH-VISUAL: opacity membuat teks gagal kontras WCAG.
              background: menyimpan || berubah.length === 0
                ? "var(--surface-subtle)"
                : "var(--grad-aksen)",
              color: menyimpan || berubah.length === 0
                ? "var(--text-muted)"
                : "#fff",
            }}
          >
            <Save size={16} aria-hidden />
            {menyimpan ? "Menyimpan…" : "Simpan absensi"}
          </button>
        </div>
      )}

      {toast && (
        <div
          role="status"
          style={{
            ...kartu,
            background: toast.ok ? "var(--success-bg)" : "var(--danger-bg)",
            color: toast.ok ? "var(--on-success-bg)" : "var(--on-danger-bg)",
            border: "none",
          }}
        >
          {toast.msg}
        </div>
      )}

      {scopeAktif && (
        <p style={{ fontSize: "var(--t-kecil)", color: "var(--text-secondary)", margin: 0 }}>
          Sistem upah: {scopeAktif.payment_system === "harian" ? "Harian" : scopeAktif.payment_system}
        </p>
      )}
    </div>
  );
}

function Ringkas({ label, nilai, sorot }: { label: string; nilai: string; sorot?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: "var(--t-kecil)", color: "var(--text-secondary)" }}>{label}</div>
      <div style={{
        fontSize: "var(--t-sedang)",
        fontWeight: 700,
        color: sorot ? "var(--warning-teks)" : "var(--text-primary)",
      }}>
        {nilai}
      </div>
    </div>
  );
}

const kartu: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "var(--r3)",
  padding: "var(--pad-kartu)",
};

const label: React.CSSProperties = {
  display: "block",
  fontSize: "var(--t-kecil)",
  color: "var(--text-secondary)",
  marginBottom: 4,
};

const isian: React.CSSProperties = {
  width: "100%",
  // 44px = batas sasaran sentuh WCAG 2.5.5, bukan angka estetika.
  minHeight: 44,
  padding: "8px 10px",
  border: "1px solid var(--border)",
  borderRadius: "var(--r2)",
  background: "var(--surface)",
  color: "var(--text-primary)",
  fontSize: "var(--teks-badan)",
};

const tombolSekunder: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  minHeight: 44,
  padding: "8px 14px",
  border: "1px solid var(--border)",
  borderRadius: "var(--r2)",
  background: "var(--surface)",
  color: "var(--text-primary)",
  fontSize: "var(--teks-badan)",
  fontWeight: 600,
  cursor: "pointer",
};

const tombolUtama: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  minHeight: 44,
  padding: "10px 16px",
  border: "none",
  borderRadius: "var(--r2)",
  fontSize: "var(--teks-badan)",
  fontWeight: 700,
  cursor: "pointer",
  width: "100%",
};

/*
  ⚠ `bottom` BUKAN 0 — bilah ini harus berhenti DI ATAS navigasi bawah.

  `PortalShell` memasang navigasinya `position: fixed; bottom: 0` dengan
  `zIndex: 50`. Bilah sticky yang menempel di `bottom: 0` karena itu berakhir
  PERSIS DI BAWAH navigasi dan tombolnya tak bisa disentuh sama sekali —
  terlihat di potret 2026-08-27: tombol "Simpan absensi" tertutup rapi, dan
  halaman tampak seolah tak punya cara menyimpan.

  Tingginya (72px) = tinggi navigasi + jarak nafas, ditambah
  `safe-area-inset-bottom` untuk HP berponi. Menuliskannya sebagai `calc`
  membuat keduanya ikut berubah kalau inset perangkatnya berbeda.
*/
const bilahSimpan: React.CSSProperties = {
  display: "grid",
  gap: 6,
  justifyItems: "center",
  position: "sticky",
  bottom: "calc(72px + env(safe-area-inset-bottom))",
  zIndex: 40,
  padding: "var(--pad-kartu)",
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "var(--r3)",
  boxShadow: "var(--shadow-md)",
};

const gayaGalat: React.CSSProperties = {
  ...kartu,
  background: "var(--danger-bg)",
  color: "var(--on-danger-bg)",
  border: "none",
};
