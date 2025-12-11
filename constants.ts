import { AvatarId } from './types';
import { Terminal, Bot, Zap, Eye, Skull } from 'lucide-react';

export const AVATARS: Record<AvatarId, { label: string; color: string; icon: any }> = {
  'cyber-punk': { label: 'Net Runner', color: 'text-cyan-400', icon: Terminal },
  'neon-cat': { label: 'Neon Felis', color: 'text-pink-500', icon: Bot },
  'robo-face': { label: 'Android', color: 'text-emerald-400', icon: Zap },
  'hacker-skull': { label: 'Void Dweller', color: 'text-purple-500', icon: Skull },
  'matrix-eye': { label: 'Observer', color: 'text-yellow-400', icon: Eye },
};

export const EMOJIS = ['🔥', '👀', '⚡', '☕', '🚫', '👏', '💤', '🚨'];

export const ACTIVITY_DECAY_RATE = 4; // Points lost per tick if idle
export const MOUSE_ACTIVITY_BOOST = 10;
export const KEY_ACTIVITY_BOOST = 15;
export const FACE_DETECTED_SCORE = 100;
export const MAX_USERS = 4;