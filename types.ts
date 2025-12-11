export type AvatarId = 'cyber-punk' | 'neon-cat' | 'robo-face' | 'hacker-skull' | 'matrix-eye';

export interface UserSettings {
  name: string;
  avatar: AvatarId;
  monitoring: {
    camera: boolean;
    keyboard: boolean;
    mouse: boolean;
  };
}

export interface PingEvent {
  id: string;
  fromUserId: string;
  toUserId: string;
  emoji: string;
  timestamp: number;
  handled?: boolean; // Local flag to prevent re-playing sound
}

export interface Participant {
  id: string;
  name: string;
  avatar: AvatarId;
  focusScore: number; // 0-100
  isSessionCreator: boolean;
  status: 'active' | 'paused';
  elapsedSeconds: number;
  // We don't store lastPing on the user object directly for the UI anymore, 
  // we fetch pings separately to manage the "who did it" logic
}

export interface SessionState {
  id: string;
  startTime: number;
  durationMinutes: number;
  status: 'idle' | 'running' | 'paused' | 'completed';
  participantIds: string[];
}

export type AppView = 'onboarding' | 'lobby' | 'workspace';

export interface ActivityMetric {
  timestamp: number;
  score: number;
}