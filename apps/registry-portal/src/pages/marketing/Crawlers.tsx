import Navigation from "@/components/marketing/Navigation";
import { Button } from "@/components/ui/button";
import SEO from "@/components/marketing/SEO";
import Footer from "@/components/Footer";

const Crawlers = () => {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "name": "Crawlers - Open Registration System",
    "description": "Open registration for crawlers with distributed trust across DNS infrastructure. TXT records under your control, independently verifiable by origin servers.",
    "url": `${window.location.origin}/crawlers`,
    "isPartOf": {
      "@type": "WebSite",
      "name": "OpenBotAuth",
      "url": window.location.origin
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Crawlers - Open Registration System"
        description="Open registration for crawlers, just like the Internet. Unlike centralized verification systems, our approach distributes trust across DNS infrastructure with TXT records under your control."
        canonical="/crawlers"
        keywords="crawler registration, bot verification, DNS authentication, TXT records, distributed trust, open registration, web crawler, bot access"
        structuredData={structuredData}
      />
      <Navigation />
      <main>
        <section className="container mx-auto px-6 py-20 md:py-32">
          <div className="max-w-4xl mx-auto text-center">
            {/* Hero Heading */}
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-serif mb-8 md:mb-12 leading-none flex flex-col gap-2 md:gap-3 lg:gap-4">
              <span>Open Registration for Crawlers,</span>
              <span>Just Like The Internet</span>
            </h1>

            {/* Subheading */}
            <p className="text-lg md:text-xl lg:text-2xl font-serif mb-12 md:mb-16 max-w-3xl mx-auto leading-relaxed">
              Unlike centralized verification systems where one organization controls the gates, our approach distributes trust across DNS infrastructure. TXT records remain under your control at the registry level while being independently verifiable by origin servers.
            </p>

            {/* CTA Button */}
            <Button variant="hero" asChild>
              <a href="/contact">Let's Talk</a>
            </Button>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default Crawlers;

