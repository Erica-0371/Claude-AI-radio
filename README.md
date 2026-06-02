# AI Radio · 小克电台

个人 AI 音乐电台 — localhost 精简版。Claude 当 DJ，Edge TTS 配音，网易云出歌。

## 前置要求

- Node.js 18+
- 一个 Anthropic API Key（或兼容的代理网关）

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 配置 API Key
cp .env.example .env
# 编辑 .env，填入你的 ANTHROPIC_API_KEY

# 3. 启动
npm start
```

打开 http://localhost:3000

首次使用 AI 推荐 / 歌单功能需要扫码登录网易云（登录态缓存在本地 `cache/`，不会上传）。

## 玩法

- **搜索**：右侧搜索框输歌名 → 点 + 加入队列
- **AI 推荐**：第三个 tab，描述你想听什么（"深夜代码 BGM" / "周杰伦风格的华语" / "适合跑步的英文"），小克推荐 8-10 首
- **热歌榜**：一键载入飙升榜直接听
- **DJ 解说**：每首歌前小克会用语音介绍 60-90 字的背景故事

## 配置

`.env` 中可选：
- `ANTHROPIC_API_KEY`：Anthropic 官方 key
- `ANTHROPIC_BASE_URL` / `ANTHROPIC_AUTH_TOKEN`：如果走自建代理 / 第三方网关就填上
- `ANTHROPIC_MODEL`：默认 `claude-sonnet-4-5-20250929`
- `TTS_VOICE`：DJ 声音
  - `zh-CN-YunxiNeural` 男声（默认）
  - `zh-CN-XiaoxiaoNeural` 女声
  - `zh-CN-YunyangNeural` 新闻播音男声
- `PORT`：服务端口，默认 3000

## 架构

```
前端 (public/)
  ↓ HTTP / fetch
Express (server.js)
  ├── services/music.js  → NeteaseCloudMusicApi
  ├── services/ai.js     → Anthropic Claude
  └── services/tts.js    → Edge TTS (cache/tts/*.mp3)
```

## 注意

- VIP 歌曲无播放链接会被自动跳过
- 网易云直链 30 分钟左右过期，本播放器每次播放都实时获取
- TTS 文件按文本哈希缓存，重复歌曲不会重新合成
- 仅供个人学习研究，请勿用于商业用途；音乐版权归各平台所有

## License

[MIT](LICENSE)
