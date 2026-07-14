import { useEffect, useState } from "react";
import { useAuthStore } from "./store/useAuthStore";
import { AuthPage } from "./pages/AuthPage";
import { DashboardPage } from "./pages/DashboardPage";
import { UploadPage } from "./pages/UploadPage";
import { GameReviewPage } from "./pages/GameReviewPage";
import { PlayerModelPage } from "./pages/PlayerModelPage";
import { LibraryPage } from "./pages/LibraryPage";
import { AccountPage } from "./pages/AccountPage";
import { DrillPage } from "./pages/DrillPage";
import { TrainingPlanPage } from "./pages/TrainingPlanPage";
import { ProgressPage } from "./pages/ProgressPage";
import { Sidebar, type SidebarView } from "./components/Sidebar";
import { HelpLayer } from "./help/HelpLayer";
import type { TourNav } from "./help/tourSteps";

function viewForSidebar(view: SidebarView): View {
  switch (view) {
    case "dashboard":
      return { name: "dashboard" };
    case "library":
      return { name: "library" };
    case "model":
      return { name: "model" };
    case "progress":
      return { name: "progress" };
    case "prescription":
      return { name: "prescription" };
    case "drill":
      return { name: "drill" };
  }
}

type View =
  | { name: "dashboard" }
  | { name: "upload" }
  | { name: "review"; gameId: string }
  | { name: "library" }
  | { name: "model" }
  | { name: "progress" }
  | { name: "prescription" }
  | { name: "drill" }
  | { name: "account" };

export function App() {
  const { user, status, bootstrap } = useAuthStore();
  const [view, setView] = useState<View>({ name: "dashboard" });

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  if (status === "idle") {
    return <div className="page-loading">Loading Master Chess…</div>;
  }

  if (!user) {
    return <AuthPage />;
  }

  const sidebarActive: SidebarView =
    view.name === "review" || view.name === "upload" || view.name === "account" ? "dashboard" : view.name;

  const tourNavigate = (target: TourNav) => {
    if (target === "upload") setView({ name: "upload" });
    else setView(viewForSidebar(target));
  };

  return (
    <div className="app-shell">
      <Sidebar
        active={sidebarActive}
        onNavigate={(next) => setView(viewForSidebar(next))}
        onUpload={() => setView({ name: "upload" })}
        onAccount={() => setView({ name: "account" })}
      />
      <main className="app-main">
        {view.name === "upload" ? (
          <UploadPage onBack={() => setView({ name: "dashboard" })} onDone={(gameId) => setView({ name: "review", gameId })} />
        ) : view.name === "review" ? (
          <GameReviewPage gameId={view.gameId} onBack={() => setView({ name: "dashboard" })} />
        ) : view.name === "library" ? (
          <LibraryPage onOpenGame={(gameId) => setView({ name: "review", gameId })} />
        ) : view.name === "account" ? (
          <AccountPage />
        ) : view.name === "model" ? (
          <PlayerModelPage />
        ) : view.name === "progress" ? (
          <ProgressPage
            onNavigate={(next) => setView(viewForSidebar(next))}
            onUpload={() => setView({ name: "upload" })}
          />
        ) : view.name === "prescription" ? (
          <TrainingPlanPage />
        ) : view.name === "drill" ? (
          <DrillPage />
        ) : (
          <DashboardPage onOpenGame={(gameId) => setView({ name: "review", gameId })} onUpload={() => setView({ name: "upload" })} />
        )}
      </main>
      <HelpLayer
        screen={view.name}
        navigate={tourNavigate}
        openReview={(gameId) => setView({ name: "review", gameId })}
      />
    </div>
  );
}
