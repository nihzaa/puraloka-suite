"use client";

/**
 * KLIEN — RINGKASAN. Dashboard modul, bukan langsung tabel (UI-2-3).
 *
 * ── Dua lapis, BUKAN tiga — dan itu keputusan, bukan pekerjaan yang terputus
 *
 *   LAPIS 1  tiga kartu KPI        "apa yang terjadi?"
 *   LAPIS 3  daftar klien + saringan
 *
 * Lapis 2 (grafik) SENGAJA tidak ada. `/api/v1/clients` mengirim persis satu
 * baris `clients` per klien: nama, kontak, tipe, aktif/nonaktif, tanggal
 * dibuat. Tak ada nilai, tak ada jumlah proyek, tak ada piutang. Dari data
 * yang seluruhnya kategoris seperti itu, satu-satunya grafik yang bisa
 * digambar adalah donat "perorangan vs perusahaan" — yang menggambar ulang
 * angka yang sudah tertulis utuh di kartu KPI dan di tombol saringan tepat di
 * bawahnya. Grafik yang menggambar ulang daftar adalah tinta tanpa informasi,
 * jadi tak ada grafik di sini.
 *
 * ── KPI yang DIPERTIMBANGKAN lalu dibuang, dengan alasannya
 *
 * "Klien dengan piutang jatuh tempo" adalah KPI yang paling berguna untuk
 * menu ini — dan ia TIDAK dibangun. Bukan karena datanya tak ada di mana pun:
 * `/api/v1/finance/ar-aging` memang memulangkan `client.id` per invoice.
 * Masalahnya izin. Rute itu menuntut `finance:view:all`, sementara `/klien`
 * dijaga `clients:manage` (dan middleware membukanya untuk admin). Artinya
 * ada pengguna nyata yang boleh membuka halaman ini tapi ditolak endpoint
 * itu — dan bentuk penolakannya 403 yang, kalau ditelan, menampilkan
 * "0 klien menunggak" dengan percaya diri.
 *
 * Angka nol yang berarti "saya tak boleh tahu" tak bisa dibedakan dari nol
 * yang berarti "semua sudah bayar", dan hanya salah satunya kabar baik.
 * Piutang per klien sudah punya rumahnya di /keuangan/piutang, yang izinnya
 * memang finance. Yang tersisa di sini: tautan ke sana, dan panel detail
 * per-klien yang sudah memuat ringkasan invoice lewat `/clients/:id`
 * (dengan izin yang sama seperti halaman ini).
 *
 * "Klien tanpa proyek" juga dibuang — `/api/v1/clients` tak mengirim jumlah
 * proyek, dan menghitungnya berarti satu permintaan `/clients/:id` per baris.
 *
 * ── Kenapa "kontak tak lengkap" layak jadi KPI
 *
 * Ia satu-satunya angka yang MENUNTUT TINDAKAN yang bisa dihitung jujur dari
 * respons ini, dan tindakannya jelas: lengkapi datanya. Klien tanpa email tak
 * bisa dikirimi invoice tanpa mengetik ulang alamatnya dari tempat lain, dan
 * yang tanpa NPWP/NIK menahan penerbitan faktur pajak — dua hal yang selalu
 * ketahuan pada saat yang paling buruk, yaitu saat invoicenya harus keluar.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useIzin } from "@/lib/use-izin";
import { useRouter } from "next/navigation";
import {
  Users, Plus, Search, Building2, User, ChevronRight, FolderKanban,
  ToggleLeft, ToggleRight, FileText, MessageCircle, ExternalLink,
  AlertTriangle, Edit2,
} from "lucide-react";

import { C } from "@/lib/warna-ui";
import { KartuKPI, Kosong } from "@/components/ui-dasar";
import { KartuRail, BarisRail } from "@/components/shell/rail-kartu";
import { RailIsi } from "@/components/shell/rail-isi";
import { usePasangRail } from "@/lib/rail-context";
import { Tabel, type Kolom, KepalaHalaman } from "@/components/dasar";
import { medanKurang, ringkasKlien } from "@/lib/ringkasan-klien";
// Dipecah ke `_bersama/` 2026-08-07 (UI-2-3) mengikuti pola `kas/_bersama/`:
// halaman ini melewati 800 baris setelah lapis ringkasan ditambahkan.
import { ClientModal, DetailPanel, waLink, type Client } from "./_bersama/komponen";

export default function KlienPage() {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<"all" | "perorangan" | "perusahaan">("all");
  const [showModal, setShowModal] = useState(false);
  const [editClient, setEditClient] = useState<Client | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  /**
   * Saringan "hanya yang datanya belum lengkap" — dinyalakan dari kartu KPI.
   *
   * Kartu yang menyebut angka tapi tak bisa menunjukkan BARIS-nya memaksa
   * orang membuka klien satu per satu untuk mencari yang mana. Angka yang
   * tak bisa ditelusuri ke daftarnya adalah angka yang tak bisa dikerjakan.
   */
  const [hanyaTakLengkap, setHanyaTakLengkap] = useState(false);


  async function load() {
    setLoading(true);
    try {
      const r = await api.get<{ clients: Client[] }>("/api/v1/clients?all=true");
      setClients(r.data.clients);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function toggleActive(client: Client) {
    setTogglingId(client.id);
    try {
      await api.patch(`/api/v1/clients/${client.id}/toggle-active`, {});
      setClients(prev => prev.map(c => c.id === client.id ? { ...c, is_active: !c.is_active } : c));
    } finally { setTogglingId(null); }
  }

  function onSaved(c: Client) {
    setClients(prev => {
      const idx = prev.findIndex(x => x.id === c.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = c; return next; }
      return [c, ...prev];
    });
  }

  // Ringkasan dihitung dari SELURUH klien, bukan dari `filtered`. Angka KPI
  // yang ikut berubah saat orang mengetik di kotak cari terbaca seolah
  // keadaan perusahaan berubah, padahal cuma tampilannya.
  const ringkas = useMemo(() => ringkasKlien(clients), [clients]);

  const filtered = clients.filter(c => {
    const q = search.toLowerCase();
    const matchSearch = !q || c.contact_person.toLowerCase().includes(q) || (c.company_name ?? "").toLowerCase().includes(q) || (c.email ?? "").toLowerCase().includes(q) || c.phone.includes(q);
    const matchType = filterType === "all" || c.client_type === filterType;
    const matchLengkap = !hanyaTakLengkap || (c.is_active && medanKurang(c).length > 0);
    return matchSearch && matchType && matchLengkap;
  });

  // ADR-004: capability, bukan nama jabatan — diverifikasi ke `requirePermission`.
  const isAdmin = useIzin("clients:manage");

  // Definisi kolom hidup di dalam komponen karena setiap render sel memanggil
  // state halaman (`setDetailId`, `togglingId`, `isAdmin`). Mengangkatnya ke
  // luar berarti mengoper lima argumen ke tiap kolom — lebih panjang, dan
  // salah satunya pasti lupa diperbarui saat tombol baru ditambah.
  const kolomKlien: Array<Kolom<Client>> = [
    {
      kunci: "klien", judul: "Klien", kepalaBaris: true,
      render: c => (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: C.navyLight, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {c.client_type === "perusahaan" ? <Building2 size={15} color={C.navy} /> : <User size={15} color={C.navy} />}
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{c.contact_person}</div>
            {c.company_name && <div style={{ fontSize: 11, color: C.mid }}>{c.company_name}</div>}
            {c.notes && (
              <div style={{ fontSize: 11, color: C.muted, marginTop: 2, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={c.notes}>
                {c.notes}
              </div>
            )}
          </div>
        </div>
      ),
    },
    {
      kunci: "kontak", judul: "Kontak",
      render: c => (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 13, color: C.text }}>{c.phone}</span>
            <a
              href={waLink(c.phone)}
              target="_blank" rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              title="Hubungi via WhatsApp"
              aria-label={`Hubungi ${c.contact_person} via WhatsApp`}
              style={{ color: "var(--success)", lineHeight: 0 }}
            >
              <MessageCircle size={13} />
            </a>
          </div>
          {c.email && (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 11, color: C.mid }}>{c.email}</span>
              <a
                href={`mailto:${c.email}`}
                onClick={e => e.stopPropagation()}
                title="Kirim email"
                aria-label={`Kirim email ke ${c.contact_person}`}
                style={{ color: "var(--info)", lineHeight: 0 }}
              >
                <ExternalLink size={11} />
              </a>
            </div>
          )}
        </>
      ),
    },
    {
      kunci: "tipe", judul: "Tipe",
      render: c => (
        <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 99, background: c.client_type === "perusahaan" ? "var(--info-bg)" : "var(--success-bg)", color: c.client_type === "perusahaan" ? "var(--info)" : C.green, fontWeight: 500 }}>
          {c.client_type === "perusahaan" ? "Perusahaan" : "Perorangan"}
        </span>
      ),
    },
    {
      // Kolom ini yang membuat angka "data belum lengkap" bisa dikerjakan:
      // ia menyebut medan APA yang kurang, bukan cuma menandai barisnya.
      // Tanda tanpa isi memaksa orang membuka modal edit untuk menebak.
      kunci: "kelengkapan", judul: "Kelengkapan",
      render: c => {
        const kurang = c.is_active ? medanKurang(c) : [];
        if (kurang.length === 0) {
          return <span style={{ fontSize: 11, color: C.muted }}>—</span>;
        }
        return (
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            fontSize: 11, fontWeight: 600, whiteSpace: "nowrap",
            padding: "2px 8px", borderRadius: 99,
            background: C.yellowBg, color: C.onWarningBg,
            border: `1px solid ${C.yellowBorder}`,
          }}>
            <AlertTriangle size={10} aria-hidden="true" />
            {/* Medan disebut namanya — "kurang 2" tak memberi tahu apa pun. */}
            {kurang.join(", ")}
          </span>
        );
      },
    },
    {
      kunci: "status", judul: "Status",
      render: c => (
        <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 99, background: c.is_active ? C.greenBg : "var(--surface-hover)", color: c.is_active ? C.green : C.mid, fontWeight: 500 }}>
          {c.is_active ? "Aktif" : "Nonaktif"}
        </span>
      ),
    },
    {
      kunci: "aksi", judul: "", rata: "kanan",
      render: c => (
        <div style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: "flex-end" }}>
          <button aria-label={`Lihat proyek ${c.company_name ?? c.contact_person}`}
            onClick={() => setDetailId(c.id)}
            title="Lihat proyek"
            style={{ padding: 6, border: "none", background: "none", cursor: "pointer", color: C.muted, borderRadius: 6, display: "flex" }}
            onMouseEnter={e => { e.currentTarget.style.color = C.navy; e.currentTarget.style.background = C.navyLight; }}
            onMouseLeave={e => { e.currentTarget.style.color = C.muted; e.currentTarget.style.background = "none"; }}
          >
            <FolderKanban size={14} />
          </button>
          <button aria-label={`Edit ${c.company_name ?? c.contact_person}`}
            onClick={() => { setEditClient(c); setShowModal(true); }}
            title="Edit"
            style={{ padding: 6, border: "none", background: "none", cursor: "pointer", color: C.muted, borderRadius: 6, display: "flex" }}
            onMouseEnter={e => { e.currentTarget.style.color = C.navy; e.currentTarget.style.background = C.navyLight; }}
            onMouseLeave={e => { e.currentTarget.style.color = C.muted; e.currentTarget.style.background = "none"; }}
          >
            <Edit2 size={14} />
          </button>
          {isAdmin && (
            <button aria-label={c.is_active ? `Nonaktifkan ${c.company_name ?? c.contact_person}` : `Aktifkan ${c.company_name ?? c.contact_person}`}
              onClick={() => toggleActive(c)}
              disabled={togglingId === c.id}
              title={c.is_active ? "Nonaktifkan" : "Aktifkan"}
              style={{ padding: 6, border: "none", background: "none", cursor: "pointer", color: c.is_active ? C.green : C.muted, borderRadius: 6, display: "flex", opacity: togglingId === c.id ? 0.5 : 1 }}
              onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-hover)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "none"; }}
            >
              {c.is_active ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
            </button>
          )}
          {/* Namanya menyertakan nama klien, bukan sekadar "Lihat
              detail": tombol ini berulang di setiap baris, dan
              pembaca layar yang menelusuri tombol satu per satu
              akan mendengar "lihat detail" sepuluh kali tanpa tahu
              detail SIAPA. */}
          <button
            aria-label={`Lihat detail ${c.company_name ?? c.contact_person}`}
            onClick={() => setDetailId(c.id)}
            style={{ padding: 6, border: "none", background: "none", cursor: "pointer", color: C.muted, borderRadius: 6, display: "flex" }}
            onMouseEnter={e => { e.currentTarget.style.color = C.navy; }}
            onMouseLeave={e => { e.currentTarget.style.color = C.muted; }}
          >
            <ChevronRight size={14} />
          </button>
        </div>
      ),
    },
  ];

  /*
    RAIL KONTEKSTUAL — catatan lengkapnya di `app/(dashboard)/proyek/page.tsx`.
    Yang relevan di halaman klien: klien yang baru ditambahkan. Tenggat
    dikosongkan karena klien tak punya tanggal jatuh tempo — Pengingat akan
    berkata "tak ada tenggat", dan itu jujur.
  */
  usePasangRail(
    <RailIsi
      konteks={
        <KartuRail judul="Klien terbaru" kosong="Belum ada klien.">
          {[...clients]
            .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))
            .slice(0, 6)
            .map((k, i) => (
              <BarisRail
                key={k.id}
                pertama={i === 0}
                utama={k.company_name || k.contact_person}
                sub={k.company_name ? k.contact_person : undefined}
                kanan={k.is_active ? undefined : "nonaktif"}
              />
            ))}
        </KartuRail>
      }
    />,
    [clients],
  );

  return (
    <div style={{ padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)", width: "100%", maxWidth: "var(--w-page)", margin: "0 auto" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <KepalaHalaman judul="Klien" />{/* Cacah klien pindah ke kartu KPI — mengulanginya di sini membuat
              angka yang sama tampil dua kali dalam satu layar. */}
          <p style={{ fontSize: 13, color: C.mid }}>
            Pemberi kerja, kelengkapan datanya, lalu daftarnya
          </p>
        </div>
        <button
          onClick={() => { setEditClient(null); setShowModal(true); }}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 6, border: "none", background: C.navy, color: "var(--surface)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
        >
          <Plus size={15} /> Tambah Klien
        </button>
      </div>

      {/* ── LAPIS 1 — KEADAAN ──
          TIGA kartu, bukan empat. Versi sebelumnya memakai empat: aktif,
          perorangan, perusahaan, nonaktif. Tiga di antaranya cacah tipe yang
          SUDAH terbaca dari tombol saringan tepat di bawahnya, dan tak satu
          pun menuntut tindakan — "18 perorangan" tak mengubah rencana siapa
          pun. Yang menggantikannya adalah satu-satunya angka di respons ini
          yang bisa ditindaklanjuti: data yang belum lengkap. */}
      {!loading && clients.length > 0 && (
        <div className="rise rise-1" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 20 }}>
          <KartuKPI
            sorot
            label="Klien Aktif"
            nilai={String(ringkas.aktif)}
            nilaiAngka={ringkas.aktif}
            ikon={<Users size={15} />}
            keterangan={`${ringkas.perusahaan} perusahaan · ${ringkas.perorangan} perorangan${ringkas.nonaktif > 0 ? ` · ${ringkas.nonaktif} nonaktif` : ""}`}
          />
          <KartuKPI
            label="Data Belum Lengkap"
            nilai={String(ringkas.takLengkap)}
            nilaiAngka={ringkas.takLengkap}
            naikBagus={false}
            ikon={<FileText size={15} />}
            onClick={ringkas.takLengkap > 0 ? () => setHanyaTakLengkap(v => !v) : undefined}
            keterangan={ringkas.takLengkap === 0
              ? "seluruh klien aktif punya kontak & identitas pajak"
              : `${ringkas.tanpaEmail} tanpa email · ${ringkas.tanpaIdentitasPajak} tanpa NPWP/NIK — menahan penerbitan invoice`}
          />
          {/* Piutang TIDAK ditampilkan di sini, dan kartunya menjelaskan
              kenapa alih-alih diam. Lihat catatan kepala berkas: endpoint
              piutang menuntut izin finance yang tak dimiliki setiap pemakai
              halaman ini, dan angka nol yang berarti "tak boleh tahu" tak
              bisa dibedakan dari nol yang berarti "semua sudah bayar". */}
          <div style={{
            padding: "var(--pad-kartu-lega)", borderRadius: 14,
            background: C.surface, border: `1px dashed ${C.border}`,
            display: "flex", flexDirection: "column", justifyContent: "center",
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".03em", textTransform: "uppercase", color: C.muted, marginBottom: 6 }}>
              Piutang per Klien
            </div>
            <p style={{ margin: 0, fontSize: 11, color: C.mid, lineHeight: 1.5 }}>
              Tidak dihitung di sini — datanya butuh izin keuangan, dan angka
              yang kosong karena izin terbaca sama seperti angka nol.
            </p>
            <Link href="/keuangan/piutang" style={{
              marginTop: 8, fontSize: 11, fontWeight: 700, color: C.navy,
              textDecoration: "none", whiteSpace: "nowrap",
            }}>
              Buka umur piutang →
            </Link>
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "1 1 260px" }}>
          <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: C.muted }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cari nama, email, telepon..."
            style={{ width: "100%", padding: "8px 12px 8px 32px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 13, color: C.text, background: "var(--surface)", outline: "none" }}
          />
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {(["all", "perorangan", "perusahaan"] as const).map(t => (
            <button key={t} onClick={() => setFilterType(t)}
              style={{ padding: "8px 12px", borderRadius: 6, border: `1px solid ${filterType === t ? C.navy : C.border}`, background: filterType === t ? C.navyLight : "var(--surface)", color: filterType === t ? C.navy : C.mid, fontSize: 12, fontWeight: filterType === t ? 600 : 400, cursor: "pointer" }}>
              {t === "all" ? "Semua" : t === "perorangan" ? "Perorangan" : "Perusahaan"}
            </button>
          ))}
        </div>

        {/* Saringan kelengkapan — hanya muncul kalau ada yang tak lengkap.
            Tombol yang selalu ada tapi selalu menghasilkan nol baris cuma
            menambah kebisingan pada halaman yang datanya sudah rapi. */}
        {ringkas.takLengkap > 0 && (
          <button
            aria-pressed={hanyaTakLengkap}
            onClick={() => setHanyaTakLengkap(v => !v)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "8px 12px", borderRadius: 6, cursor: "pointer",
              fontSize: 12, fontWeight: hanyaTakLengkap ? 600 : 400,
              border: `1px solid ${hanyaTakLengkap ? C.yellowBorder : C.border}`,
              background: hanyaTakLengkap ? C.yellowBg : "var(--surface)",
              color: hanyaTakLengkap ? C.onWarningBg : C.mid,
            }}
          >
            <FileText size={13} aria-hidden="true" />
            Belum lengkap ({ringkas.takLengkap})
          </button>
        )}
      </div>

      {/* Table */}
      <div style={{ background: "var(--surface)", borderRadius: 10, border: `1px solid ${C.border}`, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: C.muted, fontSize: 13 }}>Memuat data klien...</div>
        ) : filtered.length === 0 ? (
          // Dua keadaan yang TERLIHAT sama tapi menuntut jawaban berbeda:
          // daftar yang memang masih kosong, dan daftar berisi yang tersaring
          // habis. Satu pesan untuk keduanya membuat orang mencari tombol
          // "tambah" padahal datanya ada, cuma tersembunyi filter.
          <div style={{ padding: 16 }}>
            {clients.length === 0 ? (
              <Kosong
                ikon={<Users size={28} />}
                judul="Belum ada klien terdaftar"
                sebab={
                  <>
                    Invoice, kontrak, dan piutang semuanya menunjuk ke klien.
                    Selama daftar ini kosong, proyek baru tak bisa dikaitkan ke
                    pemberi kerjanya.
                  </>
                }
                aksi={
                  <button
                    onClick={() => { setEditClient(null); setShowModal(true); }}
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 6, border: "none", background: C.navy, color: "var(--on-navy)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                  >
                    <Plus size={14} /> Tambah Klien
                  </button>
                }
              />
            ) : (
              <Kosong
                ikon={<Users size={28} />}
                judul="Tidak ada klien yang cocok"
                sebab={
                  <>
                    Ada {clients.length.toLocaleString("id-ID")}{" "}klien terdaftar,
                    tapi tak satu pun lolos saringan yang sedang aktif
                    {hanyaTakLengkap && " — termasuk saringan “belum lengkap”"}.
                    Kosongkan kata kunci atau kembalikan tipe ke &ldquo;semua&rdquo;.
                  </>
                }
                aksi={
                  <button
                    onClick={() => { setSearch(""); setFilterType("all"); setHanyaTakLengkap(false); }}
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 6, border: `1px solid ${C.border}`, background: "var(--surface)", color: C.text, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                  >
                    Kosongkan saringan
                  </button>
                }
              />
            )}
          </div>
        ) : (
          /* Dipindahkan ke <Tabel> 2026-08-07 (UI-0-4). Caption sr-only,
             kolom pertama <th scope="row">, tabular-nums, dan pembungkus
             overflow-x sekarang dijamin komponen — empat hal yang tabel
             mentah di sini harus ingat sendiri, dan yang paling mudah
             hilang saat kolom ditambah belakangan.

             Kolom "Klien" tetap kepala baris — ia memang yang menamai
             barisnya. Tak ada penukaran urutan yang perlu di sini.

             Kolom aksi berjudul string kosong: judul yang terbaca akan
             dibacakan pembaca layar sebagai kolom berisi data, padahal
             isinya tombol. Perilakunya sama persis dengan versi mentah. */
          <Tabel<Client>
            caption="Daftar klien: nama, kontak, tipe, kelengkapan data, dan status kerja sama."
            data={filtered}
            kunciBaris={c => c.id}
            kolom={kolomKlien}
          />
        )}
      </div>

      {/* Modals */}
      {showModal && (
        <ClientModal
          client={editClient}
          onClose={() => { setShowModal(false); setEditClient(null); }}
          onSaved={onSaved}
        />
      )}
      {detailId && (
        <DetailPanel
          clientId={detailId}
          onClose={() => setDetailId(null)}
          onEdit={() => {
            const c = clients.find(x => x.id === detailId);
            if (c) { setEditClient(c); setShowModal(true); }
          }}
          onCreateProject={() => {
            setDetailId(null);
            router.push(`/proyek?new=1&client_id=${detailId}`);
          }}
        />
      )}
    </div>
  );
}
