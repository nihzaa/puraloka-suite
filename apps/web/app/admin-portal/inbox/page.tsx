"use client";

// ============================================================================
// Approval Inbox — Portal Admin/Direktur (Task 4).
//
// Kerangka SALINAN `pm-portal/approval/page.tsx` (komentar detail di
// sana tetap berlaku) dengan DUA beda:
//   1. Company-wide, bukan disaring `pm_id` — admin/direktur bukan role
//      `pm`, jadi `GET /api/v1/approval/inbox` mengembalikan SELURUH
//      baris company (`approval-inbox.ts:117-128` — `pmProjectIds` hanya
//      diisi untuk `user.role === 'pm'`).
//   2. `jalur_ui` dipakai APA ADANYA (bukan `JALUR_PM` lokal) — admin
//      berhak membuka halaman dashboard web yang ditunjuknya. SATU
//      pengecualian: `OVERRIDE_JALUR_UI` (lihat di bawah) — katalog
//      backend untuk `back_charge` menunjuk halaman yang tak ada
//      (review Task 4, poin Important), diperbaiki di FRONTEND saja.
//
// `AKSI` (7 jenis: kasbon/submittal/material_request/purchase_order/
// rencana_mutu/klaim_perjalanan/project_expense) disalin APA ADANYA dari
// pm-portal — endpoint backend tak beda per role pemanggil. Permission
// ketujuh jenis ini dipegang admin DAN direktur (live 2026-08-22,
// docs/superpowers/plans/2026-08-22-portal-admin-direktur-lengkap.md
// Task 2).
//
// 6 jenis lain TAMPIL sebagai kartu tanpa tombol aksi INLINE di sini
// (link `jalur_ui`, DIPERBAIKI lewat `hrefJalurUi()` untuk `back_charge`
// — lihat komentar `OVERRIDE_JALUR_UI`) — TAPI koreksi review Task 2: 5
// dari 6 (back_charge, opname_bersama, cuti_karyawan, change_order,
// estimate_version) SUDAH punya UI keputusan nyata di tempat lain
// (dashboard admin dan/atau PM Portal — lihat rincian per-jenis di plan,
// Task 4 Step 2 poin 2), jadi `jalur_ui` di sini membawa admin ke halaman
// yang BENAR-BENAR bisa memutuskan, bukan halaman baca-saja. HANYA
// `lessons_learned` genuinely nol UI keputusan di mana pun (diverifikasi:
// tak ada satu halaman pun dengan tombol approve/reject untuk jenis ini).
//
// ⚠️ Review Task 4 (poin Important): kelima link-only lain diverifikasi
// TIDAK punya masalah serupa — `opname_bersama` → `/mandor/opname` (ada),
// `cuti_karyawan` → `/sdm/cuti` (ada), `change_order` → `/proyek`
// (halaman daftar, tradeoff didokumentasikan di `inbox-approval.ts:199-217`
// — bukan link mati, hanya belum langsung ke id), `estimate_version` →
// `/estimasi` (ada), `lessons_learned` → `/mutu/pelajaran` (ada). HANYA
// `back_charge` yang genuinely salah sasaran.
// ============================================================================

import { useMemo, useState, type CSSProperties } from "react";
import { Inbox, AlertTriangle, ArrowUpCircle, X } from "lucide-react";
import { useData, invalidasi } from "@/lib/data-cache";
import { api } from "@/lib/api";
import { formatRupiah } from "@/lib/format";
import BottomSheet from "@/components/portal/BottomSheet";
import KepalaPortal from "@/components/portal/KepalaPortal";
import StatusBadge from "@/components/portal/StatusBadge";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import type {
  BarisInbox, ResponsInbox, GalatApi,
  ResponsKasbonDetailInbox, ResponsSubmittalDetailInbox,
  RespMrDetail, RespPoDetail, RespRencanaMutuSatu,
} from "../_bersama/tipe";
import { pesanGalat } from "../_bersama/tipe";

interface KonfigAksi {
  /**
   * Method HTTP BERBEDA per jenis — kasbon pakai PATCH, submittal pakai POST
   * (endpoint keputusan submittal bukan REST status-update biasa, ia mencatat
   * lewat rantai approval). Menyeragamkan ke satu method akan mengirim
   * request yang ditolak 404 oleh sisi yang salah — persis yang terjadi saat
   * verifikasi manual sebelum commit (submittal dikirim lewat PATCH, endpoint
   * hanya terdaftar sebagai POST).
   */
  metode: "patch" | "post";
  approveUrl: (id: string) => string;
  approveBody: () => Record<string, unknown>;
  rejectUrl: (id: string) => string;
  rejectBody: (alasan: string) => Record<string, unknown>;
}

// Endpoint approve/reject per jenis entitas — body DAN method BERBEDA per
// jenis, tak diseragamkan. Diverifikasi ke kode backend nyata (disalin
// APA ADANYA dari pm-portal/approval/page.tsx — endpoint tak beda per role
// pemanggil):
const AKSI: Record<string, KonfigAksi> = {
  // `PATCH /api/v1/kasbons/:id/status` — apps/api/src/routes/v1/kasbons.ts:239.
  // Body: { status: 'approved'|'rejected', cash_account_id? }. `cash_account_id`
  // sengaja TIDAK dikirim dari sini (dipaku NULL di alur ini) — mengisinya
  // memindahkan uang lewat trigger saldo kas, di luar cakupan approval biasa.
  kasbon: {
    metode: "patch",
    approveUrl: (id) => `/api/v1/kasbons/${id}/status`,
    approveBody: () => ({ status: "approved" }),
    rejectUrl: (id) => `/api/v1/kasbons/${id}/status`,
    rejectBody: () => ({ status: "rejected" }),
  },
  // `POST /api/v1/submittals/:id/keputusan` —
  // apps/api/src/routes/v1/submittal.ts:428. Body: { keputusan, catatan? }.
  // `catatan` WAJIB saat `keputusan === 'ditolak'` (endpoint menolak 400 tanpa
  // itu) — divalidasi juga di klien supaya pesannya muncul sebelum kirim.
  submittal: {
    metode: "post",
    approveUrl: (id) => `/api/v1/submittals/${id}/keputusan`,
    approveBody: () => ({ keputusan: "disetujui" }),
    rejectUrl: (id) => `/api/v1/submittals/${id}/keputusan`,
    rejectBody: (alasan) => ({ keputusan: "ditolak", catatan: alasan }),
  },
  // `PATCH /api/v1/procurement/material-requests/:id/approve` —
  // procurement.ts:709. Body: { action: 'approve'|'reject', rejection_notes? }.
  // Rantai approval `material_request`: SATU langkah, `procurement:mr:manage`
  // — admin/direktur memegangnya, jadi tombol ini benar berwenang tanpa
  // gerbang `hasPermission()` tambahan.
  material_request: {
    metode: "patch",
    approveUrl: (id) => `/api/v1/procurement/material-requests/${id}/approve`,
    approveBody: () => ({ action: "approve" }),
    rejectUrl: (id) => `/api/v1/procurement/material-requests/${id}/approve`,
    rejectBody: (alasan) => ({ action: "reject", rejection_notes: alasan }),
  },
  // `PATCH /api/v1/procurement/purchase-orders/:id/status` —
  // procurement.ts:957. Body: { status: 'sent' } untuk approve. TIDAK ADA
  // endpoint reject eksplisit untuk PO — approval PO hanya menahan/meloloskan
  // transisi ke `sent`; menolaknya berarti membiarkan tetap `draft` atau
  // membatalkan lewat status `cancelled` (aksi TERPISAH, di luar approval).
  // Tombol "Tolak" untuk jenis ini DINONAKTIFKAN secara eksplisit di render
  // bawah — mengirim `status: 'cancelled'` dari sini akan MEMBATALKAN PO
  // permanen, bukan "menolak pengajuan", dan itu aksi berbeda dari approval.
  // `rejectBody` di sini TIDAK PERNAH dipanggil (tombol nonaktif), disimpan
  // hanya supaya `KonfigAksi` tetap lengkap bentuknya.
  purchase_order: {
    metode: "patch",
    approveUrl: (id) => `/api/v1/procurement/purchase-orders/${id}/status`,
    approveBody: () => ({ status: "sent" }),
    rejectUrl: (id) => `/api/v1/procurement/purchase-orders/${id}/status`,
    rejectBody: () => ({ status: "draft" }), // no-op aman: draft→draft, TIDAK dipanggil
  },
  // `POST /api/v1/rencana-mutu/:id/setujui` — apps/api/src/routes/v1/rencana-mutu.ts:411.
  // Tak menerima body approve (amount selalu null, RMP tak bernominal).
  // TIDAK ADA endpoint tolak eksplisit untuk RMP (diverifikasi: rute hanya
  // `ajukan` dan `setujui`, tak ada `tolak`/`reject`) — sama pola PO,
  // tombol Tolak untuk jenis ini DINONAKTIFKAN di render bawah.
  // `rejectBody` TIDAK PERNAH dipanggil (tombol nonaktif), disimpan hanya
  // supaya `KonfigAksi` tetap lengkap bentuknya.
  //
  // ⚠️ Beda dari pm-portal: gate SUNGGUHAN endpoint `setujui` adalah
  // `requirePermission('ncr:manage')` (`rencana-mutu.ts:413` — DIKOREKSI
  // review Task 4 poin Minor; versi sebelumnya keliru menulis
  // `mutu:rmp:approve`, kunci yang tak dipakai gate ini sama sekali).
  // Admin/direktur MEMEGANG `ncr:manage` (beda dari PM yang tidak), jadi
  // tombol ini BUKAN kode mati di portal ini — kesimpulan fungsional tak
  // berubah, hanya nama permission-nya yang diperbaiki.
  rencana_mutu: {
    metode: "post",
    approveUrl: (id) => `/api/v1/rencana-mutu/${id}/setujui`,
    approveBody: () => ({}),
    rejectUrl: (id) => `/api/v1/rencana-mutu/${id}/setujui`,
    rejectBody: () => ({}), // no-op aman, TIDAK dipanggil — tombol Tolak selalu nonaktif
  },
  // `PATCH /api/v1/klaim-perjalanan/:id/putuskan`
  // (`apps/api/src/routes/v1/klaim-perjalanan.ts:283`). Body:
  // { setujui: boolean, total_disetujui?, alasan? }. Rantai approval
  // `klaim_perjalanan` bisa BERTINGKAT (migrasi 339,
  // `evaluateEntityApproval`) — sama seperti kasbon/submittal, endpoint bisa
  // membalas `pending_next_level: true`, dan itu SUDAH ditangani generik oleh
  // `putuskan()` di atas (tak perlu kode tambahan di sini).
  //
  // ⚠️ TIDAK ADA detail-fetch terpisah untuk jenis ini: `GET
  // /klaim-perjalanan/:id` bergerbang `klaim:view`. Kartu bottom sheet karena
  // itu HANYA menampilkan field baris inbox generik (nomor, keperluan,
  // nominal, tanggal dari `BarisInbox`), tanpa rincian item per jenis
  // pengeluaran — lihat cabang render generik di bawah, dan `detailGagal`
  // yang SENGAJA tidak menyertakan jenis ini (tombol aksi aktif langsung
  // dari `dipilih`, tak menunggu fetch detail yang memang tak pernah dicoba).
  klaim_perjalanan: {
    metode: "patch",
    approveUrl: (id) => `/api/v1/klaim-perjalanan/${id}/putuskan`,
    approveBody: () => ({ setujui: true }),
    rejectUrl: (id) => `/api/v1/klaim-perjalanan/${id}/putuskan`,
    rejectBody: (alasan) => ({ setujui: false, alasan }),
  },
  // `PATCH /api/v1/cash/expenses/:id/status`
  // (`apps/api/src/routes/v1/cash.ts:607`). Body:
  // { status: 'approved'|'rejected', notes? }. Rantai approval
  // `project_expense` (ADR-007) — gerbang KASAR (`canParticipateInChain`)
  // memeriksa apakah pemanggil punya SALAH SATU permission dari langkah
  // manapun yang berlaku di company ini. Seed dasar = `cash:expense:approve`,
  // tapi ini KONFIGURASI PER-TENANT — tombol ini BISA 403 untuk sebagian
  // tenant. Itu benar secara otorisasi (bukan bug UI): inbox menampilkan
  // barisnya karena entity type-nya terdaftar di katalog
  // (`lib/inbox-approval.ts`), tapi keputusan sesungguhnya tetap digerbang
  // server per-tenant — sama pola dengan endpoint lain di berkas ini yang
  // mengandalkan validasi server, bukan gerbang klien tambahan.
  //
  // ⚠️ TIDAK ADA detail-fetch terpisah: `project_expenses` tak punya
  // `GET /:id` berdiri sendiri. Kartu bottom sheet HANYA menampilkan field
  // baris inbox generik, sama pola `klaim_perjalanan` di atas.
  project_expense: {
    metode: "patch",
    approveUrl: (id) => `/api/v1/cash/expenses/${id}/status`,
    approveBody: () => ({ status: "approved" }),
    rejectUrl: (id) => `/api/v1/cash/expenses/${id}/status`,
    rejectBody: (alasan) => ({ status: "rejected", notes: alasan }),
  },
};

interface RespKeputusan {
  data: unknown;
  pending_next_level?: boolean;
  message?: string;
}

/**
 * Override KHUSUS untuk satu jenis — bukan mapping menyeluruh `JALUR_PM`
 * yang dihapus (lihat komentar kepala berkas). `back_charge` di katalog
 * backend (`apps/api/src/lib/inbox-approval.ts:166`) menunjuk
 * `/mandor/back-charge` — halaman itu TIDAK ADA. Next.js meng-resolve path
 * itu ke rute DINAMIS `/mandor/[id]/page.tsx`, memperlakukan string
 * "back-charge" sebagai id mandor (bukan 404, mendarat di halaman detail
 * mandor yang salah/kosong — bug class sama seperti Task 26 Portal PM:
 * link yang "ada" tapi berbohong soal tujuannya). UI keputusan back_charge
 * yang SUNGGUHAN (`PanelBackCharge`, gate `backcharge:setujui`) ada di
 * `/mandor/penagihan`. Diperbaiki di FRONTEND (bukan mengubah katalog
 * backend — itu dipakai bersama portal lain, di luar scope Task 4).
 */
const OVERRIDE_JALUR_UI: Record<string, string> = {
  back_charge: "/mandor/penagihan",
};

function hrefJalurUi(baris: BarisInbox): string {
  return OVERRIDE_JALUR_UI[baris.jenis] ?? baris.jalur_ui;
}

/**
 * Gaya tombol nonaktif — swap `background`/`color` SOLID, bukan `opacity`.
 * CLAUDE.md §"Aturan mengikat" (3): DILARANG `opacity` untuk teks; state
 * disabled wajib tukar warna solid. Dipakai untuk Setujui/Tolak saat
 * `detailGagal` — kontras token ini sudah diverifikasi AA di kedua mode di
 * tempat lain (StatusBadge varian netral).
 */
const GAYA_TOMBOL_NONAKTIF: CSSProperties = {
  flex: 1, minHeight: 48, padding: "0 14px", borderRadius: "var(--portal-radius-pill)",
  background: "var(--surface-subtle)", color: "var(--text-muted)", border: "1px solid var(--border)",
  fontSize: 14, fontWeight: 700, cursor: "default",
};

function fmtTanggal(s: string | null | undefined): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}


export default function AdminApprovalInboxPage() {
  const { data, memuat, galat } = useData<ResponsInbox>("/api/v1/approval/inbox");
  const [dipilih, setDipilih] = useState<BarisInbox | null>(null);
  const [alasan, setAlasan] = useState("");
  const [mengirim, setMengirim] = useState(false);
  const [galatAksi, setGalatAksi] = useState<string | null>(null);
  const [hasilNaikLevel, setHasilNaikLevel] = useState<string | null>(null);

  // Detail entitas — diambil hanya saat bottom sheet terbuka, per jenis.
  // `limit=200` = cap maksimum endpoint ini — bukan jaminan lengkap, karena
  // itu `detailKasbon` DIWAJIBKAN truthy sebelum tombol aksi aktif (lihat
  // render fallback di bawah).
  const urlDetailKasbon = dipilih?.jenis === "kasbon" ? "/api/v1/kasbons?status=pending&limit=200" : null;
  const { data: dataKasbon, memuat: memuatDetailKasbon, galat: galatDetailKasbon } =
    useData<ResponsKasbonDetailInbox>(urlDetailKasbon);

  const urlDetailSubmittal = dipilih?.jenis === "submittal" && dipilih.project_id
    ? `/api/v1/projects/${dipilih.project_id}/submittals`
    : null;
  const { data: dataSubmittal, memuat: memuatDetailSubmittal, galat: galatDetailSubmittal } =
    useData<ResponsSubmittalDetailInbox>(urlDetailSubmittal);

  // material_request/purchase_order — BEDA dari kasbon/submittal: keduanya
  // PUNYA `GET /:id` sendiri, jadi diambil LANGSUNG lewat id, tak perlu pola
  // cocokkan-dari-list.
  const urlDetailMr = dipilih?.jenis === "material_request"
    ? `/api/v1/procurement/material-requests/${dipilih.id}` : null;
  const { data: dataMr, memuat: memuatDetailMr, galat: galatDetailMr } =
    useData<RespMrDetail>(urlDetailMr);

  const urlDetailPo = dipilih?.jenis === "purchase_order"
    ? `/api/v1/procurement/purchase-orders/${dipilih.id}` : null;
  const { data: dataPo, memuat: memuatDetailPo, galat: galatDetailPo } =
    useData<RespPoDetail>(urlDetailPo);

  // rencana_mutu — PUNYA `GET /:id` sendiri, sama pola MR/PO: diambil
  // LANGSUNG lewat id, tak perlu cocokkan-dari-list.
  const urlDetailRmp = dipilih?.jenis === "rencana_mutu"
    ? `/api/v1/rencana-mutu/${dipilih.id}` : null;
  const { data: dataRmp, memuat: memuatDetailRmp, galat: galatDetailRmp } =
    useData<RespRencanaMutuSatu>(urlDetailRmp);

  const detailKasbon = useMemo(
    () => dataKasbon?.kasbons?.find((k) => k.id === dipilih?.id) ?? null,
    [dataKasbon, dipilih],
  );
  const detailSubmittal = useMemo(
    () => dataSubmittal?.data?.find((s) => s.id === dipilih?.id) ?? null,
    [dataSubmittal, dipilih],
  );
  const detailMr = dataMr?.material_request ?? null;
  const detailPo = dataPo?.purchase_order ?? null;
  const detailRmp = dataRmp?.rencana ?? null;

  const memuatDetail = dipilih?.jenis === "kasbon" ? memuatDetailKasbon
    : dipilih?.jenis === "submittal" ? memuatDetailSubmittal
    : dipilih?.jenis === "material_request" ? memuatDetailMr
    : dipilih?.jenis === "purchase_order" ? memuatDetailPo
    : dipilih?.jenis === "rencana_mutu" ? memuatDetailRmp
    : false;

  // ⚠️ WAJIB: detail bisa HILANG SENYAP — request gagal (galat jaringan) ATAU
  // baris tak ketemu di list (di luar `limit=200`). Kedua kasus itu harus
  // dianggap SAMA: "detail tak terverifikasi", dan tombol Setujui/Tolak WAJIB
  // nonaktif — menyetujui pencairan uang tanpa tahu siapa pemohonnya dan
  // untuk proyek apa tidak boleh mungkin dilakukan, bukan sekadar "tidak
  // disarankan". Berlaku untuk SEMUA jenis yang PUNYA detail ter-fetch
  // (kasbon/submittal/material_request/purchase_order/rencana_mutu) — jenis
  // tak didukung sudah digerbang `konfigDipilih` terpisah, tak lewat sini.
  const detailGagal = !memuatDetail && (
    (dipilih?.jenis === "kasbon" && (Boolean(galatDetailKasbon) || !detailKasbon)) ||
    (dipilih?.jenis === "submittal" && (Boolean(galatDetailSubmittal) || !detailSubmittal)) ||
    (dipilih?.jenis === "material_request" && (Boolean(galatDetailMr) || !detailMr)) ||
    (dipilih?.jenis === "purchase_order" && (Boolean(galatDetailPo) || !detailPo)) ||
    (dipilih?.jenis === "rencana_mutu" && (Boolean(galatDetailRmp) || !detailRmp))
  );

  const konfigDipilih = dipilih ? AKSI[dipilih.jenis] : undefined;
  const alasanValid = alasan.trim().length > 0;
  // Deviasi: PO dan RMP tak punya jalur "tolak" yang aman secara semantik
  // (lihat komentar `AKSI.purchase_order`/`AKSI.rencana_mutu` di atas) —
  // tombol Tolak untuk kedua jenis ini SELALU nonaktif, terlepas dari
  // `detailGagal`.
  const tolakDinonaktifkan = dipilih?.jenis === "purchase_order" || dipilih?.jenis === "rencana_mutu"
    ? true
    : mengirim || dipilih?.saya_pengajunya || detailGagal;

  function tutupSheet() {
    setDipilih(null);
    setAlasan("");
    setGalatAksi(null);
    setHasilNaikLevel(null);
  }

  async function putuskan(keputusan: "approve" | "reject") {
    if (!dipilih) return;
    const konfig = AKSI[dipilih.jenis];
    if (!konfig) {
      setGalatAksi("Jenis approval ini belum didukung tombol aksinya di portal ini.");
      return;
    }
    // Guard KERAS, bukan cuma `disabled` tombol — `purchase_order`/
    // `rencana_mutu` tak punya jalur tolak yang aman (lihat komentar
    // `AKSI.purchase_order`/`AKSI.rencana_mutu`). Kalaupun `putuskan("reject")`
    // terpanggil lewat jalur lain, ini menahannya sebelum request terkirim.
    if (keputusan === "reject" && dipilih.jenis === "purchase_order") {
      setGalatAksi("PO tidak punya aksi tolak dari inbox ini — biarkan tetap draf atau batalkan dari halaman detail PO.");
      return;
    }
    if (keputusan === "reject" && dipilih.jenis === "rencana_mutu") {
      setGalatAksi("Rencana mutu tidak punya aksi tolak dari inbox ini.");
      return;
    }
    if (keputusan === "reject" && !alasanValid) {
      setGalatAksi("Alasan penolakan wajib diisi.");
      return;
    }
    setMengirim(true);
    setGalatAksi(null);
    try {
      const panggil = konfig.metode === "post" ? api.post<RespKeputusan> : api.patch<RespKeputusan>;
      const res = keputusan === "approve"
        ? await panggil(konfig.approveUrl(dipilih.id), konfig.approveBody())
        : await panggil(konfig.rejectUrl(dipilih.id), konfig.rejectBody(alasan));

      // ⚠️ WAJIB: approval bisa BERTINGKAT. `pending_next_level: true` berarti
      // keputusan ini baru menaikkan SATU level — entitasnya MASIH menunggu
      // approver berikutnya. Tak boleh diklaim "disetujui" untuk kasus ini.
      if (res.data?.pending_next_level) {
        setHasilNaikLevel(res.data.message ?? "Naik ke level berikutnya — belum final.");
        invalidasi("/api/v1/approval/inbox");
        return;
      }

      invalidasi("/api/v1/approval/inbox");
      tutupSheet();
    } catch (e) {
      setGalatAksi(pesanGalat(e as GalatApi, "Gagal memproses keputusan"));
    } finally {
      setMengirim(false);
    }
  }

  if (galat) {
    return (
      <EmptyState
        icon={AlertTriangle}
        judul="Gagal memuat inbox"
        deskripsi={pesanGalat(galat as GalatApi, "Coba muat ulang halaman ini.")}
      />
    );
  }

  const daftar = data?.data ?? [];
  const dilewati = data?.dilewati ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
      <KepalaPortal judul="Approval" />

      {dilewati.length > 0 && (
        <div
          role="alert"
          style={{
            padding: 14, borderRadius: "var(--portal-radius-card)", background: "var(--warning-bg)",
            border: "1px solid var(--warning-border)", display: "flex", alignItems: "flex-start", gap: 10,
          }}
        >
          <AlertTriangle size={18} color="var(--on-warning-bg)" aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--on-warning-bg)" }}>
            {dilewati.length} jenis approval gagal dimuat ({dilewati.map((d) => d.jenis).join(", ")}) —
            sebagian daftar mungkin tidak lengkap.
          </span>
        </div>
      )}

      {memuat && (
        <>
          <SkeletonCard tinggi={100} />
          <SkeletonCard tinggi={100} />
          <SkeletonCard tinggi={100} />
        </>
      )}

      {!memuat && daftar.length === 0 && (
        <EmptyState
          icon={Inbox}
          judul="Tidak ada approval menunggu"
          deskripsi="Semua pengajuan di perusahaan Anda sudah diproses."
        />
      )}

      {!memuat && daftar.map((baris) => {
        const didukung = Boolean(AKSI[baris.jenis]);
        return (
          <button
            key={`${baris.jenis}-${baris.id}`}
            type="button"
            onClick={() => setDipilih(baris)}
            style={{
              textAlign: "left", padding: "var(--pad-kartu-lega)", borderRadius: "var(--portal-radius-card)",
              background: "var(--surface)", border: "1px solid var(--border)",
              display: "flex", flexDirection: "column", gap: 8, cursor: "pointer",
              minHeight: 44, width: "100%",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: "var(--t-kecil)", fontWeight: 700, color: "var(--navy)", textTransform: "uppercase", letterSpacing: "0.03em" }}>
                {baris.label}
              </span>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                {baris.saya_pengajunya && <StatusBadge status="info" label="Pengajuan Anda" />}
                {!didukung && <StatusBadge status="netral" label="Lihat detail" />}
              </div>
            </div>
            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
              {baris.judul ?? baris.nomor ?? "Tanpa judul"}
            </span>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 8 }}>
              {baris.nominal !== null ? (
                <span style={{ fontSize: 18, fontWeight: 800, color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>
                  {formatRupiah(baris.nominal)}
                </span>
              ) : (
                <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                  Diajukan {fmtTanggal(baris.dibuat_pada)}
                </span>
              )}
              {baris.level_selesai > 0 && (
                <span style={{ fontSize: "var(--t-kecil)", color: "var(--text-muted)" }}>
                  Level {baris.level_selesai} selesai
                </span>
              )}
            </div>
          </button>
        );
      })}

      <BottomSheet
        terbuka={!!dipilih}
        onTutup={tutupSheet}
        judul={dipilih?.judul ?? dipilih?.nomor ?? "Detail Approval"}
      >
        {dipilih && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {memuatDetail && <SkeletonCard tinggi={70} />}

            {!memuatDetail && dipilih.jenis === "kasbon" && detailKasbon && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: 14, borderRadius: 14, background: "var(--surface-subtle)" }}>
                <Baris label="Pemohon" nilai={detailKasbon.requester?.name ?? "—"} />
                <Baris label="Proyek" nilai={detailKasbon.project?.name ?? "—"} />
                <Baris label="Sumber dana" nilai={detailKasbon.fund_source ?? "—"} />
                <Baris label="Tanggal" nilai={fmtTanggal(detailKasbon.kasbon_date)} />
                {detailKasbon.notes && <Baris label="Catatan" nilai={detailKasbon.notes} />}
              </div>
            )}

            {!memuatDetail && dipilih.jenis === "submittal" && detailSubmittal && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: 14, borderRadius: 14, background: "var(--surface-subtle)" }}>
                <Baris label="Pengaju" nilai={detailSubmittal.pengaju?.name ?? "—"} />
                <Baris label="Jenis" nilai={detailSubmittal.jenis} />
                <Baris label="Nomor" nilai={detailSubmittal.nomor} />
                {detailSubmittal.spesifikasi && <Baris label="Spesifikasi" nilai={detailSubmittal.spesifikasi} />}
                {detailSubmittal.menghentikan_pekerjaan && (
                  <StatusBadge status="rejected" label="Menghentikan pekerjaan" />
                )}
              </div>
            )}

            {!memuatDetail && dipilih.jenis === "material_request" && detailMr && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: 14, borderRadius: 14, background: "var(--surface-subtle)" }}>
                <Baris label="Pemohon" nilai={detailMr.requested_by?.name ?? "—"} />
                <Baris label="Proyek" nilai={detailMr.project?.name ?? "—"} />
                <Baris label="Jumlah item" nilai={String(detailMr.items.length)} />
                {detailMr.needed_date && <Baris label="Dibutuhkan" nilai={fmtTanggal(detailMr.needed_date)} />}
                {detailMr.notes && <Baris label="Catatan" nilai={detailMr.notes} />}
              </div>
            )}

            {!memuatDetail && dipilih.jenis === "purchase_order" && detailPo && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: 14, borderRadius: 14, background: "var(--surface-subtle)" }}>
                <Baris label="Supplier" nilai={detailPo.supplier?.name ?? "—"} />
                <Baris label="Proyek" nilai={detailPo.project?.name ?? "—"} />
                <Baris label="Jumlah item" nilai={String(detailPo.items.length)} />
                <Baris label="Total nilai" nilai={formatRupiah(detailPo.total_amount)} />
                {detailPo.expected_delivery_date && <Baris label="Estimasi kirim" nilai={fmtTanggal(detailPo.expected_delivery_date)} />}
              </div>
            )}

            {!memuatDetail && dipilih.jenis === "rencana_mutu" && detailRmp && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: 14, borderRadius: 14, background: "var(--surface-subtle)" }}>
                <Baris label="Nomor" nilai={detailRmp.nomor} />
                <Baris label="Judul" nilai={`${detailRmp.judul} · Rev.${detailRmp.revisi}`} />
                <Baris label="Penanggung jawab" nilai={detailRmp.pj?.name ?? "—"} />
                {detailRmp.standar_acuan && <Baris label="Standar acuan" nilai={detailRmp.standar_acuan} />}
              </div>
            )}

            {/* `klaim_perjalanan`/`project_expense` TAK PUNYA detail-fetch
                (lihat komentar `AKSI.klaim_perjalanan`/`AKSI.project_expense`
                di atas): render APA ADANYA dari baris inbox generik
                (`dipilih`/`BarisInbox`), bukan dari objek detail per-jenis
                seperti kasbon/submittal/MR/PO/RMP di atas. */}
            {(dipilih.jenis === "klaim_perjalanan" || dipilih.jenis === "project_expense") && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: 14, borderRadius: 14, background: "var(--surface-subtle)" }}>
                <Baris label="Nomor" nilai={dipilih.nomor ?? "—"} />
                <Baris label="Keperluan" nilai={dipilih.judul ?? "—"} />
                <Baris
                  label="Nominal"
                  nilai={formatRupiah(dipilih.nominal)}
                />
                <Baris label="Diajukan" nilai={fmtTanggal(dipilih.dibuat_pada)} />
                <div style={{ fontSize: "var(--t-kecil)", color: "var(--text-secondary)", marginTop: 4 }}>
                  Rincian lengkap (nama pemohon, item/kategori) tidak tersedia dari layar ini —
                  keputusan didasarkan pada ringkasan di atas.
                </div>
              </div>
            )}

            {/* Fallback EKSPLISIT — detail gagal dimuat ATAU tak ketemu di
                list. Tombol Setujui/Tolak di bawah digerbang `detailGagal`
                ini; blok ini yang membuat kegagalan itu TERLIHAT, bukan
                senyap. */}
            {detailGagal && (
              dipilih.jenis === "kasbon" || dipilih.jenis === "submittal"
              || dipilih.jenis === "material_request" || dipilih.jenis === "purchase_order"
              || dipilih.jenis === "rencana_mutu"
            ) && (
              <div
                role="alert"
                style={{
                  display: "flex", alignItems: "flex-start", gap: 8, padding: 14, borderRadius: 14,
                  background: "var(--danger-bg)", border: "1px solid var(--danger-border)",
                }}
              >
                <AlertTriangle size={18} color="var(--on-danger-bg)" aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--on-danger-bg)" }}>
                  Detail pengajuan ini gagal dimuat — nama pemohon dan proyek tidak dapat
                  diverifikasi. Setujui/Tolak dinonaktifkan sampai detailnya berhasil dimuat.
                  Coba tutup dan buka lagi kartu ini.
                </span>
              </div>
            )}

            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              {dipilih.level_selesai > 0
                ? `Sudah disetujui sampai level ${dipilih.level_selesai} — keputusan Anda menentukan level berikutnya.`
                : "Belum ada approver yang memutuskan — keputusan Anda adalah level pertama."}
            </div>

            {!konfigDipilih && (
              <div style={{ padding: 12, borderRadius: 12, background: "var(--info-bg)", fontSize: 13, color: "var(--on-info-bg)" }}>
                Jenis approval ini belum didukung tombol setujui/tolak di portal ini.
                {" "}
                <a
                  href={hrefJalurUi(dipilih)}
                  style={{ color: "var(--on-info-bg)", fontWeight: 700, textDecoration: "underline" }}
                >
                  Buka halaman terkait
                </a>
                {" "}untuk memprosesnya.
              </div>
            )}

            {hasilNaikLevel && (
              <div
                role="status"
                style={{
                  display: "flex", alignItems: "flex-start", gap: 8, padding: 12, borderRadius: 12,
                  background: "var(--info-bg)", fontSize: 13, color: "var(--on-info-bg)", fontWeight: 600,
                }}
              >
                <ArrowUpCircle size={18} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
                {hasilNaikLevel}
              </div>
            )}

            {konfigDipilih && !hasilNaikLevel && (
              <>
                <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                  Alasan (wajib bila menolak)
                  <textarea
                    value={alasan}
                    onChange={(e) => setAlasan(e.target.value)}
                    rows={3}
                    style={{
                      width: "100%", marginTop: 6, padding: 12, borderRadius: 12,
                      border: "1px solid var(--border)", fontSize: 14, fontFamily: "inherit",
                    }}
                  />
                </label>

                {galatAksi && (
                  <div role="alert" style={{ fontSize: 12, color: "var(--danger)" }}>{galatAksi}</div>
                )}

                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => putuskan("reject")}
                    disabled={tolakDinonaktifkan}
                    style={(detailGagal || dipilih.jenis === "purchase_order" || dipilih.jenis === "rencana_mutu") ? GAYA_TOMBOL_NONAKTIF : {
                      flex: 1, minHeight: 48, padding: "0 14px", borderRadius: "var(--portal-radius-pill)",
                      background: "var(--danger-bg)", color: "var(--danger)", border: "1px solid var(--danger-border)",
                      fontSize: 14, fontWeight: 700,
                      cursor: mengirim || dipilih.saya_pengajunya ? "default" : "pointer",
                    }}
                  >
                    Tolak
                  </button>
                  <button
                    type="button"
                    onClick={() => putuskan("approve")}
                    disabled={mengirim || dipilih.saya_pengajunya || detailGagal}
                    style={detailGagal ? GAYA_TOMBOL_NONAKTIF : {
                      flex: 1, minHeight: 48, padding: "0 14px", borderRadius: "var(--portal-radius-pill)",
                      background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none",
                      fontSize: 14, fontWeight: 700,
                      cursor: mengirim || dipilih.saya_pengajunya ? "default" : "pointer",
                    }}
                  >
                    {mengirim ? "Memproses…" : "Setujui"}
                  </button>
                </div>

                {dipilih.jenis === "purchase_order" && (
                  <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                    PO tidak punya aksi tolak dari sini — biarkan tetap draf, atau batalkan lewat
                    halaman detail PO bila memang tidak jadi dipesan.
                  </div>
                )}

                {dipilih.jenis === "rencana_mutu" && (
                  <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                    Rencana mutu tidak punya aksi tolak dari sini.
                  </div>
                )}

                {dipilih.jenis === "project_expense" && (
                  <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                    Wewenang menyetujui pengeluaran proyek diatur per-perusahaan — bila tombol
                    di atas ditolak server, periksa konfigurasi rantai persetujuannya.
                  </div>
                )}

                {dipilih.saya_pengajunya && (
                  <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                    Anda pengaju pengajuan ini — tidak dapat menyetujui pengajuan sendiri.
                  </div>
                )}
              </>
            )}

            {hasilNaikLevel && (
              <button
                type="button"
                onClick={tutupSheet}
                style={{
                  minHeight: 48, padding: "0 14px", borderRadius: "var(--portal-radius-pill)",
                  background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none",
                  fontSize: 14, fontWeight: 700, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                }}
              >
                <X size={16} aria-hidden="true" /> Tutup
              </button>
            )}
          </div>
        )}
      </BottomSheet>
    </div>
  );
}

function Baris({ label, nilai }: { label: string; nilai: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
      <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", textAlign: "right" }}>{nilai}</span>
    </div>
  );
}
