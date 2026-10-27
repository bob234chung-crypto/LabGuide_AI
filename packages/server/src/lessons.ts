import type { AppStage, HintChoice, ThemeId } from '@labguide/shared';

/**
 * Short lesson briefs for the tutor. Server only: the browser never receives these.
 * Each brief says the aim, a fair test, what a good S1–S2 answer names, the control,
 * and the safety rule. It is not a worksheet answer key.
 */

export interface LessonBrief {
  practical: string;
  aim: string;
  fairTest: string;
  /** What a good answer names. Not the wording of the answer. */
  names: string;
  control: string;
  safety: string;
}

type Trio = readonly [good: string, vague: string, notTest: string];

interface Lesson extends LessonBrief {
  choices: Record<AppStage, Trio>;
}

const WHY: Record<AppStage, { vague: string; notTest: string }> = {
  theme: {
    vague: 'This is too vague. It does not say what you will test.',
    notTest: 'This is not a test. It does not say what you will change or look at.',
  },
  hypothesis: {
    vague: 'This is too vague. It does not say what you change or what you look at.',
    notTest: 'This is not a test. It does not say what you will compare.',
  },
  variables: {
    vague: 'This is too vague. It does not name what you change, what you look at, and what stays the same.',
    notTest: 'This is not a test. It does not say what you will keep the same.',
  },
  apparatus: {
    vague: 'This is too vague. It does not name the equipment or what it is for.',
    notTest: 'This is not a test. It does not say how you will use the equipment.',
  },
  procedure: {
    vague: 'This is too vague. It does not say what you do in the test.',
    notTest: 'This is not a test. It does not say what you will compare.',
  },
  safety: {
    vague: 'This is too vague. It does not name the danger or the safe way.',
    notTest: 'This is not a test. It does not say how you stay safe in the lab.',
  },
  summary: {
    vague: 'This is too vague. It does not say what the test changes and what it looks at.',
    notTest: 'This is not a test. It does not say how the parts of the plan fit together.',
  },
  diagram: {
    vague: 'This is too vague. It does not say which items the diagram shows.',
    notTest: 'This is not a test. A label that only names a fact is not your setup.',
  },
};

const STAGE_LINE: Record<AppStage, string> = {
  theme: 'On this stage a good answer names the practical the student will do.',
  hypothesis: 'On this stage a good answer names what is changed and what is looked at.',
  variables: 'On this stage a good answer names what is changed, what is looked at, and what stays the same.',
  apparatus: 'On this stage a good answer names the equipment and what it is for.',
  procedure: 'On this stage a good answer names the steps of this practical.',
  safety: 'On this stage a good answer names the danger and the safe way in the school lab.',
  summary: 'On this stage a good answer shows the plan is the same practical from start to end.',
  diagram: 'On this stage a good answer shows the setup for this practical, with labels.',
};

function lesson(
  brief: LessonBrief,
  choices: Record<AppStage, Trio>,
): Lesson {
  return { ...brief, choices };
}

const LESSONS: Record<Exclude<ThemeId, 'custom'>, Lesson> = {
  photosynthesis: lesson(
    {
      practical: 'Rate of photosynthesis',
      aim: 'See how light changes how fast a water plant makes oxygen bubbles.',
      fairTest: 'Change only the lamp distance. Keep the same plant, the same water and the same time.',
      names: 'A good answer names the lamp distance and the bubbles.',
      control: 'The plant, the water and the time stay the same.',
      safety: 'School lab only, with a teacher. Do not do this at home. Keep the lamp and the glass on the bench.',
    },
    {
      theme: ['I will see how lamp distance changes the bubbles from pondweed.', 'I will do a plant experiment.', 'Plants are green.'],
      hypothesis: ['If the lamp is closer, the pondweed makes more bubbles.', 'The plant will do better.', 'Plants are living things.'],
      variables: ['I change the lamp distance. I look at the bubbles. I keep the same pondweed.', 'I change some things and watch.', 'A lamp gives light.'],
      apparatus: ['I use a lamp, pondweed and a stopwatch. The stopwatch times one minute.', 'I use some equipment.', 'A stopwatch has buttons.'],
      procedure: ['Put the pondweed in water, move the lamp, and count the bubbles for one minute.', 'Do the steps carefully.', 'Pondweed lives in water.'],
      safety: ['I do this in the school lab with my teacher. The lamp stays on the bench.', 'I will be careful.', 'Glass is see-through.'],
      summary: ['I change the lamp distance and I look at the bubbles. The pondweed stays the same.', 'My plan is about plants.', 'Photosynthesis is a process.'],
      diagram: ['My diagram shows pondweed in water, a lamp and a stopwatch, each with a label.', 'I will draw the equipment.', 'A lamp is a light.'],
    },
  ),
  enzyme: lesson(
    {
      practical: 'Enzyme activity',
      aim: 'See how temperature changes the foam from potato and hydrogen peroxide.',
      fairTest: 'Change only the temperature. Keep the same amount of potato and the same peroxide.',
      names: 'A good answer names the temperature and the foam.',
      control: 'The amount of potato and the peroxide stay the same.',
      safety: 'School lab only, with a teacher. Do not do this at home. Wear eye protection. The teacher handles the peroxide.',
    },
    {
      theme: ['I will see how temperature changes the foam from potato.', 'I will do a chemistry experiment.', 'Potatoes are food.'],
      hypothesis: ['If the water is warmer, the reaction makes more foam.', 'It will work better.', 'Enzymes are in cells.'],
      variables: ['I change the temperature. I look at the foam. I keep the same amount of potato.', 'I change things and see.', 'Hydrogen peroxide is a liquid.'],
      apparatus: ['I use potato, hydrogen peroxide and a measuring cylinder. The cylinder shows the foam.', 'I use some bottles.', 'A cylinder is tall.'],
      procedure: ['Put the potato in the peroxide and see how high the foam goes.', 'Mix them and watch.', 'Potato is a vegetable.'],
      safety: ['I wear eye protection. My teacher handles the hydrogen peroxide.', 'I will be safe.', 'Foam is white.'],
      summary: ['I change the temperature and look at the foam. I use the same amount of potato.', 'My plan is about enzymes.', 'Catalase is an enzyme.'],
      diagram: ['My diagram shows the potato, the peroxide and the cylinder, each with a label.', 'I will draw a tube.', 'A cylinder measures volume.'],
    },
  ),
  dissolving: lesson(
    {
      practical: 'Rate of dissolving',
      aim: 'See how water temperature changes how fast sugar dissolves.',
      fairTest: 'Change only the water temperature. Keep the same amount of sugar and the same stirring.',
      names: 'A good answer names the water temperature and the time to dissolve.',
      control: 'The amount of sugar and the stirring stay the same.',
      safety: 'School lab only, with a teacher. Do not do this at home. The teacher provides hot water.',
    },
    {
      theme: ['I will see how warm water changes how fast sugar dissolves.', 'I will mix things.', 'Sugar is sweet.'],
      hypothesis: ['If the water is warmer, the sugar dissolves faster.', 'It will be better in hot water.', 'Sugar comes from plants.'],
      variables: ['I change the water temperature. I look at the time. I keep the same amount of sugar.', 'I change the water and watch.', 'A beaker holds water.'],
      apparatus: ['I use a beaker, sugar and a stopwatch. The stopwatch times how long the sugar takes.', 'I use normal lab things.', 'Sugar is a solid.'],
      procedure: ['Add the sugar to the water, start the stopwatch, and stop it when the sugar is gone.', 'Stir and wait.', 'Water is a liquid.'],
      safety: ['I do this in the school lab. My teacher brings the hot water.', 'I will not burn myself.', 'Beakers are glass.'],
      summary: ['I change the water temperature and look at the time. I use the same amount of sugar.', 'My plan is about dissolving.', 'A solution is a mixture.'],
      diagram: ['My diagram shows the beaker, the sugar and the stopwatch, each with a label.', 'I will draw a beaker.', 'Sugar dissolves in water.'],
    },
  ),
  insulation: lesson(
    {
      practical: 'Thermal insulation',
      aim: 'See how cotton wool changes how fast hot water cools.',
      fairTest: 'Change only the cotton wool. Keep the same amount of water and the same starting temperature.',
      names: 'A good answer names the cotton wool and the water temperature.',
      control: 'The amount of water and the starting temperature stay the same.',
      safety: 'School lab only, with a teacher. Do not do this at home. The teacher provides the hot water.',
    },
    {
      theme: ['I will see how cotton wool changes how fast hot water cools.', 'I will test heat.', 'Wool is soft.'],
      hypothesis: ['If I add more cotton wool, the water cools more slowly.', 'It will stay nicer.', 'Heat moves from hot to cold.'],
      variables: ['I change the cotton wool. I look at the temperature. I keep the same amount of water.', 'I wrap things and see.', 'A thermometer measures temperature.'],
      apparatus: ['I use a beaker, cotton wool and a thermometer. The thermometer reads the temperature.', 'I use a cup and some cloth.', 'Cotton wool is fluffy.'],
      procedure: ['Wrap the beaker, pour in hot water, and read the temperature after a few minutes.', 'Pour the water and wait.', 'Hot water is hot.'],
      safety: ['My teacher provides the hot water. I do this in the school lab.', 'I will be careful with heat.', 'Temperature is a measurement.'],
      summary: ['I change the cotton wool and look at the temperature. I use the same amount of water.', 'My plan is about keeping warm.', 'Insulation slows heat loss.'],
      diagram: ['My diagram shows the beaker, the cotton wool and the thermometer, each with a label.', 'I will draw the beaker.', 'A thermometer has a scale.'],
    },
  ),
  'iodine-starch': lesson(
    {
      practical: 'Iodine test for starch',
      aim: 'See the colour of iodine on a starch spot and on a water spot.',
      fairTest: 'Use the same iodine and the same tile. Change only the spot: starch or water.',
      names: 'A good answer names the spot and the colour of the iodine.',
      control: 'The water spot is the control. It has no starch.',
      safety: 'School lab only, with a teacher. Do not do this at home. Do not drink the iodine.',
    },
    {
      theme: ['I will test a starch spot and a water spot with iodine.', 'I will do a colour test.', 'Iodine is a liquid.'],
      hypothesis: ['If the spot has starch, iodine turns it blue-black.', 'The iodine will do something.', 'Starch is a food that plants store.'],
      variables: ['I change starch or water. I look at the colour. I keep the same iodine and the same tile.', 'I change the spots and see.', 'A spotting tile has wells.'],
      apparatus: ['I use a spotting tile and iodine. Iodine shows if starch is there.', 'I use some lab tools.', 'Iodine is brown.'],
      procedure: ['Put starch on one spot and water on another, then add iodine to both.', 'Add the liquids carefully.', 'Starch is a white powder.'],
      safety: ['I do this in the school lab with my teacher, and I do not drink the iodine.', 'I will be careful.', 'Iodine stains the skin.'],
      summary: ['I test starch and water with the same iodine and look at the colour.', 'My plan is about food tests.', 'Blue-black means a colour change.'],
      diagram: ['My diagram shows a spotting tile with starch, water and iodine, and each part is labelled.', 'I will draw the tile.', 'A tile has spots.'],
    },
  ),
  'leaf-starch': lesson(
    {
      practical: 'Starch in a green leaf',
      aim: 'Test a green leaf to see if it has starch.',
      fairTest: 'Use the same iodine and the same steps for the leaf you test.',
      names: 'A good answer names the green leaf and the starch test.',
      control: 'There is no second leaf in this test. The iodine colour shows if starch is there.',
      safety: 'School lab only, with a teacher. Heat alcohol only in hot water, with the burner off and away. Do not do this at home.',
    },
    {
      theme: ['I will test a green leaf for starch.', 'I will look at a leaf.', 'Leaves are green.'],
      hypothesis: ['A green leaf in the light has starch.', 'The leaf will look better.', 'Leaves make food.'],
      variables: ['I test a green leaf. I look for starch. I use the same iodine.', 'I test a leaf and see.', 'Alcohol is a liquid.'],
      apparatus: ['I use a leaf, a beaker and alcohol. Alcohol takes out the green colour.', 'I use hot things.', 'A leaf has veins.'],
      procedure: ['Boil the leaf in water, warm it in hot alcohol with the burner off, then wash it and add iodine.', 'Heat the leaf and add iodine.', 'Chlorophyll is green.'],
      safety: ['Alcohol stays in hot water, with the burner off and away. My teacher is with me.', 'I will be careful with heat.', 'Alcohol smells strong.'],
      summary: ['I test a green leaf for starch. Alcohol stays in hot water, away from the flame.', 'My plan is about leaves.', 'Iodine tests for starch.'],
      diagram: ['My diagram shows the beaker, the hot water, the alcohol tube and the leaf, each with a label.', 'I will draw a beaker.', 'The burner is off for the alcohol.'],
    },
  ),
  'oxygen-plant': lesson(
    {
      practical: 'Oxygen from a water plant',
      aim: 'Collect the gas from a water plant in bright light and test it.',
      fairTest: 'Keep the light bright and use the same water plant. The teacher tests the gas.',
      names: 'A good answer names the water plant and the gas test.',
      control: 'The light stays bright. The same plant is used.',
      safety: 'School lab only, with a teacher. The glowing splint is a teacher demonstration. Do not do this at home.',
    },
    {
      theme: ['I will collect gas from a water plant and my teacher will test it.', 'I will watch a plant.', 'Plants live in water.'],
      hypothesis: ['The water plant makes oxygen.', 'The plant will make something.', 'Oxygen is a gas in the air.'],
      variables: ['I look at the gas from the water plant. The teacher tests for oxygen. The light stays bright.', 'I watch the plant and see.', 'A splint is a thin stick.'],
      apparatus: ['I use a water plant, a funnel and a test tube. The teacher uses a glowing splint.', 'I use tubes.', 'A funnel is wide at the top.'],
      procedure: ['Put the plant under the funnel, collect the gas, and let the teacher test it with a glowing splint.', 'Set up the plant and wait.', 'Bubbles are gas.'],
      safety: ['The teacher tests the gas with a glowing splint. I do not do the splint test myself.', 'I will stand back.', 'Oxygen helps things burn.'],
      summary: ['The water plant makes a gas. The teacher shows that the gas is oxygen.', 'My plan is about plants.', 'A glowing splint relights in oxygen.'],
      diagram: ['My diagram shows the water plant, the funnel and the test tube, each with a label.', 'I will draw the plant.', 'The test tube collects gas.'],
    },
  ),
  'light-needed': lesson(
    {
      practical: 'Is light needed?',
      aim: 'See if the part of a leaf in the light has starch, and if the covered part does not.',
      fairTest: 'Use the same leaf and the same time. Change only the light: one part covered, one part in the light.',
      names: 'A good answer names light and starch.',
      control: 'The covered part of the same leaf is the control. It gets no light.',
      safety: 'School lab only, with a teacher. The teacher destarches the plant before the lesson. That is not a step at home. Heat alcohol only in hot water, with the burner off.',
    },
    {
      theme: ['I will cover part of a leaf and test both parts for starch.', 'I will use a leaf and foil.', 'Plants need light to live.'],
      hypothesis: ['Light is needed to make starch.', 'The leaf will do better in the light.', 'The Sun gives light.'],
      variables: ['I change the light on the leaf. I look for starch. I keep the same leaf and the same time.', 'I cover a leaf and see.', 'Foil is shiny.'],
      apparatus: ['I use a leaf, foil and iodine. The foil stops light on one part.', 'I use a leaf and some tools.', 'Aluminium foil is metal.'],
      procedure: ['Cover part of the leaf with foil, leave the leaf in bright light, then test the leaf for starch.', 'Cover the leaf and test it.', 'A leaf is flat.'],
      safety: ['My teacher destarches the plant before the lesson. Alcohol stays in hot water, with the burner off.', 'I will be careful.', 'The plant was kept in the dark by the teacher.'],
      summary: ['Part of the leaf gets light and has starch. The covered part is the control.', 'My plan is about light.', 'Photosynthesis needs light.'],
      diagram: ['My diagram shows the leaf with foil on one part, and each part is labelled.', 'I will draw a leaf.', 'Foil blocks light.'],
    },
  ),
  'chlorophyll-needed': lesson(
    {
      practical: 'Is chlorophyll needed?',
      aim: 'See if the green part of a variegated leaf has starch, and if the white part does not.',
      fairTest: 'Use the same leaf and the same light. Compare the green part with the white part.',
      names: 'A good answer names chlorophyll, or the green part, and starch.',
      control: 'The white part of the same leaf is the control. It has no chlorophyll.',
      safety: 'School lab only, with a teacher. The teacher destarches the plant before the lesson. That is not a step at home. Heat alcohol only in hot water, with the burner off.',
    },
    {
      theme: ['I will test the green part and the white part of a variegated leaf for starch.', 'I will look at a spotty leaf.', 'Some leaves are not all green.'],
      hypothesis: ['Chlorophyll is needed to make starch.', 'The green part will look better.', 'Chlorophyll is the green colour.'],
      variables: ['I compare the green part and the white part. I look for starch. I keep the same light.', 'I look at both parts.', 'A variegated leaf has two colours.'],
      apparatus: ['I use a variegated leaf and iodine. Only the green part has chlorophyll.', 'I use a leaf and iodine.', 'Iodine changes colour.'],
      procedure: ['Leave the variegated leaf in bright light, test it for starch, and compare the green part and the white part.', 'Test the leaf and look.', 'The white part has no green colour.'],
      safety: ['My teacher destarches the plant before the lesson. Alcohol stays in hot water, with the burner off.', 'I will be careful with the heater.', 'Variegated means two colours.'],
      summary: ['The green part has starch. The part with no chlorophyll is the control.', 'My plan is about green leaves.', 'Chlorophyll traps light.'],
      diagram: ['My diagram shows the variegated leaf, with the green part and the white part labelled.', 'I will draw the leaf.', 'The white part is the control.'],
    },
  ),
  'carbon-dioxide-needed': lesson(
    {
      practical: 'Is carbon dioxide needed?',
      aim: 'See if a leaf in normal air has starch, and if a leaf with no carbon dioxide does not.',
      fairTest: 'Keep the same light. Change only the carbon dioxide around one leaf.',
      names: 'A good answer names carbon dioxide and starch.',
      control: 'The leaf in normal air is the control. It has carbon dioxide.',
      safety: 'School lab only, with a teacher. Soda lime is corrosive: the teacher handles it. Students wear eye protection and do not touch it. Do not do this at home.',
    },
    {
      theme: ['I will compare a leaf in normal air with a leaf that has no carbon dioxide.', 'I will test two leaves.', 'Air has gases in it.'],
      hypothesis: ['Carbon dioxide is needed to make starch.', 'The leaf in the air will do better.', 'We breathe out carbon dioxide.'],
      variables: ['I change the carbon dioxide around one leaf. I look for starch. I keep the same light.', 'I change the air and see.', 'Soda lime is a chemical.'],
      apparatus: ['I use two leaves and soda lime. My teacher handles the soda lime.', 'I use leaves and a chemical.', 'Soda lime is a solid.'],
      procedure: ['The teacher puts soda lime around one leaf. The other leaf stays in normal air. Then test both leaves for starch.', 'Set up two leaves and test them.', 'Leaves need air.'],
      safety: ['My teacher handles the soda lime. I wear eye protection and I do not touch it.', 'I will be careful with chemicals.', 'Soda lime takes away carbon dioxide.'],
      summary: ['The leaf in normal air has starch. The leaf with no carbon dioxide does not. My teacher handles the soda lime.', 'My plan is about a gas.', 'Carbon dioxide is a gas.'],
      diagram: ['My diagram shows two leaves, one with soda lime, and each part is labelled.', 'I will draw two leaves.', 'One leaf is the control.'],
    },
  ),
};

const THEME_IDS = Object.keys(LESSONS) as Exclude<ThemeId, 'custom'>[];

export function retrieveLesson(theme: ThemeId | null | undefined): LessonBrief | null {
  if (!theme || theme === 'custom' || !LESSONS[theme]) return null;
  const { practical, aim, fairTest, names, control, safety } = LESSONS[theme];
  return { practical, aim, fairTest, names, control, safety };
}

/** Plain-text brief for the model. Not a worksheet, and not sent to the browser. */
export function formatLesson(theme: ThemeId | null | undefined, stage: AppStage): string | null {
  const brief = retrieveLesson(theme);
  if (!brief) return null;
  return [
    'Lesson brief for this practical. Use only this practical. Do not invent a different experiment.',
    `Practical: ${brief.practical}`,
    `Aim: ${brief.aim}`,
    `Fair test: ${brief.fairTest}`,
    `A good S1–S2 answer names: ${brief.names}`,
    `Control: ${brief.control}`,
    `Safety: ${brief.safety}`,
    STAGE_LINE[stage],
  ].join('\n');
}

export function hintQuestions(theme: ThemeId | null | undefined, stage: AppStage, level: 1 | 2): string[] | null {
  const brief = retrieveLesson(theme);
  if (!brief) return null;
  const name = brief.practical;
  if (level === 1) {
    const first: Record<AppStage, string> = {
      theme: `What will you test in ${name}?`,
      hypothesis: `What will you change in ${name}?`,
      variables: 'What is the one thing you will change?',
      apparatus: `Which tool will you use in ${name}?`,
      procedure: `What will you do first in ${name}?`,
      safety: `What could be unsafe in ${name}?`,
      summary: 'Does your plan test the same idea all the way through?',
      diagram: `Which item will you draw first for ${name}?`,
    };
    return [first[stage]];
  }
  const second: Record<AppStage, string> = {
    theme: 'What could you change, and what could you look at?',
    hypothesis: 'What will you look at?',
    variables: 'What will you look at, and what will you keep the same?',
    apparatus: 'What will that tool help you see or measure?',
    procedure: 'What will you compare at the end?',
    safety: 'What will your teacher do, and what will you wear?',
    summary: 'What stays the same so the test is fair?',
    diagram: 'What label does each item need?',
  };
  return [second[stage]];
}

/** Three choices about this practical. Exactly one has no `why` (the good sentence). */
export function hintChoices(theme: ThemeId | null | undefined, stage: AppStage): HintChoice[] | null {
  if (!theme || theme === 'custom' || !LESSONS[theme]) return null;
  const [good, vague, notTest] = LESSONS[theme].choices[stage];
  const why = WHY[stage];
  return [
    { id: 'vague', text: vague, why: why.vague },
    { id: 'good', text: good },
    { id: 'off', text: notTest, why: why.notTest },
  ];
}

export function lessonThemes(): Exclude<ThemeId, 'custom'>[] {
  return [...THEME_IDS];
}
