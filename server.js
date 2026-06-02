import 'dotenv/config';

process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason?.message || reason);
});

import express from 'express';
import cookieParser from 'cookie-parser';
import { randomBytes } from 'crypto';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  searchSongs, getSongUrl, getLyric, getHotSongs,
  getQrKey, getQrImage, checkQr, getLoginStatus, logout,
  getUserPlaylists, getPlaylistTracks, getUserRecord,
} from './services/music.js';
import { generateDjIntro, recommendSongs, buildTasteContext } from './services/ai.js';
import { synthesize, getCachePath } from './services/tts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cookieParser());

// Session 中间件：每个浏览器分配一个 sid（30天）
app.use((req, res, next) => {
  if (!req.cookies.sid) {
    const sid = randomBytes(16).toString('hex');
    res.cookie('sid', sid, { httpOnly: true, maxAge: 30 * 24 * 3600 * 1000, sameSite: 'lax' });
    req.sid = sid;
  } else {
    req.sid = req.cookies.sid;
  }
  next();
});

app.use(express.static(path.join(__dirname, 'public')));
app.use('/cache/tts', express.static(getCachePath()));

// ============ 登录 ============
app.get('/api/login/status', async (req, res) => {
  try { res.json(await getLoginStatus(req.sid)); }
  catch (e) { res.json({ logged: false }); }
});

app.get('/api/login/qr/key', async (req, res) => {
  try {
    const key = await getQrKey();
    res.json({ key });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/login/qr/image', async (req, res) => {
  try {
    const { key } = req.query;
    const qrimg = await getQrImage(key);
    res.json({ qrimg });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/login/qr/check', async (req, res) => {
  try {
    const { key } = req.query;
    const result = await checkQr(req.sid, key);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/logout', (req, res) => {
  logout(req.sid);
  res.json({ ok: true });
});

// ============ 歌单 ============
app.get('/api/playlists/:uid', async (req, res) => {
  try {
    const list = await getUserPlaylists(req.sid, Number(req.params.uid));
    res.json({ playlists: list });
  } catch (e) {
    console.error('[playlists]', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/playlist/:id/tracks', async (req, res) => {
  try {
    const songs = await getPlaylistTracks(req.sid, Number(req.params.id));
    res.json({ songs });
  } catch (e) {
    console.error('[playlist tracks]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ============ 搜索 / 播放 / 歌词 / 热歌 ============
app.get('/api/search', async (req, res) => {
  try {
    const { keyword, limit } = req.query;
    if (!keyword) return res.status(400).json({ error: 'keyword required' });
    const songs = await searchSongs(req.sid, keyword, parseInt(limit) || 20);
    res.json({ songs });
  } catch (e) {
    console.error('[search]', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/song/:id', async (req, res) => {
  try {
    const url = await getSongUrl(req.sid, req.params.id);
    if (!url) return res.status(404).json({ error: 'no playable url (maybe VIP only)' });
    res.json({ url });
  } catch (e) {
    console.error('[song]', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/lyric/:id', async (req, res) => {
  try {
    const data = await getLyric(req.sid, req.params.id);
    res.json(data);
  } catch (e) {
    console.error('[lyric]', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/hot', async (req, res) => {
  try {
    const songs = await getHotSongs(req.sid, req.query.idx || 3, parseInt(req.query.limit) || 30);
    res.json({ songs });
  } catch (e) {
    console.error('[hot]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ============ AI ============
app.post('/api/dj-intro', async (req, res) => {
  try {
    const { name, artist, album } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const intro = await generateDjIntro({ name, artist, album });
    res.json({ intro });
  } catch (e) {
    console.error('[dj-intro]', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/recommend', async (req, res) => {
  try {
    const { prompt, userId } = req.body;
    if (!prompt) return res.status(400).json({ error: 'prompt required' });

    let tasteContext = '';
    if (userId) {
      try {
        const records = await getUserRecord(req.sid, userId, 1);
        tasteContext = buildTasteContext(records);
      } catch (_) {}
    }

    const suggestions = await recommendSongs(prompt, tasteContext);
    const results = [];
    for (const q of suggestions.slice(0, 10)) {
      try {
        const songs = await searchSongs(req.sid, q, 1);
        if (songs.length > 0) results.push(songs[0]);
      } catch (_) {}
    }
    res.json({ songs: results });
  } catch (e) {
    console.error('[recommend]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ============ TTS ============
app.post('/api/tts', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'text required' });
    const { filename, cached } = await synthesize(text);
    res.json({ url: `/cache/tts/${filename}`, cached });
  } catch (e) {
    console.error('[tts]', e?.message || e);
    res.json({ url: null, fallback: true });
  }
});

function getLocalIPs() {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) ips.push(net.address);
    }
  }
  return ips;
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🎙️  AI Radio running at http://localhost:${PORT}`);
  const ips = getLocalIPs();
  if (ips.length) {
    console.log(`   Local network: ${ips.map(ip => `http://${ip}:${PORT}`).join(' or ')}`);
  }
  console.log(`   Model: ${process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20250929'}`);
  console.log(`   TTS Voice: ${process.env.TTS_VOICE || 'zh-CN-YunxiNeural'}`);
});
