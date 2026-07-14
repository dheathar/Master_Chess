import type {
  AuthResponse,
  EvidenceReceipt,
  ExplorerResponse,
  GameDetailResponse,
  GameSummary,
  HelpChatMessage,
  HelpChatResponse,
  JourneyResponse,
  LibraryGameSummary,
  LibraryGamesQuery,
  LibraryGamesResponse,
  LoadLibraryGameResponse,
  DrillAttemptResult,
  DrillHintResponse,
  DrillStats,
  DueDrill,
  LoginRequest,
  PlayerHistoryResponse,
  PlayerModelResponse,
  PublicUser,
  RegisterRequest,
  TrainingPlanResponse,
  UploadGamesRequest,
  UploadGamesResponse,
} from "@shared/api";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("mc_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `Request failed with status ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function register(input: RegisterRequest): Promise<AuthResponse> {
  return request<AuthResponse>("/auth/register", { method: "POST", body: JSON.stringify(input) });
}

export async function login(input: LoginRequest): Promise<AuthResponse> {
  return request<AuthResponse>("/auth/login", { method: "POST", body: JSON.stringify(input) });
}

export async function logout(): Promise<void> {
  return request<void>("/auth/logout", { method: "POST" });
}

export async function me(): Promise<{ user: PublicUser }> {
  return request<{ user: PublicUser }>("/auth/me");
}

export async function uploadGames(input: UploadGamesRequest): Promise<UploadGamesResponse> {
  return request<UploadGamesResponse>("/games/upload", { method: "POST", body: JSON.stringify(input) });
}

export async function listGames(): Promise<{ games: GameSummary[] }> {
  return request<{ games: GameSummary[] }>("/games");
}

export async function getGame(gameId: string): Promise<GameDetailResponse> {
  return request<GameDetailResponse>(`/games/${gameId}`);
}

export function streamAnalysisProgress(
  analysisId: string,
  onEvent: (event: { status: string; progress: number; movesDone: number; movesTotal: number }) => void,
): () => void {
  const token = localStorage.getItem("mc_token");
  const source = new EventSource(`/api/games/analysis/${analysisId}/stream?token=${encodeURIComponent(token ?? "")}`);
  source.onmessage = (event) => {
    try {
      onEvent(JSON.parse(event.data));
    } catch {
      // ignore malformed frames
    }
  };
  return () => source.close();
}

export async function getPlayerModel(): Promise<PlayerModelResponse> {
  return request<PlayerModelResponse>("/player-model");
}

export async function getSkillEvidence(skillId: string): Promise<{ receipts: EvidenceReceipt[] }> {
  return request<{ receipts: EvidenceReceipt[] }>(`/player-model/evidence/${skillId}`);
}

export async function getPlayerHistory(): Promise<PlayerHistoryResponse> {
  return request<PlayerHistoryResponse>("/player-model/history");
}

export async function listLibraryGames(
  query: Partial<LibraryGamesQuery> = {},
): Promise<LibraryGamesResponse> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && `${value}`.length > 0) params.set(key, `${value}`);
  }
  const qs = params.toString();
  return request<LibraryGamesResponse>(`/library/games${qs ? `?${qs}` : ""}`);
}

export async function loadLibraryGame(id: string): Promise<LoadLibraryGameResponse> {
  return request<LoadLibraryGameResponse>(`/library/games/${id}/load`, { method: "POST" });
}

export async function getExplorer(fen: string): Promise<ExplorerResponse> {
  return request<ExplorerResponse>(`/library/explorer?fen=${encodeURIComponent(fen)}`);
}

export async function helpChat(
  messages: HelpChatMessage[],
  screen?: string,
): Promise<HelpChatResponse> {
  return request<HelpChatResponse>("/help/chat", {
    method: "POST",
    body: JSON.stringify({ messages, screen }),
  });
}

export async function getJourney(): Promise<JourneyResponse> {
  return request<JourneyResponse>("/journey");
}

export async function getDueDrills(): Promise<{ drills: DueDrill[] }> {
  return request<{ drills: DueDrill[] }>("/drills/due");
}

export async function getDrillStats(): Promise<DrillStats> {
  // Send the browser's tz offset so the day-streak is computed in the user's local days.
  return request<DrillStats>(`/drills/stats?tzOffset=${new Date().getTimezoneOffset()}`);
}

export async function submitDrillAttempt(
  drillId: string,
  answeredUci: string,
  msTaken: number | null,
  hinted = false,
): Promise<DrillAttemptResult> {
  return request<DrillAttemptResult>(`/drills/${drillId}/attempt`, {
    method: "POST",
    body: JSON.stringify({ answeredUci, msTaken, hinted }),
  });
}

export async function getDrillHint(drillId: string, level: number): Promise<DrillHintResponse> {
  return request<DrillHintResponse>(`/drills/${drillId}/hint`, {
    method: "POST",
    body: JSON.stringify({ level }),
  });
}

export async function getTrainingPlan(): Promise<TrainingPlanResponse> {
  return request<TrainingPlanResponse>("/prescription");
}

export async function exportMyData(): Promise<unknown> {
  return request<unknown>("/auth/gdpr/export");
}

export async function deleteMyAccount(): Promise<void> {
  return request<void>("/auth/gdpr/delete", { method: "POST" });
}
