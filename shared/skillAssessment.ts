import type { SkillId } from "./taxonomy";

/**
 * Honest, human-readable description of how each skill is actually graded —
 * kept in lockstep with the rule sets in server/pipeline/skillInference.ts
 * and server/pipeline/openingInference.ts. Skills with no entry here have no
 * evidence rule yet; the UI must say so rather than implying a score it
 * can't back.
 */
export const SKILL_ASSESSMENT_METHOD: Partial<Record<SkillId, string>> = {
  opening_principles:
    "Every mistake or blunder you make in the first 20 plies counts against this skill; clean opening play counts lightly for it.",
  opening_repertoire:
    "If you've played the same ECO opening line in 3+ analyzed games with low opening-phase centipawn loss, that repeated, competent line counts for this skill. Playing varied openings is never counted against you — only a consistently mishandled repeated line would be a weakness, and that shows up in Opening Principles instead.",
  opening_preparation_novelties:
    "When you leave a known position from the local master-game library with an engine-approved move between moves 4 and 10, that counts as a prepared deviation. This only credits sound novelties — it doesn't yet penalize shallow prep, since we can't tell 'sound because you knew it' apart from 'sound because you got lucky' with the data available.",
  tactical_consistency:
    "A blunder in the middlegame (large, avoidable centipawn loss) counts against this skill — it's specifically the 'did you blunder-check?' measure. Clean middlegame moves count lightly for it.",
  tactical_pattern_recognition:
    "Middlegame mistakes and blunders where the engine's best move was clearly better count against this skill — it measures whether you spotted the tactic the engine saw.",
  calculation_precision:
    "Missing a forced mate the engine had already found counts heavily against this skill — the clearest possible signal of a calculation gap.",
  piece_activity_coordination:
    "When one of your own pieces (not a pawn) is left on a square the opponent attacks with no defender of yours covering it, and the move was also flagged a mistake or blunder, that counts against this skill — a direct board check, not just an engine cp-loss reading.",
  attack_initiative:
    "If your position moves from roughly equal to clearly winning (+5.0 or better) during the middlegame or endgame, that swing counts for this skill — evidence you built and pressed an advantage rather than winning by opponent error alone.",
  defence_counterplay:
    "If you were clearly worse (-3.0 or worse) at some point in the game but went on to draw or win, that counts for this skill. We don't count a loss against it — a genuinely lost position isn't necessarily a defensive failure, and we can't fairly tell the difference from the data we have.",
  endgame_principles:
    "Mistakes or blunders played in the endgame phase count against this skill; sound endgame moves count lightly for it.",
  endgame_precision_conversion:
    "Centipawn loss in the endgame phase counts against this skill — it isolates precision specifically once the position has simplified.",
  pawn_endings:
    "Endgame mistakes and blunders played in a position with no rooks, bishops, knights, or queens on the board (a pure pawn ending) count against this skill specifically, on top of the general endgame score.",
  rook_endings:
    "Endgame mistakes and blunders played in a position with rooks but no bishops, knights, or queens count against this skill specifically — the most common practical endgame type.",
  knight_endings:
    "Endgame mistakes and blunders played in a position with knights but no rooks, bishops, or queens count against this skill specifically.",
  bishop_mixed_endings:
    "Endgame mistakes and blunders played in a position with bishops (alone, or together with knights, but no rooks or queens) count against this skill specifically.",
  converting_advantages:
    "If you reached a clearly winning position (+400cp or better) at any point but didn't win the game, that single game counts as strong evidence against this skill.",
  time_management:
    "A blunder or mistake played in under 3 seconds counts against this skill — evidence you skipped a blunder-check under time pressure.",
  thought_process_candidate_moves:
    "A blunder or mistake played after 90+ seconds of thought counts against this skill — you had time to find it and still didn't, suggesting a process gap rather than a snap error.",
  psychological_resilience:
    "A derived metric of our own (not a platform-standard one): the spread (standard deviation) of your centipawn losses across a game, plus whether your error rate rose sharply right after your first blunder (a 'tilt' pattern) or stayed controlled. High variance or post-blunder clustering counts against; steady, recovered play counts for.",
  prophylaxis:
    "We run a 'null-move' engine probe on positions you faced — evaluating them with your opponent's side to move, for free — to measure their standing threat as a delta against the real evaluation (so simply being worse is never mistaken for a new threat). When a foreseeable threat was real and then landed on your next moves, that counts against this skill; when you neutralized a real threat, that counts for it. Mate threats count too. The score's weight comes from the engine numbers alone, not any model opinion; an LLM only writes the one-line explanation, and a claim guard discards it if it invents a move or figure — falling back to a plain templated note so your score never depends on the model being available.",
};

export const SKILL_NOT_YET_SCORED_MESSAGE =
  "Not yet scored. This skill needs judgment beyond move classification — either richer chess-specific detection (e.g. a prophylaxis check comparing the opponent's threat before and after your move) or a language-model classifier whose verdicts are checked against the engine before they can count as evidence. Neither exists in the app yet.";

export function assessmentMethodFor(skillId: SkillId): string {
  return SKILL_ASSESSMENT_METHOD[skillId] ?? SKILL_NOT_YET_SCORED_MESSAGE;
}
