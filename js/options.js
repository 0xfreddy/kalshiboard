export const BOARD_SIZE_PRESETS = [
  { id: 'dense', title: 'Dense (30 x 10)', cols: 30, rows: 10 },
  { id: 'balanced', title: 'Balanced (24 x 8)', cols: 24, rows: 8 },
  { id: 'large', title: 'Large Text (18 x 6)', cols: 18, rows: 6 }
];

export const THEME_OPTIONS = [
  { id: 'dark', title: 'Dark' },
  { id: 'light', title: 'Light' }
];

export const CATEGORY_OPTIONS = [
  { id: '', title: 'All Categories', competitions: [] },
  {
    id: 'Climate and Weather',
    title: 'Climate and Weather',
    competitions: ['Daily temperature', 'Hourly temperature', 'Snow and rain', 'Natural disasters', 'Climate change', 'Hurricanes']
  },
  { id: 'Commodities', title: 'Commodities', competitions: ['Oil & Gas', 'Metals'] },
  { id: 'Companies', title: 'Companies', competitions: [] },
  {
    id: 'Crypto',
    title: 'Crypto',
    competitions: ['BTC', 'ETH', 'SOL', 'DOGE', 'BNB', 'XRP', 'HYPE', '15 min', 'Hourly', 'Pre-Market']
  },
  {
    id: 'Economics',
    title: 'Economics',
    competitions: ['Growth', 'Jobs & Economy', 'Inflation', 'Oil and energy', 'GDP', 'Fed', 'Global Central Banks', 'Housing', 'Econ Daily']
  },
  {
    id: 'Elections',
    title: 'Elections',
    competitions: ['US Elections', 'Primaries', 'House', 'International elections', 'Senate', 'Governor', '2028', 'Brazil', 'Peru']
  },
  {
    id: 'Entertainment',
    title: 'Entertainment',
    competitions: [
      'Music', 'Television', 'People', 'Music charts', 'Awards', 'Movies', 'Oscars', 'Emmys', 'Live Music',
      'Reality TV', 'Collectibles', 'Video games', 'Bezel', 'TV Charts', 'Grammys', 'Movie Charts',
      'Music Streams', 'Art', 'New Music', 'Head to Head', 'Pokemon', 'Rotten Tomatoes', 'Tonys'
    ]
  },
  {
    id: 'Financials',
    title: 'Financials',
    competitions: ['Companies', 'KPIs', 'Product launches', 'IPOs', 'Markets', 'Indices', 'M&A', 'CEOs', 'Foreign Exchange', 'Interest Rates', 'Match Ups']
  },
  { id: 'Mentions', title: 'Mentions', competitions: ['Politicians', 'Earnings', 'Sports'] },
  {
    id: 'Politics',
    title: 'Politics',
    competitions: ['Trump', 'Congress', 'International', 'SCOTUS & courts', 'Local', 'Recurring', 'Iran']
  },
  {
    id: 'Science and Technology',
    title: 'Science and Technology',
    competitions: ['AI', 'Energy', 'Big Tech & Business', 'Space', 'Public Health', 'Medicine', 'Physics & Math', 'Education']
  },
  { id: 'Social', title: 'Social', competitions: [] },
  {
    id: 'Sports',
    title: 'Sports',
    competitions: [
      'Pro Baseball', 'Pro Basketball (M)', 'College Basketball', 'Pro Football', 'College Football', 'Hockey',
      'Soccer', 'Tennis', 'Golf', 'CS2', 'Baseball', 'Basketball', 'Football', 'Motorsport', 'MMA',
      'Esports', 'Cricket', 'Boxing', 'Chess', 'Other', 'Rugby', 'Lacrosse', 'Darts', 'Aussie Rules', 'Squash'
    ]
  }
];

const STORAGE_KEY = 'kalshiBoardWebOptions';

export const DEFAULT_WEB_OPTIONS = {
  size: 'dense',
  theme: 'dark',
  category: '',
  competition: ''
};

export function boardPresetForSize(size) {
  return BOARD_SIZE_PRESETS.find(preset => preset.id === size) || BOARD_SIZE_PRESETS[0];
}

export function categoryOptionForId(category) {
  return CATEGORY_OPTIONS.find(option => option.id === category) || CATEGORY_OPTIONS[0];
}

export function normalizeOptions(options = {}) {
  const size = boardPresetForSize(options.size).id;
  const theme = options.theme === 'light' ? 'light' : 'dark';
  const categoryOption = categoryOptionForId(options.category);
  const competition = categoryOption.competitions.includes(options.competition) ? options.competition : '';

  return {
    size,
    theme,
    category: categoryOption.id,
    competition
  };
}

export function readStoredOptions() {
  try {
    return normalizeOptions({
      ...DEFAULT_WEB_OPTIONS,
      ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    });
  } catch {
    return { ...DEFAULT_WEB_OPTIONS };
  }
}

export function writeStoredOptions(options) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeOptions(options)));
}

export function optionsFromParams(params) {
  const stored = readStoredOptions();
  const fromParams = {
    size: params.get('size') || stored.size,
    theme: params.get('theme') || stored.theme,
    category: params.get('category') || stored.category,
    competition: params.get('competition') || stored.competition
  };

  const cols = Number.parseInt(params.get('cols'), 10);
  const rows = Number.parseInt(params.get('rows'), 10);
  const sizeFromDimensions = BOARD_SIZE_PRESETS.find(preset => preset.cols === cols && preset.rows === rows)?.id;

  if (sizeFromDimensions) {
    fromParams.size = sizeFromDimensions;
  }

  return normalizeOptions(fromParams);
}
