// Types
export type {
  VerificationRequest,
  VerificationResult,
  VerifiedAgent,
  VerifierClientOptions,
  HeaderExtractionResult,
} from './types.js';

// Core client
export { VerifierClient } from './client.js';

// Header extraction helpers
export {
  parseCoveredHeaders,
  extractForwardedHeaders,
  hasSignatureHeaders,
} from './headers.js';

// Next.js helpers
export {
  extractFromNextHeaders,
  buildVerifyRequestForNext,
  buildVerifyRequestForNextWithBody,
} from './nextjs.js';

// Express middleware is available via subpath import:
// import { openBotAuthMiddleware } from '@openbotauth/verifier-client/express';
