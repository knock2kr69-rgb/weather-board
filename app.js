// app.js – 화면 동작 (목록 그리기, 일정 추가)

let baseTasks = [];
let tasks = [];
let weatherByRegion = {};

function displayTodayDate() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  document.getElementById('todayDate').textContent = `${year}-${month}-${day}`;
}

function getSavedTasks() {
  try {
    const saved = JSON.parse(localStorage.getItem('wx_added') || '[]');
    return Array.isArray(saved) ? saved : [];
  } catch (error) {
    console.error('브라우저 저장 일정을 읽지 못했습니다.', error);
    return [];
  }
}

async function loadTasks() {
  const msgBox = document.getElementById('msgBox');
  try {
    const response = await fetch('data/tasks.json');
    if (!response.ok) throw new Error(`일정 요청 실패 (${response.status})`);
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error('일정 JSON 형식이 올바르지 않습니다.');
    baseTasks = data;
  } catch (error) {
    baseTasks = [];
    console.error(error);
    msgBox.textContent = window.location.protocol === 'file:'
      ? '배포 주소로 열어 주세요'
      : '기본 일정 목록을 불러오지 못했습니다.';
  }
  tasks = baseTasks.concat(getSavedTasks());
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
  const saved = getSavedTasks();
  saved.push(t);
  localStorage.setItem('wx_added', JSON.stringify(saved));
  e.target.reset();
  tasks = baseTasks.concat(saved);
  renderTasks();
}

document.getElementById('taskForm').addEventListener('submit', addTask);
displayTodayDate();

async function initializeApp() {
  await loadTasks();
  renderTasks();
  loadWeather();
}

initializeApp();
