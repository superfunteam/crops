import { useEffect, useState } from "react";
import {
  BarChart3,
  Building2,
  Check,
  Clock3,
  CreditCard,
  FolderOpen,
  Leaf,
  LogOut,
  Menu,
  Settings,
  Users,
  WifiOff,
  X,
} from "lucide-react";
import { useCrops } from "./useCrops";
import type { Page } from "./types";
import { Brand, Select } from "./components/UI";
import { Editors, type Editor } from "./components/Editors";
import { Auth } from "./pages/Auth";
import { TimePage } from "./pages/Time";
import { ProjectsPage, ClientsPage, TeamPage } from "./pages/Manage";
import { ReportsPage } from "./pages/Reports";
import { SettingsPage } from "./pages/Settings";
import { duration, initials, time } from "./lib";
const navigation = [
  { page: "time", label: "My time", icon: Clock3 },
  { page: "reports", label: "Reports", icon: BarChart3 },
  { page: "projects", label: "Projects", icon: FolderOpen },
  { page: "clients", label: "Clients", icon: Building2 },
  { page: "team", label: "Team", icon: Users },
  { page: "billing", label: "Billing", icon: CreditCard },
] as const;
export default function App() {
  const crops = useCrops(),
    [page, setPage] = useState<Page>("time"),
    [editor, setEditor] = useState<Editor | null>(null),
    [mobileMenu, setMobileMenu] = useState(false);
  const s = crops.state;
  useEffect(() => {
    setEditor(null);
    setMobileMenu(false);
  }, [s?.user.id, s?.team.id]);
  if (crops.loading && !s)
    return (
      <div className="loading-screen">
        <Brand />
        <div className="loading-sprout">
          <Leaf size={24} />
        </div>
        <p>Getting your workspace ready…</p>
      </div>
    );
  if (!s)
    return (
      <>
        <Auth onSignedIn={crops.refresh} />
        {crops.error && (
          <div className="connection-banner" role="alert">
            <WifiOff size={16} />
            {crops.error}
            <button
              type="button"
              className="text-button"
              onClick={() => void crops.refresh()}
            >
              Retry
            </button>
          </div>
        )}
      </>
    );
  const navigate = (next: Page) => {
    setPage(next);
    setMobileMenu(false);
    crops.setError("");
  };
  const safePage =
    page === "billing" && s.team.role !== "admin" ? "time" : page;
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      {mobileMenu && (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobileMenu(false)}
        />
      )}
      <aside className={`sidebar ${mobileMenu ? "open" : ""}`}>
        <div className="sidebar-brand">
          <Brand />
          <button
            type="button"
            className="icon-button mobile-close"
            aria-label="Close navigation"
            onClick={() => setMobileMenu(false)}
          >
            <X size={18} />
          </button>
        </div>
        <div className="workspace-select">
          <span className="workspace-avatar">{initials(s.team.name)}</span>
          <div className="workspace-label">
            <small>Workspace</small>
            <Select
              name="workspace"
              aria-label="Switch workspace"
              disabled={crops.busy}
              value={s.team.id}
              onChange={(e) => {
                setEditor(null);
                crops.switchTeam(e.target.value);
                setMobileMenu(false);
              }}
            >
              {s.teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="nav-group-label">Workspace</div>
        <nav aria-label="Main navigation">
          {navigation
            .filter((n) => n.page !== "billing" || s.team.role === "admin")
            .map((n) => (
              <button
                type="button"
                key={n.page}
                className={`nav-item ${safePage === n.page ? "selected" : ""}`}
                aria-current={safePage === n.page ? "page" : undefined}
                onClick={() => navigate(n.page)}
              >
                <n.icon size={18} />
                <span>{n.label}</span>
                {n.page === "time" && s.runningEntry && (
                  <span className="live-dot" />
                )}
              </button>
            ))}
        </nav>
        <div className="sidebar-spacer" />
        {s.runningEntry && (
          <button
            type="button"
            className="sidebar-timer"
            onClick={() => navigate("time")}
          >
            <div>
              <span className="live-dot" />
              Timer running
            </div>
            <strong>{time(duration(s.runningEntry, crops.now), true)}</strong>
          </button>
        )}
        <div className="sidebar-growing">
          <Leaf size={18} />
          <span>Good things take time.</span>
        </div>
        <button
          type="button"
          className={`nav-item ${safePage === "settings" ? "selected" : ""}`}
          onClick={() => navigate("settings")}
        >
          <Settings size={18} />
          <span>Settings & apps</span>
        </button>
        <div className="profile">
          <div className="avatar">{initials(s.user.name)}</div>
          <div className="profile-name">
            <strong>{s.user.name}</strong>
            <span>
              {s.team.role === "admin" ? "Administrator" : "Team member"}
            </span>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label="Sign out"
            disabled={crops.busy}
            onClick={() =>
              void crops.signOut().catch((e) => crops.setError(e.message))
            }
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              type="button"
              className="icon-button menu-button"
              aria-label="Open navigation"
              aria-expanded={mobileMenu}
              onClick={() => setMobileMenu(!mobileMenu)}
            >
              <Menu size={20} />
            </button>
            <span className="breadcrumb-team">{s.team.name}</span>
            <span className="slash">/</span>
            <strong>
              {navigation.find((n) => n.page === safePage)?.label ||
                "Settings & apps"}
            </strong>
          </div>
          <button
            type="button"
            className={`sync-state ${!crops.online ? "offline" : ""}`}
            onClick={() => void crops.refresh()}
            title={
              crops.lastSync
                ? `Last synced ${new Date(crops.lastSync).toLocaleTimeString()}. Click to refresh.`
                : "Refresh"
            }
          >
            {crops.online ? <Check size={14} /> : <WifiOff size={14} />}
            <span>
              {crops.busy
                ? "Saving…"
                : crops.online
                  ? "All changes synced"
                  : "Connection lost"}
            </span>
          </button>
        </header>
        <main id="main" className="main-content">
          {crops.error && (
            <div className="error-banner" role="alert">
              <span>{crops.error}</span>
              <button
                type="button"
                className="icon-button"
                aria-label="Dismiss message"
                onClick={() => crops.setError("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {safePage === "time" && (
            <TimePage s={s} crops={crops} edit={setEditor} />
          )}
          {safePage === "projects" && (
            <ProjectsPage s={s} crops={crops} edit={setEditor} />
          )}
          {safePage === "clients" && (
            <ClientsPage s={s} crops={crops} edit={setEditor} />
          )}
          {safePage === "team" && (
            <TeamPage s={s} crops={crops} edit={setEditor} />
          )}
          {(safePage === "reports" || safePage === "billing") && (
            <ReportsPage
              key={safePage}
              s={s}
              crops={crops}
              billing={safePage === "billing"}
              edit={setEditor}
            />
          )}
          {safePage === "settings" && <SettingsPage s={s} edit={setEditor} />}
          <footer className="page-footer">
            <span>Less admin. More good work.</span>
            <span>Crops · Built for your team.</span>
          </footer>
        </main>
      </div>
      {editor && (
        <Editors
          editor={editor}
          s={s}
          crops={crops}
          onClose={() => setEditor(null)}
        />
      )}
      <datalist id="tasks">
        {[
          "Build",
          "Design",
          "Strategy",
          "Meeting",
          "Project management",
          "Admin",
        ].map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
    </div>
  );
}
