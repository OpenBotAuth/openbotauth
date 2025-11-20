import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { KeyRound, Sparkles, Copy, Check, Download, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import AuthenticatedNav from "@/components/AuthenticatedNav";
import Footer from "@/components/Footer";

const Setup = () => {
  const navigate = useNavigate();
  const [publicKey, setPublicKey] = useState("");
  const [publicKeyPEM, setPublicKeyPEM] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [kid, setKid] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [username, setUsername] = useState<string>("");
  const [showKeys, setShowKeys] = useState(false);
  const [copiedPrivate, setCopiedPrivate] = useState(false);
  const [copiedKid, setCopiedKid] = useState(false);
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

  // Generate KID from public key (SHA-256 hash, first 16 chars)
  const generateKid = async (publicKeyBase64: string): Promise<string> => {
    const encoder = new TextEncoder();
    const data = encoder.encode(publicKeyBase64);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashBase64 = btoa(String.fromCharCode(...hashArray));
    // Convert to base64url and take first 16 chars
    const base64url = hashBase64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    return base64url.substring(0, 16);
  };

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

      // Generate KID
      const generatedKid = await generateKid(publicKeyBase64);

      setPublicKey(publicKeyBase64);
      setPublicKeyPEM(publicKeyPEM);
      setPrivateKey(privateKeyPEM);
      setKid(generatedKid);
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

  const copyKid = () => {
    navigator.clipboard.writeText(kid);
    setCopiedKid(true);
    toast.success("Key ID (KID) copied to clipboard!");
    setTimeout(() => setCopiedKid(false), 2000);
  };

  const downloadPrivateKey = () => {
    // Create a comprehensive file with all key information
    const content = `OpenBotAuth Key Pair
Generated: ${new Date().toISOString()}
Username: ${username}
JWKS URL: https://api.openbotauth.org/jwks/${username}.json

==============================================
KEY ID (KID)
==============================================
${kid}

Use this KID in the 'keyid' parameter when signing HTTP requests with RFC 9421.

==============================================
PRIVATE KEY (Keep this secret!)
==============================================
${privateKey}

==============================================
PUBLIC KEY (PEM Format)
==============================================
${publicKeyPEM}

==============================================
PUBLIC KEY (Base64 - for registration)
==============================================
${publicKey}

==============================================
IMPORTANT NOTES
==============================================
- Store your private key securely and never share it
- The public key is already registered in your JWKS endpoint
- Use the KID when creating HTTP Message Signatures (RFC 9421)
- Your JWKS URL is publicly accessible for verification
`;

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `openbotauth-keys-${username}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("All keys downloaded!");
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
      <AuthenticatedNav />

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8 max-w-3xl">
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() => navigate(-1)}
            className="mb-2"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <h1 className="text-3xl font-bold">
            {isUpdating ? "Update Your Key" : "Setup Your Account"}
          </h1>
        </div>
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

              {/* Generated Keys Display - All in one container */}
              {showKeys && privateKey && (
                <Card className="border-2 border-accent">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <KeyRound className="w-5 h-5 text-accent" />
                        <CardTitle>Your Generated Keys</CardTitle>
                      </div>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={downloadPrivateKey}
                        className="bg-accent hover:bg-accent/90"
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Download All Keys
                      </Button>
                    </div>
                    <CardDescription>
                      Save all your keys securely. This is the only time you'll see your private key!
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Private Key */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-base font-semibold text-accent">Private Key</Label>
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
                      </div>
                      <Alert className="bg-accent/5 border-accent/20">
                        <AlertDescription>
                          <div className="p-2 bg-background rounded">
                            <pre className="text-xs font-mono whitespace-pre-wrap break-all">
                              {privateKey}
                            </pre>
                          </div>
                        </AlertDescription>
                      </Alert>
                    </div>

                    {/* Public Key */}
                    {publicKeyPEM && (
                      <div className="space-y-2">
                        <Label className="text-base font-semibold">Public Key</Label>
                        <p className="text-xs text-muted-foreground">
                          Your public key will be hosted at your JWKS endpoint
                        </p>
                        <div className="p-3 bg-muted rounded-lg">
                          <pre className="text-xs font-mono whitespace-pre-wrap break-all">
                            {publicKeyPEM}
                          </pre>
                        </div>
                      </div>
                    )}

                    {/* Key ID (KID) */}
                    {kid && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-base font-semibold">Key ID (KID)</Label>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={copyKid}
                          >
                            {copiedKid ? (
                              <Check className="w-4 h-4 text-accent" />
                            ) : (
                              <Copy className="w-4 h-4" />
                            )}
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Use this KID when signing HTTP requests with RFC 9421
                        </p>
                        <div className="p-3 bg-muted rounded-lg">
                          <code className="text-sm font-mono break-all">
                            {kid}
                          </code>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Public Key Input - Only show if keys weren't generated */}
              <form onSubmit={handleSubmit} className="space-y-6">
                {!showKeys && (
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
                )}

                <div className="flex gap-4">
                  {isUpdating && (
                    <Button type="button" variant="outline" onClick={() => navigate(`/${username}`)}>
                      Cancel
                    </Button>
                  )}
                  {!isUpdating && (
                    <Button type="button" variant="outline" onClick={() => navigate(-1)}>
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
      <Footer />
    </div>
  );
};

export default Setup;
