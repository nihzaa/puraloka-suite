"use client";

/**
 * IMPOR DATA — wizard empat tahap (TJS-P3).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * TAHAP KETIGA YANG MEMBEDAKANNYA
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   1. unggah      berkas → judul kolom + usulan pemetaan
 *   2. petakan     pengguna mengoreksi usulan
 *   3. pratinjau   validasi penuh — NOL tulisan ke tabel target
 *   4. commit      satu transaksi, all-or-nothing
 *
 * Importer RAB yang sudah ada di repo ini menggabungkan validasi dan
 * penulisan: berkas dengan satu baris rusak meninggalkan data setengah jadi,
 * dan data lama sudah terhapus lebih dulu. Tahap 3 di sini memutus itu —
 * pengguna melihat persis apa yang akan masuk sebelum apa pun berubah.
 *
 * ── Kenapa pemetaan otomatis hanya USULAN
 *
 * Skor kemiripan menebak "Nama Barang" → `name`, dan biasanya benar. Tetapi
 * impor terjadi sekali di awal, hasilnya jadi dasar seluruh data, dan
 * kesalahannya tak terlihat: kolom harga yang salah dipetakan ke stok
 * menghasilkan angka wajar di kedua tempat.
 *
 * Karena itu tiap usulan bisa diubah, dan skornya ditampilkan — pengguna
 * berhak tahu mana yang ditebak yakin dan mana yang tidak.
 *
 * ── Satu aksen (§3d)
 *
 * Yang menonjol hanya daftar galat di tahap 3. Sisanya tenang: memetakan
 * kolom adalah pekerjaan, bukan peringatan.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Upload, Info, TriangleAlert, Check, Download, ArrowRight, RotateCcw,
} from "lucide-react";
import { api } from "@/lib/api";
import { useData } from "@/lib/data-cache";
import { TombolUnduh } from "@/components/tombol-unduh";
import { C } from "@/lib/warna-ui";
import {
  Halaman, KepalaHalaman, Kartu, JudulKartu, Tabel, Rangka, Galat,
  Tombol, Lencana, gayaInput, type Kolom,
} from "@/components/dasar";

interface KolomSkema {
  kunci: string; label: string;
  jenis: "teks" | "angka" | "tanggal" | "bool";
  wajib: boolean;
}
interface Skema { kunci: string; label: string; keterangan: string; kolom: KolomSkema[] }
interface Usul { kolomBerkas: string; kolomTarget: string | null; skor: number }
interface GalatBaris { baris: number; kolom: string | null; pesan: string }

type Tahap = 1 | 2 | 3 | 4;

/**
 * Membaca seluruh baris berkas DI PERAMBAN.
 *
 * Di luar komponen dengan sengaja: sebagai fungsi dalam, ia dibuat ulang tiap
 * render dan `react-hooks/immutability` menandainya (ratchet lint naik 4→5).
 * Ia tak menyentuh state apa pun, jadi tak ada alasan ia tinggal di dalam.
 *
 * Server hanya mengirim judul + 5 contoh; seluruh barisnya diurai di sini.
 */
async function bacaSemuaBaris(buf: ArrayBuffer): Promise<Array<Record<string, unknown>>> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
}

export default function ImporPage() {
  const [pilihSkema, setPilihSkema] = useState("");
  const [tahap, setTahap] = useState<Tahap>(1);
  const [galatAksi, setGalatAksi] = useState<string | null>(null);
  const [kerja, setKerja] = useState(false);

  const [namaBerkas, setNamaBerkas] = useState("");
  const [baris, setBaris] = useState<Array<Record<string, unknown>>>([]);
  const [usulan, setUsulan] = useState<Usul[]>([]);
  const [pemetaan, setPemetaan] = useState<Record<string, string>>({});

  const [galatBaris, setGalatBaris] = useState<GalatBaris[]>([]);
  const [wajibHilang, setWajibHilang] = useState<string[]>([]);
  const [contohHasil, setContohHasil] = useState<Array<Record<string, unknown>>>([]);
  const [bisaCommit, setBisaCommit] = useState(false);
  const [masuk, setMasuk] = useState(0);

  /*
    ── PINDAH KE LAPIS CACHE BERSAMA (F4-2), 2026-08-16

    Halaman ini DILEWATI skrip pemindah karena `api.get` URL-nya di baris
    terpisah, dan karena pemuatannya punya EFEK SAMPING: bila hanya ada satu
    skema, skema itu langsung dipilih.

    Efek samping itu tak bisa ikut ke dalam `useData` — ia menulis state lain.
    Dipindah ke efek tersendiri yang bergantung pada `data`, jadi ia berjalan
    sekali tiap jawaban baru datang, bukan tiap render.
  */
  const { data, memuat, galat: galatMuat } =
    useData<{ skema: Skema[]; batas_baris: number }>("/api/v1/impor/skema");
  // Tak ada tombol muat-ulang di halaman ini: alurnya sekali jalan dari
  // unggah sampai commit, dan daftar skema tak berubah di tengahnya.

  const galat = galatAksi ?? (galatMuat ? "Gagal memuat daftar skema" : null);

  // Diturunkan, bukan disalin.
  const skema = data?.skema ?? [];
  const batasBaris = data?.batas_baris ?? 5000;

  const aktif = skema.find((s) => s.kunci === pilihSkema) ?? null;

  useEffect(() => {
    // Satu skema = tak ada yang perlu dipilih. Dijalankan hanya saat jawaban
    // berubah; `pilihSkema` sengaja TIDAK jadi dependensi supaya pilihan
    // pengguna tak ditimpa ulang.
    if (data?.skema?.length === 1) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPilihSkema(data.skema[0].kunci);
    }
  }, [data]);


  /** Kembali ke awal — dipakai tombol "Mulai lagi" dan saat ganti skema. */
  const ulangi = useCallback(() => {
    setTahap(1); setNamaBerkas(""); setBaris([]); setUsulan([]);
    setPemetaan({}); setGalatBaris([]); setWajibHilang([]);
    setContohHasil([]); setBisaCommit(false); setMasuk(0); setGalatAksi(null);
  }, []);

  const unggah = useCallback(async (f: File) => {
    setKerja(true); setGalatAksi(null);
    try {
      const buf = await f.arrayBuffer();
      // Base64 lewat chunk: `String.fromCharCode(...besar)` melampaui batas
      // argumen dan melempar pada berkas beberapa ratus KB.
      const bytes = new Uint8Array(buf);
      let biner = "";
      for (let i = 0; i < bytes.length; i += 8192) {
        biner += String.fromCharCode(...bytes.subarray(i, i + 8192));
      }
      const b64 = btoa(biner);

      const r = await api.post<{
        judul: string[]; jumlah_baris: number; usulan: Usul[];
        contoh: Array<Record<string, unknown>>;
      }>("/api/v1/impor/baca", { skema: pilihSkema, berkas_base64: b64 });

      setNamaBerkas(f.name);
      setUsulan(r.data.usulan);
      // Usulan langsung dipakai sebagai pemetaan AWAL — pengguna mengoreksi
      // yang salah, bukan mengisi dari nol. Yang tak terusulkan dibiarkan
      // kosong, bukan ditebak.
      const p: Record<string, string> = {};
      for (const u of r.data.usulan) if (u.kolomTarget) p[u.kolomBerkas] = u.kolomTarget;
      setPemetaan(p);

      // Baris PENUH dibaca di peramban, bukan diminta ulang ke server.
      //
      // Server hanya mengirim judul + 5 contoh; seluruh barisnya diurai di
      // sini dan disimpan di memori tab. Konsekuensinya disengaja: server tak
      // menyimpan apa pun di antara tahap, jadi tak ada keadaan setengah jadi
      // yang tertinggal kalau pengguna menutup tab di tengah wizard.
      setBaris(await bacaSemuaBaris(buf));
      setTahap(2);
    } catch (e) {
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalatAksi(m ?? "Gagal membaca berkas");
    } finally { setKerja(false); }
  }, [pilihSkema]);

  const pratinjau = useCallback(async () => {
    setKerja(true); setGalatAksi(null);
    try {
      const r = await api.post<{
        wajib_hilang: string[]; galat: GalatBaris[];
        contoh: Array<Record<string, unknown>>; bisa_commit: boolean;
      }>("/api/v1/impor/pratinjau", { skema: pilihSkema, baris, pemetaan });
      setWajibHilang(r.data.wajib_hilang);
      setGalatBaris(r.data.galat);
      setContohHasil(r.data.contoh);
      setBisaCommit(r.data.bisa_commit);
      setTahap(3);
    } catch (e) {
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalatAksi(m ?? "Gagal memvalidasi");
    } finally { setKerja(false); }
  }, [pilihSkema, baris, pemetaan]);

  const commit = useCallback(async () => {
    setKerja(true); setGalatAksi(null);
    try {
      const r = await api.post<{ masuk: number }>(
        "/api/v1/impor/commit", { skema: pilihSkema, baris, pemetaan });
      setMasuk(r.data.masuk);
      setTahap(4);
    } catch (e) {
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalatAksi(m ?? "Impor gagal — tidak ada baris yang masuk");
    } finally { setKerja(false); }
  }, [pilihSkema, baris, pemetaan]);

  const kolomGalat: Array<Kolom<GalatBaris>> = [
    {
      kunci: "baris", judul: "Baris", rata: "kanan", kepalaBaris: true,
      render: (g) => <strong style={{ fontSize: 12.5, color: C.text }}>{g.baris}</strong>,
    },
    {
      kunci: "kolom", judul: "Kolom",
      render: (g) => <span style={{ fontSize: 12.5, color: C.mid }}>{g.kolom ?? "—"}</span>,
    },
    {
      kunci: "pesan", judul: "Masalah",
      render: (g) => <span style={{ fontSize: 12.5, color: C.text }}>{g.pesan}</span>,
    },
  ];

  const langkah = (n: Tahap, label: string) => (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      fontSize: 12, fontWeight: 600,
      color: tahap === n ? C.text : tahap > n ? "var(--success)" : C.muted,
    }}>
      <span style={{
        width: 20, height: 20, borderRadius: 999, display: "inline-flex",
        alignItems: "center", justifyContent: "center", fontSize: 11,
        border: `1px solid ${tahap === n ? "var(--aksen)" : tahap > n ? "var(--success-border)" : C.border}`,
        background: tahap === n ? "var(--aksen)" : "transparent",
        color: tahap === n ? "var(--on-aksen)" : tahap > n ? "var(--success)" : C.muted,
      }}>{tahap > n ? <Check size={11} aria-hidden="true" /> : n}</span>
      {label}
    </span>
  );

  return (
    <Halaman>
      <KepalaHalaman
        ikon={<Upload size={18} />}
        judul="Impor Data"
        keterangan={
          <>Unggah berkas Excel atau CSV. Impor bersifat{" "}
          <strong>semua-atau-tidak-sama-sekali</strong>: satu baris rusak berarti
          nol baris masuk, dan tak ada data setengah jadi yang harus dibersihkan
          belakangan.</>
        }
      />

      {galat && <Galat pesan={galat} />}

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
        {langkah(1, "Unggah")}
        <ArrowRight size={13} aria-hidden="true" style={{ color: C.muted }} />
        {langkah(2, "Petakan kolom")}
        <ArrowRight size={13} aria-hidden="true" style={{ color: C.muted }} />
        {langkah(3, "Pratinjau")}
        <ArrowRight size={13} aria-hidden="true" style={{ color: C.muted }} />
        {langkah(4, "Selesai")}
      </div>

      {memuat ? (
        <Rangka tinggi={56} jumlah={2} />
      ) : tahap === 1 ? (
        <Kartu pad="rapat">
          <JudulKartu sub={`maksimal ${batasBaris.toLocaleString("id-ID")} baris per berkas`}>
            1 · Pilih jenis data &amp; unggah
          </JudulKartu>

          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            <div>
              <label htmlFor="im-skema" style={{ display: "block", fontSize: 11.5, color: C.mid, marginBottom: 3 }}>
                Jenis data
              </label>
              <select id="im-skema" style={gayaInput} value={pilihSkema}
                onChange={(e) => { setPilihSkema(e.target.value); ulangi(); }}>
                <option value="">— pilih —</option>
                {skema.map((s) => <option key={s.kunci} value={s.kunci}>{s.label}</option>)}
              </select>
              {aktif && (
                <span style={{ display: "block", fontSize: 11.5, color: C.mid, marginTop: 4, lineHeight: 1.45 }}>
                  {aktif.keterangan}
                </span>
              )}
            </div>
            <div>
              <label htmlFor="im-berkas" style={{ display: "block", fontSize: 11.5, color: C.mid, marginBottom: 3 }}>
                Berkas (.xlsx / .csv)
              </label>
              <input id="im-berkas" type="file" accept=".xlsx,.xls,.csv"
                style={{ ...gayaInput, padding: 6 }}
                disabled={!pilihSkema || kerja}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void unggah(f);
                }} />
            </div>
          </div>

          {aktif && (
            <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <Tombol kecil jenis="sekunder" ikon={<Download size={12} aria-hidden="true" />}
                href={`${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/v1/impor/${aktif.kunci}/template`}>
                Unduh template CSV
              </Tombol>
              <span style={{ fontSize: 11.5, color: C.muted }}>
                Kolom bertanda <strong>*</strong> wajib diisi.
              </span>
            </div>
          )}

          {/* ── EKSPOR: separuh menu yang selama ini tak ada ────────────────
              Menu ini bernama "Impor & Ekspor Data" dan sampai 2026-08-17
              hanya punya separuhnya. Yang membukanya mencari tombol ekspor,
              tak menemukannya, lalu menyimpulkan aplikasinya rusak — bukan
              menyimpulkan fiturnya memang belum ada.

              Memakai `TombolUnduh`, BUKAN `<a href>` seperti tombol template
              di atas. Bedanya nyata: template itu berkas statis, sementara
              ekspor bergerbang izin per-skema — dan `<a href>` biasa meminta
              URL-nya TANPA header sesi, jadi yang terunduh halaman login
              berformat HTML bernama `supplier-2026-08-17.xlsx`.

              Berkas hasil ekspor memakai judul kolom yang SAMA dengan
              template impor, jadi ia bisa disunting massal di Excel lalu
              dimasukkan lagi lewat kotak unggah di atas. */}
          {aktif && (
            <div style={{
              marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.border}`,
              display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap",
              justifyContent: "space-between",
            }}>
              <div style={{ flex: "1 1 260px", minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: C.text }}>
                  Ekspor {aktif.label} yang sudah ada
                </span>
                <span style={{ display: "block", fontSize: 11.5, color: C.muted, lineHeight: 1.55, marginTop: 2 }}>
                  Berkasnya memakai kolom yang sama dengan template — bisa disunting
                  massal di Excel lalu diunggah kembali di atas.
                </span>
              </div>
              <TombolUnduh
                jalur={`/api/v1/ekspor/${aktif.kunci}`}
                namaBerkas={aktif.kunci}
                format={["xlsx", "csv", "pdf"]}
                label="Ekspor"
              />
            </div>
          )}

          {aktif && (
            <div style={{ marginTop: 12 }}>
              <span style={{ display: "block", fontSize: 11.5, color: C.mid, marginBottom: 5 }}>
                Kolom yang bisa diisi:
              </span>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {aktif.kolom.map((k) => (
                  <Lencana key={k.kunci} nada={k.wajib ? "info" : "netral"}>
                    {k.label}{k.wajib ? " *" : ""}
                  </Lencana>
                ))}
              </div>
            </div>
          )}
        </Kartu>
      ) : null}

      {tahap === 2 && aktif && (
        <Kartu pad="rapat">
          <JudulKartu
            sub={`${namaBerkas} · ${baris.length.toLocaleString("id-ID")} baris`}
            aksi={
              <Tombol kecil jenis="hantu" ikon={<RotateCcw size={12} aria-hidden="true" />}
                onClick={ulangi}>Mulai lagi</Tombol>
            }
          >
            2 · Petakan kolom
          </JudulKartu>

          <p style={{ fontSize: 12, color: C.mid, margin: "0 0 12px", lineHeight: 1.55, maxWidth: "72ch" }}>
            Pemetaan di bawah adalah <strong>usulan</strong>, bukan keputusan.
            Skornya ditampilkan supaya Anda tahu mana yang ditebak yakin dan
            mana yang tidak — kolom harga yang salah dipetakan ke stok
            menghasilkan angka wajar di kedua tempat.
          </p>

          <div style={{ display: "grid", gap: 8 }}>
            {usulan.map((u) => (
              <div key={u.kolomBerkas} style={{
                display: "grid", gap: 8, alignItems: "center",
                gridTemplateColumns: "minmax(140px,1fr) auto minmax(180px,1fr)",
              }}>
                <span style={{ fontSize: 12.5, color: C.text }}>
                  {u.kolomBerkas}
                  {u.skor > 0 && (
                    <span style={{ display: "block", fontSize: 11, color: C.muted }}>
                      cocok {Math.round(u.skor * 100)}%
                    </span>
                  )}
                </span>
                <ArrowRight size={13} aria-hidden="true" style={{ color: C.muted }} />
                <select
                  aria-label={`Petakan kolom ${u.kolomBerkas}`}
                  style={{ ...gayaInput, fontSize: 12.5 }}
                  value={pemetaan[u.kolomBerkas] ?? ""}
                  onChange={(e) => setPemetaan((p) => {
                    const baru = { ...p };
                    if (e.target.value) baru[u.kolomBerkas] = e.target.value;
                    else delete baru[u.kolomBerkas];
                    return baru;
                  })}>
                  <option value="">— tidak diimpor —</option>
                  {aktif.kolom.map((k) => (
                    <option key={k.kunci} value={k.kunci}>
                      {k.label}{k.wajib ? " *" : ""}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 14 }}>
            <Tombol jenis="utama" disabled={kerja} onClick={() => void pratinjau()}>
              {kerja ? "Memvalidasi…" : "Lanjut ke pratinjau"}
            </Tombol>
          </div>
        </Kartu>
      )}

      {tahap === 3 && (
        <>
          {/* ── SATU aksen: galat (§3d) ───────────────────────────────────── */}
          {!bisaCommit && (
            <div role="alert" style={{
              padding: "12px 16px", borderRadius: 10, fontSize: 12.5, lineHeight: 1.55,
              border: "1px solid var(--danger-border)", background: "var(--danger-bg)",
              color: "var(--danger)",
            }}>
              <strong style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <TriangleAlert size={15} aria-hidden="true" />
                Belum bisa diimpor
              </strong>
              {wajibHilang.length > 0
                ? <>Kolom wajib belum dipetakan: <strong>{wajibHilang.join(", ")}</strong>.</>
                : <>Ada <strong>{galatBaris.length}</strong> masalah di berkas. Karena
                  impor ini semua-atau-tidak-sama-sekali, perbaiki berkasnya lalu
                  unggah ulang — <strong>tak ada sebagian yang masuk</strong>.</>}
            </div>
          )}

          <Kartu pad="rapat">
            <JudulKartu
              sub={bisaCommit
                ? `${baris.length.toLocaleString("id-ID")} baris siap — belum ada yang ditulis`
                : "belum ada yang ditulis ke basis data"}
              aksi={
                <Tombol kecil jenis="hantu" ikon={<RotateCcw size={12} aria-hidden="true" />}
                  onClick={ulangi}>Mulai lagi</Tombol>
              }
            >
              3 · Pratinjau
            </JudulKartu>

            {galatBaris.length > 0 ? (
              <Tabel
                kolom={kolomGalat}
                data={galatBaris.slice(0, 100)}
                kunciBaris={(g, ) => `${g.baris}-${g.kolom}-${g.pesan}`}
                caption="Daftar masalah yang ditemukan di berkas"
              />
            ) : contohHasil.length > 0 ? (
              <>
                <p style={{ fontSize: 12, color: C.mid, margin: "0 0 8px" }}>
                  Lima baris pertama, sebagaimana akan tersimpan:
                </p>
                <pre style={{
                  margin: 0, padding: 10, borderRadius: 8, fontSize: 11.5,
                  background: "var(--surface-hover)", border: `1px solid ${C.border}`,
                  overflowX: "auto", color: C.text,
                }}>{JSON.stringify(contohHasil, null, 2)}</pre>
              </>
            ) : null}

            {bisaCommit && (
              <div style={{ marginTop: 14 }}>
                <Tombol jenis="utama" disabled={kerja} onClick={() => void commit()}>
                  {kerja ? "Mengimpor…" : `Impor ${baris.length.toLocaleString("id-ID")} baris`}
                </Tombol>
              </div>
            )}
          </Kartu>
        </>
      )}

      {tahap === 4 && (
        <Kartu pad="rapat">
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <Check size={18} aria-hidden="true" style={{ color: "var(--success)", marginTop: 2 }} />
            <div>
              <strong style={{ display: "block", fontSize: 14, color: C.text }}>
                {masuk.toLocaleString("id-ID")} baris berhasil diimpor
              </strong>
              <span style={{ display: "block", fontSize: 12.5, color: C.mid, marginTop: 3 }}>
                Seluruhnya masuk dalam satu transaksi — tak ada baris yang
                tertinggal separuh.
              </span>
              <div style={{ marginTop: 12 }}>
                <Tombol jenis="sekunder" onClick={ulangi}>Impor berkas lain</Tombol>
              </div>
            </div>
          </div>
        </Kartu>
      )}

      <p style={{
        fontSize: 12, color: C.mid, margin: 0, lineHeight: 1.6,
        display: "flex", gap: 8, alignItems: "flex-start", maxWidth: "80ch",
      }}>
        <Info size={14} aria-hidden="true" style={{ marginTop: 2, flexShrink: 0 }} />
        <span>
          Template CSV disediakan <strong>ber-BOM UTF-8</strong>. Tanpa itu,
          Excel di Windows membaca berkas sebagai ANSI dan &quot;Ø12mm&quot;
          berubah jadi &quot;Ã˜12mm&quot; — kerusakan yang baru terlihat setelah
          datanya masuk.
        </span>
      </p>
    </Halaman>
  );
}
