// SPDX-FileCopyrightText: 2026 Ben Richardson <https://benrichardson.dev>
// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on au-spectrum by Ben Richardson — https://benrichardson.dev

/**
 * Three rules the whole site rests on, kept together and unit-tested:
 *
 *   1. **Entity merge.** The register's unit is a CLIENT_NO, not an organisation.
 *      Telstra holds four of them, the NSW Telecommunications Authority seven,
 *      Airservices Australia six — none of Airservices' six is larger than 328,
 *      so unmerged it does not appear in the top thirty at all, and merged it
 *      is seventeenth. Every league table on the site is wrong without this.
 *   2. **Natural-person flag.** Clause 8 of the ACMA's licence forbids
 *      reproducing a natural person's Client Information. CLIENT_TYPE_ID = 7 is
 *      the register's own flag and is nearly right, but it is wrong in both
 *      directions: it contains trustee companies, and real people are filed
 *      under other types. The flag below is the union of both tests.
 *   3. **Sector.** The register's own `industry_cat` is blank on 54% of clients
 *      and its "Safety Services" category is used by nobody at all, so it cannot
 *      be the site's sector axis. This is a hand table over the largest holders
 *      plus ordered keyword rules for the tail, with an explicit UNCLASSIFIED
 *      bucket that is drawn rather than hidden.
 */

/** The 17 holder classes. Order is the legend order. */
export const CLASSES = [
  { id: 'TELCO', label: 'Telecommunications', hue: '#38bdf8' },
  { id: 'GOV_PUBLIC_SAFETY', label: 'Police, fire & ambulance', hue: '#f87171' },
  { id: 'MINING', label: 'Mining & resources', hue: '#fbbf24' },
  { id: 'BROADCAST', label: 'Broadcasters', hue: '#c084fc' },
  { id: 'UTILITIES', label: 'Electricity, gas & water', hue: '#34d399' },
  { id: 'GOV_OTHER', label: 'Other government', hue: '#60a5fa' },
  { id: 'TRANSPORT', label: 'Rail, ports & aviation', hue: '#fb923c' },
  { id: 'RADIO_DEALER', label: 'Radio dealers & resellers', hue: '#a3a3a3' },
  { id: 'LOCAL_GOV', label: 'Local government', hue: '#22d3ee' },
  { id: 'VOLUNTEER_RESCUE', label: 'Volunteer rescue', hue: '#f472b6' },
  { id: 'GOV_DEFENCE', label: 'Defence', hue: '#94a3b8' },
  { id: 'RETAIL_COMMERCIAL', label: 'Retail & commercial', hue: '#facc15' },
  { id: 'INDUSTRY', label: 'Industry & manufacturing', hue: '#d4d4aa' },
  { id: 'EDUCATION', label: 'Education & research', hue: '#818cf8' },
  { id: 'HEALTH', label: 'Health', hue: '#5eead4' },
  { id: 'AMATEUR_CLUB', label: 'Amateur radio clubs', hue: '#e879f9' },
  { id: 'INDIVIDUAL', label: 'Individual licensees', hue: '#71717a' },
  { id: 'UNCLASSIFIED', label: 'Unclassified', hue: '#525252' },
];

export const CLASS_IDS = CLASSES.map((c) => c.id);

/**
 * N2 normalisation. Deliberately conservative: it fixes case, punctuation and
 * the three abbreviation pairs that actually occur, and stops there.
 *
 * The tempting next step (N3: also strip PTY/LIMITED/GROUP/HOLDINGS/AUSTRALIA)
 * was measured and rejected — it buys 39 extra collapses register-wide and
 * merges CSL Australia (shipping) with CSL Limited (biotech), turns the ABC
 * into the key "BROADCASTING", and produces an empty key that swallows two
 * different trust companies.
 */
export function normaliseName(name) {
  return (name || '')
    .toUpperCase()
    .replace(/[   ]/g, ' ') // 37 non-breaking spaces hide in the register's names
    .replace(/ /g, ' ')
    .replace(/&/g, ' AND ')
    .replace(/\bLTD\b/g, 'LIMITED')
    .replace(/\bINCORPORATED\b/g, 'INC')
    .replace(/[.,'’"()\-\/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** ABN modulus-89 checksum. 7 of the register's 10,740 ABNs fail it. */
export function validAbn(abn) {
  const s = (abn || '').replace(/\s/g, '');
  if (!/^\d{11}$/.test(s)) return false;
  const weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  let sum = 0;
  for (let i = 0; i < 11; i++) sum += (Number(s[i]) - (i === 0 ? 1 : 0)) * weights[i];
  return sum % 89 === 0;
}

const CORPORATE_TOKEN = /\b(PTY|LTD|LIMITED|INC|CORPORATION|CORP|COMPANY|GROUP|HOLDINGS|TRUST|TRUSTEE|COUNCIL|SHIRE|DEPARTMENT|DEPT|AUTHORITY|COMMISSION|ASSOCIATION|CLUB|SERVICES|SERVICE|SOCIETY|CHURCH|SCHOOL|COLLEGE|UNIVERSITY|HOSPITAL|MINING|ENERGY|RADIO|COMMUNICATIONS|SYSTEMS|ENTERPRISES|INDUSTRIES|PARTNERSHIP|CO OPERATIVE|COOPERATIVE|NL|PLC|GOVERNMENT|BRIGADE|AMBULANCE|POLICE|FIRE|RESCUE|AIRPORT|PORT|RAIL|WATER|COUNCIL)\b/;

/**
 * Words that mark an organisation even when the rest of the name is bare.
 * Every one of these was added because it produced a false positive against the
 * real register: a name-shape test alone flags SYDNEY TRAINS, BUREAU OF
 * METEOROLOGY, MONASH HEALTH, CITY OF ALBANY and the Australian Antarctic
 * Division as people. Over-flagging is not harmless — it deletes real holders
 * from every league table on the site.
 */
const ORG_WORD = /\b(AUSTRALIA|AUSTRALIAN|NATIONAL|NSW|VIC|QLD|WA|SA|TAS|NT|ACT|NEW SOUTH WALES|VICTORIA|VICTORIAN|QUEENSLAND|TASMANIA|TASMANIAN|TERRITORY|STATE|CITY|TOWN|REGIONAL|METROPOLITAN|DISTRICT|DIVISION|BOARD|BUREAU|INSTITUTE|TAFE|HEALTH|MEDICAL|PARKS|RACING|GUARD|VOLUNTEER|MISSION|FOUNDATION|GRAMMAR|COURT|MEMORIAL|LLC|SPA|BV|INTERNATIONAL|CENTRE|CENTER|VENUES|MANAGEMENT|FARMING|FARMS|MACHINERY|STEVEDORES|NETWORKS|SOLUTIONS|BEYOND|ISLAND|VALLEY|HARBOUR|BAY|RIVER|CREEK|LODGE|RESORT|MOTORS|TRANSPORT|TRAINS|TRAMS|FERRIES|METRO|LOGISTICS|CONTRACTING|CONTRACTORS|CONSTRUCTIONS|ENGINEERING|TECHNOLOGY|TECHNOLOGIES|AVIATION|HELICOPTERS|CHARTER|TOURS|SECURITY|WILDLIFE|CONSERVANCY|RSPCA|WESLEY|EPWORTH|MONASH|ALFRED|AUSTIN|PENINSULA|GOULBURN|ECHUCA|WANGARATTA|ALBURY|WODONGA|SYDNEY|MELBOURNE|BRISBANE|PERTH|ADELAIDE|HOBART|DARWIN|CANBERRA|NEWCASTLE|GEELONG|TOWNSVILLE|CAIRNS|MARITIME|ROADS|CABS|TAXI|TAXIS|RESCUE|SAFETY)\b/;

/**
 * A name shaped like a natural person, used ONLY to catch individuals the
 * register has mis-typed as something other than "Person" — farm partnerships
 * filed as companies, hobbyists filed as community groups. Deliberately narrow:
 * two to four bare words, no corporate token, no organisational word, no digits.
 *
 * It is never applied on its own — see isNaturalPerson.
 */
export function looksPersonal(name) {
  const n = normaliseName(name);
  if (!n) return false;
  if (CORPORATE_TOKEN.test(n)) return false;
  if (ORG_WORD.test(n)) return false;
  if (/\d/.test(n)) return false;

  // Joined partnerships — "D.R NETHERCOTE & J.A NETHERCOTE", "MAX R & MERRYN
  // HENKE", "DOUGLAS J & ANTONIETTA M LEE". These are two people, and they are
  // the commonest way a farm or a household appears in the register. The `&`
  // normalises to " AND ", which pushed them over the word limit and let 110 of
  // them through with their names and their address-named sites published.
  if (/ AND /.test(n)) {
    const halves = n.split(' AND ');
    // Note the arrow function. Passing `bareNameShape` directly hands
    // Array.every's INDEX to the second parameter, so the third part of a
    // three-way name silently needs two words — which published seven families
    // by name and five of their farms on the map, with every gate green.
    return halves.length <= 3 && halves.every((h) => bareNameShape(h));
  }
  return bareNameShape(n, 2);
}

/** 1–4 bare alphabetic words, each short enough to be a name or an initial. */
function bareNameShape(part, minWords = 1) {
  const words = part.trim().split(' ').filter(Boolean);
  if (words.length < minWords || words.length > 4) return false;
  return words.every((w) => /^[A-Z']+$/.test(w) && w.length <= 15);
}

/** A client holding more than this many licences is never caught by the second arm. */
export const PERSON_SHAPE_MAX_LICENCES = 5;

/**
 * Clause 8 test, applied per client row.
 *
 * `CLIENT_TYPE_ID = 7` ("Person") is the register's own flag and does almost
 * all the work — 2,995 of 14,373 clients. It is not sufficient on its own:
 * individuals turn up filed as "Community or Volunteer Group" (a farm
 * partnership, a hobbyist with a repeater), so a second arm adds names that are
 * unmistakably personal.
 *
 * That second arm is bounded three ways, because a loose name-shape test is
 * genuinely destructive — unbounded, it flags SYDNEY TRAINS, MONASH HEALTH and
 * the Bureau of Meteorology as people and deletes them from every league table
 * on the site. It requires no ACN, an organisational-vocabulary miss, and a
 * book of at most five licences. The last condition is the important one: every
 * individual it needs to catch holds one or two licences, no leaderboard on the
 * site reaches down to five, and so a false positive there costs four or five
 * licences folded into an aggregate row while a false negative publishes
 * somebody's home address to ten metres.
 *
 * Note the asymmetry in the first arm, which is also deliberate: 423 type-7
 * clients carry a corporate token (trustee companies) and are STILL treated as
 * persons. Type 7 is the register's own assertion about its own licensee.
 *
 * @param {Record<string,string>} client
 * @param {number} licenceCount how many licences that CLIENT_NO holds
 */
export function isNaturalPerson(client, licenceCount = 0) {
  if (client.CLIENT_TYPE_ID === '7') return true;
  if (client.ACN) return false;
  if (licenceCount > PERSON_SHAPE_MAX_LICENCES) return false;
  return looksPersonal(client.LICENCEE);
}

/**
 * Tier B: ordered keyword rules for everything outside the hand table.
 * ORDER IS LOAD-BEARING and is asserted in the test suite — `/DEPARTMENT OF/`
 * before the mining rule would file every state mining department as generic
 * government, and `/POLICE/` first is what keeps "Queensland Police Service"
 * out of GOV_OTHER.
 */
export const TIER_B = [
  [/\bPOLICE\b/, 'GOV_PUBLIC_SAFETY'],
  [/\b(RURAL FIRE|FIRE BRIGADE|FIRE SERVICE|FIRE AND EMERGENCY|FIRE AND RESCUE|BUSH FIRE|COUNTRY FIRE)\b/, 'GOV_PUBLIC_SAFETY'],
  [/\bAMBULANCE\b/, 'GOV_PUBLIC_SAFETY'],
  [/\b(SURF LIFE|SURF LIFESAVING|COAST GUARD|MARINE RESCUE|STATE EMERGENCY|SES|VOLUNTEER RESCUE|VRA RESCUE)\b/, 'VOLUNTEER_RESCUE'],
  [/\b(SHIRE|COUNCIL|CITY OF|MUNICIPAL|REGIONAL COUNCIL)\b/, 'LOCAL_GOV'],
  [/\bDEFENCE\b/, 'GOV_DEFENCE'],
  [/\b(MINING|MINERALS|IRON ORE|COAL|GOLD MINES|RESOURCES LIMITED|MINES LIMITED|QUARRY|QUARRIES|BAUXITE|NICKEL|LITHIUM|ALUMINA|PETROLEUM|OIL AND GAS|LNG)\b/, 'MINING'],
  [/\b(ELECTRICITY|ENERGY|POWER|WATER|SEWERAGE|GAS NETWORKS|HYDRO|GRID|UTILITIES)\b/, 'UTILITIES'],
  [/\b(RAIL|RAILWAY|RAILWAYS|PORT|PORTS|AIRPORT|AIRPORTS|AIRLINES|AIRWAYS|TRANSPORT|BUS LINES|SHIPPING|STEVEDOR)\b/, 'TRANSPORT'],
  [/\b(BROADCAST|BROADCASTING|RADIO STATION|TELEVISION|MEDIA|FM|TV)\b/, 'BROADCAST'],
  [/\b(TELECOM|TELECOMMUNICATIONS|TELSTRA|OPTUS|VODAFONE|NBN|MOBILE|WIRELESS|NETWORKS|INTERNET|BROADBAND|SATELLITE)\b/, 'TELCO'],
  [/\b(TWO WAY|RADIO COMMUNICATIONS|COMMUNICATIONS PTY|ELECTRONICS|RADIO SERVICES|RADIO SUPPLY)\b/, 'RADIO_DEALER'],
  [/\b(UNIVERSITY|SCHOOL|COLLEGE|TAFE|EDUCATION|CSIRO|INSTITUTE|OBSERVATORY)\b/, 'EDUCATION'],
  [/\b(HOSPITAL|HEALTH|MEDICAL|PATHOLOGY)\b/, 'HEALTH'],
  [/\b(AMATEUR RADIO|RADIO CLUB|WIRELESS INSTITUTE|REPEATER GROUP|RADIO SOCIETY)\b/, 'AMATEUR_CLUB'],
  [/\b(DEPARTMENT OF|DEPT OF|AUTHORITY|COMMISSION|GOVERNMENT|MINISTRY|AGENCY|BUREAU)\b/, 'GOV_OTHER'],
];

/**
 * @param {string} displayName the entity's display name (the LICENCEE of its
 *   largest member)
 * @param {Record<string,string>} tierA hand table, keyed on the normalised name
 * @returns {string} a class id
 */
export function classifyEntity(displayName, tierA) {
  const key = normaliseName(displayName);
  if (tierA[key]) return tierA[key];
  for (const [re, cls] of TIER_B) if (re.test(key)) return cls;
  return 'UNCLASSIFIED';
}

/** Union-find over client numbers. */
export class Union {
  constructor() { this.parent = new Map(); }
  find(x) {
    let r = x;
    while (this.parent.get(r) !== undefined && this.parent.get(r) !== r) r = this.parent.get(r);
    let c = x;
    while (this.parent.get(c) !== undefined && this.parent.get(c) !== c) {
      const n = this.parent.get(c);
      this.parent.set(c, r);
      c = n;
    }
    return r;
  }
  add(x) { if (!this.parent.has(x)) this.parent.set(x, x); }
  join(a, b) {
    this.add(a); this.add(b);
    const ra = this.find(a); const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

/**
 * Merge client rows into entities: same normalised name, or same
 * checksum-valid ABN.
 *
 * What this deliberately does NOT do, and what the site says out loud: it does
 * not merge corporate groups. Rio Tinto's Pilbara Iron (3,252 licences), The
 * Pilbara Infrastructure (793) and Hamersley Iron (336) stay three entities,
 * because no name or ABN rule joins them. The ranking is of licensed entities.
 *
 * @param {Record<string,string>[]} clients
 * @returns {{ rootOf: Map<string,string>, members: Map<string,string[]> }}
 */
export function mergeClients(clients) {
  const u = new Union();
  const byName = new Map();
  const byAbn = new Map();
  for (const c of clients) {
    u.add(c.CLIENT_NO);
    const key = normaliseName(c.LICENCEE);
    if (key) {
      if (byName.has(key)) u.join(c.CLIENT_NO, byName.get(key));
      else byName.set(key, c.CLIENT_NO);
    }
    if (validAbn(c.ABN)) {
      if (byAbn.has(c.ABN)) u.join(c.CLIENT_NO, byAbn.get(c.ABN));
      else byAbn.set(c.ABN, c.CLIENT_NO);
    }
  }
  const rootOf = new Map();
  const members = new Map();
  for (const c of clients) {
    const r = u.find(c.CLIENT_NO);
    rootOf.set(c.CLIENT_NO, r);
    if (!members.has(r)) members.set(r, []);
    members.get(r).push(c.CLIENT_NO);
  }
  return { rootOf, members };
}
