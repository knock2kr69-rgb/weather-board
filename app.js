// app.js – 화면 동작 (목록 그리기, 일정 추가)

let tasks = [];
let weatherByRegion = {};
let supabaseClient;

function displayTodayDate() {
  document.getElementById('todayDate').textContent = getTodayDate();
}

function getTodayDate() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function connectSupabase() {
  if (SUPABASE_URL === 'YOUR_SUPABASE_URL' || SUPABASE_PUBLISHABLE_KEY === 'YOUR_SUPABASE_PUBLISHABLE_KEY') {
    throw new Error('config.js에 Supabase 주소와 공개용 키를 입력해 주세요.');
  }
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
}

async function loadTasks() {
  const msgBox = document.getElementById('msgBox');
  try {
    const { data, error } = await supabaseClient
      .from('wx_tasks')
      .select('id,title,region,kind,owner,created_at')
      .order('created_at', { ascending: true })
      .order('id', { ascending: true });
    if (error) throw error;
    tasks = data || [];
    msgBox.textContent = '';
  } catch (error) {
    tasks = [];
    console.error(error);
    msgBox.textContent = `일정 목록을 불러오지 못했습니다: ${error.message}`;
  }
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

async function addTask(e) {
  e.preventDefault();
  const msgBox = document.getElementById('msgBox');
  const submitButton = e.target.querySelector('button');
  const t = {
    title: document.getElementById('titleInput').value.trim(),
    region: document.getElementById('regionInput').value,
    kind: document.getElementById('kindInput').value,
    owner: document.getElementById('ownerInput').value.trim(),
  };
  if (!t.title || !t.owner) return;
  submitButton.disabled = true;
  msgBox.textContent = '일정을 저장하는 중입니다.';
  try {
    const { error } = await supabaseClient.from('wx_tasks').insert(t);
    if (error) throw error;
    e.target.reset();
    await loadTasks();
    renderTasks();
    msgBox.textContent = '일정을 저장했습니다.';
  } catch (error) {
    console.error(error);
    msgBox.textContent = `일정을 저장하지 못했습니다: ${error.message}`;
  } finally {
    submitButton.disabled = false;
  }
}

function downloadTodayMarkdown() {
  const date = getTodayDate();
  const markdown = createJudgmentMarkdown(tasks, weatherByRegion, date);
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `현장일정_판단_${date}.md`;
  link.click();
  URL.revokeObjectURL(url);
}

document.getElementById('taskForm').addEventListener('submit', addTask);
document.getElementById('downloadMdButton').addEventListener('click', downloadTodayMarkdown);
displayTodayDate();

async function initializeApp() {
  try {
    connectSupabase();
  } catch (error) {
    console.error(error);
    document.getElementById('msgBox').textContent = error.message;
    renderTasks();
    loadWeather();
    return;
  }
  await loadTasks();
  renderTasks();
  loadWeather();
}

initializeApp();
