"use client";

import { useEffect, useState, createContext, useContext, useCallback, useReducer } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, XCircle, X } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ToastType = "success" | "error";

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  showToast: (type: ToastType, message: string) => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [mounted, mount] = useReducer(() => true, false);
  useEffect(mount, [mount]);

  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((type: ToastType, message: string) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts(prev => [...prev, { id, type, message }]);
    if (type === "success") {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, 3000);
    }
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {mounted && createPortal(
        <div style={{
          position: "fixed", bottom: 24, right: 24,
          display: "flex", flexDirection: "column", gap: 10,
          zIndex: 9999, pointerEvents: "none",
        }}>
          {toasts.map(t => (
            <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
          ))}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  );
}

// ─── Single toast item ────────────────────────────────────────────────────────

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Trigger entrance animation
    const t = setTimeout(() => setVisible(true), 10);
    return () => clearTimeout(t);
  }, []);

  const isSuccess = toast.type === "success";

  return (
    <div
      style={{
        display: "flex", alignItems: "flex-start", gap: 12,
        padding: "14px 16px", borderRadius: 12,
        background: isSuccess ? "#F0FDF4" : "#FEF2F2",
        border: `1px solid ${isSuccess ? "#BBF7D0" : "#FECACA"}`,
        boxShadow: "0 4px 16px rgba(0,0,0,0.10)",
        pointerEvents: "all",
        minWidth: 280, maxWidth: 380,
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(12px)",
        transition: "opacity 0.2s ease, transform 0.2s ease",
      }}
    >
      {isSuccess
        ? <CheckCircle2 size={18} style={{ color: "#15803d", flexShrink: 0, marginTop: 1 }} />
        : <XCircle size={18} style={{ color: "#B91C1C", flexShrink: 0, marginTop: 1 }} />
      }
      <p style={{
        flex: 1, fontSize: 13, fontWeight: 500, lineHeight: 1.5,
        color: isSuccess ? "#14532d" : "#7F1D1D", margin: 0,
      }}>
        {toast.message}
      </p>
      <button
        onClick={() => onDismiss(toast.id)}
        style={{
          background: "none", border: "none", cursor: "pointer", padding: 2,
          color: isSuccess ? "#4ADE80" : "#F87171", flexShrink: 0,
          borderRadius: 4, display: "flex", alignItems: "center",
          transition: "color 0.1s",
        }}
        onMouseEnter={e => { e.currentTarget.style.color = isSuccess ? "#15803d" : "#B91C1C"; }}
        onMouseLeave={e => { e.currentTarget.style.color = isSuccess ? "#4ADE80" : "#F87171"; }}
      >
        <X size={14} />
      </button>
    </div>
  );
}
