import Navigation from "@/components/marketing/Navigation";
import SEO from "@/components/marketing/SEO";
import Footer from "@/components/Footer";

const Contact = () => {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "ContactPage",
    "name": "Contact OpenBotAuth",
    "description": "Get in touch with OpenBotAuth - join our open-source community on Discord or reach out via email",
    "url": `${window.location.origin}/contact`,
  };

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Let's Get You Started"
        description="Join OpenBotAuth's open-source community. Connect with partners and researchers building the future of bot authentication."
        canonical="/contact"
        keywords="contact, OpenBotAuth, open-source, Discord, email, partners, researchers"
        structuredData={structuredData}
      />
      <Navigation />
      <main>
        <section className="container mx-auto px-6 py-20 md:py-32">
          <div className="max-w-4xl">
            {/* Hero Heading */}
            <h1 className="text-5xl md:text-7xl lg:text-8xl font-serif mb-12 md:mb-16 leading-tight">
              Let's have a<br />conversation.
            </h1>

            {/* Subheadline */}
            <p className="text-lg md:text-xl lg:text-2xl font-serif mb-12 leading-relaxed max-w-3xl">
              We're building OpenBotAuth in the open-source and looking for partners and researchers. 
              If this is your jam, shoot us an email or join us in Discord.
            </p>

            {/* Contact Information */}
            <div className="text-lg md:text-xl font-serif space-y-4">
              <p>
                You can reach us at{" "}
                <a 
                  href="mailto:hello@openbotauth.org" 
                  className="underline hover:text-primary transition-colors"
                >
                  hello@openbotauth.org
                </a>
              </p>
              <p>
                Join our{" "}
                <a 
                  href="https://discord.gg/QXujuH42nT" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="underline hover:text-primary transition-colors"
                >
                  Discord community
                </a>
              </p>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default Contact;

