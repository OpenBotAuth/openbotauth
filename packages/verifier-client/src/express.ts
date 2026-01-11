// Express middleware subpath export
// Import from '@openbotauth/verifier-client/express' to avoid
// pulling Express types into projects that don't use Express.

export { openBotAuthMiddleware } from './middleware.js';
export type { MiddlewareOptions, RequestVerificationInfo } from './types.js';
