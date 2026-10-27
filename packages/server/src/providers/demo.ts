import { STAGE_TITLES, heuristicStageReview, notYetReply, type AppStage } from '@labguide/shared';
import { hintChoices, hintQuestions } from '../lessons.js';
import type { PlanReview, ProviderHealth, StageReviewContext, TutorDraft, TutorProvider, TutorTurnContext } from './types.js';

const GREETINGS: Record<AppStage, { text: string; questions: string[] }> = {
  theme: {
    text: 'Hello! I am your LabGuide tutor. I will ask questions to help you plan. I will not write your answers for you.',
    questions: ['Which topic would you like to investigate?'],
  },
  hypothesis: {
    text: 'A hypothesis is a prediction that you can test.',
    questions: ['What will you change?', 'What do you think will happen?'],
  },
  variables: {
    text: 'A fair test changes only one thing at a time.',
    questions: ['What will you change?', 'What will you measure?', 'What will you keep the same?'],
  },
  apparatus: {
    text: 'Choose apparatus that measures precisely. Explain your important choices.',
    questions: ['What will you use to measure your results?'],
  },
  procedure: {
    text: 'Write clear steps that a classmate could follow.',
    questions: ['What is your first step?'],
  },
  safety: {
    text: 'Let us check that your plan is safe for the school lab.',
    questions: ['Which part of your plan uses heat, glass or chemicals?'],
  },
  summary: {
    text: 'Read your whole plan from start to end.',
    questions: ['Does your method really test your hypothesis?'],
  },
  diagram: {
    text: 'Now build a side-view diagram of your setup. Place and label every item yourself.',
    questions: ['Which piece of apparatus will you place first?'],
  },
};

/** Hint 1 and hint 2 when no lesson brief exists. Guiding questions only. They never say the idea is correct. */
const HINTS: Record<AppStage, [string, string]> = {
  theme: [
    'Think about which topic you find most interesting.',
    'Pick a topic where you can change one thing and look at another.',
  ],
  hypothesis: [
    'Think about what you will change, and what you will look at.',
    'Say what you will change, and what you think you will see.',
  ],
  variables: [
    'Name one thing you change and one thing you look at.',
    'Controlled variables are things you keep the same. Think about amounts, sizes and times.',
  ],
  apparatus: [
    'Look at what you will look at. Which tool helps you see it?',
    'Say what each important tool is for.',
  ],
  procedure: [
    'Imagine a classmate follows your steps with no help.',
    'Start each step with an action word, such as "Measure", "Place" or "Record".',
  ],
  safety: [
    'Read your plan again and look for possible dangers.',
    'Look for heat, glass, chemicals and gases. What keeps you safe from each one?',
  ],
  summary: [
    'Check that each part of your plan matches the others.',
    'Use the same words for your variables in the hypothesis, the cards and the method.',
  ],
  diagram: [
    'Place the item that holds your materials first.',
    'Label every item in your setup.',
  ],
};

export const LESSON_MISS =
  'I could not find the lesson for this practical, so this reply is from the Demo tutor. I will not invent a different experiment.';

const HINT_QUESTIONS: Record<AppStage, string> = {
  theme: 'Which topic will you choose?',
  hypothesis: 'How would you write your own prediction now?',
  variables: 'What will you keep the same in your test?',
  apparatus: 'Which tool will you choose, and why?',
  procedure: 'What will your next step be?',
  safety: 'What could go wrong in your plan?',
  summary: 'Which part of your plan could be clearer?',
  diagram: 'What will you add next?',
};

const GLOSSARY_WORDS: Record<string, string> = {
  hypothesis: 'A hypothesis is a prediction that you can test.',
  'independent variable': 'The independent variable is the one thing you change on purpose.',
  'dependent variable': 'The dependent variable is what you measure.',
  'controlled variable': 'A controlled variable is something you keep the same to make the test fair.',
  'fair test': 'In a fair test you change only one thing and keep everything else the same.',
  reliable: 'Results are reliable when you get similar results each time you repeat the test.',
  precise: 'A precise tool gives readings with small scale divisions.',
  apparatus: 'Apparatus is the equipment you use in an experiment.',
};

function safetyReply(stage: AppStage, block: { message: string; hazard?: string; alternative?: string }): TutorDraft {
  return {
    kind: 'safety',
    text: [
      block.message,
      block.hazard ? `Why: ${block.hazard}` : '',
      block.alternative ? `Safe way: ${block.alternative}` : '',
      stage === 'diagram'
        ? 'You cannot submit your diagram until you fix this.'
        : 'You cannot move on until you change your plan.',
    ]
      .filter(Boolean)
      .join(' '),
    questions: [],
  };
}

/**
 * The deterministic safety reply for this turn, if a safety rule is broken. Used by every
 * provider: safety blocks are decided by rules, never by a model.
 */
export function ruleSafetyReply(ctx: TutorTurnContext): TutorDraft | null {
  const { request, stage, validation, diagramChecks } = ctx;
  const planBlocks =
    stage === 'diagram'
      ? []
      : validation.safetyBlocks.filter(
          (b) => b.stage === stage || stage === 'safety' || stage === 'summary' || b.stage !== 'safety',
        );
  const diagramBlocks = stage === 'diagram' ? diagramChecks.filter((c) => c.severity === 'safety_block' && !c.passed) : [];
  const block = planBlocks[0] ?? diagramBlocks[0];
  if (block && (request.type !== 'enter' || planBlocks.some((b) => b.stage === stage) || diagramBlocks.length)) {
    return safetyReply(stage, block);
  }
  return null;
}

/**
 * Simulated tutor. Replies come from templates keyed to the stage and the
 * deterministic validation results, so they react to what the student wrote,
 * but they never contain the student's answers.
 */
export class DemoAdapter implements TutorProvider {
  readonly id = 'demo' as const;
  readonly demo = true;

  async sendTurn(ctx: TutorTurnContext): Promise<TutorDraft> {
    const { request, stage, validation, diagramChecks } = ctx;

    const safety = ruleSafetyReply(ctx);
    if (safety) return safety;

    if (request.type === 'enter') {
      return { kind: 'greeting', ...GREETINGS[stage] };
    }

    if (request.type === 'hint') {
      const level = ctx.hintLevel;
      const theme = ctx.plan.theme.theme;
      if (level === 3) {
        const choices = hintChoices(theme, stage);
        if (!choices) {
          return {
            kind: 'hint',
            hintLevel: 3,
            text: LESSON_MISS,
            questions: ['What will you change, and what will you look at?'],
          };
        }
        return {
          kind: 'hint',
          hintLevel: 3,
          text: 'Pick the best sentence for this practical.',
          questions: [],
          choices,
        };
      }
      const guided = hintQuestions(theme, stage, level);
      return {
        kind: 'hint',
        hintLevel: level,
        text: guided ? 'Think about this practical.' : HINTS[stage][level - 1],
        questions: (guided ?? [HINT_QUESTIONS[stage]]).slice(0, 3),
      };
    }

    if (request.type === 'message') {
      const msg = request.text.toLowerCase();
      const living =
        ctx.plan.theme.theme === 'photosynthesis' ||
        ctx.plan.theme.theme === 'iodine-starch' ||
        ctx.plan.theme.theme === 'leaf-starch' ||
        ctx.plan.theme.theme === 'oxygen-plant' ||
        ctx.plan.theme.theme === 'light-needed' ||
        ctx.plan.theme.theme === 'chlorophyll-needed' ||
        ctx.plan.theme.theme === 'carbon-dioxide-needed';
      if (living && /\bwater\b/.test(msg) && /\b(need|needed|necessary|test|factor|die|kill)\b/.test(msg)) {
        return {
          kind: 'socratic',
          text: 'Water is needed for photosynthesis. You cannot test it, because the plant would die without water.',
          questions: ['Which factor can you change in this practical?'],
        };
      }
      if (/(write|do|give|tell).{0,20}(for me|the answer|my answer|it for me)|just tell me|answer for me/.test(msg)) {
        return {
          kind: 'socratic',
          text: 'I cannot write it for you. This is your investigation, and your ideas matter. Let us think it through together.',
          questions: [GREETINGS[stage].questions[0]],
        };
      }
      const term = Object.keys(GLOSSARY_WORDS).find((t) => msg.includes(t));
      if (term && /(what|mean|meaning|explain)/.test(msg)) {
        return {
          kind: 'socratic',
          text: GLOSSARY_WORDS[term],
          questions: ['How could you use this idea in your own plan?'],
        };
      }
    }

    // 'check' or a general message. Praise only when this stage has no problems.
    const stageIssues =
      stage === 'diagram'
        ? diagramChecks
            .filter((c) => !c.passed && c.severity !== 'safety_block')
            .map((c) => ({ ruleId: c.ruleId, stage: 'summary' as const, severity: c.severity, message: c.message }))
        : [...validation.stages[stage].issues].sort((a, b) => Number(!!b.required) - Number(!!a.required));
    const praise =
      stage === 'diagram'
        ? diagramChecks.filter((c) => c.passed && c.severity !== 'info').map((c) => c.message)
        : validation.stages[stage].praise;

    if (stageIssues.length) {
      return { kind: 'socratic', text: notYetReply(stageIssues[0].message), questions: [] };
    }
    const specific = (praise[0] ?? '').replace(/^good\.\s*/i, '').trim();
    const done =
      specific ||
      (stage === 'diagram'
        ? 'Your diagram passes the checks. You can generate the labelled diagram.'
        : `You finished your ${STAGE_TITLES[stage as keyof typeof STAGE_TITLES].toLowerCase()}.`);
    return {
      kind: 'praise',
      text: `Good. ${done.endsWith('.') ? done : `${done}.`}`,
      questions: praise.length ? [] : ['Can you explain your thinking to a classmate?'],
    };
  }

  /** No model in Demo mode: the junior-form checks decide. */
  async reviewPlan(ctx: StageReviewContext): Promise<PlanReview> {
    return heuristicStageReview(ctx.plan, ctx.stage);
  }

  async health(): Promise<ProviderHealth> {
    return { ok: true, demo: true, detail: 'Demo mode – simulated tutor, no real connection.' };
  }
}
