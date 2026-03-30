"use client";

import { useState } from "react";
import {
  FiFolder,
  FiFile,
  FiChevronRight,
  FiChevronDown,
  FiAlertTriangle,
} from "react-icons/fi";
import type { ZipAnalysis, ZipTreeNode } from "@/lib/zip-analyzer";
import { formatSize } from "@/lib/zip-analyzer";

interface FileTreePreviewProps {
  analysis: ZipAnalysis;
}

export function FileTreePreview({ analysis }: FileTreePreviewProps) {
  const { stats, tree } = analysis;

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatCard value={stats.directories} label="Folders" />
        <StatCard value={stats.textFiles} label="Text files" color="text-green-500" />
        <StatCard value={stats.binaryFiles} label="Binary files" color="text-yellow-500" />
        <StatCard value={formatSize(stats.totalSize)} label="Total size" />
      </div>

      {/* Large file warning */}
      {stats.largeFiles.length > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-yellow-500/20 bg-yellow-500/5 px-3 py-2.5">
          <FiAlertTriangle size={14} className="mt-0.5 shrink-0 text-yellow-500" />
          <div className="text-xs text-yellow-600 dark:text-yellow-400">
            <p className="font-medium">Large files detected:</p>
            {stats.largeFiles.map((f) => (
              <p key={f.path} className="mt-0.5 font-mono">
                {f.path} ({formatSize(f.size)})
              </p>
            ))}
          </div>
        </div>
      )}

      {/* File tree */}
      <div className="max-h-[400px] overflow-y-auto rounded-lg border border-canvas-border bg-canvas-bg p-2">
        {tree.children.length === 0 ? (
          <p className="py-4 text-center text-xs text-canvas-muted">Empty archive</p>
        ) : (
          tree.children.map((node) => (
            <TreeNodeRow key={node.path} node={node} depth={0} />
          ))
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Stat card                                                          */
/* ------------------------------------------------------------------ */

function StatCard({
  value,
  label,
  color,
}: {
  value: number | string;
  label: string;
  color?: string;
}) {
  return (
    <div className="rounded-lg border border-canvas-border px-3 py-2.5">
      <p className={`text-base font-bold leading-tight tabular-nums ${color ?? "text-canvas-fg"}`}>
        {value}
      </p>
      <p className="mt-0.5 text-[9px] font-medium uppercase tracking-wider text-canvas-muted">
        {label}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tree node                                                          */
/* ------------------------------------------------------------------ */

function TreeNodeRow({ node, depth }: { node: ZipTreeNode; depth: number }) {
  const [expanded, setExpanded] = useState(depth === 0);

  if (node.isDirectory) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setExpanded((p) => !p)}
          className={`flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left transition-colors hover:bg-canvas-surface-hover ${
            node.isHidden ? "opacity-50" : ""
          }`}
          style={{ paddingLeft: depth * 16 + 6 }}
        >
          {expanded ? (
            <FiChevronDown size={12} className="shrink-0 text-canvas-muted" />
          ) : (
            <FiChevronRight size={12} className="shrink-0 text-canvas-muted" />
          )}
          <FiFolder size={13} className="shrink-0 text-blue-400" />
          <span className={`truncate text-[11px] text-canvas-fg ${node.isHidden ? "italic" : ""}`}>
            {node.name}
          </span>
          <span className="ml-auto text-[10px] text-canvas-muted">
            {node.children.length}
          </span>
        </button>
        {expanded &&
          node.children.map((child) => (
            <TreeNodeRow key={child.path} node={child} depth={depth + 1} />
          ))}
      </div>
    );
  }

  return (
    <div
      className={`flex items-center gap-1.5 rounded px-1.5 py-1 ${
        node.isBinary ? "opacity-40" : ""
      } ${node.isHidden ? "opacity-50" : ""}`}
      style={{ paddingLeft: depth * 16 + 6 + 16 }}
    >
      <FiFile size={12} className="shrink-0 text-canvas-muted" />
      <span className={`truncate text-[11px] text-canvas-fg ${node.isHidden ? "italic" : ""}`}>
        {node.name}
      </span>
      {node.isBinary && (
        <span className="shrink-0 text-[9px] text-canvas-muted">(binary)</span>
      )}
      <span className="ml-auto shrink-0 text-[10px] tabular-nums text-canvas-muted">
        {formatSize(node.size)}
      </span>
    </div>
  );
}
