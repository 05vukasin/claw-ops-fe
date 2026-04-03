"use client";

import { useCallback, useEffect, useState } from "react";
import { FiChevronRight, FiRefreshCw, FiDatabase, FiFile } from "react-icons/fi";
import { listFilesApi, readFileApi, type SftpFile } from "@/lib/api";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface AgentMemorySectionProps {
  serverId: string;
  agentName: string;
}

export function AgentMemorySection({ serverId, agentName }: AgentMemorySectionProps) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<SftpFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>("");
  const [fileLoading, setFileLoading] = useState(false);

  const memoryPath = `/root/openclaw-agents/${agentName}/workspace/memory/`;

  const loadFiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listFilesApi(serverId, memoryPath);
      setFiles(result.filter((f) => !f.directory));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load memory files");
      setFiles([]);
    }
    setLoading(false);
  }, [serverId, agentName, memoryPath]);

  useEffect(() => {
    if (expanded) loadFiles();
  }, [expanded, loadFiles]);

  // Reset selected file when section collapses
  useEffect(() => {
    if (!expanded) {
      setSelectedFile(null);
      setFileContent("");
    }
  }, [expanded]);

  const handleFileClick = useCallback(
    async (filePath: string) => {
      if (selectedFile === filePath) {
        setSelectedFile(null);
        setFileContent("");
        return;
      }
      setSelectedFile(filePath);
      setFileLoading(true);
      try {
        const content = await readFileApi(serverId, filePath);
        setFileContent(content);
      } catch (err) {
        setFileContent(err instanceof Error ? err.message : "Failed to read file");
      }
      setFileLoading(false);
    },
    [serverId, selectedFile],
  );

  const totalSize = files.reduce((acc, f) => acc + f.size, 0);

  return (
    <div className="border-b border-canvas-border">
      <button
        type="button"
        onClick={() => setExpanded((p) => !p)}
        className="flex w-full items-center gap-2 px-5 py-2.5 text-left transition-colors hover:bg-canvas-surface-hover"
      >
        <FiDatabase size={13} className="text-canvas-muted" />
        <span className="flex-1 text-xs font-medium text-canvas-muted">Memory</span>
        {files.length > 0 && (
          <span className="mr-1 rounded-full bg-canvas-surface-hover px-1.5 py-0.5 text-[9px] font-medium text-canvas-muted">
            {files.length}
          </span>
        )}
        <FiChevronRight size={14} className={`text-canvas-muted chevron-rotate ${expanded ? "open" : ""}`} />
      </button>

      <div className={`animate-collapse ${expanded ? "open" : ""}`}>
        <div className="collapse-inner">
          <div className="border-t border-canvas-border px-5 py-4">
            {loading && files.length === 0 ? (
              <p className="text-[11px] text-canvas-muted">Loading...</p>
            ) : error ? (
              <p className="text-[11px] text-red-500">{error}</p>
            ) : (
              <div className="space-y-3">
                {/* Header: summary + refresh */}
                <div className="flex items-center justify-between">
                  {files.length > 0 && (
                    <span className="text-[10px] text-canvas-muted">
                      {files.length} file{files.length !== 1 ? "s" : ""}, {formatSize(totalSize)} total
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={loadFiles}
                    disabled={loading}
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-canvas-muted transition-colors hover:bg-canvas-surface-hover hover:text-canvas-fg disabled:opacity-50"
                  >
                    <FiRefreshCw size={11} className={loading ? "animate-spin" : ""} />
                    Refresh
                  </button>
                </div>

                {files.length === 0 ? (
                  <p className="text-[11px] text-canvas-muted">No memory files yet.</p>
                ) : (
                  <>
                    {/* File list */}
                    <div className="max-h-52 overflow-y-auto rounded-md border border-canvas-border">
                      {files.map((file) => (
                        <button
                          key={file.path}
                          type="button"
                          onClick={() => handleFileClick(file.path)}
                          className={`flex w-full items-center gap-2 border-b border-canvas-border px-3 py-2 text-left transition-colors last:border-b-0 hover:bg-canvas-surface-hover ${
                            selectedFile === file.path ? "bg-canvas-surface-hover" : ""
                          }`}
                        >
                          <FiFile size={12} className="shrink-0 text-canvas-muted" />
                          <span className="flex-1 truncate text-[11px] text-canvas-fg">{file.name}</span>
                          <span className="shrink-0 text-[10px] text-canvas-muted">{formatSize(file.size)}</span>
                        </button>
                      ))}
                    </div>

                    {/* File content preview */}
                    {selectedFile && (
                      <div className="rounded-md border border-canvas-border">
                        <div className="border-b border-canvas-border px-3 py-1.5">
                          <span className="text-[10px] font-medium text-canvas-muted">
                            {files.find((f) => f.path === selectedFile)?.name ?? selectedFile}
                          </span>
                        </div>
                        {fileLoading ? (
                          <p className="px-3 py-2 text-[11px] text-canvas-muted">Loading...</p>
                        ) : (
                          <pre className="max-h-[300px] overflow-auto p-3 font-mono text-[11px] leading-relaxed text-canvas-fg">
                            {fileContent}
                          </pre>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
