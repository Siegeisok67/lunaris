import type { PropsWithChildren } from "react";
import { motion, type HTMLMotionProps } from "framer-motion";
import { motionTransitions } from "../../lib/motion";

interface GlassCardProps extends PropsWithChildren {
  className?: string;
  delay?: number;
  onClick?: () => void;
  role?: string;
}

export function GlassCard({ children, className = "", delay = 0, onClick, role }: GlassCardProps) {
  const motionProps: HTMLMotionProps<"section"> = {
    className: `glass-card ${className}`,
    initial: { opacity: 0, y: 10, scale: 0.99, filter: "blur(2px)" },
    animate: { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" },
    transition: { ...motionTransitions.panel, delay },
    ...(onClick ? { onClick } : {}),
    ...(role ? { role } : {}),
  };
  return <motion.section {...motionProps}>{children}</motion.section>;
}
