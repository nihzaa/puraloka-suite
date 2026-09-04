"use client";

/**
 * PROYEK — RINGKASAN. Dashboard modul, bukan langsung daftar (UI-2-3).
 *
 * ── Tiga lapis (ARAH-VISUAL-2026 §5b)
 *
 *   LAPIS 1  empat kartu KPI          "apa yang terjadi?"
 *   LAPIS 2  satu grafik selisih      "yang mana yang bermasalah?"
 *   LAPIS 3  daftar proyek + saringan "apa yang harus saya kerjakan?"
 *
 * Berbeda dengan `/kas`, lapis ketiga di sini TETAP daftar penuhnya, bukan
 * pintu ke sub-halaman. Alasannya: `/proyek` sudah menjadi tempat orang
 * mencari satu proyek untuk dibuka, dan memindahkan daftarnya ke rute lain
 * berarti menambah satu klik ke perjalanan yang paling sering ditempuh di
 * seluruh aplikasi. Yang ditambahkan di atasnya adalah jawaban atas
 * pertanyaan yang SELAMA INI tak bisa dijawab daftar itu.
 *
 * ── Dari mana KPI-nya (§5c: aktif · progres rata-rata · telat · selesai
 *    bulan ini) — NOL endpoint baru
 *
 * Keempatnya turunan dari SATU respons `/api/v1/projects`, yang sudah
 * mengirim `status`, `progress_pct`, `start_date`, `end_date`,
 * `actual_end_date`, dan `contract_value`. Hitungannya ada di
 * `lib/ringkasan-proyek.ts` — di sana ia bisa diuji tanpa merender halaman,
 * dan batas tanggalnya (yang paling sunyi kalau salah) sudah punya 35 test.
 *
 * ── Kenapa KPI ketiga disebut "LEWAT TENGGAT", bukan "TELAT"
 *
 * Ini bukan pelembutan bahasa. Keterlambatan yang sudah dimaafkan lewat EOT
 * secara kontrak BUKAN keterlambatan, dan data EOT (`contract_eot`) tidak
 * dikirim oleh `/api/v1/projects` — ia hanya ada di
 * `/api/v1/analisa-keterlambatan`, yang menghitung per-MILESTONE, bukan
 * per-proyek. Menyebut angka di sini "telat" berarti aplikasi punya dua
 * angka keterlambatan yang berbeda, dan yang tanpa EOT selalu menuduh lebih
 * berat. Karena itu kartunya menyatakan fakta tanggal, lalu menunjuk ke
 * halaman yang punya bahan untuk memberi vonis.
 *
 * ── Kenapa "serapan anggaran", bukan "progres"
 *
 * `projects.progress_pct` adalah bobot RAB yang terserap, bukan kemajuan
 * fisik lapangan — keduanya sumber independen di basis ini. Menyebutnya
 * "progres" membuat orang mengira 40% berarti bangunannya sudah 40% berdiri.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { useTerpasang } from "@/lib/use-terpasang";
import { KepalaHalaman } from "@/components/dasar";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle, Building2, CalendarClock, CheckCircle2, Clock,
  LayoutGrid, List, Plus, RefreshCw, Search, TrendingDown, TrendingUp, FolderKanban } from "lucide-react";
import { useData } from "@/lib/data-cache";
import { useIzin } from "@/lib/use-izin";
import { C } from "@/lib/warna-ui";
import { KartuKPI, Kosong, Panel } from "@/components/ui-dasar";
import { GrafikModul } from "@/components/shell/grafik-modul";
import { ProjectModal } from "@/components/project-modal";
import { useToast } from "@/components/toast";
import { KartuRail, BarisRail } from "@/components/shell/rail-kartu";
import { RailIsi } from "@/components/shell/rail-isi";
import { usePasangRail } from "@/lib/rail-context";
import {
  hariIniWIB, palingTertinggal, ringkasProyek, type BarisSelisih,
} from "@/lib/ringkasan-proyek";
import {
  ProjectCardGrid, ProjectCardList, Skeleton, fmtCompact, kartu, type Project,
} from "./_bersama/kartu-proyek";

type SortKey = "newest" | "value_desc" | "progress_desc" | "deadline_asc";
type StatusFilter = "all" | "active" | "completed" | "on_hold" | "draft";
type ViewMode = "grid" | "list";

export default function ProyekPage() {
  const mounted = useTerpasang();
  if (!mounted) return null;
  return <ProyekRingkasan />;
}

function ProyekRingkasan() {
  const router = useRouter();
  const { showToast } = useToast();
  // Diangkat dari JSX: `hasPermission` di jalur render membuat pohon server
  // dan klien berbeda. Detail: `lib/use-izin.ts`.
  const bolehBuatProyek = useIzin("projects:create");

  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortKey>("newest");
  const [showModal, setShowModal] = useState(false);

  // Tanggal acuan DIBEKUKAN saat halaman dipasang, bukan dibaca ulang tiap
  // render. Kalau tidak, kartu KPI dan daftar di bawahnya bisa memakai
  // tanggal berbeda saat halaman dibuka melewati tengah malam — dan angka
  // yang tak cocok dengan daftarnya sendiri adalah cara tercepat membuat
  // orang berhenti memercayai keduanya.
  const [hariIni] = useState(() => hariIniWIB());

  /*
    ── PINDAH KE LAPIS CACHE BERSAMA (F4-2), 2026-08-16

    `useData` menggantikan `abortRef`+`fetchProject`+try/catch/finally
    manual. `AbortController` tak lagi perlu dikelola sendiri — `useData`
    sudah menjaga jawaban yang datang sesudah komponen mati.
  */
  const { data, memuat: loading, galat: galatMuat, muatUlang } =
    useData<{ projects: Project[] }>("/api/v1/projects");
  // `useMemo`, bukan `?? []` polos: turunan array yang masuk dependensi
  // `useMemo`/`useCallback` lain (ringkas, tertinggal, filtered, rail) di
  // bawah butuh referensi STABIL — kalau tidak, tiap render membuat array
  // baru dan menembus ratchet `exhaustive-deps`.
  const projects = useMemo(() => data?.projects ?? [], [data]);
  const muatProyek = useCallback(async () => { await muatUlang(); }, [muatUlang]);
  const error = galatMuat ? "Gagal memuat proyek. Pastikan API server berjalan." : "";

  function handleSearchChange(val: string) {
    setSearchInput(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearch(val), 300);
  }

  function handleCreateSuccess() {
    void muatProyek();
    showToast("success", "Proyek berhasil dibuat!");
  }

  // ── LAPIS 1 & 2 — dihitung dari respons yang SAMA dengan daftarnya ────────
  const ringkas = useMemo(() => ringkasProyek(projects, hariIni), [projects, hariIni]);
  const tertinggal = useMemo(() => palingTertinggal(projects, hariIni), [projects, hariIni]);

  // ── LAPIS 3 — saringan & urutan, dipertahankan utuh dari versi sebelumnya ─
  const filtered = useMemo(() => projects
    .filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          p.name.toLowerCase().includes(q) ||
          (p.clients?.contact_person ?? "").toLowerCase().includes(q) ||
          p.location.toLowerCase().includes(q) ||
          (p.pm?.name ?? "").toLowerCase().includes(q)
        );
      }
      return true;
    })
    .sort((a, b) => {
      if (sort === "value_desc") return Number(b.contract_value) - Number(a.contract_value);
      if (sort === "progress_desc") return Number(b.progress_pct) - Number(a.progress_pct);
      if (sort === "deadline_asc") return new Date(a.end_date).getTime() - new Date(b.end_date).getTime();
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }), [projects, statusFilter, search, sort]);

  const STATUS_TABS: { key: StatusFilter; label: string }[] = [
    { key: "all",       label: "Semua" },
    { key: "active",    label: "Aktif" },
    { key: "completed", label: "Selesai" },
    { key: "on_hold",   label: "Ditunda" },
    { key: "draft",     label: "Draft" },
  ];

  const counts = projects.reduce<Record<string, number>>((acc, p) => {
    acc[p.status] = (acc[p.status] ?? 0) + 1;
    acc.all = (acc.all ?? 0) + 1;
    return acc;
  }, {});

  const isFiltered = search.trim() !== "" || statusFilter !== "all";

  /**
   * Menyaring daftar ke proyek yang lewat tenggat — dipakai spanduk peringatan.
   *
   * `status: "all"` DIPERTAHANKAN, bukan diubah ke "active": proyek `on_hold`
   * yang melewati tenggatnya justru yang paling menuntut keputusan, dan
   * menyaringnya ke "active" akan menyembunyikannya persis saat ia diklik.
   */
  function lompatKeLewatTenggat() {
    setStatusFilter("all");
    setSearchInput("");
    setSearch("");
    setSort("deadline_asc");
    document.getElementById("daftar-proyek")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /*
    RAIL KONTEKSTUAL — aturan founder 2026-08-08.

    Di beranda rail berisi kalender · tugas · notifikasi. Di halaman lain
    ketiganya DIGANTI yang relevan; AI dan Pengingat SELALU ada (dipaksa oleh
    bentuk `RailIsi`, bukan oleh ingatan penulis halaman).

    Di sini yang relevan: proyek yang tenggatnya paling dekat, dan yang
    progresnya belum bergerak. Keduanya dari `projects` yang SUDAH dimuat
    halaman — nol permintaan jaringan tambahan.
  */
  // `sekarang` DIBEKUKAN saat halaman dipasang — pola yang sama dengan
  // `hariIni` di atas, bukan `Date.now()` dipanggil ulang di dalam `.map()`.
  // Sesudah `useEffect` pemuatan lama dibuang (F4-2), linter murni
  // (`react-hooks/purity`) tak lagi punya batas efek untuk menganggap
  // `Date.now()` di badan render sebagai "boleh tak murni" — dibekukan lewat
  // `useState` menahannya, dan sekaligus lebih benar: "N hari lagi" di rail
  // tak lagi diam-diam berubah tiap render tanpa alasan.
  const [sekarang] = useState(() => Date.now());
  usePasangRail(
    <RailIsi
      tanggalTenggat={projects.map((p) => p.end_date)}
      konteks={
        <>
          <KartuRail
            judul="Tenggat terdekat"
            tautan="/kalender"
            labelTautan="Kalender"
            kosong="Tak ada proyek berjalan."
          >
            {[...projects]
              .filter((p) => p.status === "active" && p.end_date)
              .sort((a, b) => a.end_date.localeCompare(b.end_date))
              .slice(0, 5)
              .map((p, i) => {
                const sisa = Math.round(
                  (new Date(p.end_date).getTime() - sekarang) / 86_400_000,
                );
                return (
                  <BarisRail
                    key={p.id}
                    pertama={i === 0}
                    utama={p.name}
                    sub={p.location}
                    kanan={sisa < 0 ? `${Math.abs(sisa)}h lewat` : `${sisa}h`}
                    nadaKanan={sisa < 0 ? "bahaya" : "normal"}
                    href={`/proyek/${p.id}`}
                  />
                );
              })}
          </KartuRail>

          <KartuRail
            judul="Belum bergerak"
            kosong="Semua proyek berjalan sudah punya progres."
          >
            {projects
              .filter((p) => p.status === "active" && (p.progress_pct ?? 0) <= 0)
              .slice(0, 5)
              .map((p, i) => (
                <BarisRail
                  key={p.id}
                  pertama={i === 0}
                  utama={p.name}
                  sub={p.location}
                  kanan="0%"
                  nadaKanan="bahaya"
                  href={`/proyek/${p.id}`}
                />
              ))}
          </KartuRail>
        </>
      }
    />,
    [projects],
  );

  return (
    <div style={{
      padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)",
      width: "100%", maxWidth: "var(--w-page)", margin: "0 auto",
    }}>
      {/* ── Kepala ── */}
      <div className="rise" style={{
        display: "flex", justifyContent: "space-between", alignItems: "flex-start",
        gap: 12, flexWrap: "wrap", marginBottom: 20,
      }}>
        <KepalaHalaman judul="Proyek" keterangan="Keadaan seluruh portofolio, lalu daftarnya"         ikon={<FolderKanban size={19} />}
      />
        {bolehBuatProyek && (
          <button
            onClick={() => setShowModal(true)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "8px 16px", borderRadius: 6, border: "none",
              background: "var(--grad-aksen)", color: C.onNavy, fontSize: 13, fontWeight: 600,
              cursor: "pointer", transition: "background 0.15s",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "var(--aksen-pekat)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = C.navy; }}
          >
            <Plus size={15} aria-hidden="true" />
            Tambah Proyek
          </button>
        )}
      </div>

      {/* ── Galat ── */}
      {error && (
        <div style={{
          background: C.redBg, border: `1px solid ${C.redBorder}`, borderRadius: 10,
          padding: "12px 16px", color: C.onDangerBg, fontSize: 13, marginBottom: 20,
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <AlertTriangle size={15} aria-hidden="true" />
          {error}
          <button onClick={() => void muatProyek()} style={{
            color: C.navy, background: "none", border: "none", cursor: "pointer",
            fontSize: 12, display: "inline-flex", alignItems: "center", gap: 4,
            fontWeight: 600, marginLeft: "auto",
          }}>
            <RefreshCw size={11} aria-hidden="true" /> Coba lagi
          </button>
        </div>
      )}

      {/* ── LAPIS 1 — KEADAAN ── */}
      <div className="rise rise-1" style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))",
        gap: 12, marginBottom: 20,
      }}>
        {loading ? (
          Array.from({ length: 4 }, (_, i) => (
            <div key={i} aria-hidden="true" style={{
              height: 118, borderRadius: 14,
              background: "var(--surface-subtle)", border: `1px solid ${C.border}`,
            }} />
          ))
        ) : (
          <>
            <KartuKPI
              sorot
              label="Proyek Aktif"
              nilai={String(ringkas.aktif)}
              nilaiAngka={ringkas.aktif}
              ikon={<Building2 size={15} />}
              keterangan={`${fmtCompact(ringkas.nilaiAktif)} nilai kontrak berjalan · ${ringkas.total} proyek total`}
            />
            <KartuKPI
              label="Serapan Rata-rata"
              // Angka yang tak ada TIDAK ditulis "0%". Nol berarti "proyek
              // jalan tapi belum satu pun bergerak" — pernyataan yang sangat
              // berbeda dari "tak ada proyek aktif", dan hanya salah satunya
              // menuntut panggilan telepon.
              nilai={ringkas.progresRata === null ? "—" : `${ringkas.progresRata.toFixed(1)}%`}
              ikon={<TrendingUp size={15} />}
              keterangan={ringkas.progresRata === null
                ? "belum ada proyek aktif untuk dirata-ratakan"
                : "bobot RAB terserap pada proyek aktif — bukan kemajuan fisik"}
            />
            <KartuKPI
              label="Lewat Tenggat"
              nilai={String(ringkas.lewatTenggat)}
              nilaiAngka={ringkas.lewatTenggat}
              naikBagus={false}
              ikon={<AlertTriangle size={15} />}
              onClick={ringkas.lewatTenggat > 0 ? lompatKeLewatTenggat : undefined}
              keterangan={ringkas.lewatTenggat === 0
                ? "tak ada proyek melewati tanggal akhir kontraknya"
                : `${ringkas.segeraJatuhTempo} lagi jatuh tempo ≤14 hari · EOT belum diperhitungkan`}
            />
            <KartuKPI
              label="Selesai Bulan Ini"
              nilai={String(ringkas.selesaiBulanIni)}
              nilaiAngka={ringkas.selesaiBulanIni}
              ikon={<CheckCircle2 size={15} />}
              keterangan={`${counts.completed ?? 0} selesai sepanjang riwayat`}
            />
          </>
        )}
      </div>

          {/* Grafik modul — lihat `components/shell/grafik-modul.tsx` */}
          <GrafikModul modul="proyek" />

      {/* Yang menuntut tindakan — spanduk, bukan kartu KPI kelima. Kartu KPI
          menyatakan keadaan; spanduk ini menyatakan bahwa ada sesuatu yang
          harus dikerjakan HARI INI, dan karena itu ia menghilang saat tak ada. */}
      {!loading && ringkas.segeraJatuhTempo > 0 && (
        <div className="rise rise-1" style={{
          display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
          padding: "12px 16px", borderRadius: 10, marginBottom: 20,
          background: C.yellowBg, border: `1px solid ${C.yellowBorder}`,
        }}>
          <CalendarClock size={16} aria-hidden="true" style={{ color: C.onWarningBg, flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: C.onWarningBg, fontWeight: 600 }}>
            {ringkas.segeraJatuhTempo} proyek jatuh tempo dalam 14 hari ke depan —
            masih bisa dikejar, dan tak akan terlihat di angka &ldquo;lewat tenggat&rdquo;.
          </span>
          <button onClick={lompatKeLewatTenggat} style={{
            marginLeft: "auto", fontSize: 11, color: C.onWarningBg, fontWeight: 700,
            background: "none", border: "none", cursor: "pointer", whiteSpace: "nowrap",
          }}>
            Urutkan menurut tenggat →
          </button>
        </div>
      )}

      {/* ── LAPIS 2 — POLA ──
          Pertanyaan yang dijawab: "proyek mana yang paling jauh dari target?"

          Grafik batang biasa (nilai kontrak per proyek, jumlah per status)
          sengaja TIDAK dipilih: keduanya hanya menggambar ulang angka yang
          sudah terbaca dari daftar di bawah, dan grafik yang mengulang daftar
          adalah hiasan. Yang tak bisa dibaca dari daftar mana pun adalah
          SELISIH antara serapan nyata dan garis jadwal — dua angka yang harus
          dibandingkan proyek per proyek dengan kalkulator kalau tak digambar. */}
      <div className="rise rise-2" style={{ marginBottom: 20 }}>
        <Panel
          judul="Paling Tertinggal dari Jadwal"
          keterangan="serapan RAB dibanding waktu kontrak yang sudah berjalan · proyek aktif"
          aksi={
            <Link href="/proyek/keterlambatan" style={{
              fontSize: 11, fontWeight: 600, color: C.navy, textDecoration: "none",
              whiteSpace: "nowrap",
            }}>
              Analisa keterlambatan (dengan EOT) →
            </Link>
          }
        >
          {loading ? (
            <div aria-hidden="true" style={{ height: 180, borderRadius: 10, background: "var(--surface-subtle)" }} />
          ) : tertinggal.length === 0 ? (
            <Kosong
              ikon={<TrendingDown size={32} aria-hidden="true" />}
              judul={ringkas.aktif === 0 ? "Belum ada proyek aktif" : "Tak ada yang tertinggal dari jadwal"}
              sebab={ringkas.aktif === 0
                ? "Perbandingan ini hanya menghitung proyek berstatus aktif. Proyek draft dan yang ditunda belum punya jadwal berjalan untuk dibandingkan."
                : "Seluruh proyek aktif serapannya sama atau di atas garis waktu kontrak. Garis itu lurus dan konstruksi tidak lurus, jadi ini bukan jaminan — tapi tak ada satu pun yang menonjol tertinggal."}
            />
          ) : (
            <GrafikSelisih baris={tertinggal} />
          )}
        </Panel>
      </div>

      {/* ── LAPIS 3 — DETAIL ── */}
      <div id="daftar-proyek" className="rise rise-3" style={{ ...kartu, padding: "12px 16px", marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 220, position: "relative" }}>
            <Search size={14} aria-hidden="true" style={{
              position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)",
              color: C.muted, pointerEvents: "none",
            }} />
            <input
              value={searchInput}
              onChange={e => handleSearchChange(e.target.value)}
              aria-label="Cari proyek"
              placeholder="Cari nama proyek, klien, PM, atau lokasi..."
              style={{
                width: "100%", padding: "8px 12px 8px 32px",
                border: "1px solid var(--border)", borderRadius: 6,
                fontSize: 13, color: C.text, background: "var(--surface)",
                outline: "none", transition: "border-color 0.15s, box-shadow 0.15s",
                boxSizing: "border-box",
              }}
              onFocus={e => { e.target.style.borderColor = C.navy; e.target.style.boxShadow = "0 0 0 3px var(--info-bg)"; }}
              onBlur={e => { e.target.style.borderColor = "var(--border)"; e.target.style.boxShadow = "none"; }}
            />
          </div>
          <select aria-label="Urutan"
            value={sort}
            onChange={e => setSort(e.target.value as SortKey)}
            style={{
              padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 6,
              fontSize: 13, color: C.text, background: "var(--surface)",
              cursor: "pointer", outline: "none",
            }}
          >
            <option value="newest">Terbaru</option>
            <option value="value_desc">Nilai Tertinggi</option>
            <option value="progress_desc">Serapan Tertinggi</option>
            <option value="deadline_asc">Tenggat Terdekat</option>
          </select>
          <div style={{ display: "flex", border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden" }}>
            {(["grid", "list"] as ViewMode[]).map(v => (
              <button aria-label={v === "grid" ? "Tampilan grid" : "Tampilan daftar"}
                key={v}
                aria-pressed={viewMode === v}
                onClick={() => setViewMode(v)}
                title={v === "grid" ? "Grid" : "Daftar"}
                style={{
                  width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center",
                  border: "none", cursor: "pointer", transition: "all 0.12s",
                  background: viewMode === v ? C.navyLight : "var(--surface)",
                  color: viewMode === v ? C.navy : C.muted,
                }}
              >
                {v === "grid" ? <LayoutGrid size={15} aria-hidden="true" /> : <List size={15} aria-hidden="true" />}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {STATUS_TABS.map(tab => {
              const aktif = statusFilter === tab.key;
              return (
                <button
                  key={tab.key}
                  aria-label={`Tampilkan proyek berstatus ${tab.label}`}
                  aria-pressed={aktif}
                  onClick={() => setStatusFilter(tab.key)}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 4,
                    padding: "4px 12px", borderRadius: 6, border: "none",
                    fontSize: 12, fontWeight: aktif ? 600 : 400,
                    cursor: "pointer", transition: "all 0.12s",
                    background: aktif ? C.navyLight : "transparent",
                    color: aktif ? C.navy : C.mid,
                  }}
                  onMouseEnter={e => { if (!aktif) { e.currentTarget.style.background = "var(--surface-hover)"; e.currentTarget.style.color = C.text; } }}
                  onMouseLeave={e => { if (!aktif) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = C.mid; } }}
                >
                  {tab.label}
                  <span style={{
                    fontSize: 10, fontWeight: 700,
                    // 18% → 10%: di mode gelap latar 18% terlalu terang untuk teks
                    // `--navy` di atasnya (4,05:1, ambang 4,5). Diukur axe di
                    // /proyek. 10% memberi 4,79:1 dengan perubahan paling kecil.
                    background: aktif ? "color-mix(in srgb, var(--aksen) 10%, transparent)" : "var(--surface-hover)",
                    color: aktif ? C.navy : C.muted,
                    padding: "0px 6px", borderRadius: 99,
                  }}>
                    {counts[tab.key] ?? 0}
                  </span>
                </button>
              );
            })}
          </div>
          {!loading && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {isFiltered && (
                <span style={{ fontSize: 12, color: C.muted }}>
                  {filtered.length} dari {projects.length} proyek
                </span>
              )}
              <button
                onClick={() => void muatProyek()}
                style={{
                  background: "transparent", border: "none", cursor: "pointer", color: C.muted,
                  display: "flex", alignItems: "center", gap: 4, fontSize: 12,
                  padding: "4px 8px", borderRadius: 6,
                }}
                onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-hover)"; e.currentTarget.style.color = C.text; }}
                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = C.muted; }}
              >
                <RefreshCw size={12} aria-hidden="true" /> Muat ulang
              </button>
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div style={{ display: "grid", gridTemplateColumns: viewMode === "grid" ? "repeat(2, 1fr)" : "1fr", gap: 12 }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} style={{ ...kartu, padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", gap: 8 }}><Skeleton h={22} w={70} /><Skeleton h={22} w={55} /></div>
              <Skeleton h={20} w="70%" />
              <Skeleton h={14} w="45%" />
              <Skeleton h={8} />
              <div style={{ display: "flex", justifyContent: "space-between" }}><Skeleton h={14} w="40%" /><Skeleton h={14} w="30%" /></div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Kosong
          ikon={<Building2 size={32} aria-hidden="true" />}
          judul={isFiltered ? "Tidak ada proyek yang cocok" : "Belum ada proyek"}
          sebab={isFiltered
            ? `Saringan yang sedang aktif${search.trim() ? ` — pencarian "${search.trim()}"` : ""}${statusFilter !== "all" ? ` — status "${STATUS_TABS.find(t => t.key === statusFilter)?.label}"` : ""} tak menyisakan satu pun dari ${projects.length} proyek. Datanya tidak hilang; longgarkan saringannya.`
            : "Belum ada satu pun proyek tercatat di perusahaan ini. Angka di kartu ringkasan di atas akan terisi begitu proyek pertama dibuat."}
          aksi={isFiltered ? (
            <button
              onClick={() => { setSearch(""); setSearchInput(""); setStatusFilter("all"); }}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px",
                borderRadius: 6, border: `1px solid ${C.border}`, background: "var(--surface)",
                color: C.text, fontSize: 13, cursor: "pointer",
              }}
            >
              Reset saringan
            </button>
          ) : bolehBuatProyek ? (
            <button
              onClick={() => setShowModal(true)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px",
                borderRadius: 6, border: "none", background: "var(--grad-aksen)", color: C.onNavy,
                fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}
            >
              <Plus size={14} aria-hidden="true" /> Tambah Proyek
            </button>
          ) : undefined}
        />
      ) : viewMode === "grid" ? (
        <div
          className="rise rise-3"
          style={{
            display: "grid",
            // `auto-fill` + batas atas, BUKAN `auto-fit` + `1fr`.
            //
            // Sesudah --w-page melebar ke 1800px di layar 2K, `1fr` membagi
            // habis sisa ruang ke kolom yang sudah ada: kartu membengkak jadi
            // ~420px, dan yang melebar hanya bidang kosong di dalamnya — nama
            // proyek dan angkanya tetap di tempat semula.
            //
            // `auto-fill` menambah KOLOM saat ruang cukup, dan batas atas 400px
            // menahan kartu di lebar yang dirancang.
            gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))",
            /*
              ⚠ `justifyContent: "space-between"` DIBUANG, dan batas atas 400px
              bersamanya. Keduanya ditulis untuk menahan kartu tetap seukuran
              rancangannya — niat yang benar dengan akibat yang tak terlihat
              sampai dipakai di layar lebar.

              Dilaporkan founder 2026-09-04: kartunya "kaya social distancing".
              Sebabnya persis dua baris itu. `space-between` MEMBAGI RATA sisa
              ruang yang tak cukup untuk satu kolom lagi menjadi jarak
              antar-kartu — di layar 2K sisa itu ratusan piksel, dan hasilnya
              kartu-kartu yang saling berjauhan dengan rongga di tengah.

              Yang menggantikan: `1fr` dengan lantai 320px. Kolom bertambah
              saat ruang cukup, dan sisa yang tak cukup dipakai MELEBARKAN
              kartu sedikit — bukan disebar jadi jarak. Kekhawatiran lama
              (kartu membengkak ~420px sementara isinya tetap di tempat) sudah
              tak berlaku: isi kartu kini `space-between` di dalam barisnya
              sendiri, jadi nilai kontrak dan tenggat ikut merentang.
            */
            gap: 12,
          }}
        >
          {filtered.map(p => (
            <ProjectCardGrid key={p.id} project={p} hariIni={hariIni} onClick={() => router.push(`/proyek/${p.id}`)} />
          ))}
        </div>
      ) : (
        <div className="rise rise-3" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map(p => (
            <ProjectCardList key={p.id} project={p} hariIni={hariIni} onClick={() => router.push(`/proyek/${p.id}`)} />
          ))}
        </div>
      )}

      {showModal && (
        <ProjectModal
          mode="create"
          onClose={() => setShowModal(false)}
          onSuccess={handleCreateSuccess}
        />
      )}
    </div>
  );
}

/**
 * Batang menyamping: serapan nyata vs garis jadwal, per proyek.
 *
 * ── Kenapa menyamping, bukan `GrafikBatang` tegak yang sudah ada
 *
 * `GrafikBatang` menggambar SATU nilai per label; yang harus terbaca di sini
 * adalah DUA nilai dan jaraknya. Batang menyamping juga memberi ruang untuk
 * nama proyek utuh — nama proyek konstruksi panjang ("Renovasi Gedung B
 * Tahap 2"), dan pada batang tegak ia terpotong jadi tak terbaca, yang
 * menghapus gunanya grafik yang tugasnya menunjuk proyek tertentu.
 *
 * ── Kenapa selisihnya disebut angka, bukan cuma digambar
 *
 * Panjang batang menyatakan besaran; angka menyatakan berapa persisnya. Yang
 * pertama untuk memindai, yang kedua untuk ditulis di notulen rapat.
 */
function GrafikSelisih({ baris }: { baris: BarisSelisih[] }) {
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 14 }}>
      {baris.map((b, i) => (
        <li key={b.id}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 5 }}>
            <Link href={`/proyek/${b.id}`} style={{
              fontSize: 12, fontWeight: 600, color: C.text, textDecoration: "none",
              flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>{b.name}</Link>
            <span style={{
              fontSize: 11, fontWeight: 700, color: C.red,
              fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
            }}>
              {b.selisih.toFixed(1)} poin
            </span>
          </div>

          {/* Dua batang bertumpuk pada landasan yang sama: yang pucat adalah
              garis jadwal, yang pekat adalah serapan nyata. Jarak yang terlihat
              di antara ujung keduanya ADALAH selisihnya — tak perlu dihitung. */}
          <div
            role="img"
            aria-label={`${b.name}: serapan ${b.nyata.toFixed(1)} persen, garis jadwal ${b.seharusnya.toFixed(1)} persen, tertinggal ${Math.abs(b.selisih).toFixed(1)} poin`}
            style={{ position: "relative", height: 14, background: "var(--surface-hover)", borderRadius: 4, overflow: "hidden" }}
          >
            <div style={{
              position: "absolute", inset: 0, width: `${b.seharusnya}%`,
              background: "var(--data-diam)",
            }} />
            <div style={{
              position: "absolute", top: 3, bottom: 3, left: 0, width: `${b.nyata}%`,
              // Hanya baris TERPARAH yang bergradasi — aturan "satu aksen per
              // layar" (`ui-dasar.tsx`). Kalau enam batang bergradasi, tak ada
              // yang menonjol dan daftar urut kehilangan gunanya.
              background: i === 0 ? "var(--grad-aksen)" : "var(--aksen)",
              borderRadius: 3, transition: "width 500ms cubic-bezier(.16,1,.3,1)",
            }} />
          </div>

          <div style={{ display: "flex", gap: 12, marginTop: 4, fontSize: 10, color: C.muted }}>
            <span>serapan {b.nyata.toFixed(1)}%</span>
            <span>jadwal {b.seharusnya.toFixed(1)}%</span>
          </div>
        </li>
      ))}

      <li style={{ fontSize: 10, color: C.muted, lineHeight: 1.5, marginTop: 2 }}>
        <Clock size={10} aria-hidden="true" style={{ verticalAlign: "-1px", marginRight: 4 }} />
        Garis jadwal dihitung lurus dari tanggal mulai ke tanggal akhir kontrak.
        Konstruksi berjalan kurva S, bukan lurus — jadi angka ini mengurutkan
        mana yang paling perlu ditanya, bukan memvonis sudah terlambat.
      </li>
    </ul>
  );
}
