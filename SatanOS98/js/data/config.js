// js/data/config.js
window.SATANOS_CONFIG = {
  tickMs: 250,
  gameMinutesPerTick: 0.75,   // 60 game minutes ~= 20 real seconds
  startDay: 1,
  startHour: 9,
  endHour: 17,
  daysToWin: 7,

  startingSouls: 4,
  maxInbox: 24,

  quotaStart: 8,
  quotaMax: 14,

  spawnEveryGameMinStart: 18,
  spawnEveryGameMinMin: 10,

  doom: {
    correct: -10,
    wrong: +20,
    repeatWrongBonus: +5,
    dayMissBase: +20,
    dayMissPerSoul: +2,
    dayPassBonus: -6,
    inboxPressure12: +1,
    inboxPressure18: +2,
    logoffTap: +3
  },

  save: {
    cookieName: "SATANOS98_SAVE",
    cookieDays: 30,
    autosaveSeconds: 10,
    version: 1
  },

  // SinPics pulls from here. Put files in /assets/pics/
  sinpics: [
    { file: "assets/pics/404.png", caption: "Sinner #404: Attempted to bribe God" },
    { file: "assets/pics/118.png", caption: "Sinner #118: Filed a complaint about 'too much fire'" },
    { file: "assets/pics/066.png", caption: "Sinner #066: Tried to speedrun morality" },
    { file: "assets/pics/512.png", caption: "Sinner #512: Used 'per my last email' in prayer" },
    { file: "assets/pics/999.png", caption: "Sinner #999: Claimed they 'read the terms and conditions'" }
  ]
};
