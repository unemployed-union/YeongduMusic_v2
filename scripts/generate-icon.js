// Derive Expo branding assets from the supplied original, without redrawing it.
const fs = require('node:fs');
const path = require('node:path');
const { generateImageAsync, generateImageBackgroundAsync, compositeImagesAsync } = require('@expo/image-utils');

const root = path.resolve(__dirname, '..');
const original = path.join(root, 'assets/branding/app-logo.png');
const output = path.join(root, 'assets/images');
const size = 1024;
const backgroundColor = '#17132D';

async function resize(width, background = 'transparent', removeTransparency = false) {
  const { source } = await generateImageAsync({ projectRoot: root }, {
    src: original, width, height: width, resizeMode: 'contain', backgroundColor: background,
    removeTransparency,
  });
  return source;
}

async function main() {
  if (!fs.existsSync(original)) throw new Error('Missing assets/branding/app-logo.png');
  fs.mkdirSync(output, { recursive: true });
  const background = await generateImageBackgroundAsync({
    width: size, height: size, resizeMode: 'contain', backgroundColor,
  });
  const transparent = await generateImageBackgroundAsync({
    width: size, height: size, resizeMode: 'contain', backgroundColor: 'transparent',
  });
  const splash = await resize(size);
  const icon = await resize(size, backgroundColor, true);
  // Keep the cloud and note inside the Android launcher mask safe area.
  const inset = 82;
  const foreground = await compositeImagesAsync({
    background: transparent, foreground: await resize(size - inset * 2), x: inset, y: inset,
  });
  for (const [name, buffer] of [
    ['icon.png', icon], ['splash-logo.png', splash],
    ['app-icon-foreground.png', foreground], ['app-icon-background.png', background],
  ]) fs.writeFileSync(path.join(output, name), buffer);
  console.log('Generated icon, splash, and Android adaptive layers from app-logo.png (1024x1024).');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
