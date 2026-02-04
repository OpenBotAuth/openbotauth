import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "@/hooks/use-toast";
import { Copy, AlertCircle } from "lucide-react";
import { api } from "@/lib/api";

const AVAILABLE_SCOPES = [
  { value: "agents:read", label: "Agents (read)" },
  { value: "agents:write", label: "Agents (write)" },
  { value: "keys:read", label: "Keys (read)" },
  { value: "keys:write", label: "Keys (write)" },
  { value: "profile:read", label: "Profile (read)" },
  { value: "profile:write", label: "Profile (write)" },
] as const;

const EXPIRY_OPTIONS = [
  { value: "30", label: "30 days" },
  { value: "60", label: "60 days" },
  { value: "90", label: "90 days" },
  { value: "180", label: "180 days" },
  { value: "365", label: "365 days" },
] as const;

interface CreateTokenModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const CreateTokenModal = ({ open, onOpenChange, onSuccess }: CreateTokenModalProps) => {
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>([]);
  const [expiryDays, setExpiryDays] = useState("90");
  const [isCreating, setIsCreating] = useState(false);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // Clean up timeout on unmount to prevent state updates after unmount
  useEffect(() => {
    return () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    };
  }, []);

  const toggleScope = (scope: string) => {
    setScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    );
  };

  const copyToken = async () => {
    if (!createdToken) return;
    try {
      await navigator.clipboard.writeText(createdToken);
      setCopied(true);
      copiedTimerRef.current = setTimeout(() => setCopied(false), 2000);
      toast({ title: "Copied", description: "Token copied to clipboard" });
    } catch {
      toast({ title: "Error", description: "Failed to copy token", variant: "destructive" });
    }
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      toast({ title: "Validation Error", description: "Token name is required", variant: "destructive" });
      return;
    }
    if (scopes.length === 0) {
      toast({ title: "Validation Error", description: "Select at least one scope", variant: "destructive" });
      return;
    }

    setIsCreating(true);
    try {
      const result = await api.createToken({
        name: name.trim(),
        scopes,
        expires_in_days: Number(expiryDays),
      });

      setCreatedToken(result.token);
      toast({ title: "Token Created", description: `Token "${name}" created successfully` });
      onSuccess();
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create token",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) {
      // Reset form state
      setName("");
      setScopes([]);
      setExpiryDays("90");
      setCreatedToken(null);
      setCopied(false);
    }
    onOpenChange(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{createdToken ? "Token Created" : "Create API Token"}</DialogTitle>
          <DialogDescription>
            {createdToken
              ? "Copy your token now. It will not be shown again."
              : "Create a personal access token for API authentication."}
          </DialogDescription>
        </DialogHeader>

        {createdToken ? (
          <div className="space-y-4">
            <Alert className="border-yellow-500/50 bg-yellow-500/10">
              <AlertCircle className="h-4 w-4 text-yellow-600" />
              <AlertDescription className="text-yellow-700 dark:text-yellow-400">
                This token will only be shown once. Copy it now and store it securely.
              </AlertDescription>
            </Alert>

            <div className="flex gap-2">
              <Input
                value={createdToken}
                readOnly
                className="font-mono text-sm"
              />
              <Button variant="outline" size="icon" onClick={copyToken} aria-label="Copy token to clipboard">
                <Copy className="h-4 w-4" />
              </Button>
            </div>

            {copied && (
              <p className="text-sm text-green-600 dark:text-green-400">Copied to clipboard!</p>
            )}

            <Button className="w-full" onClick={() => handleClose(false)}>
              Done
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="token-name">Name</Label>
              <Input
                id="token-name"
                placeholder="e.g. openclaw-cli"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="space-y-3">
              <Label>Scopes</Label>
              <div className="flex items-center gap-2 mb-1">
                <Checkbox
                  id="select-all"
                  checked={scopes.length === AVAILABLE_SCOPES.length}
                  onCheckedChange={(checked) =>
                    setScopes(checked ? AVAILABLE_SCOPES.map((s) => s.value) : [])
                  }
                />
                <Label htmlFor="select-all" className="text-sm font-medium cursor-pointer">
                  Select all
                </Label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {AVAILABLE_SCOPES.map((scope) => (
                  <div key={scope.value} className="flex items-center gap-2">
                    <Checkbox
                      id={scope.value}
                      checked={scopes.includes(scope.value)}
                      onCheckedChange={() => toggleScope(scope.value)}
                    />
                    <Label htmlFor={scope.value} className="text-sm font-normal cursor-pointer">
                      {scope.label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Expiration</Label>
              <Select value={expiryDays} onValueChange={setExpiryDays}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPIRY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => handleClose(false)}>
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={handleCreate}
                disabled={isCreating || !name.trim() || scopes.length === 0}
              >
                {isCreating ? "Creating..." : "Create Token"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default CreateTokenModal;
