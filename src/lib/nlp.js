// Smart quick-add parser.
// Recognises: dates, times, time ranges, repeats, #tags, !priority, ~list (or ^list).
import { today, addDays, addMonths, addYears, setTime, startOfDay, getDatePrefs, daysInMonth } from './date.js';

const WD = { sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, weds: 3, wednesday: 3, thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6 };
const MON = { jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11 };
const WD_RE = 'sun(?:day)?|mon(?:day)?|tue(?:s|sday)?|wed(?:s|nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?';
const MON_RE = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
const TIME_RE = '(?:(?:at|@)\\s*)?(?:(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm|a\\.m\\.|p\\.m\\.)|(\\d{1,2}):(\\d{2})|noon|midnight)';
const NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, a: 1, an: 1 };

function parseTimeMatch(m, offset = 0) {
  // m groups: [full, h, mm, ampm, H24, M24]
  const full = m[0].toLowerCase();
  if (full.includes('noon')) return [12, 0];
  if (full.includes('midnight')) return [0, 0];
  if (m[1 + offset] != null) {
    let h = Number(m[1 + offset]); const mi = Number(m[2 + offset] || 0);
    const ap = m[3 + offset].replace(/\./g, '');
    if (h > 12 || mi > 59) return null;
    if (ap === 'pm' && h < 12) h += 12;
    if (ap === 'am' && h === 12) h = 0;
    return [h, mi];
  }
  if (m[4 + offset] != null) {
    const h = Number(m[4 + offset]), mi = Number(m[5 + offset]);
    if (h > 23 || mi > 59) return null;
    return [h, mi];
  }
  return null;
}

function nextWeekday(wd, base, forceNext) {
  const cur = new Date(base).getDay();
  let diff = (wd - cur + 7) % 7;
  if (diff === 0 && forceNext) diff = 7;
  return addDays(base, diff);
}

export function parseQuickAdd(input, ctx = {}) {
  const lists = ctx.lists || [];
  const res = { title: input, tags: [], listId: null, priority: null, dueAt: null, startAt: null, allDay: true, repeat: null, spans: [] };
  if (!input) return res;
  const text = input;
  const lower = text.toLowerCase();
  const taken = new Array(text.length).fill(false);
  const spans = [];
  const claim = (start, end, type) => {
    for (let i = start; i < end; i++) if (taken[i]) return false;
    for (let i = start; i < end; i++) taken[i] = true;
    spans.push({ start, end, type });
    return true;
  };
  const scan = (re, type, fn) => {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(lower))) {
      const start = m.index + (m[0].length - m[0].trimStart().length);
      const end = m.index + m[0].length;
      if (taken.slice(start, end).some(Boolean)) continue;
      if (fn(m, start, end) !== false) claim(start, end, type);
    }
  };

  // Tags
  scan(/(^|\s)#([\p{L}\p{N}_\-/]+)/gu, 'tag', (m) => { res.tags.push(m[2]); });
  // Priority
  scan(/(^|\s)!(high|hi|h|3|medium|med|m|2|low|lo|l|1|none|0)(?=\s|$)/g, 'priority', (m) => {
    const v = m[2];
    res.priority = /^(high|hi|h|3)$/.test(v) ? 5 : /^(medium|med|m|2)$/.test(v) ? 3 : /^(low|lo|l|1)$/.test(v) ? 1 : 0;
  });
  // List: ~name or ^name, match the longest existing list name
  const listRe = /(^|\s)[~^]([^\s~^#!]+(?:\s[^\s~^#!]+)*)/g;
  let lm;
  while ((lm = listRe.exec(text))) {
    const startIdx = lm.index + lm[1].length;
    const rest = lm[2];
    const words = rest.split(' ');
    let found = null, len = 0;
    for (let n = words.length; n >= 1; n--) {
      const cand = words.slice(0, n).join(' ').toLowerCase();
      const l = lists.find((x) => x.name.toLowerCase() === cand);
      if (l) { found = l; len = cand.length; break; }
    }
    if (!found) {
      const cand = words[0].toLowerCase();
      const l = lists.find((x) => x.name.toLowerCase().startsWith(cand));
      if (l) { found = l; len = words[0].length; }
    }
    if (found) { res.listId = found.id; claim(startIdx, startIdx + 1 + len, 'list'); }
  }

  if (ctx.smart !== false) {
    const base = today();
    let date = null; let time = null; let endTime = null;
    // Repeats
    scan(new RegExp(`(^|\\s)(?:every\\s+(other\\s+)?(\\d+\\s+)?(day|days|week|weeks|month|months|year|years|weekday|weekdays|workday|workdays|weekend|weekends|(?:(?:${WD_RE})(?:\\s*(?:,|and|&)\\s*(?:${WD_RE}))*))|daily|weekly|monthly|yearly|annually|weekdays)(?=\\s|$|,)`, 'g'), 'repeat', (m) => {
      const word = (m[4] || m[0].trim()).toLowerCase();
      const interval = m[2] ? 2 : m[3] ? Number(m[3]) : 1;
      if (/^(day|days|daily)$/.test(word)) res.repeat = { freq: 'daily', interval };
      else if (/^(week|weeks|weekly)$/.test(word)) res.repeat = { freq: 'weekly', interval };
      else if (/^(month|months|monthly)$/.test(word)) res.repeat = { freq: 'monthly', interval };
      else if (/^(year|years|yearly|annually)$/.test(word)) res.repeat = { freq: 'yearly', interval };
      else if (/^(weekday|weekdays|workday|workdays)$/.test(word)) res.repeat = { freq: 'weekly', interval: 1, byWeekday: [1, 2, 3, 4, 5] };
      else if (/^(weekend|weekends)$/.test(word)) res.repeat = { freq: 'weekly', interval: 1, byWeekday: [6, 0] };
      else {
        const days = [...word.matchAll(new RegExp(WD_RE, 'g'))].map((x) => WD[x[0]]).filter((x) => x != null);
        if (!days.length) return false;
        res.repeat = { freq: 'weekly', interval, byWeekday: [...new Set(days)] };
        if (!date) date = nextWeekday(days[0], base, false);
      }
    });
    // Time range "3pm-5pm", "from 3 pm to 5 pm", "15:00-16:30"
    const T = '(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)?';
    scan(new RegExp(`(^|\\s)(?:from\\s+)?${T}\\s*(?:-|–|to|until)\\s*${T}(?=\\s|$|,)`, 'g'), 'date', (m) => {
      let h1 = Number(m[2]), m1 = Number(m[3] || 0), ap1 = m[4];
      let h2 = Number(m[5]), m2 = Number(m[6] || 0), ap2 = m[7];
      if (!ap1 && !ap2 && !m[3] && !m[6]) return false; // "3-5" alone is too ambiguous
      if (!ap1 && ap2) ap1 = (h1 <= h2 || h1 === 12) ? ap2 : (ap2 === 'pm' ? 'am' : 'pm');
      const conv = (h, ap) => { if (ap === 'pm' && h < 12) return h + 12; if (ap === 'am' && h === 12) return 0; return h; };
      h1 = conv(h1, ap1); h2 = conv(h2, ap2);
      if (h1 > 23 || h2 > 23 || m1 > 59 || m2 > 59) return false;
      time = [h1, m1]; endTime = [h2, m2];
    });
    // Relative / named days
    scan(/(^|\s)(?:on\s+)?(today|tonight|tomorrow|tmrw|tmr|day after tomorrow|next week|next month|next year|this weekend|weekend|end of (?:the )?month|eom)(?=\s|$|,)/g, 'date', (m) => {
      const w = m[2];
      if (w === 'today') date = base;
      else if (w === 'tonight') { date = base; if (!time) time = [20, 0]; }
      else if (/^(tomorrow|tmrw|tmr)$/.test(w)) date = addDays(base, 1);
      else if (w === 'day after tomorrow') date = addDays(base, 2);
      else if (w === 'next week') date = nextWeekday(getDatePrefs().weekStart, base, true);
      else if (w === 'next month') date = addMonths(base, 1);
      else if (w === 'next year') date = addYears(base, 1);
      else if (w === 'this weekend' || w === 'weekend') date = nextWeekday(6, base, false);
      else { const d = new Date(base); date = new Date(d.getFullYear(), d.getMonth(), daysInMonth(d.getFullYear(), d.getMonth())).getTime(); }
    });
    // in N days/weeks/months, N days later
    scan(/(^|\s)(?:in\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|a|an)\s+(minutes?|mins?|hours?|hrs?|days?|weeks?|months?|years?)|(\d+)\s+(days?|weeks?|months?)\s+later)(?=\s|$|,)/g, 'date', (m) => {
      const n = m[2] ? (NUM[m[2]] || Number(m[2])) : Number(m[4]);
      const unit = m[3] || m[5];
      if (/^min/.test(unit) || /^h/.test(unit)) {
        const t = Date.now() + n * (/^min/.test(unit) ? 60000 : 3600000);
        date = startOfDay(t); const d = new Date(t); time = [d.getHours(), d.getMinutes()];
      } else if (/^day/.test(unit)) date = addDays(base, n);
      else if (/^week/.test(unit)) date = addDays(base, n * 7);
      else if (/^month/.test(unit)) date = addMonths(base, n);
      else date = addYears(base, n);
    });
    // next monday / this friday / on friday / friday
    scan(new RegExp(`(^|\\s)(?:(next|this|on|coming)\\s+)?(${WD_RE})(?=\\s|$|,)`, 'g'), 'date', (m) => {
      if (date) return false;
      if (!m[2] && m[3].length < 6) return false; // bare abbreviations ("sun", "sat") are too ambiguous
      date = nextWeekday(WD[m[3]], base, m[2] === 'next');
    });
    // Month name dates: "oct 27", "27 oct", "october 27th 2026", "27th of october"
    scan(new RegExp(`(^|\\s)(?:on\\s+)?(?:(${MON_RE})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?|(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MON_RE})\\.?(?:,?\\s+(\\d{4}))?)(?=\\s|$|,)`, 'g'), 'date', (m) => {
      const mon = MON[(m[2] || m[6]).toLowerCase()];
      const day = Number(m[3] || m[5]);
      let year = Number(m[4] || m[7]) || new Date(base).getFullYear();
      if (day < 1 || day > 31) return false;
      let d = new Date(year, mon, day).getTime();
      if (!(m[4] || m[7]) && d < base) d = new Date(year + 1, mon, day).getTime();
      date = d;
    });
    // Numeric: 2026-10-27, 27/10, 27/10/2026 (order from settings)
    scan(/(^|\s)(?:on\s+)?(?:(\d{4})-(\d{1,2})-(\d{1,2})|(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?)(?=\s|$|,)/g, 'date', (m) => {
      let y, mo, d;
      if (m[2]) { y = Number(m[2]); mo = Number(m[3]) - 1; d = Number(m[4]); }
      else {
        const a = Number(m[5]), b = Number(m[6]);
        if (getDatePrefs().dateOrder === 'mdy') { mo = a - 1; d = b; } else { d = a; mo = b - 1; }
        y = m[7] ? Number(m[7].length === 2 ? '20' + m[7] : m[7]) : new Date(base).getFullYear();
        if (!m[7] && new Date(y, mo, d).getTime() < base) y++;
      }
      if (mo < 0 || mo > 11 || d < 1 || d > 31) return false;
      date = new Date(y, mo, d).getTime();
    });
    // Times
    scan(new RegExp(`(^|\\s)${TIME_RE}(?=\\s|$|,)`, 'g'), 'date', (m) => {
      if (time) return false;
      const t = parseTimeMatch(m, 1);
      if (!t) return false;
      time = t;
    });
    scan(/(^|\s)(?:in the\s+|this\s+)?(morning|afternoon|evening|night)(?=\s|$|,)/g, 'date', (m) => {
      if (time) return false;
      time = { morning: [9, 0], afternoon: [13, 0], evening: [19, 0], night: [20, 0] }[m[2]];
    });

    if (time && !date) {
      date = base;
      if (setTime(base, time[0], time[1]) < Date.now() && !res.repeat) date = addDays(base, 1);
    }
    if (res.repeat && !date) date = base;
    if (date != null) {
      if (time) {
        res.allDay = false;
        if (endTime) {
          res.startAt = setTime(date, time[0], time[1]);
          let end = setTime(date, endTime[0], endTime[1]);
          if (end <= res.startAt) end = addDays(end, 1);
          res.dueAt = end;
        } else res.dueAt = setTime(date, time[0], time[1]);
      } else res.dueAt = startOfDay(date);
    }
  }

  spans.sort((a, b) => a.start - b.start);
  res.spans = spans;
  // Remove claimed text (tags/priority/list always; dates unless keepText)
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const sp = spans.find((s) => i >= s.start && i < s.end);
    if (!sp || (ctx.keepText && sp.type !== 'tag' && sp.type !== 'priority' && sp.type !== 'list')) out += text[i];
  }
  res.title = out.replace(/\s+/g, ' ').replace(/\s+([,.;])/g, '$1').trim();
  return res;
}
