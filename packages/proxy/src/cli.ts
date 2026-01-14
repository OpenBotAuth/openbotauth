import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * CLI argument overrides for configuration
 */
export interface CLIOptions {
  port?: number;
  upstream?: string;
  verifier?: string;
  mode?: 'observe' | 'require-verified';
  timeout?: number;
  paths?: string;
}

/**
 * Get package version from package.json
 */
function getVersion(): string {
  try {
    const pkgPath = join(__dirname, '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/**
 * Print help message and exit
 */
function printHelp(): void {
  console.log(`
@openbotauth/proxy v${getVersion()}

Reverse proxy for verifying Web Bot Auth / OpenBotAuth signed HTTP requests.

USAGE:
  npx @openbotauth/proxy [OPTIONS]
  openbotauth-proxy [OPTIONS]
  oba-proxy [OPTIONS]

OPTIONS:
  -p, --port <port>          Listen port (default: 8088)
  -u, --upstream <url>       Upstream server URL (default: http://localhost:8080)
  -v, --verifier <url>       Verifier service URL (default: https://verifier.openbotauth.org/verify)
  -m, --mode <mode>          Mode: observe or require-verified (default: observe)
  -t, --timeout <ms>         Verifier timeout in ms (default: 5000)
  --paths <paths>            Comma-separated protected paths (default: /protected)
  -h, --help                 Show this help message
  -V, --version              Show version number

ENVIRONMENT VARIABLES:
  PORT                       Listen port
  UPSTREAM_URL               Upstream server URL
  OBA_VERIFIER_URL           Verifier service URL
  OBA_MODE                   Mode (observe or require-verified)
  OBA_TIMEOUT_MS             Verifier timeout in ms
  OBA_PROTECTED_PATHS        Comma-separated protected paths

CLI arguments take precedence over environment variables.

EXAMPLES:
  # Start with defaults
  npx @openbotauth/proxy

  # Custom upstream
  npx @openbotauth/proxy --upstream http://localhost:3000

  # Require verification on /api paths
  npx @openbotauth/proxy --mode require-verified --paths /api,/protected

  # Using environment variables
  UPSTREAM_URL=http://localhost:3000 npx @openbotauth/proxy

DOCUMENTATION:
  https://openbotauth.org
  https://github.com/OpenBotAuth/openbotauth
`);
}

/**
 * Print version and exit
 */
function printVersion(): void {
  console.log(getVersion());
}

/**
 * Parse CLI arguments
 * Returns null if --help or --version was handled (should exit)
 */
export function parseCLI(args: string[]): CLIOptions | null {
  const options: CLIOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case '-h':
      case '--help':
        printHelp();
        return null;

      case '-V':
      case '--version':
        printVersion();
        return null;

      case '-p':
      case '--port':
        if (nextArg && !nextArg.startsWith('-')) {
          options.port = parseInt(nextArg, 10);
          i++;
        }
        break;

      case '-u':
      case '--upstream':
        if (nextArg && !nextArg.startsWith('-')) {
          options.upstream = nextArg;
          i++;
        }
        break;

      case '-v':
      case '--verifier':
        if (nextArg && !nextArg.startsWith('-')) {
          options.verifier = nextArg;
          i++;
        }
        break;

      case '-m':
      case '--mode':
        if (nextArg && (nextArg === 'observe' || nextArg === 'require-verified')) {
          options.mode = nextArg;
          i++;
        }
        break;

      case '-t':
      case '--timeout':
        if (nextArg && !nextArg.startsWith('-')) {
          options.timeout = parseInt(nextArg, 10);
          i++;
        }
        break;

      case '--paths':
        if (nextArg && !nextArg.startsWith('-')) {
          options.paths = nextArg;
          i++;
        }
        break;
    }
  }

  return options;
}
