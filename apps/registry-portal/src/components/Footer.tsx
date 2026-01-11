import { ExternalLink } from "lucide-react";

const Footer = () => {
  return (
    <footer className="border-t bg-slate-900 text-slate-100 mt-auto">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-6">
          {/* Left Column - Branding */}
          <div>
            <h3 className="text-xl font-bold mb-2">OpenBotAuth Project</h3>
            <p className="text-slate-400 text-sm">
              Made with love for agent economy
            </p>
          </div>

          {/* Right Column - Links */}
          <div>
            <div className="grid grid-cols-2 gap-4">
              <a
                href="/registry"
                className="text-sm hover:text-primary transition-colors flex items-center gap-1"
              >
                Demos
              </a>
              <a
                href="https://docs.openbotauth.org"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm hover:text-primary transition-colors flex items-center gap-1"
              >
                Docs
                <ExternalLink className="h-3 w-3" />
              </a>
              <a
                href="https://github.com/OpenBotAuth/openbotauth"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm hover:text-primary transition-colors flex items-center gap-1"
              >
                GitHub
                <ExternalLink className="h-3 w-3" />
              </a>
              <a
                href="https://discord.gg/QXujuH42nT"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm hover:text-primary transition-colors flex items-center gap-1"
              >
                Discord
                <ExternalLink className="h-3 w-3" />
              </a>
              <a
                href="/privacy"
                className="text-sm hover:text-primary transition-colors flex items-center gap-1"
              >
                Privacy
              </a>
              <a
                href="/terms"
                className="text-sm hover:text-primary transition-colors flex items-center gap-1"
              >
                Terms
              </a>
              <a
                href="/contact"
                className="text-sm hover:text-primary transition-colors flex items-center gap-1"
              >
                Contact
              </a>
            </div>
          </div>
        </div>

        {/* Bottom - Copyright */}
        <div className="pt-6 border-t border-slate-800 text-center text-sm text-slate-400">
          <p>
            © {new Date().getFullYear()} OpenBotAuth Project. Licensed under{" "}
            <a
              href="https://www.apache.org/licenses/LICENSE-2.0"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-slate-200 transition-colors"
            >
              Apache 2.0
            </a>
            .
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;

