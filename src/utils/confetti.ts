import confetti from 'canvas-confetti';

export const fireConfetti = () => {
  const duration = 3 * 1000;
  const animationEnd = Date.now() + duration;
  const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

  function randomInRange(min: number, max: number) {
    return Math.random() * (max - min) + min;
  }

  const interval: NodeJS.Timeout = setInterval(function() {
    const timeLeft = animationEnd - Date.now();

    if (timeLeft <= 0) {
      return clearInterval(interval);
    }

    const particleCount = 50 * (timeLeft / duration);
    
    confetti({
      ...defaults,
      particleCount,
      origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 }
    });
    confetti({
      ...defaults,
      particleCount,
      origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 }
    });
  }, 250);
};

export const fireSuccessConfetti = () => {
  confetti({
    particleCount: 100,
    spread: 70,
    origin: { y: 0.6 },
    colors: ['#10b981', '#34d399', '#6ee7b7', '#a7f3d0'],
  });
};

export const fireSideConfetti = (side: 'left' | 'right' = 'right') => {
  const x = side === 'left' ? 0 : 1;
  confetti({
    particleCount: 50,
    angle: side === 'left' ? 60 : 120,
    spread: 55,
    origin: { x, y: 0.6 },
    colors: ['#10b981', '#34d399', '#6ee7b7'],
  });
};

export const fireClickConfetti = (event: React.MouseEvent) => {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width;
  const y = (event.clientY - rect.top) / rect.height;

  confetti({
    particleCount: 30,
    spread: 60,
    origin: { x, y },
    colors: ['#10b981', '#34d399', '#6ee7b7'],
    scalar: 0.8,
    gravity: 1.2,
  });
};
