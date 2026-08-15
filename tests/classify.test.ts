// SPDX-FileCopyrightText: 2026 Ben Richardson <https://benrichardson.dev>
// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on au-spectrum by Ben Richardson — https://benrichardson.dev

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  normaliseName, validAbn, looksPersonal, isNaturalPerson, classifyEntity,
  mergeClients, CLASS_IDS, TIER_B,
} from '../pipeline/classify.mjs';

// jsdom leaves import.meta.url as an http: URL, so resolve from the project root.
const tierA = JSON.parse(readFileSync(join(process.cwd(), 'pipeline/sectors_tierA.json'), 'utf8'));

describe('normaliseName', () => {
  it('folds the three abbreviations that actually occur', () => {
    expect(normaliseName('Telstra Ltd')).toBe('TELSTRA LIMITED');
    expect(normaliseName('St John Ambulance Incorporated')).toBe('ST JOHN AMBULANCE INC');
    expect(normaliseName('Smith & Jones')).toBe('SMITH AND JONES');
  });

  it('collapses punctuation and doubled spaces', () => {
    expect(normaliseName('B.H.P.  Billiton  Iron Ore Pty. Ltd.')).toBe('B H P BILLITON IRON ORE PTY LIMITED');
  });

  it('normalises the non-breaking spaces hidden in the register', () => {
    expect(normaliseName('MOUNT DANDENONG')).toBe('MOUNT DANDENONG');
    expect(normaliseName('A B')).toBe('A B');
  });

  it('is stable under case and trailing whitespace', () => {
    expect(normaliseName('  optus mobile pty limited ')).toBe(normaliseName('OPTUS MOBILE PTY LIMITED'));
  });

  it('does NOT strip company suffixes', () => {
    // Stripping them merges CSL Australia (shipping) with CSL Limited (biotech)
    // and turns the ABC into the key "BROADCASTING". Measured and rejected.
    expect(normaliseName('CSL Australia Pty Ltd')).not.toBe(normaliseName('CSL Limited'));
  });
});

describe('validAbn', () => {
  it('accepts a checksum-valid ABN', () => {
    expect(validAbn('51824753556')).toBe(true); // ABC
  });
  it('rejects a mistyped one', () => {
    expect(validAbn('51824753557')).toBe(false);
  });
  it('rejects anything that is not eleven digits', () => {
    for (const bad of ['', '0', '123456789012', 'abcdefghijk', '5182475355']) {
      expect(validAbn(bad)).toBe(false);
    }
  });
});

describe('the natural-person test', () => {
  const person = (over: Record<string, string> = {}) => ({ CLIENT_TYPE_ID: '6', LICENCEE: 'Bruce Abrahams', ABN: '', ACN: '', ...over });

  it('always trusts the register\'s own Person flag', () => {
    expect(isNaturalPerson({ CLIENT_TYPE_ID: '7', LICENCEE: 'Spotlight Pty Ltd as trustee', ACN: '' }, 176)).toBe(true);
  });

  it('catches an individual the register has mis-typed', () => {
    expect(isNaturalPerson(person(), 1)).toBe(true);
    expect(isNaturalPerson(person({ LICENCEE: 'GE Hawgood' }), 3)).toBe(true);
  });

  it('catches a three-way joined name, not just a two-way one', () => {
    // `halves.every(bareNameShape)` hands Array.every's INDEX to the second
    // parameter, so the third part of a three-way name silently required two
    // words. Seven families were published by name and five of their farms
    // appeared on the map, with every gate green.
    for (const n of ['Gallinagh VP & SD & Co', 'Sutherland F & E & Sons',
      'D & A VERRALL & SON', 'R J & V M HATHWAY & SON']) {
      expect(looksPersonal(n)).toBe(true);
    }
  });

  it('catches a joined partnership — two people, not an organisation', () => {
    // These are the commonest way a farm or a household appears in the register,
    // and they slipped through an earlier rule because "&" normalises to " AND "
    // and pushed the name past the word limit. 110 couples were published with
    // their names and their address-named home sites before this was fixed.
    for (const n of ['GW & DJ Lewis', 'D.R NETHERCOTE & J.A NETHERCOTE',
      'MAX R & MERRYN HENKE', 'DOUGLAS J & ANTONIETTA M LEE', 'JA and FW Easter']) {
      expect(looksPersonal(n)).toBe(true);
    }
  });

  it('does not treat an organisation with "and" in its name as a couple', () => {
    for (const n of ['SMITH AND JONES ENGINEERING', 'HEALTH AND SAFETY',
      'ROADS AND MARITIME', 'SEARCH AND RESCUE', 'Department of Environment and Science']) {
      expect(looksPersonal(n)).toBe(false);
    }
  });

  it('does not flag organisations that merely have short bare names', () => {
    // Every one of these was flagged by an earlier, unbounded version of the
    // rule, which deleted them from every league table on the site.
    for (const name of ['SYDNEY TRAINS', 'BUREAU OF METEOROLOGY', 'MONASH HEALTH',
      'CITY OF ALBANY', 'Airservices Australia', 'Australian Antarctic Division',
      'PORTS VICTORIA', 'Geoscience Australia', 'Venues NSW']) {
      expect(looksPersonal(name)).toBe(false);
    }
  });

  it('will not flag a large holder however personal the name looks', () => {
    expect(isNaturalPerson(person({ LICENCEE: 'Hansen Yuncken' }), 400)).toBe(false);
  });

  it('will not flag a company with an ACN', () => {
    expect(isNaturalPerson(person({ ACN: '004085616' }), 1)).toBe(false);
  });
});

describe('sector classification', () => {
  it('places the hand-verified names exactly', () => {
    const expected: [string, string][] = [
      ['NBN CO LIMITED', 'TELCO'],
      ['Electricity Networks Corporation', 'UTILITIES'],
      ['ST. JOHN AMBULANCE AUSTRALIA INCORPORATED', 'GOV_PUBLIC_SAFETY'],
      ['Volunteer Marine Rescue NSW', 'VOLUNTEER_RESCUE'],
      ['CSE CROSSCOM PTY LTD', 'RADIO_DEALER'],
      ['AUSTRALIAN BROADCASTING CORPORATION', 'BROADCAST'],
      ['Pilbara Iron Company (Services) Pty Ltd', 'MINING'],
      ['SYDNEY TRAINS', 'TRANSPORT'],
      ['Department of Defence', 'GOV_DEFENCE'],
    ];
    for (const [name, cls] of expected) expect(classifyEntity(name, tierA)).toBe(cls);
  });

  it('falls through to the keyword rules for the tail', () => {
    expect(classifyEntity('Broken Hill Police Station', {})).toBe('GOV_PUBLIC_SAFETY');
    expect(classifyEntity('Yallourn Coal Pty Ltd', {})).toBe('MINING');
    expect(classifyEntity('Shire of Wyndham', {})).toBe('LOCAL_GOV');
  });

  it('keeps the keyword rules in an order that matters', () => {
    // /DEPARTMENT OF/ ahead of the mining rule would file a state mining
    // department as generic government; /POLICE/ first is what keeps
    // "Queensland Police Service" out of GOV_OTHER.
    const rules = TIER_B as [RegExp, string][];
    const police = rules.findIndex(([re]) => re.test('POLICE'));
    const dept = rules.findIndex(([re]) => re.test('DEPARTMENT OF PRIMARY INDUSTRY'));
    const mining = rules.findIndex(([, cls]) => cls === 'MINING');
    expect(police).toBeLessThan(dept);
    expect(mining).toBeLessThan(dept);
    expect(classifyEntity('DEPARTMENT OF MINES AND PETROLEUM', {})).toBe('MINING');
  });

  it('leaves what it cannot establish unclassified rather than guessing', () => {
    expect(classifyEntity('Zzyzx Nominees No 4', {})).toBe('UNCLASSIFIED');
  });

  it('only ever emits a known class id', () => {
    for (const cls of Object.values(tierA) as string[]) expect(CLASS_IDS).toContain(cls);
    for (const [, cls] of TIER_B as [RegExp, string][]) expect(CLASS_IDS).toContain(cls);
  });
});

describe('merging licensee records into organisations', () => {
  const clients = [
    { CLIENT_NO: '1', LICENCEE: 'TELSTRA LIMITED', ABN: '33051775556' },
    { CLIENT_NO: '2', LICENCEE: 'Telstra Ltd', ABN: '' },
    { CLIENT_NO: '3', LICENCEE: 'Airservices Australia', ABN: '59698720886' },
    { CLIENT_NO: '4', LICENCEE: 'AIRSERVICES AUSTRALIA (Melbourne)', ABN: '59698720886' },
    { CLIENT_NO: '5', LICENCEE: 'CSL Australia Pty Ltd', ABN: '' },
    { CLIENT_NO: '6', LICENCEE: 'CSL Limited', ABN: '' },
  ];

  it('merges on a normalised name', () => {
    const { rootOf } = mergeClients(clients);
    expect(rootOf.get('1')).toBe(rootOf.get('2'));
  });

  it('merges on a shared checksum-valid ABN even when the names differ', () => {
    const { rootOf } = mergeClients(clients);
    expect(rootOf.get('3')).toBe(rootOf.get('4'));
  });

  it('does not merge two different companies with a shared prefix', () => {
    const { rootOf } = mergeClients(clients);
    expect(rootOf.get('5')).not.toBe(rootOf.get('6'));
  });

  it('partitions the input exactly — every record in one and only one group', () => {
    const { rootOf, members } = mergeClients(clients);
    const total = [...new Set(rootOf.values())].reduce((s, r) => s + members.get(r)!.length, 0);
    expect(total).toBe(clients.length);
    expect(new Set([...members.values()].flat()).size).toBe(clients.length);
  });

  it('ignores a checksum-invalid ABN rather than merging on it', () => {
    const bad = [
      { CLIENT_NO: 'a', LICENCEE: 'One Pty Ltd', ABN: '11111111111' },
      { CLIENT_NO: 'b', LICENCEE: 'Two Pty Ltd', ABN: '11111111111' },
    ];
    const { rootOf } = mergeClients(bad);
    expect(rootOf.get('a')).not.toBe(rootOf.get('b'));
  });
});
