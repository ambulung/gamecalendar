document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM Loaded. Initializing Calendar...");

    // --- DOM Elements ---
    const calendarBody = document.querySelector('.calendar-body');
    const calendarGrid = document.getElementById('calendar-grid');
    const monthYearDisplay = document.getElementById('month-year');
    const prevMonthButton = document.getElementById('prev-month');
    const nextMonthButton = document.getElementById('next-month');
    const loadingIndicator = document.getElementById('loading-indicator');
    const themeToggle = document.getElementById('theme-toggle');
    const searchInput = document.getElementById('search-input');
    const suggestionsContainer = document.getElementById('search-suggestions');
    const seekMonthSelect = document.getElementById('seek-month');
    const seekYearInput = document.getElementById('seek-year');
    const seekButton = document.getElementById('seek-button');

    // Initial DOM Check
    if (!calendarGrid || !monthYearDisplay || !prevMonthButton || !nextMonthButton) { console.error("CRITICAL ERROR: Core calendar elements not found."); alert("Error: Could not initialize calendar elements."); return; }
    if (!loadingIndicator || !searchInput || !suggestionsContainer || !seekMonthSelect || !seekYearInput || !seekButton) { console.warn("Some non-critical elements missing."); }
    if (!themeToggle) { console.warn("Theme toggle element not found."); }


    // --- State & Constants ---
    let currentDate = new Date();
    const MAX_GAMES_PER_DAY = 10;
    let activeSlideshowIntervals = [];
    const SLIDESHOW_INTERVAL = 5000;
    const FADE_DURATION = 700;
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const SUGGESTION_DEBOUNCE_DELAY = 350;
    let currentRenderID = 0; // Version counter

    // --- Utility Functions ---
    function debounce(func, delay) { let timeoutId; return function(...args) { clearTimeout(timeoutId); timeoutId = setTimeout(() => func.apply(this, args), delay); }; }
    function getMonthName(monthIndex) { return monthNames[monthIndex]; }
    function showLoading() { if (!loadingIndicator) return; const cRgb = getComputedStyle(document.body).getPropertyValue('--container-bg-rgb').trim()||'255,255,255'; loadingIndicator.style.backgroundColor = `rgba(${cRgb}, 0.8)`; const t = calendarBody||calendarGrid; if(t && !t.contains(loadingIndicator)) t.appendChild(loadingIndicator); loadingIndicator.style.display='flex'; console.log("Loading shown."); }
    function hideLoading() { if(loadingIndicator?.parentNode) loadingIndicator.parentNode.removeChild(loadingIndicator); if(loadingIndicator) loadingIndicator.style.display='none'; console.log("Loading hidden."); }
    function clearSlideshowIntervals() { activeSlideshowIntervals.forEach(d => { clearInterval(d.id); if (d.element?.classList) { d.element.classList.remove('is-fading'); d.element.style.removeProperty('--fade-bg-image'); } }); activeSlideshowIntervals = []; }
    function processGameData(games) { const gbd={}; if(!games||games.length===0) return gbd; games.forEach(g => { if (g?.released && g.name){ const rd=g.released; if(!gbd[rd])gbd[rd]=[]; if(gbd[rd].length<MAX_GAMES_PER_DAY && !gbd[rd].some(e=>e.id===g.id)) gbd[rd].push(g); } }); return gbd; }

    // --- Theme Management ---
    function applyTheme(theme) { document.body.classList.toggle('dark-mode', theme === 'dark'); if (themeToggle) themeToggle.checked = (theme === 'dark'); const cRgb = getComputedStyle(document.body).getPropertyValue('--container-bg-rgb').trim()||'255,255,255'; if(loadingIndicator) loadingIndicator.style.backgroundColor=`rgba(${cRgb}, 0.8)`; }
    function toggleTheme() { const nt = document.body.classList.contains('dark-mode')?'light':'dark'; localStorage.setItem('theme',nt); applyTheme(nt); }
    const savedTheme = localStorage.getItem('theme'); const prefersDark = !savedTheme && window.matchMedia?.('(prefers-color-scheme: dark)').matches; applyTheme(savedTheme || (prefersDark?'dark':'light'));


    // --- Populate Seek Controls ---
    function populateSeekControls() { if (!seekMonthSelect || !seekYearInput) return; monthNames.forEach((n, i) => { const o=document.createElement('option'); o.value=i; o.textContent=n; seekMonthSelect.appendChild(o); }); seekMonthSelect.value = currentDate.getMonth(); seekYearInput.value = currentDate.getFullYear(); }

    // --- API Call Functions (Using Proxy) ---
    async function fetchGamesForMonth(year, month) {
        const firstDay = `${year}-${String(month + 1).padStart(2, '0')}-01`; const lastDayDate = new Date(year, month + 1, 0); const lastDay = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDayDate.getDate()).padStart(2, '0')}`;
        const params = new URLSearchParams({ dates: `${firstDay},${lastDay}`, ordering: 'released,-added,-rating,-metacritic', page_size: 100, fields: 'id,name,released,background_image,metacritic,rating,platforms,short_screenshots,clip' });
        const proxyUrl = `/.netlify/functions/rawg-proxy/games?${params.toString()}`;
        console.log("Fetching month games (via proxy):", proxyUrl.replace(/&key=[^&]+/, '&key=***HIDDEN***'));
        try {
            const response = await fetch(proxyUrl); if (!response.ok) { let e = `Proxy Error ${response.status}`; try{const d=await response.json();e=d.detail||d.error||e}catch(err){} throw new Error(`Fetch games failed: ${e}`); } const data = await response.json(); console.log("<<< Fetch month games successful data count:", data?.results?.length || 0); return data.results || [];
        } catch (error) { console.error('Fetch games failed:', error); throw error; }
    }
    async function fetchSuggestions(query) {
        if (!query) return [];
        const params = new URLSearchParams({ search: query, page_size: 5, search_precise: 'true', fields: 'id,name,released,background_image,metacritic,rating,platforms,short_screenshots,clip' });
        const proxyUrl = `/.netlify/functions/rawg-proxy/games?${params.toString()}`;
        console.log("Fetching suggestions (via proxy):", proxyUrl.replace(/&key=[^&]+/, '&key=***HIDDEN***'));
        try {
            const response = await fetch(proxyUrl); if (!response.ok) { console.error(`Suggestion fetch error: ${response.status}`); return []; } const data = await response.json(); return data.results || [];
        } catch (error) { console.error('Failed to fetch suggestions:', error); throw error; }
    }

    // --- Rendering Calendar ---
    async function renderCalendar(year, month, highlightDate = null) {
        if (!calendarGrid || !monthYearDisplay || !seekMonthSelect || !seekYearInput) return;
        const renderID = ++currentRenderID;
        console.log(`[${renderID}] Render START: ${getMonthName(month)} ${year}. Highlight: ${highlightDate || 'None'}`);
        showLoading();

        monthYearDisplay.textContent = `${getMonthName(month)} ${year}`;
        if (seekMonthSelect) seekMonthSelect.value = month;
        if (seekYearInput) seekYearInput.value = year;

        let gamesByDate = {};
        let fetchError = null;

        try {
            const gamesOfMonth = await fetchGamesForMonth(year, month);
            // VERSION CHECK
            if (renderID !== currentRenderID) { console.log(`[${renderID}] Discarding stale fetch results.`); return; }
            console.log(`[${renderID}] Processing data...`);
            gamesByDate = processGameData(gamesOfMonth || []);
        } catch (error) {
            if (renderID !== currentRenderID) { console.log(`[${renderID}] Stale fetch error ignored.`); return; }
            console.error(`[${renderID}] Fetch/Process error:`, error); fetchError = error;
        }

        // Only proceed if this is the latest render attempt
        if (renderID !== currentRenderID) { console.log(`[${renderID}] Render aborted (stale before DOM manipulation).`); return; }

        console.log(`[${renderID}] Rendering grid...`);
        clearSlideshowIntervals(); calendarGrid.innerHTML = '';
        document.querySelectorAll('.calendar-day.search-highlight').forEach(c => c.classList.remove('search-highlight'));

        try {
            if (fetchError) throw fetchError; // Handle error if latest failed

            const firstDayOfMonth = new Date(year, month, 1); const daysInMonth = new Date(year, month + 1, 0).getDate(); const startDayOfWeek = firstDayOfMonth.getDay();
            for (let i=0; i<startDayOfWeek; i++) createDayCell(null, true);
            for (let day=1; day<=daysInMonth; day++) { const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`; const gamesForDay = gamesByDate[dateStr] || []; createDayCell(day, false, gamesForDay, dateStr); }
            const totalCells = startDayOfWeek + daysInMonth; const remainingCells = (7 - (totalCells % 7)) % 7; for (let i=0; i<remainingCells; i++) createDayCell(null, true);

            if (highlightDate) { const targetCell = calendarGrid.querySelector(`.calendar-day[data-date="${highlightDate}"]`); if (targetCell) { targetCell.classList.add('search-highlight'); if (targetCell.scrollIntoView) targetCell.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } else { console.warn(`[${renderID}] Highlight target cell not found.`); } }
            console.log(`[${renderID}] Grid built successfully.`);
        } catch (error) {
            console.error(`[${renderID}] Render error:`, error); calendarGrid.innerHTML = `<p style="color: red;">${error.message||'Failed load.'}</p>`;
        } finally {
            // Hide loading only if this is still the latest operation
            if (renderID === currentRenderID) { console.log(`[${renderID}] Finalizing render. Hiding loading.`); hideLoading(); }
            else { console.log(`[${renderID}] Stale render finished, not hiding loading (current is ${currentRenderID}).`); }
        }
    }

    // Creates and appends the day cell element
    function createDayCell(dayNumber, isOtherMonth = false, gamesArray = [], dateStr = null) {
        if (!calendarGrid) return;
        const dayCell = document.createElement('div'); dayCell.classList.add('calendar-day'); dayCell.dataset.day = dayNumber; if (isOtherMonth) dayCell.classList.add('other-month');
        if (!isOtherMonth && dayNumber !== null && dateStr) { dayCell.dataset.date = dateStr; }
        const daySpan = document.createElement('div'); daySpan.classList.add('day-number'); daySpan.textContent = dayNumber !== null ? dayNumber : ''; dayCell.appendChild(daySpan);
        const validGamesWithImages = gamesArray.filter(g => g?.background_image);
        if (!isOtherMonth && gamesArray.length > 0) {
            dayCell.classList.add('has-game');
            const gameList = document.createElement('ul'); gameList.classList.add('game-list');
            let itemsAdded = 0;
            gamesArray.forEach(game => {
                if (game?.name) {
                    const listItem = document.createElement('li'); listItem.classList.add('game-list-item'); listItem.textContent = game.name;
                    listItem.title = `${game.name}\nReleased: ${game.released||'N/A'}\nRating: ${game.rating||'N/A'}/5\nMetacritic: ${game.metacritic||'N/A'}`;
                    if (game.clip?.video) { listItem.style.cursor = 'pointer'; listItem.title += `\n(Click for Trailer)`; listItem.addEventListener('click', (e) => { e.stopPropagation(); window.open(game.clip.video, '_blank'); }); }
                    else { listItem.style.cursor = 'default'; }
                    gameList.appendChild(listItem); itemsAdded++;
                }
             });
             if (itemsAdded > 0) { dayCell.appendChild(gameList); }
            const initialGame = validGamesWithImages.length > 0 ? validGamesWithImages[0] : null; if (initialGame) { dayCell.style.backgroundImage = `url(${initialGame.background_image})`; dayCell.dataset.currentImageIndex = '0'; }
            if (validGamesWithImages.length > 1) {
                const intervalId = setInterval(() => { const style = window.getComputedStyle(dayCell); if (!document.body.contains(dayCell)||style.display==='none'){clearInterval(intervalId);activeSlideshowIntervals=activeSlideshowIntervals.filter(item=>item.id!==intervalId);return;} if(dayCell.classList.contains('is-fading'))return; let ci = parseInt(dayCell.dataset.currentImageIndex||'0',10); const ni=(ci+1)%validGamesWithImages.length; const ng=validGamesWithImages[ni]; if(!ng?.background_image){dayCell.dataset.currentImageIndex=String(ni);return;} const nu=`url(${ng.background_image})`; dayCell.style.setProperty('--fade-bg-image',nu); dayCell.classList.add('is-fading'); setTimeout(()=>{if(!document.body.contains(dayCell)||!dayCell.classList.contains('is-fading')){if(dayCell.classList){dayCell.classList.remove('is-fading');dayCell.style.removeProperty('--fade-bg-image');}return;} dayCell.style.backgroundImage=nu; dayCell.classList.remove('is-fading'); dayCell.dataset.currentImageIndex=String(ni);},FADE_DURATION);}, SLIDESHOW_INTERVAL); activeSlideshowIntervals.push({ id: intervalId, element: dayCell });
            }
        }
        calendarGrid.appendChild(dayCell);
   }


    // --- Search and Jump Feature ---
    async function searchAndJumpToGame(query) {
        if (!query) return;
        const renderID = ++currentRenderID; // Assign ID specific to this search *operation*
        console.log(`[${renderID}] Search START for "${query}"`);
        showLoading();
        if(suggestionsContainer) { suggestionsContainer.style.display = 'none'; suggestionsContainer.innerHTML = ''; }

        let params = new URLSearchParams({ search: query, page_size: 1, search_exact: 'true', fields: 'id,name,released,background_image,metacritic,rating,platforms,short_screenshots,clip' });
        let proxyUrl = `/.netlify/functions/rawg-proxy/games?${params.toString()}`;
        let foundGame = null; let searchError = null;

        try {
            let response = await fetch(proxyUrl); let data = await response.json();
            if (!response.ok || !data.results || data.results.length === 0) {
                params = new URLSearchParams({ search: query, page_size: 1, fields: 'id,name,released,background_image,metacritic,rating,platforms,short_screenshots,clip' });
                proxyUrl = `/.netlify/functions/rawg-proxy/games?${params.toString()}`;
                response = await fetch(proxyUrl); if (!response.ok) { let e = `Proxy Error ${response.status}`; try{const d=await response.json();e=d.detail||d.error||`Search Failed`} catch(err){} throw new Error(e); } data = await response.json();
            }
            if (data.results && data.results.length > 0) foundGame = data.results[0];
        } catch (error) { console.error(`[${renderID}] Search fetch error:`, error); searchError = error; }

        // VERSION CHECK before acting on search result
        if (renderID !== currentRenderID) { console.log(`[${renderID}] Search jump aborted (stale).`); return; } // Exit if stale

        console.log(`[${renderID}] Processing search result...`);
        if (searchError) { alert(`Error searching for game: ${searchError.message}`); hideLoading(); } // Hide loading on definitive error
        else if (foundGame) { console.log(`[${renderID}] Found game:`, foundGame.name);
            if (foundGame.released) {
                const highlightDate = foundGame.released;
                try {
                    const releaseDate = new Date(highlightDate + 'T00:00:00'); const targetYear = releaseDate.getFullYear(); const targetMonth = releaseDate.getMonth();
                    if (!isNaN(targetYear) && !isNaN(targetMonth)) {
                         currentDate = new Date(targetYear, targetMonth, 1);
                         // Call renderCalendar. It will handle its own loading indicator
                         // and assign its own *new* renderID.
                         await renderCalendar(targetYear, targetMonth, highlightDate);
                    } else { throw new Error("Invalid date parsed."); }
                }
                catch (dateError) { console.error(`[${renderID}] Error parsing date for jump:`, dateError); alert(`Found '${foundGame.name}' but couldn't process date (${highlightDate}).`); hideLoading(); }
            } else { alert(`Found '${foundGame.name}' but no release date listed.`); hideLoading(); }
        } else { alert(`Game "${query}" not found.`); hideLoading(); }
    }
    // --- End Search and Jump ---


    // --- Suggestion Display Logic ---
    function displaySuggestions(games) { if (!suggestionsContainer) return; suggestionsContainer.innerHTML = ''; if (!games || games.length === 0) { suggestionsContainer.style.display = 'none'; return; } games.forEach(game => { const div = document.createElement('div'); div.classList.add('suggestion-item'); div.textContent = game.name; if (game.released) { const year = game.released.substring(0, 4); const yearSpan = document.createElement('small'); yearSpan.textContent = ` (${year})`; div.appendChild(yearSpan); } div.dataset.gameData = JSON.stringify(game); div.addEventListener('click', () => handleSuggestionClick(game)); suggestionsContainer.appendChild(div); }); suggestionsContainer.style.display = 'block'; }
    function handleSuggestionClick(game) { if (!searchInput || !suggestionsContainer) return; searchInput.value = game.name; suggestionsContainer.style.display = 'none'; suggestionsContainer.innerHTML = ''; searchAndJumpToGame(game.name); }
    const debouncedFetchSuggestions = debounce(async (query) => { if(!searchInput?.value?.trim()) return; const games = await fetchSuggestions(query); displaySuggestions(games); }, SUGGESTION_DEBOUNCE_DELAY);


    // --- Date Seek Feature ---
    function handleSeek() {
        if (!seekMonthSelect || !seekYearInput) return;
        const selectedMonth = parseInt(seekMonthSelect.value, 10); const enteredYear = parseInt(seekYearInput.value, 10);
        if (isNaN(selectedMonth) || isNaN(enteredYear) || enteredYear < 1970 || enteredYear > 2100) { alert("Please enter a valid month and year (e.g., 1970-2100)."); return; }
        currentDate = new Date(enteredYear, selectedMonth, 1);
        if (searchInput) searchInput.value = ''; if (suggestionsContainer) { suggestionsContainer.style.display = 'none'; suggestionsContainer.innerHTML = ''; }
        renderCalendar(currentDate.getFullYear(), currentDate.getMonth()); // Call renderCalendar normally
    }
    // --- End Date Seek ---

    // --- Event Listeners --- (Ensure all element refs are checked before use)
    if (prevMonthButton) prevMonthButton.addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth() - 1); if(searchInput) searchInput.value = ''; if(suggestionsContainer){suggestionsContainer.style.display = 'none'; suggestionsContainer.innerHTML = '';} renderCalendar(currentDate.getFullYear(), currentDate.getMonth()); });
    if (nextMonthButton) nextMonthButton.addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth() + 1); if(searchInput) searchInput.value = ''; if(suggestionsContainer){suggestionsContainer.style.display = 'none'; suggestionsContainer.innerHTML = '';} renderCalendar(currentDate.getFullYear(), currentDate.getMonth()); });
    if (searchInput) {
        searchInput.addEventListener('input', () => { const query = searchInput.value.trim(); if (query.length > 1) { debouncedFetchSuggestions(query); } else { if(suggestionsContainer){suggestionsContainer.style.display = 'none'; suggestionsContainer.innerHTML = '';} } });
        searchInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); searchAndJumpToGame(searchInput.value.trim()); } else if (event.key === 'Escape') { if(suggestionsContainer){suggestionsContainer.style.display = 'none'; suggestionsContainer.innerHTML = '';} } });
    }
    document.addEventListener('click', (event) => { if (searchInput && suggestionsContainer && !searchInput.contains(event.target) && !suggestionsContainer.contains(event.target)) { suggestionsContainer.style.display = 'none'; suggestionsContainer.innerHTML = ''; } });
    if (seekButton) seekButton.addEventListener('click', handleSeek);
    if (seekYearInput) seekYearInput.addEventListener('keypress', (event) => { if (event.key === 'Enter') { event.preventDefault(); handleSeek(); } });

    // --- Initial Load ---
    populateSeekControls(); // Setup seek dropdowns
    renderCalendar(currentDate.getFullYear(), currentDate.getMonth()); // Initial render

    console.log("Calendar script initialized.");

}); // End DOMContentLoaded