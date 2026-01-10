// Types
export type {
  VerificationRequest,
  VerificationResult,
  VerifiedAgent,
  VerifierClientOptions,
  MiddlewareOptions,
  RequestVerificationInfo,
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

// Express middleware
export { openBotAuthMiddleware } from './middleware.js';

// Next.js helpers
export {
  extractFromNextHeaders,
  buildVerifyRequestForNext,
  buildVerifyRequestForNextWithBody,
} from './nextjs.js';
