"use client";

import { useState, useEffect, FormEvent } from "react";
import { isAdminUnlocked, tryUnlockAdmin } from "@/lib/adminAuth";

export default function AdminGate({ children }: { children: React.ReactNode }) {
  const [unlocked, setUnlocked] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);

  useEffect(() => {
    if (isAdminUnlocked()) setUnlocked(true);
  }, []);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (tryUnlockAdmin(pin)) {
      setUnlocked(true);
      setError(false);
    } else {
      setError(true);
      setPin("");
    }
  }

  if (unlocked) return <>{children}</>;

  return (
    <div style={{ background: "var(--bg-page)", minHeight: "calc(100vh - 56px)" }}
      className="flex items-center justify-center px-4">
      <form onSubmit={handleSubmit}
        className="w-full max-w-xs rounded-xl border p-6"
        style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
        <p className="text-sm font-semibold mb-3" style={{ color: "var(--text-secondary)" }}>
          กรุณากรอกรหัส PIN
        </p>
        <input
          type="password"
          inputMode="numeric"
          autoFocus
          value={pin}
          onChange={(e) => { setPin(e.target.value); setError(false); }}
          className="w-full px-3 py-2 rounded-lg text-sm border mb-2"
          style={{ borderColor: error ? "#e11d48" : "var(--border)", background: "var(--bg-page)", color: "var(--text-primary)" }}
          placeholder="PIN"
        />
        {error && <p className="text-xs mb-2" style={{ color: "#e11d48" }}>รหัสไม่ถูกต้อง</p>}
        <button type="submit"
          className="w-full py-2 rounded-lg text-xs font-semibold"
          style={{ background: "var(--accent)", color: "#fff" }}>
          ยืนยัน
        </button>
      </form>
    </div>
  );
}
