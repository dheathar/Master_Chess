import { useEffect, useState } from "react";
import * as api from "../api";
import { GuidedTour } from "./GuidedTour";
import { HelpChat } from "./HelpChat";
import type { TourNav } from "./tourSteps";

const TOUR_SEEN_KEY = "mc_tour_seen_v1";

/**
 * Owns the whole help experience: a floating launcher, a first-run guided tour,
 * the grounded chat assistant, and a one-click "demo game" loader that lets a
 * brand-new user watch a real analysis immediately.
 */
export function HelpLayer({
  screen,
  navigate,
  openReview,
}: {
  screen: string;
  navigate: (view: TourNav) => void;
  openReview: (gameId: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);
  const [demoError, setDemoError] = useState<string | null>(null);

  // Auto-launch the tour once, on first ever login.
  useEffect(() => {
    if (!localStorage.getItem(TOUR_SEEN_KEY)) {
      const t = setTimeout(() => setTourOpen(true), 700);
      return () => clearTimeout(t);
    }
  }, []);

  function exitTour() {
    localStorage.setItem(TOUR_SEEN_KEY, "1");
    setTourOpen(false);
  }

  async function loadDemoGame() {
    setDemoBusy(true);
    setDemoError(null);
    try {
      // Grab a well-known classic from the library and analyse it.
      const list = await api.listLibraryGames({ search: "Opera", pageSize: 1 });
      const game = list.games[0] ?? (await api.listLibraryGames({ pageSize: 1 })).games[0];
      if (!game) throw new Error("No library games available.");
      const { gameId } = await api.loadLibraryGame(game.id);
      setMenuOpen(false);
      openReview(gameId);
    } catch (err) {
      setDemoError(err instanceof Error ? err.message : "Couldn't load a demo game.");
    } finally {
      setDemoBusy(false);
    }
  }

  return (
    <>
      {tourOpen ? <GuidedTour navigate={navigate} onExit={exitTour} /> : null}
      {chatOpen ? <HelpChat screen={screen} onClose={() => setChatOpen(false)} /> : null}

      {/* Launcher menu */}
      {menuOpen ? (
        <div className="help-menu" role="menu">
          <button
            type="button"
            className="help-menu-item"
            onClick={() => {
              setMenuOpen(false);
              setChatOpen(true);
            }}
          >
            💬 Ask the help assistant
          </button>
          <button
            type="button"
            className="help-menu-item"
            onClick={() => {
              setMenuOpen(false);
              setTourOpen(true);
            }}
          >
            🧭 Take the guided tour
          </button>
          <button type="button" className="help-menu-item" onClick={() => void loadDemoGame()} disabled={demoBusy}>
            {demoBusy ? "Loading demo…" : "♟️ Try a demo game"}
          </button>
          {demoError ? <div className="help-menu-error">{demoError}</div> : null}
        </div>
      ) : null}

      {/* Floating launcher button */}
      <button
        type="button"
        className="help-launcher"
        data-tour="help-launcher"
        aria-label="Help and tour"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((o) => !o)}
      >
        {menuOpen ? "✕" : "?"}
      </button>
    </>
  );
}
