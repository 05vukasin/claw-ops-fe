"use client";

import { Suspense } from "react";
import { CanvasStage } from "@/components/canvas";
import { FleetSummaryBar } from "@/components/servers";
import { useServers } from "@/lib/use-servers";
import { WorkspacePanel } from "./workspace-panel";
import { NewServerButton } from "./new-server-button";

export default function ServersPage() {
  const { servers, moveServer, refresh } = useServers();

  return (
    <>
      <CanvasStage servers={servers} onMoveServer={moveServer} />
      <FleetSummaryBar />

      {servers.length === 0 && (
        <main className="pointer-events-none flex min-h-[calc(100vh-3rem)] flex-col items-center justify-center px-4">
          <div className="surface-overlay max-w-md rounded-md px-8 py-10 text-center">
            <h1 className="text-lg font-medium tracking-tight text-canvas-fg">
              Servers
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-canvas-muted">
              Click the + button to add your first server to the canvas.
            </p>
            <div className="mt-6 flex items-center justify-center gap-3">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-canvas-fg opacity-20" />
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-canvas-fg opacity-20" />
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-canvas-fg opacity-20" />
            </div>
          </div>
        </main>
      )}

      <Suspense>
        <WorkspacePanel onRefresh={refresh} />
      </Suspense>
      <NewServerButton onCreated={refresh} />
    </>
  );
}
