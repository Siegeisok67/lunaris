import { useId, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  CircleAlert,
  CircleCheck,
  LoaderCircle,
  RotateCcw,
  SkipForward,
  Sparkles,
} from "lucide-react";
import type { LoopState, QuestionCard, SpecValue } from "../../types/architect";
import { GlassCard } from "../ui/GlassCard";
import { choiceMotion, motionTransitions } from "../../lib/motion";

interface ClarificationLoopProps {
  state: LoopState;
  onAnswer: (id: string, answer: string) => void;
  onSkip: () => void;
  onRetry: () => void;
  onBack: () => void;
}

function readableLabel(key: string): string {
  return key.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function readableValue(value: SpecValue): string {
  if (value === null) return "Not specified";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "None";
  return String(value);
}

function QuestionPanel({
  question,
  index,
  onAnswer,
}: {
  question: QuestionCard;
  index: number;
  onAnswer: (id: string, answer: string) => void;
}) {
  const [customAnswer, setCustomAnswer] = useState("");
  const inputId = useId();

  const submitCustom = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const answer = customAnswer.trim();
    if (answer) onAnswer(question.id, answer);
  };

  return (
    <GlassCard className="clarification-question-card" delay={0.05 + index * 0.07}>
      <div className="clarification-question-heading">
        <span className="clarification-question-number">{String(index + 1).padStart(2, "0")}</span>
        <div>
          <p className="clarification-question-kicker">A DETAIL THAT SHAPES THE PLAN</p>
          <h2>{question.question}</h2>
        </div>
      </div>

      {question.options && question.options.length > 0 && (
        <div className="clarification-options" role="group" aria-label={`Quick answers for ${question.question}`}>
          {question.options.map((option) => (
            <motion.button
              className="clarification-option"
              key={option}
              type="button"
              onClick={() => onAnswer(question.id, option)}
              {...choiceMotion}
            >
              <span>{option}</span>
              <ArrowRight size={15} aria-hidden="true" />
            </motion.button>
          ))}
        </div>
      )}

      <form className="clarification-custom-answer" onSubmit={submitCustom}>
        <label htmlFor={inputId}>Or write your own answer</label>
        <div className="clarification-custom-field">
          <textarea
            id={inputId}
            value={customAnswer}
            onChange={(event) => setCustomAnswer(event.target.value)}
            placeholder="Add the detail that matters to you…"
            maxLength={2_000}
            rows={2}
          />
          <button className="primary-button" type="submit" disabled={!customAnswer.trim()}>
            Use answer <ArrowRight size={15} aria-hidden="true" />
          </button>
        </div>
      </form>
    </GlassCard>
  );
}

export function ClarificationLoop({ state, onAnswer, onSkip, onRetry, onBack }: ClarificationLoopProps) {
  const busy = state.status === "evaluating" || state.status === "compiling";
  const specEntries = Object.entries(state.result?.known_specs ?? {});
  const skillIds = state.result?.detected_skills ?? [];
  const questions = state.status === "questioning" ? state.result?.next_questions ?? [] : [];
  const busyMessage = state.status === "compiling"
    ? "Compiling your execution blueprint…"
    : state.answers.length > 0
      ? "Refining the plan with your answer…"
      : "Reading your request and finding the important decisions…";

  return (
    <div className="clarification-view">
      <header className="clarification-heading">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={motionTransitions.page}>
          <div className="eyebrow"><span className="eyebrow-line" /> FIND THE RIGHT DETAILS <span className="eyebrow-line" /></div>
          <h1>Make it <span>specific.</span></h1>
          <p>Answer the choices that matter. Lunaris will turn them into a clear execution plan.</p>
        </motion.div>
        <div className="clarification-progress" aria-label={`Clarification round ${Math.max(1, state.turn)}`}>
          <span className="clarification-progress-label">ROUND {String(Math.max(1, state.turn)).padStart(2, "0")}</span>
          <span className="clarification-progress-dot" />
          <span>{state.answers.length} {state.answers.length === 1 ? "answer" : "answers"} recorded</span>
        </div>
      </header>

      <div className="clarification-layout">
        <main className="clarification-main">
          <AnimatePresence mode="wait">
            {busy && (
              <motion.div
                key={state.status}
                className="clarification-busy"
                role="status"
                aria-live="polite"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={motionTransitions.panel}
              >
                <div className="clarification-busy-icon"><LoaderCircle className="spin" size={25} aria-hidden="true" /></div>
                <h2>{busyMessage}</h2>
                <p>{state.status === "compiling" ? "Adding your specs, assumptions, and selected skill rules." : "The Architect is preparing the next useful step."}</p>
              </motion.div>
            )}

            {state.status === "error" && (
              <motion.div
                key="error"
                className="clarification-error"
                role="alert"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={motionTransitions.panel}
              >
                <CircleAlert size={25} aria-hidden="true" />
                <h2>The Architect could not finish this round.</h2>
                <p className="inline-error">{state.error || "Please try again or compile with the details already collected."}</p>
                <button className="primary-button" type="button" onClick={onRetry}>
                  <RotateCcw size={15} aria-hidden="true" /> Retry this round
                </button>
              </motion.div>
            )}

            {state.status === "questioning" && (
              <motion.div
                key={`questions-${state.turn}`}
                className="clarification-question-list"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={motionTransitions.page}
              >
                <div className="clarification-section-heading">
                  <div><Sparkles size={16} aria-hidden="true" /><span>CLARIFY THE REQUEST</span></div>
                  <p>Choose a suggestion or add your own answer. Each answer refines the next round.</p>
                </div>
                {questions.length > 0 ? questions.map((question, index) => (
                  <QuestionPanel key={`${state.turn}-${question.id}`} question={question} index={index} onAnswer={onAnswer} />
                )) : (
                  <GlassCard className="clarification-empty-card">
                    <CircleCheck size={22} aria-hidden="true" />
                    <h2>No more questions were returned.</h2>
                    <p>Compile the details gathered so far to review the blueprint.</p>
                  </GlassCard>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        <aside className="clarification-aside" aria-label="Details gathered so far">
          <GlassCard className="clarification-context-card" delay={0.1}>
            <div className="clarification-card-title"><span className="clarification-card-icon"><Sparkles size={15} aria-hidden="true" /></span> YOUR REQUEST</div>
            <p className="clarification-request-text">{state.originalPrompt}</p>
          </GlassCard>

          <GlassCard className="clarification-spec-card" delay={0.15}>
            <div className="clarification-card-title"><span className="clarification-card-icon"><CircleCheck size={15} aria-hidden="true" /></span> KNOWN DETAILS <span className="clarification-count">{specEntries.length}</span></div>
            {specEntries.length ? (
              <dl className="clarification-spec-list">
                {specEntries.map(([key, value]) => (
                  <div className="clarification-spec-row" key={key}>
                    <dt>{readableLabel(key)}</dt>
                    <dd>{readableValue(value)}</dd>
                  </div>
                ))}
              </dl>
            ) : <p className="clarification-aside-empty">Details will appear here as the Architect learns more.</p>}
          </GlassCard>

          <GlassCard className="clarification-skill-card" delay={0.2}>
            <div className="clarification-card-title"><span className="clarification-card-icon"><Sparkles size={15} aria-hidden="true" /></span> SUGGESTED SKILLS <span className="clarification-count">{skillIds.length}</span></div>
            {skillIds.length ? (
              <ul className="clarification-skill-list">
                {skillIds.map((id) => <li className="clarification-skill-pill" key={id}>{id}</li>)}
              </ul>
            ) : <p className="clarification-aside-empty">Relevant skills will appear when detected.</p>}
          </GlassCard>
        </aside>
      </div>

      <div className="clarification-footer">
        <button className="quiet-action" type="button" onClick={onBack}>
          <ArrowLeft size={15} aria-hidden="true" /> Back to request
        </button>
        <button className="clarification-skip-button" type="button" onClick={onSkip} disabled={busy}>
          Skip &amp; Compile Now <SkipForward size={15} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
