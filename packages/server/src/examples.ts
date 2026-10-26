import { normalise, type Plan, type ReviewedStage, type ThemeId } from '@labguide/shared';

/**
 * Short S1–S2 example answers for the student's own topic.
 * Templates only. The tutor chat never includes these. Demo mode uses the same text
 * and the client shows the Demo badge.
 */
const EXAMPLES: Record<Exclude<ThemeId, 'custom'>, Record<ReviewedStage, string>> = {
  photosynthesis: {
    hypothesis: 'If the lamp is closer, the pondweed makes more bubbles.',
    variables: 'I change the lamp distance. I look at the number of bubbles. I keep the same pondweed and the same water.',
    apparatus: 'I use a lamp, pondweed, a boiling tube and a stopwatch. The stopwatch times one minute.',
    procedure: 'Put the pondweed in water.\nPut the lamp close.\nCount the bubbles for one minute.',
    summary: 'I change the lamp distance and I look at the bubbles. The steps use the same pondweed.',
  },
  enzyme: {
    hypothesis: 'If the water is warmer, the reaction makes more foam.',
    variables: 'I change the temperature. I look at the foam. I keep the same amount of potato.',
    apparatus: 'I use potato, hydrogen peroxide and a measuring cylinder. The cylinder shows how much foam there is.',
    procedure: 'Put the potato in the peroxide.\nWatch the foam.\nSee how high the foam goes.',
    summary: 'I change the temperature and look at the foam. I use the same amount of potato.',
  },
  dissolving: {
    hypothesis: 'If the water is warmer, the sugar dissolves faster.',
    variables: 'I change the water temperature. I look at the time to dissolve. I keep the same amount of sugar.',
    apparatus: 'I use a beaker, sugar and a stopwatch. The stopwatch times how long the sugar takes.',
    procedure: 'Add the sugar to the water.\nStart the stopwatch.\nStop it when the sugar is gone.',
    summary: 'I change the water temperature and look at the time. I use the same amount of sugar.',
  },
  insulation: {
    hypothesis: 'If I add more cotton wool, the water stays warm for longer.',
    variables: 'I change the cotton wool. I look at the water temperature. I keep the same amount of water.',
    apparatus: 'I use a beaker, cotton wool and a thermometer. The thermometer reads the temperature.',
    procedure: 'Wrap the beaker.\nPour in hot water.\nRead the temperature after a few minutes.',
    summary: 'I change the cotton wool and look at the temperature. I use the same amount of water.',
  },
};

const CO2: Record<ReviewedStage, string> = {
  hypothesis: 'If there is more carbon dioxide, the photosynthesis rate goes up.',
  variables: 'I change the carbon dioxide. I look at the photosynthesis rate. I keep the same lamp and the same pondweed.',
  apparatus: 'I use pondweed, water and a stopwatch. The stopwatch times one minute while I watch the bubbles.',
  procedure: 'Put the pondweed in water.\nChange the carbon dioxide.\nLook at the photosynthesis rate for one minute.',
  summary: 'I change the carbon dioxide and I look at the photosynthesis rate. The lamp and the pondweed stay the same.',
};

function custom(plan: Plan, stage: ReviewedStage): string {
  const title = plan.theme.customTitle.trim() || 'my topic';
  const byStage: Record<ReviewedStage, string> = {
    hypothesis: `If I change one thing in my test on ${title}, the result I look at will change.`,
    variables: `I change one thing about ${title}. I look at the result. I keep the other things the same.`,
    apparatus: `I choose the equipment that holds my materials and one thing that measures the result for ${title}.`,
    procedure: `Set up the test for ${title}.\nChange one thing.\nLook at the result and write it down.`,
    summary: `My test on ${title} changes one thing and looks at the result. The other things stay the same.`,
  };
  return byStage[stage];
}

function usesCarbonDioxide(plan: Plan): boolean {
  const text = normalise([plan.hypothesis, plan.variables.independent, plan.variables.dependent].join(' '));
  return /carbon dioxide|\bco2\b|\bc02\b/.test(text);
}

/** A short example for this student's topic and stage. Not their own work. */
export function exampleAnswer(plan: Plan, stage: ReviewedStage): string {
  const theme = plan.theme.theme;
  if (!theme || theme === 'custom') return custom(plan, stage);
  if (theme === 'photosynthesis' && usesCarbonDioxide(plan)) return CO2[stage];
  return EXAMPLES[theme][stage];
}
