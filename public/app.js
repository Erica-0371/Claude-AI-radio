// AI Radio 前端逻辑
const $ = (id) => document.getElementById(id);
const audio = $('audioPlayer');
const dj = $('djPlayer');

// 状态
let queue = [];
let currentIdx = -1;
let lyrics = [];
let isPlayingDj = false;
let loginUser = null; // { userId, nickname, avatar }

// ============ Tab 切换 ============
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    $(`pane-${tab.dataset.tab}`).classList.add('active');
  });
});

// ============ 工具函数 ============
function setStatus(text) { $('status').textContent = text; }
function fmtTime(sec) {
  if (!isFinite(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function renderSongList(ulId, songs, mode = 'add') {
  const ul = $(ulId);
  ul.innerHTML = '';
  if (!songs.length) {
    ul.innerHTML = '<div class="loading">空空如也</div>';
    return;
  }
  songs.forEach((song, idx) => {
    const li = document.createElement('li');
    if (ulId === 'queueList' && idx === currentIdx) li.classList.add('playing');
    li.innerHTML = `
      <img src="${song.cover || ''}" onerror="this.style.visibility='hidden'" />
      <div class="song-info">
        <div class="song-info-name">${escapeHtml(song.name)}</div>
        <div class="song-info-artist">${escapeHtml(song.artist)}</div>
      </div>
      <div class="song-actions">
        ${mode === 'add' ? '<button title="加入队列">+</button>' : '<button title="移除">&times;</button>'}
      </div>
    `;
    li.querySelector('.song-actions button').addEventListener('click', (e) => {
      e.stopPropagation();
      if (mode === 'add') addToQueue(song);
      else removeFromQueue(idx);
    });
    li.addEventListener('click', () => {
      if (ulId === 'queueList') playAt(idx);
      else addToQueue(song, true);
    });
    ul.appendChild(li);
  });
}

// ============ 登录 ============
async function checkLoginStatus() {
  try {
    const data = await fetch('/api/login/status').then(r => r.json());
    if (data.logged) {
      loginUser = data;
      showLoggedIn();
    }
  } catch (_) {}
}

function showLoggedIn() {
  $('userArea').innerHTML = `
    <div class="user-info">
      <img src="${loginUser.avatar}?param=60y60" onerror="this.style.display='none'" />
      <span class="nickname">${escapeHtml(loginUser.nickname)}</span>
    </div>
    <button id="logoutBtn" class="btn-secondary" style="font-size:11px;padding:4px 10px">退出</button>
  `;
  $('logoutBtn').addEventListener('click', async () => {
    await fetch('/api/logout', { method: 'POST' });
    loginUser = null;
    $('userArea').innerHTML = '<button id="loginBtn" class="btn-secondary">登录网易云</button>';
    $('loginBtn').addEventListener('click', startLogin);
    $('mylistHeader').innerHTML = '<div class="loading">请先登录网易云账号</div>';
    $('playlistList').innerHTML = '';
    $('playlistTracks').style.display = 'none';
  });
  loadMyPlaylists();
}

async function startLogin() {
  $('loginModal').style.display = '';
  $('qrWrap').innerHTML = '<div class="loading">生成二维码中...</div>';
  $('qrStatus').textContent = '等待扫描...';
  $('qrStatus').className = 'qr-status';

  try {
    const { key } = await fetch('/api/login/qr/key').then(r => r.json());
    const { qrimg } = await fetch(`/api/login/qr/image?key=${key}`).then(r => r.json());
    $('qrWrap').innerHTML = `<img src="${qrimg}" />`;

    // 轮询检查扫码状态
    const poll = setInterval(async () => {
      try {
        const res = await fetch(`/api/login/qr/check?key=${key}`).then(r => r.json());
        if (res.code === 802) {
          $('qrStatus').textContent = '已扫码，请在手机确认...';
        } else if (res.code === 803) {
          clearInterval(poll);
          $('qrStatus').textContent = '登录成功!';
          $('qrStatus').className = 'qr-status success';
          setTimeout(() => {
            $('loginModal').style.display = 'none';
            checkLoginStatus();
          }, 800);
        } else if (res.code === 800) {
          clearInterval(poll);
          $('qrStatus').textContent = '二维码过期，请重新扫码';
        }
      } catch (_) {}
    }, 2000);

    // 记住 poll ID 给取消按钮用
    $('loginCancel').onclick = () => {
      clearInterval(poll);
      $('loginModal').style.display = 'none';
    };
  } catch (e) {
    $('qrWrap').innerHTML = '<div class="loading">生成失败，请重试</div>';
  }
}

$('loginBtn')?.addEventListener('click', startLogin);
$('loginCancel')?.addEventListener('click', () => { $('loginModal').style.display = 'none'; });

// ============ 歌单 ============
async function loadMyPlaylists() {
  if (!loginUser?.userId) return;
  $('playlistList').innerHTML = '<div class="loading">加载歌单中...</div>';
  $('playlistTracks').style.display = 'none';
  $('mylistHeader').innerHTML = '<div class="mylist-title">我的歌单</div>';

  try {
    const { playlists } = await fetch(`/api/playlists/${loginUser.userId}`).then(r => r.json());
    const ul = $('playlistList');
    ul.innerHTML = '';
    if (!playlists?.length) {
      ul.innerHTML = '<div class="loading">没有歌单</div>';
      return;
    }
    playlists.forEach(pl => {
      const li = document.createElement('li');
      li.innerHTML = `
        <img src="${pl.cover || ''}" onerror="this.style.visibility='hidden'" />
        <div class="playlist-info">
          <div class="playlist-name">${escapeHtml(pl.name)}</div>
          <div class="playlist-meta">${pl.count} 首${pl.subscribed ? ' · 收藏' : ''}</div>
        </div>
      `;
      li.addEventListener('click', () => openPlaylist(pl));
      ul.appendChild(li);
    });
  } catch (e) {
    $('playlistList').innerHTML = '<div class="loading">加载失败</div>';
  }
}

async function openPlaylist(pl) {
  $('playlistList').style.display = 'none';
  $('playlistTracks').style.display = '';
  $('playlistTracks').innerHTML = '<div class="loading">加载歌曲中...</div>';
  $('mylistHeader').innerHTML = `
    <button class="mylist-back" style="display:inline" onclick="backToPlaylists()">← 返回</button>
    <span class="mylist-title">${escapeHtml(pl.name)}</span>
    <button class="mylist-play-all" style="display:inline" id="playAllBtn">全部播放</button>
  `;

  try {
    const { songs } = await fetch(`/api/playlist/${pl.id}/tracks`).then(r => r.json());
    renderSongList('playlistTracks', songs || [], 'add');
    $('playAllBtn').onclick = () => {
      queue = [...(songs || [])];
      currentIdx = -1;
      renderSongList('queueList', queue, 'remove');
      playAt(0);
      // 切到队列 tab
      document.querySelector('[data-tab="queue"]').click();
    };
  } catch (e) {
    $('playlistTracks').innerHTML = '<div class="loading">加载失败</div>';
  }
}

// 全局函数给 onclick 调用
window.backToPlaylists = function () {
  $('playlistList').style.display = '';
  $('playlistTracks').style.display = 'none';
  $('mylistHeader').innerHTML = '<div class="mylist-title">我的歌单</div>';
};

// ============ 队列操作 ============
function addToQueue(song, autoPlay = false) {
  if (queue.some(s => s.id === song.id)) {
    setStatus(`《${song.name}》已在队列中`);
    return;
  }
  queue.push(song);
  renderSongList('queueList', queue, 'remove');
  setStatus(`已添加《${song.name}》到队列`);
  if (autoPlay && currentIdx === -1) {
    playAt(queue.length - 1);
  } else if (currentIdx === -1 && queue.length === 1) {
    playAt(0);
  }
}

function removeFromQueue(idx) {
  queue.splice(idx, 1);
  if (idx < currentIdx) currentIdx--;
  else if (idx === currentIdx) {
    audio.pause();
    currentIdx = -1;
    resetNowPlaying();
  }
  renderSongList('queueList', queue, 'remove');
}

$('clearQueueBtn').addEventListener('click', () => {
  audio.pause();
  dj.pause();
  queue = [];
  currentIdx = -1;
  resetNowPlaying();
  renderSongList('queueList', queue, 'remove');
});

// ============ 播放核心 ============
async function playAt(idx) {
  if (idx < 0 || idx >= queue.length) return;
  currentIdx = idx;
  const song = queue[idx];
  renderSongList('queueList', queue, 'remove');

  $('songName').textContent = song.name;
  $('songArtist').textContent = song.artist;
  if (song.cover) {
    $('cover').src = song.cover;
    $('cover').classList.add('show');
  } else {
    $('cover').classList.remove('show');
  }
  $('djText').textContent = '小克正在准备介绍这首歌...';
  $('lyricBox').querySelector('.lyric-cur').textContent = '—';
  lyrics = [];
  setStatus(`准备播放：${song.name}`);

  let djText = '', songUrl = null, lyricData = null;
  try {
    const [djRes, urlRes, lyricRes] = await Promise.allSettled([
      fetch('/api/dj-intro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: song.name, artist: song.artist, album: song.album }),
      }).then(r => r.json()),
      fetch(`/api/song/${song.id}`).then(r => r.json()),
      fetch(`/api/lyric/${song.id}`).then(r => r.json()),
    ]);
    if (djRes.status === 'fulfilled') djText = djRes.value.intro || '';
    if (urlRes.status === 'fulfilled') songUrl = urlRes.value.url || null;
    if (lyricRes.status === 'fulfilled') lyricData = lyricRes.value;
  } catch (e) { console.error(e); }

  if (!songUrl) {
    setStatus(`《${song.name}》无法播放（可能是 VIP 歌曲），跳过`);
    nextTrack();
    return;
  }

  if (lyricData?.lrc) lyrics = parseLrc(lyricData.lrc);

  if (djText) {
    $('djText').textContent = djText;
    try {
      const ttsRes = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: djText }),
      }).then(r => r.json());
      if (ttsRes.url) {
        await playDj(ttsRes.url);
      } else {
        // Edge TTS 不可用，用浏览器 Web Speech API 兜底
        await speakBrowser(djText);
      }
    } catch (e) {
      console.error('[tts]', e);
      await speakBrowser(djText);
    }
  } else {
    $('djText').textContent = '（这首歌就让音乐自己说吧）';
  }

  audio.src = songUrl;
  audio.play();
  $('playBtn').textContent = '⏸';
  setStatus(`正在播放：${song.name}`);
}

// 浏览器 Web Speech API 兜底
function speakBrowser(text) {
  return new Promise(resolve => {
    if (!window.speechSynthesis) { resolve(); return; }
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'zh-CN';
    utter.rate = 0.95;
    utter.pitch = 1.0;
    // 尝试挑一个中文声音
    const voices = speechSynthesis.getVoices();
    const zhVoice = voices.find(v => v.lang.startsWith('zh')) || voices[0];
    if (zhVoice) utter.voice = zhVoice;
    setStatus('小克正在介绍...');
    utter.onend = resolve;
    utter.onerror = resolve;
    speechSynthesis.speak(utter);
  });
}

function playDj(url) {
  return new Promise(resolve => {
    isPlayingDj = true;
    setStatus('小克正在介绍...');
    dj.src = url;
    dj.play();
    dj.onended = () => { isPlayingDj = false; resolve(); };
    dj.onerror = () => { isPlayingDj = false; resolve(); };
  });
}

function nextTrack() {
  if (currentIdx + 1 < queue.length) playAt(currentIdx + 1);
  else { setStatus('队列播放完毕'); $('playBtn').textContent = '▶'; }
}
function prevTrack() { if (currentIdx > 0) playAt(currentIdx - 1); }

function resetNowPlaying() {
  $('songName').textContent = '还没开始';
  $('songArtist').textContent = '搜索一首歌或让 AI 推荐';
  $('djText').textContent = '—';
  $('cover').classList.remove('show');
  $('lyricBox').querySelector('.lyric-cur').textContent = '—';
  $('playBtn').textContent = '▶';
}

// ============ 控制条 ============
$('playBtn').addEventListener('click', () => {
  if (audio.paused) { audio.play(); $('playBtn').textContent = '⏸'; }
  else { audio.pause(); $('playBtn').textContent = '▶'; }
});
$('nextBtn').addEventListener('click', nextTrack);
$('prevBtn').addEventListener('click', prevTrack);

audio.addEventListener('ended', nextTrack);
audio.addEventListener('timeupdate', () => {
  const cur = audio.currentTime, total = audio.duration || 0;
  $('curTime').textContent = fmtTime(cur);
  $('totalTime').textContent = fmtTime(total);
  if (total > 0) $('progressBar').value = (cur / total) * 100;
  updateLyric(cur);
});
$('progressBar').addEventListener('input', (e) => {
  if (audio.duration) audio.currentTime = (e.target.value / 100) * audio.duration;
});
$('volumeBar').addEventListener('input', (e) => {
  audio.volume = e.target.value / 100;
  dj.volume = e.target.value / 100;
});
audio.volume = 0.8; dj.volume = 0.9;

// ============ 歌词 ============
function parseLrc(text) {
  const lines = text.split('\n');
  const result = [];
  const reg = /\[(\d{2}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
  for (const line of lines) {
    const txt = line.replace(reg, '').trim();
    if (!txt) continue;
    let m; reg.lastIndex = 0;
    while ((m = reg.exec(line)) !== null) {
      const min = +m[1], sec = +m[2], ms = m[3] ? parseInt(m[3].padEnd(3, '0'), 10) : 0;
      result.push({ time: min * 60 + sec + ms / 1000, text: txt });
    }
  }
  return result.sort((a, b) => a.time - b.time);
}

function updateLyric(curTime) {
  if (!lyrics.length) return;
  let idx = -1;
  for (let i = 0; i < lyrics.length; i++) {
    if (lyrics[i].time <= curTime) idx = i;
    else break;
  }
  const box = $('lyricBox');
  box.querySelector('.lyric-prev').textContent = idx > 0 ? lyrics[idx - 1].text : '';
  box.querySelector('.lyric-cur').textContent = idx >= 0 ? lyrics[idx].text : '—';
  box.querySelector('.lyric-next').textContent = idx + 1 < lyrics.length ? lyrics[idx + 1].text : '';
}

// ============ 搜索 ============
$('searchBtn').addEventListener('click', doSearch);
$('searchInput').addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });

async function doSearch() {
  const kw = $('searchInput').value.trim();
  if (!kw) return;
  $('searchList').innerHTML = '<div class="loading">搜索中...</div>';
  try {
    const data = await fetch(`/api/search?keyword=${encodeURIComponent(kw)}`).then(r => r.json());
    renderSongList('searchList', data.songs || [], 'add');
  } catch (e) {
    $('searchList').innerHTML = '<div class="loading">搜索失败</div>';
  }
}

// ============ AI 推荐（品味感知）============
$('aiBtn').addEventListener('click', async () => {
  const prompt = $('aiPrompt').value.trim();
  if (!prompt) return;
  $('aiList').innerHTML = '<div class="loading">小克正在挑歌...</div>';
  try {
    const body = { prompt };
    if (loginUser?.userId) body.userId = loginUser.userId;
    const data = await fetch('/api/recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(r => r.json());
    renderSongList('aiList', data.songs || [], 'add');
  } catch (e) {
    $('aiList').innerHTML = '<div class="loading">推荐失败</div>';
  }
});

// ============ 热歌榜 ============
$('loadHotBtn').addEventListener('click', async () => {
  $('queueList').innerHTML = '<div class="loading">载入中...</div>';
  try {
    const data = await fetch('/api/hot?limit=20').then(r => r.json());
    queue = data.songs || [];
    currentIdx = -1;
    renderSongList('queueList', queue, 'remove');
    if (queue.length) playAt(0);
  } catch (e) { setStatus('载入失败'); }
});

// ============ 初始化 ============
renderSongList('queueList', queue, 'remove');
setStatus('搜歌或登录网易云 → 播放你的歌单');
checkLoginStatus();
