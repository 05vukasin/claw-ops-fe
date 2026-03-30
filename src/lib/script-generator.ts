import type { ZipAnalysis, ZipEntry } from "./zip-analyzer";

/* ------------------------------------------------------------------ */
/*  Options                                                            */
/* ------------------------------------------------------------------ */

export interface ScriptOptions {
  includeBinary: boolean;
  skipHidden: boolean;
  overwriteExisting: boolean;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function uniqueDelimiter(content: string): string {
  let delim = "CLAWOPS_EOF";
  let i = 0;
  while (content.includes(delim)) {
    delim = `CLAWOPS_EOF_${(i++).toString(16)}`;
  }
  return delim;
}

function shellQuotePath(p: string): string {
  return `"$TARGET_DIR/${p}"`;
}

/* ------------------------------------------------------------------ */
/*  Generator                                                          */
/* ------------------------------------------------------------------ */

export function generateBashScript(
  analysis: ZipAnalysis,
  options: ScriptOptions,
  zipFileName?: string,
): string {
  const lines: string[] = [];
  const { entries } = analysis;
  const { includeBinary, skipHidden, overwriteExisting } = options;

  const filtered = entries.filter((e) => {
    if (skipHidden && e.isHidden) return false;
    if (!includeBinary && e.isBinary && !e.isDirectory) return false;
    return true;
  });

  const textFiles = filtered.filter((e) => !e.isDirectory && !e.isBinary);
  const binaryFiles = filtered.filter((e) => !e.isDirectory && e.isBinary);
  const dirs = collectDirectories(filtered, skipHidden);
  const totalFiles = textFiles.length + binaryFiles.length;

  // ── Shebang + strict mode ──
  lines.push("#!/bin/bash");
  lines.push("set -euo pipefail");
  lines.push("");

  // ── Colors ──
  lines.push("# ── Colors ──");
  lines.push("GREEN='\\033[38;5;114m'");
  lines.push("LIME='\\033[38;5;118m'");
  lines.push("TEAL='\\033[38;5;43m'");
  lines.push("CYAN='\\033[38;5;87m'");
  lines.push("YELLOW='\\033[38;5;222m'");
  lines.push("RED='\\033[38;5;196m'");
  lines.push("DIM='\\033[2m'");
  lines.push("BOLD='\\033[1m'");
  lines.push("NC='\\033[0m'");
  lines.push("");

  // ── Helper functions ──
  lines.push("# ── Helpers ──");
  lines.push('step_ok()   { echo -e "  ${GREEN}✓${NC} $1"; }');
  lines.push('step_fail() { echo -e "  ${RED}✗${NC} $1"; }');
  lines.push("step_bar() {");
  lines.push("  local cur=$1 total=$2 label=$3");
  lines.push("  local filled=$((cur * 25 / total))");
  lines.push("  local empty=$((25 - filled))");
  lines.push("  local pct=$((cur * 100 / total))");
  lines.push('  printf "\\r  ${LIME}"');
  lines.push("  printf '█%.0s' $(seq 1 $filled) 2>/dev/null || true");
  lines.push('  printf "${DIM}"');
  lines.push("  printf '░%.0s' $(seq 1 $empty) 2>/dev/null || true");
  lines.push('  printf "${NC} ${DIM}%3d%%${NC}  ${TEAL}%s${NC}" "$pct" "$label"');
  lines.push("}");
  lines.push("");

  // ── Snoopie mascot + header ──
  lines.push("# ── Snoopie ──");
  lines.push("clear");
  lines.push('echo ""');
  lines.push('echo -e "  ${LIME} ▄▄▄▄▄▄▄ ${NC}"');
  lines.push('echo -e "  ${LIME} █ ${CYAN}◉ ${LIME}${CYAN}◉${LIME} █ ${NC}  ${BOLD}Snoopie${NC} ${DIM}v1.0${NC}"');
  lines.push('echo -e "  ${LIME} █  ${GREEN}▽${LIME}  █ ${NC}  ${DIM}ClawOps ZIP Deployer${NC}"');
  lines.push('echo -e "  ${LIME} █${GREEN}═════${LIME}█ ${NC}  ${DIM}' + (zipFileName ? `Source: ${zipFileName}` : "ZIP deployment script") + '${NC}"');
  lines.push('echo -e "  ${LIME}  ▀▀▀▀▀  ${NC}  ${DIM}' + `${totalFiles} files, ${dirs.length} directories` + '${NC}"');
  lines.push('echo ""');
  lines.push("sleep 0.3");
  lines.push("");

  // ── Interactive directory browser ──
  lines.push("# ── Target directory selection ──");
  lines.push('echo -e "  ${LIME}▌${NC} ${BOLD}Where should I deploy?${NC}"');
  lines.push('echo ""');
  lines.push("");
  lines.push("if [ $# -ge 1 ]; then");
  lines.push('  TARGET_DIR="$1"');
  lines.push('  echo -e "  ${DIM}target${NC}  ${CYAN}$TARGET_DIR${NC}"');
  lines.push("else");
  lines.push('  BROWSE_DIR="$(pwd)"');
  lines.push("");
  lines.push("  while true; do");
  lines.push('    echo -e "  ${DIM}Current:${NC} ${CYAN}${BROWSE_DIR}${NC}"');
  lines.push('    echo ""');
  lines.push("");
  lines.push("    # Collect subdirectories");
  lines.push("    DIRS=()");
  lines.push('    while IFS= read -r d; do');
  lines.push('      DIRS+=("$d")');
  lines.push('    done < <(find "$BROWSE_DIR" -maxdepth 1 -mindepth 1 -type d | sort)');
  lines.push("");
  lines.push("    # Display options");
  lines.push('    echo -e "    ${YELLOW}0${NC}  ${DIM}⬆  Go back${NC}"');
  lines.push("    for i in \"${!DIRS[@]}\"; do");
  lines.push('      echo -e "    ${TEAL}$((i+1))${NC}  $(basename "${DIRS[$i]}")"');
  lines.push("    done");
  lines.push('    echo ""');
  lines.push('    echo -e "    ${GREEN}d${NC}  ${GREEN}✓  Deploy here${NC}"');
  lines.push('    echo -e "    ${DIM}p${NC}  ${DIM}Type a custom path${NC}"');
  lines.push('    echo ""');
  lines.push('    echo -ne "  ${LIME}›${NC} Select: "');
  lines.push("    read SEL");
  lines.push('    echo ""');
  lines.push("");
  lines.push("    # Handle selection");
  lines.push('    if [ "$SEL" = "d" ] || [ "$SEL" = "D" ]; then');
  lines.push('      TARGET_DIR="$BROWSE_DIR"');
  lines.push("      break");
  lines.push('    elif [ "$SEL" = "p" ] || [ "$SEL" = "P" ]; then');
  lines.push('      echo -ne "  ${LIME}›${NC} Full path: "');
  lines.push("      read TARGET_DIR");
  lines.push('      [ -z "$TARGET_DIR" ] && { step_fail "No path given."; exit 1; }');
  lines.push("      break");
  lines.push('    elif [ "$SEL" = "0" ]; then');
  lines.push("      # Go up one level");
  lines.push('      PARENT="$(dirname "$BROWSE_DIR")"');
  lines.push('      if [ "$PARENT" = "$BROWSE_DIR" ]; then');
  lines.push('        echo -e "  ${YELLOW}⚠${NC} Already at root"');
  lines.push('        echo ""');
  lines.push("      else");
  lines.push('        BROWSE_DIR="$PARENT"');
  lines.push("      fi");
  lines.push("    elif [ \"$SEL\" -gt 0 ] 2>/dev/null && [ \"$SEL\" -le ${#DIRS[@]} ] 2>/dev/null; then");
  lines.push("      # Enter selected directory");
  lines.push('      BROWSE_DIR="${DIRS[$((SEL-1))]}"');
  lines.push("    else");
  lines.push('      echo -e "  ${RED}✗${NC} Invalid choice"');
  lines.push('      echo ""');
  lines.push("    fi");
  lines.push("  done");
  lines.push("fi");
  lines.push("");

  // ── Confirm ──
  lines.push('echo -e "  ${LIME}▌${NC} ${BOLD}Review${NC}"');
  lines.push('echo ""');
  lines.push(`echo -e "  \${DIM}source\${NC}     \${CYAN}${zipFileName ?? "archive.zip"}\${NC}"`);
  lines.push(`echo -e "  \${DIM}files\${NC}      \${CYAN}${totalFiles} files, ${dirs.length} directories\${NC}"`);
  lines.push('echo -e "  ${DIM}target${NC}     ${CYAN}$TARGET_DIR${NC}"');
  if (!overwriteExisting) {
    lines.push('echo -e "  ${DIM}mode${NC}       ${YELLOW}skip existing${NC}"');
  } else {
    lines.push('echo -e "  ${DIM}mode${NC}       ${CYAN}overwrite${NC}"');
  }
  lines.push('echo ""');
  lines.push('echo -ne "  ${LIME}›${NC} Deploy? ${DIM}(y/n)${NC}: "');
  lines.push("read CONFIRM");
  lines.push('[[ ! "$CONFIRM" =~ ^[Yy]$ ]] && { echo -e "\\n  ${YELLOW}Aborted.${NC}"; exit 0; }');
  lines.push('echo ""');
  lines.push("");

  // ── Provisioning header ──
  lines.push("# ══════════════════════════════════════════════");
  lines.push("# DEPLOYING");
  lines.push("# ══════════════════════════════════════════════");
  lines.push('echo -e "  ${LIME}▌${NC} ${BOLD}Deploying${NC}"');
  lines.push('echo ""');
  lines.push("");

  const totalSteps = (dirs.length > 0 ? 1 : 0) + totalFiles;
  let currentStep = 0;

  // ── Create target directory ──
  lines.push('mkdir -p "$TARGET_DIR"');
  lines.push("");

  // ── Directories ──
  if (dirs.length > 0) {
    currentStep++;
    lines.push(`step_bar ${currentStep} ${totalSteps} "Creating ${dirs.length} directories"`);
    for (const dir of dirs) {
      lines.push(`mkdir -p ${shellQuotePath(dir)}`);
    }
    lines.push('echo ""');
    lines.push('step_ok "Directory structure created"');
    lines.push("");
  }

  // ── Text files ──
  if (textFiles.length > 0) {
    lines.push("# ── Text files ──");
    lines.push("");
    for (const entry of textFiles) {
      currentStep++;
      const content = entry.content ?? "";
      const delim = uniqueDelimiter(content);
      const dest = shellQuotePath(entry.path);

      lines.push(`step_bar ${currentStep} ${totalSteps} "${entry.path}"`);

      if (!overwriteExisting) {
        lines.push(`if [ ! -f ${dest} ]; then`);
        lines.push(`cat > ${dest} << '${delim}'`);
        lines.push(content.endsWith("\n") ? content.slice(0, -1) : content);
        lines.push(delim);
        lines.push("fi");
      } else {
        lines.push(`cat > ${dest} << '${delim}'`);
        lines.push(content.endsWith("\n") ? content.slice(0, -1) : content);
        lines.push(delim);
      }
      lines.push("");
    }
  }

  // ── Binary files ──
  if (binaryFiles.length > 0) {
    lines.push("# ── Binary files (base64) ──");
    lines.push("");
    for (const entry of binaryFiles) {
      if (!entry.base64) continue;
      currentStep++;
      const dest = shellQuotePath(entry.path);
      const delim = uniqueDelimiter(entry.base64);

      lines.push(`step_bar ${currentStep} ${totalSteps} "${entry.path}"`);

      if (!overwriteExisting) {
        lines.push(`if [ ! -f ${dest} ]; then`);
        lines.push(`base64 -d > ${dest} << '${delim}'`);
        lines.push(entry.base64);
        lines.push(delim);
        lines.push("fi");
      } else {
        lines.push(`base64 -d > ${dest} << '${delim}'`);
        lines.push(entry.base64);
        lines.push(delim);
      }
      lines.push("");
    }
  }

  // ── Success ──
  lines.push('echo ""');
  lines.push('echo ""');
  lines.push('echo -e "  ${LIME} ▄▄▄▄▄▄▄ ${NC}"');
  lines.push('echo -e "  ${LIME} █ ${CYAN}◉ ${LIME}${CYAN}◉${LIME} █ ${NC}  ${GREEN}${BOLD}Deploy complete!${NC}"');
  lines.push('echo -e "  ${LIME} █  ${GREEN}◡${LIME}  █ ${NC}  ${CYAN}$TARGET_DIR${NC}"');
  lines.push(`echo -e "  \${LIME} █\${GREEN}═════\${LIME}█ \${NC}  \${DIM}${totalFiles} files written\${NC}"`);
  lines.push('echo -e "  ${LIME}  ▀▀▀▀▀  ${NC}"');
  lines.push('echo ""');
  lines.push("");

  // ── Quick verify ──
  lines.push("# ── Verify ──");
  lines.push('echo -e "  ${LIME}▌${NC} ${BOLD}Verification${NC}"');
  lines.push('echo ""');
  lines.push(`EXPECTED=${totalFiles}`);
  lines.push('ACTUAL=$(find "$TARGET_DIR" -type f | wc -l)');
  lines.push('if [ "$ACTUAL" -ge "$EXPECTED" ]; then');
  lines.push('  step_ok "Found $ACTUAL files (expected $EXPECTED)"');
  lines.push("else");
  lines.push('  echo -e "  ${YELLOW}⚠${NC} Found $ACTUAL files (expected $EXPECTED)"');
  lines.push("fi");
  lines.push('echo ""');
  lines.push("");

  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/*  Collect unique directory paths                                     */
/* ------------------------------------------------------------------ */

function collectDirectories(
  entries: ZipEntry[],
  skipHidden: boolean,
): string[] {
  const dirs = new Set<string>();

  for (const entry of entries) {
    if (entry.isDirectory) {
      const p = entry.path.replace(/\/$/, "");
      if (p) dirs.add(p);
      continue;
    }
    const slashIdx = entry.path.lastIndexOf("/");
    if (slashIdx > 0) {
      const parent = entry.path.slice(0, slashIdx);
      const parts = parent.split("/");
      for (let i = 1; i <= parts.length; i++) {
        const dir = parts.slice(0, i).join("/");
        if (skipHidden && dir.split("/").some((s) => s.startsWith("."))) continue;
        dirs.add(dir);
      }
    }
  }

  return [...dirs].sort();
}
