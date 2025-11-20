import Navigation from "@/components/marketing/Navigation";
import Hero from "@/components/marketing/Hero";
import SEO from "@/components/marketing/SEO";
import Footer from "@/components/Footer";

const Home = () => {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "OpenBotAuth",
    "description": "Reinventing the Internet for the new age of crawler traffic with selective bot authentication",
    "url": window.location.origin,
    "logo": `${window.location.origin}/bot-favicon.svg`,
    "sameAs": [
      "https://discord.gg/QXujuH42nT",
      "https://openbotauth.discourse.group"
    ]
  };

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Reinventing the Internet"
        description="OpenBotAuth is a way for bots to get selective access to publishers's content over HTTP or in headless browser session. 51% of web traffic today is crawlers - it's time to define a new economy for new age surfers."
        canonical="/"
        keywords="bot authentication, crawler access, web traffic, HTTP access, selective content access, publisher content, bot economy"
        structuredData={structuredData}
      />
      <Navigation />
      <main>
        <Hero />
      </main>
      <Footer />
    </div>
  );
};

export default Home;

