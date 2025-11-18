import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import Logo from "./Logo";
import { Button } from "@/components/ui/button";
import { ChevronDown, Menu, X, LogOut } from "lucide-react";
import { api } from "@/lib/api";

const DiscordIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M20.317 4.492c-1.53-.69-3.17-1.2-4.885-1.49a.075.075 0 0 0-.079.036c-.21.369-.444.85-.608 1.23a18.566 18.566 0 0 0-5.487 0 12.36 12.36 0 0 0-.617-1.23A.077.077 0 0 0 8.562 3c-1.714.29-3.354.8-4.885 1.491a.07.07 0 0 0-.032.027C.533 9.093-.32 13.555.099 17.961a.08.08 0 0 0 .031.055 20.03 20.03 0 0 0 5.993 2.98.078.078 0 0 0 .084-.026c.462-.62.874-1.275 1.226-1.963.021-.04.001-.088-.041-.104a13.201 13.201 0 0 1-1.872-.878.075.075 0 0 1-.008-.125c.126-.093.252-.19.372-.287a.075.075 0 0 1 .078-.01c3.927 1.764 8.18 1.764 12.061 0a.075.075 0 0 1 .079.009c.12.098.245.195.372.288a.075.075 0 0 1-.006.125c-.598.344-1.22.635-1.873.877a.075.075 0 0 0-.041.105c.36.687.772 1.341 1.225 1.962a.077.077 0 0 0 .084.028 19.963 19.963 0 0 0 6.002-2.981.076.076 0 0 0 .032-.054c.5-5.094-.838-9.52-3.549-13.442a.06.06 0 0 0-.031-.028zM8.02 15.278c-1.182 0-2.157-1.069-2.157-2.38 0-1.312.956-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.956 2.38-2.157 2.38zm7.975 0c-1.183 0-2.157-1.069-2.157-2.38 0-1.312.955-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.946 2.38-2.157 2.38z"/>
  </svg>
);

const Navigation = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const navigate = useNavigate();

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
    { name: "Registry", hasDropdown: false, href: "/registry", external: false },
    { name: "Publishers", hasDropdown: false, href: "/publishers", external: false },
    { name: "Crawlers", hasDropdown: false, href: "/crawlers", external: false },
    { name: "Docs", hasDropdown: false, href: "https://docs.openbotauth.org", external: true },
    { name: "Research", hasDropdown: false, href: "https://openbotauth.discourse.group", external: true },
    { name: "Github", hasDropdown: false, href: "https://github.com/OpenBotAuth/openbotauth", external: true },
  ];

  return (
    <header className="w-full border-b border-foreground">
      <nav className="container mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          {/* Logo and Brand */}
          <Link to="/" className="flex items-center gap-3 hover:opacity-70 transition-opacity">
            <Logo />
            <span className="text-xl font-serif font-bold">OpenBotAuth</span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-8">
            {navItems.map((item) => 
              item.external ? (
                <a
                  key={item.name}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-foreground hover:opacity-70 transition-opacity font-serif"
                >
                  {item.name}
                  {item.hasDropdown && <ChevronDown size={16} />}
                </a>
              ) : (
                <Link
                  key={item.name}
                  to={item.href}
                  className="flex items-center gap-1 text-foreground hover:opacity-70 transition-opacity font-serif"
                >
                  {item.name}
                  {item.hasDropdown && <ChevronDown size={16} />}
                </Link>
              )
            )}
          </div>

          {/* Sign In and Discord Buttons / User Menu */}
          <div className="hidden md:flex items-center gap-4">
            {isAuthenticated ? (
              <>
                <Link to={`/${username}`}>
                  <Button 
                    variant="ghost"
                    className="font-serif px-6 hover:bg-muted transition-all"
                  >
                    My Profile
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
              <Link to="/login">
                <Button 
                  variant="ghost"
                  className="font-serif px-6 border-2 border-foreground hover:bg-foreground hover:text-background transition-all"
                >
                  Sign in with GitHub
                </Button>
              </Link>
            )}
            <a
              href="https://discord.gg/QXujuH42nT"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button 
                variant="default" 
                className="font-serif italic px-8 flex items-center gap-2 transition-all hover:shadow-[0_0_20px_rgba(88,101,242,0.6)]"
              >
                <DiscordIcon />
                Discord
              </Button>
            </a>
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
            <div className="flex flex-col gap-4">
              {navItems.map((item) => 
                item.external ? (
                  <a
                    key={item.name}
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-foreground hover:opacity-70 transition-opacity font-serif text-left"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {item.name}
                    {item.hasDropdown && <ChevronDown size={16} />}
                  </a>
                ) : (
                  <Link
                    key={item.name}
                    to={item.href}
                    className="flex items-center gap-1 text-foreground hover:opacity-70 transition-opacity font-serif text-left"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {item.name}
                    {item.hasDropdown && <ChevronDown size={16} />}
                  </Link>
                )
              )}
              {isAuthenticated ? (
                <>
                  <Link
                    to={`/${username}`}
                    className="w-full"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <Button 
                      variant="ghost"
                      className="font-serif w-full hover:bg-muted transition-all"
                    >
                      My Profile
                    </Button>
                  </Link>
                  <Button 
                    variant="ghost"
                    className="font-serif w-full border-2 border-foreground hover:bg-foreground hover:text-background transition-all"
                    onClick={() => {
                      handleLogout();
                      setMobileMenuOpen(false);
                    }}
                  >
                    <LogOut className="w-4 h-4 mr-2" />
                    Logout
                  </Button>
                </>
              ) : (
                <Link
                  to="/login"
                  className="w-full"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <Button 
                    variant="ghost"
                    className="font-serif w-full border-2 border-foreground hover:bg-foreground hover:text-background transition-all"
                  >
                    Sign in with GitHub
                  </Button>
                </Link>
              )}
              <a
                href="https://discord.gg/QXujuH42nT"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full"
              >
                <Button 
                  variant="default" 
                  className="font-serif italic w-full mt-2 flex items-center justify-center gap-2"
                >
                  <DiscordIcon />
                  Discord
                </Button>
              </a>
            </div>
          </div>
        )}
      </nav>
    </header>
  );
};

export default Navigation;

