"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "@/lib/api";
import { X, Upload, CheckCircle2, FileImage, Trash2, Banknote, Wallet } from "lucide-react";

// ─── Design tokens ──────────────────────────────────────────────────────────

const C = {
  navy: "var(--navy)", navyLight: "var(--navy-light)",
  text: "var(--text-primary)", mid: "var(--text-secondary)", muted: "var(--text-muted)",
  border: "var(--border)", bg: "var(--bg)",
  green: "var(--success)", greenBg: "var(--success-bg)", greenBorder: "var(--success-border)",
  red: "var(--danger)", redBg: "var(--danger-bg)", redBorder: "var(--danger-border)",
  yellow: "var(--warning)",
};

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TerminInfo {
  id: string;
  termin_number: number;
  label: string;
  amount: number;
  pct_of_contract: number;
  status: "pending" | "billed" | "paid";
}

interface CashAccount {
  id: string;
  name: string;
  type: "main" | "collector" | "petty_cash";
  balance: number;
}

interface Props {
  projectId: string;
  termin: TerminInfo;
  onClose: () => void;
  onSuccess: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

const today = () => new Date().toISOString().split("T")[0];

const ACCOUNT_TYPE_LABEL: Record<string, string> = {
  main: "Kas Utama",
  collector: "Kolektor",
  petty_cash: "Kas Kecil",
};

// ─── Main component ───────────────────────────────────────────────────────────

function TerminPaymentModalContent({ projectId, termin, onClose, onSuccess }: Props) {
  const [paidAt, setPaidAt] = useState(today());
  const [amountPaid, setAmountPaid] = useState(String(Math.round(Number(termin.amount))));
  const [paymentMethod, setPaymentMethod] = useState("transfer_bank");
  const [cashAccountId, setCashAccountId] = useState("");
  const [cashAccounts, setCashAccounts] = useState<CashAccount[]>([]);
  const [refNumber, setRefNumber] = useState("");
  const [bankName, setBankName] = useState("");
  const [notes, setNotes] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load cash accounts on mount
  useEffect(() => {
    api.get<{ accounts: CashAccount[] }>("/api/v1/cash/accounts")
      .then(r => {
        setCashAccounts(r.data.accounts);
        // Auto-select first main account
        const mainAccount = r.data.accounts.find(a => a.type === "main");
        if (mainAccount) setCashAccountId(mainAccount.id);
      })
      .catch(() => {});
  }, []);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError("File terlalu besar (max 5MB)");
      return;
    }
    setProofFile(file);
    setError("");
    if (file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      setProofPreview(url);
    } else {
      setProofPreview(null);
    }
  }

  function removeFile() {
    setProofFile(null);
    setProofPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const amt = parseFloat(amountPaid.replace(/[^0-9.]/g, ""));
    if (!paidAt) { setError("Tanggal bayar wajib diisi"); return; }
    if (isNaN(amt) || amt <= 0) { setError("Nominal pembayaran tidak valid"); return; }

    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("paid_at", paidAt);
      fd.append("amount_paid", String(amt));
      fd.append("payment_method", paymentMethod);
      if (cashAccountId) fd.append("cash_account_id", cashAccountId);
      if (refNumber.trim()) fd.append("ref_number", refNumber.trim());
      if (bankName.trim()) fd.append("bank_name", bankName.trim());
      if (notes.trim()) fd.append("notes", notes.trim());
      if (proofFile) fd.append("proof", proofFile);

      await api.post(
        `/api/v1/projects/${projectId}/termin/${termin.id}/pay`,
        fd,
        { headers: { "Content-Type": "multipart/form-data" } }
      );
      setSuccess(true);
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1200);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? "Terjadi kesalahan, coba lagi");
    } finally {
      setSubmitting(false);
    }
  }

  // Prevent scroll behind modal
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const selectedAccount = cashAccounts.find(a => a.id === cashAccountId);

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "9px 12px", borderRadius: 8,
    border: `1px solid ${C.border}`, fontSize: 13, color: C.text,
    outline: "none", boxSizing: "border-box",
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.45)", backdropFilter: "blur(3px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "var(--surface)", borderRadius: 16, width: "100%", maxWidth: 520,
        boxShadow: "0 20px 60px rgba(0,0,0,0.18)",
        display: "flex", flexDirection: "column", maxHeight: "92vh",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "20px 24px 16px",
          borderBottom: `1px solid ${C.border}`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10, flexShrink: 0,
              background: "linear-gradient(135deg, #003366, #0066CC)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Banknote size={18} color="var(--surface)" />
            </div>
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0 }}>
                Tandai Terbayar
              </h2>
              <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>
                Termin {termin.termin_number} — {termin.label}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: "transparent", border: "none", cursor: "pointer", color: C.muted, padding: 4, borderRadius: 6 }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ overflowY: "auto", padding: "20px 24px", flex: 1 }}>

          {/* Termin info card */}
          <div style={{
            background: C.navyLight, borderRadius: 10, padding: "12px 16px",
            marginBottom: 20, border: "1px solid #BFDBFE",
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <div>
              <div style={{ fontSize: 11, color: "#3B82F6", fontWeight: 600, marginBottom: 2 }}>
                Nilai Termin
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: C.navy, fontFamily: "var(--font-display)" }}>
                {fmt(Number(termin.amount))}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, color: "#3B82F6", fontWeight: 600, marginBottom: 2 }}>
                % Kontrak
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: C.navy, fontFamily: "var(--font-display)" }}>
                {termin.pct_of_contract}%
              </div>
            </div>
          </div>

          {success ? (
            <div style={{ textAlign: "center", padding: "24px 0" }}>
              <CheckCircle2 size={48} color={C.green} style={{ marginBottom: 12 }} />
              <p style={{ fontSize: 15, fontWeight: 700, color: C.green }}>Pembayaran berhasil dicatat!</p>
              {selectedAccount && (
                <p style={{ fontSize: 13, color: C.mid, marginTop: 4 }}>
                  Masuk ke <strong>{selectedAccount.name}</strong>
                </p>
              )}
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>

              {/* Tanggal bayar + Nominal */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 6 }}>
                    Tanggal Bayar <span style={{ color: C.red }}>*</span>
                  </label>
                  <input
                    type="date"
                    value={paidAt}
                    onChange={e => setPaidAt(e.target.value)}
                    required
                    style={inputStyle}
                    onFocus={e => { e.target.style.borderColor = C.navy; e.target.style.boxShadow = "0 0 0 3px rgba(0,51,102,0.08)"; }}
                    onBlur={e => { e.target.style.borderColor = C.border; e.target.style.boxShadow = "none"; }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 6 }}>
                    Nominal Dibayar <span style={{ color: C.red }}>*</span>
                  </label>
                  <div style={{ position: "relative" }}>
                    <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: C.muted, pointerEvents: "none" }}>Rp</span>
                    <input
                      type="number"
                      value={amountPaid}
                      onChange={e => setAmountPaid(e.target.value)}
                      min={1}
                      required
                      style={{ ...inputStyle, paddingLeft: 32 }}
                      onFocus={e => { e.target.style.borderColor = C.navy; e.target.style.boxShadow = "0 0 0 3px rgba(0,51,102,0.08)"; }}
                      onBlur={e => { e.target.style.borderColor = C.border; e.target.style.boxShadow = "none"; }}
                    />
                  </div>
                  <p style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>
                    {fmt(parseFloat(amountPaid || "0"))}
                  </p>
                </div>
              </div>

              {/* Kas Tujuan */}
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 6 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                    <Wallet size={13} color={C.navy} /> Masuk ke Kas
                  </span>
                </label>
                {cashAccounts.length === 0 ? (
                  <div style={{ padding: "9px 12px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12, color: C.muted, background: "var(--surface-subtle)" }}>
                    Memuat akun kas...
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {cashAccounts.map(a => (
                      <label key={a.id} style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "10px 14px", borderRadius: 8, cursor: "pointer",
                        border: `1.5px solid ${cashAccountId === a.id ? C.navy : C.border}`,
                        background: cashAccountId === a.id ? C.navyLight : "var(--surface)",
                        transition: "all 0.15s",
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <input
                            type="radio"
                            name="cash_account"
                            value={a.id}
                            checked={cashAccountId === a.id}
                            onChange={() => setCashAccountId(a.id)}
                            style={{ accentColor: C.navy }}
                          />
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{a.name}</div>
                            <div style={{ fontSize: 11, color: C.muted }}>{ACCOUNT_TYPE_LABEL[a.type] ?? a.type}</div>
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: cashAccountId === a.id ? C.navy : C.mid }}>
                            {fmt(a.balance)}
                          </div>
                          <div style={{ fontSize: 10, color: C.muted }}>saldo saat ini</div>
                        </div>
                      </label>
                    ))}
                    <label style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "10px 14px", borderRadius: 8, cursor: "pointer",
                      border: `1.5px solid ${cashAccountId === "" ? C.border : C.border}`,
                      background: cashAccountId === "" ? "var(--surface-subtle)" : "var(--surface)",
                    }}>
                      <input
                        type="radio"
                        name="cash_account"
                        value=""
                        checked={cashAccountId === ""}
                        onChange={() => setCashAccountId("")}
                        style={{ accentColor: C.navy }}
                      />
                      <div style={{ fontSize: 13, color: C.muted }}>Tidak masuk ke kas manapun (catat saja)</div>
                    </label>
                  </div>
                )}
              </div>

              {/* Metode pembayaran */}
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 6 }}>
                  Metode Pembayaran
                </label>
                <select aria-label="Metode pembayaran"
                  value={paymentMethod}
                  onChange={e => setPaymentMethod(e.target.value)}
                  style={{ ...inputStyle, background: "var(--surface)" }}
                >
                  <option value="transfer_bank">Transfer Bank</option>
                  <option value="cash">Cash / Tunai</option>
                  <option value="qris">QRIS</option>
                  <option value="cek">Cek</option>
                  <option value="giro">Giro</option>
                </select>
              </div>

              {/* Ref number + bank */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 6 }}>
                    No. Referensi / TF
                  </label>
                  <input
                    type="text"
                    value={refNumber}
                    onChange={e => setRefNumber(e.target.value)}
                    placeholder="misal: TF230612001"
                    style={inputStyle}
                    onFocus={e => { e.target.style.borderColor = C.navy; }}
                    onBlur={e => { e.target.style.borderColor = C.border; }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 6 }}>
                    Nama Bank
                  </label>
                  <input
                    type="text"
                    value={bankName}
                    onChange={e => setBankName(e.target.value)}
                    placeholder="misal: BCA, Mandiri"
                    style={inputStyle}
                    onFocus={e => { e.target.style.borderColor = C.navy; }}
                    onBlur={e => { e.target.style.borderColor = C.border; }}
                  />
                </div>
              </div>

              {/* Upload bukti */}
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 6 }}>
                  Bukti Transfer <span style={{ color: C.muted, fontWeight: 400 }}>(opsional — JPG, PNG, PDF, max 5MB)</span>
                </label>

                {proofFile ? (
                  <div style={{
                    border: `1.5px solid ${C.greenBorder}`, borderRadius: 10,
                    background: C.greenBg, padding: "12px 14px",
                    display: "flex", alignItems: "center", gap: 10,
                  }}>
                    {proofPreview ? (
                      <img src={proofPreview} alt="preview" style={{ width: 48, height: 48, borderRadius: 6, objectFit: "cover", border: `1px solid ${C.border}` }} />
                    ) : (
                      <div style={{ width: 48, height: 48, borderRadius: 6, background: "#E0F2FE", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <FileImage size={22} color="#0369A1" />
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {proofFile.name}
                      </div>
                      <div style={{ fontSize: 11, color: C.muted }}>
                        {(proofFile.size / 1024).toFixed(0)} KB
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={removeFile}
                      style={{ background: "transparent", border: "none", cursor: "pointer", color: C.red, padding: 4 }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ) : (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      border: `1.5px dashed ${C.border}`, borderRadius: 10,
                      padding: "20px", textAlign: "center", cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor = C.navy;
                      e.currentTarget.style.background = C.navyLight;
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor = C.border;
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <Upload size={20} style={{ color: C.muted, marginBottom: 6 }} />
                    <p style={{ fontSize: 12, color: C.mid, margin: 0 }}>
                      Klik untuk upload bukti transfer
                    </p>
                    <p style={{ fontSize: 11, color: C.muted, margin: "3px 0 0" }}>
                      Screenshot mutasi, struk ATM, atau PDF
                    </p>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={handleFileChange}
                  style={{ display: "none" }}
                />
              </div>

              {/* Catatan */}
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 6 }}>
                  Catatan
                </label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Catatan tambahan (opsional)"
                  style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
                  onFocus={e => { e.target.style.borderColor = C.navy; }}
                  onBlur={e => { e.target.style.borderColor = C.border; }}
                />
              </div>

              {/* Error */}
              {error && (
                <div style={{
                  background: C.redBg, border: `1px solid ${C.redBorder}`,
                  borderRadius: 8, padding: "10px 14px", fontSize: 12, color: C.red,
                }}>
                  {error}
                </div>
              )}

              {/* Footer */}
              <div style={{ display: "flex", gap: 10, paddingTop: 4 }}>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={submitting}
                  style={{
                    flex: 1, padding: "10px", borderRadius: 8, border: `1px solid ${C.border}`,
                    background: "var(--surface)", color: C.text, fontSize: 13, fontWeight: 500, cursor: "pointer",
                  }}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    flex: 2, padding: "10px", borderRadius: 8, border: "none",
                    background: submitting ? "#94A3B8" : C.navy,
                    color: "var(--surface)", fontSize: 13, fontWeight: 600,
                    cursor: submitting ? "not-allowed" : "pointer",
                    transition: "background 0.15s",
                  }}
                >
                  {submitting ? "Menyimpan..." : "Tandai Terbayar"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Portal wrapper ───────────────────────────────────────────────────────────

export function TerminPaymentModal(props: Props) {
  const [mounted, mount] = useReducer(() => true, false);
  useEffect(mount, []);
  if (!mounted) return null;
  return createPortal(<TerminPaymentModalContent {...props} />, document.body);
}
