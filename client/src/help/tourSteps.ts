import type { SidebarView } from "../components/Sidebar";

export type TourNav = SidebarView | "upload";

export interface TourStep {
  /** Screen to switch to before showing this step (optional). */
  navigate?: TourNav;
  /** CSS selector for the element to spotlight. If absent/not found, the step is centered. */
  selector?: string;
  title: string;
  body: string;
}

/**
 * A short guided tour of the core loop — Diagnose → Explain → Prescribe. Each
 * step navigates to a real screen and highlights a stable sidebar anchor, so it
 * works regardless of whether the account has data yet. Kept to ~8 steps
 * (under a couple of minutes) and fully skippable.
 */
export const TOUR_STEPS: TourStep[] = [
  {
    selector: "[data-tour='brand']",
    title: "Welcome to Master Chess",
    body: "This is the coach that learns from your own games. In under two minutes, here's the whole loop: Diagnose → Explain → Prescribe.",
  },
  {
    navigate: "dashboard",
    selector: "[data-tour='upload']",
    title: "1 · Upload your games",
    body: "Paste a PGN or drop a .pgn file from Chess.com or Lichess. Tell us your username and we detect which side you played. Every move is then analysed by Stockfish.",
  },
  {
    navigate: "dashboard",
    selector: "[data-tour='nav-dashboard']",
    title: "2 · Your games",
    body: "Analysed games and your headline stats — games analysed, average accuracy, and games with a blunder — live here. Open any game for a move-by-move review.",
  },
  {
    navigate: "model",
    selector: "[data-tour='nav-model']",
    title: "3 · Your player model",
    body: "A diagnosis across 27 skills, your level, and your plateau. Every score has a receipt — click a skill to see the exact moves behind it. No black box.",
  },
  {
    navigate: "progress",
    selector: "[data-tour='nav-progress']",
    title: "Your guide to success",
    body: "Progress is your coach's-eye view: where you are, what you've achieved, and the single highest-leverage thing to do next. Check it whenever you're unsure what to work on.",
  },
  {
    navigate: "prescription",
    selector: "[data-tour='nav-prescription']",
    title: "4 · Your training plan",
    body: "Prescribed from your diagnosis, not a generic curriculum: a hypothesis plus focus blocks with matched reading. Upload a few games to unlock it.",
  },
  {
    navigate: "drill",
    selector: "[data-tour='nav-drill']",
    title: "5 · Own-mistake drills",
    body: "Every drill here is a position you actually reached and misplayed, brought back on a spaced-repetition schedule until the gap is closed for good.",
  },
  {
    navigate: "library",
    selector: "[data-tour='nav-library']",
    title: "Explore master games",
    body: "Search ~6,000 classic games and an opening explorer. No games of your own yet? Use “Try a demo game” below to watch a real analysis right now.",
  },
  {
    selector: "[data-tour='help-launcher']",
    title: "Help is always here",
    body: "Stuck at any point? Open this button to replay the tour or ask the help assistant a question in plain language.",
  },
];
