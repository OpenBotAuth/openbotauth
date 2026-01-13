import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig } from './config.js';

describe('loadConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns default values when no env vars set', () => {
    delete process.env.PORT;
    delete process.env.UPSTREAM_URL;
    delete process.env.OBA_VERIFIER_URL;
    delete process.env.OBA_MODE;
    delete process.env.OBA_TIMEOUT_MS;
    delete process.env.OBA_PROTECTED_PATHS;

    const config = loadConfig();

    expect(config.port).toBe(8088);
    expect(config.upstreamUrl).toBe('http://apache:8080');
    expect(config.verifierUrl).toBe('https://verifier.openbotauth.org/verify');
    expect(config.mode).toBe('observe');
    expect(config.timeoutMs).toBe(5000);
    expect(config.protectedPaths).toEqual(['/protected']);
  });

  it('respects PORT env var', () => {
    process.env.PORT = '9000';
    const config = loadConfig();
    expect(config.port).toBe(9000);
  });

  it('respects UPSTREAM_URL env var', () => {
    process.env.UPSTREAM_URL = 'http://myapache:80';
    const config = loadConfig();
    expect(config.upstreamUrl).toBe('http://myapache:80');
  });

  it('respects OBA_VERIFIER_URL env var', () => {
    process.env.OBA_VERIFIER_URL = 'http://localhost:8081/verify';
    const config = loadConfig();
    expect(config.verifierUrl).toBe('http://localhost:8081/verify');
  });

  it('respects OBA_MODE observe', () => {
    process.env.OBA_MODE = 'observe';
    const config = loadConfig();
    expect(config.mode).toBe('observe');
  });

  it('respects OBA_MODE require-verified', () => {
    process.env.OBA_MODE = 'require-verified';
    const config = loadConfig();
    expect(config.mode).toBe('require-verified');
  });

  it('throws on invalid OBA_MODE', () => {
    process.env.OBA_MODE = 'invalid';
    expect(() => loadConfig()).toThrow("Invalid OBA_MODE: invalid");
  });

  it('respects OBA_TIMEOUT_MS env var', () => {
    process.env.OBA_TIMEOUT_MS = '10000';
    const config = loadConfig();
    expect(config.timeoutMs).toBe(10000);
  });

  it('respects OBA_PROTECTED_PATHS env var with single path', () => {
    process.env.OBA_PROTECTED_PATHS = '/admin';
    const config = loadConfig();
    expect(config.protectedPaths).toEqual(['/admin']);
  });

  it('respects OBA_PROTECTED_PATHS env var with multiple paths', () => {
    process.env.OBA_PROTECTED_PATHS = '/admin,/api,/protected';
    const config = loadConfig();
    expect(config.protectedPaths).toEqual(['/admin', '/api', '/protected']);
  });

  it('trims whitespace from protected paths', () => {
    process.env.OBA_PROTECTED_PATHS = '/admin , /api , /protected';
    const config = loadConfig();
    expect(config.protectedPaths).toEqual(['/admin', '/api', '/protected']);
  });

  it('filters empty protected paths', () => {
    process.env.OBA_PROTECTED_PATHS = '/admin,,/api,';
    const config = loadConfig();
    expect(config.protectedPaths).toEqual(['/admin', '/api']);
  });
});
