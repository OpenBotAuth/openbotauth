import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Trash2, Key } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { api, type ApiToken } from "@/lib/api";
import CreateTokenModal from "@/components/CreateTokenModal";
import AuthenticatedNav from "@/components/AuthenticatedNav";

const Tokens = () => {
  const navigate = useNavigate();
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ApiToken | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchTokens = useCallback(async () => {
    try {
      const session = await api.getSession();
      if (!session) {
        navigate("/login");
        return;
      }

      const data = await api.listTokens();
      setTokens(data);
    } catch (error: unknown) {
      console.error("Error fetching tokens:", error);
      toast({
        title: "Error",
        description: "Failed to load tokens",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    fetchTokens();
  }, [fetchTokens]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await api.deleteToken(deleteTarget.id);
      toast({
        title: "Token Revoked",
        description: `Token "${deleteTarget.name}" has been revoked`,
      });
      setDeleteTarget(null);
      fetchTokens();
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to revoke token",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "Never";
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const isExpired = (dateStr: string) => new Date(dateStr) <= new Date();

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 flex items-center justify-center">
        <p className="text-muted-foreground">Loading tokens...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <AuthenticatedNav />

      <main className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold">API Tokens</h1>
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Token
          </Button>
        </div>

        {tokens.length === 0 ? (
          <Card className="max-w-md mx-auto text-center">
            <CardHeader>
              <CardTitle>No API Tokens</CardTitle>
              <CardDescription>
                Create a personal access token to authenticate with the API
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => setShowCreateModal(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Your First Token
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {tokens.map((token) => (
              <Card key={token.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="space-y-1 flex-1">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Key className="h-4 w-4 text-muted-foreground" />
                        {token.name}
                      </CardTitle>
                      <p className="font-mono text-sm text-muted-foreground">
                        {token.token_prefix}...
                      </p>
                    </div>
                    {isExpired(token.expires_at) && (
                      <Badge variant="destructive">Expired</Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {token.scopes.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {token.scopes.map((scope) => (
                          <Badge key={scope} variant="outline" className="text-xs">
                            {scope}
                          </Badge>
                        ))}
                      </div>
                    )}

                    <div className="space-y-1 text-xs text-muted-foreground">
                      <p>Created: {formatDate(token.created_at)}</p>
                      <p>Expires: {formatDate(token.expires_at)}</p>
                      <p>Last used: {formatDate(token.last_used_at)}</p>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => setDeleteTarget(token)}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Revoke
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      <CreateTokenModal
        open={showCreateModal}
        onOpenChange={setShowCreateModal}
        onSuccess={fetchTokens}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke Token</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to revoke "{deleteTarget?.name}"? Any applications using this
              token will lose access immediately. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Revoking..." : "Revoke Token"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Tokens;
