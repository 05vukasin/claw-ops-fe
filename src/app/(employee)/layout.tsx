"use client";

import type { ReactNode } from "react";
import { AuthGuard } from "@/components/auth";
import { Header } from "@/components/layout";

export default function EmployeeLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard>
      <Header />
      <div className="flex h-dvh flex-col overflow-hidden bg-canvas-bg pt-12 text-canvas-fg">
        {children}
      </div>
    </AuthGuard>
  );
}
