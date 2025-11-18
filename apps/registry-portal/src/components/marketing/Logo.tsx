const Logo = () => {
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="flex-shrink-0"
    >
      {/* Bot Head */}
      <rect x="8" y="12" width="24" height="20" rx="3" fill="currentColor" />
      
      {/* Antenna */}
      <line x1="20" y1="12" x2="20" y2="6" stroke="currentColor" strokeWidth="2" />
      <circle cx="20" cy="6" r="2" fill="currentColor" />
      
      {/* Eyes */}
      <circle cx="15" cy="20" r="2.5" fill="hsl(var(--background))" />
      <circle cx="25" cy="20" r="2.5" fill="hsl(var(--background))" />
      
      {/* Mouth */}
      <line x1="14" y1="26" x2="26" y2="26" stroke="hsl(var(--background))" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
};

export default Logo;

