
/* CONFIG */
const apiKey = 'd7ed3152-ac89-45a5-b5b2-27755a562a8b';
const baseURL = 'https://api.euprod.playhq.com/';
const ekbaAssocID = 'a2203749-8d10-4a45-ba58-fa1c7ce13f6c';

/* INJECT MINIMAL CSS */
(function injectCSS(){
  const css = `
    #app { font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial; max-width: 980px; margin: 18px auto; color: #ddd; }
    #app .panel { background:#333; border:1px solid #f3f; border-radius:8px; padding:14px; box-shadow:0 1px 2px rgba(0,0,0,0.03); }
    #app h2 { margin:0 0 12px 0; font-size:18px;color:#ddd }
    #app ul { list-style:none; padding:0; margin:8px 0 0 0; display:flex; flex-wrap:wrap; gap:8px; }
    #app li { margin:0; }
    #app button { background:#111; color:#ddd; border:0; padding:8px 10px; border-radius:6px; cursor:pointer; font-size:13px; }
    #app button.secondary { background:#111; color:#ddd; border:1px solid #3ff; }
    #app button.ghost { background:#f33; color:#ddd; border:1px dashed #3ff; }
    #app .grade-row { display:flex; gap:8px; align-items:center; margin:8px 0; flex-wrap:wrap;  border-bottom: 1px dotted; }
    #app .grade-name { min-width:220px; font-weight:600; }
    #app .meta { color:#6b7280; font-size:13px; margin-bottom:8px; }
    #app .controls { display:flex; gap:8px; margin-bottom:12px; }
    #app pre.json { background:#222; color:#ddd; padding:12px; border-radius:6px; overflow:auto; max-height:360px; font-size:12px; }
    #app .small { font-size:13px; color:#ddd; }
    #app .muted { color:#ddd; font-size:13px; }
    #app table{background:#133}
  `;
  const s = document.createElement('style');
  s.textContent = css;
  document.head.appendChild(s);
})();

/* DOM root */
const app = document.getElementById('app');

/* STATE */
let seasonsCache = null;
let gradesCache = {}; // seasonId -> grades array
let lastReturnedObject = null;

/* API HELPERS */
async function getPlayHQData(type, id = "", next = "") {
  const headers = new Headers();
  headers.append('x-api-key', apiKey);
  headers.append('x-phq-tenant', 'be');
  headers.append('Accept', 'application/json');
  if (next) headers.append('cursor', next);

  const init = { method: 'GET', headers, redirect: "follow" };
  let requestURL = '';

  switch (type) {
    case "seasons":
      requestURL = baseURL + 'v1/organisations/' + id + '/seasons';
      break;
    case "grades":
      requestURL = baseURL + 'v1/seasons/' + id + '/grades';
      break;
    case "ladders":
      requestURL = baseURL + 'v2/grades/' + id + '/ladder';
      break;
    case "fixtures":
      requestURL = baseURL + 'v2/grades/' + id + '/games';
      break;
    default:
      throw new Error('Unknown type: ' + type);
  }

  const response = await fetch(requestURL, init);
  const mediaType = response.headers.get('content-type') || '';
  return mediaType.includes('json') ? response.json() : response.text();
}

async function getAllPlayHQData(type, id = "") {
  if (type === 'grades' && gradesCache[id]) return gradesCache[id];
  if (type === 'seasons' && seasonsCache) return seasonsCache;

  let data = [];
  let finished = false;
  let nextCursor = "";

  while (!finished) {
    const temp = await getPlayHQData(type, id, nextCursor);

    if (type === "ladders" || type === "fixtures") {
      data = temp;
      finished = true;
    } else {
      data.push(...(temp.data || []));
      if (!temp.metadata || !temp.metadata.hasMore) {
        finished = true;
      } else {
        nextCursor = temp.metadata.nextCursor;
      }
    }
  }

  if (type === 'grades') gradesCache[id] = data;
  if (type === 'seasons') seasonsCache = data;
  return data;
}

/**
 * Fetches all grades for a season, fetches fixtures for each grade,
 * flattens each schedule, and returns a combined array.
 *
 * @param {string} seasonId - The PlayHQ season ID
 * @returns {Promise<Array>} - Flat array of all games across all grades
 */
async function renderAllGradesSchedule(seasonId, seasonName="Season") {
  renderLoading(`${seasonName} — Season Schedule`);
  const all = [];

  // 1. Get all grades for the season
  const grades = await getAllPlayHQData("grades", seasonId);

  // 2. Loop through each grade and fetch fixtures
  for (const grade of grades) {
    const fixtures = await getAllPlayHQData("fixtures", grade.id);

    // 3. Flatten schedule for this grade
    const flat = flattenSchedule(fixtures).map(g => ({
      ...g,
      //gradeId: grade.id,
      Grade: grade.name
    }));

    // 4. Add to master list
    all.push(...flat);
  }

    lastReturnedObject = all;
    localStorage.setItem("playhq-data", JSON.stringify(all));
    console.log('Fixtures object:', all);

         // <button class="secondary" onclick="showLastReturned()">Show last returned object</button>
    app.innerHTML = `
      <div class="panel">
        <h2>${escapeHtml(seasonName)} — Schedule</h2>
        <div class="controls">
          <button class="secondary" onclick="renderSeasons()">Seasons</button>
          <button class="ghost" onclick="resetAll()">Reset</button>
        </div>
        <p class="muted small"></p>
        <div class="json" id="json-output"></div>
      </div>
    `;
    if(all.length > 0){
    	arrAdjust(gradesSettings);
    } else {
      document.getElementById('json-output').innerHTML = '<p class="muted small">No schedule data available.</p>';
    }
  return all;
}

/* UI RENDERING */
function renderLoading(title = 'Loading…') {
  app.innerHTML = `<div class="panel"><h2>${title}</h2><p class="muted">Please wait</p></div>`;
}

function renderError(message) {
  app.innerHTML = `<div class="panel"><h2>Error</h2><p class="muted">${escapeHtml(message)}</p><div style="margin-top:10px"><button class="secondary" onclick="window.location.reload()">Reload</button></div></div>`;
}

/* ESCAPE helper for safe text injection */
function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
}

/* ENTRY: show seasons */
async function renderSeasons() {
  renderLoading('Seasons');
  try {
    const seasons = await getAllPlayHQData('seasons', ekbaAssocID);
    if (!Array.isArray(seasons) || seasons.length === 0) {
      app.innerHTML = `<div class="panel"><h2>No seasons found</h2><p class="muted">Check the organisation ID or API key.</p></div>`;
      return;
    }
         // <button class="secondary" onclick="showLastReturned()">Show last returned object</button>
    app.innerHTML = `
      <div class="panel">
        <h2>Seasons</h2>
        <div class="controls">
          <button class="ghost" onclick="resetAll()">Reset</button>

        </div>
        <p class="meta small">Select a season to view grades.</p>
        <ul id="season-list"></ul>
      </div>
    `;

    const ul = document.getElementById('season-list');
    ul.innerHTML = seasons.map(s => `<li><button onclick='selectSeason("${s.id}", "${escapeHtml(s.name)}")'>${escapeHtml(s.name)}</button>
    <button onclick='renderAllGradesSchedule("${s.id}")'>${escapeHtml(s.name)} All Games</button></li>`).join('');
  } catch (err) {
    renderError(err.message || String(err));
  }
}

/* SELECT SEASON -> show grades */
async function selectSeason(seasonId, seasonName) {
  renderLoading(`${seasonName} — Grades`);
  try {
    const grades = await getAllPlayHQData('grades', seasonId);
         // <button class="secondary" onclick="showLastReturned()">Show last returned object</button>
    app.innerHTML = `
      <div class="panel">
        <h2>${escapeHtml(seasonName)} — Grades</h2>
        <div class="controls">
          <button class="secondary" onclick="renderSeasons()">Back</button>
          <button class="ghost" onclick="resetAll()">Reset</button>
        </div>
        <p class="meta small">Each grade has two actions: <strong>Schedule</strong> (fixtures) and <strong>Results</strong> (ladder).</p>
        <div id="grades-container"></div>
      </div>
    `;

    const container = document.getElementById('grades-container');
    if (!Array.isArray(grades) || grades.length === 0) {
      container.innerHTML = `<p class="muted">No grades found for this season.</p>`;
      return;
    }
//<div class="small muted">(${escapeHtml(g.id)})</div>
    container.innerHTML = grades.map(g => `
      <div class="grade-row">
        <div class="grade-name">${escapeHtml(g.name)}</div>

        <div style="margin-left:auto">
          <button onclick='loadFixtures("${g.id}", "${escapeHtml(g.name)}")'>Schedule</button>
          <button class="secondary" onclick='loadLadder("${g.id}", "${escapeHtml(g.name)}")'>Results</button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    renderError(err.message || String(err));
  }
}
 const gradesSettings = {"page":[1,250],"getArrFunction":"showLastReturned","id":"json-output","display":"table-break","colData":["filter",{"custom":1,"col":"Team","cols":["Home","Away"],"filter":"cols-dropdown"},{"col":"PlayHQ","type":"masked-url"},{"col":"playingSurfaceName","hide":"2"},{"col":"roundName","hide":"2"},{"col":"status","hide":"2","filter":"dropdown"},{"col":"Date","type":"date"}]};
   
/* LOAD FIXTURES: returns full fixtures object (raw) */
async function loadFixtures(gradeId, gradeName) {
  renderLoading(`${gradeName} — Schedule`);
  try {
    const fixtures = flattenSchedule(await getAllPlayHQData('fixtures', gradeId));
    lastReturnedObject = fixtures;
    localStorage.setItem("playhq-data", JSON.stringify(fixtures));
    console.log('Fixtures object:', fixtures);

         // <button class="secondary" onclick="showLastReturned()">Show last returned object</button>
    app.innerHTML = `
      <div class="panel">
        <h2>${escapeHtml(gradeName)} — Schedule</h2>
        <div class="controls">
          <button class="secondary" onclick="renderSeasons()">Seasons</button>
          <button class="secondary" onclick="selectSeasonFromGrade('${gradeId}')">Back to Grades</button>
          <button class="ghost" onclick="resetAll()">Reset</button>
        </div>
        <p class="muted small"></p>
        <div class="json" id="json-output"></div>
      </div>
    `;
    if(fixtures.length > 0){
    	arrAdjust(gradesSettings);
    } else {
      document.getElementById('json-output').innerHTML = '<p class="muted small">No schedule data available.</p>';
    }
    //document.getElementById('json-output').innerHTML = JSON.stringify(fixtures, null, 2);
  } catch (err) {
    renderError(err.message || String(err));
  }
}

/* LOAD LADDER: returns full ladder object (raw) */
async function loadLadder(gradeId, gradeName) {
  renderLoading(`${gradeName} — Results`);
  try {
    const ladder = flattenLadders( await getAllPlayHQData('ladders', gradeId));
    lastReturnedObject = ladder;
    localStorage.setItem("playhq-data", JSON.stringify(ladder));
    console.log('Ladder object:', ladder);

        //  <button class="secondary" onclick="showLastReturned()">Show last returned object</button>
    app.innerHTML = `
      <div class="panel">
        <h2>${escapeHtml(gradeName)} — Results</h2>
        <div class="controls">
          <button class="secondary" onclick="renderSeasons()">Seasons</button>
          <button class="secondary" onclick="selectSeasonFromGrade('${gradeId}')">Back to Grades</button>
          <button class="ghost" onclick="resetAll()">Reset</button>
        </div>
        <p class="muted small"></p>
        <div class="json" id="json-results"></div>
      </div>
    `;

    const z = {"page":[1,250],"getArrFunction":"showLastReturned","id":"json-results","display":"table-break","colData":[{"col":"percentage","hide":"1"},{"col":"adjustments","hide":"1"},{"col":"pointsFor","hide":"1"},{"col":"pointsAgainst","hide":"1"},{"col":"forfeits","hide":"1"},{"col":"disqualifications","hide":"1"}]};
    if(ladder.length > 0){
    	arrAdjust(z);
    } else {
      document.getElementById('json-results').innerHTML = '<p class="muted small">No results data available.</p>';
    }
    //document.getElementById('json-output').innerHTML = JSON.stringify(ladder, null, 2);
  } catch (err) {
    renderError(err.message || String(err));
  }
}

/* Helper: attempt to find season for a grade and re-render grades (best-effort) */
async function selectSeasonFromGrade(gradeId) {
  // Try to find season that contains this grade in cached seasons -> gradesCache
  for (const season of seasonsCache || []) {
    const grades = await getAllPlayHQData('grades', season.id);
    if (Array.isArray(grades) && grades.find(g => g.id === gradeId)) {
      selectSeason(season.id, season.name);
      return;
    }
  }
  // fallback to seasons list
  renderSeasons();
}

/* Show last returned object on page */
function showLastReturned() {
    return JSON.parse(localStorage.getItem("playhq-data"));
}

/* Reset all caches and UI */
function resetAll() {
  seasonsCache = null;
  gradesCache = {};
  lastReturnedObject = null;
  renderSeasons();
}

/**
 * flattenLadders(ladderObj)
 *
 * Converts a PlayHQ ladder object into a flat array of objects.
 * - Each output object is single-level (no nested objects).
 * - Header keys become top-level properties with their corresponding values.
 * - Preserves team id/name and ladder metadata (gradeId, type, pool).
 * - Adds `position` (1-based index in standings) and `rawValues` (original values array).
 *
 * @param {Object} ladderObj  The ladder object (shape shown by the user).
 * @returns {Array<Object>}   Array of flat objects, one per standing row.
 */
function flattenLadders(ladderObj) {
  if (!ladderObj || !Array.isArray(ladderObj.ladders)) return [];

  const out = [];

  for (const ladder of ladderObj.ladders) {
    const headers = Array.isArray(ladder.headers) ? ladder.headers : [];
    const headerKeys = headers.map(h => h.key);

    const meta = {
      gradeId: ladderObj.gradeId ?? null,
      ladderType: ladder.type ?? null,
      pool: ladder.pool ?? null
    };

    if (!Array.isArray(ladder.standings)) continue;

    ladder.standings.forEach((row, idx) => {
      const flat = {
        // metadata
        //gradeId: meta.gradeId,
        //ladderType: meta.ladderType,
        //pool: meta.pool,

        // team identity
        //teamId: row.team?.id ?? null,
        Team: row.team?.name ?? null,

        // position (1-based)
        Rank: idx + 1,

        // keep original values array for reference
        //rawValues: Array.isArray(row.values) ? row.values.slice() : []
      };

      // Map header keys to corresponding values (if present)
      if (Array.isArray(row.values)) {
        headerKeys.forEach((key, i) => {
          // If duplicate header keys exist, append an index suffix to avoid collisions
          const propName = key in flat ? `${key}_${i}` : key;
          flat[propName] = row.values[i] !== undefined ? row.values[i] : null;
        });
      } else {
        // If no values array, still create keys with nulls
        headerKeys.forEach((key, i) => {
          const propName = key in flat ? `${key}_${i}` : key;
          flat[propName] = null;
        });
      }

      out.push(flat);
    });
  }

  return out;
}

function flattenSchedule(api) {
  // Build lookup maps
  const teamMap = Object.fromEntries(api.teams.map(t => [t.id, t.name]));
  const surfaceMap = Object.fromEntries(
    api.playingSurfaces.map(s => [s.id, s.name])
  );

  const flat = [];

  for (const round of api.rounds) {
    for (const game of round.games) {
      const sched = game.schedule?.[0];

      const homeTeam = game.teams.find(t => t.isHomeTeam);
      const awayTeam = game.teams.find(t => !t.isHomeTeam);

      // Resolve names or infer fallback
      const homeName = teamMap[homeTeam.id] || `Team ${homeTeam.id.slice(0, 6)}`;
      const awayName = teamMap[awayTeam.id] || `Team ${awayTeam.id.slice(0, 6)}`;

      const courtName =
        surfaceMap[sched?.playingSurfaceId] ||
        `Court ${sched?.playingSurfaceId?.slice(0, 6)}`;

      // Extract scores if FINAL
      let homeScore = null;
      let awayScore = null;
      let winner = null;

      if (game.status === "FINAL" && game.match?.teams) {
        const homeMatch = game.match.teams.find(t => t.id === homeTeam.id);
        const awayMatch = game.match.teams.find(t => t.id === awayTeam.id);

        homeScore =
          homeMatch?.outcome?.statistics?.find(s => s.type === "TOTAL_SCORE")
            ?.value ?? null;

        awayScore =
          awayMatch?.outcome?.statistics?.find(s => s.type === "TOTAL_SCORE")
            ?.value ?? null;

        if (homeScore != null && awayScore != null) {
          winner =
            homeScore > awayScore
              ? homeName
              : awayScore > homeScore
              ? awayName
              : "Draw";
        }
      }

      // Build flat object
      flat.push({
        // Round info
        //roundId: round.id,
        roundName: round.name,
        //roundAbbrev: round.abbreviatedName,

        // Game info
        //gameId: game.id,
        status: game.status,
        //type: game.type,
        PlayHQ: game.url,
        //createdAt: game.createdAt,
        //updatedAt: game.updatedAt,

        // Schedule
        Date: sched?.dateTime ?? null,
        //playingSurfaceId: sched?.playingSurfaceId ?? null,
        playingSurfaceName: courtName,

        // Teams
        //homeTeamId: homeTeam.id,
        Home: homeName,
        //awayTeamId: awayTeam.id,
        Away: awayName,

        // Results (flat)
        Score: (homeScore !== null && awayScore !== null) ? `${homeScore} - ${awayScore}` : "-",
        Winner: (winner === homeName ? "Home" : (winner === awayName ? "Away" : winner))
      });
    }
  }

  return flat;
}

/* Expose a couple of functions to global scope for inline onclick handlers */
window.renderSeasons = renderSeasons;
window.selectSeason = selectSeason;
window.loadFixtures = loadFixtures;
window.loadLadder = loadLadder;
window.resetAll = resetAll;
window.showLastReturned = showLastReturned;
window.selectSeasonFromGrade = selectSeasonFromGrade;

/* INIT */
renderSeasons();