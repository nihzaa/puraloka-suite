"use client";

/**
 * LAPORAN HARIAN (DPR) — apa yang terjadi di lapangan, per hari.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA HALAMAN INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-08-12: `progress_logs` berisi 271 baris, 98 di antaranya
 * laporan harian dengan cuaca, jumlah pekerja, dan catatan kendala — ditulis
 * mandor lewat portal setiap hari.
 *
 * Tak ada satu pun layar yang membacanya sebagai LAPORAN. Dashboard hanya
 * menampilkan tanggal update terakhir; `/lapangan` menampilkan rerata dan
 * grafik. Catatan kendala yang ditulis mandor tak pernah terbaca siapa pun.
 *
 * ── Yang menentukan rancangannya
 *
 * Pertanyaan yang dibuka orang kantor tiap pagi adalah "apa yang terjadi
 * kemarin", bukan "berapa rerata bulan ini". Karena itu:
 *
 *   1. Satu kartu per HARI, terbaru di atas — bukan tabel baris-per-laporan.
 *      Satu hari bisa punya lima laporan dari lima mandor; yang dicari
 *      pembacanya adalah gambaran harinya, bukan daftar entri.
 *   2. CATATAN KENDALA paling menonjol. Cuaca dan jumlah pekerja adalah
 *      konteks; kalimat "cor ditunda karena hujan sejak siang" adalah
 *      isinya. Di layar lama, justru kalimat itulah yang tak pernah muncul.
 *   3. Hari tanpa laporan TIDAK ditampilkan sebagai baris kosong. Daftar
 *      yang penuh "—" membuat yang berisi jadi sulit ditemukan.
 */

import { useMemo, useState } from "react";
import { useData } from "@/lib/data-cache";
import {
  ClipboardList, CloudRain, Users, RefreshCw, MessageSquareText, TrendingUp,
} from "lucide-react";

import { C } from "@/lib/warna-ui";
import { Kosong, GAYA_KARTU } from "@/components/ui-dasar";
import { KepalaHalaman } from "@/components/dasar";
import { Pilihan } from "@/components/pilihan";

interface Catatan {
  proyek_id: string;
  teks: string;
  pelapor: string | null;
}

interface Hari {
  tanggal: string;
  laporan: number;
  /** Kiriman ganda berisi persis sama — ditampilkan, bukan disembunyikan. */
  duplikat: number;
  proyek: number;
  /** `null` = tak satu pun laporan menyebut jumlah pekerja — beda dari 0. */
  pekerja: number | null;
  cuaca: string[];
  catatan: Catatan[];
  progres: Array<{ proyek_id: string; pct: number }>;
}

interface Tanggapan {
  hari: Hari[];
  ringkasan: {
    hariBerlaporan: number;
    totalLaporan: number;
    totalCatatan: number;
    rerataPekerja: number | null;
  };
  proyek: Array<{ id: string; name: string }>;
  rentang: { dari: string; sampai: string };
}

const HARI_ID = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const BULAN_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

/** "Selasa, 16 Juni 2026" — nama hari ikut karena laporan lapangan dibaca per hari kerja. */
function tanggalPanjang(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  // Konstruksi lokal (bukan `new Date(iso)`) supaya tak bergeser sehari
  // karena zona waktu — `new Date('2026-06-16')` dibaca sebagai UTC.
  const dt = new Date(y, m - 1, d);
  return `${HARI_ID[dt.getDay()]}, ${d} ${BULAN_ID[m - 1]} ${y}`;
}

export default function LaporanHarianPage() {
  const [proyekId, setProyekId] = useState("");

  /*
    ── PINDAH KE LAPIS CACHE BERSAMA (F4-2), 2026-08-16

    URL-nya DINAMIS mengikuti saringan proyek, dan itu justru menguntungkan:
    `useData` memakai URL sebagai kunci cache, jadi berpindah antar proyek lalu
    kembali tak mengambil ulang selama masih segar.

    ── `putaran` DIBUANG, digantikan `muatUlang()`

    State `putaran` adalah penghitung yang dinaikkan tombol "segarkan", dipakai
    sebagai dependensi efek supaya efeknya berjalan lagi. Itu cara yang sah
    sebelum ada lapis cache; sesudahnya `muatUlang()` melakukan hal yang sama
    secara langsung — dan dengan `paksa: true`, jadi ia benar-benar melewati
    cache alih-alih memulangkan salinan yang baru saja disimpan.

    ⚠ Saya sempat menulis di sini bahwa `setPutaran` "tak pernah dipanggil".
    Itu SALAH, dan salahnya dari alat ukur: `grep "putaran"` huruf kecil tak
    cocok dengan `setPutaran` yang ber-P besar. Tombolnya ada di baris ~153.
    Nol hasil bukan bukti ketiadaan — untuk kesekian kalinya di repo ini.
  */
  const jalur = proyekId
    ? `/api/v1/lapangan/laporan-harian?project_id=${encodeURIComponent(proyekId)}`
    : "/api/v1/lapangan/laporan-harian";
  const { data, memuat, galat: galatMuat, muatUlang } = useData<Tanggapan>(jalur);
  // Tombol segarkan memanggil `muatUlang()` LANGSUNG — pembungkus `muat()`
  // tak lagi perlu, dan membiarkannya menganggur membuat ratchet lint merah.

  // Halaman ini murni baca — tak ada aksi tulis, jadi tak ada galat aksi.
  const galat = galatMuat ? "Gagal memuat laporan harian." : "";


  const namaProyek = useMemo(
    () => new Map((data?.proyek ?? []).map((p) => [p.id, p.name])),
    [data?.proyek],
  );

  return (
    <div style={{ width: "100%", padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)", maxWidth: "var(--w-page)", margin: "0 auto" }}>
      <div className="rise" style={{
        marginBottom: "var(--gap-bagian)", display: "flex",
        justifyContent: "space-between", alignItems: "flex-start",
        gap: "var(--gap-bagian)", flexWrap: "wrap",
      }}>
        <KepalaHalaman
          judul="Laporan Harian"
          keterangan="Apa yang terjadi di lapangan tiap hari — cuaca, jumlah pekerja, dan kendala yang dicatat mandor."
          ikon={<ClipboardList size={19} />}
        />
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <label htmlFor="dpr-proyek" style={{ fontSize: 12, color: C.mid }}>Proyek</label>
          <Pilihan
            id="dpr-proyek"
            value={proyekId}
            onChange={(e) => setProyekId(e.target.value)}
            style={{
              padding: "8px 12px", border: `1px solid ${C.border}`, borderRadius: 8,
              fontSize: 13, background: "var(--surface)", color: C.text, minWidth: 190,
            }}
          >
            <option value="">Semua proyek</option>
            {(data?.proyek ?? []).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Pilihan>
          <button
            type="button"
            onClick={() => { void muatUlang(); }}
            disabled={memuat}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600,
              border: `1px solid ${C.border}`, background: "var(--surface)",
              color: C.text, cursor: memuat ? "default" : "pointer", opacity: memuat ? 0.5 : 1,
            }}
          >
            <RefreshCw size={14} aria-hidden="true" /> Muat ulang
          </button>
        </div>
      </div>

      {galat && (
        <div role="alert" style={{
          ...GAYA_KARTU, padding: "10px 14px", marginBottom: "var(--gap-bagian)",
          borderColor: "var(--danger-border)", background: "var(--danger-bg)",
          color: "var(--danger)", fontSize: 13,
        }}>
          {galat}
        </div>
      )}

      {memuat ? (
        <div style={{ padding: "40px 0", textAlign: "center", color: C.muted, fontSize: 13 }}>
          Memuat laporan harian…
        </div>
      ) : !data || data.hari.length === 0 ? (
        <Kosong
          ikon={<ClipboardList size={28} />}
          judul="Belum ada laporan harian"
          sebab={
            <>
              Laporan harian ditulis mandor lewat portal lapangan: progres, cuaca,
              jumlah pekerja, dan kendala hari itu. Selama belum ada yang melapor,
              halaman ini kosong — dan itu bukan kerusakan, melainkan tanda alur
              pelaporannya belum berjalan.
            </>
          }
        />
      ) : (
        <>
          {/* Ringkasan rentang — konteks, bukan isi. Sengaja ringkas. */}
          <div className="rise rise-2" style={{
            display: "flex", gap: "var(--gap-grid)", flexWrap: "wrap",
            marginBottom: "var(--gap-bagian)",
          }}>
            <Kartu label="Hari berlaporan" nilai={String(data.ringkasan.hariBerlaporan)}
              keterangan={`${data.rentang.dari} s.d. ${data.rentang.sampai}`} />
            <Kartu label="Total laporan" nilai={String(data.ringkasan.totalLaporan)}
              keterangan="Satu hari bisa dilaporkan beberapa mandor" />
            <Kartu label="Catatan kendala" nilai={String(data.ringkasan.totalCatatan)}
              keterangan="Kalimat yang ditulis dari lapangan" />
            <Kartu
              label="Rerata pekerja"
              nilai={data.ringkasan.rerataPekerja === null ? "—" : String(data.ringkasan.rerataPekerja)}
              keterangan={data.ringkasan.rerataPekerja === null
                ? "Belum ada laporan yang menyebut jumlah pekerja"
                : "Per hari yang melaporkannya"} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-grid)" }}>
            {data.hari.map((h) => (
              <KartuHari key={h.tanggal} hari={h} namaProyek={namaProyek} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Kartu({ label, nilai, keterangan }: { label: string; nilai: string; keterangan: string }) {
  return (
    <div style={{ ...GAYA_KARTU, padding: "var(--pad-kartu-lega)", flex: "1 1 190px", minWidth: 175 }}>
      <div style={{ fontSize: "var(--t-kecil)", fontWeight: 600, color: C.mid, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color: C.text, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>
        {nilai}
      </div>
      <div style={{ fontSize: 12, color: C.mid, marginTop: 2, lineHeight: 1.4 }}>{keterangan}</div>
    </div>
  );
}

function KartuHari({ hari, namaProyek }: { hari: Hari; namaProyek: Map<string, string> }) {
  return (
    <div style={{ ...GAYA_KARTU, overflow: "hidden" }}>
      <div style={{
        padding: "var(--pad-kartu-lega)", borderBottom: `1px solid ${C.border}`,
        display: "flex", justifyContent: "space-between", alignItems: "baseline",
        gap: 12, flexWrap: "wrap",
      }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0 }}>
          {tanggalPanjang(hari.tanggal)}
        </h3>
        <div style={{ display: "flex", gap: 14, fontSize: 12, color: C.mid, flexWrap: "wrap" }}>
          {hari.cuaca.length > 0 && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <CloudRain size={13} aria-hidden="true" /> {hari.cuaca.join(", ")}
            </span>
          )}
          {/* `null` berarti tak ada yang melapor — dibedakan dari 0 yang
              berarti pekerjaan benar-benar berhenti hari itu. */}
          {hari.pekerja !== null && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <Users size={13} aria-hidden="true" />
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{hari.pekerja}</span> pekerja
            </span>
          )}
          <span>
            {hari.laporan} laporan · {hari.proyek} proyek
          </span>
          {/* Kiriman ganda DITAMPILKAN, bukan disembunyikan: ia gejala alur
              pelaporan yang perlu dibereskan di hulu, dan yang membaca
              berhak tahu kenapa angka harinya berbeda dari yang ia kira.
              Diukur 2026-08-12: 2026-06-16 punya tiga baris identik. */}
          {hari.duplikat > 0 && (
            <span
              style={{ color: "var(--warning-teks)" }}
              title="Laporan berisi persis sama, tak ikut dijumlahkan"
            >
              {hari.duplikat} kiriman ganda
            </span>
          )}
        </div>
      </div>

      {/* CATATAN paling menonjol — inilah isi laporan harian. Cuaca dan
          jumlah pekerja sudah tampil sebagai konteks di kepala kartu. */}
      {hari.catatan.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {hari.catatan.map((c, i) => (
            <div
              key={i}
              style={{
                padding: "12px var(--pad-kartu-lega)",
                borderBottom: i < hari.catatan.length - 1 ? `1px solid ${C.border}` : "none",
                display: "flex", gap: 10, alignItems: "flex-start",
              }}
            >
              <MessageSquareText size={14} aria-hidden="true" style={{ color: C.muted, marginTop: 2, flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5, color: C.text, lineHeight: 1.55 }}>{c.teks}</div>
                <div style={{ fontSize: "var(--t-kecil)", color: C.muted, marginTop: 3 }}>
                  {namaProyek.get(c.proyek_id) ?? "Proyek"}
                  {c.pelapor && ` · ${c.pelapor}`}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ padding: "12px var(--pad-kartu-lega)", fontSize: 12.5, color: C.muted }}>
          Progres dilaporkan tanpa catatan kendala.
        </div>
      )}

      {hari.progres.length > 0 && (
        <div style={{
          padding: "10px var(--pad-kartu-lega)", borderTop: `1px solid ${C.border}`,
          background: "var(--surface-subtle)", display: "flex", gap: "var(--gap-bagian)",
          flexWrap: "wrap", fontSize: 12, color: C.mid,
        }}>
          <TrendingUp size={13} aria-hidden="true" style={{ marginTop: 1 }} />
          {hari.progres.map((p) => (
            <span key={p.proyek_id}>
              {namaProyek.get(p.proyek_id) ?? "Proyek"}:{" "}
              <strong style={{ color: C.text, fontVariantNumeric: "tabular-nums" }}>
                {p.pct}%
              </strong>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
