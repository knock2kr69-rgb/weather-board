// app.js – 화면 동작 (목록 그리기, 일정 추가)

// 01 단원 : 일정 목록을 코드 안에 둠 (가상 데이터) → 04 단원에서 data/tasks.json 으로 분리
const SAMPLE_TASKS = [
  { title: '다중이용시설 안전점검', region: '세종', kind: '야외', owner: '김안전' },
  { title: '시민 안전체험 행사 운영', region: '보령', kind: '야외', owner: '이행사' },
  { title: '옥상 태양광 설비 점검', region: '태안', kind: '고소', owner: '박설비' },
  { title: '하천 수위계 확인', region: '대전', kind: '야외', owner: '최현장' },
  { title: '청사 외벽 간판 보수', region: '세종', kind: '고소', owner: '정시설' },
  { title: '비상연락 훈련', region: '대전', kind: '실내', owner: '한상황' },
];

let tasks = [];
let weatherByRegion = {};

function displayTodayDate() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  document.getElementById('todayDate').textContent = `${year}-${month}-${day}`;
}

function loadTasks() {
  const saved = JSON.parse(localStorage.getItem('wx_added') || '[]');
  tasks = SAMPLE_TASKS.concat(saved);
}

function weatherText(w) {
  return w ? w.tempMax + '℃ · ' + w.windMax + 'm/s · ' + w.rainProb + '%' : '-';
}

function renderTasks() {
  const body = document.getElementById('taskList');
  body.innerHTML = '';
  for (const t of tasks) {
    const w = weatherByRegion[t.region];
    const r = judge(t.kind, w);
    const tr = document.createElement('tr');
    for (const v of [t.title, t.region, t.kind, t.owner, weatherText(w)]) {
      const td = document.createElement('td');
      td.textContent = v;
      tr.appendChild(td);
    }
    const td = document.createElement('td');
    td.textContent = r.text;
    td.className = r.level;
    tr.appendChild(td);
    body.appendChild(tr);
  }
}

async function loadWeather() {
  const weatherBox = document.getElementById('weatherBox');
  const testWind = new URLSearchParams(window.location.search).get('test') === 'wind';
  weatherBox.textContent = testWind ? '날씨 불러오는 중 · 풍속 시험 모드' : '날씨 불러오는 중';

  const regions = Object.keys(REGIONS);
  const results = await Promise.allSettled(regions.map(async (region) => {
    const response = await fetch(buildWeatherUrl(region));
    if (!response.ok) throw new Error(`${region} 날씨 요청 실패 (${response.status})`);
    return [region, parseWeatherResponse(await response.json(), testWind)];
  }));

  weatherByRegion = {};
  let failedCount = 0;
  results.forEach((result) => {
    if (result.status === 'fulfilled') {
      const [region, weather] = result.value;
      weatherByRegion[region] = weather;
    } else {
      failedCount += 1;
      console.error(result.reason);
    }
  });

  renderTasks();
  if (failedCount === regions.length) {
    weatherBox.textContent = '날씨 정보를 불러오지 못했습니다. 일정 목록은 계속 사용할 수 있습니다.';
  } else if (failedCount > 0) {
    weatherBox.textContent = `일부 지역의 날씨를 불러오지 못했습니다 (${failedCount}곳).`;
  } else {
    weatherBox.textContent = testWind
      ? '오늘 날씨 · 풍속 시험 모드 (최대 풍속 12m/s)'
      : '오늘 날씨를 반영했습니다.';
  }
}

function addTask(e) {
  e.preventDefault();
  const t = {
    title: document.getElementById('titleInput').value.trim(),
    region: document.getElementById('regionInput').value,
    kind: document.getElementById('kindInput').value,
    owner: document.getElementById('ownerInput').value.trim(),
  };
  if (!t.title || !t.owner) return;
  const saved = JSON.parse(localStorage.getItem('wx_added') || '[]');
  saved.push(t);
  localStorage.setItem('wx_added', JSON.stringify(saved));
  e.target.reset();
  loadTasks();
  renderTasks();
}

document.getElementById('taskForm').addEventListener('submit', addTask);
displayTodayDate();
loadTasks();
renderTasks();
loadWeather();
