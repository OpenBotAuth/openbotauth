import { Button } from "@/components/ui/button";

const Hero = () => {
  return (
    <section className="container mx-auto px-6 py-20 md:py-32">
      <div className="max-w-4xl mx-auto text-center">
        {/* Large Logo Icon */}
        <div className="flex justify-center mb-12 md:mb-16">
          <div className="w-32 h-32 md:w-40 md:h-40">
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
        <h1 className="text-4xl md:text-6xl lg:text-7xl font-serif mb-8 md:mb-12 leading-tight">
          It's that time again to reinvent the Internet
        </h1>

        {/* Subheading */}
        <p className="text-lg md:text-xl lg:text-2xl font-serif mb-12 md:mb-16 max-w-3xl mx-auto leading-relaxed">
          51%* of web traffic today is of crawlers. It's time to define a new economy for new age
          surfers.
        </p>

        {/* CTA Button */}
        <Button variant="hero" asChild>
          <a href="/contact">Let's talk</a>
        </Button>
      </div>
    </section>
  );
};

export default Hero;

