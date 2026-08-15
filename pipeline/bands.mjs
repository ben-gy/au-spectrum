// SPDX-FileCopyrightText: 2026 Ben Richardson <https://benrichardson.dev>
// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on au-spectrum by Ben Richardson — https://benrichardson.dev

/**
 * Australia's radio spectrum, cut into the bands people actually name.
 *
 * Ranges are half-open [lo, hi) in Hz and must not overlap; the test suite
 * asserts both, because an overlap silently double-counts device rows into two
 * bands and every share on the site drifts without anything failing.
 *
 * The set is the ACMA's band plan as it is used in practice, not a
 * regulatory allocation table: the point of the view is "who holds this", so
 * the boundaries follow the licensing populations (400–430 government land
 * mobile is a different world from 450–520 land mobile and CB, and merging them
 * hides the site's second headline).
 */
export const BANDS = [
  { lo: 0, hi: 526.5e3, name: 'VLF / LF', use: 'Very low and low frequency — long-range navigation, submarine and utility telemetry.' },
  { lo: 526.5e3, hi: 1606.5e3, name: 'AM broadcast', use: 'The AM radio band, 526.5–1606.5 kHz.' },
  { lo: 1606.5e3, hi: 3e6, name: 'MF 1.6–3 MHz', use: 'Medium frequency — maritime and outback HF-adjacent working.' },
  { lo: 3e6, hi: 30e6, name: 'HF 3–30 MHz', use: 'Shortwave. Skywave propagation over hundreds or thousands of kilometres, with no infrastructure in between.' },
  { lo: 30e6, hi: 70e6, name: 'VHF low 30–70 MHz', use: 'Low-band VHF — legacy defence and utility land mobile.' },
  { lo: 70e6, hi: 87.5e6, name: 'VHF 70–87.5 MHz', use: 'Legacy fire and emergency-service land mobile.' },
  { lo: 87.5e6, hi: 108e6, name: 'FM broadcast', use: 'The FM radio band, 87.5–108 MHz.' },
  { lo: 108e6, hi: 137e6, name: 'Aeronautical VHF', use: 'Air traffic control voice, 108–137 MHz.' },
  { lo: 137e6, hi: 174e6, name: 'VHF high 137–174 MHz', use: 'The busiest analogue land-mobile band: fire, ambulance, marine, taxis, utilities.' },
  { lo: 174e6, hi: 230e6, name: 'VHF TV / DAB', use: 'Television band III and digital radio.' },
  { lo: 230e6, hi: 400e6, name: 'UHF 230–400 MHz', use: 'Government and defence systems.' },
  { lo: 400e6, hi: 430e6, name: 'UHF 400–430 MHz', use: 'Government land mobile — the state radio networks police, fire and ambulance run on.' },
  { lo: 430e6, hi: 450e6, name: 'Amateur 70 cm', use: 'The 70-centimetre amateur band, mostly repeaters and beacons.' },
  { lo: 450e6, hi: 520e6, name: 'UHF 450–520 MHz', use: 'Business land mobile and UHF CB. Australia’s most widely-shared band.' },
  { lo: 520e6, hi: 694e6, name: 'UHF TV', use: 'Digital television, 520–694 MHz.' },
  { lo: 694e6, hi: 803e6, name: '700 MHz', use: 'The digital-dividend mobile band, auctioned in 2013 and 2017.' },
  { lo: 803e6, hi: 890e6, name: '800/850 MHz', use: 'Long-reach cellular and legacy trunked radio.' },
  { lo: 890e6, hi: 960e6, name: '900 MHz', use: 'Cellular and short-range devices.' },
  { lo: 960e6, hi: 1.35e9, name: 'Aeronautical navigation', use: 'DME, radar beacons and air navigation aids.' },
  { lo: 1.35e9, hi: 1.525e9, name: '1.4 GHz', use: 'Fixed links and radio astronomy.' },
  { lo: 1.525e9, hi: 1.71e9, name: 'L-band satellite', use: 'Inmarsat and mobile satellite services.' },
  { lo: 1.71e9, hi: 1.88e9, name: '1800 MHz', use: 'The workhorse 4G band.' },
  { lo: 1.88e9, hi: 2.025e9, name: '2 GHz lower', use: '3G/4G uplink, plus fixed studio-to-transmitter links.' },
  { lo: 2.025e9, hi: 2.11e9, name: '2.05 GHz', use: 'Outside-broadcast and fixed links.' },
  { lo: 2.11e9, hi: 2.2e9, name: '2 GHz upper', use: 'The downlink half of the 2 GHz mobile pair — tower to handset.' },
  { lo: 2.2e9, hi: 2.3e9, name: '2.2 GHz', use: 'Fixed links and telemetry.' },
  { lo: 2.3e9, hi: 2.4e9, name: '2.3 GHz', use: 'Fixed wireless broadband. Three licensees in the whole country.' },
  { lo: 2.4e9, hi: 2.5e9, name: '2.4 GHz ISM', use: 'Wi-Fi and Bluetooth run here under a class licence and appear nowhere in this register.' },
  { lo: 2.5e9, hi: 2.69e9, name: '2.6 GHz', use: 'Mobile broadband capacity band.' },
  { lo: 2.69e9, hi: 3.4e9, name: 'Radar 2.7–3.4 GHz', use: 'Weather, air-traffic and defence radar.' },
  { lo: 3.4e9, hi: 3.7e9, name: '3.5 GHz', use: 'The mid-band 5G workhorse, auctioned in 2018 and 2021.' },
  { lo: 3.7e9, hi: 4.2e9, name: 'C-band 3.7–4.2 GHz', use: 'Satellite downlink, and since 2022 mobile.' },
  { lo: 4.2e9, hi: 5.925e9, name: '4.2–5.9 GHz', use: 'Radio altimeters, fixed links and outside broadcast.' },
  { lo: 5.925e9, hi: 7.125e9, name: '6 GHz', use: 'Long-haul microwave backhaul.' },
  { lo: 7.125e9, hi: 8.5e9, name: '7/8 GHz', use: 'Microwave backhaul — the band that carries the phone network between towers.' },
  { lo: 8.5e9, hi: 10.7e9, name: 'X-band 8.5–10.7 GHz', use: 'Police radar, marine radar and defence.' },
  { lo: 10.7e9, hi: 11.7e9, name: '11 GHz', use: 'Microwave backhaul. The single busiest fixed-link band.' },
  { lo: 11.7e9, hi: 13.25e9, name: '12/13 GHz', use: 'Satellite downlink and fixed links.' },
  { lo: 13.25e9, hi: 15.35e9, name: '15 GHz', use: 'Shorter-hop microwave links.' },
  { lo: 15.35e9, hi: 17.7e9, name: '17 GHz', use: 'Fixed links, radar and satellite feeder links.' },
  { lo: 17.7e9, hi: 19.7e9, name: '18 GHz', use: 'Dense urban microwave backhaul.' },
  { lo: 19.7e9, hi: 21.2e9, name: '20 GHz', use: 'Satellite downlink, including the low-earth-orbit constellations.' },
  { lo: 21.2e9, hi: 23.6e9, name: '23 GHz', use: 'Short-hop urban backhaul.' },
  { lo: 23.6e9, hi: 24.25e9, name: '24 GHz', use: 'Passive services and short links.' },
  { lo: 24.25e9, hi: 27.5e9, name: '26 GHz', use: 'Millimetre-wave 5G, auctioned in 2021.' },
  { lo: 27.5e9, hi: 31e9, name: '28/30 GHz', use: 'Satellite uplink — the low-earth-orbit constellations live here.' },
  { lo: 31e9, hi: 33.4e9, name: '32 GHz', use: 'Fixed links and deep-space research.' },
  { lo: 33.4e9, hi: 37e9, name: '33–37 GHz', use: 'Speed radar. Almost entirely state police.' },
  { lo: 37e9, hi: 40.5e9, name: '38 GHz', use: 'Very short-hop fixed links.' },
  { lo: 40.5e9, hi: 1e12, name: 'Above 40 GHz', use: 'Millimetre wave — last-mile fixed wireless and research links.' },
  { lo: 1e12, hi: Infinity, name: 'Outside the radio spectrum', use: 'Six device rows sit above 1 THz — optical satellite-laser-ranging links. They are light, not radio, and are excluded from every frequency axis.' },
];

/** @returns the index of the band containing f (Hz), or -1 for no frequency. */
export function bandOf(f) {
  if (!Number.isFinite(f) || f <= 0) return -1;
  // Linear scan: 51 bands, called once per device row. A binary search here
  // would save nothing measurable and would be one more thing to get wrong.
  for (let i = 0; i < BANDS.length; i++) if (f >= BANDS[i].lo && f < BANDS[i].hi) return i;
  return -1;
}

/**
 * Constant-ratio bins for the frequency spine: 24 per decade, so a bin is the
 * same width in pixels at any point on a log axis. Equal-Hz bins would put
 * 99.7% of the register in one bar.
 */
export const BINS_PER_DECADE = 24;
export const BIN_MIN_HZ = 1e4; // 10 kHz — below the register's 16.975 kHz floor
export const BIN_MAX_HZ = 3e11; // 300 GHz — the top of the radio spectrum

export function binOf(f) {
  if (!Number.isFinite(f) || f < BIN_MIN_HZ || f >= BIN_MAX_HZ) return -1;
  return Math.floor(Math.log10(f / BIN_MIN_HZ) * BINS_PER_DECADE);
}

export const BIN_COUNT = Math.ceil(Math.log10(BIN_MAX_HZ / BIN_MIN_HZ) * BINS_PER_DECADE);
