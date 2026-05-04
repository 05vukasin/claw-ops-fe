"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getUser } from "@/lib/auth";
import { AuditLogsView } from "./_audit/AuditLogsView";
import { ContainerLogsView } from "./_container/ContainerLogsView";

type TabId = "audit" | "container";

const TABS: ReadonlyArray<{ id: TabId; label: string }> = [
  { id: "audit", label: "Audit Logs" },
  { id: "container", label: "Container Logs" },
];

export default function LogsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [currentUser] = useState<ReturnType<typeof getUser>>(() => getUser());

  useEffect(() => {
    if (currentUser && currentUser.role !== "ADMIN") router.replace("/");
  }, [router, currentUser]);

  const initialTab: TabId = searchParams?.get("tab") === "container" ? "container" : "audit";
  const [tab, setTab] = useState<TabId>(initialTab);

  function selectTab(next: TabId) {
    setTab(next);
    const params = new URLSearchParams(Array.from(searchParams?.entries() ?? []));
    if (next === "audit") {
      params.delete("tab");
    } else {
      params.set("tab", next);
    }
    const qs = params.toString();
    router.replace(`/logs${qs ? `?${qs}` : ""}`);
  }

  if (!currentUser || currentUser.role !== "ADMIN") return null;

  return (
    <div>
      <div className="mx-auto max-w-7xl px-4 pt-6">
        <div role="tablist" className="mb-2 flex items-center gap-1 border-b border-canvas-border">
          {TABS.map((t) => {
            const active = t.id === tab;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={active}
                onClick={() => selectTab(t.id)}
                className={
                  "relative -mb-px px-4 py-2 text-sm font-medium transition-colors " +
                  (active
                    ? "text-canvas-fg border-b-2 border-canvas-fg"
                    : "text-canvas-muted hover:text-canvas-fg border-b-2 border-transparent")
                }
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>
      {tab === "audit" ? <AuditLogsView /> : <ContainerLogsView />}
    </div>
  );
}
