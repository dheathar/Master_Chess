import { useAuthStore } from "../store/useAuthStore";

export type SidebarView = "dashboard" | "library" | "model" | "prescription" | "drill";

const NAV_ITEMS: Array<{ key: SidebarView; label: string; icon: string }> = [
  { key: "dashboard", label: "Games", icon: "▦" },
  { key: "library", label: "Library", icon: "♜" },
  { key: "model", label: "Player Model", icon: "◉" },
  { key: "prescription", label: "Training Plan", icon: "☷" },
  { key: "drill", label: "Drills", icon: "♟" },
];

export function Sidebar({
  active,
  onNavigate,
  onUpload,
  onAccount,
}: {
  active: SidebarView;
  onNavigate: (view: SidebarView) => void;
  onUpload: () => void;
  onAccount: () => void;
}) {
  const { user, logout } = useAuthStore();

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="sidebar-brand-glyph">♔</span>
        <div>
          <div className="sidebar-brand-name">Master Chess</div>
          <div className="sidebar-brand-tagline">Diagnose · Explain · Prescribe</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`sidebar-nav-item ${active === item.key ? "active" : ""}`}
            onClick={() => onNavigate(item.key)}
          >
            <span className="sidebar-nav-icon">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar-footer">
        <button type="button" className="sidebar-upload-btn" onClick={onUpload}>
          <span style={{ fontSize: 15, lineHeight: 1 }}>+</span> Upload games
        </button>
        <div className="sidebar-user">
          <div className="sidebar-user-avatar">{user?.displayName?.[0]?.toUpperCase() ?? "?"}</div>
          <div style={{ minWidth: 0 }}>
            <div className="sidebar-user-name">{user?.displayName}</div>
            <div className="sidebar-user-tier">{user?.tier}</div>
          </div>
          <button type="button" className="sidebar-logout" onClick={() => void logout()} title="Log out">
            ⏻
          </button>
        </div>
        <button type="button" className="sidebar-account-link" onClick={onAccount}>
          Account &amp; data
        </button>
      </div>
    </aside>
  );
}
