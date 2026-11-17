import { useEffect, useRef } from "react";
import type { BackgroundMotion, BackgroundScene } from "../../types/provider";

interface Star {
  homeX: number;
  homeY: number;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  radius: number;
  phase: number;
  speed: number;
  hue: number;
  opacity: number;
}

function makeStars(width: number, height: number): Star[] {
  const count = Math.max(48, Math.min(130, Math.round((width * height) / 8500)));
  return Array.from({ length: count }, () => {
    const x = Math.random() * width;
    const y = Math.random() * height;
    return {
      homeX: x,
      homeY: y,
      x,
      y,
      velocityX: 0,
      velocityY: 0,
      radius: 0.7 + Math.random() * 1.5,
      phase: Math.random() * Math.PI * 2,
      speed: 0.45 + Math.random() * 1.25,
      hue: Math.random() > 0.72 ? 190 : 220 + Math.random() * 50,
      opacity: 0.32 + Math.random() * 0.58,
    };
  });
}

export function CelestialBackground({ scene, intensity, motion }: { scene: BackgroundScene; intensity: number; motion: BackgroundMotion }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d", { alpha: true });
    if (!canvas || !context) return;

    let width = 0;
    let height = 0;
    let pixelRatio = 1;
    let stars: Star[] = [];
    let animationFrame = 0;
    let elapsed = 0;
    let lastFrame = 0;
    let pointerX = -10_000;
    let pointerY = -10_000;
    let reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const still = motion === "still";
    const strength = Math.max(0, Math.min(100, intensity)) / 100;

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      width = Math.max(1, bounds.width);
      height = Math.max(1, bounds.height);
      pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      stars = makeStars(width, height);
    };

    const onPointerMove = (event: PointerEvent) => {
      const bounds = canvas.getBoundingClientRect();
      const x = event.clientX - bounds.left;
      const y = event.clientY - bounds.top;
      if (x < 0 || y < 0 || x > bounds.width || y > bounds.height) {
        pointerX = -10_000;
        pointerY = -10_000;
      } else {
        pointerX = x;
        pointerY = y;
      }
    };

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onMotionChange = (event: MediaQueryListEvent) => { reducedMotion = event.matches; };

    const drawMoon = () => {
      const x = width * 0.79;
      const y = height * 0.2;
      const radius = Math.min(49, Math.max(33, width * 0.042));
      const distance = Math.hypot(pointerX - x, pointerY - y);
      if (scene !== "moonlit" && scene !== "eclipse") return;
      const near = reducedMotion || motion === "reduced" ? 0 : Math.max(0, 1 - distance / 255);
      const eclipse = scene === "eclipse";
      const moonColor = eclipse ? "255, 191, 131" : "174, 221, 255";

      const glow = context.createRadialGradient(x, y, radius * 0.35, x, y, radius * (2.7 + near * 1.5));
      glow.addColorStop(0, `rgba(${moonColor}, ${(0.055 + near * 0.13) * strength})`);
      glow.addColorStop(0.35, `rgba(138, 170, 231, ${(0.035 + near * 0.09) * strength})`);
      glow.addColorStop(1, "rgba(128, 150, 220, 0)");
      context.fillStyle = glow;
      context.beginPath();
      context.arc(x, y, radius * (2.7 + near * 1.5), 0, Math.PI * 2);
      context.fill();

      context.save();
      context.shadowColor = `rgba(${moonColor}, ${(0.18 + near * 0.52) * strength})`;
      context.shadowBlur = 12 + near * 34;
      const surface = context.createRadialGradient(x - radius * 0.36, y - radius * 0.42, radius * 0.08, x, y, radius * 1.2);
      surface.addColorStop(0, `rgba(${eclipse ? "255, 232, 205" : "237, 246, 255"}, ${(0.75 + near * 0.2) * strength})`);
      surface.addColorStop(0.58, `rgba(${eclipse ? "244, 184, 133" : "188, 211, 244"}, ${(0.58 + near * 0.24) * strength})`);
      surface.addColorStop(1, `rgba(132, 158, 207, ${0.44 + near * 0.22})`);
      context.fillStyle = surface;
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
      context.restore();

      context.fillStyle = `rgba(99, 127, 173, ${(0.13 + near * 0.08) * strength})`;
      context.beginPath();
      context.ellipse(x - radius * 0.28, y - radius * 0.12, radius * 0.16, radius * 0.1, -0.35, 0, Math.PI * 2);
      context.ellipse(x + radius * 0.3, y + radius * 0.29, radius * 0.22, radius * 0.13, 0.28, 0, Math.PI * 2);
      context.ellipse(x + radius * 0.35, y - radius * 0.3, radius * 0.11, radius * 0.08, -0.2, 0, Math.PI * 2);
      context.fill();
    };

    const render = (timestamp: number) => {
      const delta = lastFrame ? Math.min((timestamp - lastFrame) / 16.67, 2) : 1;
      lastFrame = timestamp;
      elapsed += delta;
      context.clearRect(0, 0, width, height);

      if (scene === "aurora") {
        context.save();
        context.globalAlpha = strength * (reducedMotion || motion === "reduced" ? 0.2 : 0.38);
        for (let band = 0; band < 3; band += 1) {
          const y = height * (0.24 + band * 0.11);
          const offset = reducedMotion || motion === "reduced" ? 0 : Math.sin(elapsed * 0.008 + band) * 24;
          const gradient = context.createLinearGradient(width * 0.2, y, width, y + 105);
          gradient.addColorStop(0, "rgba(38, 220, 176, 0)");
          gradient.addColorStop(0.42, "rgba(46, 225, 188, .32)");
          gradient.addColorStop(0.72, "rgba(134, 117, 255, .25)");
          gradient.addColorStop(1, "rgba(50, 180, 200, 0)");
          context.strokeStyle = gradient;
          context.lineWidth = 54 - band * 10;
          context.shadowColor = "rgba(88, 255, 219, .5)";
          context.shadowBlur = 34;
          context.beginPath();
          context.moveTo(width * 0.08, y + offset);
          context.bezierCurveTo(width * 0.32, y - 100 + offset, width * 0.56, y + 120 - offset, width * 0.96, y - 35 + offset);
          context.stroke();
        }
        context.restore();
      }

      if (scene === "meteor" && !reducedMotion && motion !== "reduced") {
        context.save();
        context.globalAlpha = strength * 0.6;
        for (let index = 0; index < 4; index += 1) {
          const cycle = (elapsed * (0.19 + index * 0.027) + index * 197) % (width + height);
          const x = width - cycle;
          const y = cycle * 0.43 + index * 37;
          const tail = context.createLinearGradient(x, y, x + 92, y - 46);
          tail.addColorStop(0, "rgba(208, 237, 255, .7)");
          tail.addColorStop(1, "rgba(158, 197, 255, 0)");
          context.strokeStyle = tail;
          context.lineWidth = 1.5;
          context.beginPath(); context.moveTo(x, y); context.lineTo(x + 92, y - 46); context.stroke();
        }
        context.restore();
      }

      for (const star of stars) {
        if (!reducedMotion && motion === "system") {
          const dx = star.x - pointerX;
          const dy = star.y - pointerY;
          const distance = Math.hypot(dx, dy) || 1;
          const influence = Math.max(0, 1 - distance / 112);
          if (influence > 0) {
            const force = influence * influence * 0.58 * delta;
            star.velocityX += (dx / distance) * force;
            star.velocityY += (dy / distance) * force;
          }
          star.velocityX += (star.homeX - star.x) * 0.0018 * delta;
          star.velocityY += (star.homeY - star.y) * 0.0018 * delta;
          star.velocityX *= 0.94;
          star.velocityY *= 0.94;
          star.x += star.velocityX * delta;
          star.y += star.velocityY * delta;
        }

        const twinkle = reducedMotion || motion === "reduced" ? 0.62 : 0.42 + (Math.sin(elapsed * 0.035 * star.speed + star.phase) + 1) * 0.29;
        const alpha = star.opacity * twinkle * strength * (scene === "quiet" ? 0.48 : 1);
        const haloRadius = star.radius * (4 + twinkle * 2.5);
        const halo = context.createRadialGradient(star.x, star.y, 0, star.x, star.y, haloRadius);
        halo.addColorStop(0, `hsla(${star.hue}, 92%, 89%, ${alpha * 0.72})`);
        halo.addColorStop(0.18, `hsla(${star.hue}, 92%, 78%, ${alpha * 0.2})`);
        halo.addColorStop(1, `hsla(${star.hue}, 92%, 70%, 0)`);
        context.fillStyle = halo;
        context.beginPath();
        context.arc(star.x, star.y, haloRadius, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = `rgba(237, 246, 255, ${alpha})`;
        context.beginPath();
        context.arc(star.x, star.y, star.radius * (0.75 + twinkle * 0.35), 0, Math.PI * 2);
        context.fill();
      }

      drawMoon();
      if (!still) animationFrame = window.requestAnimationFrame(render);
    };

    const observer = new ResizeObserver(() => {
      resize();
      if (still) render(performance.now());
    });
    observer.observe(canvas.parentElement ?? canvas);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    motionQuery.addEventListener("change", onMotionChange);
    resize();
    animationFrame = window.requestAnimationFrame(render);

    return () => {
      observer.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      motionQuery.removeEventListener("change", onMotionChange);
      window.cancelAnimationFrame(animationFrame);
    };
  }, [scene, intensity, motion]);

  return <div className={`celestial-background scene-${scene} motion-${motion}`} aria-hidden="true" style={{ opacity: Math.max(0, Math.min(100, intensity)) / 100 }}><canvas ref={canvasRef} /></div>;
}
