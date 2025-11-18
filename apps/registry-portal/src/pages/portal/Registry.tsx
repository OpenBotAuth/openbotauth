import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExternalLink, Copy, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { NavLink } from "@/components/NavLink";

interface Bot {
  username: string;
  created_at: string;
}

const Registry = () => {
  const [bots, setBots] = useState<Bot[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchBots();
  }, []);

  const fetchBots = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('username, created_at')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setBots(data || []);
    } catch (error) {
      console.error('Error fetching bots:', error);
      toast({
        title: "Error",
        description: "Failed to load bot registry",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getJwksUrl = (username: string) => {
    const projectId = "lxqarpgicszdxydkdccz";
    return `https://${projectId}.supabase.co/functions/v1/jwks/${username}.json`;
  };

  const copyToClipboard = (text: string, username: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(username);
    toast({
      title: "Copied!",
      description: "JWKS URL copied to clipboard",
    });
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b border-border">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold text-foreground">OpenBot Registry</h1>
            <div className="flex gap-4">
              <NavLink to="/">Home</NavLink>
              <NavLink to="/registry">Registry</NavLink>
              <NavLink to="/login">Login</NavLink>
            </div>
          </div>
        </div>
      </nav>

      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-foreground mb-2">Bot Registry</h2>
          <p className="text-muted-foreground">
            Public registry of all registered OpenBot authentication providers
          </p>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Loading bots...</p>
          </div>
        ) : bots.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No bots registered yet</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {bots.map((bot) => {
              const jwksUrl = getJwksUrl(bot.username);
              const isCopied = copiedId === bot.username;

              return (
                <Card key={bot.username}>
                  <CardHeader>
                    <CardTitle className="text-foreground">{bot.username}</CardTitle>
                    <CardDescription>
                      Registered {new Date(bot.created_at).toLocaleDateString()}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="bg-muted p-3 rounded-md">
                      <p className="text-xs font-mono break-all text-muted-foreground">
                        {jwksUrl}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => copyToClipboard(jwksUrl, bot.username)}
                      >
                        {isCopied ? (
                          <>
                            <Check className="mr-2 h-4 w-4" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="mr-2 h-4 w-4" />
                            Copy URL
                          </>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(jwksUrl, '_blank')}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default Registry;
