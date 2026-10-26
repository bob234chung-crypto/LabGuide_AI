import type { Apparatus, ThemeId, ThemeInfo } from './types.js';

export const THEMES: ThemeInfo[] = [
  {
    id: 'photosynthesis',
    title: 'Factors affecting rate of photosynthesis',
    blurb: 'How does light, carbon dioxide or temperature change how fast a plant makes oxygen?',
  },
  {
    id: 'enzyme',
    title: 'Enzyme activity',
    blurb: 'How do temperature or pH change how fast catalase breaks down hydrogen peroxide?',
  },
  {
    id: 'dissolving',
    title: 'Solubility / rate of dissolving',
    blurb: 'How do temperature, stirring or particle size change how fast a solid dissolves?',
  },
  {
    id: 'insulation',
    title: 'Thermal insulation / heat loss',
    blurb: 'Which material keeps hot water warm for the longest time?',
    note: 'Hot water provided by the teacher.',
  },
  {
    id: 'custom',
    title: 'Custom topic',
    blurb: 'Type a short title for your own fair-test investigation.',
  },
];

const WATER = 'fill="#cfe8f3" stroke="none"';
const GLASS_TOP_LIP = (x1: number, x2: number, y: number) =>
  `<path d="M${x1 - 4} ${y} L${x1} ${y + 4} M${x2 + 4} ${y} L${x2} ${y + 4}"/>`;

/** All drawings are simple 2D side-view sections, navy line on transparent. */
export const APPARATUS: Apparatus[] = [
  /* ----- Photosynthesis ----- */
  {
    id: 'pondweed',
    name: 'Pondweed',
    width: 30,
    height: 90,
    themes: ['photosynthesis'],
    svg: `<path d="M15 88 L15 6" stroke="#2f6b3a"/><path d="M15 70 q-12 -4 -12 -14 M15 70 q12 -4 12 -14 M15 48 q-12 -4 -12 -14 M15 48 q12 -4 12 -14 M15 26 q-10 -4 -10 -14 M15 26 q10 -4 10 -14" stroke="#2f6b3a"/>`,
  },
  {
    id: 'boiling-tube',
    name: 'Boiling tube',
    width: 40,
    height: 170,
    themes: ['photosynthesis', 'enzyme'],
    canContain: ['pondweed', 'thermometer', 'potato-catalase', 'dropper', 'glass-rod'],
    containSnap: { default: { x: 20, y: 160 }, thermometer: { x: 26, y: 158 } },
    containVerb: 'inside',
    svg: `<path d="M8 50 L8 150 A12 12 0 0 0 32 150 L32 50 Z" ${WATER}/><path d="M8 6 L8 150 A12 12 0 0 0 32 150 L32 6"/>${GLASS_TOP_LIP(8, 32, 4)}`,
  },
  {
    id: 'ethanol-tube',
    name: 'Boiling tube of ethanol',
    width: 40,
    height: 170,
    themes: ['photosynthesis'],
    flammable: true,
    note: 'Used to remove chlorophyll from a leaf in the starch test.',
    svg: `<path d="M8 90 L8 150 A12 12 0 0 0 32 150 L32 90 Z" fill="#f3e9c6" stroke="none"/><path d="M8 6 L8 150 A12 12 0 0 0 32 150 L32 6"/>${GLASS_TOP_LIP(8, 32, 4)}<text x="20" y="128" font-size="10" text-anchor="middle" fill="#1b2a4a" stroke="none" font-family="sans-serif">EtOH</text>`,
  },
  {
    id: 'beaker',
    name: 'Beaker',
    width: 120,
    height: 140,
    themes: ['photosynthesis', 'dissolving', 'insulation'],
    canContain: [
      'thermometer',
      'boiling-tube',
      'ethanol-tube',
      'test-tube',
      'glass-rod',
      'pondweed',
      'inverted-measuring-cylinder',
      'lid',
      'spatula',
    ],
    containSnap: {
      default: { x: 60, y: 134 },
      lid: { x: 60, y: 8 },
      thermometer: { x: 84, y: 130 },
      'glass-rod': { x: 36, y: 132 },
    },
    containVerb: 'inside',
    note: 'In photosynthesis, a beaker of water can act as a heat shield.',
    svg: `<path d="M12 44 L12 128 Q12 136 20 136 L100 136 Q108 136 108 128 L108 44 Z" ${WATER}/><path d="M12 10 L12 128 Q12 136 20 136 L100 136 Q108 136 108 128 L108 10"/>${GLASS_TOP_LIP(12, 108, 6)}<path d="M96 40 h8 M98 64 h6 M96 88 h8 M98 112 h6" stroke-width="1.5"/>`,
  },
  {
    id: 'lamp',
    name: 'Lamp',
    width: 130,
    height: 150,
    themes: ['photosynthesis'],
    measures: ['light', 'light intensity', 'brightness'],
    canContain: ['boiling-tube', 'beaker', 'test-tube'],
    containSnap: { default: { x: 100, y: 150 } },
    containVerb: 'under',
    svg: `<path d="M4 146 h50 M29 146 L29 30 L92 18"/><path d="M80 14 L118 34 L104 52 L74 30 Z"/><circle cx="98" cy="46" r="7"/><path d="M108 62 l6 8 M96 64 l0 10 M118 54 l9 4" stroke-width="1.5"/>`,
  },
  {
    id: 'metre-rule',
    name: 'Metre rule',
    width: 300,
    height: 24,
    themes: ['photosynthesis'],
    measures: ['distance', 'length', 'cm', 'light intensity'],
    measuring: true,
    svg: `<rect x="2" y="4" width="296" height="16" rx="2"/>${Array.from({ length: 15 }, (_, i) => `<path d="M${12 + i * 20} 4 v${i % 5 === 0 ? 9 : 5}" stroke-width="1.2"/>`).join('')}`,
  },
  {
    id: 'thermometer',
    name: 'Thermometer',
    width: 16,
    height: 150,
    themes: ['photosynthesis', 'enzyme', 'dissolving', 'insulation'],
    measures: ['temperature', '°c', 'degrees', 'heat', 'cool', 'warm'],
    measuring: true,
    svg: `<path d="M5 6 a3 3 0 0 1 6 0 L11 130 a7 7 0 1 1 -6 0 Z"/><circle cx="8" cy="138" r="4" fill="#c0392b" stroke="none"/><path d="M8 136 L8 70" stroke="#c0392b" stroke-width="2"/><path d="M11 30 h3 M11 50 h3 M11 70 h3 M11 90 h3 M11 110 h3" stroke-width="1"/>`,
  },
  {
    id: 'gas-syringe',
    name: 'Gas syringe',
    width: 200,
    height: 40,
    themes: ['photosynthesis', 'enzyme'],
    measures: ['volume', 'gas', 'oxygen', 'cm3', 'cm³', 'bubbles'],
    measuring: true,
    gasCollector: true,
    svg: `<path d="M2 20 h18"/><rect x="20" y="8" width="130" height="24" rx="3"/><path d="M60 12 v16 M150 20 h44 M194 10 v20"/><path d="M40 8 v5 M60 8 v5 M80 8 v5 M100 8 v5 M120 8 v5" stroke-width="1.2"/>`,
  },
  {
    id: 'inverted-measuring-cylinder',
    name: 'Inverted measuring cylinder',
    width: 40,
    height: 160,
    themes: ['photosynthesis'],
    measures: ['volume', 'gas', 'oxygen', 'cm3', 'cm³', 'bubbles'],
    measuring: true,
    gasCollector: true,
    svg: `<path d="M8 40 L8 156 L32 156 L32 40 Z" ${WATER}/><path d="M2 4 h36 M8 4 L8 156 M32 4 L32 156"/><path d="M8 30 h8 M8 60 h8 M8 90 h8 M8 120 h8" stroke-width="1.2"/>`,
  },
  {
    id: 'stopwatch',
    name: 'Stopwatch',
    width: 50,
    height: 60,
    themes: ['photosynthesis', 'enzyme', 'dissolving', 'insulation'],
    measures: ['time', 'seconds', 'minutes', 'how long', 'rate', 'speed', 'how fast'],
    measuring: true,
    svg: `<circle cx="25" cy="35" r="21"/><path d="M21 6 h8 M25 6 v8 M25 35 L25 22 M25 35 L34 39"/>`,
  },
  {
    id: 'sodium-hydrogencarbonate',
    name: 'Sodium hydrogencarbonate solution',
    width: 44,
    height: 72,
    themes: ['photosynthesis'],
    measures: ['carbon dioxide', 'co2', 'hydrogencarbonate'],
    svg: `<path d="M14 4 h16 v12 l8 10 v42 h-32 v-42 l8 -10 Z"/><path d="M7 40 h30 v28 h-30 Z" ${WATER}/><text x="22" y="36" font-size="8" text-anchor="middle" fill="#1b2a4a" stroke="none" font-family="sans-serif">NaHCO₃</text>`,
  },
  /* ----- Enzyme ----- */
  {
    id: 'test-tube',
    name: 'Test tube',
    width: 30,
    height: 130,
    themes: ['enzyme'],
    canContain: ['potato-catalase', 'thermometer', 'dropper'],
    containSnap: { default: { x: 15, y: 122 } },
    containVerb: 'inside',
    svg: `<path d="M6 50 L6 112 A9 9 0 0 0 24 112 L24 50 Z" ${WATER}/><path d="M6 6 L6 112 A9 9 0 0 0 24 112 L24 6"/>${GLASS_TOP_LIP(6, 24, 4)}`,
  },
  {
    id: 'water-bath',
    name: 'Water bath',
    width: 220,
    height: 120,
    themes: ['enzyme', 'dissolving'],
    heatSource: true,
    canContain: ['test-tube', 'boiling-tube', 'ethanol-tube', 'beaker', 'thermometer'],
    containSnap: { default: { x: 110, y: 104 }, thermometer: { x: 180, y: 104 } },
    containVerb: 'in',
    note: 'An electric water bath keeps a steady temperature with no flame.',
    svg: `<path d="M10 40 h200 v70 h-200 Z" ${WATER}/><path d="M6 20 L6 114 h208 L214 20"/><rect x="150" y="112" width="60" height="6"/><circle cx="30" cy="116" r="2"/>`,
  },
  {
    id: 'potato-catalase',
    name: 'Potato pieces (catalase)',
    width: 30,
    height: 24,
    themes: ['enzyme'],
    svg: `<rect x="3" y="10" width="12" height="12" fill="#e9d8a6"/><rect x="15" y="4" width="12" height="12" fill="#e9d8a6"/>`,
  },
  {
    id: 'hydrogen-peroxide',
    name: 'Dilute hydrogen peroxide',
    width: 44,
    height: 72,
    themes: ['enzyme'],
    measures: ['hydrogen peroxide', 'h2o2', 'substrate', 'concentration'],
    svg: `<path d="M14 4 h16 v12 l8 10 v42 h-32 v-42 l8 -10 Z"/><path d="M7 40 h30 v28 h-30 Z" ${WATER}/><text x="22" y="36" font-size="8" text-anchor="middle" fill="#1b2a4a" stroke="none" font-family="sans-serif">dil. H₂O₂</text>`,
  },
  {
    id: 'delivery-tube',
    name: 'Delivery tube',
    width: 130,
    height: 60,
    themes: ['enzyme'],
    canConnect: ['gas-syringe', 'inverted-measuring-cylinder', 'boiling-tube', 'test-tube'],
    svg: `<rect x="2" y="40" width="16" height="16" fill="#8a6d50" stroke="#1b2a4a"/><path d="M8 40 L8 10 Q8 4 14 4 L126 4 M12 40 L12 12 Q12 8 16 8 L126 8"/>`,
  },
  {
    id: 'spotting-tile',
    name: 'Spotting tile',
    width: 140,
    height: 24,
    themes: ['enzyme'],
    svg: `<rect x="2" y="4" width="136" height="18" rx="3"/><path d="M14 4 q8 10 16 0 M44 4 q8 10 16 0 M74 4 q8 10 16 0 M104 4 q8 10 16 0"/>`,
  },
  {
    id: 'iodine-solution',
    name: 'Iodine solution',
    width: 44,
    height: 72,
    themes: ['enzyme'],
    measures: ['starch', 'iodine'],
    svg: `<path d="M14 4 h16 v12 l8 10 v42 h-32 v-42 l8 -10 Z"/><path d="M7 40 h30 v28 h-30 Z" fill="#e8c9a0" stroke="none"/><text x="22" y="36" font-size="8" text-anchor="middle" fill="#1b2a4a" stroke="none" font-family="sans-serif">iodine</text>`,
  },
  {
    id: 'dropper',
    name: 'Dropper',
    width: 16,
    height: 80,
    themes: ['enzyme'],
    svg: `<path d="M3 4 h10 v22 h-10 Z" fill="#c9cfd8"/><path d="M5 26 L6 74 L8 78 L10 74 L11 26"/>`,
  },
  /* ----- Dissolving ----- */
  {
    id: 'glass-rod',
    name: 'Glass rod',
    width: 8,
    height: 160,
    themes: ['dissolving'],
    measures: ['stir', 'stirring'],
    svg: `<path d="M4 4 L4 156"/>`,
  },
  {
    id: 'electronic-balance',
    name: 'Electronic balance',
    width: 120,
    height: 50,
    themes: ['dissolving'],
    measures: ['mass', 'grams', ' g ', 'weigh', 'weight'],
    measuring: true,
    canContain: ['beaker'],
    containSnap: { default: { x: 60, y: 8 } },
    containVerb: 'on',
    svg: `<path d="M10 8 h100"/><rect x="4" y="12" width="112" height="34" rx="4"/><rect x="40" y="20" width="40" height="16"/><text x="60" y="32" font-size="9" text-anchor="middle" fill="#1b2a4a" stroke="none" font-family="sans-serif">0.00 g</text>`,
  },
  {
    id: 'measuring-cylinder',
    name: 'Measuring cylinder',
    width: 40,
    height: 160,
    themes: ['dissolving'],
    measures: ['volume', 'cm3', 'cm³', 'ml'],
    measuring: true,
    svg: `<path d="M9 60 L9 146 L31 146 L31 60 Z" ${WATER}/><path d="M9 6 L9 146 M31 6 L31 146 M2 154 h36 M9 146 L4 154 M31 146 L36 154"/><path d="M9 30 h8 M9 60 h8 M9 90 h8 M9 120 h8" stroke-width="1.2"/>`,
  },
  {
    id: 'spatula',
    name: 'Spatula',
    width: 120,
    height: 14,
    themes: ['dissolving'],
    svg: `<path d="M4 7 h86"/><path d="M90 3 h26 v8 h-26 Z"/>`,
  },
  /* ----- Thermal insulation ----- */
  ...(
    [
      ['cotton-wool', 'Cotton wool', '#ffffff', 'M24 30 q6 -6 12 0 q6 -6 12 0 M24 70 q6 -6 12 0 q6 -6 12 0 M98 30 q6 -6 12 0 q6 -6 12 0 M98 70 q6 -6 12 0 q6 -6 12 0'],
      ['aluminium-foil', 'Aluminium foil', '#dfe3e8', 'M18 20 l6 10 l-6 10 l6 10 l-6 10 l6 10 M122 20 l-6 10 l6 10 l-6 10 l6 10 l-6 10'],
      ['bubble-wrap', 'Bubble wrap', '#eef6fb', 'M20 30 a4 4 0 1 0 0.1 0 M20 60 a4 4 0 1 0 0.1 0 M20 90 a4 4 0 1 0 0.1 0 M120 30 a4 4 0 1 0 0.1 0 M120 60 a4 4 0 1 0 0.1 0 M120 90 a4 4 0 1 0 0.1 0'],
      ['newspaper', 'Newspaper', '#f1efe6', 'M18 26 h12 M18 40 h12 M18 54 h12 M18 68 h12 M110 26 h12 M110 40 h12 M110 54 h12 M110 68 h12'],
    ] as const
  ).map(
    ([id, name, fill, pattern]): Apparatus => ({
      id,
      name,
      width: 140,
      height: 152,
      themes: ['insulation'],
      canContain: ['beaker'],
      containSnap: { default: { x: 70, y: 144 } },
      containVerb: 'inside',
      svg: `<path d="M2 12 L2 150 L138 150 L138 12 L128 12 L128 140 L12 140 L12 12 Z" fill="${fill}"/><path d="${pattern}" stroke-width="1.2"/>`,
    }),
  ),
  {
    id: 'lid',
    name: 'Lid',
    width: 130,
    height: 14,
    themes: ['insulation'],
    svg: `<rect x="2" y="2" width="126" height="10" rx="2" fill="#f1efe6"/><path d="M84 2 v10 M90 2 v10" stroke-width="1.2"/>`,
  },
  {
    id: 'heat-resistant-gloves',
    name: 'Heat-resistant gloves',
    width: 60,
    height: 64,
    themes: ['insulation'],
    handProtection: true,
    svg: `<path d="M14 60 L14 26 Q14 8 22 8 L22 22 L22 6 Q30 2 32 8 L32 22 L32 6 Q40 2 42 8 L42 26 L52 18 Q58 22 50 32 L44 46 L44 60 Z"/>`,
  },
  {
    id: 'tongs',
    name: 'Tongs',
    width: 120,
    height: 30,
    themes: ['insulation'],
    handProtection: true,
    svg: `<path d="M4 15 L110 4 Q118 4 116 10 M4 15 L110 26 Q118 26 116 20"/><circle cx="8" cy="15" r="4"/>`,
  },
  /* ----- Common ----- */
  {
    id: 'bunsen-burner',
    name: 'Bunsen burner',
    width: 60,
    height: 150,
    themes: [],
    common: true,
    heatSource: true,
    svg: `<path d="M30 6 Q18 26 24 44 L36 44 Q42 26 30 6 Z" stroke="#1f5fa8"/><path d="M30 22 Q25 32 27 42 L33 42 Q35 32 30 22 Z" stroke="#1f5fa8" stroke-width="1.2"/><path d="M24 46 L24 128 M36 46 L36 128 M22 96 h16 v10 h-16 Z M8 128 h44 v16 h-44 Z M8 136 h-6"/>`,
  },
  {
    id: 'heat-proof-mat',
    name: 'Heat-proof mat',
    width: 170,
    height: 14,
    themes: [],
    common: true,
    canContain: ['bunsen-burner', 'tripod', 'beaker', 'clamp-stand', 'water-bath'],
    containSnap: { default: { x: 85, y: 2 } },
    containVerb: 'on',
    svg: `<rect x="2" y="2" width="166" height="10" fill="#e6e1d3"/><path d="M20 2 l10 10 M50 2 l10 10 M80 2 l10 10 M110 2 l10 10 M140 2 l10 10" stroke-width="1"/>`,
  },
  {
    id: 'tripod',
    name: 'Tripod',
    width: 120,
    height: 130,
    themes: [],
    common: true,
    canContain: ['gauze', 'beaker', 'bunsen-burner'],
    containSnap: { default: { x: 60, y: 4 }, 'bunsen-burner': { x: 60, y: 128 } },
    containVerb: 'on',
    svg: `<path d="M6 4 h108 M14 4 L4 128 M106 4 L116 128 M60 4 L60 128"/>`,
  },
  {
    id: 'gauze',
    name: 'Gauze',
    width: 130,
    height: 10,
    themes: [],
    common: true,
    canContain: ['beaker'],
    containSnap: { default: { x: 65, y: 2 } },
    containVerb: 'on',
    svg: `<path d="M2 4 h126 M2 7 h126" stroke-dasharray="3 3"/><rect x="40" y="2" width="50" height="7" fill="#cfd5dd" stroke="none"/>`,
  },
  {
    id: 'clamp-stand',
    name: 'Clamp stand with clamp',
    width: 170,
    height: 280,
    themes: [],
    common: true,
    canContain: [
      'boiling-tube',
      'ethanol-tube',
      'test-tube',
      'gas-syringe',
      'thermometer',
      'inverted-measuring-cylinder',
      'measuring-cylinder',
    ],
    containSnap: {
      default: { x: 140, y: 200 },
      'gas-syringe': { x: 110, y: 100 },
      thermometer: { x: 140, y: 190 },
    },
    containVerb: 'in',
    svg: `<rect x="4" y="266" width="110" height="12" fill="#e6e1d3"/><path d="M30 266 L30 8"/><rect x="24" y="70" width="14" height="14"/><path d="M38 77 L124 77 M124 68 Q134 68 134 77 Q134 86 124 86 M156 68 Q146 68 146 77 Q146 86 156 86"/>`,
  },
  {
    id: 'safety-goggles',
    name: 'Safety goggles',
    width: 84,
    height: 36,
    themes: [],
    common: true,
    eyeProtection: true,
    svg: `<path d="M8 10 Q4 30 22 30 Q34 30 38 20 L46 20 Q50 30 62 30 Q80 30 76 10 Z"/><path d="M2 14 h6 M76 14 h6"/>`,
  },
  {
    id: 'label-tag',
    name: 'Label tag',
    width: 64,
    height: 30,
    themes: [],
    common: true,
    svg: `<path d="M14 4 h46 v22 h-46 L4 15 Z" fill="#fffdf6"/><circle cx="14" cy="15" r="3"/>`,
  },
];

const BY_ID = new Map(APPARATUS.map((a) => [a.id, a]));

export function getApparatus(id: string): Apparatus | undefined {
  return BY_ID.get(id);
}

export function apparatusName(id: string): string {
  return BY_ID.get(id)?.name ?? id;
}

export interface ApparatusGroups {
  theme: ThemeId | null;
  themeItems: Apparatus[];
  common: Apparatus[];
  /** Custom topic only: every item, for the searchable full list. */
  all?: Apparatus[];
  note?: string;
}

export function apparatusForTheme(theme: ThemeId | null): ApparatusGroups {
  const common = APPARATUS.filter((a) => a.common);
  const info = THEMES.find((t) => t.id === theme);
  if (!theme || theme === 'custom') {
    return { theme, themeItems: [], common, all: APPARATUS.slice(), note: info?.note };
  }
  return {
    theme,
    themeItems: APPARATUS.filter((a) => a.themes.includes(theme)),
    common,
    note: info?.note,
  };
}

export function themeTitle(theme: ThemeId | null, customTitle = ''): string {
  if (theme === 'custom') return customTitle.trim() || 'Custom topic';
  return THEMES.find((t) => t.id === theme)?.title ?? 'New investigation';
}
