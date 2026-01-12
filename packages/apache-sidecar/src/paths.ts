/**
 * Path matching utilities for protected path detection
 */

/**
 * Normalize a path prefix by removing trailing slashes
 */
function normalizePrefix(prefix: string): string {
  return prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
}

/**
 * Check if a pathname matches a protected path prefix.
 *
 * Matches:
 * - Exact match: /protected
 * - Directory match: /protected/anything
 * - File extension match: /protected.html, /protected.json
 *
 * Does NOT match paths that merely start with the prefix string:
 * - /protectedness would NOT match /protected
 *
 * @param pathname - The request pathname to check
 * @param prefix - The protected path prefix
 * @returns true if the pathname matches the prefix
 */
export function matchesProtectedPrefix(pathname: string, prefix: string): boolean {
  const normalizedPrefix = normalizePrefix(prefix);

  // Exact match
  if (pathname === normalizedPrefix) {
    return true;
  }

  // Must start with the prefix
  if (!pathname.startsWith(normalizedPrefix)) {
    return false;
  }

  // Check the character immediately after the prefix
  // Valid boundary characters: '/', '.', or end of string
  const nextChar = pathname[normalizedPrefix.length];
  return nextChar === '/' || nextChar === '.';
}

/**
 * Check if a pathname matches any of the protected path prefixes
 *
 * @param pathname - The request pathname to check
 * @param protectedPaths - Array of protected path prefixes
 * @returns true if the pathname matches any prefix
 */
export function isProtectedPath(pathname: string, protectedPaths: string[]): boolean {
  return protectedPaths.some(prefix => matchesProtectedPrefix(pathname, prefix));
}
