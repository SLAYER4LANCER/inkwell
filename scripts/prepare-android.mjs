// Runs after `npx cap add android`: copies the Inkwell launcher icons into the Android project.
import fs from 'node:fs';
import path from 'node:path';

const src = 'android-res';
const dst = 'android/app/src/main/res';

if (!fs.existsSync(dst)) {
  console.error(`Android project not found at ${dst}. Run "npx cap add android" first.`);
  process.exit(1);
}

function copy(from, to) {
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const s = path.join(from, e.name);
    const d = path.join(to, e.name);
    if (e.isDirectory()) {
      fs.mkdirSync(d, { recursive: true });
      copy(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

copy(src, dst);
console.log('Inkwell icons copied into the Android project.');
