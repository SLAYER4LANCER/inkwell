// Runs after `npx cap add android`:
//  1. copies the Inkwell launcher icons into the Android project;
//  2. makes Inkwell show up in Android's "Open with" list for PDF, Word and PowerPoint files.
import fs from 'node:fs';
import path from 'node:path';

const src = 'android-res';
const dst = 'android/app/src/main/res';
const manifestPath = 'android/app/src/main/AndroidManifest.xml';

if (!fs.existsSync(dst) || !fs.existsSync(manifestPath)) {
  console.error('Android project not found. Run "npx cap add android" first.');
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

/* ---- "Open with" */
const MARK = '<!-- inkwell-open-with -->';
const MIMES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
];

export function openWithFilters() {
  // 1) files that arrive with their real type (Telegram, Files, Gmail, WhatsApp, ...)
  const byType = `
        ${MARK}
        <intent-filter>
            <action android:name="android.intent.action.VIEW" />
            <category android:name="android.intent.category.DEFAULT" />
            <category android:name="android.intent.category.BROWSABLE" />
            <data android:scheme="content" />
            <data android:scheme="file" />
${MIMES.map((m) => `            <data android:mimeType="${m}" />`).join('\n')}
        </intent-filter>`;
  // 2) files that arrive as "unknown type" but have the right ending in their name
  const patterns = [];
  for (const ext of ['pdf', 'docx', 'pptx']) {
    for (let dots = 0; dots < 4; dots++) patterns.push(`.*${'\\\\..*'.repeat(dots)}\\\\.${ext}`);
  }
  const byName = `
        <intent-filter>
            <action android:name="android.intent.action.VIEW" />
            <category android:name="android.intent.category.DEFAULT" />
            <category android:name="android.intent.category.BROWSABLE" />
            <data android:scheme="content" android:host="*" android:mimeType="*/*" />
            <data android:scheme="file" android:host="*" android:mimeType="*/*" />
${patterns.map((p) => `            <data android:pathPattern="${p}" />`).join('\n')}
        </intent-filter>
`;
  return byType + byName;
}

export function patchManifest(xml) {
  if (xml.includes(MARK)) return xml; // already done
  const i = xml.indexOf('</activity>');
  if (i < 0) throw new Error('No <activity> found in AndroidManifest.xml');
  return xml.slice(0, i) + openWithFilters() + '    ' + xml.slice(i);
}

fs.writeFileSync(manifestPath, patchManifest(fs.readFileSync(manifestPath, 'utf8')));
console.log('"Open with" filters added to AndroidManifest.xml.');
