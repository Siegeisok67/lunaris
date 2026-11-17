export const motionTransitions = {
  page: { duration: 0.34, ease: [0.22, 1, 0.36, 1] as const },
  panel: { duration: 0.28, ease: [0.22, 1, 0.36, 1] as const },
  list: { duration: 0.24, ease: [0.22, 1, 0.36, 1] as const },
  answer: { type: "spring", stiffness: 420, damping: 27, mass: 0.65 } as const,
};

export const pageVariants = {
  initial: { opacity: 0, y: 12, filter: "blur(3px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)" },
  exit: { opacity: 0, y: -8, filter: "blur(2px)" },
};

export const listVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { staggerChildren: 0.055, delayChildren: 0.025 } },
  exit: { opacity: 0, transition: { duration: 0.12 } },
};

export const itemVariants = {
  initial: { opacity: 0, y: 9, scale: 0.99 },
  animate: { opacity: 1, y: 0, scale: 1, transition: motionTransitions.panel },
  exit: { opacity: 0, y: -5, transition: { duration: 0.14 } },
};

export const choiceMotion = {
  whileHover: { x: 3, borderColor: "rgba(155,231,245,.3)" },
  whileTap: { scale: 0.985 },
  transition: motionTransitions.answer,
};
