"use client";

/**
 * KAS — tiga modal pembuatan: akun, transfer, pengeluaran.
 *
 * Dipindah UTUH dari `kas/page.tsx`. Ketiganya dipakai dari lebih dari satu
 * halaman setelah modul dipecah (tombol "Transfer" dan "Catat Pengeluaran"
 * berada di kerangka modul, sementara "Akun Baru" ada di halaman akun), jadi
 * menaruhnya di satu halaman berarti halaman lain harus menyalinnya.
 */

import { useEffect, useReducer, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRightLeft, FileText, ShoppingCart, Wallet, X } from "lucide-react";
import { api } from "@/lib/api";
import { useIzin } from "@/lib/use-izin";
import { useTutupEsc } from "@/lib/use-tutup-esc";
import { C } from "@/lib/warna-ui";
import {
  type CashAccount, type Category, type Project,
  ACCOUNT_TYPE_LABEL, SOURCE_LABEL, fmt, pesanGalat,
} from "./tipe";

const gayaInput: React.CSSProperties = {
  width: "100%", padding: "8px 12px", border: `1px solid ${C.border}`,
  borderRadius: 6, fontSize: 13, outline: "none", boxSizing: "border-box",
};

const gayaSelect: React.CSSProperties = {
  ...gayaInput, padding: "8px 8px", background: "var(--surface)",
};

const gayaLabel: React.CSSProperties = {
  display: "block", fontSize: 12, fontWeight: 600, color: C.mid, marginBottom: 6,
};

/** Kerangka modal: latar gelap, kartu, kepala berjudul, tutup lewat Esc/klik luar. */
function Bingkai({ judul, ikon, gradasi, lebar, onClose, children }: {
  judul: string; ikon: React.ReactNode; gradasi: string; lebar: number;
  onClose: () => void; children: React.ReactNode;
}) {
  return (
    <div style={{
      // Nilai asli dari versi tab dipertahankan: belum ada token tirai di
      // `globals.css`, dan berkas itu sedang dipegang sesi lain.
      position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.45)",
      backdropFilter: "blur(3px)", display: "flex", alignItems: "center",
      justifyContent: "center", padding: 20,
    }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: "var(--surface)", borderRadius: 14, width: "100%", maxWidth: lebar,
        boxShadow: "var(--naik-3)", display: "flex", flexDirection: "column", maxHeight: "92vh",
      }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "20px 24px", borderBottom: `1px solid ${C.border}`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10, background: gradasi,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>{ikon}</div>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0 }}>{judul}</h3>
          </div>
          <button aria-label="Tutup" onClick={onClose} style={{ background: "transparent", border: "none", cursor: "pointer", color: C.muted }}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Galat({ pesan }: { pesan: string }) {
  return (
    <div style={{ padding: "8px 12px", borderRadius: 6, background: C.redBg, border: `1px solid ${C.redBorder}`, fontSize: 13, color: C.red }}>
      {pesan}
    </div>
  );
}

function TombolForm({ loading, label, warna = C.navy }: { loading: boolean; label: string; warna?: string }) {
  return (
    <button type="submit" disabled={loading} style={{
      flex: 2, padding: "8px", borderRadius: 6, border: "none",
      background: loading ? "var(--text-muted)" : warna, color: "var(--surface)",
      fontSize: 13, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer",
    }}>
      {loading ? "Menyimpan..." : label}
    </button>
  );
}

/** Kunci gulir latar + tunda render sampai ter-mount (portal butuh document). */
function useModalSiap() {
  const [mounted, mount] = useReducer(() => true, false);
  useEffect(mount, []);
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);
  return mounted;
}

// ═══ Modal: Buat Akun Kas ════════════════════════════════════════════════════

export function CreateAccountModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  useTutupEsc(onClose);
  const siap = useModalSiap();

  const [name, setName] = useState("");
  const [type, setType] = useState<"main" | "collector" | "petty_cash">("main");
  const [ownerId, setOwnerId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [initialBalance, setInitialBalance] = useState("");
  const [notes, setNotes] = useState("");
  const [users, setUsers] = useState<{ id: string; name: string; role: string }[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      api.get<{ users: { id: string; name: string; role: string }[] }>("/api/v1/users"),
      api.get<{ projects: Project[] }>("/api/v1/projects"),
    ]).then(([ur, pr]) => { setUsers(ur.data.users); setProjects(pr.data.projects); }).catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError("");
    if (!name || !type) { setError("Nama dan tipe wajib diisi"); return; }
    const parsedBalance = initialBalance ? parseFloat(initialBalance) : undefined;
    if (parsedBalance !== undefined && (isNaN(parsedBalance) || parsedBalance < 0)) {
      setError("Saldo awal harus berupa angka positif"); return;
    }
    setLoading(true);
    try {
      await api.post("/api/v1/cash/accounts", {
        name, type,
        owner_id: ownerId || undefined,
        project_id: projectId || undefined,
        initial_balance: parsedBalance,
        notes: notes || undefined,
      });
      onSuccess();
    } catch (err: unknown) {
      setError(pesanGalat(err, "Gagal membuat akun"));
    } finally { setLoading(false); }
  }

  if (!siap) return null;
  return createPortal(
    <Bingkai judul="Buat Akun Kas Baru" lebar={480} onClose={onClose}
      gradasi="linear-gradient(135deg,var(--navy),var(--aksen-terang))"
      ikon={<Wallet size={17} color="var(--surface)" />}>
      <form onSubmit={handleSubmit} style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 12, overflowY: "auto" }}>
        <div>
          <span id="tipe-akun" style={gayaLabel}>Tipe Akun <span style={{ color: C.red }}>*</span></span>
          <div role="group" aria-labelledby="tipe-akun" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            {(["main", "collector", "petty_cash"] as const).map(t => {
              const m = ACCOUNT_TYPE_LABEL[t];
              return (
                <button type="button" key={t} onClick={() => setType(t)} style={{
                  padding: "8px 8px", borderRadius: 10,
                  border: `2px solid ${type === t ? m.color : C.border}`,
                  background: type === t ? m.bg : "var(--surface)",
                  color: type === t ? m.color : C.mid,
                  fontSize: 11, fontWeight: 600, cursor: "pointer",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                  transition: "all 0.15s",
                }}>
                  {m.icon}{m.label}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <label htmlFor="name" style={gayaLabel}>Nama Akun <span style={{ color: C.red }}>*</span></label>
          <input id="name" value={name} onChange={e => setName(e.target.value)} required
            placeholder={type === "main" ? "Kas Utama Nizar" : type === "collector" ? "Kas Ayah" : "Kas Kecil PM Agus – Griya Asri"}
            style={gayaInput}
            onFocus={e => { e.target.style.borderColor = C.navy; }} onBlur={e => { e.target.style.borderColor = C.border; }} />
        </div>
        {(type === "petty_cash" || type === "collector") && (
          <div>
            <label htmlFor="owner-id" style={gayaLabel}>Pemegang Kas {type === "petty_cash" ? <span style={{ color: C.red }}>*</span> : null}</label>
            <select id="owner-id" aria-label="Pemilik akun kas" value={ownerId} onChange={e => setOwnerId(e.target.value)} style={gayaSelect}>
              <option value="">-- Pilih user --</option>
              {users.filter(u => type === "petty_cash" ? (u.role === "pm" || u.role === "admin") : true).map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
            </select>
          </div>
        )}
        {type === "petty_cash" && (
          <div>
            <label htmlFor="project-id" style={gayaLabel}>Proyek <span style={{ color: C.red }}>*</span></label>
            <select id="project-id" aria-label="Proyek" value={projectId} onChange={e => setProjectId(e.target.value)} style={gayaSelect}>
              <option value="">-- Pilih proyek --</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        )}
        <div>
          <label htmlFor="initial-balance" style={gayaLabel}>Saldo Awal (Rp)</label>
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: C.muted }}>Rp</span>
            <input id="initial-balance" type="number" min={0} value={initialBalance} onChange={e => setInitialBalance(e.target.value)} placeholder="0"
              style={{ ...gayaInput, padding: "8px 12px 8px 32px" }} />
          </div>
        </div>
        <div>
          <label htmlFor="notes" style={gayaLabel}>Catatan</label>
          <textarea id="notes" value={notes} onChange={e => setNotes(e.target.value)} rows={2}
            style={{ ...gayaInput, resize: "vertical", fontFamily: "inherit" }} />
        </div>
        {error && <Galat pesan={error} />}
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={onClose} style={{ flex: 1, padding: "8px", borderRadius: 6, border: `1px solid ${C.border}`, background: "var(--surface)", fontSize: 13, cursor: "pointer" }}>Batal</button>
          <TombolForm loading={loading} label="Buat Akun" />
        </div>
      </form>
    </Bingkai>,
    document.body
  );
}

// ═══ Modal: Transfer Dana ════════════════════════════════════════════════════

export function CreateTransferModal({ accounts, onClose, onSuccess, onNeedAccounts }: {
  accounts: CashAccount[]; onClose: () => void; onSuccess: () => void; onNeedAccounts: () => void;
}) {
  useTutupEsc(onClose);
  const siap = useModalSiap();
  useEffect(() => { if (accounts.length === 0) onNeedAccounts(); }, []);

  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [amount, setAmount] = useState("");
  const [transferDate, setTransferDate] = useState(new Date().toISOString().split("T")[0]);
  const [status, setStatus] = useState<"pending" | "confirmed">("confirmed");
  const [refNumber, setRefNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fromAcc = accounts.find(a => a.id === fromId);
  const toAcc = accounts.find(a => a.id === toId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError("");
    if (!fromId || !toId || !amount) { setError("Akun asal, tujuan, dan nominal wajib diisi"); return; }
    if (fromId === toId) { setError("Akun asal dan tujuan tidak boleh sama"); return; }
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) { setError("Nominal transfer harus lebih dari 0"); return; }
    setLoading(true);
    try {
      await api.post("/api/v1/cash/transfers", {
        from_account_id: fromId, to_account_id: toId,
        amount: parsedAmount, transfer_date: transferDate,
        status, ref_number: refNumber || undefined, notes: notes || undefined,
      });
      onSuccess();
    } catch (err: unknown) {
      setError(pesanGalat(err, "Gagal catat transfer"));
    } finally { setLoading(false); }
  }

  if (!siap) return null;
  return createPortal(
    <Bingkai judul="Catat Transfer Dana" lebar={480} onClose={onClose}
      gradasi="linear-gradient(135deg,var(--aksen),var(--aksen-terang))"
      ikon={<ArrowRightLeft size={17} color="var(--surface)" />}>
      <form onSubmit={handleSubmit} style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 12, overflowY: "auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 32px 1fr", gap: 8, alignItems: "end" }}>
          <div>
            <label htmlFor="from-id" style={gayaLabel}>Dari Akun <span style={{ color: C.red }}>*</span></label>
            <select id="from-id" aria-label="Kas asal transfer" value={fromId} onChange={e => setFromId(e.target.value)} required style={gayaSelect}>
              <option value="">-- Pilih --</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            {fromAcc && <div style={{ fontSize: 11, color: fromAcc.balance < parseFloat(amount || "0") ? C.red : C.green, marginTop: 4 }}>Saldo: {fmt(fromAcc.balance)}</div>}
          </div>
          <div style={{ display: "flex", justifyContent: "center", paddingBottom: 10 }}><ArrowRightLeft size={16} color={C.mid} /></div>
          <div>
            <label htmlFor="to-id" style={gayaLabel}>Ke Akun <span style={{ color: C.red }}>*</span></label>
            <select id="to-id" aria-label="Kas tujuan transfer" value={toId} onChange={e => setToId(e.target.value)} required style={gayaSelect}>
              <option value="">-- Pilih --</option>
              {accounts.filter(a => a.id !== fromId).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            {toAcc && <div style={{ fontSize: 11, color: C.mid, marginTop: 4 }}>Saldo saat ini: {fmt(toAcc.balance)}</div>}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label htmlFor="amount" style={gayaLabel}>Nominal <span style={{ color: C.red }}>*</span></label>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: C.muted }}>Rp</span>
              <input id="amount" type="number" min={1} value={amount} onChange={e => setAmount(e.target.value)} required
                style={{ ...gayaInput, padding: "8px 12px 8px 32px" }} />
            </div>
          </div>
          <div>
            <label htmlFor="transfer-date" style={gayaLabel}>Tanggal Transfer</label>
            <input id="transfer-date" aria-label="Tanggal" type="date" value={transferDate} onChange={e => setTransferDate(e.target.value)} style={gayaInput} />
          </div>
        </div>
        <div>
          <span id="status-transfer" style={{ ...gayaLabel, marginBottom: 8 }}>Status Transfer</span>
          <div role="group" aria-labelledby="status-transfer" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <button type="button" onClick={() => setStatus("confirmed")} style={{
              padding: "8px", borderRadius: 10,
              border: `2px solid ${status === "confirmed" ? C.green : C.border}`,
              background: status === "confirmed" ? C.greenBg : "var(--surface)",
              color: status === "confirmed" ? C.green : C.mid, fontSize: 12, fontWeight: 600, cursor: "pointer",
            }}>
              ✓ Langsung Konfirmasi<br /><span style={{ fontSize: 10, fontWeight: 400 }}>Saldo berubah sekarang</span>
            </button>
            <button type="button" onClick={() => setStatus("pending")} style={{
              padding: "8px", borderRadius: 10,
              border: `2px solid ${status === "pending" ? C.yellow : C.border}`,
              background: status === "pending" ? C.yellowBg : "var(--surface)",
              color: status === "pending" ? C.yellow : C.mid, fontSize: 12, fontWeight: 600, cursor: "pointer",
            }}>
              ⏳ Simpan Pending<br /><span style={{ fontSize: 10, fontWeight: 400 }}>Konfirmasi setelah diterima</span>
            </button>
          </div>
        </div>
        <div>
          <label htmlFor="ref-number" style={gayaLabel}>No. Referensi</label>
          <input id="ref-number" type="text" value={refNumber} onChange={e => setRefNumber(e.target.value)} placeholder="No. TF / kode transfer" style={gayaInput} />
        </div>
        <div>
          <label htmlFor="notes-2" style={gayaLabel}>Catatan</label>
          <textarea id="notes-2" value={notes} onChange={e => setNotes(e.target.value)} rows={2}
            placeholder="Misal: Top-up kas kecil PM Agus untuk Proyek Griya Asri"
            style={{ ...gayaInput, resize: "vertical", fontFamily: "inherit" }} />
        </div>
        {error && <Galat pesan={error} />}
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={onClose} style={{ flex: 1, padding: "8px", borderRadius: 6, border: `1px solid ${C.border}`, background: "var(--surface)", fontSize: 13, cursor: "pointer" }}>Batal</button>
          <TombolForm loading={loading} label="Catat Transfer" />
        </div>
      </form>
    </Bingkai>,
    document.body
  );
}

// ═══ Modal: Catat Pengeluaran ════════════════════════════════════════════════

export function CreateExpenseModal({ accounts, onClose, onSuccess, onNeedAccounts }: {
  accounts: CashAccount[]; onClose: () => void; onSuccess: () => void; onNeedAccounts: () => void;
}) {
  useTutupEsc(onClose);
  // Diangkat dari JSX — `hasPermission` di jalur render membuat pohon server
  // dan klien berbeda. Detail: `lib/use-izin.ts`.
  const bolehApprove = useIzin("cash:expense:approve");
  const siap = useModalSiap();
  useEffect(() => { if (accounts.length === 0) onNeedAccounts(); }, []);

  const [projects, setProjects] = useState<Project[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [mainCashAccounts, setMainCashAccounts] = useState<CashAccount[]>([]);
  const [projectId, setProjectId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [pettyCashId, setPettyCashId] = useState("");
  const [mainCashId, setMainCashId] = useState("");
  const [expenseSource, setExpenseSource] = useState<"petty_cash" | "main_cash" | "personal" | "client_fund">("petty_cash");
  const [description, setDescription] = useState("");
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split("T")[0]);
  const [qty, setQty] = useState("1");
  const [unit, setUnit] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [notes, setNotes] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const total = (parseFloat(qty || "1") || 1) * (parseFloat(unitPrice || "0") || 0);
  const selectedPettyCash = accounts.find(a => a.id === pettyCashId);

  useEffect(() => {
    api.get<{ projects: Project[] }>("/api/v1/projects").then(r => setProjects(r.data.projects)).catch(() => {});
    api.get<{ categories: Category[] }>("/api/v1/cash/categories")
      .then(r => setCategories(r.data.categories)).catch(() => {});
    api.get<{ accounts: CashAccount[] }>("/api/v1/cash/accounts?type=main")
      .then(r => {
        const mains = r.data.accounts.filter(a => a.type === "main" && a.is_active);
        setMainCashAccounts(mains);
        if (mains.length === 1) setMainCashId(mains[0].id);
      }).catch(() => {});
  }, []);

  useEffect(() => {
    const url = projectId
      ? `/api/v1/cash/categories?project_id=${projectId}`
      : "/api/v1/cash/categories";
    api.get<{ categories: Category[] }>(url)
      .then(r => { setCategories(r.data.categories); setCategoryId(""); }).catch(() => {});
  }, [projectId]);

  // Filter kas kecil sesuai proyek
  const projectPettyCash = accounts.filter(a => {
    if (!a.projects) return false;
    return a.projects.id === projectId || !projectId;
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError("");
    if (!projectId || !categoryId || !description || !unitPrice) { setError("Proyek, kategori, deskripsi, dan harga wajib diisi"); return; }
    if (expenseSource === "petty_cash" && !pettyCashId) { setError("Pilih kas kecil jika sumber = Kas Kecil"); return; }
    if (expenseSource === "main_cash" && !mainCashId) { setError("Pilih akun Kas Utama jika sumber = Kas Utama"); return; }
    // client_fund: tidak mengurangi saldo kas manapun, tidak perlu pilih akun
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("project_id", projectId);
      fd.append("category_id", categoryId);
      fd.append("expense_source", expenseSource);
      if (expenseSource === "petty_cash" && pettyCashId) fd.append("petty_cash_id", pettyCashId);
      if (expenseSource === "main_cash" && mainCashId) fd.append("main_cash_id", mainCashId);
      fd.append("description", description);
      fd.append("expense_date", expenseDate);
      fd.append("qty", qty);
      if (unit) fd.append("unit", unit);
      fd.append("unit_price", unitPrice);
      if (vendorName) fd.append("vendor_name", vendorName);
      if (notes) fd.append("notes", notes);
      if (receiptFile) fd.append("receipt", receiptFile);
      await api.post("/api/v1/cash/expenses", fd, { headers: { "Content-Type": "multipart/form-data" } });
      onSuccess();
    } catch (err: unknown) {
      setError(pesanGalat(err, "Gagal catat pengeluaran"));
    } finally { setLoading(false); }
  }

  const parentCats = categories.filter(c => !c.parent_id);
  const childCats = (parentId: string) => categories.filter(c => c.parent_id === parentId);

  if (!siap) return null;
  return createPortal(
    <Bingkai judul="Catat Pengeluaran Proyek" lebar={520} onClose={onClose}
      gradasi="linear-gradient(135deg,var(--danger),var(--danger))"
      ikon={<ShoppingCart size={17} color="var(--surface)" />}>
      <form onSubmit={handleSubmit} style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 12, overflowY: "auto", flex: 1 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label htmlFor="project-id-2" style={gayaLabel}>Proyek <span style={{ color: C.red }}>*</span></label>
            <select id="project-id-2" aria-label="Proyek" value={projectId} onChange={e => setProjectId(e.target.value)} required style={gayaSelect}>
              <option value="">-- Pilih proyek --</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="expense-date" style={gayaLabel}>Tanggal</label>
            <input id="expense-date" aria-label="Tanggal" type="date" value={expenseDate} onChange={e => setExpenseDate(e.target.value)} style={gayaInput} />
          </div>
        </div>

        <div>
          <span id="sumber-dana" style={{ ...gayaLabel, marginBottom: 8 }}>Sumber Dana <span style={{ color: C.red }}>*</span></span>
          <div role="group" aria-labelledby="sumber-dana" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {(["petty_cash", "main_cash", "personal", "client_fund"] as const).map(s => (
              <button type="button" key={s} onClick={() => setExpenseSource(s)} style={{
                padding: "8px 6px", borderRadius: 6,
                border: `2px solid ${expenseSource === s ? C.navy : C.border}`,
                background: expenseSource === s ? C.navyLight : "var(--surface)",
                color: expenseSource === s ? C.navy : C.mid, fontSize: 11, fontWeight: 600, cursor: "pointer",
              }}>
                {SOURCE_LABEL[s]}
              </button>
            ))}
          </div>
          {expenseSource === "client_fund" && (
            <div style={{ marginTop: 6, padding: "6px 8px", borderRadius: 6, background: "var(--info-bg)", border: "1px solid var(--info-border)", fontSize: 11, color: "var(--info)" }}>
              Pengeluaran ini dibayar dari dana klien — tidak mengurangi saldo kas internal.
            </div>
          )}
          {expenseSource === "personal" && (
            <div style={{ marginTop: 6, padding: "6px 8px", borderRadius: 6, background: "var(--warning-bg)", border: "1px solid var(--warning-border)", fontSize: 11, color: "var(--on-warning-bg)" }}>
              Talangan pribadi — perlu di-reimburse dari kas proyek.
            </div>
          )}
        </div>

        {expenseSource === "petty_cash" && (
          <div>
            <label htmlFor="petty-cash-id" style={gayaLabel}>Kas Kecil <span style={{ color: C.red }}>*</span></label>
            <select id="petty-cash-id" aria-label="Kas kecil" value={pettyCashId} onChange={e => setPettyCashId(e.target.value)} required={expenseSource === "petty_cash"} style={gayaSelect}>
              <option value="">-- Pilih kas kecil --</option>
              {(projectId ? projectPettyCash : accounts).map(a => (
                <option key={a.id} value={a.id}>{a.name} — saldo: {fmt(a.balance)}</option>
              ))}
            </select>
            {selectedPettyCash && total > 0 && (
              <div style={{ fontSize: 11, marginTop: 4, color: selectedPettyCash.balance < total ? C.red : C.green }}>
                Saldo: {fmt(selectedPettyCash.balance)} {selectedPettyCash.balance < total ? "⚠ tidak cukup" : "✓ cukup"}
              </div>
            )}
          </div>
        )}

        {expenseSource === "main_cash" && (
          <div>
            <label style={gayaLabel}>Akun Kas Utama <span style={{ color: C.red }}>*</span></label>
            {mainCashAccounts.length === 0 ? (
              // Ini jalan buntu yang paling merugikan di modul kas: orang sedang
              // DI TENGAH mengisi form pengeluaran, lalu menemui kotak abu-abu
              // yang cuma menyatakan kekosongan. Tanpa jalan keluar, satu-satunya
              // pilihan adalah menebak menu mana yang membuat akun kas.
              //
              // Sejak modul dipecah, akun kas punya RUTE sendiri — jadi jalan
              // keluarnya kembali jadi tautan biasa yang membuka tab baru,
              // sehingga yang sudah diketik di form ini tidak hilang.
              <div style={{
                padding: "8px 12px", borderRadius: 6,
                background: "var(--warning-bg)", border: `1px solid var(--warning-border)`,
                fontSize: 12, color: "var(--on-warning-bg)",
              }}>
                Belum ada akun Kas Utama yang aktif, jadi pengeluaran ini tak punya
                sumber dana.{" "}
                <a href="/kas/akun" target="_blank" rel="noopener noreferrer"
                  style={{ color: "inherit", fontWeight: 600, textDecoration: "underline" }}>
                  Buka halaman Akun Kas untuk membuatnya →
                </a>
              </div>
            ) : (
              <select aria-label="Kas utama" value={mainCashId} onChange={e => setMainCashId(e.target.value)} required={expenseSource === "main_cash"} style={gayaSelect}>
                {mainCashAccounts.length > 1 && <option value="">-- Pilih akun kas utama --</option>}
                {mainCashAccounts.map(a => (
                  <option key={a.id} value={a.id}>{a.name} — saldo: {fmt(a.balance)}</option>
                ))}
              </select>
            )}
            {mainCashId && (() => {
              const acc = mainCashAccounts.find(a => a.id === mainCashId);
              if (!acc || total === 0) return null;
              return (
                <div style={{ fontSize: 11, marginTop: 4, color: acc.balance < total ? C.red : C.green }}>
                  Saldo: {fmt(acc.balance)} {acc.balance < total ? "⚠ tidak cukup" : "✓ cukup"}
                </div>
              );
            })()}
          </div>
        )}

        <div>
          <label htmlFor="category-id" style={gayaLabel}>Kategori <span style={{ color: C.red }}>*</span></label>
          <select id="category-id" aria-label="Kategori pengeluaran" value={categoryId} onChange={e => setCategoryId(e.target.value)} required style={gayaSelect}>
            <option value="">-- Pilih kategori --</option>
            {parentCats.map(p => (
              <optgroup key={p.id} label={p.name}>
                {childCats(p.id).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                {childCats(p.id).length === 0 && <option value={p.id}>{p.name}</option>}
              </optgroup>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="description" style={gayaLabel}>Deskripsi <span style={{ color: C.red }}>*</span></label>
          <input id="description" value={description} onChange={e => setDescription(e.target.value)} required
            placeholder="misal: Beli semen 40 sak di Toko Bangunan Maju" style={gayaInput}
            onFocus={e => { e.target.style.borderColor = C.navy; }} onBlur={e => { e.target.style.borderColor = C.border; }} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "80px 80px 1fr", gap: 8 }}>
          <div>
            <label htmlFor="qty" style={gayaLabel}>Qty</label>
            <input id="qty" type="number" min={0.001} step="0.001" value={qty} onChange={e => setQty(e.target.value)} style={{ ...gayaInput, padding: "8px 8px" }} />
          </div>
          <div>
            <label htmlFor="unit" style={gayaLabel}>Satuan</label>
            <input id="unit" type="text" value={unit} onChange={e => setUnit(e.target.value)} placeholder="sak, kg, m" style={{ ...gayaInput, padding: "8px 8px" }} />
          </div>
          <div>
            <label htmlFor="unit-price" style={gayaLabel}>Harga Satuan <span style={{ color: C.red }}>*</span></label>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: C.muted }}>Rp</span>
              <input id="unit-price" type="number" min={0} value={unitPrice} onChange={e => setUnitPrice(e.target.value)} required
                style={{ ...gayaInput, padding: "8px 12px 8px 32px" }} />
            </div>
          </div>
        </div>

        {total > 0 && (
          <div style={{ padding: "8px 12px", borderRadius: 6, background: "var(--surface-subtle)", border: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 12, color: C.mid }}>Total</span>
            <span style={{ fontSize: 15, fontWeight: 800, color: C.text, fontFamily: "var(--font-display)" }}>{fmt(total)}</span>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label htmlFor="vendor-name" style={gayaLabel}>Nama Toko/Supplier</label>
            <input id="vendor-name" type="text" value={vendorName} onChange={e => setVendorName(e.target.value)} placeholder="Toko Bangunan Maju" style={gayaInput} />
          </div>
          <div>
            <label style={gayaLabel}>Foto Nota</label>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" style={{ display: "none" }} onChange={e => {
              const f = e.target.files?.[0] ?? null;
              if (f && f.size > 5 * 1024 * 1024) { alert("Ukuran file maksimal 5 MB"); e.target.value = ""; return; }
              setReceiptFile(f);
            }} />
            {receiptFile ? (
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 6, background: C.greenBg, border: `1px solid ${C.greenBorder}` }}>
                <FileText size={14} color={C.green} />
                <span style={{ fontSize: 11, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{receiptFile.name}</span>
                <button type="button" aria-label="Buang nota yang dipilih" onClick={() => setReceiptFile(null)} style={{ background: "transparent", border: "none", cursor: "pointer", color: C.red, flexShrink: 0 }}><X size={12} /></button>
              </div>
            ) : (
              <button type="button" onClick={() => fileRef.current?.click()}
                style={{ width: "100%", padding: "8px 12px", border: `2px dashed ${C.border}`, borderRadius: 6, background: "var(--surface-subtle)", color: C.mid, fontSize: 11, cursor: "pointer", textAlign: "center", boxSizing: "border-box" }}>
                Upload nota
              </button>
            )}
          </div>
        </div>

        {/* Catatan — medan ini SEBELUMNYA HILANG. `notes` sudah dikirim ke API
            dan ditampilkan di daftar mutasi, tapi tak ada input yang mengisinya,
            jadi nilainya selalu "" dan kondisinya tak pernah benar. */}
        <div>
          <label htmlFor="catatan-pengeluaran" style={gayaLabel}>Catatan</label>
          <textarea id="catatan-pengeluaran" value={notes} onChange={e => setNotes(e.target.value)} rows={2}
            placeholder="Misal: pembelian tambahan karena volume di lapangan bertambah"
            style={{ ...gayaInput, resize: "vertical", fontFamily: "inherit" }} />
        </div>

        {error && <Galat pesan={error} />}

        {bolehApprove && (
          <div style={{ padding: "8px 12px", borderRadius: 6, background: C.greenBg, border: `1px solid ${C.greenBorder}`, fontSize: 12, color: C.green }}>
            ✓ Pengeluaran akan langsung disetujui (saldo kas kecil berkurang otomatis)
          </div>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={onClose} style={{ flex: 1, padding: "8px", borderRadius: 6, border: `1px solid ${C.border}`, background: "var(--surface)", fontSize: 13, cursor: "pointer" }}>Batal</button>
          <TombolForm loading={loading} label="Catat Pengeluaran" warna={C.red} />
        </div>
      </form>
    </Bingkai>,
    document.body
  );
}
