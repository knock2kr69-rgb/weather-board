// logic.js – 판단 규칙만 (화면을 다루는 코드 금지)

// 교육용 가상 기준 (실제 작업 중지 · 행사 취소 기준은 각 기관 규정을 따름)
const RULES = { wind: 10, rain: 60, heat: 33 };

const REGIONS = {
  '세종': { latitude: 36.4800, longitude: 127.2890 },
  '대전': { latitude: 36.3504, longitude: 127.3845 },
  '태안': { latitude: 36.7456, longitude: 126.2981 },
  '보령': { latitude: 36.3332, longitude: 126.6128 },
};

// Open-Meteo 오늘 날씨 요청 주소 만들기
function buildWeatherUrl(region) {
  const location = REGIONS[region];
  if (!location) throw new Error(`지원하지 않는 지역: ${region}`);

  const params = new URLSearchParams({
    latitude: location.latitude,
    longitude: location.longitude,
    daily: 'temperature_2m_max,wind_speed_10m_max,precipitation_probability_max',
    wind_speed_unit: 'ms',
    timezone: 'Asia/Seoul',
    forecast_days: '1',
  });
  return `https://api.open-meteo.com/v1/forecast?${params}`;
}

// Open-Meteo 일별 응답에서 오늘 값 해석하기
function parseWeatherResponse(data, testWind = false) {
  const daily = data && data.daily;
  const tempMax = daily && daily.temperature_2m_max && daily.temperature_2m_max[0];
  const windMax = daily && daily.wind_speed_10m_max && daily.wind_speed_10m_max[0];
  const rainProb = daily && daily.precipitation_probability_max && daily.precipitation_probability_max[0];

  if (![tempMax, windMax, rainProb].every(Number.isFinite)) {
    throw new Error('날씨 응답 형식이 올바르지 않습니다.');
  }

  return { tempMax, windMax: testWind ? 12 : windMax, rainProb };
}

// 일정 구분과 날씨로 판단 (w가 없으면 '날씨 확인 전')
function judge(kind, w) {
  if (!w) return { level: 'none', text: '날씨 확인 전' };
  if (kind === '실내') return { level: 'ok', text: '영향 없음' };
  if (kind === '고소' && w.windMax >= RULES.wind) return { level: 'stop', text: '중지 검토 (강풍)' };
  if (w.tempMax >= RULES.heat) return { level: 'warn', text: '폭염 휴식' };
  if (w.rainProb >= RULES.rain) return { level: 'warn', text: '우천 주의' };
  return { level: 'ok', text: '진행' };
}

function escapeMarkdownTableCell(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

// 현재 일정과 날씨를 내려받을 마크다운 문서로 만들기
function createJudgmentMarkdown(tasks, weatherByRegion, date) {
  const lines = [
    `# 현장 일정 판단 (${date})`,
    '',
    '| 일정 | 지역 | 구분 | 담당 | 날씨 | 판단 |',
    '|---|---|---|---|---|---|',
  ];

  for (const task of tasks) {
    const weather = weatherByRegion[task.region];
    const weatherLabel = weather
      ? `${weather.tempMax}℃ · ${weather.windMax}m/s · ${weather.rainProb}%`
      : '-';
    const result = judge(task.kind, weather);
    const cells = [task.title, task.region, task.kind, task.owner, weatherLabel, result.text]
      .map(escapeMarkdownTableCell);
    lines.push(`| ${cells.join(' | ')} |`);
  }

  lines.push(
    '',
    `판단 기준: 풍속 ${RULES.wind}m/s 이상 · 강수확률 ${RULES.rain}% 이상 · 기온 ${RULES.heat}℃ 이상`,
  );
  return `${lines.join('\n')}\n`;
}

if (typeof module !== 'undefined') {
  module.exports = {
    RULES,
    REGIONS,
    buildWeatherUrl,
    parseWeatherResponse,
    judge,
    createJudgmentMarkdown,
  };
}
