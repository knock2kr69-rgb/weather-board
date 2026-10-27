const fs = require('fs');
const path = require('path');
const { judge, parseKmaForecast } = require('../logic.js');

const KMA_ENDPOINT = 'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst';
const KMA_GRID = {
  '세종': { nx: 66, ny: 103 },
  '대전': { nx: 67, ny: 100 },
  '태안': { nx: 48, ny: 109 },
  '보령': { nx: 54, ny: 100 },
};

function readPublicSupabaseConfig() {
  const source = fs.readFileSync(path.join(process.cwd(), 'config.js'), 'utf8');
  const url = source.match(/SUPABASE_URL\s*=\s*['"]([^'"]+)['"]/);
  const key = source.match(/SUPABASE_PUBLISHABLE_KEY\s*=\s*['"]([^'"]+)['"]/);
  if (!url || !key) throw new Error('Supabase 공개 연결 정보를 읽지 못했습니다.');
  return { url: url[1], key: key[1] };
}

function kstParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(parts.map(({ type, value }) => [type, value]));
}

function formatKmaDate(date) {
  const { year, month, day } = kstParts(date);
  return `${year}${month}${day}`;
}

// 02시 단기예보가 공개되기 전에는 전날 23시 발표분을 사용한다.
function getKmaBase(date = new Date()) {
  const parts = kstParts(date);
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  if (minutes >= 135) return { baseDate: `${parts.year}${parts.month}${parts.day}`, baseTime: '0200' };

  const previousDay = new Date(date.getTime() - 24 * 60 * 60 * 1000);
  return { baseDate: formatKmaDate(previousDay), baseTime: '2300' };
}

function encodedServiceKey(key) {
  return /%[0-9a-f]{2}/i.test(key) ? key : encodeURIComponent(key);
}

function buildKmaUrl(region, key, date = new Date()) {
  const grid = KMA_GRID[region];
  const { baseDate, baseTime } = getKmaBase(date);
  const params = new URLSearchParams({
    pageNo: '1',
    numOfRows: '1000',
    dataType: 'JSON',
    base_date: baseDate,
    base_time: baseTime,
    nx: String(grid.nx),
    ny: String(grid.ny),
  });
  return `${KMA_ENDPOINT}?serviceKey=${encodedServiceKey(key)}&${params}`;
}

async function fetchWeather(region, key, date = new Date()) {
  const response = await fetch(buildKmaUrl(region, key, date));
  const text = await response.text();
  if (!response.ok) throw new Error(`기상청 API 요청 실패 (${response.status})`);

  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error('기상청 API가 JSON이 아닌 응답을 반환했습니다.');
  }

  const header = payload.response && payload.response.header;
  if (!header || header.resultCode !== '00') {
    throw new Error(`기상청 API 오류: ${header && header.resultMsg ? header.resultMsg : '알 수 없는 오류'}`);
  }
  const items = payload.response.body && payload.response.body.items && payload.response.body.items.item;
  return parseKmaForecast(items, formatKmaDate(date));
}

async function fetchTasks(region) {
  const { url, key } = readPublicSupabaseConfig();
  const query = new URLSearchParams({
    select: 'id,title,region,kind,owner,created_at',
    region: `eq.${region}`,
    order: 'created_at.asc,id.asc',
  });
  const response = await fetch(`${url}/rest/v1/wx_tasks?${query}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!response.ok) throw new Error(`일정 DB 조회 실패 (${response.status})`);
  return response.json();
}

module.exports = async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'GET 요청만 지원합니다.' });
  }

  const region = Array.isArray(request.query.region) ? request.query.region[0] : request.query.region;
  if (!KMA_GRID[region]) {
    return response.status(400).json({ error: 'region은 세종, 대전, 태안, 보령 중 하나여야 합니다.' });
  }
  if (!process.env.KMA_KEY) {
    return response.status(500).json({ error: '서버에 KMA_KEY가 설정되지 않았습니다.' });
  }

  try {
    const now = new Date();
    const [weather, tasks] = await Promise.all([
      fetchWeather(region, process.env.KMA_KEY, now),
      fetchTasks(region),
    ]);
    const results = tasks.map((task) => ({
      id: task.id,
      title: task.title,
      region: task.region,
      kind: task.kind,
      owner: task.owner,
      weather,
      judgment: judge(task.kind, weather).text,
    }));
    const { year, month, day } = kstParts(now);
    return response.status(200).json({ region, date: `${year}-${month}-${day}`, weather, tasks: results });
  } catch (error) {
    console.error('KMA endpoint failed:', error.message);
    return response.status(502).json({ error: error.message });
  }
};

module.exports._test = { KMA_GRID, getKmaBase, buildKmaUrl, readPublicSupabaseConfig };
