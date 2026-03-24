"use client";

import type { ReactNode } from "react";
import { Header, OverlayLayout } from "@/components/layout";
import { AuthGuard } from "@/components/auth";
import { CanvasBackground } from "@/components/canvas";

export default function MainLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard>
      <CanvasBackground />
      <Header />
      <OverlayLayout>{children}</OverlayLayout>
    </AuthGuard>
  );
}
