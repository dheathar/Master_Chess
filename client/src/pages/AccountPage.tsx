import { useState } from "react";
import * as api from "../api";
import { useAuthStore } from "../store/useAuthStore";

const DELETE_CONFIRMATION_TEXT = "DELETE";

export function AccountPage() {
  const { user, logout } = useAuthStore();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function onExport() {
    setExporting(true);
    setExportError(null);
    try {
      const data = await api.exportMyData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `master-chess-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setExporting(false);
    }
  }

  async function onDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.deleteMyAccount();
      await logout();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Delete failed.");
      setDeleting(false);
    }
  }

  return (
    <div className="page">
      <header className="page-header" style={{ display: "block" }}>
        <div className="dashboard-header-eyebrow">account</div>
        <h1 style={{ fontSize: 28 }}>Account &amp; data</h1>
        <p className="muted mono" style={{ margin: "6px 0 0", fontSize: 12.5, textTransform: "uppercase" }}>
          {user?.email}
        </p>
      </header>

      <main className="page-content" style={{ maxWidth: 640 }}>
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-label-row">
            <span className="card-eyebrow">Export your data</span>
          </div>
          <p style={{ fontSize: 13.5, color: "var(--text-2)", margin: "0 0 14px" }}>
            Download every game, move, analysis, and skill score linked to your account as a single JSON file.
          </p>
          {exportError ? <p className="error-text" style={{ marginBottom: 10 }}>{exportError}</p> : null}
          <button type="button" className="btn-ghost" onClick={onExport} disabled={exporting}>
            {exporting ? "Preparing…" : "Download my data"}
          </button>
        </div>

        <div className="card" style={{ borderColor: "var(--blunder)" }}>
          <div className="card-label-row" style={{ background: "var(--blunder)" }}>
            <span className="card-eyebrow" style={{ color: "#fff" }}>
              Delete account
            </span>
          </div>
          <p style={{ fontSize: 13.5, color: "var(--text-2)", margin: "0 0 14px" }}>
            Permanently erases your games, moves, analyses, skill scores, and evidence. This cannot be undone. Type{" "}
            <strong className="mono">{DELETE_CONFIRMATION_TEXT}</strong> to confirm.
          </p>
          <div style={{ display: "flex", gap: 10 }}>
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={DELETE_CONFIRMATION_TEXT}
              style={{ flex: 1 }}
            />
            <button
              type="button"
              className="btn-primary"
              style={{ background: "var(--blunder)", marginTop: 0 }}
              disabled={confirmText !== DELETE_CONFIRMATION_TEXT || deleting}
              onClick={onDelete}
            >
              {deleting ? "Deleting…" : "Delete my account"}
            </button>
          </div>
          {deleteError ? <p className="error-text" style={{ marginTop: 10 }}>{deleteError}</p> : null}
        </div>
      </main>
    </div>
  );
}
