"use client";

/**
 * IKHTISAR "MUTU & K3" — halaman menu induk terakhir yang belum punya.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * PERTANYAAN YANG DIBAWA KE HALAMAN INI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * "Apa yang belum beres, dan mana yang paling mendesak?"
 *
 * Mutu dan K3 punya sifat yang sama: temuannya dibuka satu per satu di lima
 * halaman berbeda — NCR, inspeksi, punch list, izin kerja, dokumen kepatuhan.
 * Tak ada satu layar pun yang menjawab berapa banyak yang menganggur.
 *
 * ── Yang paling penting di modul ini: dokumen KEDALUWARSA
 *
 * Berbeda dari modul lain, kepatuhan punya kelas masalah yang muncul TANPA
 * ada yang melakukan apa pun: sertifikat dan asuransi yang habis berlaku.
 * Tak ada notifikasi yang lahir dari ketiadaan tindakan — ia hanya ketahuan
 * saat dibutuhkan, yaitu saat sudah terlambat.
 *
 * Karena itu ia mendapat kartu KPI sendiri DAN kartu rail sendiri, bukan
 * dilebur ke "dokumen".
 *
 * ── Warna (ARAH-VISUAL-2026 §3d: satu aksen per layar)
 *
 * Navy TIDAK dipakai di sini sama sekali. Halaman ini tentang hal-hal yang
 * bermasalah; yang menonjol harus BAHAYA, bukan aksen merek. Menaruh navy di
 * salah satu angka akan membuatnya bersaing dengan peringatan yang justru
 * harus menang.
 */

import { useCallback, useEffect, useReducer, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ClipboardCheck, FileWarning, HardHat, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { C } from "@/lib/warna-ui";
import { KepalaHalaman } from "@/components/dasar";
import { KartuKPI, Panel } from "@/components/ui-dasar";
import { BarisRail, KartuRail } from "@/components/shell/rail-kartu";
import { RailIsi } from "@/components/shell/rail-isi";
import { usePasangRail } from "@/lib/rail-context";

interface NcrRingkas {
  nomor: string;
  judul: string;
  severity: string;
  status: string;
  sisa_hari: number | null;
}

interface DokumenRingkas {
  pihak: string;
  jenis: string;
  sisa_hari: number | null;
}

interface Ikhtisar {
  ncr: { total: number; terbuka: number; berat: number; daftar: NcrRingkas[] };
  inspeksi: { total: number; menunggu: number };
  punch: { total: number; terbuka: number };
  dokumen: {
    total: number;
    belum_terverifikasi: number;
    kedaluwarsa: number;
    segera_habis: number;
    daftar: DokumenRingkas[];
  };
  izin_kerja: { total: number; aktif: number; menunggu: number };
  k3: { kecelakaan: number; daftar_hitam: number; skor_k3_terendah: number | null };
}

const PINTASAN = [
  { href: "/mutu/ncr", label: "NCR", guna: "Ketidaksesuaian mutu & tindakan perbaikan" },
  { href: "/kepatuhan?bagian=kesiapan", label: "Kesiapan & Izin Kerja", guna: "Izin kerja dan pengendalian risiko" },
  { href: "/kepatuhan?bagian=dokumen", label: "Dokumen Kepatuhan", guna: "Sertifikat, asuransi, masa berlaku" },
  { href: "/kepatuhan?bagian=evaluasi", label: "Evaluasi Subkon", guna: "Skor mutu, waktu, K3, daftar hitam" },
  { href: "/lapangan", label: "Punch List & Inspeksi", guna: "Temuan lapangan dan permintaan periksa" },
];

/** Label sisa hari yang menyatakan ARAHNYA, bukan cuma angkanya. */
function labelSisa(n: number | null): string {
  if (n === null) return "tanpa tenggat";
  if (n < 0) return `lewat ${Math.abs(n)} hr`;
  if (n === 0) return "hari ini";
  return `${n} hr lagi`;
}

export default function MutuPage() {
  const [mounted, mount] = useReducer(() => true, false);
  useEffect(mount, [mount]);
  if (!mounted) return null;
  return <Konten />;
}

function Konten() {
  const [data, setData] = useState<Ikhtisar | null>(null);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);

  const muat = useCallback(async () => {
    try {
      const r = await api.get<Ikhtisar>("/api/v1/mutu/ikhtisar");
      setData(r.data);
      setGalat(null);
    } catch {
      setGalat("Ikhtisar tak bisa dimuat — angka di bawah mungkin tidak mutakhir.");
    } finally {
      setMemuat(false);
    }
  }, []);

  useEffect(() => {
    muat();
  }, [muat]);

  const d = data;
  const adaKedaluwarsa = (d?.dokumen.kedaluwarsa ?? 0) > 0;

  /*
   * Rail: dua hal yang MENUNTUT TINDAKAN, dan keduanya mudah terlewat.
   *
   * NCR terbuka karena ia menunggu keputusan orang; dokumen kedaluwarsa
   * karena ia memburuk sendiri tanpa ada yang menyentuhnya.
   */
  usePasangRail(
    <RailIsi
      konteks={
        <>
          <KartuRail
            judul="Dokumen kedaluwarsa"
            tautan="/kepatuhan?bagian=dokumen"
            kosong="Semua dokumen masih berlaku lebih dari 30 hari."
          >
            {(d?.dokumen.daftar ?? []).map((x, i) => (
              <BarisRail
                key={`${x.pihak}-${x.jenis}-${i}`}
                pertama={i === 0}
                utama={x.pihak}
                sub={x.jenis}
                kanan={labelSisa(x.sisa_hari)}
                nadaKanan={(x.sisa_hari ?? 0) < 0 ? "bahaya" : "normal"}
                href="/kepatuhan?bagian=dokumen"
              />
            ))}
          </KartuRail>

          <KartuRail
            judul="NCR terbuka"
            tautan="/mutu/ncr"
            kosong="Tidak ada ketidaksesuaian yang terbuka."
          >
            {(d?.ncr.daftar ?? []).map((n, i) => (
              <BarisRail
                key={n.nomor}
                pertama={i === 0}
                utama={n.judul}
                sub={`${n.nomor} · ${n.severity}`}
                kanan={labelSisa(n.sisa_hari)}
                nadaKanan={(n.sisa_hari ?? 1) < 0 ? "bahaya" : "normal"}
                href="/mutu/ncr"
              />
            ))}
          </KartuRail>
        </>
      }
    />,
    [data],
  );

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <KepalaHalaman
        judul="Mutu & K3"
        keterangan="Temuan yang belum beres dan dokumen yang habis berlaku — satu layar sebelum masuk ke rinciannya."
      />

      {galat && (
        <div
          role="status"
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            background: "var(--danger-bg)",
            border: `1px solid ${C.dangerBorder}`,
            color: C.text,
            fontSize: 13,
          }}
        >
          {galat}
        </div>
      )}

      <div
        style={{
          display: "grid",
          gap: 12,
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        }}
      >
        <KartuKPI
          label="NCR terbuka"
          nilai={memuat ? "…" : String(d?.ncr.terbuka ?? 0)}
          keterangan={
            (d?.ncr.berat ?? 0) > 0
              ? `${d?.ncr.berat} berat`
              : `dari ${d?.ncr.total ?? 0} total`
          }
          ikon={<AlertTriangle size={15} />}
        />
        <KartuKPI
          label="Dokumen kedaluwarsa"
          nilai={memuat ? "…" : String(d?.dokumen.kedaluwarsa ?? 0)}
          keterangan={
            (d?.dokumen.segera_habis ?? 0) > 0
              ? `${d?.dokumen.segera_habis} habis dalam 30 hari`
              : "tak ada yang mendekati habis"
          }
          ikon={<FileWarning size={15} />}
        />
        <KartuKPI
          label="Punch terbuka"
          nilai={memuat ? "…" : String(d?.punch.terbuka ?? 0)}
          keterangan={`dari ${d?.punch.total ?? 0} temuan`}
          ikon={<ClipboardCheck size={15} />}
        />
        <KartuKPI
          label="Izin kerja aktif"
          nilai={memuat ? "…" : String(d?.izin_kerja.aktif ?? 0)}
          keterangan={
            (d?.izin_kerja.menunggu ?? 0) > 0
              ? `${d?.izin_kerja.menunggu} menunggu keputusan`
              : "tak ada yang menunggu"
          }
          ikon={<ShieldCheck size={15} />}
        />
      </div>

      <div
        style={{
          display: "grid",
          gap: 12,
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
        }}
      >
        <Panel judul="Keselamatan kerja">
          {memuat ? (
            <div style={{ padding: 16, color: C.muted, fontSize: 13 }}>Memuat…</div>
          ) : (
            <div style={{ display: "grid", gap: 10, fontSize: 14 }}>
              <Baris
                label="Kecelakaan tercatat"
                nilai={String(d?.k3.kecelakaan ?? 0)}
                bahaya={(d?.k3.kecelakaan ?? 0) > 0}
              />
              <Baris
                label="Subkon di daftar hitam"
                nilai={String(d?.k3.daftar_hitam ?? 0)}
                bahaya={(d?.k3.daftar_hitam ?? 0) > 0}
              />
              <Baris
                // Skala 0-100, DIUKUR dari CHECK constraint `evaluasi_subkon`
                // — bukan ditebak. Ambang 60 karena itu batas "cukup" yang
                // lazim; menandai merah pada skala yang salah membuat
                // peringatan kehilangan artinya.
                label="Skor K3 terendah"
                nilai={d?.k3.skor_k3_terendah != null ? `${d.k3.skor_k3_terendah} / 100` : "—"}
                bahaya={(d?.k3.skor_k3_terendah ?? 100) < 60}
              />
              <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6, marginTop: 2 }}>
                Angka kecelakaan berasal dari evaluasi subkon — satu-satunya tempat ia
                tercatat hari ini.
              </div>
            </div>
          )}
        </Panel>

        <Panel judul="Pemeriksaan">
          {memuat ? (
            <div style={{ padding: 16, color: C.muted, fontSize: 13 }}>Memuat…</div>
          ) : (
            <div style={{ display: "grid", gap: 10, fontSize: 14 }}>
              <Baris
                label="Inspeksi menunggu"
                nilai={String(d?.inspeksi.menunggu ?? 0)}
                bahaya={(d?.inspeksi.menunggu ?? 0) > 0}
              />
              <Baris label="Total permintaan inspeksi" nilai={String(d?.inspeksi.total ?? 0)} />
              <Baris
                label="Dokumen belum diverifikasi"
                nilai={String(d?.dokumen.belum_terverifikasi ?? 0)}
                bahaya={(d?.dokumen.belum_terverifikasi ?? 0) > 0}
              />
              <Baris label="Total dokumen kepatuhan" nilai={String(d?.dokumen.total ?? 0)} />
            </div>
          )}
        </Panel>
      </div>

      <Panel judul="Halaman modul">
        <div
          style={{
            display: "grid",
            gap: 10,
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          }}
        >
          {PINTASAN.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              style={{
                display: "block",
                padding: "12px 14px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "var(--surface)",
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 14, color: C.text }}>{s.label}</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{s.guna}</div>
            </Link>
          ))}
        </div>
      </Panel>

      {adaKedaluwarsa && (
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "flex-start",
            padding: "12px 14px",
            borderRadius: 12,
            background: "var(--danger-bg)",
            border: `1px solid ${C.dangerBorder}`,
            fontSize: 13,
            lineHeight: 1.65,
          }}
        >
          <HardHat size={16} style={{ color: C.danger, marginTop: 2, flexShrink: 0 }} />
          <div style={{ color: C.text }}>
            <strong>{d?.dokumen.kedaluwarsa} dokumen sudah lewat masa berlaku.</strong>{" "}
            Sertifikat dan asuransi yang habis tidak menimbulkan pemberitahuan apa pun —
            ia baru terasa saat dibutuhkan, dan saat itu sudah terlambat.
          </div>
        </div>
      )}
    </div>
  );
}

function Baris({ label, nilai, bahaya }: { label: string; nilai: string; bahaya?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
      <span style={{ color: C.muted }}>{label}</span>
      <span
        style={{
          fontWeight: 600,
          color: bahaya ? C.danger : C.text,
          whiteSpace: "nowrap",
        }}
      >
        {nilai}
      </span>
    </div>
  );
}
