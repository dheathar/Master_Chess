import { useAuthStore } from "../store/useAuthStore";

export type SidebarView = "dashboard" | "library" | "model" | "progress" | "prescription" | "drill";

// Grouped so the nav itself teaches the loop: your material → diagnosis → training.
const NAV_GROUPS: Array<{ title: string; items: Array<{ key: SidebarView; label: string; icon: string }> }> = [
  {
    title: "Your games",
    items: [
      { key: "dashboard", label: "Games", icon: "▦" },
      { key: "library", label: "Library", icon: "♜" },
    ],
  },
  {
    title: "Diagnosis",
    items: [
      { key: "progress", label: "Progress", icon: "◆" },
      { key: "model", label: "Player Model", icon: "◉" },
    ],
  },
  {
    title: "Training",
    items: [
      { key: "prescription", label: "Training Plan", icon: "☷" },
      { key: "drill", label: "Drills", icon: "♟" },
    ],
  },
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
      <div className="sidebar-brand" data-tour="brand">
        <span className="sidebar-brand-glyph">♔</span>
        <div>
          <div className="sidebar-brand-name">Master Chess</div>
          <div className="sidebar-brand-tagline">Diagnose · Explain · Prescribe</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {NAV_GROUPS.map((group) => (
          <div key={group.title} className="sidebar-nav-group">
            <div className="sidebar-nav-group-title">{group.title}</div>
            {group.items.map((item) => (
              <button
                key={item.key}
                type="button"
                data-tour={`nav-${item.key}`}
                className={`sidebar-nav-item ${active === item.key ? "active" : ""}`}
                onClick={() => onNavigate(item.key)}
              >
                <span className="sidebar-nav-icon">{item.icon}</span>
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        ))}
      </nav>

      <div className="sidebar-footer">
        <button type="button" className="sidebar-upload-btn" data-tour="upload" onClick={onUpload}>
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
