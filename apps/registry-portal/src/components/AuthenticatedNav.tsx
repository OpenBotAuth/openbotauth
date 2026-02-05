import { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import Logo from "./marketing/Logo";
import { Button } from "@/components/ui/button";
import { Menu, X, LogOut } from "lucide-react";
import { api } from "@/lib/api";

const AuthenticatedNav = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();
  
  // Portal routes where we should never show center nav
  const portalRoutes = ['/registry', '/setup', '/login', '/profile/edit', '/confirm-username', '/my-agents', '/tokens'];
  const isPortalRoute = portalRoutes.some(route => location.pathname.startsWith(route)) || 
                        (location.pathname !== '/' && !location.pathname.startsWith('/publishers') && 
                         !location.pathname.startsWith('/crawlers') && !location.pathname.startsWith('/contact'));

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const session = await api.getSession();
        if (session) {
          setIsAuthenticated(true);
          setUsername(session.profile.username);
        }
      } catch (error) {
        setIsAuthenticated(false);
      } finally {
        setAuthLoading(false);
      }
    };
    checkAuth();
  }, []);

  const handleLogout = async () => {
    try {
      await api.logout();
      setIsAuthenticated(false);
      setUsername(null);
      navigate('/');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const navItems = [
    { name: "Registry", href: "/registry" },
    { name: "Home", href: "/" },
  ];

  return (
    <header className="w-full border-b border-foreground bg-background">
      <nav className="container mx-auto px-6 py-4 relative">
        <div className="flex items-center justify-between">
          {/* Logo and Brand */}
          <Link 
            to={isAuthenticated && username ? `/${username}` : "/"} 
            className="flex items-center gap-3 hover:opacity-70 transition-opacity"
          >
            <Logo />
            <span className="text-xl font-serif font-bold">OpenBotAuth</span>
          </Link>

          {/* Desktop Navigation - Only show when not authenticated AND not on portal route */}
          {!isAuthenticated && !isPortalRoute && (
            <div className="hidden md:flex items-center gap-8 absolute left-1/2 transform -translate-x-1/2">
              {navItems.map((item) => (
                <Link
                  key={item.name}
                  to={item.href}
                  className="text-foreground hover:opacity-70 transition-opacity font-serif"
                >
                  {item.name}
                </Link>
              ))}
            </div>
          )}
          
          {/* Spacer for portal routes to prevent layout shift */}
          {(isAuthenticated || isPortalRoute) && (
            <div className="hidden md:block flex-1"></div>
          )}

          {/* Desktop User Menu - Always on the right */}
          <div className="hidden md:flex items-center gap-1 ml-auto">
              {authLoading && isPortalRoute ? (
                // Invisible placeholder buttons to reserve space while loading
                <>
                  <Button 
                    variant="ghost"
                    className="font-serif px-6 text-foreground hover:text-foreground hover:bg-muted border-2 border-foreground invisible pointer-events-none"
                  >
                    Registry
                  </Button>
                  <Button
                    variant="ghost"
                    className="font-serif px-6 text-foreground hover:text-foreground hover:bg-muted border-2 border-foreground invisible pointer-events-none"
                  >
                    My Profile
                  </Button>
                  <Button
                    variant="ghost"
                    className="font-serif px-6 text-foreground hover:text-foreground hover:bg-muted border-2 border-foreground invisible pointer-events-none"
                  >
                    API Tokens
                  </Button>
                  <Button
                    variant="ghost"
                    className="font-serif px-6 border-2 border-foreground hover:bg-foreground hover:text-background invisible pointer-events-none"
                  >
                    <LogOut className="w-4 h-4 mr-2" />
                    Logout
                  </Button>
                </>
              ) : isAuthenticated ? (
                <>
                  <Link to="/registry">
                    <Button 
                      variant="ghost"
                      className="font-serif px-6 text-foreground hover:text-foreground hover:bg-muted border-2 border-foreground transition-all"
                    >
                      Registry
                    </Button>
                  </Link>
                  <Link to={`/${username}`}>
                    <Button
                      variant="ghost"
                      className="font-serif px-6 text-foreground hover:text-foreground hover:bg-muted border-2 border-foreground transition-all"
                    >
                      My Profile
                    </Button>
                  </Link>
                  <Link to="/tokens">
                    <Button
                      variant="ghost"
                      className="font-serif px-6 text-foreground hover:text-foreground hover:bg-muted border-2 border-foreground transition-all"
                    >
                      API Tokens
                    </Button>
                  </Link>
                  <Button
                    variant="ghost"
                    className="font-serif px-6 border-2 border-foreground hover:bg-foreground hover:text-background transition-all"
                    onClick={handleLogout}
                  >
                    <LogOut className="w-4 h-4 mr-2" />
                    Logout
                  </Button>
                </>
              ) : (
                <Button
                  variant="outline"
                  className="font-serif px-6 border-2 border-foreground hover:bg-foreground hover:text-background transition-all"
                  onClick={() => (window.location.href = api.getGitHubLoginUrl(location.pathname === '/' ? undefined : location.pathname))}
                >
                  Sign in with GitHub
                </Button>
              )}
            </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden mt-6 pb-4 border-t border-foreground pt-4">
            <div className="flex flex-col gap-3">
              {!isAuthenticated &&
                navItems.map((item) => (
                  <Link
                    key={item.name}
                    to={item.href}
                    className="text-foreground hover:opacity-70 transition-opacity font-serif text-left py-3 px-2 rounded hover:bg-muted"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {item.name}
                  </Link>
                ))}
              {isAuthenticated && (
                <>
                  <div className="border-t border-foreground/20 my-2"></div>
                  <button
                    onClick={() => {
                      navigate('/registry');
                      setMobileMenuOpen(false);
                    }}
                    className="text-foreground hover:opacity-70 transition-opacity font-serif text-left py-3 px-2 rounded hover:bg-muted"
                  >
                    Registry
                  </button>
                  <button
                    onClick={() => {
                      navigate(`/${username}`);
                      setMobileMenuOpen(false);
                    }}
                    className="text-foreground hover:opacity-70 transition-opacity font-serif text-left py-3 px-2 rounded hover:bg-muted"
                  >
                    My Profile
                  </button>
                  <button
                    onClick={() => {
                      navigate('/tokens');
                      setMobileMenuOpen(false);
                    }}
                    className="text-foreground hover:opacity-70 transition-opacity font-serif text-left py-3 px-2 rounded hover:bg-muted"
                  >
                    API Tokens
                  </button>
                  <button
                    onClick={() => {
                      handleLogout();
                      setMobileMenuOpen(false);
                    }}
                    className="text-foreground hover:opacity-70 transition-opacity font-serif text-left py-3 px-2 rounded hover:bg-muted border-2 border-foreground"
                  >
                    <LogOut className="w-4 h-4 inline mr-2" />
                    Logout
                  </button>
                </>
              )}
              {!isAuthenticated && (
                <>
                  <div className="border-t border-foreground/20 my-2"></div>
                  <button
                    onClick={() => {
                      setMobileMenuOpen(false);
                      window.location.href = api.getGitHubLoginUrl(location.pathname === '/' ? undefined : location.pathname);
                    }}
                    className="text-foreground hover:opacity-70 transition-opacity font-serif text-left py-3 px-2 rounded hover:bg-muted border-2 border-foreground"
                  >
                    Sign in with GitHub
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </nav>
    </header>
  );
};

export default AuthenticatedNav;

