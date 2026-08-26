"use client";

// ============================================================================
// RETENSI SAYA — Portal Mandor
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA ADA, DAN KENAPA HANYA-BACA
// ══════════════════════════════════════════════════════════════════════════
//
// Retensi adalah UANG MANDOR YANG DITAHAN — dipotong dari tiap pembayaran
// progres sebagai jaminan mutu, lalu dicairkan belakangan. Diukur 2026-08-27:
// register ini hanya ada di `(dashboard)/mandor/retensi`, dan NOL jejak di
// `mandor-portal`.
//
// Artinya orang yang uangnya ditahan tak punya cara melihat berapa banyak,
// dari scope mana, dan berapa yang sudah cair — kecuali membuka dashboard
// desktop atau menanyakannya ke kantor.
//
// ── Kenapa TANPA tombol cairkan
//
// Bukan karena disederhanakan. `POST /mandor/retensi-releases` menuntut
// `mandor:kasbon:approve` — izin PENYETUJU, dan mandor TIDAK memilikinya
// (migrasi 050: mandor punya `mandor:kasbon:create`, bukan `approve`).
//
// Menampilkan tombol yang pasti ditolak 403 lebih buruk daripada tak
// menampilkannya: mandor mengetuk, gagal, lalu menyimpulkan aplikasinya
// rusak. Halaman ini menjawab "berapa uang saya yang ditahan", dan
// pencairannya memang keputusan orang lain.
//
// Membacanya sendiri hanya butuh `authenticate` (mandor.ts:2643), jadi tak
// ada gerbang izin tambahan di sini — server sudah menyaring ke scope milik
// tenant, dan register ini memang dimaksudkan terlihat oleh mandornya.
// ============================================================================

import { Landmark, TrendingUp, Wallet } from "lucide-react";
import { useData } from "@/lib/data-cache";
import { formatRupiah, formatRupiahSingkat } from "@/lib/format";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";

/** Bentuk disalin dari `GET /api/v1/mandor/retensi-register` (mandor.ts:2712). */
interface BarisRetensi {
  work_scope_id: string;
  scope_name: string;
  status: string | null;
  retensi_pct: number | string | null;
  project?: { id: string; name: string } | null;
  ditahan: number;
  dicairkan: number;
  outstanding: number;
}

interface RespRetensi {
  scopes: BarisRetensi[];
  total_ditahan: number;
  total_dicairkan: number;
  total_outstanding: number;
}

/*
  `formatRupiah`/`formatRupiahSingkat` dari `lib/format.ts`, BUKAN pemformat
  yang dibuat sendiri di berkas ini.

  Versi pertama berkas ini membuat pemformatnya sendiri — dan `format-ratchet`
  langsung merah. Penolakannya benar: format yang disalin antar halaman
  pelan-pelan menyimpang, dan nominal yang formatnya berbeda-beda terbaca
  sebagai aplikasi yang tak bisa dipercaya.

  Bentuk SINGKAT dipakai di rincian tiga kolom ("Rp 12,5 jt"): pada layar
  390px, tiga nominal penuh berdampingan saling menghimpit sampai kolomnya
  tak lagi sejajar. Angka penuh tetap dipakai untuk tiga ringkasan di atas,
  tempat lebarnya tersedia.
*/
export default function RetensiPortalPage() {
  const { data, memuat, galat } =
    useData<RespRetensi>("/api/v1/mandor/retensi-register");

  const baris = data?.scopes ?? [];

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
      <h1 style={{ fontSize: "var(--t-judul)", fontWeight: 700, margin: 0 }}>
        Retensi Saya
      </h1>

      {/*
        Galat MUAT berdiri sendiri — tak berbagi state dengan galat aksi
        (halaman ini memang tak punya aksi). Ditegakkan
        `uji-galat-muat-terpisah.mjs`.
      */}
      {galat && (
        <div role="alert" style={gayaGalat}>
          Gagal memuat register retensi. Tarik untuk mencoba lagi.
        </div>
      )}

      {!galat && baris.length === 0 ? (
        <EmptyState
          icon={Landmark}
          judul="Belum ada retensi"
          deskripsi="Retensi muncul di sini setelah ada pembayaran progres yang disetujui."
        />
      ) : (
        !galat && (
          <>
            {/* ── Tiga angka utama ─────────────────────────────────── */}
            <div style={{ display: "grid", gap: "var(--gap-grid)" }}>
              <Angka
                ikon={Wallet}
                label="Belum cair"
                nilai={formatRupiah(data?.total_outstanding ?? 0)}
                sorot
              />
              <div style={{ display: "flex", gap: "var(--gap-grid)" }}>
                <Angka
                  ikon={TrendingUp}
                  label="Total ditahan"
                  nilai={formatRupiah(data?.total_ditahan ?? 0)}
                  rapat
                />
                <Angka
                  ikon={Landmark}
                  label="Sudah cair"
                  nilai={formatRupiah(data?.total_dicairkan ?? 0)}
                  rapat
                />
              </div>
            </div>

            {/* ── Rincian per lingkup kerja ────────────────────────── */}
            <div style={{ display: "grid", gap: "var(--gap-grid)" }}>
              {baris.map((b) => {
                const pct = Number(b.retensi_pct ?? 0);
                return (
                  <div key={b.work_scope_id} style={kartu}>
                    <div style={{ fontWeight: 600 }}>{b.scope_name}</div>
                    {b.project?.name && (
                      <div style={{ fontSize: "var(--t-kecil)", color: "var(--text-secondary)" }}>
                        {b.project.name}
                      </div>
                    )}

                    {/*
                      Grid tiga kolom SAMA LEBAR, bukan `space-between`.

                      Dengan `space-between`, lebar tiap kolom mengikuti
                      panjang angkanya — jadi "Sisa" pada baris bernilai
                      Rp 0 menempel ke tepi kanan sementara pada baris lain
                      tidak. Terlihat di potret 2026-08-27: dua kartu
                      berdampingan dengan kolom yang tak sejajar, dan angka
                      antar-baris jadi tak bisa dibandingkan sekilas —
                      justru hal yang paling dicari orang di halaman uang.
                    */}
                    <div style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(3, 1fr)",
                      gap: 8,
                      marginTop: 10,
                    }}>
                      <Rinci label="Ditahan" nilai={formatRupiahSingkat(b.ditahan)} />
                      <Rinci label="Cair" nilai={formatRupiahSingkat(b.dicairkan)} />
                      <Rinci label="Sisa" nilai={formatRupiahSingkat(b.outstanding)} sorot />
                    </div>

                    {pct > 0 && (
                      <div style={{
                        marginTop: 8,
                        fontSize: "var(--t-kecil)",
                        color: "var(--text-secondary)",
                      }}>
                        Potongan {pct}% per pembayaran progres
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <p style={{
              margin: 0,
              fontSize: "var(--t-kecil)",
              color: "var(--text-secondary)",
              lineHeight: 1.5,
            }}>
              Pencairan retensi dilakukan kantor setelah masa pemeliharaan
              selesai. Hubungi PM bila ada yang perlu ditanyakan.
            </p>
          </>
        )
      )}
    </div>
  );
}

function Angka({
  ikon: Ikon, label, nilai, sorot, rapat,
}: {
  ikon: typeof Wallet; label: string; nilai: string; sorot?: boolean; rapat?: boolean;
}) {
  return (
    <div style={{ ...kartu, flex: rapat ? 1 : undefined }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 6,
        fontSize: "var(--t-kecil)", color: "var(--text-secondary)",
      }}>
        <Ikon size={14} aria-hidden />
        {label}
      </div>
      <div style={{
        marginTop: 4,
        fontSize: sorot ? "var(--t-judul)" : "var(--t-sedang)",
        fontWeight: 700,
        color: sorot ? "var(--aksen)" : "var(--text-primary)",
        // Angka rupiah berdampingan wajib rata digit — tanpa ini, kolom
        // nominal bergoyang dan sulit dibandingkan sekilas.
        fontVariantNumeric: "tabular-nums",
      }}>
        {nilai}
      </div>
    </div>
  );
}

function Rinci({ label, nilai, sorot }: { label: string; nilai: string; sorot?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: "var(--t-kecil)", color: "var(--text-secondary)" }}>{label}</div>
      <div style={{
        fontWeight: sorot ? 700 : 600,
        color: sorot ? "var(--aksen)" : "var(--text-primary)",
        fontVariantNumeric: "tabular-nums",
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

const gayaGalat: React.CSSProperties = {
  ...kartu,
  background: "var(--danger-bg)",
  color: "var(--on-danger-bg)",
  border: "none",
};
