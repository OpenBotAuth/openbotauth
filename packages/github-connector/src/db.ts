/**
 * Database operations for users, profiles, and sessions
 */

import type { Pool, PoolClient } from 'pg';
import type { User, Profile, Session, GitHubUser } from './types.js';

export class Database {
  constructor(private pool: Pool) {}

  /**
   * Get the underlying pool (for direct queries when needed)
   */
  getPool(): Pool {
    return this.pool;
  }

  /**
   * Find user by GitHub ID
   */
  async findUserByGitHubId(githubId: string): Promise<User | null> {
    const result = await this.pool.query<User>(
      'SELECT * FROM users WHERE github_id = $1',
      [githubId]
    );
    return result.rows[0] || null;
  }

  /**
   * Find user by ID
   */
  async findUserById(userId: string): Promise<User | null> {
    const result = await this.pool.query<User>(
      'SELECT * FROM users WHERE id = $1',
      [userId]
    );
    return result.rows[0] || null;
  }

  /**
   * Create a new user from GitHub data
   */
  async createUser(githubUser: GitHubUser): Promise<User> {
    const result = await this.pool.query<User>(
      `INSERT INTO users (email, github_id, github_username, avatar_url)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [
        githubUser.email,
        githubUser.id.toString(),
        githubUser.login,
        githubUser.avatar_url,
      ]
    );
    return result.rows[0];
  }

  /**
   * Update user information
   */
  async updateUser(
    userId: string,
    updates: Partial<Pick<User, 'email' | 'github_username' | 'avatar_url'>>
  ): Promise<User> {
    const result = await this.pool.query<User>(
      `UPDATE users 
       SET email = COALESCE($2, email),
           github_username = COALESCE($3, github_username),
           avatar_url = COALESCE($4, avatar_url),
           updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [userId, updates.email, updates.github_username, updates.avatar_url]
    );
    return result.rows[0];
  }

  /**
   * Find profile by user ID
   */
  async findProfileByUserId(userId: string): Promise<Profile | null> {
    const result = await this.pool.query<Profile>(
      'SELECT * FROM profiles WHERE id = $1',
      [userId]
    );
    return result.rows[0] || null;
  }

  /**
   * Find profile by username
   */
  async findProfileByUsername(username: string): Promise<Profile | null> {
    const result = await this.pool.query<Profile>(
      'SELECT * FROM profiles WHERE username = $1',
      [username]
    );
    return result.rows[0] || null;
  }

  /**
   * Create a profile for a new user
   */
  async createProfile(userId: string, username: string): Promise<Profile> {
    const result = await this.pool.query<Profile>(
      `INSERT INTO profiles (id, username, client_name, rfc9309_product_token, rfc9309_compliance, trigger, purpose)
       VALUES ($1, $2, $2, $2, ARRAY['User-Agent'], 'fetcher', 'tdm')
       RETURNING *`,
      [userId, username]
    );
    return result.rows[0];
  }

  /**
   * Update profile
   */
  async updateProfile(
    userId: string,
    updates: Partial<Omit<Profile, 'id' | 'created_at' | 'updated_at'>>
  ): Promise<Profile> {
    const fields: string[] = [];
    const values: unknown[] = [userId];
    let paramIndex = 2;

    Object.entries(updates).forEach(([key, value]) => {
      if (value !== undefined) {
        fields.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    });

    if (fields.length === 0) {
      return (await this.findProfileByUserId(userId))!;
    }

    fields.push('updated_at = now()');

    const result = await this.pool.query<Profile>(
      `UPDATE profiles SET ${fields.join(', ')} WHERE id = $1 RETURNING *`,
      values
    );
    return result.rows[0];
  }

  /**
   * Create a session
   */
  async createSession(
    userId: string,
    sessionToken: string,
    expiresAt: Date
  ): Promise<Session> {
    const result = await this.pool.query<Session>(
      `INSERT INTO sessions (user_id, session_token, expires_at)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [userId, sessionToken, expiresAt]
    );
    return result.rows[0];
  }

  /**
   * Find session by token
   */
  async findSessionByToken(sessionToken: string): Promise<Session | null> {
    const result = await this.pool.query<Session>(
      'SELECT * FROM sessions WHERE session_token = $1 AND expires_at > now()',
      [sessionToken]
    );
    return result.rows[0] || null;
  }

  /**
   * Delete session
   */
  async deleteSession(sessionToken: string): Promise<void> {
    await this.pool.query('DELETE FROM sessions WHERE session_token = $1', [
      sessionToken,
    ]);
  }

  /**
   * Delete expired sessions
   */
  async deleteExpiredSessions(): Promise<number> {
    const result = await this.pool.query(
      'DELETE FROM sessions WHERE expires_at < now()'
    );
    return result.rowCount || 0;
  }

  /**
   * Get user with profile by session token
   */
  async getUserWithProfileBySession(
    sessionToken: string
  ): Promise<{ user: User; profile: Profile } | null> {
    const session = await this.findSessionByToken(sessionToken);
    if (!session) return null;

    const user = await this.findUserById(session.user_id);
    if (!user) return null;

    const profile = await this.findProfileByUserId(user.id);
    if (!profile) return null;

    return { user, profile };
  }

  /**
   * Transaction helper
   */
  async transaction<T>(
    callback: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

