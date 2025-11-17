/**
 * Key Storage for Bot CLI
 * 
 * Stores bot configuration (keys, JWKS URL) in a local file
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { BotConfig } from './types.js';

const CONFIG_DIR = join(homedir(), '.openbotauth');
const CONFIG_FILE = join(CONFIG_DIR, 'bot-config.json');

export class KeyStorage {
  /**
   * Save bot configuration
   */
  static async save(config: BotConfig): Promise<void> {
    // Ensure config directory exists
    if (!existsSync(CONFIG_DIR)) {
      await mkdir(CONFIG_DIR, { recursive: true });
    }

    await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
    console.log(`✅ Configuration saved to ${CONFIG_FILE}`);
  }

  /**
   * Load bot configuration
   */
  static async load(): Promise<BotConfig | null> {
    try {
      if (!existsSync(CONFIG_FILE)) {
        return null;
      }

      const content = await readFile(CONFIG_FILE, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      console.error('Error loading configuration:', error);
      return null;
    }
  }

  /**
   * Check if configuration exists
   */
  static exists(): boolean {
    return existsSync(CONFIG_FILE);
  }

  /**
   * Get configuration file path
   */
  static getConfigPath(): string {
    return CONFIG_FILE;
  }
}

