import sharp from 'sharp';
import path from 'path';

const SRC = path.join(process.cwd(), 'public', 'logo-f.svg');
const DEST_192 = path.join(process.cwd(), 'public', 'icon-192.png');
const DEST_512 = path.join(process.cwd(), 'public', 'icon-512.png');

async function processIcons() {
  try {
    await sharp(SRC)
      .resize(192, 192)
      .toFile(DEST_192);
      
    await sharp(SRC)
      .resize(512, 512)
      .toFile(DEST_512);

    console.log('Icons generated successfully from logo-f.svg.');
  } catch (err) {
    console.error('Error generating icons:', err);
  }
}

processIcons();
