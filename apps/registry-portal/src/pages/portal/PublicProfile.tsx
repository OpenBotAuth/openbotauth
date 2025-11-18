import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2, ArrowLeft, ExternalLink, Edit, Copy, Check, LogOut, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { NavLink } from "@/components/NavLink";
import { format } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Profile {
  id: string;
  username: string;
  avatar_url: string | null;
  client_name: string | null;
  github_username: string | null;
}

interface Agent {
  id: string;
  name: string;
  description: string | null;
  agent_type: string;
  status: string;
  created_at: string;
}

interface Activity {
  id: string;
  target_url: string;
  method: string;
  status_code: number;
  timestamp: string;
  response_time_ms: number | null;
}

const PublicProfile = () => {
  const { username } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [isOwnProfile, setIsOwnProfile] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUsername, setCurrentUsername] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [publicKey, setPublicKey] = useState("");
  const [keyHistory, setKeyHistory] = useState<any[]>([]);

  useEffect(() => {
    fetchProfile();
  }, [username]);

  const fetchProfile = async () => {
    try {
      setLoading(true);

      // Check if user is logged in
      const session = await api.getSession();
      setCurrentUserId(session?.user?.id || null);
      setCurrentUsername(session?.profile?.username || null);

      // Fetch profile by username
      const profileData = await api.getProfileByUsername(username!);

      if (!profileData) {
        throw new Error('Profile not found');
      }

      setProfile(profileData);
      
      // Check if this is the user's own profile
      const ownProfile = session?.user?.id === profileData.id;
      setIsOwnProfile(ownProfile);

      // If own profile, fetch additional data
      if (ownProfile) {
        // For now, we'll get the JWKS URL
        // The public key display can be added later
        setPublicKey(api.getUserJWKSUrl(username!));
        // Key history can be added to the API later
        setKeyHistory([]);
      }

      // Fetch agents for this user
      const agentsData = await api.listAgents();
      setAgents(agentsData || []);
    } catch (error) {
      console.error("Error fetching profile:", error);
      toast.error("Failed to load profile");
    } finally {
      setLoading(false);
    }
  };

  const fetchAgentActivity = async (agentId: string) => {
    try {
      setActivityLoading(true);
      const data = await api.getAgentActivity(agentId, 50, 0);
      setActivity(data || []);
    } catch (error) {
      console.error("Error fetching activity:", error);
      toast.error("Failed to load activity");
    } finally {
      setActivityLoading(false);
    }
  };

  const handleAgentClick = (agent: Agent) => {
    setSelectedAgent(agent);
    fetchAgentActivity(agent.id);
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
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
    const colors: Record<string, string> = {
      web_scraper: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
      trading_bot: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300",
      research_assistant: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
      automation: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300",
    };
    return colors[type] || "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300";
  };

  const handleCopyUrl = () => {
    const projectId = "lxqarpgicszdxydkdccz";
    const url = `https://${projectId}.supabase.co/functions/v1/jwks/${username}.json`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success("JWKS URL copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyProfileUrl = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    toast.success("Profile URL copied to clipboard!");
  };

  const handleLogout = async () => {
    await api.logout();
    navigate("/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <h1 className="text-2xl font-bold mb-4">Profile Not Found</h1>
        <p className="text-muted-foreground mb-4">
          The profile "@{username}" does not exist.
        </p>
        <Button onClick={() => navigate(-1)}>Go Back</Button>
      </div>
    );
  }

  const jwksUrl = api.getUserJWKSUrl(username!);
  const agentJwksUrl = selectedAgent
    ? api.getAgentJWKSUrl(selectedAgent.id)
    : "";

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold">OpenBotRegistry</h1>
          <div className="flex items-center gap-4">
            <NavLink to="/registry" className="text-muted-foreground hover:text-foreground transition-colors">
              Registry
            </NavLink>
            <NavLink to="/" className="text-muted-foreground hover:text-foreground transition-colors">
              Home
            </NavLink>
            {isOwnProfile ? (
              <Button variant="ghost" size="sm" onClick={handleLogout}>
                <LogOut className="w-4 h-4 mr-2" />
                Logout
              </Button>
            ) : currentUserId && currentUsername && (
              <Button variant="ghost" size="sm" onClick={() => navigate(`/${currentUsername}`)}>
                My Profile
              </Button>
            )}
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Profile Header */}
        <div className="mb-8">

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Avatar className="h-20 w-20">
                    <AvatarImage src={profile.avatar_url || undefined} />
                    <AvatarFallback>
                      {profile.username.substring(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h1 className="text-3xl font-bold">@{profile.username}</h1>
                    {profile.client_name && (
                      <p className="text-lg text-muted-foreground">{profile.client_name}</p>
                    )}
                    {profile.github_username && (
                      <a
                        href={`https://github.com/${profile.github_username}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline inline-flex items-center gap-1"
                      >
                        <ExternalLink className="h-3 w-3" />
                        GitHub: {profile.github_username}
                      </a>
                    )}
                  </div>
                </div>
                {isOwnProfile && (
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={handleCopyProfileUrl}>
                      <Copy className="w-4 h-4 mr-2" />
                      Share Profile
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => navigate("/profile/edit")}>
                      <Edit className="w-4 h-4 mr-2" />
                      Edit Profile
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* JWKS Section - Only for own profile */}
        {isOwnProfile && publicKey && (
          <div className="space-y-6 mb-8">
            <Card>
              <CardHeader>
                <CardTitle>JWKS Endpoint</CardTitle>
                <CardDescription>
                  Your JSON Web Key Set endpoint for bot authentication
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <code className="flex-1 p-3 bg-muted rounded text-xs break-all">
                      {jwksUrl}
                    </code>
                    <Button size="sm" variant="outline" onClick={handleCopyUrl}>
                      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => window.open(jwksUrl, "_blank")}>
                      <ExternalLink className="w-4 h-4 mr-2" />
                      View JWKS
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <KeyRound className="w-5 h-5" />
                  Registered Public Key
                </CardTitle>
                <CardDescription>
                  Your active public key used for bot authentication
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <code className="block p-3 bg-muted rounded text-xs break-all max-h-40 overflow-auto">
                    {publicKey}
                  </code>
                  <Button variant="outline" onClick={() => navigate("/setup")}>
                    <Edit className="w-4 h-4 mr-2" />
                    Update Key
                  </Button>
                </div>
              </CardContent>
            </Card>

            {keyHistory.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Key History</CardTitle>
                  <CardDescription>
                    Previous public keys registered to your account
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {keyHistory.map((key) => (
                      <div
                        key={key.id}
                        className="flex items-start justify-between p-3 border rounded-lg"
                      >
                        <div className="flex-1 min-w-0 mr-4">
                          <code className="text-xs break-all block mb-2">
                            {key.public_key}
                          </code>
                          <p className="text-xs text-muted-foreground">
                            Registered: {new Date(key.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <Badge variant={key.is_active ? "default" : "secondary"}>
                          {key.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Agents Grid */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold">Agents ({agents.length})</h2>
            {isOwnProfile && (
              <Button onClick={() => navigate("/my-agents")}>
                Manage Agents
              </Button>
            )}
          </div>
          {agents.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No agents registered yet.
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {agents.map((agent) => (
                <Card
                  key={agent.id}
                  className={`cursor-pointer transition-all hover:shadow-lg ${
                    selectedAgent?.id === agent.id ? "ring-2 ring-primary" : ""
                  }`}
                  onClick={() => handleAgentClick(agent)}
                >
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-lg">{agent.name}</CardTitle>
                      <div className="flex items-center gap-2">
                        <div
                          className={`h-2 w-2 rounded-full ${getStatusColor(agent.status)}`}
                        />
                        <span className="text-xs text-muted-foreground capitalize">
                          {agent.status}
                        </span>
                      </div>
                    </div>
                    <Badge className={getTypeColor(agent.agent_type)}>
                      {agent.agent_type.replace(/_/g, " ")}
                    </Badge>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground mb-4">
                      {agent.description || "No description provided"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Created: {format(new Date(agent.created_at), "MMM d, yyyy")}
                    </p>
                    <p className="text-xs text-muted-foreground mt-2 truncate">
                      JWKS: /api/agents/{agent.id.substring(0, 8)}...
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Agent Details & Activity */}
        {selectedAgent && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>JWKS Endpoint</CardTitle>
              </CardHeader>
              <CardContent>
                <code className="block p-3 bg-muted rounded text-xs break-all">
                  {agentJwksUrl}
                </code>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
                <CardDescription>
                  Last 50 activities for {selectedAgent.name}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {activityLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                ) : activity.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    No activity recorded yet
                  </p>
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
                        {activity.map((log) => (
                          <TableRow key={log.id}>
                            <TableCell className="text-xs">
                              {format(new Date(log.timestamp), "MMM d, HH:mm:ss")}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{log.method}</Badge>
                            </TableCell>
                            <TableCell className="max-w-md truncate text-xs">
                              {log.target_url}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  log.status_code < 300
                                    ? "default"
                                    : log.status_code < 400
                                    ? "secondary"
                                    : "destructive"
                                }
                              >
                                {log.status_code}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs">
                              {log.response_time_ms ? `${log.response_time_ms}ms` : "-"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};

export default PublicProfile;
