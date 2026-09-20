/**
 * A GitHub repository as a workspace file system (see fs.ts), read straight
 * from the API — nothing is cloned.
 *
 * The whole tree comes from one recursive git/trees call, so listing and
 * quick-open cost nothing after that; file contents are fetched per blob and
 * kept for the session. Very large repositories come back truncated by GitHub,
 * in which case the deepest paths are simply missing.
 */
import { MAX_TEXT_BYTES, extOf, isImagePath, type FileContent, type FsEntry, type WorkspaceFs } from "./fs";
import { githubFetch, githubToken } from "./github";
import type { WorkspaceRef } from "./workspace";

const PREFIX = "github.com/";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export const isGithubWorkspace = (w: WorkspaceRef) => w.path.startsWith(PREFIX);

interface TreeItem {
  path: string;
  type: "blob" | "tree" | "commit";
  sha: string;
  size?: number;
}

/** null when GitHub isn't connected. */
export async function githubFsFor(w: WorkspaceRef): Promise<WorkspaceFs | null> {
  const token = await githubToken();
  if (!token) return null;
  const repo = w.path.slice(PREFIX.length);

  let tree: Promise<TreeItem[]> | null = null;
  const loadTree = () =>
    (tree ??= githubFetch(token, `/repos/${repo}/git/trees/HEAD?recursive=1`)
      .then((res) => res.json())
      .then((body: { tree: TreeItem[] }) => body.tree)
      .catch((e) => {
        tree = null; // let the next listing retry
        throw e;
      }));

  const contents = new Map<string, Promise<FileContent>>();

  const readBlob = async (file: string, item: TreeItem): Promise<FileContent> => {
    const size = item.size ?? 0;
    const image = isImagePath(file);
    if (size > (image ? MAX_IMAGE_BYTES : MAX_TEXT_BYTES)) return { kind: "too-large", size };
    const bytes = new Uint8Array(await (await githubFetch(token, `/repos/${repo}/git/blobs/${item.sha}`, "application/vnd.github.raw+json")).arrayBuffer());
    if (image) {
      const ext = extOf(file);
      return { kind: "image", size, url: URL.createObjectURL(new Blob([bytes], { type: ext === "svg" ? "image/svg+xml" : `image/${ext}` })) };
    }
    if (bytes.subarray(0, 8000).includes(0)) return { kind: "binary", size };
    return { kind: "text", size, text: new TextDecoder().decode(bytes) };
  };

  return {
    async list(dir) {
      const prefix = dir ? `${dir}/` : "";
      const entries: FsEntry[] = [];
      for (const item of await loadTree()) {
        if (!item.path.startsWith(prefix) || item.path.indexOf("/", prefix.length) >= 0) continue;
        entries.push({ name: item.path.slice(prefix.length), path: item.path, kind: item.type === "blob" ? "file" : "dir" });
      }
      // Folders first, then by name — the same order the local backends use.
      return entries.sort((a, b) => (a.kind !== b.kind ? (a.kind === "dir" ? -1 : 1) : a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true })));
    },

    async read(file) {
      const item = (await loadTree()).find((i) => i.path === file && i.type === "blob");
      if (!item) throw new Error(`No such file: ${file}`);
      let content = contents.get(item.sha);
      if (!content) {
        content = readBlob(file, item);
        contents.set(item.sha, content);
        content.catch(() => contents.delete(item.sha));
      }
      return content;
    },
  };
}
