import { STAGE_TITLES, heuristicStageReview, type AppStage, type Issue } from '@labguide/shared';
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

/** Hint 1 = gentle nudge, Hint 2 = more specific, Hint 3 = worked example on a DIFFERENT topic. */
const HINTS: Record<AppStage, [string, string, string]> = {
  theme: [
    'Think about which topic you find most interesting.',
    'Pick a topic where you can change one thing and measure another.',
    'Example on a different topic: "How does the length of a pendulum affect the time for one swing?" You change the length. You measure the time.',
  ],
  hypothesis: [
    'Think about what you will change, and what you expect to happen.',
    'Say what you will change, and whether you think the result will go up or down.',
    'Example on a different topic: "If the height of a ramp increases, then a toy car will roll further." Now try your own topic.',
  ],
  variables: [
    'Name one thing you change and one thing you measure.',
    'Controlled variables are things that could also change your result. Think about amounts, sizes and times.',
    'Example on a different topic: ramp height and a toy car. Independent: ramp height. Dependent: distance rolled. Controlled: the same car, the same floor.',
  ],
  apparatus: [
    'Look at your dependent variable. Which tool measures it?',
    'Compare two tools. The one with smaller scale divisions gives a more precise reading.',
    'Example on a different topic: "I chose a measuring cylinder, not a beaker, because its scale is more precise for 50 cm³ of water."',
  ],
  procedure: [
    'Imagine a classmate follows your steps with no help.',
    'Start each step with an action word, such as "Measure", "Place" or "Record". Say when you repeat the test.',
    'Example on a different topic (ramp and car): 1. Set the ramp to 10 cm high. 2. Release the car from the top. 3. Measure the distance it rolls. 4. Repeat 3 times and find the average.',
  ],
  safety: [
    'Read your plan again and look for possible dangers.',
    'Look for heat, glass, chemicals and gases. Think about what protects you from each one.',
    'Example on a different topic: to melt wax, wear goggles, hold the hot beaker with tongs, and tie long hair back.',
  ],
  summary: [
    'Check that each part of your plan matches the others.',
    'Use the same words for your variables in the hypothesis, the variables cards and the method.',
    'Example on a different topic: a ramp plan says "distance rolled" in the hypothesis, the variables and the method. Everything matches.',
  ],
  diagram: [
    'Place the item that holds your materials first.',
    'Show how you measure your dependent variable. Label every item.',
    'Example on a different topic: a ramp diagram shows the ramp, the car and a metre rule beside it. Each item has a label line.',
  ],
};

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

function asQuestion(issue: Issue): { statement?: string; question?: string } {
  return issue.message.trim().endsWith('?') ? { question: issue.message } : { statement: issue.message };
}

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
      return {
        kind: 'hint',
        hintLevel: level,
        text: `Hint ${level}: ${HINTS[stage][level - 1]}`,
        questions: [HINT_QUESTIONS[stage]],
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

    // 'check' or a general message: specific praise + up to 2 guiding questions.
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

    const statements: string[] = [];
    const questions: string[] = [];
    if (praise[0]) statements.push(praise[0]);
    for (const issue of stageIssues) {
      const q = asQuestion(issue);
      if (q.question && questions.length < 2) questions.push(q.question);
      else if (q.statement && statements.length < 3) statements.push(q.statement);
      if (questions.length >= 2) break;
    }
    if (!stageIssues.length) {
      statements.push(
        stage === 'diagram'
          ? 'Your diagram passes the checks. You can generate the labelled diagram.'
          : `Your ${STAGE_TITLES[stage as keyof typeof STAGE_TITLES].toLowerCase()} looks complete. You can move on.`,
      );
      if (praise.length < 1) questions.push('Can you explain your thinking to a classmate?');
    }
    return {
      kind: stageIssues.length ? 'socratic' : 'praise',
      text: statements.join(' '),
      questions,
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
