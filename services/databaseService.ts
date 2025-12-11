import { createClient } from '@supabase/supabase-js';
import { Participant, SessionState, PingEvent } from '../types';

const supabaseUrl = 'https://pwezhzazdqvyxizdiskl.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB3ZXpoemF6ZHF2eXhpemRpc2tsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA2NzE4MTUsImV4cCI6MjA2NjI0NzgxNX0.gJtS2nZlYMaOi559iczBxSZNHmyfLenoMfhk-2IV41g';

const supabase = createClient(supabaseUrl, supabaseKey);

const STALE_THRESHOLD_MS = 10000; // 10 seconds without heartbeat = user is gone

class DatabaseService {

  // --- Session Management ---

  async createSession(): Promise<SessionState | null> {
    const id = Math.random().toString(36).substring(2, 9);
    const session: SessionState = {
      id,
      startTime: Date.now(),
      durationMinutes: 25,
      status: 'idle',
      participantIds: []
    };

    const { error } = await supabase
      .from('session_db')
      .insert({
        id,
        type: 'session',
        data: session,
        session_id: id,
        updated_at: new Date().toISOString()
      });

    if (error) {
      console.error('Create session error:', error);
      throw new Error('Failed to create session');
    }

    return session;
  }

  async getAvailableSessions(): Promise<SessionState[]> {
    // First, clean up stale users
    await this.cleanupStaleUsers();

    const { data, error } = await supabase
      .from('session_db')
      .select('*')
      .eq('type', 'session');

    if (error || !data) return [];

    // Filter sessions with capacity (less than 4 participants)
    const sessions = data
      .map(row => row.data as SessionState)
      .filter(s => s.participantIds.length < 4)
      .sort((a, b) => b.startTime - a.startTime);

    return sessions;
  }

  async joinSession(sessionId: string, user: Participant): Promise<SessionState> {
    // Get session
    const { data: sessionRow, error: fetchError } = await supabase
      .from('session_db')
      .select('*')
      .eq('id', sessionId)
      .eq('type', 'session')
      .single();

    if (fetchError || !sessionRow) {
      throw new Error('Session not found');
    }

    const session = sessionRow.data as SessionState;

    // Add user if not exists
    if (!session.participantIds.includes(user.id)) {
      if (session.participantIds.length >= 4) {
        throw new Error('Session full');
      }
      session.participantIds.push(user.id);
    }

    // Update session
    await supabase
      .from('session_db')
      .update({
        data: session,
        updated_at: new Date().toISOString()
      })
      .eq('id', sessionId);

    // Create/update participant record
    await supabase
      .from('session_db')
      .upsert({
        id: user.id,
        type: 'participant',
        data: { ...user, lastHeartbeat: Date.now() },
        session_id: sessionId,
        updated_at: new Date().toISOString()
      });

    return session;
  }

  // --- Participant Management ---

  async updateParticipant(user: Participant) {
    await supabase
      .from('session_db')
      .update({
        data: { ...user, lastHeartbeat: Date.now() },
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id)
      .eq('type', 'participant');
  }

  async removeParticipant(userId: string) {
    // Get participant to find session
    const { data: participantRow } = await supabase
      .from('session_db')
      .select('*')
      .eq('id', userId)
      .eq('type', 'participant')
      .single();

    if (participantRow) {
      const sessionId = participantRow.session_id;

      // Remove from session's participantIds
      const { data: sessionRow } = await supabase
        .from('session_db')
        .select('*')
        .eq('id', sessionId)
        .eq('type', 'session')
        .single();

      if (sessionRow) {
        const session = sessionRow.data as SessionState;
        session.participantIds = session.participantIds.filter(id => id !== userId);

        if (session.participantIds.length === 0) {
          // Delete empty session
          await supabase
            .from('session_db')
            .delete()
            .eq('id', sessionId);
        } else {
          // Update session
          await supabase
            .from('session_db')
            .update({
              data: session,
              updated_at: new Date().toISOString()
            })
            .eq('id', sessionId);
        }
      }
    }

    // Delete participant
    await supabase
      .from('session_db')
      .delete()
      .eq('id', userId)
      .eq('type', 'participant');
  }

  async getParticipants(sessionId: string): Promise<Participant[]> {
    // First cleanup stale users
    await this.cleanupStaleUsers();

    const { data, error } = await supabase
      .from('session_db')
      .select('*')
      .eq('type', 'participant')
      .eq('session_id', sessionId);

    if (error || !data) return [];

    return data.map(row => {
      const p = row.data as Participant & { lastHeartbeat?: number };
      // Remove lastHeartbeat from returned data
      const { lastHeartbeat, ...participant } = p;
      return participant as Participant;
    });
  }

  // --- Ping System ---

  async sendPing(fromId: string, toId: string, emoji: string) {
    const id = Math.random().toString(36).substring(2, 9);

    await supabase
      .from('session_db')
      .insert({
        id,
        type: 'ping',
        data: {
          id,
          fromUserId: fromId,
          toUserId: toId,
          emoji,
          timestamp: Date.now()
        },
        session_id: null,
        updated_at: new Date().toISOString()
      });
  }

  async getRecentPings(userId: string): Promise<PingEvent[]> {
    const { data, error } = await supabase
      .from('session_db')
      .select('*')
      .eq('type', 'ping');

    if (error || !data) return [];

    const now = Date.now();
    const pings = data
      .map(row => row.data as PingEvent)
      .filter(p => p.toUserId === userId && now - p.timestamp < 3000);

    // Clean up old pings (older than 10 seconds)
    const oldPingIds = data
      .filter(row => now - (row.data as PingEvent).timestamp > 10000)
      .map(row => row.id);

    if (oldPingIds.length > 0) {
      await supabase
        .from('session_db')
        .delete()
        .in('id', oldPingIds);
    }

    return pings;
  }

  // --- Cleanup ---

  private async cleanupStaleUsers() {
    const now = Date.now();

    // Get all participants
    const { data: participants } = await supabase
      .from('session_db')
      .select('*')
      .eq('type', 'participant');

    if (!participants) return;

    const staleUsers: string[] = [];

    for (const row of participants) {
      const participant = row.data as Participant & { lastHeartbeat?: number };
      if (participant.lastHeartbeat && now - participant.lastHeartbeat > STALE_THRESHOLD_MS) {
        staleUsers.push(row.id);
      }
    }

    // Remove stale users
    for (const userId of staleUsers) {
      await this.removeParticipant(userId);
    }
  }
}

export const database = new DatabaseService();
