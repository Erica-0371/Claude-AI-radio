// 网易云音乐封装 — session 化版本（多用户隔离）
import pkg from 'NeteaseCloudMusicApi';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const {
  search, song_url_v1, lyric, top_list, playlist_track_all,
  login_qr_key, login_qr_create, login_qr_check, login_status,
  user_playlist, user_record,
} = pkg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SESSION_DIR = path.join(__dirname, '..', 'cache', 'sessions');
if (!existsSync(SESSION_DIR)) mkdirSync(SESSION_DIR, { recursive: true });

// ============ Session-cookie 管理 ============
const sessionCookies = new Map(); // sessionId -> netease cookie

function sessionFile(sessionId) {
  return path.join(SESSION_DIR, `${sessionId}.txt`);
}

export function loadSessionCookie(sessionId) {
  if (sessionCookies.has(sessionId)) return sessionCookies.get(sessionId);
  const f = sessionFile(sessionId);
  if (existsSync(f)) {
    const c = readFileSync(f, 'utf8').trim();
    sessionCookies.set(sessionId, c);
    return c;
  }
  return '';
}

export function saveSessionCookie(sessionId, cookie) {
  sessionCookies.set(sessionId, cookie || '');
  writeFileSync(sessionFile(sessionId), cookie || '', 'utf8');
}

export function clearSession(sessionId) {
  saveSessionCookie(sessionId, '');
}

function withAuth(sessionId, opts = {}) {
  const cookie = loadSessionCookie(sessionId);
  return cookie ? { ...opts, cookie } : opts;
}

// ============ 登录 ============
export async function getQrKey() {
  const res = await login_qr_key({ timestamp: Date.now() });
  return res.body?.data?.unikey;
}

export async function getQrImage(key) {
  const res = await login_qr_create({ key, qrimg: true, timestamp: Date.now() });
  return res.body?.data?.qrimg;
}

export async function checkQr(sessionId, key) {
  const res = await login_qr_check({ key, timestamp: Date.now() });
  const code = res.body?.code;
  if (code === 803) {
    saveSessionCookie(sessionId, res.body?.cookie || '');
  }
  return { code, message: res.body?.message };
}

export async function getLoginStatus(sessionId) {
  const cookie = loadSessionCookie(sessionId);
  if (!cookie) return { logged: false };
  try {
    const res = await login_status(withAuth(sessionId, { timestamp: Date.now() }));
    const profile = res.body?.data?.profile;
    if (profile?.userId) {
      return { logged: true, userId: profile.userId, nickname: profile.nickname, avatar: profile.avatarUrl };
    }
  } catch (_) {}
  return { logged: false };
}

export function logout(sessionId) {
  clearSession(sessionId);
}

// ============ 用户歌单 ============
export async function getUserPlaylists(sessionId, uid) {
  const res = await user_playlist(withAuth(sessionId, { uid, limit: 200, timestamp: Date.now() }));
  const list = res.body?.playlist || [];
  return list.map(p => ({
    id: p.id,
    name: p.name,
    cover: p.coverImgUrl ? p.coverImgUrl + '?param=300y300' : null,
    count: p.trackCount,
    creator: p.creator?.nickname,
    isMine: p.userId === uid && p.creator?.userId === uid,
    subscribed: p.subscribed,
  }));
}

export async function getPlaylistTracks(sessionId, id, limit = 500) {
  const res = await playlist_track_all(withAuth(sessionId, { id, limit, offset: 0, timestamp: Date.now() }));
  const songs = res.body?.songs || [];
  return songs.map(s => ({
    id: s.id,
    name: s.name,
    artist: s.ar?.map(a => a.name).join(' / ') || '未知',
    album: s.al?.name || '',
    cover: s.al?.picUrl ? s.al.picUrl + '?param=300y300' : null,
    duration: s.dt,
  }));
}

// ============ 听歌记录 ============
export async function getUserRecord(sessionId, uid, type = 1) {
  const res = await user_record(withAuth(sessionId, { uid, type, timestamp: Date.now() }));
  const list = type === 1 ? res.body?.weekData : res.body?.allData;
  if (!list) return [];
  return list.map(item => ({
    playCount: item.playCount,
    score: item.score,
    name: item.song?.name,
    artist: item.song?.ar?.map(a => a.name).join(' / ') || '',
    album: item.song?.al?.name || '',
    id: item.song?.id,
  }));
}

// ============ 搜索 / 播放 / 歌词 ============
export async function searchSongs(sessionId, keyword, limit = 20) {
  const res = await search(withAuth(sessionId, { keywords: keyword, limit, timestamp: Date.now() }));
  const songs = res.body?.result?.songs || [];
  return songs.map(s => ({
    id: s.id,
    name: s.name,
    artist: s.artists?.map(a => a.name).join(' / ') || '未知',
    album: s.album?.name || '',
    albumId: s.album?.id,
    duration: s.duration,
    cover: s.album?.picUrl ? s.album.picUrl + '?param=300y300' : null,
  }));
}

export async function getSongUrl(sessionId, id) {
  const res = await song_url_v1(withAuth(sessionId, { id, level: 'standard', timestamp: Date.now() }));
  const data = res.body?.data?.[0];
  if (!data?.url) {
    console.log(`[song] id=${id} no url, fee=${data?.fee}, code=${data?.code}`);
    return null;
  }
  return data.url;
}

export async function getLyric(sessionId, id) {
  const res = await lyric(withAuth(sessionId, { id, timestamp: Date.now() }));
  return {
    lrc: res.body?.lrc?.lyric || '',
    tlyric: res.body?.tlyric?.lyric || '',
  };
}

export async function getHotSongs(sessionId, idx = 3, limit = 30) {
  const top = await top_list(withAuth(sessionId, { idx, timestamp: Date.now() }));
  const playlistId = top.body?.playlist?.id;
  if (!playlistId) return [];
  const res = await playlist_track_all(withAuth(sessionId, { id: playlistId, limit, offset: 0, timestamp: Date.now() }));
  const songs = res.body?.songs || [];
  return songs.slice(0, limit).map(s => ({
    id: s.id,
    name: s.name,
    artist: s.ar?.map(a => a.name).join(' / ') || '未知',
    album: s.al?.name || '',
    cover: s.al?.picUrl ? s.al.picUrl + '?param=300y300' : null,
    duration: s.dt,
  }));
}
