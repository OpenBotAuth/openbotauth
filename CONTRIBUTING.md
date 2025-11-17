# Contributing to OpenBotAuth

Thank you for your interest in contributing to OpenBotAuth! This document provides guidelines and instructions for contributing.

---

## Code of Conduct

Be respectful, inclusive, and constructive. We're building this together.

---

## How to Contribute

### Reporting Bugs

1. Check if the bug has already been reported in [Issues](https://github.com/OpenBotAuth/openbotauth/issues)
2. If not, create a new issue with:
   - Clear title and description
   - Steps to reproduce
   - Expected vs actual behavior
   - Environment details (Node version, OS, etc.)
   - Relevant logs or screenshots

### Suggesting Features

1. Check if the feature has been suggested in [Issues](https://github.com/OpenBotAuth/openbotauth/issues)
2. If not, create a new issue with:
   - Clear use case
   - Proposed solution
   - Alternatives considered
   - Impact on existing functionality

### Pull Requests

1. **Fork the repository**
   ```bash
   git clone https://github.com/yourusername/openbotauth.git
   cd openbotauth
   ```

2. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **Make your changes**
   - Follow the existing code style
   - Add tests if applicable
   - Update documentation

4. **Test your changes**
   ```bash
   pnpm install
   pnpm build
   pnpm lint
   # Test manually
   ```

5. **Commit with clear messages**
   ```bash
   git commit -m "feat: add new feature"
   git commit -m "fix: resolve bug in verifier"
   git commit -m "docs: update setup guide"
   ```

6. **Push to your fork**
   ```bash
   git push origin feature/your-feature-name
   ```

7. **Open a Pull Request**
   - Describe what changed and why
   - Reference related issues
   - Include screenshots if UI changes

---

## Development Setup

See [SETUP.md](SETUP.md) for detailed setup instructions.

Quick start:
```bash
pnpm install
pnpm build
pnpm dev:service    # Terminal 1
pnpm dev:portal     # Terminal 2
```

---

## Code Style

- **TypeScript** for all Node.js code
- **ESLint** for linting (run `pnpm lint`)
- **Prettier** for formatting (configured in ESLint)
- **Conventional Commits** for commit messages

### Commit Message Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

**Examples:**
```
feat(verifier): add nonce replay protection
fix(registry): resolve JWKS caching issue
docs(setup): add WordPress plugin instructions
```

---

## Project Structure

```
openbotauth/
├── packages/           # Node.js packages
│   ├── registry-service/
│   ├── verifier-service/
│   ├── bot-cli/
│   └── ...
├── apps/              # Applications
│   ├── registry-portal/
│   └── test-server/
├── plugins/           # WordPress plugins
│   └── wordpress-openbotauth/
├── infra/            # Infrastructure
│   ├── neon/
│   └── docker/
└── docs/             # Documentation
```

---

## Testing

### Manual Testing

1. Start all services
2. Test the complete flow:
   - GitHub OAuth login
   - Key generation and registration
   - Signed request verification
   - Policy enforcement

### Automated Testing

```bash
# Run tests (when implemented)
pnpm test

# Run specific package tests
cd packages/verifier-service
pnpm test
```

---

## Documentation

- Update README.md for user-facing changes
- Update SETUP.md for setup process changes
- Add/update docs/ for architectural changes
- Include inline code comments for complex logic
- Update package READMEs for package-specific changes

---

## Areas for Contribution

### High Priority

- [ ] Unit tests for all packages
- [ ] Integration tests for end-to-end flow
- [ ] CI/CD pipeline (GitHub Actions)
- [ ] Docker Compose for production
- [ ] Kubernetes manifests
- [ ] Performance benchmarks
- [ ] Security audit

### Features

- [ ] Additional signature algorithms (RSA, ECDSA)
- [ ] Rate limiting middleware
- [ ] Admin dashboard
- [ ] Analytics and reporting
- [ ] Webhook support
- [ ] Multi-tenancy support

### Documentation

- [ ] Video tutorials
- [ ] Architecture diagrams
- [ ] API documentation (OpenAPI/Swagger)
- [ ] Deployment guides (AWS, GCP, Azure)
- [ ] Troubleshooting guide

### WordPress Plugin

- [ ] Gutenberg block for policy management
- [ ] WooCommerce integration
- [ ] Payment gateway integrations
- [ ] Analytics dashboard
- [ ] A/B testing for policies

---

## Questions?

- Open a [Discussion](https://github.com/OpenBotAuth/openbotauth/discussions)
- Join our community (link TBD)
- Email: security@openbotauth.org

---

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

**Thank you for contributing! 🙏**

