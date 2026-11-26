(() => {
  const monthNames = "january february march april may june july august september october november december".split(" ");
  const clockPattern = /^(?<hour>\d{1,2}):(?<minute>\d{2})(?::(?<second>\d{2}))?\s*(?<period>[ap]\.?m\.?)?\s*(?<zone>Z|[+-]\d{2}:?\d{2})?$/i;
  const timeTail = /(?:\s+(?:at\s+)?|T)(\d{1,2}:\d{2}.*)$/i;
  const daySeconds = 86400;

  function englishMonth(text) {
    const month = text.toLowerCase();
    return monthNames.findIndex(name => name === month || name.slice(0, 3) === month ||
      (month === "sept" && name === "september")) + 1;
  }

  function readDay(text, now, order) {
    if (!text || /^(today|yesterday)$/i.test(text)) {
      const day = new Date(now);
      day.setHours(12, 0, 0, 0);
      if (/^yesterday$/i.test(text)) day.setDate(day.getDate() - 1);
      return [day.getFullYear(), day.getMonth() + 1, day.getDate()];
    }

    const yearFirst = /^(\d{4})([-/.\s])(\d{1,2})\2(\d{1,2})$/.exec(text);
    if (yearFirst) return [+yearFirst[1], +yearFirst[3], +yearFirst[4]];

    const numeric = /^(\d{1,2})([-/.])(\d{1,2})\2(\d{4})$/.exec(text);
    if (numeric) {
      const first = +numeric[1];
      const second = +numeric[3];
      const monthFirst = second > 12 || (first <= 12 && order === "MDY");
      return [+numeric[4], monthFirst ? first : second, monthFirst ? second : first];
    }

    const monthFirst = /^([a-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/i.exec(text);
    const dayFirst = /^(\d{1,2})\s+([a-z]+)\.?,?\s+(\d{4})$/i.exec(text);
    if (!monthFirst && !dayFirst) return null;
    const month = englishMonth(monthFirst ? monthFirst[1] : dayFirst[2]);
    return [+(monthFirst ?? dayFirst)[3], month, +(monthFirst ? monthFirst[2] : dayFirst[1])];
  }

  function parse(text, now = new Date(), order = "DMY") {
    if (typeof text !== "string" || text.length > 120) return null;
    const normalized = text.replace(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, "")
      .replace(/,(?=\d{1,2}:)/g, ", ").replace(/\s+/g, " ").trim();
    let dateText = "";
    let clockText = normalized;
    const tail = timeTail.exec(normalized);
    if (tail) {
      dateText = normalized.slice(0, tail.index).replace(/[,\s]+$/, "");
      clockText = tail[1];
    }
    const clock = clockPattern.exec(clockText)?.groups;
    if (!clock) return null;
    const day = readDay(dateText, now, order);
    if (!day) return null;

    const [year, month, date] = day;
    let hour = +clock.hour;
    const minute = +clock.minute;
    const second = +(clock.second ?? 0);
    if (year < 1 || month < 1 || month > 12 || date < 1 || date > 31 || minute > 59 || second > 59) return null;
    if (clock.period) {
      if (hour < 1 || hour > 12) return null;
      hour = hour % 12 + (/^p/i.test(clock.period) ? 12 : 0);
    } else if (hour > 23) {
      return null;
    }

    const stamp = new Date(2000, 0, 1, 12);
    if (clock.zone) {
      stamp.setUTCFullYear(year, month - 1, date);
      stamp.setUTCHours(hour, minute, second, 0);
      if (stamp.getUTCMonth() !== month - 1 || stamp.getUTCDate() !== date) return null;
      if (clock.zone.toUpperCase() !== "Z") {
        const [, sign, hours, minutes] = /^([+-])(\d{2}):?(\d{2})$/.exec(clock.zone);
        if (+hours > 23 || +minutes > 59) return null;
        stamp.setTime(stamp.getTime() - (sign === "+" ? 1 : -1) * (+hours * 60 + +minutes) * 60000);
      }
    } else {
      stamp.setFullYear(year, month - 1, date);
      stamp.setHours(hour, minute, second, 0);
      if (stamp.getMonth() !== month - 1 || stamp.getDate() !== date ||
          stamp.getHours() !== hour || stamp.getMinutes() !== minute || stamp.getSeconds() !== second) return null;
    }
    return {stamp, hasSeconds: clock.second !== undefined};
  }

  const russianMonths = "января февраля марта апреля мая июня июля августа сентября октября ноября декабря".split(" ");
  const shortDate = /^(\d{1,2})([./-])(\d{1,2})\2(\d{2}|\d{4})$/;
  const yearlessEnglishDateTime = /^(\d{1,2})\s+([a-z]+)\.?,?\s+(?:at\s+)?(\d{1,2}:\d{2}.*)$/i;
  const russianDateTime = /^(\d{1,2})\s+([а-яё]+)(?:\s+(\d{4})(?:\s*г\.?)?)?\s*,?\s+(.+)$/i;
  const clockAtEnd = /(?:^|[,\s])(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[ap]\.?m\.?)?)$/i;

  function labelDate(label, now, order) {
    const match = shortDate.exec(label.trim());
    if (!match) return null;
    const [, first, , second, rawYear] = match;
    let year = Number(rawYear);
    if (rawYear.length === 2) {
      year += Math.floor(now.getFullYear() / 100) * 100;
      if (year > now.getFullYear() + 50) year -= 100;
      if (year < now.getFullYear() - 49) year += 100;
    }
    const monthFirst = +second > 12 || (+first <= 12 && order === "MDY" && match[2] !== ".");
    const month = +(monthFirst ? first : second);
    const day = +(monthFirst ? second : first);
    if (!parse(year + "-" + month + "-" + day + " 12:00", now, "DMY")) return null;
    return {year, month, day};
  }

  function parseHover(text, label = "", now = new Date(), order = "DMY") {
    if (typeof text !== "string" || text.length > 120) return null;
    const normalized = text.replace(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, "")
      .replace(/,(?=\d{1,2}:)/g, ", ").replace(/\s+/g, " ").trim();
    const expected = labelDate(label, now, order);
    const accept = result => {
      if (!result || !expected) return result;
      const {stamp} = result;
      return stamp.getFullYear() === expected.year && stamp.getMonth() + 1 === expected.month &&
        stamp.getDate() === expected.day ? result : null;
    };
    const russian = russianDateTime.exec(normalized);
    const english = yearlessEnglishDateTime.exec(normalized);
    if (russian || english) {
      const [, rawDay, name] = russian ?? english;
      const rawYear = russian?.[3];
      const clock = russian?.[4] ?? english[3];
      const day = Number(rawDay);
      const month = russian ? russianMonths.indexOf(name.toLowerCase()) + 1 : englishMonth(name);
      if (!month || (expected && (expected.day !== day || expected.month !== month))) return null;
      let year = rawYear ? +rawYear : expected?.year ?? now.getFullYear();
      if (!rawYear && !expected &&
          (month > now.getMonth() + 1 || (month === now.getMonth() + 1 && day > now.getDate()))) year--;
      return accept(parse(year + "-" + month + "-" + day + " " + clock, now, "DMY"));
    }
    const clock = clockAtEnd.exec(normalized)?.[1];
    if (clock) {
      const prefix = normalized.slice(0, normalized.length - clock.length).replace(/[,\s]+$/, "");
      const date = labelDate(prefix, now, order);
      if (date) return accept(parse(date.year + "-" + date.month + "-" + date.day + " " + clock, now, "DMY"));
      if (!prefix && expected) {
        return parse(expected.year + "-" + expected.month + "-" + expected.day + " " + clock, now, "DMY");
      }
    }
    const machineTime = normalized.replace(/(T\d{2}:\d{2}:\d{2})\.\d+(?=Z|[+-]\d{2}:?\d{2}$)/i, "$1");
    return accept(parse(machineTime, now, order));
  }

  function elapsed(stamp, now = new Date()) {
    const delta = now.getTime() - stamp.getTime();
    let seconds = Math.abs(delta) / 1000;
    seconds = delta < 0 ? Math.ceil(seconds) : Math.floor(seconds);
    const days = Math.floor(seconds / daySeconds);
    const hours = Math.floor(seconds / 3600) % 24;
    const minutes = Math.floor(seconds / 60) % 60;
    const rest = seconds % 60;
    const parts = [[days, "d"], [hours, "h"], [minutes, "m"], [rest, "s"]]
      .filter(([amount]) => amount > 0).map(([amount, unit]) => amount + unit);
    if (!parts.length) return "0s ago";
    const duration = parts.join(" ");
    return delta < 0 ? "In " + duration : duration + " ago";
  }

  function parseForSite(text, {label, now = new Date(), order = "DMY", offsetMinutes = 0} = {}) {
    const offset = offsetMinutes * 60_000;
    const explicitZone = typeof text === "string" && /(?:Z|[+-]\d{2}:?\d{2})\s*$/i.test(text);
    const wallClockNow = offset && !explicitZone ? new Date(now.getTime() - offset) : now;
    const result = label === undefined
      ? parse(text, wallClockNow, order)
      : parseHover(text, label, wallClockNow, order);
    if (result && offset && !explicitZone) result.stamp.setTime(result.stamp.getTime() + offset);
    return result;
  }

  globalThis.MessageAge = {parse, elapsed, parseHover, parseForSite, labelDate};
})();


