"use client";

import type { ReactNode } from "react";
import { AuthGuard } from "@/components/auth";

export default function EmployeeLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard>
      <div className="flex h-dvh flex-col overflow-hidden bg-canvas-bg text-canvas-fg">
        {children}
      </div>
    </AuthGuard>
  );
}
