import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import AddAgentModal from "@/components/AddAgentModal";
import AuthenticatedNav from "@/components/AuthenticatedNav";

interface Agent {
  id: string;
  name: string;
  description: string | null;
  agent_type: string;
  status: string;
  created_at: string;
}

const MyAgents = () => {
  const navigate = useNavigate();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  const fetchAgents = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/login");
        return;
      }

      const { data, error } = await supabase
        .from("agents")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      setAgents(data || []);
    } catch (error: any) {
      console.error("Error fetching agents:", error);
      toast({
        title: "Error",
        description: "Failed to load agents",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAgents();
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-500";
      case "paused":
        return "bg-yellow-500";
      case "inactive":
        return "bg-gray-500";
      default:
        return "bg-gray-500";
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "web_scraper":
        return "bg-blue-500/10 text-blue-500 border-blue-500/20";
      case "trading_bot":
        return "bg-purple-500/10 text-purple-500 border-purple-500/20";
      case "research_assistant":
        return "bg-cyan-500/10 text-cyan-500 border-cyan-500/20";
      case "automation":
        return "bg-orange-500/10 text-orange-500 border-orange-500/20";
      default:
        return "bg-gray-500/10 text-gray-500 border-gray-500/20";
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 flex items-center justify-center">
        <p className="text-muted-foreground">Loading agents...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <AuthenticatedNav />

      <main className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold">My Agents</h1>
          <Button onClick={() => setShowAddModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add New Agent
          </Button>
        </div>
        {agents.length === 0 ? (
          <Card className="max-w-md mx-auto text-center">
            <CardHeader>
              <CardTitle>No Agents Yet</CardTitle>
              <CardDescription>
                Create your first agent to get started with Web Bot Authentication
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => setShowAddModal(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Your First Agent
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {agents.map((agent) => (
              <Card
                key={agent.id}
                className="hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => navigate(`/agents/${agent.id}`)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="space-y-1 flex-1">
                      <CardTitle className="text-xl">{agent.name}</CardTitle>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={getTypeColor(agent.agent_type)}>
                          {agent.agent_type.replace(/_/g, " ")}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${getStatusColor(agent.status)}`} />
                      <span className="text-xs text-muted-foreground capitalize">
                        {agent.status}
                      </span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    {agent.description || "No description provided"}
                  </p>
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      Created: {new Date(agent.created_at).toLocaleDateString()}
                    </p>
                    <p className="text-xs text-muted-foreground font-mono truncate">
                      JWKS: /api/agents/{agent.id}/jwks
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full mt-4"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/agents/${agent.id}`);
                    }}
                  >
                    View Details
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      <AddAgentModal
        open={showAddModal}
        onOpenChange={setShowAddModal}
        onSuccess={fetchAgents}
      />
    </div>
  );
};

export default MyAgents;
