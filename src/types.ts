export interface Stream {
  id: string; userId: string; login: string; name: string; title: string;
  viewers: number; language: string; country: string; avatar: string;
  thumbnail: string; startedAt: string; delta: number | null;
}
export interface Snapshot {
  id: number; capturedAt: number; startedAt: number; gameId: string;
  viewers: number; channels: number; complete: boolean; reason: string | null;
  streams: Stream[];
}
export interface Group {
  code: string; viewers: number; channels: number; delta: number | null;
}
export interface Point { at: number; viewers: number; channels: number; complete: boolean }
export interface DashboardData {
  status: 'live' | 'partial' | 'stale' | 'unconfigured' | 'no-category' | 'error' | 'pending';
  message: string | null; intervalMs: number; nextAttemptAt: number;
  lastAttemptAt: number | null; snapshot: Snapshot | null; previous: Snapshot | null;
  countries: Group[]; languages: Group[]; mappedViewers: number; mappedChannels: number;
  history: Point[]; demo?: boolean;
}
