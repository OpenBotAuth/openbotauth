import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { api } from "@/lib/api";
import { NavLink } from "@/components/NavLink";

const Index = () => {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const session = await api.getSession();
        
        if (!session) {
          navigate("/login");
          return;
        }

        // Profile is already in session
        setProfile({
          username: session.profile.username,
          avatar_url: session.user.avatar_url,
        });

        setLoading(false);
      } catch (error) {
        console.error('Auth check error:', error);
        navigate("/login");
      }
    };

    checkAuth();
  }, [navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold">OpenBotAuth</h1>
          <div className="flex items-center gap-4">
            <NavLink to="/my-agents" className="text-muted-foreground hover:text-foreground transition-colors">
              My Agents
            </NavLink>
            <NavLink to="/registry" className="text-muted-foreground hover:text-foreground transition-colors">
              Registry
            </NavLink>
            <NavLink to={profile?.username ? `/${profile.username}` : "/"} className="text-muted-foreground hover:text-foreground transition-colors">
              Profile
            </NavLink>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="space-y-8">
          {/* Welcome Section */}
          <div>
            <h2 className="text-3xl font-bold mb-2">Welcome back!</h2>
            <p className="text-muted-foreground">Manage your bot registry and authentication</p>
          </div>

          {/* My OpenBotID Section */}
          <Card>
            <CardHeader>
              <CardTitle>My OpenBotID</CardTitle>
              <CardDescription>Your registered bot profile</CardDescription>
            </CardHeader>
            <CardContent>
              {profile ? (
                <div className="flex items-center gap-4 p-4 bg-muted rounded-lg">
                  <Avatar className="w-16 h-16">
                    {profile.avatar_url && (
                      <AvatarImage src={profile.avatar_url} alt={profile.username} />
                    )}
                    <AvatarFallback className="bg-accent text-accent-foreground text-xl">
                      {profile.username?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold">{profile.username}</h3>
                    <p className="text-sm text-muted-foreground">Bot Registry Profile</p>
                  </div>
                  <Button onClick={() => navigate(`/${profile.username}`)} variant="outline">
                    View Details
                  </Button>
                </div>
              ) : (
                <p className="text-muted-foreground">No agent registered yet</p>
              )}
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => navigate(profile?.username ? `/${profile.username}` : "/")}>
              <CardHeader>
                <CardTitle className="text-lg">Manage Keys</CardTitle>
                <CardDescription>View and update your authentication keys</CardDescription>
              </CardHeader>
            </Card>
            <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => navigate("/my-agents")}>
              <CardHeader>
                <CardTitle className="text-lg">My Agents</CardTitle>
                <CardDescription>Manage your registered agents</CardDescription>
              </CardHeader>
            </Card>
            <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => navigate("/registry")}>
              <CardHeader>
                <CardTitle className="text-lg">Bot Registry</CardTitle>
                <CardDescription>Browse all registered bots</CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Index;
