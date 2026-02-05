import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Github, Copy, Check, AlertTriangle, Star } from "lucide-react";
import { api, type ApiToken } from "@/lib/api";
import AuthenticatedNav from "@/components/AuthenticatedNav";

const TOKEN_NAME = "agent-token";

const Token = () => {
  const [session, setSession] = useState<Awaited<ReturnType<typeof api.getSession>>>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existingToken, setExistingToken] = useState<ApiToken | null>(null);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const s = await api.getSession();
        setSession(s);
        if (s) {
          const tokens = await api.listTokens();
          const existing = tokens.find((t) => t.name === TOKEN_NAME);
          if (existing) setExistingToken(existing);
        }
      } catch {
        // not logged in
      } finally {
        setLoading(false);
      }
    };
    checkSession();
  }, []);

  const handleLogin = () => {
    window.location.href = api.getGitHubLoginUrl("/token");
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      // Revoke existing agent-token before creating a new one
      if (existingToken) {
        await api.deleteToken(existingToken.id);
        setExistingToken(null);
      }
      const result = await api.createToken({
        name: TOKEN_NAME,
        scopes: ["agents:write", "keys:write", "profile:read"],
        expires_in_days: 90,
      });
      setToken(result.token);
    } catch (err) {
      // Re-sync existing token state in case delete succeeded but create failed
      try {
        const tokens = await api.listTokens();
        const existing = tokens.find((t) => t.name === TOKEN_NAME);
        setExistingToken(existing ?? null);
      } catch { /* ignore */ }
      setError(err instanceof Error ? err.message : "Failed to create token");
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback for older browsers
      const textarea = document.createElement("textarea");
      textarea.value = token;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <AuthenticatedNav />

      <main className="container mx-auto px-4 py-16 max-w-lg">
        {!session ? (
          /* Not logged in */
          <Card>
            <CardHeader className="text-center">
              <CardTitle className="text-2xl">Get a Token for Your Agent</CardTitle>
              <CardDescription>
                Your AI agent needs a token to register its cryptographic identity.
                Log in with GitHub to generate one.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center">
              <Button onClick={handleLogin} className="h-12 px-8 text-base">
                <Github className="mr-2 h-5 w-5" />
                Log in with GitHub
              </Button>
            </CardContent>
          </Card>
        ) : token ? (
          /* Token generated */
          <Card>
            <CardHeader className="text-center">
              <CardTitle className="text-2xl">Your Agent Token</CardTitle>
              <CardDescription>
                Copy this and give it to your agent. It won't be shown again.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-muted p-3 rounded-md text-sm font-mono break-all select-all">
                  {token}
                </code>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleCopy}
                  className="shrink-0"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-green-600" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>

              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Shown only once</AlertTitle>
                <AlertDescription>
                  This token is not stored in plaintext. If you lose it, revoke it
                  from <a href="/tokens" className="underline">API Tokens</a> and
                  create a new one.
                </AlertDescription>
              </Alert>

              <div className="text-sm text-muted-foreground space-y-1">
                <p><strong>Scopes:</strong> agents:write, keys:write, profile:read</p>
                <p><strong>Expires:</strong> 90 days</p>
              </div>

              <div className="pt-2 border-t text-center">
                <a
                  href="https://github.com/OpenBotAuth/openbotauth"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button variant="outline" size="sm" className="gap-2">
                    <Star className="h-4 w-4" />
                    Star us on GitHub
                  </Button>
                </a>
              </div>
            </CardContent>
          </Card>
        ) : (
          /* Logged in, ready to generate */
          <Card>
            <CardHeader className="text-center">
              <CardTitle className="text-2xl">Generate Agent Token</CardTitle>
              <CardDescription>
                Logged in as <strong>{session.profile.username}</strong>.
                Generate a personal access token with the minimum scopes your agent needs.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-sm text-muted-foreground space-y-1">
                <p><strong>Scopes:</strong></p>
                <ul className="list-disc list-inside ml-2 space-y-0.5">
                  <li><code className="text-xs">agents:write</code> — register an agent</li>
                  <li><code className="text-xs">keys:write</code> — register/rotate key material</li>
                  <li><code className="text-xs">profile:read</code> — read profile info</li>
                </ul>
                <p className="pt-1"><strong>Expires:</strong> 90 days</p>
              </div>

              {existingToken && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Existing token found</AlertTitle>
                  <AlertDescription>
                    You already have an agent token ({existingToken.token_prefix}...).
                    Generating a new one will revoke the old one.
                  </AlertDescription>
                </Alert>
              )}

              {error && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Button
                onClick={handleGenerate}
                disabled={generating}
                className="w-full h-12 text-base"
              >
                {generating ? "Generating..." : existingToken ? "Revoke & Generate New Token" : "Generate Token"}
              </Button>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
};

export default Token;
