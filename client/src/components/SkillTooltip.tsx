import { useLayoutEffect, useRef, useState } from "react";
import type { SkillSummary } from "@shared/api";

const TOOLTIP_WIDTH = 280;
const TOOLTIP_MARGIN = 10;
const ARROW_HALF = 5;

interface Placement {
  top: number;
  left: number;
  arrowLeft: number;
  direction: "up" | "down";
  anchorTop: number;
  anchorBottom: number;
}

export function SkillTooltip({ skill }: { skill: SkillSummary }) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);

  function show() {
    const rect = anchorRef.current?.getBoundingClientRect();
    if (!rect) return;
    const iconCenterX = rect.left + rect.width / 2;
    // The right-edge bound can go negative on a viewport narrower than the
    // tooltip itself — clamp the bound first so the left-edge floor always
    // wins, rather than letting Math.min pick a negative value and push the
    // whole box off-screen to the left.
    const maxLeft = Math.max(TOOLTIP_MARGIN, window.innerWidth - TOOLTIP_WIDTH - TOOLTIP_MARGIN);
    const left = Math.min(Math.max(iconCenterX - TOOLTIP_WIDTH / 2, TOOLTIP_MARGIN), maxLeft);
    const arrowLeft = Math.min(Math.max(iconCenterX - left, ARROW_HALF + 4), TOOLTIP_WIDTH - ARROW_HALF - 4);

    // Content height varies a lot (a scored skill's short grading text vs. an
    // unscored skill's long "not yet scored" explanation), so rather than
    // guess a height to decide up/down before rendering, always render below
    // first, then correct in a layout effect once the real height is known —
    // useLayoutEffect runs before paint, so there's no visible flash.
    setPlacement({
      top: rect.bottom + TOOLTIP_MARGIN,
      left,
      arrowLeft,
      direction: "down",
      anchorTop: rect.top,
      anchorBottom: rect.bottom,
    });
  }

  function hide() {
    setPlacement(null);
  }

  useLayoutEffect(() => {
    if (!placement || !tooltipRef.current) return;
    const height = tooltipRef.current.getBoundingClientRect().height;
    const spaceBelow = window.innerHeight - TOOLTIP_MARGIN - (placement.anchorBottom + TOOLTIP_MARGIN);
    const spaceAbove = placement.anchorTop - TOOLTIP_MARGIN;
    const fitsBelow = height <= spaceBelow;
    const fitsAbove = height <= spaceAbove;
    // When the tooltip is taller than the room available in EITHER
    // direction (a tall "not yet scored" explanation in a short viewport),
    // picking a fixed default would overflow by more than necessary — pick
    // whichever side actually has more room, and CSS caps max-height so it
    // scrolls internally rather than overflowing the viewport regardless.
    const direction: "up" | "down" = fitsBelow ? "down" : fitsAbove ? "up" : spaceAbove > spaceBelow ? "up" : "down";
    if (direction === placement.direction) return;
    const top = direction === "up" ? placement.anchorTop - TOOLTIP_MARGIN : placement.anchorBottom + TOOLTIP_MARGIN;
    setPlacement((current) => (current ? { ...current, direction, top } : current));
    // Only re-run when the anchor moves — direction/top updates from this
    // same effect must not retrigger it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placement?.anchorTop, placement?.anchorBottom, placement?.left]);

  return (
    <span
      className="skill-tooltip-anchor"
      tabIndex={0}
      ref={anchorRef}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      <span className="skill-tooltip-icon" aria-hidden="true">
        i
      </span>
      {placement ? (
        <span
          ref={tooltipRef}
          className="skill-tooltip"
          role="tooltip"
          data-direction={placement.direction}
          style={{
            top: placement.top,
            left: placement.left,
            transform: placement.direction === "up" ? "translateY(-100%)" : "none",
          }}
        >
          <span className="skill-tooltip-arrow" style={{ left: placement.arrowLeft }} />
          <span className="skill-tooltip-title">{skill.name}</span>
          <span className="skill-tooltip-section-label">What it is</span>
          <span className="skill-tooltip-text">{skill.description}</span>
          <span className="skill-tooltip-section-label">Why it matters</span>
          <span className="skill-tooltip-text">{skill.whyItMatters}</span>
          <span className="skill-tooltip-section-label">How it's graded</span>
          <span className={`skill-tooltip-text ${skill.hasEvidence ? "" : "no-data"}`}>{skill.assessmentMethod}</span>
        </span>
      ) : null}
    </span>
  );
}
