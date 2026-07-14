const PIECE_VALUES_CP: Record<string, number> = {
  n: 300,
  b: 300,
  r: 500,
  q: 900,
};

/**
 * Flips the side-to-move field without playing a move — the standard
 * "null move" probe: evaluating this FEN reveals what the side that just
 * moved would get for free if their opponent simply passed, i.e. their
 * opponent's standing threat. En passant rights are cleared since they were
 * only ever valid for the move that didn't happen.
 */
export function flipSideToMove(fen: string): string {
  const parts = fen.split(" ");
  if (parts.length < 4) {
    throw new Error(`Invalid FEN: expected at least 4 fields, got ${parts.length}`);
  }
  if (parts[1] !== "w" && parts[1] !== "b") {
    throw new Error(`Invalid FEN: side-to-move field must be 'w' or 'b', got '${parts[1]}'`);
  }
  parts[1] = parts[1] === "w" ? "b" : "w";
  parts[3] = "-";
  return parts.join(" ");
}

/** Sums non-pawn, non-king material across both sides from a FEN's piece placement field. */
export function nonPawnMaterialCp(fen: string): number {
  const placement = fen.split(" ")[0] ?? "";
  let total = 0;
  for (const char of placement) {
    const value = PIECE_VALUES_CP[char.toLowerCase()];
    if (value) total += value;
  }
  return total;
}

/**
 * The stronger side's non-pawn material in centipawns. Phase detection keys
 * off this rather than the two-side sum so that lopsided material (Q+R vs
 * lone R) still reads as an endgame.
 */
export function maxSideNonPawnMaterialCp(fen: string): number {
  const placement = fen.split(" ")[0] ?? "";
  let white = 0;
  let black = 0;
  for (const char of placement) {
    const value = PIECE_VALUES_CP[char.toLowerCase()];
    if (!value) continue;
    if (char === char.toUpperCase()) white += value;
    else black += value;
  }
  return Math.max(white, black);
}

/**
 * Classifies an endgame position by which piece type dominates the technique
 * required, from the material signature alone (standard practice — see e.g.
 * the endgame chapter conventions in Dvoretsky's Endgame Manual). Returns
 * null for positions with queens or mixed rook+minor material, where no
 * single piece-type skill cleanly applies — those stay covered by the
 * generic endgame_principles / endgame_precision_conversion skills only.
 */
export type EndgameMaterialSignature = "pawn" | "rook" | "knight" | "bishop_mixed" | null;

export function endgameMaterialSignature(fen: string): EndgameMaterialSignature {
  const placement = fen.split(" ")[0] ?? "";
  let queens = 0;
  let rooks = 0;
  let bishops = 0;
  let knights = 0;
  for (const char of placement) {
    const lower = char.toLowerCase();
    if (lower === "q") queens += 1;
    else if (lower === "r") rooks += 1;
    else if (lower === "b") bishops += 1;
    else if (lower === "n") knights += 1;
  }
  if (queens > 0) return null;
  if (rooks === 0 && bishops === 0 && knights === 0) return "pawn";
  if (rooks > 0 && bishops === 0 && knights === 0) return "rook";
  if (rooks === 0 && knights > 0 && bishops === 0) return "knight";
  if (rooks === 0 && (bishops > 0 || knights > 0)) return "bishop_mixed";
  return null; // rook + minor piece combinations — no single piece-type skill fits
}
