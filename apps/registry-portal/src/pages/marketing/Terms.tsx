import Navigation from "@/components/marketing/Navigation";
import SEO from "@/components/marketing/SEO";
import Footer from "@/components/Footer";

const Terms = () => {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "name": "Terms of Service - OpenBotAuth",
    "description": "OpenBotAuth Terms of Service - Terms and conditions for using the OpenBotAuth WordPress plugin and hosted services.",
    "url": `${window.location.origin}/terms`,
  };

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Terms of Service"
        description="OpenBotAuth Terms of Service - Terms and conditions for using the OpenBotAuth WordPress plugin and hosted services."
        canonical="/terms"
        keywords="terms of service, terms and conditions, OpenBotAuth, WordPress plugin, legal"
        structuredData={structuredData}
      />
      <Navigation />
      <main>
        <article className="container mx-auto px-6 py-20 md:py-32 max-w-4xl">
          {/* Header */}
          <header className="mb-12 md:mb-16">
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-serif mb-6 leading-tight">
              Terms of Service
            </h1>
            <p className="text-lg text-muted-foreground font-serif">
              <strong>Last updated:</strong> January 11, 2026
            </p>
          </header>

          {/* Content */}
          <div className="prose prose-lg max-w-none font-serif space-y-8">
            <p className="text-xl leading-relaxed">
              These Terms of Service ("Terms") govern your use of OpenBotAuth software, services, and related offerings provided by the OpenBotAuth Project ("we", "us", "our").
            </p>

            {/* Summary */}
            <section className="bg-muted/50 rounded-lg p-6 my-8">
              <h2 className="text-2xl font-bold mb-4">Summary</h2>
              <ul className="space-y-3 list-disc pl-6">
                <li>The OpenBotAuth WordPress plugin is <strong>open source</strong> software licensed under the Apache 2.0 License.</li>
                <li>Hosted services (such as the signature verifier) are provided <strong>as-is</strong> with no guarantee of uptime or availability.</li>
                <li>You are responsible for how you configure and use the software on your own infrastructure.</li>
                <li>We do not provide warranties and limit our liability as described below.</li>
              </ul>
            </section>

            {/* Section 1 */}
            <section>
              <h2 className="text-2xl font-bold mb-4">1) Acceptance of Terms</h2>
              <p className="mb-4">
                By downloading, installing, or using OpenBotAuth software (including the WordPress plugin) or by accessing any OpenBotAuth hosted services, you agree to be bound by these Terms. If you do not agree to these Terms, do not use the software or services.
              </p>
              <p>
                If you are using the software or services on behalf of an organization, you represent that you have the authority to bind that organization to these Terms.
              </p>
            </section>

            {/* Section 2 */}
            <section>
              <h2 className="text-2xl font-bold mb-4">2) Software License</h2>
              <p className="mb-4">
                The OpenBotAuth WordPress plugin and related open source components are licensed under the{" "}
                <a 
                  href="https://www.apache.org/licenses/LICENSE-2.0" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary underline hover:text-primary/80 transition-colors"
                >
                  Apache License, Version 2.0
                </a>
                . You may use, modify, and distribute the software in accordance with that license.
              </p>
              <p className="mb-4">Key points of the Apache 2.0 License:</p>
              <ul className="space-y-2 list-disc pl-6">
                <li>You may use the software for any purpose, including commercial use.</li>
                <li>You may modify and distribute the software.</li>
                <li>You must include the original copyright notice and license in any distribution.</li>
                <li>The software is provided "as-is" without warranties.</li>
              </ul>
            </section>

            {/* Section 3 */}
            <section>
              <h2 className="text-2xl font-bold mb-4">3) Hosted Services</h2>
              <p className="mb-4">
                We may offer optional hosted services, such as:
              </p>
              <ul className="space-y-2 list-disc pl-6 mb-4">
                <li>The OpenBotAuth signature verifier service</li>
                <li>The OpenBotAuth agent registry</li>
                <li>Documentation and support resources</li>
              </ul>
              <p className="mb-4">
                <strong>Availability:</strong> Hosted services are provided on a best-effort basis. We do not guarantee any specific uptime, availability, or performance level. We may modify, suspend, or discontinue any hosted service at any time without prior notice.
              </p>
              <p>
                <strong>Self-Hosting:</strong> You are encouraged to self-host the verifier and other services if you require specific availability guarantees or data residency requirements.
              </p>
            </section>

            {/* Section 4 */}
            <section>
              <h2 className="text-2xl font-bold mb-4">4) Acceptable Use</h2>
              <p className="mb-4">When using OpenBotAuth software or services, you agree not to:</p>
              <ul className="space-y-2 list-disc pl-6">
                <li>Use the services to conduct illegal activities or violate applicable laws</li>
                <li>Attempt to gain unauthorized access to our systems or other users' data</li>
                <li>Interfere with or disrupt the integrity or performance of the services</li>
                <li>Use the services to distribute malware, spam, or other harmful content</li>
                <li>Reverse engineer, decompile, or otherwise attempt to derive source code from compiled components (this does not apply to open source components)</li>
                <li>Abuse rate limits or deliberately overload hosted services</li>
              </ul>
            </section>

            {/* Section 5 */}
            <section>
              <h2 className="text-2xl font-bold mb-4">5) Your Responsibilities</h2>
              <p className="mb-4">You are responsible for:</p>
              <ul className="space-y-2 list-disc pl-6">
                <li>Properly configuring and securing the software on your own infrastructure</li>
                <li>Ensuring your use of the software complies with all applicable laws and regulations</li>
                <li>Any content you process through the software or services</li>
                <li>Obtaining any necessary consents from your users if required by applicable privacy laws</li>
                <li>Maintaining the security of your WordPress installation and server environment</li>
              </ul>
            </section>

            {/* Section 6 */}
            <section>
              <h2 className="text-2xl font-bold mb-4">6) Intellectual Property</h2>
              <p className="mb-4">
                The OpenBotAuth name, logo, and related branding are trademarks of the OpenBotAuth Project. You may not use these trademarks without our prior written permission, except as reasonably necessary to identify your use of the software.
              </p>
              <p>
                The open source code is provided under the Apache 2.0 License, which grants you specific rights to use, modify, and distribute the software as described in Section 2.
              </p>
            </section>

            {/* Section 7 */}
            <section>
              <h2 className="text-2xl font-bold mb-4">7) Disclaimer of Warranties</h2>
              <p className="mb-4 font-semibold uppercase text-sm">
                TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW:
              </p>
              <p className="mb-4">
                THE SOFTWARE AND SERVICES ARE PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS, IMPLIED, OR STATUTORY, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT.
              </p>
              <p>
                WE DO NOT WARRANT THAT THE SOFTWARE OR SERVICES WILL BE UNINTERRUPTED, ERROR-FREE, OR SECURE, OR THAT ANY DEFECTS WILL BE CORRECTED.
              </p>
            </section>

            {/* Section 8 */}
            <section>
              <h2 className="text-2xl font-bold mb-4">8) Limitation of Liability</h2>
              <p className="mb-4 font-semibold uppercase text-sm">
                TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW:
              </p>
              <p className="mb-4">
                IN NO EVENT SHALL THE OPENBOTAUTH PROJECT, ITS CONTRIBUTORS, OR AFFILIATES BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO LOSS OF PROFITS, DATA, GOODWILL, OR OTHER INTANGIBLE LOSSES, ARISING OUT OF OR IN CONNECTION WITH YOUR USE OF THE SOFTWARE OR SERVICES.
              </p>
              <p>
                OUR TOTAL LIABILITY FOR ANY CLAIMS ARISING FROM THESE TERMS OR YOUR USE OF THE SOFTWARE OR SERVICES SHALL NOT EXCEED THE AMOUNT YOU PAID US (IF ANY) IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM.
              </p>
            </section>

            {/* Section 9 */}
            <section>
              <h2 className="text-2xl font-bold mb-4">9) Indemnification</h2>
              <p>
                You agree to indemnify, defend, and hold harmless the OpenBotAuth Project and its contributors from and against any claims, damages, losses, liabilities, costs, and expenses (including reasonable legal fees) arising out of or related to your use of the software or services, your violation of these Terms, or your violation of any rights of a third party.
              </p>
            </section>

            {/* Section 10 */}
            <section>
              <h2 className="text-2xl font-bold mb-4">10) Changes to These Terms</h2>
              <p className="mb-4">
                We may update these Terms from time to time. We will post the updated Terms on this page with a new "Last updated" date. Your continued use of the software or services after any changes constitutes your acceptance of the new Terms.
              </p>
              <p>
                For material changes, we will make reasonable efforts to provide notice (for example, via our website, GitHub repository, or WordPress plugin update notes).
              </p>
            </section>

            {/* Section 11 */}
            <section>
              <h2 className="text-2xl font-bold mb-4">11) Termination</h2>
              <p className="mb-4">
                You may stop using the software or services at any time by uninstalling the plugin and discontinuing use of hosted services.
              </p>
              <p>
                We may suspend or terminate your access to hosted services if you violate these Terms or engage in conduct that we reasonably believe is harmful to us, other users, or third parties.
              </p>
            </section>

            {/* Section 12 */}
            <section>
              <h2 className="text-2xl font-bold mb-4">12) Governing Law</h2>
              <p>
                These Terms shall be governed by and construed in accordance with the laws of the jurisdiction in which the OpenBotAuth Project operates, without regard to its conflict of law principles. Any disputes arising under these Terms shall be resolved in the competent courts of that jurisdiction.
              </p>
            </section>

            {/* Section 13 */}
            <section>
              <h2 className="text-2xl font-bold mb-4">13) Severability</h2>
              <p>
                If any provision of these Terms is held to be unenforceable or invalid, that provision will be enforced to the maximum extent possible, and the other provisions will remain in full force and effect.
              </p>
            </section>

            {/* Section 14 */}
            <section>
              <h2 className="text-2xl font-bold mb-4">14) Entire Agreement</h2>
              <p>
                These Terms, together with our{" "}
                <a 
                  href="/privacy" 
                  className="text-primary underline hover:text-primary/80 transition-colors"
                >
                  Privacy Policy
                </a>
                , constitute the entire agreement between you and the OpenBotAuth Project regarding the use of the software and services, and supersede any prior agreements or understandings.
              </p>
            </section>

            {/* Section 15 - Contact */}
            <section className="border-t pt-8 mt-12">
              <h2 className="text-2xl font-bold mb-4">15) Contact</h2>
              <p>
                If you have questions about these Terms, please contact us at:{" "}
                <a 
                  href="mailto:legal@openbotauth.org" 
                  className="text-primary underline hover:text-primary/80 transition-colors"
                >
                  legal@openbotauth.org
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

export default Terms;
