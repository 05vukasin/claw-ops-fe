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

/**
 * Load optional addons (WebGL for performance, WebLinks for clickable URLs).
 * Call after term.open().
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function loadTerminalAddons(term: any) {
  // WebGL renderer — GPU accelerated, massive perf boost on large output
  import("@xterm/addon-webgl")
    .then(({ WebglAddon }) => {
      try { term.loadAddon(new WebglAddon()); } catch { /* canvas fallback */ }
    })
    .catch(() => {});

  // Clickable URLs
  import("@xterm/addon-web-links")
    .then(({ WebLinksAddon }) => {
      term.loadAddon(new WebLinksAddon());
    })
    .catch(() => {});
}
