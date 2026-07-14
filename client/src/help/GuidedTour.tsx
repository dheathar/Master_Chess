import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { TOUR_STEPS, type TourNav } from "./tourSteps";

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PAD = 6; // spotlight padding around the target
const POP_W = 320; // popover width for placement math

/**
 * A dependency-free guided tour. For each step it optionally navigates to a
 * screen, then polls for the target element (which appears after React
 * re-renders), spotlights it, and anchors a popover beside it. Falls back to a
 * centered card if the element can't be found. Fully keyboard- and
 * skip-friendly.
 */
export function GuidedTour({
  navigate,
  onExit,
}: {
  navigate: (view: TourNav) => void;
  onExit: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const pollRef = useRef<number | null>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const step = TOUR_STEPS[index];
  const isFirst = index === 0;
  const isLast = index === TOUR_STEPS.length - 1;

  const clearPoll = () => {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const measure = useCallback((): boolean => {
    if (!step.selector) {
      setRect(null);
      return true; // centered step — nothing to wait for
    }
    const el = document.querySelector(step.selector);
    if (!el) return false;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false;
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    return true;
  }, [step.selector]);

  // On step change: navigate, then poll for the target element.
  useEffect(() => {
    if (step.navigate) navigate(step.navigate);
    setRect(null);
    clearPoll();
    let elapsed = 0;
    // Try immediately, then poll (the screen may still be mounting).
    if (measure()) return;
    pollRef.current = window.setInterval(() => {
      elapsed += 100;
      if (measure() || elapsed >= 2500) clearPoll();
    }, 100);
    return clearPoll;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  // Keep the spotlight aligned on resize/scroll.
  useLayoutEffect(() => {
    const onChange = () => void measure();
    window.addEventListener("resize", onChange);
    window.addEventListener("scroll", onChange, true);
    return () => {
      window.removeEventListener("resize", onChange);
      window.removeEventListener("scroll", onChange, true);
    };
  }, [measure]);

  const next = useCallback(() => {
    if (isLast) onExit();
    else setIndex((i) => Math.min(TOUR_STEPS.length - 1, i + 1));
  }, [isLast, onExit]);

  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  // Keyboard: →/Enter next, ← back, Esc exit.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onExit();
      else if (e.key === "ArrowRight" || e.key === "Enter") next();
      else if (e.key === "ArrowLeft") back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, back, onExit]);

  // Placement: measure the popover's real height and clamp it fully inside the
  // viewport, so a target near a screen edge never pushes the action buttons
  // off-screen. Prefer right of the target, else below, else above; then clamp.
  useLayoutEffect(() => {
    const pop = popRef.current;
    if (!pop || !rect) {
      setPos(null); // centered via CSS fallback
      return;
    }
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const popW = pop.offsetWidth || POP_W;
    const popH = pop.offsetHeight;
    let left: number;
    let top: number;
    const spaceRight = vw - (rect.left + rect.width);
    if (spaceRight > popW + 24) {
      left = rect.left + rect.width + 16;
      top = rect.top;
    } else {
      left = rect.left;
      top = rect.top + rect.height + 16; // below
      if (top + popH > vh - 16) top = rect.top - popH - 16; // not enough room below → above
    }
    // Final clamp on both axes (16px viewport margin).
    top = Math.min(Math.max(16, top), Math.max(16, vh - popH - 16));
    left = Math.min(Math.max(16, left), Math.max(16, vw - popW - 16));
    setPos({ top, left });
  }, [rect, index]);

  const popoverStyle: React.CSSProperties = pos
    ? { top: pos.top, left: pos.left }
    : { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };

  return (
    <div className="tour-root" role="dialog" aria-modal="true" aria-label="Guided tour">
      {/* Dimmed backdrop; clicking it exits. */}
      <div className="tour-backdrop" onClick={onExit} />
      {/* Spotlight ring over the target (a big box-shadow makes the hole). */}
      {rect ? (
        <div
          className="tour-spotlight"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
          }}
        />
      ) : null}
      {/* Popover */}
      <div ref={popRef} className="tour-popover" style={{ width: POP_W, ...popoverStyle }} onClick={(e) => e.stopPropagation()}>
        <div className="tour-popover-progress">
          Step {index + 1} of {TOUR_STEPS.length}
        </div>
        <h3 className="tour-popover-title">{step.title}</h3>
        <p className="tour-popover-body">{step.body}</p>
        <div className="tour-popover-actions">
          <button type="button" className="tour-skip" onClick={onExit}>
            Skip
          </button>
          <div className="tour-nav-btns">
            {!isFirst ? (
              <button type="button" className="tour-btn" onClick={back}>
                Back
              </button>
            ) : null}
            <button type="button" className="tour-btn tour-btn-primary" onClick={next}>
              {isLast ? "Finish" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
