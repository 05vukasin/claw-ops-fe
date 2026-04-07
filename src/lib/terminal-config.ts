/**
 * Shared xterm.js configuration for all terminals in ClawOps.
 * Used by terminal-section.tsx and scripts-section.tsx TerminalPopup.
 */

import type { ITerminalOptions } from "@xterm/xterm";

export const TERMINAL_OPTIONS: ITerminalOptions = {
  cursorBlink: true,
  cursorStyle: "bar",
  cursorWidth: 2,
  cursorInactiveStyle: "outline",
  fontSize: 13,
  fontFamily: "'JetBrains Mono', 'Cascadia Code', 'Fira Code', Consolas, monospace",
  fontWeight: "400",
  fontWeightBold: "600",
  lineHeight: 1.35,
  letterSpacing: 0.5,
  scrollback: 10000,
  allowProposedApi: true,
  theme: {
    background: "#0d1117",
    foreground: "#e6edf3",
    cursor: "#79c0ff",
    cursorAccent: "#0d1117",
    selectionBackground: "#264f78",
    selectionForeground: "#ffffff",
    selectionInactiveBackground: "#264f7840",
    // Standard
    black: "#484f58",
    red: "#ff7b72",
    green: "#3fb950",
    yellow: "#d29922",
    blue: "#58a6ff",
    magenta: "#bc8cff",
    cyan: "#39c5cf",
    white: "#e6edf3",
    // Bright
    brightBlack: "#6e7681",
    brightRed: "#ffa198",
    brightGreen: "#56d364",
    brightYellow: "#e3b341",
    brightBlue: "#79c0ff",
    brightMagenta: "#d2a8ff",
    brightCyan: "#56d4dd",
    brightWhite: "#ffffff",
  },
};

/** Mobile variant — read-only output, no keyboard capture */
export const MOBILE_TERMINAL_OPTIONS: ITerminalOptions = {
  ...TERMINAL_OPTIONS,
  disableStdin: true,
  cursorBlink: false,
  cursorStyle: "underline",
  fontSize: 12,
  lineHeight: 1.3,
  scrollback: 5000,
};

/**
 * Load optional addons (WebGL for performance, WebLinks for clickable URLs).
 * Call after term.open().
 *
 * WebGL can silently fail on some GPUs/drivers leaving a black screen.
 * On failure or context loss, we dispose the addon and force a canvas re-render.
 * A global context counter prevents exhaustion when many terminals are open.
 */

let activeWebglCount = 0;
const MAX_WEBGL_CONTEXTS = 6; // Well under browser's ~16 limit

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function loadWebgl(term: any, allowRetry: boolean) {
  if (term._core?._isDisposed) return;
  if (activeWebglCount >= MAX_WEBGL_CONTEXTS) return; // Stay on canvas

  import("@xterm/addon-webgl")
    .then(({ WebglAddon }) => {
      if (term._core?._isDisposed) return;
      if (activeWebglCount >= MAX_WEBGL_CONTEXTS) return;

      let counted = false; // Prevent double-decrement
      const decrement = () => {
        if (counted) { counted = false; activeWebglCount = Math.max(0, activeWebglCount - 1); }
      };

      const addon = new WebglAddon();
      addon.onContextLoss(() => {
        decrement();
        try { addon.dispose(); } catch { /* already gone */ }
        // Force canvas renderer to repaint all rows
        try { term.refresh(0, term.rows - 1); } catch { /* noop */ }
        // One retry — context loss is often transient
        if (allowRetry) {
          setTimeout(() => loadWebgl(term, false), 500);
        }
      });

      try {
        term.loadAddon(addon);
        activeWebglCount++;
        counted = true;
        // Decrement when terminal is disposed (normal cleanup, no context loss)
        term.onDispose?.(() => decrement());
      } catch {
        try { addon.dispose(); } catch { /* noop */ }
        try { term.refresh(0, term.rows - 1); } catch { /* noop */ }
      }
    })
    .catch(() => { /* canvas renderer is fine */ });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function loadTerminalAddons(term: any) {
  // WebGL renderer — GPU accelerated, perf boost on large output.
  // Delayed 300ms so canvas renderer handles initial output first.
  setTimeout(() => loadWebgl(term, true), 300);

  // Clickable URLs
  import("@xterm/addon-web-links")
    .then(({ WebLinksAddon }) => {
      if (term._core?._isDisposed) return;
      term.loadAddon(new WebLinksAddon());
    })
    .catch(() => {});
}
