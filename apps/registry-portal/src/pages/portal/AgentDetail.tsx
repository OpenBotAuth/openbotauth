import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Copy, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import AuthenticatedNav from "@/components/AuthenticatedNav";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { api, Agent } from "@/lib/api";

interface Activity {
  id: string;
  target_url: string;
  method: string;
  status_code: number;
  timestamp: string;
  response_time_ms: number | null;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

const AgentDetail = () => {
  const { agentId } = useParams();
  const navigate = useNavigate();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAgentData = async () => {
    try {
      const session = await api.getSession();
      if (!session) {
        navigate("/login");
        return;
      }

      // Fetch agent
      const agentData = await api.getAgent(agentId!);
      setAgent(agentData);

      // Fetch activities
      const activitiesData = await api.getAgentActivity(agentId!, 50, 0);
      setActivities(activitiesData || []);
    } catch (error: any) {
      console.error("Error fetching agent data:", error);
      toast({
        title: "Error",
        description: "Failed to load agent details",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAgentData();
  }, [agentId]);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied",
      description: `${label} copied to clipboard`,
    });
  };

  const deleteAgent = async () => {
    if (!agent) return;

    try {
      await api.deleteAgent(agent.id);

      toast({
        title: "Agent Deleted",
        description: "Agent has been permanently deleted",
      });
      navigate("/my-agents");
    } catch (error: any) {
      console.error("Error deleting agent:", error);
      toast({
        title: "Error",
        description: "Failed to delete agent",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 flex items-center justify-center">
        <p className="text-muted-foreground">Loading agent...</p>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 flex items-center justify-center">
        <p className="text-muted-foreground">Agent not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <AuthenticatedNav />

      <main className="container mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/my-agents")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold">{agent.name}</h1>
              <p className="text-muted-foreground">{agent.description}</p>
            </div>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete the agent and all associated activity logs. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={deleteAgent}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Agent Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Type</p>
                <Badge variant="outline" className="mt-1">
                  {agent.agent_type.replace(/_/g, " ")}
                </Badge>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                <Badge variant={agent.status === "active" ? "default" : "secondary"} className="mt-1 capitalize">
                  {agent.status}
                </Badge>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Created</p>
                <p className="mt-1">{new Date(agent.created_at).toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Activity Log</CardTitle>
            <CardDescription>Recent HTTP requests made by this agent</CardDescription>
          </CardHeader>
          <CardContent>
            {activities.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No activity recorded yet</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Timestamp</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Target URL</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Response Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activities.map((activity) => (
                      <TableRow key={activity.id}>
                        <TableCell className="text-xs">
                          {new Date(activity.timestamp).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{activity.method}</Badge>
                        </TableCell>
                        <TableCell className="max-w-xs truncate text-xs">
                          {activity.target_url}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={activity.status_code < 400 ? "default" : "destructive"}
                          >
                            {activity.status_code}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">
                          {activity.response_time_ms ? `${activity.response_time_ms}ms` : "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Activity Logging API</CardTitle>
            <CardDescription>Use this endpoint to log agent activities</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground mb-2">Endpoint</p>
                <code className="block p-3 bg-muted rounded text-xs break-all">
                  POST {API_BASE_URL}/agent-activity
                </code>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-2">Request Body</p>
                <code className="block p-3 bg-muted rounded text-xs whitespace-pre">
{`{
  "agent_id": "${agent?.id}",
  "target_url": "https://example.com/api",
  "method": "GET",
  "status_code": 200,
  "response_time_ms": 150
}`}
                </code>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default AgentDetail;
