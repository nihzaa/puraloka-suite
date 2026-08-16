"use client";

/**
 * IKHTISAR "AI & OTOMASI" — halaman menu induk.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * PERTANYAAN YANG DIBAWA KE HALAMAN INI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * "Apakah otomasi saya sehat hari ini?" — dan itu pertanyaan yang TAK BISA
 * dijawab satu sub-menu pun sendirian. Sebelum halaman ini, menjawabnya
 * menuntut membuka lima halaman dan mengingat isinya; tak ada yang melakukan
 * itu, jadi penyedia yang mati baru ketahuan saat ada yang mengeluh.
 *
 * Penjaga `uji-induk-punya-ikhtisar` sudah menandai `g-ai` sebagai satu dari
 * dua grup tanpa ikhtisar — jadi ini hutang yang tercatat, bukan hiasan.
 *
 * ── Urutan kartu mengikuti cara orang menelusuri masalah
 *
 * Kesehatan penyedia lebih dulu, biaya belakangan. Yang membuka halaman ini
 * hampir selalu sedang mencari sebab, bukan sedang mengaudit tagihan — dan
 * angka biaya di posisi pertama membuat mata melewati kartu yang justru
 * menjawab pertanyaannya.
 *
 * ── Warna (ARAH-VISUAL-2026 §3d: satu aksen per layar)
 *
 * Navy HANYA untuk satu angka: penyedia sehat / total aktif. Itu satu-satunya
 * angka yang menentukan apakah sisanya bisa dipercaya. Biaya, percakapan, dan
 * nomor WA netral; yang bermasalah memakai nada BAHAYA — bukan aksen, karena
 * bahaya bukan penonjolan melainkan peringatan.
 */

import { useTerpasang } from "@/lib/use-terpasang";
import Link from "next/link";
import { Bot, MessageSquare, ShieldAlert, Wallet, Workflow } from "lucide-react";
import { useData } from "@/lib/data-cache";
import { C } from "@/lib/warna-ui";
import { KepalaHalaman } from "@/components/dasar";
import { KartuKPI, Panel } from "@/components/ui-dasar";
import { BarisRail, KartuRail } from "@/components/shell/rail-kartu";
import { RailIsi } from "@/components/shell/rail-isi";
import { usePasangRail } from "@/lib/rail-context";

interface Bermasalah {
  jenis: string;
  nama: string;
  kesehatan: string;
}

interface Aktivitas {
  pada: string;
  jenis: string;
  judul: string;
  status: string;
  pesan: string | null;
  /** Berapa kejadian identik BERURUTAN yang diringkas jadi baris ini. */
  ulang: number;
}

interface PercakapanRingkas {
  id: string;
  judul: string;
  kanal: string;
  pada: string;
}

interface Ikhtisar {
  penyedia: {
    total: number;
    aktif: number;
    sehat: number;
    bermasalah: Bermasalah[];
  };
  biaya_bulan_ini_idr: number;
  percakapan: number;
  nomor_wa: { total: number; terverifikasi: number };
  akses_ditolak: number;
  aktivitas: Aktivitas[];
  percakapan_terakhir: PercakapanRingkas[];
}

/** Waktu relatif — "2 jam lalu" lebih cepat dibaca daripada stempel penuh. */
function sejak(iso: string): string {
  const detik = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (detik < 60) return "baru saja";
  if (detik < 3600) return `${Math.floor(detik / 60)} mnt lalu`;
  if (detik < 86400) return `${Math.floor(detik / 3600)} jam lalu`;
  return `${Math.floor(detik / 86400)} hr lalu`;
}

/** Nada status: yang GAGAL menonjol, sisanya diam. */
function nadaStatus(s: string): { warna: string; label: string } {
  const gagal = /gagal|error|failed|ditolak/i.test(s);
  return {
    warna: gagal ? C.danger : C.muted,
    label: s,
  };
}

const rupiah = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;

/**
 * Sub-menu grup ini.
 *
 * ⚠ Komentar lama berbunyi "sumbernya SATU tempat supaya tak menyimpang dari
 * DB" — dan itu tidak benar: daftar ini LITERAL, tak pernah membaca
 * `menu_items`. Klaim yang salah lebih berbahaya daripada tak ada klaim,
 * karena ia menghentikan orang berikutnya dari memeriksa.
 *
 * Buktinya ada di daftar itu sendiri: ia melewatkan `/otomasi/alur` dan
 * `/otomasi/riwayat` — DUA halaman yang tinggal di direktori yang sama
 * dengan berkas ini. Halaman ikhtisar yang tak menautkan sub-halamannya
 * sendiri membuat keduanya hanya bisa dicapai lewat sidebar, dan orang yang
 * masuk dari sini menyimpulkan keduanya tak ada.
 *
 * Ditulis apa adanya sebagai literal, dengan dua yang hilang ditambahkan.
 * Menjadikannya benar-benar dari DB adalah pekerjaan tersendiri (butuh
 * endpoint menu per-grup); yang tak boleh adalah mengaku sudah begitu.
 */
const PINTASAN = [
  // Dua halaman di direktori ini sendiri — didahulukan karena inilah yang
  // dicari orang saat membuka ikhtisar otomasi.
  { href: "/otomasi/alur", label: "Alur Otomasi", guna: "Katalog alur, jalankan, jejak eksekusi" },
  { href: "/otomasi/riwayat", label: "Riwayat Asisten", guna: "Percakapan & keputusan yang diambil AI" },
  { href: "/pengaturan/penyedia", label: "Penyedia Layanan", guna: "Sambungan AI & WhatsApp, uji koneksi" },
  { href: "/pengaturan/penyedia-ai", label: "Penyedia AI", guna: "Model per asisten & batas biaya" },
  { href: "/pengaturan/asisten", label: "Perilaku Asisten", guna: "Prompt, ronde, tool yang aktif" },
  { href: "/pengaturan/biaya-ai", label: "Pemakaian & Biaya", guna: "Deret harian, per model, per asisten" },
  { href: "/pengaturan/whatsapp", label: "Kanal WhatsApp", guna: "Nomor terdaftar & verifikasi" },
  { href: "/pengaturan/plafon-asisten", label: "Plafon Asisten", guna: "Batas nominal persetujuan per orang" },
];

const LABEL_KESEHATAN: Record<string, string> = {
  belum_diuji: "belum diuji",
  gagal: "gagal",
  sehat: "sehat",
};

export default function OtomasiPage() {
  const mounted = useTerpasang();
  if (!mounted) return null;
  return <Konten />;
}

function Konten() {
  /*
    ── PINDAH KE LAPIS CACHE BERSAMA (F4-2), 2026-08-16

    `useData` menggantikan useCallback+useEffect+queueMicrotask. Pesan galat
    tetap menyebut AKIBAT, bukan sekadar "gagal" — derivasi dari `galatMuat`.
  */
  const { data, memuat, galat: galatMuat } = useData<Ikhtisar>("/api/v1/otomasi/ikhtisar");
  // Pesannya menyebut AKIBAT, bukan sekadar "gagal": halaman ini dibuka
  // orang yang sedang mencari sebab, dan "gagal memuat" menambah satu
  // misteri alih-alih mengurangi.
  const galat = galatMuat
    ? "Ikhtisar tak bisa dimuat — status penyedia di bawah mungkin tidak mutakhir."
    : null;

  const p = data?.penyedia;
  const adaMasalah = (p?.bermasalah.length ?? 0) > 0;

  /*
   * Rail kanan: yang MENUNTUT TINDAKAN, bukan ringkasan kedua.
   *
   * Penyedia bermasalah dan percobaan akses ditolak — keduanya mudah terlewat
   * kalau harus di-scroll, dan keduanya adalah hal yang orangnya perlu
   * lakukan sesuatu, bukan sekadar ketahui.
   */
  usePasangRail(
    <RailIsi
      konteks={
        <>
          <KartuRail
            judul="Penyedia bermasalah"
            tautan="/pengaturan/penyedia"
            kosong="Semua penyedia aktif dalam keadaan sehat."
          >
            {(p?.bermasalah ?? []).slice(0, 6).map((b, i) => (
              <BarisRail
                key={`${b.jenis}-${b.nama}`}
                pertama={i === 0}
                utama={b.nama}
                sub={b.jenis === "wa" ? "WhatsApp" : "AI"}
                kanan={LABEL_KESEHATAN[b.kesehatan] ?? b.kesehatan}
                nadaKanan={b.kesehatan === "gagal" ? "bahaya" : "normal"}
                href="/pengaturan/penyedia"
              />
            ))}
          </KartuRail>

          <KartuRail
            judul="Kanal WhatsApp"
            tautan="/pengaturan/whatsapp"
            kosong="Belum ada nomor terdaftar."
          >
            {data && data.nomor_wa.total > 0 ? (
              <BarisRail
                pertama
                utama={`${data.nomor_wa.terverifikasi} dari ${data.nomor_wa.total} nomor siap`}
                sub="Terverifikasi dan aktif"
                kanan={data.nomor_wa.terverifikasi === data.nomor_wa.total ? "lengkap" : "sebagian"}
                nadaKanan={data.nomor_wa.terverifikasi === 0 ? "bahaya" : "normal"}
                href="/pengaturan/whatsapp"
              />
            ) : null}
          </KartuRail>
        </>
      }
    />,
    [data],
  );

  return (
    <div style={{
      // --w-page — dashboard kartu grid — bukan tabel, bukan bacaan. Tanpa container, isi halaman ini melebar
      // mengikuti induknya: diukur 1080px di layar 1600px sementara
      // halaman lain 1380px — terlihat seperti dua aplikasi berbeda.
      padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)",
      width: "100%", maxWidth: "var(--w-page)", margin: "0 auto",
      display: "grid", gap: 16,
    }}>
      <KepalaHalaman
        judul="AI & Otomasi"
        keterangan="Kesehatan sambungan, pemakaian, dan kanal — satu layar sebelum masuk ke pengaturannya."
              ikon={<Workflow size={19} />}
      />

      {galat && (
        <div
          role="status"
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            background: "var(--danger-bg)",
            border: `1px solid ${C.dangerBorder}`,
            color: C.onDangerBg ?? C.text,
            fontSize: 13,
          }}
        >
          {galat}
        </div>
      )}

      {/* KPI — navy HANYA di kartu kesehatan penyedia (§3d). */}
      <div
        style={{
          display: "grid",
          gap: 12,
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        }}
      >
        <KartuKPI
          label="Penyedia sehat"
          nilai={memuat ? "…" : `${p?.sehat ?? 0}/${p?.aktif ?? 0}`}
          keterangan={
            adaMasalah
              ? `${p?.bermasalah.length} perlu diperiksa`
              : (p?.aktif ?? 0) === 0
                ? "belum ada penyedia aktif"
                : "semua sambungan hidup"
          }
          ikon={<Bot size={15} />}
          sorot={!adaMasalah && (p?.aktif ?? 0) > 0}
        />
        <KartuKPI
          label="Biaya AI bulan ini"
          nilai={memuat ? "…" : rupiah(data?.biaya_bulan_ini_idr ?? 0)}
          keterangan="sejak tanggal 1"
          ikon={<Wallet size={15} />}
        />
        <KartuKPI
          label="Percakapan"
          nilai={memuat ? "…" : String(data?.percakapan ?? 0)}
          keterangan="total tersimpan"
          ikon={<MessageSquare size={15} />}
        />
        <KartuKPI
          label="Akses ditolak"
          nilai={memuat ? "…" : String(data?.akses_ditolak ?? 0)}
          keterangan="nomor tak dikenal mencoba"
          ikon={<ShieldAlert size={15} />}
        />
      </div>

      {/*
        Aktivitas terakhir — inilah yang mengisi pertanyaan "apa yang terjadi
        tadi?". Dua ruas: aktivitas (kiri, lebih lebar) dan percakapan
        (kanan). Percakapan lebih sempit karena judulnya pendek; memberinya
        lebar yang sama akan menyisakan ruang kosong di tiap barisnya.
      */}
      <div
        style={{
          display: "grid",
          gap: 12,
          gridTemplateColumns: "minmax(0, 1.6fr) minmax(0, 1fr)",
        }}
      >
        <Panel judul="Aktivitas terakhir">
          {memuat ? (
            <div style={{ padding: 16, color: C.muted, fontSize: 13 }}>Memuat…</div>
          ) : (data?.aktivitas.length ?? 0) === 0 ? (
            <div style={{ padding: 16, color: C.muted, fontSize: 13 }}>
              Belum ada aktivitas tercatat. Pesan WhatsApp dan uji koneksi akan muncul di sini.
            </div>
          ) : (
            <div style={{ display: "grid" }}>
              {data!.aktivitas.map((a, i) => {
                const nada = nadaStatus(a.status);
                return (
                  <div
                    key={`${a.pada}-${i}`}
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      gap: 10,
                      padding: "9px 4px",
                      borderTop: i === 0 ? "none" : "1px solid var(--border)",
                      fontSize: 13,
                    }}
                  >
                    <span style={{ flex: 1, minWidth: 0, color: C.text }}>
                      {a.judul}
                      {a.ulang > 1 && (
                        // Hitungan pengulangan DINYATAKAN, bukan disembunyikan:
                        // "gagal 19×" adalah fakta yang berbeda dari "gagal".
                        <span style={{ color: C.muted, fontSize: 12, marginLeft: 6 }}>
                          ×{a.ulang}
                        </span>
                      )}
                    </span>
                    <span
                      style={{
                        color: nada.warna,
                        fontSize: 12,
                        whiteSpace: "nowrap",
                        fontWeight: nada.warna === C.danger ? 600 : 400,
                      }}
                    >
                      {nada.label}
                    </span>
                    <span style={{ color: C.muted, fontSize: 12, whiteSpace: "nowrap", minWidth: 76, textAlign: "right" }}>
                      {sejak(a.pada)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel judul="Percakapan terakhir">
          {memuat ? (
            <div style={{ padding: 16, color: C.muted, fontSize: 13 }}>Memuat…</div>
          ) : (data?.percakapan_terakhir.length ?? 0) === 0 ? (
            <div style={{ padding: 16, color: C.muted, fontSize: 13 }}>
              Belum ada percakapan dengan asisten.
            </div>
          ) : (
            <div style={{ display: "grid" }}>
              {data!.percakapan_terakhir.map((p, i) => (
                <div
                  key={p.id}
                  style={{
                    padding: "9px 4px",
                    borderTop: i === 0 ? "none" : "1px solid var(--border)",
                    fontSize: 13,
                  }}
                >
                  <div
                    style={{
                      color: C.text,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {p.judul}
                  </div>
                  <div style={{ color: C.muted, fontSize: 12, marginTop: 1 }}>
                    {p.kanal === "ai_whatsapp" ? "WhatsApp" : "Web"} · {sejak(p.pada)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <Panel judul="Pengaturan">
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
    </div>
  );
}
