/**
 * Single source of truth for the Master Chess skill taxonomy.
 * Sourced from PlayerFramework.xlsx (Sheets 1-4): 7 player levels, 27 skills
 * across 4 categories, and 5 diagnosable plateaus.
 */

export const SKILL_CATEGORIES = [
  "OPENING",
  "MIDDLEGAME",
  "ENDGAME",
  "PSYCHOLOGY_MENTAL",
] as const;
export type SkillCategory = (typeof SKILL_CATEGORIES)[number];

export type SkillId =
  | "opening_principles"
  | "opening_repertoire"
  | "opening_preparation_novelties"
  | "strategic_planning"
  | "positional_play"
  | "patience_long_term_thinking"
  | "prophylaxis"
  | "tactical_pattern_recognition"
  | "tactical_consistency"
  | "calculation_precision"
  | "attack_initiative"
  | "piece_activity_coordination"
  | "defence_counterplay"
  | "converting_advantages"
  | "endgame_principles"
  | "game_transition"
  | "endgame_precision_conversion"
  | "pawn_endings"
  | "rook_endings"
  | "knight_endings"
  | "bishop_mixed_endings"
  | "thought_process_candidate_moves"
  | "pattern_recognition_speed"
  | "intuition_practical_judgment"
  | "time_management"
  | "psychological_resilience"
  | "psychological_warfare";

export interface SkillDefinition {
  id: SkillId;
  category: SkillCategory;
  subcategory: string;
  name: string;
  description: string;
  whyItMatters: string;
  diagnosable: "yes" | "partial";
}

export const SKILLS: SkillDefinition[] = [
  {
    id: "opening_principles",
    category: "OPENING",
    subcategory: "Opening fundamentals",
    name: "Opening principles",
    description: "Development, centre control, king safety — the foundational principles applied each game",
    whyItMatters: "Foundation of every game — incorrect early play creates immediate disadvantage",
    diagnosable: "yes",
  },
  {
    id: "opening_repertoire",
    category: "OPENING",
    subcategory: "Opening fundamentals",
    name: "Opening repertoire",
    description: "A consistent set of first-move systems for both colours, studied and understood",
    whyItMatters: "Reduces cognitive load; allows focus on understanding over memorisation",
    diagnosable: "yes",
  },
  {
    id: "opening_preparation_novelties",
    category: "OPENING",
    subcategory: "Opening fundamentals",
    name: "Opening preparation & novelties",
    description: "Specific opponent preparation, sideline avoidance, theory depth beyond move 10",
    whyItMatters: "Creates decisive advantages through specific opponent knowledge",
    diagnosable: "partial",
  },
  {
    id: "strategic_planning",
    category: "MIDDLEGAME",
    subcategory: "Strategy & planning",
    name: "Strategic planning",
    description: "Forming and executing multi-move plans based on structural and positional features",
    whyItMatters: "Distinguishes chess from checkers — wins come from plans, not accidents",
    diagnosable: "yes",
  },
  {
    id: "positional_play",
    category: "MIDDLEGAME",
    subcategory: "Strategy & planning",
    name: "Positional play",
    description: "Understanding and exploiting positional features: weak squares, outposts, pawn majorities",
    whyItMatters: "Converts accumulated small advantages that tactics alone cannot resolve",
    diagnosable: "yes",
  },
  {
    id: "patience_long_term_thinking",
    category: "MIDDLEGAME",
    subcategory: "Strategy & planning",
    name: "Patience & long-term thinking",
    description: "Ability to improve positions gradually without forcing, tolerating ambiguity",
    whyItMatters: "Prevents over-forcing that throws away advantages; core GM trait",
    diagnosable: "yes",
  },
  {
    id: "prophylaxis",
    category: "MIDDLEGAME",
    subcategory: "Strategy & planning",
    name: "Prophylaxis",
    description: "Asking 'what does my opponent want?' before every move; preventing threats before they arise",
    whyItMatters: "Prevents losses to telegraphed plans — most common plateau cause at 1800",
    diagnosable: "yes",
  },
  {
    id: "tactical_pattern_recognition",
    category: "MIDDLEGAME",
    subcategory: "Tactics & calculation",
    name: "Tactical pattern recognition",
    description: "Recognising forks, pins, skewers, discovered attacks, and combinations in real games",
    whyItMatters: "Tactical execution is the floor beneath every other skill",
    diagnosable: "yes",
  },
  {
    id: "tactical_consistency",
    category: "MIDDLEGAME",
    subcategory: "Tactics & calculation",
    name: "Tactical consistency (blunder prevention)",
    description: "Not missing opponent's threats; performing a blunder-check before every move",
    whyItMatters: "Single biggest rating determinant below 1600",
    diagnosable: "yes",
  },
  {
    id: "calculation_precision",
    category: "MIDDLEGAME",
    subcategory: "Tactics & calculation",
    name: "Calculation precision",
    description: "Computing deep forced lines accurately; correctly evaluating positions several moves ahead",
    whyItMatters: "The difference between club player and master in complex positions",
    diagnosable: "yes",
  },
  {
    id: "attack_initiative",
    category: "MIDDLEGAME",
    subcategory: "Dynamics & initiative",
    name: "Attack & initiative",
    description: "Creating and sustaining attacking chances; knowing when to launch a kingside assault",
    whyItMatters: "Winning without initiative means converting long strategic pressure",
    diagnosable: "yes",
  },
  {
    id: "piece_activity_coordination",
    category: "MIDDLEGAME",
    subcategory: "Dynamics & initiative",
    name: "Piece activity & coordination",
    description: "Maximising piece efficiency; avoiding misplaced pieces; good vs bad bishop decisions",
    whyItMatters: "Inactive pieces are dead material — piece harmony multiplies all other skills",
    diagnosable: "yes",
  },
  {
    id: "defence_counterplay",
    category: "MIDDLEGAME",
    subcategory: "Dynamics & initiative",
    name: "Defence & counterplay",
    description: "Holding worse positions; creating practical counterchances when under pressure",
    whyItMatters: "Players who only know how to attack lose constantly with Black",
    diagnosable: "yes",
  },
  {
    id: "converting_advantages",
    category: "MIDDLEGAME",
    subcategory: "Dynamics & initiative",
    name: "Converting advantages",
    description: "Translating a better position into a win; knowing when and how to simplify",
    whyItMatters: "Most common failure mode 1500-2000; strategy useless without conversion",
    diagnosable: "yes",
  },
  {
    id: "endgame_principles",
    category: "ENDGAME",
    subcategory: "Endgame fundamentals",
    name: "Endgame principles",
    description: "King activity, do not hurry, two-weakness principle — foundational endgame thinking",
    whyItMatters: "All other endgame skills depend on applying these principles correctly",
    diagnosable: "yes",
  },
  {
    id: "game_transition",
    category: "ENDGAME",
    subcategory: "Endgame fundamentals",
    name: "Game transition (MG to EG)",
    description: "Steering from middlegame into favourable endgames; recognising which endings to seek",
    whyItMatters: "Capablanca's speciality; avoids bad endings through active steering",
    diagnosable: "yes",
  },
  {
    id: "endgame_precision_conversion",
    category: "ENDGAME",
    subcategory: "Endgame fundamentals",
    name: "Endgame precision & conversion",
    description: "Converting technically won endings; technique in positions with clear but narrow paths",
    whyItMatters: "Half-points lost in technically won endings at every level above 1500",
    diagnosable: "yes",
  },
  {
    id: "pawn_endings",
    category: "ENDGAME",
    subcategory: "Endgame by piece type",
    name: "Pawn endings",
    description: "Opposition, zugzwang, pawn breakthroughs, key squares — the foundation of all endings",
    whyItMatters: "Foundation of all endings — every piece ending simplifies to a pawn ending",
    diagnosable: "yes",
  },
  {
    id: "rook_endings",
    category: "ENDGAME",
    subcategory: "Endgame by piece type",
    name: "Rook endings",
    description: "Philidor, Lucena, rook on 7th, cut-off positions — the most common practical endgame type",
    whyItMatters: "Most common practical endgame type — occurs in ~40% of games",
    diagnosable: "yes",
  },
  {
    id: "knight_endings",
    category: "ENDGAME",
    subcategory: "Endgame by piece type",
    name: "Knight endings",
    description: "Knight vs pawn, knight vs bishop, knight outposts in simplified positions",
    whyItMatters: "Particularly tricky; knight's non-linear movement creates errors",
    diagnosable: "yes",
  },
  {
    id: "bishop_mixed_endings",
    category: "ENDGAME",
    subcategory: "Endgame by piece type",
    name: "Bishop & mixed piece endings",
    description: "Same/opposite colour bishops, bishop vs knight, multi-piece conversion",
    whyItMatters: "Bishop colour and coordination decisions critical in conversion",
    diagnosable: "yes",
  },
  {
    id: "thought_process_candidate_moves",
    category: "PSYCHOLOGY_MENTAL",
    subcategory: "Decision-making",
    name: "Thought process & candidate moves",
    description: "Systematic evaluation of candidate moves; structured thinking under time pressure",
    whyItMatters: "Structured thinking prevents both missed tactics and time pressure",
    diagnosable: "partial",
  },
  {
    id: "pattern_recognition_speed",
    category: "PSYCHOLOGY_MENTAL",
    subcategory: "Decision-making",
    name: "Pattern recognition speed",
    description: "Speed of tactical and positional recall — distinguishes strong from weak at same accuracy level",
    whyItMatters: "Speed of recall predicts playing strength better than accuracy alone (Gobet 2019)",
    diagnosable: "yes",
  },
  {
    id: "intuition_practical_judgment",
    category: "PSYCHOLOGY_MENTAL",
    subcategory: "Decision-making",
    name: "Intuition & practical judgment",
    description: "Making sound decisions in complex positions where full calculation is impossible",
    whyItMatters: "Cannot calculate everything — intuition must fill the gaps",
    diagnosable: "partial",
  },
  {
    id: "time_management",
    category: "PSYCHOLOGY_MENTAL",
    subcategory: "Competitive performance",
    name: "Time management",
    description: "Allocating clock time appropriately across phases; avoiding chronic time pressure",
    whyItMatters: "Chronic time pressure undermines every other skill; fully preventable",
    diagnosable: "yes",
  },
  {
    id: "psychological_resilience",
    category: "PSYCHOLOGY_MENTAL",
    subcategory: "Competitive performance",
    name: "Psychological resilience",
    description: "Performing consistently across a tournament; recovering from losses; handling pressure",
    whyItMatters: "Tournament performance requires consistency across rounds; mental stamina",
    diagnosable: "yes",
  },
  {
    id: "psychological_warfare",
    category: "PSYCHOLOGY_MENTAL",
    subcategory: "Competitive performance",
    name: "Psychological warfare",
    description: "Playing moves that challenge opponents psychologically; managing practical complexity",
    whyItMatters: "Practical complications influence opponents independently of chess quality",
    diagnosable: "partial",
  },
];

export const SKILL_BY_ID: Record<SkillId, SkillDefinition> = Object.fromEntries(
  SKILLS.map((skill) => [skill.id, skill]),
) as Record<SkillId, SkillDefinition>;

export const PLAYER_LEVELS = [
  "L1",
  "L2",
  "L3",
  "L4",
  "L5",
  "L6",
  "L7",
] as const;
export type PlayerLevel = (typeof PLAYER_LEVELS)[number];

export interface PlayerLevelDefinition {
  id: PlayerLevel;
  name: string;
  ratingMin: number;
  ratingMax: number | null;
  dominantFailureMode: string;
  trainingFocus: string;
}

export const PLAYER_LEVEL_DEFINITIONS: PlayerLevelDefinition[] = [
  {
    id: "L1",
    name: "Newcomer",
    ratingMin: 0,
    ratingMax: 799,
    dominantFailureMode: "Tactical invisibility — cannot see what opponent just threatened",
    trainingFocus: "Piece safety; basic tactics (fork, pin, skewer); not leaving pieces en prise",
  },
  {
    id: "L2",
    name: "Beginner",
    ratingMin: 800,
    ratingMax: 1199,
    dominantFailureMode: "Pattern blindness — misses tactical patterns beyond one move",
    trainingFocus: "Basic tactical motifs; mating patterns; piece development principles",
  },
  {
    id: "L3",
    name: "Casual club player",
    ratingMin: 1200,
    ratingMax: 1499,
    dominantFailureMode: "Contextual blindness — misses in-game patterns despite solving them in puzzles",
    trainingFocus: "Tactical consistency (blunder-check habit); basic pawn structure; K+P endings",
  },
  {
    id: "L4",
    name: "Improving club player",
    ratingMin: 1500,
    ratingMax: 1799,
    dominantFailureMode: "Strategic vacuum — plays tactically sound moves with no unifying plan",
    trainingFocus: "Pawn structures & plans; piece activity; basic rook endings; converting wins",
  },
  {
    id: "L5",
    name: "Strong club player",
    ratingMin: 1800,
    ratingMax: 1999,
    dominantFailureMode: "Reactive play — technically sound but does not prevent the opponent's ideas",
    trainingFocus: "Prophylaxis; complex endgames (rook); time management; psychology",
  },
  {
    id: "L6",
    name: "Expert / Candidate Master",
    ratingMin: 2000,
    ratingMax: 2299,
    dominantFailureMode: "Conversion failure — wins strategically but cannot translate edges into points",
    trainingFocus: "Transformation of advantages; novelty preparation; mental toughness",
  },
  {
    id: "L7",
    name: "Master / Titled",
    ratingMin: 2300,
    ratingMax: null,
    dominantFailureMode: "Highly individual — requires personalised coaching diagnosis",
    trainingFocus: "Opponent-specific preparation; novelty research; peak performance",
  },
];

export function levelForRating(rating: number): PlayerLevel {
  const match = PLAYER_LEVEL_DEFINITIONS.find(
    (level) => rating >= level.ratingMin && (level.ratingMax === null || rating <= level.ratingMax),
  );
  return match?.id ?? "L1";
}

export type PlateauId =
  | "blunder_wall"
  | "strategy_desert"
  | "conversion_ceiling"
  | "prophylaxis_gap"
  | "precision_boundary";

export interface PlateauDefinition {
  id: PlateauId;
  name: string;
  ratingZoneMin: number;
  ratingZoneMax: number | null;
  whatHappens: string;
  diagnosisSignal: string;
  targetSkills: SkillId[];
}

export const PLATEAUS: PlateauDefinition[] = [
  {
    id: "blunder_wall",
    name: "The blunder wall",
    ratingZoneMin: 0,
    // Extends to 1399 so it covers L3 (1200-1499), whose dominant failure mode
    // ("contextual blindness" — misses in-game tactics solved in puzzles) is
    // exactly this plateau's signal; capping at 1199 left 1200-1399 with no
    // diagnosable plateau. (Ratings 2200+ intentionally have none — that band
    // is individual-coaching territory, not a formulaic plateau.)
    ratingZoneMax: 1399,
    whatHappens:
      "Players eliminate gross blunders but stagnate because they still miss tactical patterns in real games — context disrupts pattern recall that works in isolation.",
    diagnosisSignal: "High blunder rate; misses 1-2 move tactics in own games that they solve in puzzles",
    targetSkills: ["tactical_pattern_recognition", "tactical_consistency"],
  },
  {
    id: "strategy_desert",
    name: "The strategy desert",
    ratingZoneMin: 1400,
    ratingZoneMax: 1600,
    whatHappens:
      "Tactically improving but strategically lost. Games won or lost based on who blunders first. No plan in quiet positions. Endgame entirely neglected.",
    diagnosisSignal: "Average centipawn loss flat; losses from positional drift rather than tactical blunders",
    targetSkills: ["strategic_planning", "pawn_endings", "endgame_principles"],
  },
  {
    id: "conversion_ceiling",
    name: "The conversion ceiling",
    ratingZoneMin: 1500,
    ratingZoneMax: 2000,
    whatHappens:
      "Most common and frustrating plateau. Players win the strategic battle but cannot convert. They know they are better but lack the technique and psychological composure to finish the job.",
    diagnosisSignal: "Wins fewer games than position advantages suggest; critical moment failures; drawn/lost won endings",
    targetSkills: ["converting_advantages", "rook_endings", "endgame_precision_conversion"],
  },
  {
    id: "prophylaxis_gap",
    name: "The prophylaxis gap",
    ratingZoneMin: 1700,
    ratingZoneMax: 1900,
    whatHappens:
      "Technically sound but reactive. Does not ask 'what does my opponent want?' Losses come from allowing the opponent's plan to materialise despite adequate tactical awareness.",
    diagnosisSignal: "Repeated losses where opponent's clearly telegraphed plan went unopposed",
    targetSkills: ["prophylaxis", "defence_counterplay"],
  },
  {
    id: "precision_boundary",
    name: "The precision boundary",
    ratingZoneMin: 2000,
    ratingZoneMax: 2200,
    whatHappens:
      "Tiny inaccuracies in endgames and deep calculation cost half-points. Time pressure collapses in decisive positions. Requires deepening precision, not broadening knowledge.",
    diagnosisSignal: "Draws/losses in technically won endgames; time-pressure blunders in previously won positions",
    targetSkills: ["calculation_precision", "endgame_precision_conversion", "time_management", "psychological_resilience"],
  },
];

// Runtime completeness assertion: ensure all skills in the SkillId type are defined in SKILL_BY_ID.
// This catches mistakes like adding a skill to the union but forgetting to define it in SKILLS.
function assertSkillCompletion() {
  const expectedSkillIds: SkillId[] = [
    "opening_principles",
    "opening_repertoire",
    "opening_preparation_novelties",
    "strategic_planning",
    "positional_play",
    "patience_long_term_thinking",
    "prophylaxis",
    "tactical_pattern_recognition",
    "tactical_consistency",
    "calculation_precision",
    "attack_initiative",
    "piece_activity_coordination",
    "defence_counterplay",
    "converting_advantages",
    "endgame_principles",
    "game_transition",
    "endgame_precision_conversion",
    "pawn_endings",
    "rook_endings",
    "knight_endings",
    "bishop_mixed_endings",
    "thought_process_candidate_moves",
    "pattern_recognition_speed",
    "intuition_practical_judgment",
    "time_management",
    "psychological_resilience",
    "psychological_warfare",
  ];
  for (const skillId of expectedSkillIds) {
    if (!SKILL_BY_ID[skillId]) {
      throw new Error(`Missing skill definition for ${skillId}`);
    }
  }
}
assertSkillCompletion();
