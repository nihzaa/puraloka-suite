"use client";

// ============================================================================
// Approval Inbox — Portal PM (Task 9).
//
// Modul paling berdampak dari seluruh rombak portal: sebelum ini PM harus
// login ke dashboard admin untuk menyetujui apa pun, karena portalnya tak
// punya UI approval sama sekali.
//
// ── Jenis yang BENAR-BENAR muncul (diverifikasi lewat panggilan sungguhan)
//
// Dipanggil sebagai akun PM uji (`uji.pm.portal@puraloka.test`) ke
// `GET /api/v1/approval/inbox` yang hidup di :3077, 2026-08-20:
//
//     total 6, ringkas {"kasbon":4,"klaim_perjalanan":0,"material_request":0,
//                        "purchase_order":0,"submittal":2}
//
// Hanya `kasbon` dan `submittal` membawa baris untuk company uji SAAT ITU —
// `material_request`/`purchase_order` bernilai 0 di sana bukan karena PM tak
// berwenang, melainkan company uji itu memang belum punya MR/PO pending saat
// diukur. `punch_item` yang disebut brief sebagai contoh TIDAK ADA di katalog
// `SUMBER_INBOX` (`apps/api/src/lib/inbox-approval.ts`) sama sekali — punch
// item tidak pernah masuk inbox approval ini, jadi entri itu TIDAK ditambahkan
// ke `AKSI` (menaruh endpoint yang tak pernah dipanggil adalah kode mati,
// bukan kelengkapan).
//
// ── `material_request` & `purchase_order` (Task 24 Step 5)
//
// Ditambahkan ke `AKSI` sesudah diverifikasi LIVE ke `approval_chains` +
// `approval_steps` 2026-08-21: KEDUANYA rantai satu langkah,
// `required_permission` = `procurement:mr:manage` / `procurement:po:manage`
// — permission dasar CRUD yang sama, dan PM MEMEGANG keduanya (role `pm`,
// `role_permissions` join `permissions`). Jadi PM benar-benar berwenang
// menyetujui, tanpa gerbang `hasPermission()` tambahan di klien — beda dari
// pola `cecep:estimate:approve` (Task 19) yang PM TIDAK punya dan karena itu
// digerbang eksplisit di `rab/[id]/page.tsx`.
//
// `AKSI` sekarang berisi `kasbon`, `submittal`, `material_request`,
// `purchase_order` — semuanya diverifikasi ke kode nyata (lihat komentar
// per-entri). Jenis lain yang mungkin punya baris pending di company LAIN
// (change_order, dst) akan tetap TAMPIL sebagai kartu (tak disembunyikan —
// menyembunyikan pekerjaan yang menunggu lebih buruk daripada menampilkannya
// tanpa tombol aksi), tapi diarahkan ke halaman detail lewat `JALUR_PM`,
// BUKAN diberi tombol setujui/tolak yang endpoint-nya belum diverifikasi di
// sini. PM juga tidak berwenang menyetujui change_order/opname_bersama/
// back_charge (lihat Global Constraints task) — jenis-jenis itu memang
// sengaja tak pernah diberi tombol aksi di portal PM.
//
// ── Kartu inbox tak membawa detail (spec §2.4 poin 2)
//
// `BarisInbox` (respons endpoint inbox) hanya listing generik — tak ada nama
// pemohon atau isi lengkap entitas. Detailnya diambil SAAT bottom sheet
// dibuka:
//
//   · kasbon    — tak ada `GET /api/v1/kasbons/:id` (diverifikasi: 404;
//     `kasbons.ts` hanya mendaftarkan `GET /api/v1/kasbons`, `POST`, dan
//     `PATCH /:id/status`). Detailnya diambil dari LIST
//     `GET /api/v1/kasbons?status=pending&limit=200` (mengembalikan
//     `requester.name`, `project.name` dsb.), dicocokkan `id` di klien.
//
//     ⚠️ MITIGASI, BUKAN PERBAIKAN TUNTAS (fix round 1, review Important-1):
//     list ini diurut `kasbon_date` DESC (`kasbons.ts:39` `.order('kasbon_date',
//     {ascending:false})`) sedangkan inbox diurut TERLAMA DI ATAS
//     (`approval-inbox.ts:274`) — arahnya BERLAWANAN. `limit=200` adalah cap
//     maksimum endpoint ini (`kasbons.ts:19`
//     `Math.min(Math.max(1, ...), 200)`), jadi kalau company PM ini kelak
//     punya LEBIH dari 200 kasbon berstatus pending sekaligus, kasbon
//     tertua — yang tampil paling atas di inbox, paling mungkin diklik
//     duluan — masih bisa jatuh di luar halaman. `limit=200` menaikkan
//     ambang dari 100→200, tapi TIDAK menghilangkan celahnya sepenuhnya
//     tanpa endpoint detail per-id di backend (di luar cakupan task ini).
//     Karena itu render fallback eksplisit di bawah untuk `!detailKasbon`
//     WAJIB ada — itulah yang benar-benar menutup risiko "approve tanpa
//     tahu siapa/proyek apa", bukan menaikkan limit saja.
//   · submittal — tak ada `GET /api/v1/submittals/:id` (diverifikasi: 404).
//     Diambil dari `GET /api/v1/projects/:projectId/submittals`
//     (project_id sudah ada di baris inbox) — daftar ini SELALU per-proyek
//     (tak ada limit lintas-proyek yang bisa membuat satu submittal
//     terlempar keluar halaman), dicocokkan `id` di klien.
//   · material_request / purchase_order — BEDA dari kasbon/submittal:
//     KEDUANYA punya `GET /:id` sendiri (`procurement.ts:287`, `:883`),
//     jadi detail diambil LANGSUNG lewat id dari baris inbox — tak perlu
//     pola cocokkan-dari-list. Lebih sederhana dari yang sudah ada, bukan
//     tambahan kerumitan (Task 24 Step 6).
//
// ── `jalur_ui` dari API menunjuk dashboard admin, bukan portal PM
//
// `jalur_ui` kasbon = `/mandor/kasbon`, submittal = `/lapangan/submittal` —
// keduanya halaman dashboard admin. `JALUR_PM` di bawah adalah mapping LOKAL
// jenis → path pm-portal, dibuat khusus untuk halaman ini (tidak diekspor),
// dan TIDAK mengubah katalog `jalurUi` di backend (itu akan memutus dashboard
// admin dan melanggar penjaga `audit-inbox-jalur-nyata.mjs`).
//
// ── Approval berjenjang (spec §2.4 poin 1)
//
// Endpoint approve kasbon & submittal bisa membalas
// `{data: null, pending_next_level: true, message}` — artinya keputusan ini
// baru menaikkan satu level, entitasnya MASIH menunggu approver berikutnya.
// Kode di bawah memeriksa field itu secara eksplisit dan menampilkan pesan
// "Naik ke level berikutnya — belum final", BUKAN klaim "disetujui" generik.
// ============================================================================

import { useMemo, useState, type CSSProperties } from "react";
import { Inbox, AlertTriangle, ArrowUpCircle, X } from "lucide-react";
import { useData, invalidasi } from "@/lib/data-cache";
import { api } from "@/lib/api";
import BottomSheet from "@/components/portal/BottomSheet";
import StatusBadge from "@/components/portal/StatusBadge";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import type {
  BarisInbox, ResponsInbox, GalatApi,
  ResponsKasbonDetailInbox, ResponsSubmittalDetailInbox,
  RespMrDetail, RespPoDetail,
} from "../_bersama/tipe";
import { pesanGalat } from "../_bersama/tipe";

/**
 * Mapping LOKAL jenis → path portal PM. Dipakai HANYA di halaman ini —
 * `jalur_ui` dari API tetap dipakai apa adanya di dashboard admin, tak
 * disentuh di sini.
 */
const JALUR_PM: Record<string, string> = {
  kasbon: "/pm-portal/keuangan",
  submittal: "/pm-portal/lainnya", // belum ada halaman submittal PM tersendiri
  material_request: "/pm-portal/procurement",
  purchase_order: "/pm-portal/procurement",
};

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
// jenis, tak diseragamkan. Diverifikasi ke kode backend nyata:
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
  // (diverifikasi live 2026-08-21) — PM memegangnya, jadi tombol ini benar
  // berwenang tanpa gerbang `hasPermission()` tambahan.
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
};

interface RespKeputusan {
  data: unknown;
  pending_next_level?: boolean;
  message?: string;
}

/**
 * Gaya tombol nonaktif — swap `background`/`color` SOLID, bukan `opacity`.
 * CLAUDE.md §"Aturan mengikat" (3): DILARANG `opacity` untuk teks; state
 * disabled wajib tukar warna solid. Dipakai untuk Setujui/Tolak saat
 * `detailGagal` (fix round 1, review Important-1) — kontras token ini sudah
 * diverifikasi AA di kedua mode di tempat lain (StatusBadge varian netral).
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

/** Dipakai HANYA untuk baris detail PO di bottom sheet ini (bukan kartu utama). */
function fmtRupiahRingkas(v: number | string | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const n = typeof v === "string" ? Number(v) : v;
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}

export default function PmApprovalPage() {
  const { data, memuat, galat } = useData<ResponsInbox>("/api/v1/approval/inbox");
  const [dipilih, setDipilih] = useState<BarisInbox | null>(null);
  const [alasan, setAlasan] = useState("");
  const [mengirim, setMengirim] = useState(false);
  const [galatAksi, setGalatAksi] = useState<string | null>(null);
  const [hasilNaikLevel, setHasilNaikLevel] = useState<string | null>(null);

  // Detail entitas — diambil hanya saat bottom sheet terbuka, per jenis.
  // `limit=200` = cap maksimum endpoint ini (lihat catatan mitigasi di atas
  // berkas) — bukan jaminan lengkap, karena itu `detailKasbon` DIWAJIBKAN
  // truthy sebelum tombol aksi aktif (lihat render fallback di bawah).
  const urlDetailKasbon = dipilih?.jenis === "kasbon" ? "/api/v1/kasbons?status=pending&limit=200" : null;
  const { data: dataKasbon, memuat: memuatDetailKasbon, galat: galatDetailKasbon } =
    useData<ResponsKasbonDetailInbox>(urlDetailKasbon);

  const urlDetailSubmittal = dipilih?.jenis === "submittal" && dipilih.project_id
    ? `/api/v1/projects/${dipilih.project_id}/submittals`
    : null;
  const { data: dataSubmittal, memuat: memuatDetailSubmittal, galat: galatDetailSubmittal } =
    useData<ResponsSubmittalDetailInbox>(urlDetailSubmittal);

  // material_request/purchase_order (Task 24 Step 6) — BEDA dari
  // kasbon/submittal: keduanya PUNYA `GET /:id` sendiri, jadi diambil
  // LANGSUNG lewat id, tak perlu pola cocokkan-dari-list.
  const urlDetailMr = dipilih?.jenis === "material_request"
    ? `/api/v1/procurement/material-requests/${dipilih.id}` : null;
  const { data: dataMr, memuat: memuatDetailMr, galat: galatDetailMr } =
    useData<RespMrDetail>(urlDetailMr);

  const urlDetailPo = dipilih?.jenis === "purchase_order"
    ? `/api/v1/procurement/purchase-orders/${dipilih.id}` : null;
  const { data: dataPo, memuat: memuatDetailPo, galat: galatDetailPo } =
    useData<RespPoDetail>(urlDetailPo);

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

  const memuatDetail = dipilih?.jenis === "kasbon" ? memuatDetailKasbon
    : dipilih?.jenis === "submittal" ? memuatDetailSubmittal
    : dipilih?.jenis === "material_request" ? memuatDetailMr
    : dipilih?.jenis === "purchase_order" ? memuatDetailPo
    : false;

  // ⚠️ WAJIB (fix round 1, review Important-1): detail bisa HILANG SENYAP —
  // request gagal (galat jaringan) ATAU baris tak ketemu di list (di luar
  // `limit=200`, lihat catatan di atas berkas). Kedua kasus itu harus
  // dianggap SAMA: "detail tak terverifikasi", dan tombol Setujui/Tolak
  // WAJIB nonaktif — menyetujui pencairan uang tanpa tahu siapa pemohonnya
  // dan untuk proyek apa tidak boleh mungkin dilakukan, bukan sekadar
  // "tidak disarankan". Berlaku untuk SEMUA jenis yang PUNYA detail
  // ter-fetch (kasbon/submittal/material_request/purchase_order) — jenis tak
  // didukung sudah digerbang `konfigDipilih` terpisah, tak lewat sini.
  const detailGagal = !memuatDetail && (
    (dipilih?.jenis === "kasbon" && (Boolean(galatDetailKasbon) || !detailKasbon)) ||
    (dipilih?.jenis === "submittal" && (Boolean(galatDetailSubmittal) || !detailSubmittal)) ||
    (dipilih?.jenis === "material_request" && (Boolean(galatDetailMr) || !detailMr)) ||
    (dipilih?.jenis === "purchase_order" && (Boolean(galatDetailPo) || !detailPo))
  );

  const konfigDipilih = dipilih ? AKSI[dipilih.jenis] : undefined;
  const alasanValid = alasan.trim().length > 0;
  // Deviasi Step 5: PO tak punya jalur "tolak" yang aman secara semantik
  // (lihat komentar `AKSI.purchase_order` di atas) — tombol Tolak untuk
  // jenis ini SELALU nonaktif, terlepas dari `detailGagal`.
  const tolakDinonaktifkan = dipilih?.jenis === "purchase_order"
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
      setGalatAksi("Jenis approval ini belum didukung tombol aksinya di portal PM.");
      return;
    }
    // Guard KERAS, bukan cuma `disabled` tombol — `purchase_order` tak punya
    // jalur tolak yang aman (lihat komentar `AKSI.purchase_order`). Kalaupun
    // `putuskan("reject")` terpanggil lewat jalur lain, ini menahannya
    // sebelum request terkirim.
    if (keputusan === "reject" && dipilih.jenis === "purchase_order") {
      setGalatAksi("PO tidak punya aksi tolak dari inbox ini — biarkan tetap draf atau batalkan dari halaman detail PO.");
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
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
        Approval
      </h1>

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
          deskripsi="Semua pengajuan di proyek Anda sudah diproses."
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
              textAlign: "left", padding: 16, borderRadius: "var(--portal-radius-card)",
              background: "var(--surface)", border: "1px solid var(--border)",
              display: "flex", flexDirection: "column", gap: 8, cursor: "pointer",
              minHeight: 44, width: "100%",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--navy)", textTransform: "uppercase", letterSpacing: "0.03em" }}>
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
                  Rp {baris.nominal.toLocaleString("id-ID")}
                </span>
              ) : (
                <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                  Diajukan {fmtTanggal(baris.dibuat_pada)}
                </span>
              )}
              {baris.level_selesai > 0 && (
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
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
                <Baris label="Total nilai" nilai={fmtRupiahRingkas(detailPo.total_amount)} />
                {detailPo.expected_delivery_date && <Baris label="Estimasi kirim" nilai={fmtTanggal(detailPo.expected_delivery_date)} />}
              </div>
            )}

            {/* Fallback EKSPLISIT — detail gagal dimuat ATAU tak ketemu di
                list. Tombol Setujui/Tolak di bawah digerbang `detailGagal`
                ini; blok ini yang membuat kegagalan itu TERLIHAT, bukan
                senyap (fix round 1, review Important-1). */}
            {detailGagal && (
              dipilih.jenis === "kasbon" || dipilih.jenis === "submittal"
              || dipilih.jenis === "material_request" || dipilih.jenis === "purchase_order"
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
                Jenis approval ini belum didukung tombol setujui/tolak di portal PM.
                {JALUR_PM[dipilih.jenis] && " Buka halaman terkait untuk memprosesnya."}
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
                    style={(detailGagal || dipilih.jenis === "purchase_order") ? GAYA_TOMBOL_NONAKTIF : {
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
                      background: "var(--navy)", color: "var(--on-navy)", border: "none",
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
                  background: "var(--navy)", color: "var(--on-navy)", border: "none",
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
