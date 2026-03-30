import JSZip from "jszip";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ZipEntry {
  path: string;
  name: string;
  isDirectory: boolean;
  size: number;
  isBinary: boolean;
  isHidden: boolean;
  content: string | null;
  base64: string | null;
}

export interface ZipTreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  isBinary: boolean;
  isHidden: boolean;
  size: number;
  children: ZipTreeNode[];
}

export interface ZipAnalysis {
  entries: ZipEntry[];
  tree: ZipTreeNode;
  stats: {
    totalFiles: number;
    textFiles: number;
    binaryFiles: number;
    directories: number;
    totalSize: number;
    largeFiles: ZipEntry[];
  };
}

/* ------------------------------------------------------------------ */
/*  Text detection                                                     */
/* ------------------------------------------------------------------ */

const TEXT_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".json", ".html", ".htm", ".css", ".scss", ".sass", ".less",
  ".md", ".mdx", ".txt", ".csv", ".tsv",
  ".yml", ".yaml", ".toml", ".xml", ".svg",
  ".sh", ".bash", ".zsh", ".fish",
  ".py", ".rb", ".go", ".rs", ".java", ".kt", ".scala",
  ".c", ".h", ".cpp", ".hpp", ".cc", ".cs",
  ".php", ".lua", ".pl", ".r", ".swift", ".dart",
  ".env", ".gitignore", ".dockerignore", ".editorconfig",
  ".eslintrc", ".prettierrc", ".babelrc",
  ".conf", ".cfg", ".ini", ".properties",
  ".sql", ".graphql", ".gql", ".proto",
  ".lock", ".log",
  ".vue", ".svelte", ".astro",
  ".makefile", ".cmake",
]);

const TEXT_FILENAMES = new Set([
  "dockerfile", "makefile", "rakefile", "gemfile",
  "procfile", "vagrantfile", "brewfile",
  "license", "readme", "changelog", "authors",
  ".gitignore", ".dockerignore", ".env",
]);

function isTextByExtension(name: string): boolean {
  const lower = name.toLowerCase();
  if (TEXT_FILENAMES.has(lower)) return true;
  const dotIdx = lower.lastIndexOf(".");
  if (dotIdx === -1) return false;
  return TEXT_EXTENSIONS.has(lower.slice(dotIdx));
}

function isTextByContent(bytes: Uint8Array): boolean {
  const sample = bytes.slice(0, 8192);
  for (let i = 0; i < sample.length; i++) {
    if (sample[i] === 0) return false;
  }
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(sample);
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/*  Path sanitization                                                  */
/* ------------------------------------------------------------------ */

function sanitizePath(raw: string): string {
  return raw
    .replace(/\\/g, "/")
    .split("/")
    .filter((seg) => seg !== ".." && seg !== "." && seg !== "")
    .join("/");
}

function isHiddenPath(path: string): boolean {
  return path.split("/").some((seg) => seg.startsWith("."));
}

/* ------------------------------------------------------------------ */
/*  Tree building                                                      */
/* ------------------------------------------------------------------ */

function buildTree(entries: ZipEntry[]): ZipTreeNode {
  const root: ZipTreeNode = {
    name: "/",
    path: "",
    isDirectory: true,
    isBinary: false,
    isHidden: false,
    size: 0,
    children: [],
  };

  const dirMap = new Map<string, ZipTreeNode>();
  dirMap.set("", root);

  function ensureDir(dirPath: string): ZipTreeNode {
    if (dirMap.has(dirPath)) return dirMap.get(dirPath)!;
    const parts = dirPath.split("/");
    const name = parts[parts.length - 1];
    const parentPath = parts.slice(0, -1).join("/");
    const parent = ensureDir(parentPath);
    const node: ZipTreeNode = {
      name,
      path: dirPath,
      isDirectory: true,
      isBinary: false,
      isHidden: isHiddenPath(dirPath),
      size: 0,
      children: [],
    };
    parent.children.push(node);
    dirMap.set(dirPath, node);
    return node;
  }

  for (const entry of entries) {
    if (entry.isDirectory) {
      ensureDir(entry.path.replace(/\/$/, ""));
      continue;
    }
    const slashIdx = entry.path.lastIndexOf("/");
    const parentPath = slashIdx === -1 ? "" : entry.path.slice(0, slashIdx);
    const parent = ensureDir(parentPath);
    parent.children.push({
      name: entry.name,
      path: entry.path,
      isDirectory: false,
      isBinary: entry.isBinary,
      isHidden: entry.isHidden,
      size: entry.size,
      children: [],
    });
  }

  // Sort: directories first, then alphabetically
  function sortChildren(node: ZipTreeNode) {
    node.children.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const child of node.children) {
      if (child.isDirectory) sortChildren(child);
    }
  }
  sortChildren(root);

  return root;
}

/* ------------------------------------------------------------------ */
/*  Main analyzer                                                      */
/* ------------------------------------------------------------------ */

const LARGE_FILE_THRESHOLD = 1024 * 1024; // 1MB

export async function analyzeZip(buffer: ArrayBuffer): Promise<ZipAnalysis> {
  const zip = await JSZip.loadAsync(buffer);
  const entries: ZipEntry[] = [];

  let directories = 0;
  let textFiles = 0;
  let binaryFiles = 0;
  let totalSize = 0;
  const largeFiles: ZipEntry[] = [];

  const fileEntries = Object.values(zip.files);

  for (const file of fileEntries) {
    const path = sanitizePath(file.name);
    if (!path) continue;

    const name = path.split("/").pop() ?? path;
    const hidden = isHiddenPath(path);

    if (file.dir) {
      entries.push({
        path: path + "/",
        name,
        isDirectory: true,
        size: 0,
        isBinary: false,
        isHidden: hidden,
        content: null,
        base64: null,
      });
      directories++;
      continue;
    }

    const bytes = await file.async("uint8array");
    const size = bytes.length;
    totalSize += size;

    const isText = isTextByExtension(name) || isTextByContent(bytes);

    let content: string | null = null;
    let base64: string | null = null;

    if (isText) {
      content = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
      textFiles++;
    } else {
      // Store base64 for binary files
      base64 = await file.async("base64");
      binaryFiles++;
    }

    const entry: ZipEntry = {
      path,
      name,
      isDirectory: false,
      size,
      isBinary: !isText,
      isHidden: hidden,
      content,
      base64,
    };

    entries.push(entry);
    if (size > LARGE_FILE_THRESHOLD) largeFiles.push(entry);
  }

  return {
    entries,
    tree: buildTree(entries),
    stats: {
      totalFiles: textFiles + binaryFiles,
      textFiles,
      binaryFiles,
      directories,
      totalSize,
      largeFiles,
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Utilities                                                          */
/* ------------------------------------------------------------------ */

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
