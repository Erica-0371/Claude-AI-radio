// AI 大脑：调 Claude 生成 DJ 解说 / 推荐歌曲（品味感知）
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || undefined,
  authToken: process.env.ANTHROPIC_AUTH_TOKEN || undefined,
  baseURL: process.env.ANTHROPIC_BASE_URL || undefined,
});

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20250929';

const DJ_SYSTEM = `你是一个有品味的中文电台 DJ，名字叫"小克"。你懂音乐、懂故事，喜欢用轻松、亲切、略带文艺的口吻介绍歌曲。

每次接到一首歌，你要在 60-90 字之间生成一段 DJ 串词，包含以下要素之一：
- 歌曲/专辑的创作背景或时代故事
- 歌手当时的人生境遇
- 这首歌的有趣冷知识
- 歌词里的一句让你触动的话和你的解读

要求：
- 像在跟朋友聊天，不要"大家好"这种播音腔
- 不要复述歌名歌手，听众已经看到了
- 不要用 emoji 和 markdown
- 直接输出文字，不要加引号
- 严格控制在 60-90 字内`;

export async function generateDjIntro({ name, artist, album }) {
  const userMsg = `下一首：《${name}》— ${artist}${album ? `（专辑：${album}）` : ''}`;
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 300,
    system: DJ_SYSTEM,
    messages: [{ role: 'user', content: userMsg }],
  });
  return res.content?.[0]?.text?.trim() || '';
}

function buildRecommendSystem(tasteContext) {
  let base = `你是音乐推荐助手"小克"。根据用户描述的心情/场景/风格，推荐 8-12 首歌曲。`;
  if (tasteContext) {
    base += `\n\n你了解这个用户的听歌品味，以下是 ta 最近高频播放的歌：\n${tasteContext}\n\n结合用户的品味偏好来推荐，但不要只推荐 ta 已经听过的，也带一些可能喜欢的新发现。`;
  }
  base += `\n\n严格输出 JSON 数组格式，每项是字符串 "歌名 歌手"，例如：
["晴天 周杰伦", "她说 林俊杰", "Yellow Coldplay"]

只输出 JSON，不要任何解释文字、不要 markdown 代码块。`;
  return base;
}

export async function recommendSongs(prompt, tasteContext = '') {
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 800,
    system: buildRecommendSystem(tasteContext),
    messages: [{ role: 'user', content: prompt }],
  });
  const text = res.content?.[0]?.text?.trim() || '[]';
  const cleaned = text.replace(/^```json?\s*/i, '').replace(/```\s*$/, '').trim();
  try {
    const arr = JSON.parse(cleaned);
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    console.error('[ai] recommend parse failed:', text);
    return [];
  }
}

export function buildTasteContext(records) {
  if (!records?.length) return '';
  return records
    .slice(0, 30)
    .map((r, i) => `${i + 1}. ${r.name} — ${r.artist} (播放${r.playCount}次)`)
    .join('\n');
}
