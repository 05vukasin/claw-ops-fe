"use client";

import type { ReactNode } from "react";
import { AuthGuard } from "@/components/auth";

export default function EmployeeLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard>
      <div className="flex h-dvh flex-col bg-[#0d1117] text-[#e6edf3]">
        {children}
      </div>
    </AuthGuard>
  );
}
