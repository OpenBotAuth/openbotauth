# Changelog

All notable changes to the OpenBotAuth WordPress Plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] - 2025-11-20

### Security
- **BREAKING**: Changed default policy from `allow` to `teaser` for secure-by-default behavior
- Plugin now fails securely when verifier service is unreachable (shows teaser instead of full content)

### Added
- `X-OBA-Decision` header now included in all responses to indicate policy decision
- Proper HTTP status codes for all policy effects:
  - `403 Forbidden` for denied requests
  - `402 Payment Required` for payment-required content
  - `429 Too Many Requests` for rate-limited requests
- Enhanced error logging for verifier connection issues
- Better HTTP status code validation in verifier responses

### Changed
- Default policy effect changed from `allow` to `teaser` (100 words)
- ContentFilter now properly handles all policy effects (deny, pay, rate_limit)
- Improved error messages in verifier service communication

### Fixed
- Fixed issue where both signed and unsigned requests received full content when verifier was unreachable
- Fixed missing `X-OBA-Decision` header in responses
- Fixed improper handling of policy effects (deny, pay, rate_limit were not properly enforced)
- Improved verifier error detection and logging

### Documentation
- Updated README with security notes about default policy
- Added troubleshooting section for `X-OBA-Decision` header
- Clarified expected response headers in testing section
- Added security best practices

## [0.1.0] - 2025-11-17

### Added
- Initial release
- RFC 9421 signature verification via Verifier Service
- Policy engine with allow/deny/teaser effects
- Content teaser support (first N words)
- 402 Payment Required flow
- Rate limiting per agent
- Whitelist/blacklist support
- Per-post policy overrides
- Admin settings UI
- Policy JSON editor
- REST API endpoints
- Frontend teaser styles
- Dark mode support

### Features
- ✅ Signature verification
- 🎭 Content teasers
- 💰 Payment flow (402)
- 🚦 Rate limiting
- 🎯 Access control (whitelist/blacklist)
- 📊 Analytics ready

### Documentation
- Comprehensive README
- Installation guide
- Policy configuration examples
- API reference
- Troubleshooting guide

## [Unreleased]

### Planned
- Analytics dashboard
- Payment provider integrations (Stripe, PayPal)
- Receipt verification
- Webhook support for payments
- Advanced logging
- Performance optimizations
- Unit tests
- Integration tests

