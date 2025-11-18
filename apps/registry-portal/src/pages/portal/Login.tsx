import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Github } from "lucide-react";
import logoImage from "@/assets/openbotauth-logo.png";
import { api } from "@/lib/api";
import { toast } from "sonner";

const Login = () => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Check if user is already logged in
    const checkUser = async () => {
      try {
        const session = await api.getSession();
        if (session) {
          // User is already logged in, redirect to their profile
          navigate(`/${session.profile.username}`);
        }
      } catch (error) {
        // Not logged in, stay on login page
      }
    };
    checkUser();
  }, [navigate]);

  const handleGithubLogin = async () => {
    setIsLoading(true);
    try {
      // Redirect to GitHub OAuth via the registry service
      window.location.href = api.getGitHubLoginUrl();
    } catch (error) {
      toast.error("Failed to initiate GitHub login");
      console.error(error);
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-gradient-to-br from-background via-background to-muted/20">
      {/* Left side - Login form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <Card className="w-full max-w-md border-border/50 shadow-lg">
          <CardHeader className="space-y-1 text-center">
            <CardTitle className="text-3xl font-bold tracking-tight">
              Welcome back
            </CardTitle>
            <CardDescription>Sign in to your OpenBot account</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              variant="outline"
              className="w-full h-12 text-base hover:bg-muted/80"
              onClick={handleGithubLogin}
              disabled={isLoading}
            >
              <Github className="mr-2 h-5 w-5" />
              {isLoading ? "Signing in..." : "Continue with GitHub"}
            </Button>

            <p className="text-xs text-center text-muted-foreground pt-2">
              By continuing, you agree to OpenBotAuth's Terms of Service and Privacy Policy
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Right side - Branding */}
      <div className="hidden lg:flex flex-1 items-center justify-center p-12 border-l border-border/50">
        <div className="max-w-lg text-center space-y-8">
          <img
            src={logoImage}
            alt="OpenBotAuth"
            className="w-full max-w-md mx-auto drop-shadow-lg"
          />
          <div className="space-y-4">
            <h2 className="text-4xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              OpenBotAuth
            </h2>
            <p className="text-lg text-muted-foreground leading-relaxed">
              A secure, open registry for bot authentication using JWKS and Web Bot Auth protocols
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
