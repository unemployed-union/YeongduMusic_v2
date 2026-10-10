const fs = require('node:fs');
const path = require('node:path');

const rate = 16000;
const seconds = 24;
const samples = rate * seconds;
const data = Buffer.alloc(samples * 2);
const notes = [220, 261.63, 329.63, 293.66, 246.94, 329.63, 392, 261.63];
for (let i = 0; i < samples; i++) {
  const t = i / rate;
  const base = notes[Math.floor(t / 3) % notes.length];
  const fade = Math.min(1, t / 0.3, (seconds - t) / 0.5);
  const wave = Math.sin(2 * Math.PI * base * t) * 0.65 + Math.sin(2 * Math.PI * base * 1.5 * t) * 0.22 + Math.sin(2 * Math.PI * base * 2 * t) * 0.13;
  data.writeInt16LE(Math.round(wave * 6500 * Math.max(0, fade)), i * 2);
}
const header = Buffer.alloc(44);
header.write('RIFF', 0); header.writeUInt32LE(data.length + 36, 4); header.write('WAVE', 8);
header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20);
header.writeUInt16LE(1, 22); header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate * 2, 28);
header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
header.write('data', 36); header.writeUInt32LE(data.length, 40);
const output = path.join(__dirname, '..', 'assets', 'audio', 'mock-tone.wav');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, Buffer.concat([header, data]));
