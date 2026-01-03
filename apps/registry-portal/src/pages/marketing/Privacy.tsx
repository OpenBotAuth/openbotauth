import Navigation from "@/components/marketing/Navigation";
import SEO from "@/components/marketing/SEO";
import Footer from "@/components/Footer";

const Privacy = () => {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "name": "Privacy Policy - OpenBotAuth",
    "description": "OpenBotAuth Privacy Policy - Learn how we handle information when you use the OpenBotAuth WordPress plugin or hosted services.",
    "url": `${window.location.origin}/privacy`,
  };

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Privacy Policy"
        description="OpenBotAuth Privacy Policy - Learn how we handle information when you use the OpenBotAuth WordPress plugin or hosted services."
        canonical="/privacy"
        keywords="privacy policy, OpenBotAuth, data protection, GDPR, WordPress plugin"
        structuredData={structuredData}
      />
      <Navigation />
      <main>
        <article className="container mx-auto px-6 py-20 md:py-32 max-w-4xl">
          {/* Header */}
          <header className="mb-12 md:mb-16">
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-serif mb-6 leading-tight">
              Privacy Policy
            </h1>
            <p className="text-lg text-muted-foreground font-serif">
              <strong>Last updated:</strong> January 2, 2026
            </p>
          </header>

          {/* Content */}
          <div className="prose prose-lg max-w-none font-serif space-y-8">
            <p className="text-xl leading-relaxed">
              This Privacy Policy explains how OpenBotAuth ("we", "us") handles information when you use:
            </p>
            
            <ul className="text-lg space-y-2 list-disc pl-6">
              <li>the OpenBotAuth WordPress plugin, and/or</li>
              <li>any OpenBotAuth hosted services you choose to use (such as the hosted signature verifier).</li>
            </ul>

            {/* Summary */}
            <section className="bg-muted/50 rounded-lg p-6 my-8">
              <h2 className="text-2xl font-bold mb-4">Summary</h2>
              <ul className="space-y-3 list-disc pl-6">
                <li>The WordPress plugin stores analytics <strong>locally</strong> in your WordPress database by default.</li>
                <li>The plugin does <strong>not</strong> send analytics, tracking pixels, install pings, or other telemetry to OpenBotAuth.</li>
                <li>If you <strong>explicitly enable</strong> a verifier URL (self-hosted or OpenBotAuth-hosted), the plugin will send signature verification requests for <strong>signed</strong> bot/agent requests only.</li>
              </ul>
            </section>

            {/* Section 1 */}
            <section>
              <h2 className="text-2xl font-bold mb-4">1) Data processed by the WordPress plugin (local-only)</h2>
              <p className="mb-4">By default, the plugin stores the following locally on your site:</p>
              <ul className="space-y-2 list-disc pl-6 mb-4">
                <li>configuration settings (e.g., policy rules, endpoint toggles)</li>
                <li>aggregated decision counts (e.g., allow/teaser/deny/pay/rate limit)</li>
                <li>aggregated bot observations based on User-Agent token matching (e.g., GPTBot, CCBot)</li>
                <li>generated AI endpoints (llms.txt, JSON feed, Markdown) are served from your site and do not automatically send data to OpenBotAuth</li>
              </ul>
              <p>
                We do not receive this data unless you choose to send it to us (for example, by contacting support or sharing logs manually).
              </p>
            </section>

            {/* Section 2 */}
            <section>
              <h2 className="text-2xl font-bold mb-4">2) When data is sent to a verifier (optional)</h2>
              <p className="mb-4">
                If you configure a verifier URL in the plugin (either self-hosted or OpenBotAuth-hosted), the plugin may send a verification request <strong>only when an incoming request includes HTTP message signature headers</strong>.
              </p>
              <p className="mb-4">A verification request may include:</p>
              <ul className="space-y-2 list-disc pl-6 mb-4">
                <li>the request's signature-related headers (e.g., <code className="bg-muted px-1.5 py-0.5 rounded text-sm">Signature</code>, <code className="bg-muted px-1.5 py-0.5 rounded text-sm">Signature-Input</code>, <code className="bg-muted px-1.5 py-0.5 rounded text-sm">Signature-Agent</code>)</li>
                <li>limited request metadata needed to verify the signature (for example: request method, authority/host, path, and relevant headers that were signed)</li>
              </ul>
              <p>
                It is not the goal of verification to collect personal data. The verifier is used to validate cryptographic signatures and return a verification result (e.g., verified / not verified, reason codes).
              </p>
            </section>

            {/* Section 3 */}
            <section>
              <h2 className="text-2xl font-bold mb-4">3) Data we do not want or require</h2>
              <p className="mb-4">OpenBotAuth does not require:</p>
              <ul className="space-y-2 list-disc pl-6">
                <li>names, emails, or account identities from site visitors</li>
                <li>cookies or cross-site tracking identifiers</li>
                <li>page content beyond what is necessary to verify signatures (and verification requests are only triggered for signed requests)</li>
              </ul>
            </section>

            {/* Section 4 */}
            <section>
              <h2 className="text-2xl font-bold mb-4">4) Logs and retention (hosted verifier)</h2>
              <p className="mb-4">
                If you use the OpenBotAuth-hosted verifier, we may keep short-lived logs to operate and secure the service, such as:
              </p>
              <ul className="space-y-2 list-disc pl-6 mb-4">
                <li>timestamp</li>
                <li>verifier result codes (verified / error type)</li>
                <li>requesting IP address (as seen by our server)</li>
                <li>minimal request metadata needed for debugging operational issues</li>
              </ul>
              <p className="mb-4">
                <strong>Retention:</strong> We aim to keep operational logs for a short period (e.g., up to 30 days) unless a longer period is required for security investigations, abuse prevention, or legal obligations.
              </p>
              <p>
                You can avoid any interaction with our hosted service by leaving "use hosted verifier" disabled or by using your own self-hosted verifier.
              </p>
            </section>

            {/* Section 5 */}
            <section>
              <h2 className="text-2xl font-bold mb-4">5) Security</h2>
              <p>
                We use reasonable technical measures to protect hosted verifier endpoints and logs. However, no service can guarantee absolute security. If you operate a high-sensitivity site, we recommend self-hosting the verifier.
              </p>
            </section>

            {/* Section 6 */}
            <section>
              <h2 className="text-2xl font-bold mb-4">6) Sharing</h2>
              <p className="mb-4">We do not sell personal information. We may share limited information only when necessary to:</p>
              <ul className="space-y-2 list-disc pl-6">
                <li>comply with legal obligations</li>
                <li>protect our infrastructure and users from abuse</li>
                <li>work with service providers that help us run the hosted verifier (under appropriate confidentiality obligations)</li>
              </ul>
            </section>

            {/* Section 7 */}
            <section>
              <h2 className="text-2xl font-bold mb-4">7) Your choices</h2>
              <ul className="space-y-2 list-disc pl-6">
                <li>You can use the plugin with <strong>no external calls</strong> by leaving the verifier URL empty / hosted verifier disabled.</li>
                <li>You can self-host the verifier if you prefer not to send verification requests to OpenBotAuth.</li>
                <li>You can disable AI endpoints (llms.txt / feed / markdown) within the plugin settings.</li>
              </ul>
            </section>

            {/* Section 8 - Contact */}
            <section className="border-t pt-8 mt-12">
              <h2 className="text-2xl font-bold mb-4">8) Contact</h2>
              <p>
                If you have privacy questions or requests, contact:{" "}
                <a 
                  href="mailto:privacy@openbotauth.org" 
                  className="text-primary underline hover:text-primary/80 transition-colors"
                >
                  privacy@openbotauth.org
                </a>
              </p>
            </section>
          </div>
        </article>
      </main>
      <Footer />
    </div>
  );
};

export default Privacy;

