import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { KeyRound, Sparkles, Copy, Check, Download } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";

const Setup = () => {
  const navigate = useNavigate();
  const [publicKey, setPublicKey] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [username, setUsername] = useState<string>("");
  const [showKeys, setShowKeys] = useState(false);
  const [copiedPrivate, setCopiedPrivate] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const session = await api.getSession();
        if (!session) {
          navigate("/login");
          return;
        }
        setUserId(session.user.id);
        setUsername(session.profile.username);

        // Check if we're in update mode
        const urlParams = new URLSearchParams(window.location.search);
        const updateMode = urlParams.get('update') === 'true';
        setIsUpdating(updateMode);

        // For now, we'll skip the key check and let users register keys
        // TODO: Add API endpoint to check if user has keys
      } catch (error) {
        console.error('Auth check error:', error);
        navigate("/login");
      }
    };
    checkAuth();
  }, [navigate]);

  const generateKeyPair = async () => {
    setIsGenerating(true);
    try {
      // Generate Ed25519 key pair
      const keyPair = await window.crypto.subtle.generateKey(
        {
          name: "Ed25519",
        },
        true, // extractable
        ["sign", "verify"]
      );

      // Export public key
      const publicKeyBuffer = await window.crypto.subtle.exportKey(
        "spki",
        keyPair.publicKey
      );
      const publicKeyBase64 = btoa(
        String.fromCharCode(...new Uint8Array(publicKeyBuffer))
      );

      // Export private key
      const privateKeyBuffer = await window.crypto.subtle.exportKey(
        "pkcs8",
        keyPair.privateKey
      );
      const privateKeyBase64 = btoa(
        String.fromCharCode(...new Uint8Array(privateKeyBuffer))
      );

      // Format as PEM
      const publicKeyPEM = `-----BEGIN PUBLIC KEY-----\n${publicKeyBase64.match(/.{1,64}/g)?.join('\n')}\n-----END PUBLIC KEY-----`;
      const privateKeyPEM = `-----BEGIN PRIVATE KEY-----\n${privateKeyBase64.match(/.{1,64}/g)?.join('\n')}\n-----END PRIVATE KEY-----`;

      setPublicKey(publicKeyBase64);
      setPrivateKey(privateKeyPEM);
      setShowKeys(true);
      
      toast.success("Key pair generated successfully!");
    } catch (error) {
      console.error("Error generating keys:", error);
      toast.error("Failed to generate key pair. Your browser may not support Ed25519.");
    } finally {
      setIsGenerating(false);
    }
  };

  const copyPrivateKey = () => {
    navigator.clipboard.writeText(privateKey);
    setCopiedPrivate(true);
    toast.success("Private key copied to clipboard!");
    setTimeout(() => setCopiedPrivate(false), 2000);
  };

  const downloadPrivateKey = () => {
    const blob = new Blob([privateKey], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'private_key.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Private key downloaded!");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!publicKey.trim()) {
      toast.error("Please enter your public key");
      return;
    }

    if (!userId) {
      toast.error("User not authenticated");
      return;
    }

    setIsSubmitting(true);

    try {
      await api.registerPublicKey(publicKey, isUpdating);
      
      toast.success(isUpdating ? "Public key updated successfully!" : "Public key registered successfully!");
      navigate(`/${username}`);
    } catch (error: any) {
      console.error("Error registering public key:", error);
      toast.error(error.message || "Failed to register public key");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <h1 className="text-xl font-bold">
            {isUpdating ? "Update Your Key" : "Setup Your Account"}
          </h1>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8 max-w-3xl">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{isUpdating ? "Update Your Public Key" : "Register Your Bot"}</CardTitle>
              <CardDescription>
                {isUpdating ? "Generate a new Ed25519 key pair" : "Set up your Ed25519 public key for bot authentication"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Generate Key Pair Button */}
              <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg bg-muted/50">
                <KeyRound className="w-12 h-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">Need a Key Pair?</h3>
                <p className="text-sm text-muted-foreground text-center mb-4">
                  Generate a secure Ed25519 key pair automatically
                </p>
                <Button
                  onClick={generateKeyPair}
                  disabled={isGenerating}
                  className="bg-accent hover:bg-accent/90"
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  {isGenerating ? "Generating..." : "Generate Key Pair for Me"}
                </Button>
              </div>

              {/* Generated Keys Display */}
              {showKeys && privateKey && (
                <Alert className="border-accent bg-accent/5">
                  <AlertDescription className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <KeyRound className="w-5 h-5 text-accent" />
                        <span className="font-semibold text-accent">Save Your Private Key</span>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={copyPrivateKey}
                        >
                          {copiedPrivate ? (
                            <Check className="w-4 h-4 text-accent" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={downloadPrivateKey}
                        >
                          <Download className="w-4 h-4 mr-2" />
                          Download TXT
                        </Button>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      This is the only time you'll see your private key. Copy and store it securely!
                    </p>
                    <div className="p-3 bg-background rounded-lg">
                      <pre className="text-xs font-mono whitespace-pre-wrap break-all">
                        {privateKey}
                      </pre>
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              {/* Public Key Input */}
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="publicKey">Public Key</Label>
                  <Textarea
                    id="publicKey"
                    placeholder="Enter your Ed25519 public key (Base64 encoded)"
                    value={publicKey}
                    onChange={(e) => setPublicKey(e.target.value)}
                    className="min-h-[100px] font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Your public key will be hosted at a JWKS endpoint for bot authentication
                  </p>
                </div>

                <div className="flex gap-4">
                  {isUpdating && (
                    <Button type="button" variant="outline" onClick={() => navigate(`/${username}`)}>
                      Cancel
                    </Button>
                  )}
                  {!isUpdating && (
                    <Button type="button" variant="outline" onClick={() => navigate("/")}>
                      Back
                    </Button>
                  )}
                  <Button 
                    type="submit"
                    disabled={!publicKey.trim() || isSubmitting}
                    className="bg-accent hover:bg-accent/90"
                  >
                    {isSubmitting ? (isUpdating ? "Updating..." : "Registering...") : (isUpdating ? "Update Key" : "Register My Key")}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default Setup;
