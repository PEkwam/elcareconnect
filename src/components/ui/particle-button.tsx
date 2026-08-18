import * as React from "react";
import { Button, ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ParticleButtonProps extends ButtonProps {
  particleCount?: number;
}

export const ParticleButton = React.forwardRef<HTMLButtonElement, ParticleButtonProps>(
  ({ className, children, particleCount = 12, ...props }, ref) => {
    const [particles, setParticles] = React.useState<Array<{ id: number; angle: number }>>([]);
    const timeoutRef = React.useRef<NodeJS.Timeout>();

    const createParticles = () => {
      const newParticles = Array.from({ length: particleCount }, (_, i) => ({
        id: Date.now() + i,
        angle: (360 / particleCount) * i,
      }));
      setParticles(newParticles);

      // Clear particles after animation
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        setParticles([]);
      }, 1000);
    };

    return (
      <Button
        ref={ref}
        className={cn("relative overflow-visible", className)}
        onMouseEnter={createParticles}
        {...props}
      >
        {particles.map((particle) => (
          <span
            key={particle.id}
            className="absolute w-1.5 h-1.5 rounded-full bg-primary animate-particle pointer-events-none"
            style={{
              left: "50%",
              top: "50%",
              "--angle": `${particle.angle}deg`,
            } as React.CSSProperties}
          />
        ))}
        {children}
      </Button>
    );
  }
);

ParticleButton.displayName = "ParticleButton";
