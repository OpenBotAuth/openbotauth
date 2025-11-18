import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { api } from "@/lib/api";

const ConfirmUsername = () => {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const fetchUserData = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        navigate("/login");
        return;
      }

      setUserId(session.user.id);

      // Fetch current username
      const { data: profileData } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', session.user.id)
        .single();

      if (profileData) {
        setUsername(profileData.username);
        setNewUsername(profileData.username);
      }

      // Get GitHub username and avatar
      const githubUsername = session.user.user_metadata?.user_name || 
                            session.user.user_metadata?.preferred_username;
      const avatarUrl = session.user.user_metadata?.avatar_url;

      // Update profile with GitHub data
      if (githubUsername || avatarUrl) {
        await supabase
          .from('profiles')
          .update({ 
            github_username: githubUsername,
            avatar_url: avatarUrl
          })
          .eq('id', session.user.id);
      }

      setLoading(false);
    };

    fetchUserData();
  }, [navigate]);

  const handleContinue = async () => {
    navigate(`/${username}`);
  };

  const handleChangeUsername = async () => {
    if (!newUsername.trim()) {
      toast.error("Username cannot be empty");
      return;
    }

    if (newUsername === username) {
      toast.error("Please enter a different username");
      return;
    }

    setSubmitting(true);

    // Check if username is already taken
    const { data: existingUser } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', newUsername)
      .single();

    if (existingUser) {
      toast.error("Username is already taken");
      setSubmitting(false);
      return;
    }

    // Update username
    const { error } = await supabase
      .from('profiles')
      .update({ username: newUsername })
      .eq('id', userId);

    if (error) {
      console.error("Error updating username:", error);
      toast.error("Failed to update username");
      setSubmitting(false);
      return;
    }

    toast.success("Username updated successfully!");
    navigate(`/${newUsername}`);
  };

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
        <div className="container mx-auto px-4 py-4">
          <h1 className="text-xl font-bold">OpenBotRegistry</h1>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Confirm Your Username</CardTitle>
            <CardDescription>
              Would you like to continue with your GitHub username or choose a different one?
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="current-username">Current Username (from GitHub)</Label>
              <Input
                id="current-username"
                value={username}
                disabled
                className="bg-muted"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-username">New Username (optional)</Label>
              <Input
                id="new-username"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder="Enter a new username"
              />
              <p className="text-xs text-muted-foreground">
                Leave unchanged to use your GitHub username
              </p>
            </div>

            <div className="flex gap-4 pt-4">
              <Button
                variant="outline"
                onClick={handleContinue}
                className="flex-1"
              >
                Continue with GitHub Username
              </Button>
              <Button
                onClick={handleChangeUsername}
                disabled={submitting || newUsername === username}
                className="flex-1 bg-accent hover:bg-accent/90"
              >
                {submitting ? "Updating..." : "Update Username"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default ConfirmUsername;
