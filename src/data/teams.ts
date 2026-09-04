export interface TeamMeta {
  abbr: string;
  primary: string;
  secondary: string;
}

// Generated badge colors, not real team logos/marks.
export const TEAM_META: Record<string, TeamMeta> = {
  '49ers': { abbr: 'SF', primary: '#AA0000', secondary: '#B3995D' },
  'Bears': { abbr: 'CHI', primary: '#0B162A', secondary: '#C83803' },
  'Bengals': { abbr: 'CIN', primary: '#FB4F14', secondary: '#000000' },
  'Bills': { abbr: 'BUF', primary: '#00338D', secondary: '#C60C30' },
  'Broncos': { abbr: 'DEN', primary: '#FB4F14', secondary: '#002244' },
  'Browns': { abbr: 'CLE', primary: '#3A1B00', secondary: '#FF3C00' },
  'Buccaneers': { abbr: 'TB', primary: '#D50A0A', secondary: '#34302B' },
  'Cardinals': { abbr: 'ARI', primary: '#97233F', secondary: '#000000' },
  'Chargers': { abbr: 'LAC', primary: '#0080C6', secondary: '#FFC20E' },
  'Chiefs': { abbr: 'KC', primary: '#E31837', secondary: '#FFB81C' },
  'Colts': { abbr: 'IND', primary: '#002C5F', secondary: '#A2AAAD' },
  'Commanders': { abbr: 'WAS', primary: '#5A1414', secondary: '#FFB612' },
  'Cowboys': { abbr: 'DAL', primary: '#0B2265', secondary: '#869397' },
  'Dolphins': { abbr: 'MIA', primary: '#008E97', secondary: '#FC4C02' },
  'Eagles': { abbr: 'PHI', primary: '#004C54', secondary: '#A5ACAF' },
  'Falcons': { abbr: 'ATL', primary: '#A71930', secondary: '#000000' },
  'Giants': { abbr: 'NYG', primary: '#0B2265', secondary: '#A71930' },
  'Jaguars': { abbr: 'JAX', primary: '#006778', secondary: '#D7A22A' },
  'Jets': { abbr: 'NYJ', primary: '#125740', secondary: '#0A3D2A' },
  'Lions': { abbr: 'DET', primary: '#0076B6', secondary: '#B0B7BC' },
  'Oilers': { abbr: 'OIL', primary: '#4B92DB', secondary: '#C41E3A' },
  'Packers': { abbr: 'GB', primary: '#203731', secondary: '#FFB612' },
  'Panthers': { abbr: 'CAR', primary: '#0085CA', secondary: '#101820' },
  'Patriots': { abbr: 'NE', primary: '#002244', secondary: '#C60C30' },
  'Raiders': { abbr: 'LV', primary: '#0B0B0B', secondary: '#A5ACAF' },
  'Rams': { abbr: 'LAR', primary: '#003594', secondary: '#FFA300' },
  'Ravens': { abbr: 'BAL', primary: '#241773', secondary: '#9E7C0C' },
  'Saints': { abbr: 'NO', primary: '#101820', secondary: '#D3BC8D' },
  'Seahawks': { abbr: 'SEA', primary: '#002244', secondary: '#69BE28' },
  'Steelers': { abbr: 'PIT', primary: '#101820', secondary: '#FFB612' },
  'Texans': { abbr: 'HOU', primary: '#03202F', secondary: '#A71930' },
  'Titans': { abbr: 'TEN', primary: '#0C2340', secondary: '#4B92DB' },
  'Vikings': { abbr: 'MIN', primary: '#4F2683', secondary: '#FFC62F' },
};

export function teamMeta(name: string): TeamMeta {
  return TEAM_META[name] ?? { abbr: 'NFL', primary: '#5b6b64', secondary: '#9aa8a1' };
}

// The 32 current NFL franchises, used to build a full simulated league
// each season (separate from the historical player pool above).
export const NFL_TEAMS: string[] = [
  'Cardinals', 'Falcons', 'Ravens', 'Bills', 'Panthers', 'Bears', 'Bengals', 'Browns', 'Cowboys', 'Broncos', 'Lions', 'Packers', 'Texans', 'Colts', 'Jaguars', 'Chiefs', 'Raiders', 'Chargers', 'Rams', 'Dolphins', 'Vikings', 'Patriots', 'Saints', 'Giants', 'Jets', 'Eagles', 'Steelers', '49ers', 'Seahawks', 'Buccaneers', 'Titans', 'Commanders',
];

export const DIVISIONS: string[] = [
  'AFC East', 'AFC North', 'AFC South', 'AFC West', 'NFC East', 'NFC North', 'NFC South', 'NFC West',
];

export const TEAM_DIV: Record<string, string> = {
  'Bills': 'AFC East',
  'Dolphins': 'AFC East',
  'Patriots': 'AFC East',
  'Jets': 'AFC East',
  'Ravens': 'AFC North',
  'Bengals': 'AFC North',
  'Browns': 'AFC North',
  'Steelers': 'AFC North',
  'Texans': 'AFC South',
  'Colts': 'AFC South',
  'Jaguars': 'AFC South',
  'Titans': 'AFC South',
  'Broncos': 'AFC West',
  'Chiefs': 'AFC West',
  'Raiders': 'AFC West',
  'Chargers': 'AFC West',
  'Cowboys': 'NFC East',
  'Giants': 'NFC East',
  'Eagles': 'NFC East',
  'Commanders': 'NFC East',
  'Bears': 'NFC North',
  'Lions': 'NFC North',
  'Packers': 'NFC North',
  'Vikings': 'NFC North',
  'Falcons': 'NFC South',
  'Panthers': 'NFC South',
  'Saints': 'NFC South',
  'Buccaneers': 'NFC South',
  'Cardinals': 'NFC West',
  'Rams': 'NFC West',
  '49ers': 'NFC West',
  'Seahawks': 'NFC West',
};

