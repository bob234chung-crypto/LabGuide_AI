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
  'iodine-starch': {
    hypothesis: 'If the spot has starch, iodine turns it blue-black.',
    variables: 'I change starch or water. I look at the colour. I use the same iodine and the same tile.',
    apparatus: 'I use a spotting tile and iodine. Iodine shows if starch is there.',
    procedure: 'Put starch on the tile.\nPut water on another spot.\nAdd iodine to both.',
    summary: 'I test starch and water with iodine. Starch goes blue-black. Water stays brown.',
  },
  'leaf-starch': {
    hypothesis: 'A green leaf in the light has starch.',
    variables: 'I test a green leaf. I look for starch. I use the same iodine.',
    apparatus: 'I use a leaf, a beaker and alcohol. Alcohol takes out the green colour.',
    procedure: 'Boil the leaf in water.\nWarm it in hot alcohol with the burner off.\nWash the leaf and add iodine.',
    summary: 'I test a green leaf for starch. Alcohol stays in hot water, away from the flame.',
  },
  'oxygen-plant': {
    hypothesis: 'The water plant makes oxygen.',
    variables: 'I look at the gas from the water plant. The teacher tests for oxygen. The light stays bright.',
    apparatus: 'I use a water plant, a funnel and a test tube. The teacher uses a glowing splint.',
    procedure: 'Put the plant under the funnel.\nCollect the gas in a test tube.\nThe teacher tests the gas with a glowing splint.',
    summary: 'The water plant makes a gas. The teacher shows that the gas is oxygen.',
  },
  'light-needed': {
    hypothesis: 'Light is needed to make starch.',
    variables: 'I change the light on the leaf. I look for starch. I keep the same leaf and the same time.',
    apparatus: 'I use a leaf, foil and iodine. The foil stops light on one part.',
    procedure: 'Cover part of the leaf with foil.\nLeave the leaf in bright light.\nTest the leaf for starch.',
    summary: 'Part of the leaf gets light and has starch. The covered part does not.',
  },
  'chlorophyll-needed': {
    hypothesis: 'Chlorophyll is needed to make starch.',
    variables: 'I compare the green part and the white part. I look for starch. I keep the same light.',
    apparatus: 'I use a variegated leaf and iodine. Only the green part has chlorophyll.',
    procedure: 'Leave the variegated leaf in bright light.\nTest the leaf for starch.\nCompare the green part and the white part.',
    summary: 'The green part has starch. The part with no chlorophyll does not.',
  },
  'carbon-dioxide-needed': {
    hypothesis: 'Carbon dioxide is needed to make starch.',
    variables: 'I change the carbon dioxide around one leaf. I look for starch. I keep the same light.',
    apparatus: 'I use two leaves and soda lime. My teacher handles the soda lime.',
    procedure: 'The teacher puts soda lime around one leaf.\nThe other leaf stays in normal air.\nTest both leaves for starch.',
    summary: 'The leaf in normal air has starch. The leaf with no carbon dioxide does not.',
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
