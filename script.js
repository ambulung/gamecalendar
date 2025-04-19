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
    let currentRenderID = 0;
    let hideNsfw = true; // Keep NSFW state logic even if toggle removed from UI

    // --- Utility Functions ---
    function debounce(func, delay) { let timeoutId; return function(...args) { clearTimeout(timeoutId); timeoutId = setTimeout(() => func.apply(this, args), delay); }; }
    function getMonthName(monthIndex) { return monthNames[monthIndex]; }
    function showLoading() { if (!loadingIndicator) return; const cRgb = getComputedStyle(document.body).getPropertyValue('--container-bg-rgb').trim()||'255,255,255'; loadingIndicator.style.backgroundColor = `rgba(${cRgb}, 0.8)`; const t = calendarBody||calendarGrid; if(t && !t.contains(loadingIndicator)) t.appendChild(loadingIndicator); loadingIndicator.style.display='flex'; console.log("Loading shown."); }
    function hideLoading() { if(loadingIndicator?.parentNode) loadingIndicator.parentNode.removeChild(loadingIndicator); if(loadingIndicator) loadingIndicator.style.display='none'; console.log("Loading hidden."); }
    function clearSlideshowIntervals() { activeSlideshowIntervals.forEach(d => { clearInterval(d.id); if (d.element?.classList) { d.element.classList.remove('is-fading'); d.element.style.removeProperty('--fade-bg-image'); } }); activeSlideshowIntervals = []; }

    // --- Theme Management ---
    function applyTheme(theme) { document.body.classList.toggle('dark-mode', theme === 'dark'); if (themeToggle) themeToggle.checked = (theme === 'dark'); const cRgb = getComputedStyle(document.body).getPropertyValue('--container-bg-rgb').trim()||'255,255,255'; if(loadingIndicator) loadingIndicator.style.backgroundColor=`rgba(${cRgb}, 0.8)`; }
    function toggleTheme() { const nt = document.body.classList.contains('dark-mode')?'light':'dark'; localStorage.setItem('theme',nt); applyTheme(nt); }
    const savedTheme = localStorage.getItem('theme'); const prefersDark = !savedTheme && window.matchMedia?.('(prefers-color-scheme: dark)').matches; applyTheme(savedTheme || (prefersDark?'dark':'light'));
    if (themeToggle) themeToggle.addEventListener('change', toggleTheme);

    // --- Populate Seek Controls ---
    function populateSeekControls() { if (!seekMonthSelect || !seekYearInput) return; monthNames.forEach((n, i) => { const o=document.createElement('option'); o.value=i; o.textContent=n; seekMonthSelect.appendChild(o); }); seekMonthSelect.value = currentDate.getMonth(); seekYearInput.value = currentDate.getFullYear(); }

    // --- API Call Functions (Using Proxy) ---
    async function fetchGamesForMonth(year, month) {
        const firstDay = `${year}-${String(month + 1).padStart(2, '0')}-01`; const lastDayDate = new Date(year, month + 1, 0); const lastDay = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDayDate.getDate()).padStart(2, '0')}`;
        const params = new URLSearchParams({ dates: `${firstDay},${lastDay}`, ordering: 'released,-added,-rating,-metacritic', page_size: 100, fields: 'id,name,released,background_image,metacritic,rating,platforms,short_screenshots,clip' });
        const proxyUrl = `/.netlify/functions/rawg-proxy/games?${params.toString()}`;
        console.log(">>> Fetching month games request URL:", proxyUrl.replace(/&key=[^&]+/, '&key=***HIDDEN***'));
        try {
            const response = await fetch(proxyUrl);
             console.log("<<< Fetch month games response status:", response.status); // Log status
            if (!response.ok) { let e = `Proxy Error ${response.status}`; try{const d=await response.json(); console.error("<<< Fetch month games error response:", d); e=d.detail||d.error||e;}catch(err){} throw new Error(`Fetch games failed: ${e}`); }
            const data = await response.json();
            console.log("<<< Fetch month games successful data (first 5):", data?.results?.slice(0, 5)); // Log received data sample
            return data.results || [];
        } catch (error) { console.error('Fetch games failed:', error); throw error; }
    }
    async function fetchSuggestions(query) { /* ... (Keep exact implementation) ... */ }
    async function searchAndJumpToGame(query) { /* ... (Keep exact implementation) ... */ }
    function displaySuggestions(games) { /* ... (Keep exact implementation) ... */ }
    function handleSuggestionClick(game) { /* ... (Keep exact implementation) ... */ }
    const debouncedFetchSuggestions = debounce(async (query) => { /* ... */ }, SUGGESTION_DEBOUNCE_DELAY);


    // --- Processing Data ---
    function processGameData(games) {
        console.log("--- processGameData ---");
        console.log("Input games array length:", games?.length);
        const gamesByDate = {};
        if (!games || games.length === 0) {
            console.log("processGameData: No games to process.");
            return gamesByDate;
        }
        let processedCount = 0;
        games.forEach((game, index) => {
            if (game && game.released && game.name) {
                const releaseDate = game.released;
                if (!gamesByDate[releaseDate]) gamesByDate[releaseDate] = [];
                if (gamesByDate[releaseDate].length < MAX_GAMES_PER_DAY) {
                    if (!gamesByDate[releaseDate].some(existing => existing.id === game.id)) {
                         gamesByDate[releaseDate].push(game);
                         processedCount++;
                         // Log first few processed games per date
                         if (gamesByDate[releaseDate].length <= 2) {
                             console.log(`Processed and added to ${releaseDate}:`, game.name);
                         }
                    }
                }
            } else {
                // Log only once per type of issue to avoid flooding
                 if (!game) console.warn(`processGameData: Found null/undefined game object at index ${index}`);
                 else if (!game.released) console.warn(`processGameData: Skipping game due to missing release date: ${game.name || 'N/A'}`);
                 else if (!game.name) console.warn(`processGameData: Skipping game due to missing name: ID ${game.id || 'N/A'}`);
            }
        });
         console.log("processGameData finished. Total games processed into dates:", processedCount);
         console.log("Final gamesByDate object structure (sample):", Object.keys(gamesByDate).slice(0, 3).reduce((acc, key) => { acc[key] = gamesByDate[key].length; return acc; }, {}));
        return gamesByDate;
    }

    // --- Rendering Calendar ---
    async function renderCalendar(year, month, highlightDate = null) {
        if (!calendarGrid || !monthYearDisplay || !seekMonthSelect || !seekYearInput) return;
        const renderID = ++currentRenderID;
        console.log(`\n==================\n[${renderID}] RENDER START: ${getMonthName(month)} ${year}\n==================`);
        showLoading();

        monthYearDisplay.textContent = `${getMonthName(month)} ${year}`;
        if (seekMonthSelect) seekMonthSelect.value = month;
        if (seekYearInput) seekYearInput.value = year;

        let gamesOfMonth = null;
        let fetchError = null;
        let gamesByDate = {}; // Ensure defined

        try {
            console.log(`[${renderID}] Starting fetch...`);
            gamesOfMonth = await fetchGamesForMonth(year, month);
            console.log(`[${renderID}] Fetch successful. Received ${gamesOfMonth?.length || 0} games.`); // Log count

            if (renderID !== currentRenderID) { console.log(`[${renderID}] Discarding stale results (current is ${currentRenderID}).`); return; }

            console.log(`[${renderID}] Processing data...`);
            gamesByDate = processGameData(gamesOfMonth || []); // Process data

            console.log(`[${renderID}] Rendering grid... Games to render by date count: ${Object.keys(gamesByDate).length}`);
            clearSlideshowIntervals();
            calendarGrid.innerHTML = '';
            document.querySelectorAll('.calendar-day.search-highlight').forEach(c => c.classList.remove('search-highlight'));

            const firstDayOfMonth = new Date(year, month, 1); const daysInMonth = new Date(year, month + 1, 0).getDate(); const startDayOfWeek = firstDayOfMonth.getDay();
            let daysWithGamesRendered = 0; // Count days where games are actually added
            for (let i=0; i<startDayOfWeek; i++) createDayCell(null, true);
            for (let day=1; day<=daysInMonth; day++) {
                const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                const gamesForDay = gamesByDate[dateStr] || []; // Access processed data
                if (gamesForDay.length > 0) {
                     console.log(`[${renderID}] Day ${day}: Found ${gamesForDay.length} games.`);
                     daysWithGamesRendered++;
                }
                createDayCell(day, false, gamesForDay, dateStr);
            }
            const totalCells = startDayOfWeek + daysInMonth; const remainingCells = (7 - (totalCells % 7)) % 7; for (let i=0; i<remainingCells; i++) createDayCell(null, true);
            console.log(`[${renderID}] Grid build loops finished. Days with games rendered: ${daysWithGamesRendered}`);

            if (highlightDate) { /* ... (highlight logic) ... */ }
            console.log(`[${renderID}] Grid built successfully.`);

        } catch (error) {
            if (renderID === currentRenderID) { // Only handle error if latest
                console.error(`[${renderID}] Render/Process error:`, error); clearSlideshowIntervals(); calendarGrid.innerHTML = `<p style="color: red;">${error.message||'Failed load.'}</p>`;
            } else { console.log(`[${renderID}] Stale error ignored.`); }
        } finally {
            if (renderID === currentRenderID) { console.log(`[${renderID}] Finalizing render. Hiding loading.`); hideLoading(); }
            else { console.log(`[${renderID}] Stale render finalizing.`); }
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
            console.log(`[Day ${dayNumber}] Building list. Input games: ${gamesArray.length}`); // Log games array for the day
            gamesArray.forEach((game, index) => {
                if (game?.name) {
                    console.log(`[Day ${dayNumber}] Adding list item ${index + 1}: ${game.name}`); // Log added item
                    const listItem = document.createElement('li'); listItem.classList.add('game-list-item'); listItem.textContent = game.name;
                    listItem.title = `${game.name}\nReleased: ${game.released||'N/A'}\nRating: ${game.rating||'N/A'}/5\nMetacritic: ${game.metacritic||'N/A'}`;
                    if (game.clip?.video) { listItem.style.cursor = 'pointer'; listItem.title += `\n(Click for Trailer)`; listItem.addEventListener('click', (e) => { e.stopPropagation(); window.open(game.clip.video, '_blank'); }); }
                    else { listItem.style.cursor = 'default'; }
                    gameList.appendChild(listItem); itemsAdded++;
                } else { console.warn(`[Day ${dayNumber}] Skipping invalid game object at index ${index} in gamesArray:`, game);}
             });
             if (itemsAdded > 0) { dayCell.appendChild(gameList); } else { console.warn(`[Day ${dayNumber}] No list items added.`); }

            const initialGame = validGamesWithImages.length > 0 ? validGamesWithImages[0] : null; if (initialGame) { dayCell.style.backgroundImage = `url(${initialGame.background_image})`; dayCell.dataset.currentImageIndex = '0'; }
            if (validGamesWithImages.length > 1) { /* ... (slideshow logic unchanged) ... */ }
        }
        calendarGrid.appendChild(dayCell);
   }

    // --- Date Seek Feature ---
    function handleSeek() { /* ... (Keep exact implementation) ... */ }

    // Debounced function for filter changes (if needed later)
    const debouncedRefetchCurrentView = debounce(() => { if (currentDate) { renderCalendar(currentDate.getFullYear(), currentDate.getMonth()); } }, 300);

    // --- Event Listeners ---
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
    populateSeekControls();
    renderCalendar(currentDate.getFullYear(), currentDate.getMonth());

    console.log("Calendar script initialized.");

}); // End DOMContentLoaded