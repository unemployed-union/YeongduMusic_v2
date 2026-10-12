/* global __dirname */
const fs = require('node:fs');
const path = require('node:path');

function buildLetters(build) {
  if (!Number.isSafeInteger(build) || build < 1) throw new Error('Build count must be a positive integer');
  let result = '';
  for (let value = build; value > 0; value = Math.floor((value - 1) / 26)) result = String.fromCharCode(65 + (value - 1) % 26) + result;
  return result;
}
function nextBuild(previous, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const date = ['year', 'month', 'day'].map(type => parts.find(part => part.type === type).value).join('');
  if (!previous || !/^\d{8}$/.test(previous.date) || !Number.isSafeInteger(previous.build) || previous.build < 1) throw new Error('Invalid build-version.json');
  if (date < previous.date) throw new Error('Build date cannot move backwards');
  const build = date === previous.date ? previous.build + 1 : 1;
  buildLetters(build);
  return { date, build };
}
if (require.main === module) {
  const file = path.join(__dirname, '..', 'build-version.json');
  const next = nextBuild(JSON.parse(fs.readFileSync(file, 'utf8')));
  fs.writeFileSync(file, JSON.stringify(next, null, 2) + '\n');
  console.log('Build version: ' + next.date + buildLetters(next.build));
}
module.exports = { buildLetters, nextBuild };
