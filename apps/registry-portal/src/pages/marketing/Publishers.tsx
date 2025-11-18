import Navigation from "@/components/marketing/Navigation";
import { Button } from "@/components/ui/button";
import SEO from "@/components/marketing/SEO";

const Publishers = () => {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "name": "Publishers - Intent-Based Pricing",
    "description": "Implement intent-based pricing for bot access. Control how authenticated bots interact with your content - from read-only crawls to DOM writes.",
    "url": `${window.location.origin}/publishers`,
    "isPartOf": {
      "@type": "WebSite",
      "name": "OpenBotAuth",
      "url": window.location.origin
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Publishers - Intent-Based Pricing for Bot Access"
        description="Authenticated bots get full access today—not selective access. There's no distinction crawling for LLM training or user query. Implement intent-based pricing that selectively reveals your content for intended use."
        canonical="/publishers"
        keywords="publisher pricing, bot access control, intent-based pricing, LLM training, crawler pricing, DOM writes, read-only access, content monetization"
        structuredData={structuredData}
      />
      <Navigation />
      <main>
        <section className="container mx-auto px-6 py-20 md:py-32">
          <div className="max-w-4xl mx-auto text-center">
            {/* Hero Heading */}
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-serif mb-8 md:mb-12 leading-none flex flex-col gap-2 md:gap-3 lg:gap-4">
              <span>Make 'em Pay</span>
              <span>- But Not Just</span>
              <span>for Crawl</span>
            </h1>

            {/* Subheading */}
            <p className="text-lg md:text-xl lg:text-2xl font-serif mb-12 md:mb-16 max-w-3xl mx-auto leading-relaxed">
              Authenticated bots get full access today—not selective access. There's no distinction crawling for LLM training or user query. You need intent-based pricing that selectively reveals your content for intended use. Read-only crawls shouldn't cost the same as DOM writes.
            </p>

            {/* CTA Button */}
            <Button variant="hero" asChild>
              <a href="/contact">Let's Talk</a>
            </Button>
          </div>
        </section>
      </main>
    </div>
  );
};

export default Publishers;

