import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Key, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface AddAgentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const AddAgentModal = ({ open, onOpenChange, onSuccess }: AddAgentModalProps) => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [agentType, setAgentType] = useState("");
  const [publicKey, setPublicKey] = useState<any>(null);
  const [privateKey, setPrivateKey] = useState<any>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const generateKeyPair = async () => {
    setIsGenerating(true);
    try {
      const keyPair = await crypto.subtle.generateKey(
        {
          name: "Ed25519",
          namedCurve: "Ed25519",
        } as any,
        true,
        ["sign", "verify"]
      );

      const publicKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
      const privateKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);

      // Add additional JWK fields
      const now = Math.floor(Date.now() / 1000);
      const publicKeyWithMetadata = {
        ...publicKeyJwk,
        kid: await generateKid(publicKeyJwk),
        use: "sig",
        nbf: now,
        exp: now + (90 * 24 * 60 * 60), // 90 days
      };

      setPublicKey(publicKeyWithMetadata);
      setPrivateKey(privateKeyJwk);

      toast({
        title: "Keys Generated",
        description: "Ed25519 key pair generated successfully",
      });
    } catch (error) {
      console.error("Error generating keys:", error);
      toast({
        title: "Error",
        description: "Failed to generate key pair",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const generateKid = async (jwk: any): Promise<string> => {
    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify(jwk));
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return btoa(String.fromCharCode(...hashArray)).replace(/=/g, "");
  };

  const downloadPrivateKey = (agentId: string) => {
    const blob = new Blob([JSON.stringify(privateKey, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `agent-${agentId}-private-key.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const createAgent = async () => {
    if (!name || !agentType || !publicKey) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields and generate keys",
        variant: "destructive",
      });
      return;
    }

    setIsCreating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("agents")
        .insert({
          user_id: session.user.id,
          name,
          description,
          agent_type: agentType,
          public_key: publicKey,
          status: "active",
        })
        .select()
        .single();

      if (error) throw error;

      // Download private key
      downloadPrivateKey(data.id);

      toast({
        title: "Agent Created",
        description: `Agent "${name}" created successfully. Private key downloaded.`,
      });

      // Reset form
      setName("");
      setDescription("");
      setAgentType("");
      setPublicKey(null);
      setPrivateKey(null);

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error creating agent:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to create agent",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Agent</DialogTitle>
          <DialogDescription>
            Create a new agent with Ed25519 key pair for Web Bot Authentication
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Agent Name *</Label>
            <Input
              id="name"
              placeholder="My Web Scraper"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Optional description of your agent"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="type">Agent Type *</Label>
            <Select value={agentType} onValueChange={setAgentType}>
              <SelectTrigger>
                <SelectValue placeholder="Select agent type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="web_scraper">Web Scraper</SelectItem>
                <SelectItem value="trading_bot">Trading Bot</SelectItem>
                <SelectItem value="research_assistant">Research Assistant</SelectItem>
                <SelectItem value="automation">Automation</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Cryptographic Keys</Label>
            <Button
              onClick={generateKeyPair}
              disabled={isGenerating || !!publicKey}
              variant="outline"
              className="w-full"
            >
              <Key className="h-4 w-4 mr-2" />
              {publicKey ? "Keys Generated" : "Generate Ed25519 Key Pair"}
            </Button>
            {publicKey && (
              <div className="p-3 bg-muted rounded-md">
                <p className="text-xs text-muted-foreground mb-1">Public Key Preview:</p>
                <p className="font-mono text-xs break-all">
                  {publicKey.x.substring(0, 8)}...{publicKey.x.substring(publicKey.x.length - 8)}
                </p>
              </div>
            )}
          </div>

          {publicKey && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>Important:</strong> Your private key will be automatically downloaded when you create the agent. Store it securely - we cannot recover it if lost.
              </AlertDescription>
            </Alert>
          )}

          <div className="flex gap-2 pt-4">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={createAgent}
              disabled={isCreating || !name || !agentType || !publicKey}
              className="flex-1"
            >
              {isCreating ? "Creating..." : "Create Agent"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AddAgentModal;
