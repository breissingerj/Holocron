/**
 * Google Drive extension for pi — powered by Application Default Credentials
 *
 * No GCP project or credentials file required. Uses your personal Google
 * account via gcloud's built-in OAuth app.
 *
 * One-time setup:
 *   gcloud auth login --enable-gdrive-access --update-adc
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { GoogleAuth } from "google-auth-library";
import { google, drive_v3 } from "googleapis";

const ADC_SETUP_CMD = `gcloud auth login --enable-gdrive-access --update-adc`;

// --- Auth ---
// No singleton — always create fresh so re-auth is picked up without restarting pi.
async function getDrive(): Promise<drive_v3.Drive> {
  const auth = new GoogleAuth();
  const client = await auth.getClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return google.drive({ version: "v3", auth: client as any });
}

// --- Helpers ---

const GOOGLE_DOC   = "application/vnd.google-apps.document";
const GOOGLE_SHEET = "application/vnd.google-apps.spreadsheet";
const GOOGLE_SLIDE = "application/vnd.google-apps.presentation";
const GOOGLE_FOLDER = "application/vnd.google-apps.folder";

function mimeLabel(mime?: string | null): string {
  const map: Record<string, string> = {
    [GOOGLE_DOC]:    "Google Doc",
    [GOOGLE_SHEET]:  "Google Sheet",
    [GOOGLE_SLIDE]:  "Google Slides",
    [GOOGLE_FOLDER]: "Folder",
    "application/pdf": "PDF",
    "text/plain":      "Text",
    "text/csv":        "CSV",
    "application/json":"JSON",
  };
  return map[mime ?? ""] ?? mime ?? "Unknown";
}

function formatSize(bytes?: string | null): string {
  const n = Number(bytes ?? 0);
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

async function exportOrDownload(drive: drive_v3.Drive, fileId: string, mimeType: string): Promise<string> {
  // Google Workspace formats must be exported
  if ([GOOGLE_DOC, GOOGLE_SLIDE].includes(mimeType)) {
    const res = await drive.files.export({ fileId, mimeType: "text/plain" }, { responseType: "text" });
    return String(res.data);
  }
  if (mimeType === GOOGLE_SHEET) {
    const res = await drive.files.export({ fileId, mimeType: "text/csv" }, { responseType: "text" });
    return String(res.data);
  }
  // Everything else: direct download
  const res = await drive.files.get({ fileId, alt: "media" }, { responseType: "text" });
  return String(res.data);
}

function adcError(err: unknown): string | null {
  const msg = String(err);
  if (msg.includes("invalid_scope") || msg.includes("Request had insufficient authentication scopes")) {
    return (
      `❌ ADC token is missing Google Drive scopes.\n\nRe-run:\n\n  ${ADC_SETUP_CMD}`
    );
  }
  if (msg.includes("Could not load the default credentials") || msg.includes("credentials")) {
    return (
      `❌ Application Default Credentials not found.\n\nRun:\n\n  ${ADC_SETUP_CMD}`
    );
  }
  return null;
}

// --- Extension ---

export default function (pi: ExtensionAPI) {

  // ── gdrive_search ──────────────────────────────────────────────────────────
  pi.registerTool({
    name: "gdrive_search",
    label: "Search Google Drive",
    description:
      "Search for files in Google Drive by name or full-text content. Returns file IDs, names, types, sizes, and links.",
    parameters: Type.Object({
      query: Type.String({
        description:
          "Plain text search (searches name + content), or Drive query syntax e.g. \"name contains 'budget'\" or \"mimeType='application/pdf'\"",
      }),
      max_results: Type.Optional(Type.Number({ description: "Max files to return (default 20, max 100)", minimum: 1, maximum: 100 })),
      folder_id:   Type.Optional(Type.String({ description: "Restrict search to a specific folder ID" })),
    }),
    async execute(_id, params) {
      let drive: drive_v3.Drive;
      try { drive = await getDrive(); } catch (err) {
        return { content: [{ type: "text", text: adcError(err) ?? String(err) }], details: {} };
      }

      // Auto-wrap plain text queries in Drive syntax
      let q = params.query;
      if (!q.includes("contains") && !q.includes("=") && !q.includes("'")) {
        q = `(name contains '${q}' or fullText contains '${q}') and trashed = false`;
      } else {
        q += " and trashed = false";
      }
      if (params.folder_id) q += ` and '${params.folder_id}' in parents`;

      try {
        const res = await drive.files.list({
          q,
          pageSize: params.max_results ?? 20,
          fields: "files(id,name,mimeType,modifiedTime,size,webViewLink)",
          orderBy: "modifiedTime desc",
        });

        const files = res.data.files ?? [];
        if (files.length === 0) {
          return { content: [{ type: "text", text: "No files found." }], details: {} };
        }

        const rows = files.map((f) =>
          `• [${f.id}] ${f.name}  (${mimeLabel(f.mimeType)})  ${formatSize(f.size)}  ${f.modifiedTime?.slice(0, 10)}\n  ${f.webViewLink ?? ""}`
        );
        return {
          content: [{ type: "text", text: `Found ${files.length} file(s):\n\n${rows.join("\n")}` }],
          details: { files },
        };
      } catch (err) {
        return { content: [{ type: "text", text: adcError(err) ?? String(err) }], details: {} };
      }
    },
  });

  // ── gdrive_list ────────────────────────────────────────────────────────────
  pi.registerTool({
    name: "gdrive_list",
    label: "List Google Drive Folder",
    description: "List files in a Google Drive folder. Use folder_id='root' for My Drive root.",
    parameters: Type.Object({
      folder_id:   Type.Optional(Type.String({ description: "Folder ID to list (default: 'root')" })),
      max_results: Type.Optional(Type.Number({ description: "Max items to return (default 50)", minimum: 1, maximum: 200 })),
    }),
    async execute(_id, params) {
      let drive: drive_v3.Drive;
      try { drive = await getDrive(); } catch (err) {
        return { content: [{ type: "text", text: adcError(err) ?? String(err) }], details: {} };
      }

      const folderId = params.folder_id ?? "root";
      try {
        const res = await drive.files.list({
          q: `'${folderId}' in parents and trashed = false`,
          pageSize: params.max_results ?? 50,
          fields: "files(id,name,mimeType,modifiedTime,size,webViewLink)",
          orderBy: "folder,name",
        });

        const files = res.data.files ?? [];
        if (files.length === 0) return { content: [{ type: "text", text: "Folder is empty." }], details: {} };

        const rows = files.map((f) => {
          const icon = f.mimeType === GOOGLE_FOLDER ? "📁" : "📄";
          return `${icon} [${f.id}] ${f.name}  ${mimeLabel(f.mimeType)}  ${formatSize(f.size)}  ${f.modifiedTime?.slice(0, 10)}`;
        });
        return {
          content: [{ type: "text", text: `${files.length} item(s):\n\n${rows.join("\n")}` }],
          details: { files },
        };
      } catch (err) {
        return { content: [{ type: "text", text: adcError(err) ?? String(err) }], details: {} };
      }
    },
  });

  // ── gdrive_read ────────────────────────────────────────────────────────────
  pi.registerTool({
    name: "gdrive_read",
    label: "Read Google Drive File",
    description:
      "Read the text content of a Google Drive file by ID. Google Docs export as plain text, Sheets as CSV, all others downloaded directly.",
    parameters: Type.Object({
      file_id:   Type.String({ description: "File ID from gdrive_search or gdrive_list results" }),
      max_chars: Type.Optional(Type.Number({ description: "Truncate to this many characters (default 50000)", minimum: 100 })),
    }),
    async execute(_id, params) {
      let drive: drive_v3.Drive;
      try { drive = await getDrive(); } catch (err) {
        return { content: [{ type: "text", text: adcError(err) ?? String(err) }], details: {} };
      }

      try {
        const meta = await drive.files.get({
          fileId: params.file_id,
          fields: "id,name,mimeType,modifiedTime,size",
        });
        const { name, mimeType, modifiedTime } = meta.data;

        const content = await exportOrDownload(drive, params.file_id, mimeType ?? "");
        const limit = params.max_chars ?? 50_000;
        const truncated = content.length > limit;
        const output = truncated
          ? content.slice(0, limit) + `\n\n[... truncated at ${limit} chars — total ${content.length} chars]`
          : content;

        return {
          content: [{
            type: "text",
            text: `📄 **${name}** (${mimeLabel(mimeType)}) — ${modifiedTime?.slice(0, 10)}\n\n---\n\n${output}`,
          }],
          details: { fileId: params.file_id, name, mimeType, truncated },
        };
      } catch (err) {
        return { content: [{ type: "text", text: adcError(err) ?? String(err) }], details: {} };
      }
    },
  });

  // ── /gdrive command ────────────────────────────────────────────────────────
  pi.registerCommand("gdrive", {
    description: "Google Drive: show ADC auth status and setup help",
    handler: async (_args, ctx) => {
      let status = "⚠️  Unknown";
      let detail = "";
      try {
        const drive = await getDrive();
        await drive.files.list({ pageSize: 1, fields: "files(id)" });
        status = "✅ Authenticated (ADC)";
      } catch (err) {
        const msg = String(err);
        if (msg.includes("invalid_scope") || msg.includes("insufficient authentication scopes")) {
          status = "❌ ADC token missing Drive scopes";
          detail = `\nRe-run:\n\n  ${ADC_SETUP_CMD}`;
        } else if (msg.includes("credentials")) {
          status = "❌ ADC not configured";
          detail = `\nRun:\n\n  ${ADC_SETUP_CMD}`;
        } else {
          status = `❌ Error: ${msg.slice(0, 120)}`;
        }
      }

      ctx.ui.notify(
        [
          "🗂️  Google Drive Extension (ADC)",
          "",
          `Status: ${status}`,
          detail,
          "",
          "Tools: gdrive_search · gdrive_list · gdrive_read",
        ].join("\n"),
        status.startsWith("✅") ? "info" : "warning"
      );
    },
  });
}
