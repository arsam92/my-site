/* Orbital built-in levels. s = +1 attracts, s = -1 repels.
 * Layouts were found with a search that keeps only levels that have forgiving winning launches
 * (see robustness() in core.js) and are not solved by a plain straight shot. Run: node check-levels.js */
(function (root) {
  'use strict';

  var LEVELS = [
    {
      name: 'First Light',
      start: { x: 180, y: 450 }, goal: { x: 1420, y: 450, r: 36 },
      planets: [
        { x: 929, y: 740, r: 47, s: 1 }
      ]
    },
    {
      name: 'Detour',
      start: { x: 220, y: 450 }, goal: { x: 1250, y: 450, r: 40 },
      planets: [
        { x: 861, y: 559, r: 43, s: 1 }
      ]
    },
    {
      name: 'Slingshot',
      start: { x: 200, y: 780 }, goal: { x: 1420, y: 160, r: 34 },
      planets: [
        { x: 612, y: 483, r: 69, s: 1 },
        { x: 1203, y: 536, r: 63, s: 1 }
      ]
    },
    {
      name: 'Push Back',
      start: { x: 180, y: 450 }, goal: { x: 1420, y: 450, r: 34 },
      planets: [
        { x: 847, y: 434, r: 42, s: -1 },
        { x: 1092, y: 230, r: 66, s: 1 },
        { x: 948, y: 546, r: 37, s: 1 }
      ]
    },
    {
      name: 'Twin Suns',
      start: { x: 160, y: 450 }, goal: { x: 1450, y: 450, r: 34 },
      planets: [
        { x: 577, y: 260, r: 58, s: 1 },
        { x: 1029, y: 507, r: 74, s: 1 }
      ]
    },
    {
      name: 'Crossfire',
      start: { x: 160, y: 450 }, goal: { x: 1300, y: 450, r: 34 },
      planets: [
        { x: 1237, y: 261, r: 42, s: 1 },
        { x: 1198, y: 578, r: 42, s: 1 },
        { x: 801, y: 604, r: 26, s: -1 }
      ]
    },
    {
      name: 'Pocket',
      start: { x: 150, y: 450 }, goal: { x: 800, y: 450, r: 32 },
      planets: [
        { x: 763, y: 209, r: 70, s: 1 },
        { x: 678, y: 532, r: 63, s: 1 }
      ]
    },
    {
      name: 'Slalom',
      start: { x: 150, y: 450 }, goal: { x: 1450, y: 200, r: 34 },
      planets: [
        { x: 497, y: 115, r: 26, s: -1 },
        { x: 804, y: 655, r: 37, s: -1 },
        { x: 1174, y: 474, r: 54, s: 1 }
      ]
    },
    {
      name: 'Dead Center',
      start: { x: 800, y: 830 }, goal: { x: 800, y: 70, r: 34 },
      planets: [
        { x: 767, y: 420, r: 99, s: 1 },
        { x: 442, y: 412, r: 36, s: -1 },
        { x: 962, y: 539, r: 54, s: -1 }
      ]
    },
    {
      name: 'Gravity Well',
      start: { x: 150, y: 150 }, goal: { x: 1450, y: 750, r: 36 },
      planets: [
        { x: 556, y: 440, r: 82, s: 1 },
        { x: 783, y: 360, r: 39, s: -1 },
        { x: 1084, y: 767, r: 74, s: 1 }
      ]
    }
  ];

  if (typeof module !== 'undefined' && module.exports) module.exports = LEVELS;
  else root.ORBITAL_LEVELS = LEVELS;
})(typeof window !== 'undefined' ? window : globalThis);
