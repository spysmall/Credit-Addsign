"use client";

import { useAuth } from "@/components/AuthProvider";

/** Admin pages (Information, Credit Distribution, Summary) are for Super admins only. */
export default function AdminGate({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  if (auth.status === "allowed" && auth.isSuperAdmin) return <>{children}</>;

  return (
    <div style={{ background: "var(--bg-page)", minHeight: "calc(100vh - 56px)" }}
      className="flex items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border p-8 text-center flex flex-col items-center gap-3"
        style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl" style={{ background: "var(--accent-light)" }}>🔒</div>
        <h1 className="text-lg font-black" style={{ color: "var(--text-primary)" }}>หน้านี้สำหรับ Super admin</h1>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>บัญชีของคุณไม่มีสิทธิ์เข้าถึงหน้านี้ หากต้องการใช้งานติดต่อ Lead Team Multimedia</p>
      </div>
    </div>
  );
}
