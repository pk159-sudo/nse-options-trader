// ===== GitHub Contents API Storage =====
// Vercel has read-only filesystem — use GitHub repo as persistent storage.
// All data stored under data/ in the repo itself.
//
// Rate limit: 5000 req/hour (authenticated) — more than enough.
// Each save = 2 calls (GET + PUT), each load = 1 call (GET).

const GITHUB_API = "https://api.github.com";
const OWNER = "pk159-sudo";
const REPO = "nse-options-trader";

function getToken(): string {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN not set in environment");
  return token;
}

async function githubRequest(path: string, options: RequestInit = {}) {
  const token = getToken();
  const url = `${GITHUB_API}/repos/${OWNER}/${REPO}/contents/${path}`;

  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "nse-options-trader",
      ...options.headers,
    },
  });

  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub API ${res.status}: ${body.slice(0, 200)}`);
  }

  return res.json();
}

// Get file content from GitHub repo. Returns null if file doesn't exist.
export async function getFile(path: string): Promise<{ content: string; sha: string } | null> {
  const data = await githubRequest(path);
  if (!data) return null;
  if (Array.isArray(data)) return null; // directory listing, not a file
  return {
    content: Buffer.from(data.content, "base64").toString("utf-8"),
    sha: data.sha,
  };
}

// Write file to GitHub repo (create or update).
export async function putFile(path: string, content: string, sha?: string): Promise<void> {
  await githubRequest(path, {
    method: "PUT",
    body: JSON.stringify({
      message: `data: update ${path}`,
      content: Buffer.from(content, "utf-8").toString("base64"),
      sha: sha || undefined,
    }),
  });
}

// Append a line to a JSONL file. Returns last N lines for convenience.
export async function appendJsonl(
  path: string,
  line: string,
  returnLastN = 0
): Promise<Record<string, unknown>[]> {
  const existing = await getFile(path);
  let content: string;
  let sha: string | undefined;

  if (existing) {
    content = existing.content;
    sha = existing.sha;
  } else {
    content = "";
    sha = undefined;
  }

  // Append new line
  const updated = content + line + "\n";

  // Write back
  await putFile(path, updated, sha);

  // Return last N lines if requested
  if (returnLastN > 0) {
    const lines = updated
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    return lines
      .slice(-returnLastN)
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter(Boolean) as Record<string, unknown>[];
  }

  return [];
}

// List files in a directory path (just names, not full content).
export async function listFiles(path: string): Promise<string[]> {
  const data = await githubRequest(path);
  if (!data || !Array.isArray(data)) return [];
  return data.map((f: { name: string }) => f.name).sort();
}