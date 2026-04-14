"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { FiCheck, FiAlertTriangle, FiInfo, FiX } from "react-icons/fi";
import { Z_INDEX } from "@/lib/z-index";

type ToastVariant = "success" | "error" | "info";

interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
}

let toasts: Toast[] = [];
let nextId = 0;
const listeners = new Set<() => void>();
function notify() { listeners.forEach((l) => l()); }

export function showToast(message: string, variant: ToastVariant = "info") {
  const id = nextId++;
  toasts = [...toasts, { id, message, variant }];
  notify();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    notify();
  }, 3500);
}

function subscribe(cb: () => void) { listeners.add(cb); return () => { listeners.delete(cb); }; }
function getSnapshot() { return toasts; }

const VARIANT_STYLE: Record<ToastVariant, string> = {
  success: "border-green-500/20 bg-green-500/5 text-green-600 dark:text-green-400",
  error: "border-red-500/20 bg-red-500/5 text-red-500 dark:text-red-400",
  info: "border-blue-500/20 bg-blue-500/5 text-blue-500 dark:text-blue-400",
};

const VARIANT_ICON: Record<ToastVariant, React.ReactNode> = {
  success: <FiCheck size={14} />,
  error: <FiAlertTriangle size={14} />,
  info: <FiInfo size={14} />,
};

export function ToastContainer() {
  const list = useSyncExternalStore(subscribe, getSnapshot, () => []);

  if (list.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 flex flex-col gap-2" style={{ zIndex: Z_INDEX.TOAST }}>
      {list.map((t) => (
        <div
          key={t.id}
          className={`flex items-center gap-2 rounded-md border px-4 py-2.5 text-xs font-medium shadow-lg backdrop-blur-sm animate-fade-slide-in ${VARIANT_STYLE[t.variant]}`}
        >
          {VARIANT_ICON[t.variant]}
          {t.message}
        </div>
      ))}
    </div>
  );
}
