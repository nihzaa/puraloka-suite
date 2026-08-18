"use client";

/**
 * HASIL UJI MATERIAL — bukti mutu dari laboratorium.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA HALAMAN, BUKAN TAB DI NCR
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `ARAH-VISUAL-2026.md` §6a: *tab = sudut pandang berbeda atas data yang
 * sama; halaman = entitas berbeda*.
 *
 * Uji material adalah entitas yang berbeda dari NCR, dan umurnya lebih
 * panjang: ia lahir dari laboratorium, dirujuk dalam sertifikat mutu, klaim,
 * dan sengketa — bertahun setelah inspeksinya selesai. Tautan
 * `/mutu/uji-material?proyek=…` adalah hal yang dikirim ke konsultan.
 *
 * ── Yang dijawab halaman ini
 *
 * "Beton batch ini kuat berapa, dan apakah memenuhi syarat?"
 *
 * ── Kenapa kesimpulan TIDAK ditebak dari angka
 *
 * Godaannya satu baris: `nilai >= syarat ? 'memenuhi' : 'tidak'`. Itu salah
 * untuk sebagian besar uji nyata — tak berambang tunggal (gradasi, visual),
 * bertoleransi, atau dibaca TERBALIK.
 *
 * Contoh nyata di data: kadar lumpur pasir 4,2% dengan syarat maks 5%.
 * Angkanya "di bawah syarat", dan itu justru MEMENUHI. Menurunkannya otomatis
 * akan menyatakan "tidak memenuhi" untuk pasir yang sebenarnya bagus.
 *
 * Yang dilakukan layar ini: menampilkan angkanya, menampilkan kesimpulan
 * manusia, dan **menandai bila keduanya tak sejalan** — tanpa memutuskan
 * siapa yang benar.
 */

import { useState } from "react";
import { FlaskConical, TriangleAlert, Info } from "lucide-react";
import { useData } from "@/lib/data-cache";
import { C } from "@/lib/warna-ui";
import { Kosong } from "@/components/ui-dasar";
import { KepalaHalaman, Tabel, type Kolom } from "@/components/dasar";

type Kesimpulan = "memenuhi" | "tidak_memenuhi" | "perlu_uji_ulang";

interface BarisUji {
  id: string;
  nomor: string;
  objek: string;
  jenis_uji: string;
  lembaga_uji: string | null;
  nomor_sertifikat: string | null;
  tanggal_uji: string;
  nilai_hasil: number | string | null;
  nilai_syarat: number | string | null;
  satuan: string | null;
  kesimpulan: Kesimpulan | null;
  catatan: string | null;
  selisih: number | null;
  angka_memadai: boolean | null;
  /** Angka dan kesimpulan manusia tak sejalan — DITANDAI, bukan diperbaiki. */
  bertentangan: boolean;
  perlu_kesimpulan: boolean;
  ncr: { id: string; nomor: string } | null;
}

interface HasilUji {
  baris: BarisUji[];
  memenuhi: number;
  tidak_memenuhi: number;
  perlu_uji_ulang: number;
  belum_disimpulkan: number;
  bertentangan: number;
  jumlah_uji: number;
}

interface Proyek { id: string; name: string }

const ARTI: Record<Kesimpulan, { label: string; warna: string; bg: string; border: string; arti: string }> = {
  tidak_memenuhi: {
    label: "Tidak memenuhi", warna: "var(--danger)", bg: "var(--danger-bg)", border: "var(--danger-border)",
    arti: "Hasil uji di bawah syarat mutu. Pekerjaan yang memakainya perlu keputusan formal — perbaiki, bongkar, atau terima dengan alasan tertulis.",
  },
  perlu_uji_ulang: {
    label: "Perlu uji ulang", warna: "var(--warning-teks)", bg: "var(--warning-bg)", border: "var(--warning-border)",
    arti: "Hasilnya belum bisa dipakai — bukan lolos, bukan gagal. Uji ulang diperlukan sebelum pekerjaan diterima.",
  },
  memenuhi: {
    label: "Memenuhi", warna: "var(--success)", bg: "var(--success-bg)", border: "var(--success-border)",
    arti: "Memenuhi syarat mutu yang berlaku.",
  },
};

const angka = (v: number | string | null): number | null => {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Angka uji — bukan rupiah, jadi bukan `formatRupiah`. */
const fmt = (v: number | string | null, satuan: string | null) => {
  const n = angka(v);
  if (n === null) return "—";
  return `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(n)}${satuan ? ` ${satuan}` : ""}`;
};

const tanggal = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
};

const KOLOM: Array<Kolom<BarisUji>> = [
  {
    kunci: "uji", judul: "Uji", kepalaBaris: true,
    render: (u) => (
      <span style={{
        display: "block", paddingLeft: 9,
        borderLeft: u.kesimpulan === "tidak_memenuhi" || u.bertentangan
          ? `3px solid ${u.bertentangan ? "var(--warning-teks)" : "var(--danger)"}`
          : "3px solid transparent",
      }}>
        <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{u.nomor}</span>
        <span style={{ display: "block", fontSize: 11.5, color: C.text, marginTop: 2 }}>{u.objek}</span>
        <span style={{ display: "block", fontSize: 11, color: C.mid, marginTop: 1 }}>
          {u.jenis_uji}
          {u.lembaga_uji && ` · ${u.lembaga_uji}`}
          {u.ncr && ` · NCR ${u.ncr.nomor}`}
        </span>
      </span>
    ),
  },
  {
    kunci: "tanggal", judul: "Tanggal", rata: "kanan",
    render: (u) => <span style={{ color: C.mid, whiteSpace: "nowrap" }}>{tanggal(u.tanggal_uji)}</span>,
  },
  {
    kunci: "hasil", judul: "Hasil", rata: "kanan",
    render: (u) => (
      <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
        {fmt(u.nilai_hasil, u.satuan)}
      </span>
    ),
  },
  {
    kunci: "syarat", judul: "Syarat", rata: "kanan",
    render: (u) => (
      <>
        <span style={{ color: C.mid, fontVariantNumeric: "tabular-nums" }}>
          {fmt(u.nilai_syarat, u.satuan)}
        </span>
        {u.selisih !== null && (
          // Selisih ditampilkan APA ADANYA, tanpa menyimpulkan baik/buruk —
          // arah "baik" berbeda antar-jenis uji.
          <span style={{
            display: "block", fontSize: 10, color: C.muted, fontVariantNumeric: "tabular-nums",
          }}>
            selisih {u.selisih > 0 ? "+" : ""}{new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(u.selisih)}
          </span>
        )}
      </>
    ),
  },
  {
    kunci: "kesimpulan", judul: "Kesimpulan",
    render: (u) => {
      if (!u.kesimpulan) {
        return (
          <span style={{ fontSize: 11, color: C.muted, fontStyle: "italic" }}>
            {u.perlu_kesimpulan ? "belum disimpulkan" : "—"}
          </span>
        );
      }
      const m = ARTI[u.kesimpulan];
      return (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
          <span title={m.arti} style={{
            display: "inline-block", padding: "2px 8px", borderRadius: 20,
            fontSize: 11, fontWeight: 600, whiteSpace: "nowrap",
            color: m.warna, background: m.bg, border: `1px solid ${m.border}`,
          }}>{m.label}</span>
          {u.bertentangan && (
            // Ini yang membuat halaman ini lebih dari daftar: angka dan
            // ahli tak sejalan. Keduanya bisa benar — yang penting selisih
            // pendapatnya TERLIHAT supaya bisa ditanyakan.
            <span
              title="Angka hasil tak sejalan dengan kesimpulan ini. Bisa jadi benar — uji yang dibaca terbalik (kadar lumpur), toleransi, atau penilaian ahli. Yang penting selisihnya terlihat."
              style={{
                display: "inline-flex", alignItems: "center", gap: 3,
                fontSize: 10, fontWeight: 700, color: "var(--warning-teks)",
              }}
            >
              <TriangleAlert size={11} aria-hidden="true" /> beda dari angka
            </span>
          )}
        </span>
      );
    },
  },
];

export default function UjiMaterialPage() {
  const [projectId, setProjectId] = useState("");

  /*
    ── PINDAH KE LAPIS CACHE BERSAMA (F4-2), 2026-08-16

    Dua `useData`: proyek (prasyarat), lalu hasil uji proyek terpilih — URL
    kedua `null` sampai proyek dipilih.
  */
  const { data: dataProyek, galat: galatProyek } =
    useData<{ projects: Proyek[] }>("/api/v1/projects");
  const proyek = dataProyek?.projects ?? [];

  const jalurHasil = projectId ? `/api/v1/projects/${projectId}/uji-material` : null;
  const { data: hasil, memuat, galat: galatHasil } = useData<HasilUji>(jalurHasil);

  const galat = galatProyek
    ? "Gagal memuat daftar proyek"
    : galatHasil
      ? "Gagal memuat hasil uji material"
      : null;

  const kartu: React.CSSProperties = {
    background: "var(--surface)", border: `1px solid ${C.border}`,
    borderRadius: 10, boxShadow: "var(--naik-1)",
  };

  return (
    // `--w-luas` (1500), bukan `--w-page`: tabelnya padat kolom — nomor,
    // objek, tanggal, hasil, syarat, kesimpulan — dan angka uji kehilangan
    // arti begitu kolomnya membungkus. Token dipilih menurut BENTUK isi,
    // bukan selera (`tata-letak-ratchet`).
    <div style={{
      padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)",
      width: "100%", maxWidth: "var(--w-luas)", margin: "0 auto",
    }}>
      <div className="rise" style={{ marginBottom: "var(--gap-bagian)" }}>
        <KepalaHalaman
          judul="Hasil Uji Material"
          ikon={<FlaskConical size={20} aria-hidden="true" />}
          keterangan={
            <>
              Bukti mutu dari laboratorium — dirujuk dalam sertifikat, klaim, dan
              sengketa jauh setelah pekerjaannya selesai. Angka ditampilkan apa adanya;
              <strong> kesimpulan tetap keputusan manusia</strong>, karena tak semua
              uji dibaca dengan arah yang sama.
            </>
          }
        />
      </div>

      {galat && (
        <div role="alert" style={{
          marginBottom: 14, padding: "10px var(--pad-kartu-lega)", borderRadius: 8, fontSize: 13,
          border: "1px solid var(--danger-border)", background: "var(--danger-bg)",
          color: "var(--danger)",
        }}>{galat}</div>
      )}

      <div className="rise" style={{ ...kartu, padding: "12px 16px", marginBottom: 16, maxWidth: 420 }}>
        <label htmlFor="uji-proyek" style={{
          fontSize: 11, fontWeight: 700, color: C.muted, display: "block",
          marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em",
        }}>Proyek</label>
        <select
          id="uji-proyek" value={projectId} onChange={(e) => setProjectId(e.target.value)}
          style={{
            padding: "8px 10px", borderRadius: 6, border: `1px solid ${C.border}`,
            background: "var(--surface)", color: C.text, fontSize: 13, width: "100%",
          }}
        >
          <option value="">— pilih proyek —</option>
          {proyek.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {!projectId ? (
        <Kosong
          ikon={<FlaskConical size={28} />}
          judul="Pilih proyek dulu"
          sebab="Hasil uji dicatat per proyek — beton, tanah, dan baja yang dipakai di sana."
        />
      ) : memuat ? (
        <div style={{ ...kartu, padding: 40, textAlign: "center", color: C.mid, fontSize: 13 }}>Memuat…</div>
      ) : hasil ? (
        hasil.baris.length === 0 ? (
          <Kosong
            ikon={<FlaskConical size={28} />}
            judul="Belum ada hasil uji tercatat"
            sebab="Uji beton, tanah, dan baja dari laboratorium dicatat di sini — beserta syarat yang berlaku saat itu, supaya kesimpulannya bisa diperiksa ulang bertahun kemudian."
          />
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
              gap: 8, marginBottom: 16 }}>
              <div style={{ ...kartu, padding: "12px var(--pad-kartu-lega)",
                borderColor: hasil.tidak_memenuhi > 0 ? "var(--danger-border)" : C.border }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.muted,
                  textTransform: "uppercase", letterSpacing: "0.05em" }}>Tidak memenuhi</div>
                <div style={{ fontSize: "var(--teks-kpi)", fontWeight: 700, marginTop: 4, lineHeight: 1.1,
                  color: hasil.tidak_memenuhi > 0 ? "var(--danger)" : C.text }}>
                  {hasil.tidak_memenuhi}
                </div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                  dari {hasil.jumlah_uji} uji
                </div>
              </div>

              <div style={{ ...kartu, padding: "12px var(--pad-kartu-lega)" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.muted,
                  textTransform: "uppercase", letterSpacing: "0.05em" }}>Perlu uji ulang</div>
                <div style={{ fontSize: "var(--teks-kpi)", fontWeight: 700, marginTop: 4, lineHeight: 1.1, color: C.text }}>
                  {hasil.perlu_uji_ulang}
                </div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>hasilnya belum bisa dipakai</div>
              </div>

              <div style={{ ...kartu, padding: "12px var(--pad-kartu-lega)" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.muted,
                  textTransform: "uppercase", letterSpacing: "0.05em" }}>Belum disimpulkan</div>
                <div style={{ fontSize: "var(--teks-kpi)", fontWeight: 700, marginTop: 4, lineHeight: 1.1, color: C.text }}>
                  {hasil.belum_disimpulkan}
                </div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                  angkanya ada, kesimpulan belum
                </div>
              </div>

              <div style={{ ...kartu, padding: "12px var(--pad-kartu-lega)" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.muted,
                  textTransform: "uppercase", letterSpacing: "0.05em" }}>Memenuhi</div>
                <div style={{ fontSize: "var(--teks-kpi)", fontWeight: 700, marginTop: 4, lineHeight: 1.1, color: "var(--success)" }}>
                  {hasil.memenuhi}
                </div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>sesuai syarat mutu</div>
              </div>
            </div>

            {hasil.bertentangan > 0 && (
              <div role="status" style={{
                display: "flex", gap: 8, alignItems: "flex-start", padding: "10px var(--pad-kartu-lega)",
                background: "var(--warning-bg)", border: "1px solid var(--warning-border)",
                borderRadius: 8, fontSize: 12.5, color: "var(--warning-teks)",
                marginBottom: 14, lineHeight: 1.55,
              }}>
                <Info size={15} style={{ flexShrink: 0, marginTop: 2 }} aria-hidden="true" />
                <span>
                  <strong>{hasil.bertentangan} uji punya angka yang tak sejalan dengan kesimpulannya.</strong>{" "}
                  Itu belum tentu salah — kadar lumpur dibaca terbalik (makin kecil makin
                  baik), sebagian uji punya toleransi, dan sebagian butuh penilaian ahli.
                  Yang ditandai di sini adalah <em>selisih pendapatnya</em>, supaya bisa
                  ditanyakan sebelum masuk sertifikat.
                </span>
              </div>
            )}

            <div className="rise rise-3" style={{ ...kartu, overflow: "hidden" }}>
              <Tabel<BarisUji>
                caption="Hasil uji material: nomor, objek, tanggal, nilai hasil, syarat, dan kesimpulannya."
                data={hasil.baris}
                kunciBaris={(u) => u.id}
                kolom={KOLOM}
              />
              <p style={{ margin: 0, padding: "10px var(--pad-kartu-lega)", fontSize: 11.5, color: C.mid,
                borderTop: `1px solid ${C.border}`, lineHeight: 1.55 }}>
                Syarat mutu disimpan bersama hasilnya, bukan dicari saat dibaca —
                standar berubah antar-proyek dan antar-edisi SNI, dan kesimpulan
                yang dibuat hari ini harus bisa diperiksa ulang bertahun kemudian
                tanpa menebak aturan mana yang berlaku saat itu.
              </p>
            </div>
          </>
        )
      ) : null}
    </div>
  );
}
