import { Button } from "@/components/ui/button";

const Hero = () => {
  return (
    <section className="container mx-auto px-6 py-16 md:py-16">
      <div className="max-w-4xl mx-auto text-center">
        {/* Large Logo Icon */}
        <div className="flex justify-center mb-4 md:mb-6">
          <div className="w-20 h-20 md:w-24 md:h-24">
            <svg
              width="100%"
              height="100%"
              viewBox="0 0 160 160"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* Bot Head */}
              <rect x="32" y="48" width="96" height="80" rx="12" fill="currentColor" />
              
              {/* Antenna */}
              <line x1="80" y1="48" x2="80" y2="24" stroke="currentColor" strokeWidth="8" />
              <circle cx="80" cy="24" r="8" fill="currentColor" />
              
              {/* Eyes */}
              <circle cx="60" cy="80" r="10" fill="hsl(var(--background))" />
              <circle cx="100" cy="80" r="10" fill="hsl(var(--background))" />
              
              {/* Mouth */}
              <line x1="56" y1="104" x2="104" y2="104" stroke="hsl(var(--background))" strokeWidth="8" strokeLinecap="round" />
            </svg>
          </div>
        </div>

        {/* Hero Heading */}
        <h1 className="text-4xl md:text-6xl lg:text-7xl font-serif mb-6 md:mb-8 leading-tight">
          Give your web bots a real identity
        </h1>

        {/* Subheading */}
        <p className="text-lg md:text-xl lg:text-2xl font-serif mb-10 md:mb-12 max-w-3xl mx-auto leading-relaxed">
          Register your crawler or AI agent with GitHub, publish its JWKS once, and let websites verify HTTP Message Signatures at origin — without CDN lock-in.
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <Button variant="hero" asChild className="w-full sm:w-auto">
            <a href="/login">Claim your username</a>
          </Button>
          <Button variant="hero" asChild className="w-full sm:w-auto">
            <a href="https://github.com/OpenBotAuth/openbotauth" target="_blank" rel="noopener noreferrer">
              View on GitHub
            </a>
          </Button>
        </div>
      </div>
    </section>
  );
};

export default Hero;

