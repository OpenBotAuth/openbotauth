import { describe, it, expect } from 'vitest';
import { matchesProtectedPrefix, isProtectedPath } from './paths.js';

describe('matchesProtectedPrefix', () => {
  describe('with prefix /protected', () => {
    const prefix = '/protected';

    it('matches exact path', () => {
      expect(matchesProtectedPrefix('/protected', prefix)).toBe(true);
    });

    it('matches path with trailing slash', () => {
      expect(matchesProtectedPrefix('/protected/', prefix)).toBe(true);
    });

    it('matches subdirectory path', () => {
      expect(matchesProtectedPrefix('/protected/x', prefix)).toBe(true);
      expect(matchesProtectedPrefix('/protected/foo/bar', prefix)).toBe(true);
    });

    it('matches file extension path', () => {
      expect(matchesProtectedPrefix('/protected.html', prefix)).toBe(true);
      expect(matchesProtectedPrefix('/protected.json', prefix)).toBe(true);
      expect(matchesProtectedPrefix('/protected.txt', prefix)).toBe(true);
    });

    it('does NOT match paths that merely start with prefix string', () => {
      expect(matchesProtectedPrefix('/protectedness', prefix)).toBe(false);
      expect(matchesProtectedPrefix('/protected-other', prefix)).toBe(false);
      expect(matchesProtectedPrefix('/protectedarea', prefix)).toBe(false);
    });

    it('does NOT match unrelated paths', () => {
      expect(matchesProtectedPrefix('/public', prefix)).toBe(false);
      expect(matchesProtectedPrefix('/other/protected', prefix)).toBe(false);
      expect(matchesProtectedPrefix('/', prefix)).toBe(false);
    });
  });

  describe('with prefix /api', () => {
    const prefix = '/api';

    it('matches exact path', () => {
      expect(matchesProtectedPrefix('/api', prefix)).toBe(true);
    });

    it('matches subdirectory paths', () => {
      expect(matchesProtectedPrefix('/api/v1', prefix)).toBe(true);
      expect(matchesProtectedPrefix('/api/users/123', prefix)).toBe(true);
    });

    it('matches file extension path', () => {
      expect(matchesProtectedPrefix('/api.json', prefix)).toBe(true);
    });

    it('does NOT match /apiculture', () => {
      expect(matchesProtectedPrefix('/apiculture', prefix)).toBe(false);
    });

    it('does NOT match /apis', () => {
      expect(matchesProtectedPrefix('/apis', prefix)).toBe(false);
    });
  });

  describe('with prefix ending in slash', () => {
    it('normalizes prefix and matches correctly', () => {
      expect(matchesProtectedPrefix('/protected', '/protected/')).toBe(true);
      expect(matchesProtectedPrefix('/protected/', '/protected/')).toBe(true);
      expect(matchesProtectedPrefix('/protected/x', '/protected/')).toBe(true);
      expect(matchesProtectedPrefix('/protected.html', '/protected/')).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('handles root path prefix', () => {
      expect(matchesProtectedPrefix('/', '/')).toBe(true);
      expect(matchesProtectedPrefix('/anything', '/')).toBe(true);
    });

    it('handles empty pathname', () => {
      expect(matchesProtectedPrefix('', '/protected')).toBe(false);
    });
  });
});

describe('isProtectedPath', () => {
  const protectedPaths = ['/protected', '/api', '/admin'];

  it('returns true when pathname matches any prefix', () => {
    expect(isProtectedPath('/protected.html', protectedPaths)).toBe(true);
    expect(isProtectedPath('/api/v1', protectedPaths)).toBe(true);
    expect(isProtectedPath('/admin', protectedPaths)).toBe(true);
  });

  it('returns false when pathname matches no prefix', () => {
    expect(isProtectedPath('/public', protectedPaths)).toBe(false);
    expect(isProtectedPath('/other', protectedPaths)).toBe(false);
  });

  it('returns false for empty protected paths array', () => {
    expect(isProtectedPath('/protected', [])).toBe(false);
  });
});
