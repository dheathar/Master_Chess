import type { GameFacts } from "./gameFacts";

// Coordinate/UCI moves (e2e4, b8c6, e7e8q). The narrator/classifier prompts
// always ask for SAN, so any coordinate move in the output is an unverifiable
// fabrication channel — its mere presence is a violation.
const UCI_TOKEN_RE = /\b[a-h][1-8][a-h][1-8][qrbn]?\b/g;

// SAN tokens, including zero-form castling (0-0) and check/mate suffixes. The
// trailing suffix is captured *without* a following \b — `#`/`+` are non-word
// characters, so a `\b` after them fails and would truncate "Qxf7#" to "Qxf7".
const SAN_TOKEN_RE =
  /\b(?:O-O-O|O-O|0-0-0|0-0)[+#]?|\b[KQRBN][a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?|\b[a-h]x?[a-h]?[1-8](?:=[QRBN])?[+#]?/g;

const CP_TOKEN_RE = /(-?\d+)\s?(?:cp|centipawns?)\b/gi;
const CP_TOLERANCE = 20;

// A legitimate coaching note never contains a link; a URL is the tell-tale of
// an injected phishing payload that otherwise cites no moves/numbers (and so
// would slip through the membership checks).
const URL_RE = /\bhttps?:\/\/\S+|\bwww\.\S+/i;

export interface ClaimGuardVerdict {
  verified: boolean;
  reason?: string;
}

/** Strips check/mate suffixes and normalizes zero-form castling so equivalent SANs compare equal. */
export function normalizeSan(token: string): string {
  const core = token.replace(/[+#]+$/, "");
  if (core === "0-0") return "O-O";
  if (core === "0-0-0") return "O-O-O";
  return core;
}

function normalizedSet(sans: string[]): Set<string> {
  return new Set(sans.map(normalizeSan));
}

/**
 * Verifies that a piece of LLM-written text makes no *fabricated* move or
 * number claims: no coordinate/UCI move at all (SAN was requested), every SAN
 * token is a member of `allowedSan` (compared suffix-normalized), and every
 * centipawn figure is within tolerance of an allowed value. This is a
 * membership check — it cannot judge whether a real fact was used correctly;
 * the narrative-level guard adds outcome and side-attribution checks on top.
 */
export function verifyClaims(text: string, allowedSan: string[], allowedCpValues: number[]): ClaimGuardVerdict {
  if (URL_RE.test(text)) {
    return { verified: false, reason: "Contains a URL — coaching notes never link out; likely an injected payload." };
  }

  const uci = text.match(UCI_TOKEN_RE);
  if (uci && uci.length > 0) {
    return { verified: false, reason: `Uses coordinate/UCI notation ("${uci[0]}") instead of the requested SAN — unverifiable.` };
  }

  const allowed = normalizedSet(allowedSan);
  const sanMatches = text.match(SAN_TOKEN_RE) ?? [];
  for (const token of sanMatches) {
    if (!allowed.has(normalizeSan(token))) {
      return { verified: false, reason: `Mentions a move ("${token}") that isn't in the given facts.` };
    }
  }

  for (const match of text.matchAll(CP_TOKEN_RE)) {
    const claimed = Math.abs(Number(match[1]));
    const matchesRecorded = allowedCpValues.some((value) => Math.abs(Math.abs(value) - claimed) <= CP_TOLERANCE);
    if (!matchesRecorded) {
      return { verified: false, reason: `Cites a centipawn figure ("${match[0]}") that doesn't match any given fact.` };
    }
  }

  return { verified: true };
}

const WIN_CLAIM_RE = /\b(?:won the game|win(?:ning)? the game|secur\w* the win|convert\w* the win|seal\w* the win|the win\b|a\s+win\b|victory)\b/i;
const LOSS_CLAIM_RE = /\b(?:lost the game|los(?:e|ing) the game|the loss\b|the defeat\b|\bdefeat\b|resign\w*)\b/i;
const DRAW_CLAIM_RE = /\b(?:drew the game|draw the game|held (?:the|a) draw|salvag\w* (?:the|a) draw|a\s+draw\b|the draw\b)\b/i;
const OWN_MOVE_CUE_RE = /\byou(?:r)?\b/i;

/**
 * Narrative-scoped guard: fabrication membership (via verifyClaims over BOTH
 * sides' moves) plus two semantic checks the membership pass can't make —
 *  (a) outcome anchoring: an explicit game-result claim must match the real
 *      result from the player's perspective (catches "securing the win" on a
 *      lost game);
 *  (b) side attribution: a move introduced by a second-person cue ("your move
 *      X", "you played X") must be one of the player's OWN moves, never the
 *      opponent's (catches attributing the opponent's move to the student).
 */
export function verifyNarrative(narrative: string, facts: GameFacts): ClaimGuardVerdict {
  const base = verifyClaims(narrative, facts.allSan, facts.cpLossValues);
  if (!base.verified) return base;

  if (facts.outcome !== "unknown") {
    const claimsWin = WIN_CLAIM_RE.test(narrative);
    const claimsLoss = LOSS_CLAIM_RE.test(narrative);
    const claimsDraw = DRAW_CLAIM_RE.test(narrative);
    if (claimsWin && facts.outcome !== "win") {
      return { verified: false, reason: `Claims a win, but the player's result was a ${facts.outcome}.` };
    }
    if (claimsLoss && facts.outcome !== "loss") {
      return { verified: false, reason: `Claims a loss, but the player's result was a ${facts.outcome}.` };
    }
    if (claimsDraw && facts.outcome !== "draw") {
      return { verified: false, reason: `Claims a draw, but the player's result was a ${facts.outcome}.` };
    }
  }

  const own = normalizedSet(facts.ownSan);
  const opponent = normalizedSet(facts.opponentSan);
  for (const match of narrative.matchAll(SAN_TOKEN_RE)) {
    const token = match[0];
    const index = match.index ?? 0;
    const preceding = narrative.slice(Math.max(0, index - 24), index);
    if (!OWN_MOVE_CUE_RE.test(preceding)) continue;
    const normalized = normalizeSan(token);
    // Only reject when the move is unambiguously the opponent's (present among
    // opponent moves and never among the player's own) — a move both sides
    // played (e.g. both castled) is not an attribution error.
    if (opponent.has(normalized) && !own.has(normalized)) {
      return { verified: false, reason: `Attributes the opponent's move ("${token}") to the player.` };
    }
  }

  return { verified: true };
}
