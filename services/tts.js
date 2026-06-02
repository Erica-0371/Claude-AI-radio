// Edge TTS 语音合成 — 调用 Python edge-tts（走 HTTP，更稳定）
import { execFile } from 'child_process';
import { createHash } from 'crypto';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, '..', 'cache', 'tts');
const VOICE = process.env.TTS_VOICE || 'zh-CN-YunxiNeural';

function textHash(text) {
  return createHash('md5').update(text).digest('hex').slice(0, 16);
}

function runEdgeTts(text, filepath) {
  return new Promise((resolve, reject) => {
    execFile('python', [
      '-m', 'edge_tts',
      '--voice', VOICE,
      '--text', text,
      '--write-media', filepath,
    ], { timeout: 30000 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve();
    });
  });
}

export async function synthesize(text) {
  const hash = textHash(text);
  const filename = `${hash}.mp3`;
  const filepath = path.join(CACHE_DIR, filename);

  if (existsSync(filepath)) {
    return { hash, filename, filepath, cached: true };
  }

  await runEdgeTts(text, filepath);
  return { hash, filename, filepath, cached: false };
}

export function getCachePath() {
  return CACHE_DIR;
}
