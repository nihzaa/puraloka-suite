"use client";

/**
 * VERIFIKASI TANDA TANGAN ELEKTRONIK.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA HALAMAN INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Sidik SHA-256 isi dokumen sudah disimpan sejak lama, dan dasbor kendali
 * dokumen membacanya — tetapi hanya sebagai KEBERADAAN: "3 dokumen
 * ditandatangani elektronik".
 *
 * Sidik yang tak pernah bisa dibandingkan tidak membuktikan apa pun, dan itu
 * lebih buruk daripada tidak ada sama sekali: orang membaca "ditandatangani
 * elektronik" lalu menyimpulkan keasliannya terjamin, padahal tak seorang pun
 * pernah mengadu sidiknya dengan isi dokumen yang sekarang.
 *
 * `POST /kendali-dokumen/tanda-tangan/verifikasi` menutup separuhnya. Halaman
 * ini menutup separuh sisanya — endpoint tanpa layar hanya bisa dipakai orang
 * yang tahu cara memanggil API, dan mereka bukan orang yang perlu
 * memverifikasi dokumen.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * TIGA KEADAAN, TIGA TAMPILAN — TIDAK DIRINGKAS JADI SAH/TAK SAH
 * ══════════════════════════════════════════════════════════════════════════
 *
 *     utuh                  isi sama persis dengan yang ditandatangani
 *     berubah               isi BERBEDA — satu-satunya yang gawat
 *     belum_ditandatangani  belum pernah ditandatangani sama sekali
 *
 * Menyamakan yang ketiga dengan yang kedua adalah godaan yang paling mudah
 * ("dua-duanya kan tidak sah"). Tapi menggabungkannya membuat yang benar-benar
 * gawat tenggelam di antara dokumen yang memang belum sampai tahap
 * ditandatangani — dan orang berhenti memeriksa peringatan yang kebanyakan
 * palsu.
 *
 * ── Kenapa isinya DITEMPEL pengguna, bukan diambil server
 *
 * Server sengaja TIDAK menyusun ulang isi dokumennya sendiri. Enam jenis objek
 * berarti enam cara menyusun teks, dan server yang menirunya akan membuat
 * SELURUH tanda tangan lama mendadak "tidak sah" begitu salah satu cara
 * berubah — tanpa satu pun dokumen benar-benar diubah.
 *
 * Konsekuensinya halaman ini meminta isi yang ditempel. Itu terlihat kasar,
 * dan memang: yang memverifikasi harus memegang isi yang ia verifikasi.
 * Tombol yang mengambilkan isinya sendiri akan memverifikasi dokumen terhadap
 * dirinya sendiri, dan selalu menjawab "utuh".
 */

import { useState } from "react";
import {
  ShieldCheck, TriangleAlert, CircleHelp, Loader2, FileSearch,
} from "lucide-react";
import { api } from "@/lib/api";
import { C } from "@/lib/warna-ui";
import {
  Halaman, KepalaHalaman, Kartu, Medan, gayaInput, Tombol,
} from "@/components/dasar";
import { Pilihan } from "@/components/pilihan";

type Keadaan = "utuh" | "berubah" | "belum_ditandatangani";

interface TandaTangan {
  id: string;
  penanda_tangan: string;
  peran_penanda: string | null;
  ditandatangani_pada: string;
  alasan: string | null;
  cocok: boolean;
}

interface Hasil {
  keadaan: Keadaan;
  sidik_sekarang: string;
  tanda_tangan: TandaTangan[];
  pesan: string;
}

/** Enam jenis yang diterima basis (CHECK di `tanda_tangan_elektronik`). */
const JENIS = [
  { nilai: "notulen", label: "Notulen Rapat" },
  { nilai: "transmittal", label: "Transmittal" },
  { nilai: "method_statement", label: "Method Statement" },
  { nilai: "berita_acara", label: "Berita Acara" },
  { nilai: "kontrak", label: "Kontrak" },
  { nilai: "lainnya", label: "Lainnya" },
] as const;

const TAMPILAN: Record<Keadaan, {
  ikon: typeof ShieldCheck; judul: string;
  warna: string; bg: string; border: string;
}> = {
  utuh: {
    ikon: ShieldCheck, judul: "Isi dokumen UTUH",
    warna: "var(--success)", bg: "var(--success-bg)", border: "var(--success-border)",
  },
  berubah: {
    ikon: TriangleAlert, judul: "Isi dokumen BERUBAH",
    warna: "var(--danger)", bg: "var(--danger-bg)", border: "var(--danger-border)",
  },
  belum_ditandatangani: {
    ikon: CircleHelp, judul: "Belum pernah ditandatangani",
    warna: "var(--text-secondary)", bg: "var(--surface-subtle)", border: "var(--border)",
  },
};

export default function HalamanVerifikasiTtd() {
  const [jenis, setJenis] = useState<string>("notulen");
  const [objekId, setObjekId] = useState("");
  const [isi, setIsi] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const [hasil, setHasil] = useState<Hasil | null>(null);
  // Galat AKSI — halaman ini tak memuat apa pun saat dibuka, jadi tak ada
  // galat MUAT yang bisa tertimpa olehnya.
  const [galat, setGalat] = useState<string | null>(null);

  const bisa = objekId.trim() !== "" && isi !== "" && !sibuk;

  async function verifikasi() {
    setSibuk(true);
    setGalat(null);
    // Hasil LAMA dibuang sebelum permintaan baru. Membiarkannya membuat
    // hasil dokumen sebelumnya terbaca sebagai hasil dokumen ini saat
    // permintaannya gagal di tengah jalan.
    setHasil(null);
    try {
      const r = await api.post("/api/v1/kendali-dokumen/tanda-tangan/verifikasi", {
        jenis_objek: jenis,
        objek_id: objekId.trim(),
        isi,
      });
      setHasil(r.data as Hasil);
    } catch (e) {
      setGalat(
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? "Verifikasi gagal dijalankan.",
      );
    } finally {
      setSibuk(false);
    }
  }

  const T = hasil ? TAMPILAN[hasil.keadaan] : null;

  return (
    <Halaman>
      <KepalaHalaman
        ikon={<FileSearch size={20} aria-hidden="true" />}
        judul="Verifikasi Tanda Tangan Elektronik"
        keterangan={<>Membuktikan sebuah dokumen <strong>tidak berubah</strong> sejak
          ditandatangani. Sidik isi dihitung ulang lalu diadu dengan yang tersimpan —
          bukan sekadar memeriksa apakah tanda tangannya ada.</>}
      />

      <Kartu pad="sedang">
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,2fr)", gap: 12 }}>
            <Medan id="ttd-jenis" label="Jenis dokumen" anak={
              <Pilihan id="ttd-jenis" value={jenis} onChange={(e) => setJenis(e.target.value)}
                style={gayaInput}>
                {JENIS.map((j) => <option key={j.nilai} value={j.nilai}>{j.label}</option>)}
              </Pilihan>
            } />
            <Medan id="ttd-objek" label="ID dokumen" wajib anak={
              <input id="ttd-objek" value={objekId} onChange={(e) => setObjekId(e.target.value)}
                placeholder="mis. 3f2a…"
                style={gayaInput} />
            } />
          </div>

          <Medan
            id="ttd-isi"
            label="Isi dokumen yang diverifikasi"
            wajib
            keterangan={"Tempel isi dokumen PERSIS seperti yang ditandatangani — satu spasi "
              + "berbeda menghasilkan sidik yang berbeda. Isinya sengaja tidak diambilkan "
              + "sistem: dokumen yang diverifikasi terhadap dirinya sendiri akan selalu "
              + "menjawab “utuh”."}
            anak={
              <textarea id="ttd-isi" value={isi} onChange={(e) => setIsi(e.target.value)}
                rows={8}
                style={{ ...gayaInput, resize: "vertical", fontFamily: "var(--font-mono, monospace)", fontSize: 12.5 }} />
            }
          />

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Tombol jenis="utama" onClick={() => void verifikasi()} disabled={!bisa}
              ikon={sibuk
                ? <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                : <ShieldCheck size={14} aria-hidden="true" />}>
              {sibuk ? "Memverifikasi…" : "Verifikasi"}
            </Tombol>
          </div>
        </div>
      </Kartu>

      {galat && (
        <div role="alert" style={{
          padding: "10px 14px", borderRadius: 10, fontSize: 13,
          border: "1px solid var(--danger-border)", background: "var(--danger-bg)",
          color: "var(--danger)",
        }}>{galat}</div>
      )}

      {hasil && T && (
        <>
          <div role="status" style={{
            padding: "14px 16px", borderRadius: 10,
            border: `1px solid ${T.border}`, background: T.bg, color: T.warna,
          }}>
            <strong style={{
              display: "flex", alignItems: "center", gap: 7,
              fontSize: 14, marginBottom: 4,
            }}>
              <T.ikon size={17} aria-hidden="true" />
              {T.judul}
            </strong>
            <span style={{ display: "block", fontSize: 12.5, lineHeight: 1.55 }}>
              {hasil.pesan}
            </span>
          </div>

          <Kartu pad="sedang">
            <div style={{ fontSize: "var(--t-kecil)", fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
              Sidik isi yang dihitung sekarang
            </div>
            {/* Sidiknya DITAMPILKAN, bukan disembunyikan. Yang memverifikasi
                perlu bisa mencatatnya — dan tanpa angkanya, halaman ini
                meminta dipercaya persis seperti keadaan yang ia perbaiki. */}
            <code style={{
              display: "block", wordBreak: "break-all", fontSize: 12,
              color: C.text, lineHeight: 1.6,
            }}>{hasil.sidik_sekarang}</code>
          </Kartu>

          {hasil.tanda_tangan.length > 0 && (
            <Kartu pad="rapat">
              <div style={{ padding: "10px var(--pad-kartu-lega) 4px", fontSize: "var(--t-kecil)", fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {hasil.tanda_tangan.length === 1
                  ? "1 tanda tangan"
                  : `${hasil.tanda_tangan.length} tanda tangan`}
              </div>
              {hasil.tanda_tangan.map((t) => (
                <div key={t.id} style={{
                  display: "flex", gap: 10, alignItems: "flex-start",
                  padding: "10px var(--pad-kartu-lega)",
                  borderTop: `1px solid ${C.border}`,
                }}>
                  {t.cocok
                    ? <ShieldCheck size={15} aria-hidden="true" style={{ color: "var(--success)", flexShrink: 0, marginTop: 2 }} />
                    : <TriangleAlert size={15} aria-hidden="true" style={{ color: "var(--danger)", flexShrink: 0, marginTop: 2 }} />}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>
                      {t.penanda_tangan}
                      {t.peran_penanda && (
                        <span style={{ fontWeight: 400, color: C.mid }}> · {t.peran_penanda}</span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: C.mid, marginTop: 1 }}>
                      {String(t.ditandatangani_pada).slice(0, 10)}
                      {t.alasan && ` · ${t.alasan}`}
                    </div>
                  </div>
                  {/* Per-tanda-tangan, bukan hanya kesimpulan gabungan: kalau
                      satu dari tiga tak cocok, yang perlu diperiksa adalah
                      yang mana — bukan sekadar bahwa ada yang salah. */}
                  <span style={{
                    fontSize: "var(--t-kecil)", fontWeight: 700, whiteSpace: "nowrap",
                    color: t.cocok ? "var(--success)" : "var(--danger)",
                  }}>
                    {t.cocok ? "cocok" : "TIDAK cocok"}
                  </span>
                </div>
              ))}
            </Kartu>
          )}
        </>
      )}
    </Halaman>
  );
}
