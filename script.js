document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const calendarBody = document.querySelector('.calendar-body');
    const calendarGrid = document.getElementById('calendar-grid');
    const monthYearDisplay = document.getElementById('month-year');
    const prevMonthButton = document.getElementById('prev-month');
    const nextMonthButton = document.getElementById('next-month');
    const loadingIndicator = document.getElementById('loading-indicator');
    const themeToggle = document.getElementById('theme-toggle');
    const nsfwToggle = document.getElementById('nsfw-toggle'); // NEW NSFW Toggle element
    const searchInput = document.getElementById('search-input');
    const suggestionsContainer = document.getElementById('search-suggestions');
    const seekMonthSelect = document.getElementById('seek-month');
    const seekYearInput = document.getElementById('seek-year');
    const seekButton = document.getElementById('seek-button');

    // --- State & Constants ---
    let currentDate = new Date();
    const MAX_GAMES_PER_DAY = 10;
    let activeSlideshowIntervals = [];
    const SLIDESHOW_INTERVAL = 5000;
    const FADE_DURATION = 700;
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const SUGGESTION_DEBOUNCE_DELAY = 350;
    let currentRenderID = 0;
    let hideNsfw = true; // Default state for NSFW filter (true = hide)

    // --- Utility: Debounce ---
    function debounce(func, delay) { /* ... (no changes) ... */ }

    // --- Theme Management ---
    function applyTheme(theme) { /* ... (no changes) ... */ }
    function toggleTheme() { /* ... (no changes) ... */ }
    // ... (theme init) ...

    // --- *** NSFW Filter Management *** ---
    function applyNsfwFilterState(shouldHide) {
        hideNsfw = shouldHide;
        if (nsfwToggle) {
            nsfwToggle.checked = shouldHide;
        }
        // Store preference in local storage
        localStorage.setItem('hideNsfwPref', hideNsfw ? 'true' : 'false');
        console.log("NSFW Filter Active:", hideNsfw);
    }

    function toggleNsfwFilter() {
        applyNsfwFilterState(!hideNsfw); // Toggle the current state
        // Re-render the current view with the new filter setting
        // Debounce this slightly to prevent rapid re-renders if user clicks fast
        debouncedRefetchCurrentView();
    }

    // Initialize NSFW Filter state from localStorage or default
    const savedNsfwPref = localStorage.getItem('hideNsfwPref');
    // If 'savedNsfwPref' is null (first visit), default to true (hide).
    // Otherwise, parse the stored string value.
    const initialHideNsfw = savedNsfwPref === null ? true : (savedNsfwPref === 'true');
    applyNsfwFilterState(initialHideNsfw); // Apply on load

    // Add event listener for the toggle
    if (nsfwToggle) {
        nsfwToggle.addEventListener('change', toggleNsfwFilter);
    }
    // --- *** End NSFW Filter Management *** ---


    // --- Populate Seek Controls ---
    function populateSeekControls() { /* ... (no changes) ... */ }

    // --- Calendar Logic ---
    function clearSlideshowIntervals() { /* ... (no changes) ... */ }
    function showLoading() { /* ... (no changes) ... */ }
    function hideLoading() { /* ... (no changes) ... */ }
    function processGameData(games) { /* ... (no changes) ... */ }

    async function renderCalendar(year, month, highlightDate = null) {
        if (!calendarGrid || !monthYearDisplay || !seekMonthSelect || !seekYearInput) { console.error("Core elements missing!"); return; }
        const renderID = ++currentRenderID; showLoading();
        monthYearDisplay.textContent = `${getMonthName(month)} ${year}`; seekMonthSelect.value = month; seekYearInput.value = year;
        let gamesOfMonth = null; let fetchError = null;
        try {
            console.log(`[${renderID}] Starting fetch for ${getMonthName(month)} ${year} (Hide NSFW: ${hideNsfw})`);
            gamesOfMonth = await fetchGamesForMonth(year, month); // Fetch applies NSFW filter
        } catch (error) { console.error(`[${renderID}] Fetch error:`, error); fetchError = error; }

        if (renderID !== currentRenderID) { console.log(`[${renderID}] Discarding stale results.`); return; }

        console.log(`[${renderID}] Processing results...`);
        clearSlideshowIntervals(); calendarGrid.innerHTML = '';
        document.querySelectorAll('.calendar-day.search-highlight').forEach(cell => cell.classList.remove('search-highlight'));

        try {
            if (fetchError) throw fetchError;
            const gamesByDate = processGameData(gamesOfMonth || []);
            const firstDayOfMonth = new Date(year, month, 1); const daysInMonth = new Date(year, month + 1, 0).getDate(); const startDayOfWeek = firstDayOfMonth.getDay();
            for (let i = 0; i < startDayOfWeek; i++) createDayCell(null, true);
            for (let day = 1; day <= daysInMonth; day++) { const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`; const gamesForDay = gamesByDate[dateStr] || []; createDayCell(day, false, gamesForDay, dateStr); }
            const totalCells = startDayOfWeek + daysInMonth; const remainingCells = (7 - (totalCells % 7)) % 7; for (let i = 0; i < remainingCells; i++) createDayCell(null, true);

            if (highlightDate) { const targetCell = calendarGrid.querySelector(`.calendar-day[data-date="${highlightDate}"]`); if (targetCell) { targetCell.classList.add('search-highlight'); if (targetCell.scrollIntoView) { targetCell.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } console.log(`[${renderID}] Highlight applied.`); } else { console.log(`[${renderID}] Target cell for highlight not found.`); } }
        } catch (error) { console.error(`[${renderID}] Render error:`, error); calendarGrid.innerHTML = `<p style="color: red; grid-column: 1 / -1; text-align: center; padding: 20px;">${error.message || 'Failed to load game data.'}</p>`;
        } finally { console.log(`[${renderID}] Finishing render.`); hideLoading(); }
    }

    function createDayCell(dayNumber, isOtherMonth = false, gamesArray = [], dateStr = null) { /* ... (no changes needed in this function) ... */ }


    // --- API Call Functions (Modify to include NSFW filter) ---

    // Helper to add common parameters including NSFW filter
    function addApiParams(params) {
         // Add NSFW filter if hideNsfw is true
         // We EXCLUDE Adults Only (rating 4)
         if (hideNsfw) {
             params.append('exclude_esrb_ratings', '4');
         }
         // Add other common params if needed in future
         return params;
    }


    async function fetchGamesForMonth(year, month) {
        const firstDay = `${year}-${String(month + 1).padStart(2, '0')}-01`;
        const lastDayDate = new Date(year, month + 1, 0);
        const lastDay = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDayDate.getDate()).padStart(2, '0')}`;
        let params = new URLSearchParams({ dates: `${firstDay},${lastDay}`, ordering: 'released,-added,-rating,-metacritic', page_size: 100 });

        // Add common/NSFW parameters
        params = addApiParams(params);

        const proxyUrl = `/.netlify/functions/rawg-proxy/games?${params.toString()}`;
        console.log("Fetching month games (via proxy):", proxyUrl.replace(/&exclude_esrb_ratings=\d/, '&exclude_nsfw')); // Log clean URL
        try {
            const response = await fetch(proxyUrl); if (!response.ok) { let e = `Proxy Error ${response.status}`; try{const d=await response.json();e=d.detail||d.error||e}catch(err){} throw new Error(`Fetch games failed: ${e}`); } const data = await response.json(); return data.results || [];
        } catch (error) { console.error('Fetch games failed:', error); throw error; }
    }

    async function fetchSuggestions(query) {
        if (!query) return [];
        let params = new URLSearchParams({ search: query, page_size: 5, search_precise: 'true' });

        // Add common/NSFW parameters
        params = addApiParams(params);

        const proxyUrl = `/.netlify/functions/rawg-proxy/games?${params.toString()}`;
        try {
            const response = await fetch(proxyUrl); if (!response.ok) { console.error(`Suggestion fetch error: ${response.status}`); return []; } const data = await response.json(); return data.results || [];
        } catch (error) { console.error('Failed to fetch suggestions:', error); return []; }
    }

    async function searchAndJumpToGame(query) {
        if (!query) return;
        const renderID = ++currentRenderID; showLoading();
        if(suggestionsContainer) { suggestionsContainer.style.display = 'none'; suggestionsContainer.innerHTML = ''; }

        // Apply NSFW filter to search as well
        let params = new URLSearchParams({ search: query, page_size: 1, search_exact: 'true' });
        params = addApiParams(params); // Apply filter
        let proxyUrl = `/.netlify/functions/rawg-proxy/games?${params.toString()}`;
        let foundGame = null; let searchError = null;

        console.log(`[${renderID}] Searching game (via proxy - Hide NSFW: ${hideNsfw}):`, proxyUrl.replace(/&exclude_esrb_ratings=\d/, '&exclude_nsfw'));
        try {
            let response = await fetch(proxyUrl); let data = await response.json();
            // If exact fails, try broader search (also apply filter)
            if (!response.ok || !data.results || data.results.length === 0) {
                params = new URLSearchParams({ search: query, page_size: 1 });
                params = addApiParams(params); // Apply filter
                proxyUrl = `/.netlify/functions/rawg-proxy/games?${params.toString()}`;
                response = await fetch(proxyUrl); if (!response.ok) { let e = `Proxy Error ${response.status}`; try{const d=await response.json();e=d.detail||d.error||`Search Failed`} catch(err){} throw new Error(e); } data = await response.json();
            }
            if (data.results && data.results.length > 0) foundGame = data.results[0];
        } catch (error) { console.error(`[${renderID}] Failed to search for game:`, error); searchError = error; }

        // Version check and result processing... (logic remains the same)
         if (renderID !== currentRenderID) { console.log(`[${renderID}] Search jump aborted (stale).`); return; }
         console.log(`[${renderID}] Processing search result...`);
         if (searchError) { alert(`Error searching for game: ${searchError.message}`); hideLoading(); }
         else if (foundGame) { console.log(`[${renderID}] Found game:`, foundGame.name, foundGame.released);
             if (foundGame.released) { const highlightDate = foundGame.released; try { const releaseDate = new Date(highlightDate + 'T00:00:00'); const targetYear = releaseDate.getFullYear(); const targetMonth = releaseDate.getMonth(); if (!isNaN(targetYear) && !isNaN(targetMonth)) { currentDate = new Date(targetYear, targetMonth, 1); await renderCalendar(targetYear, targetMonth, highlightDate); } else { throw new Error("Invalid date parsed."); } } catch (dateError) { console.error("Error parsing release date:", highlightDate, dateError); alert(`Found '${foundGame.name}' but couldn't parse its release date (${highlightDate}).`); hideLoading(); }
             } else { alert(`Found '${foundGame.name}' but it doesn't have a specific release date listed.`); hideLoading(); }
         } else { alert(`Game "${query}" not found.`); hideLoading(); }
    }
    // --- End API Calls ---

    // --- Suggestion Display Logic --- (Keep as is)
    function displaySuggestions(games) { /* ... */ }
    function handleSuggestionClick(game) { /* ... */ }
    const debouncedFetchSuggestions = debounce(async (query) => { const games = await fetchSuggestions(query); displaySuggestions(games); }, SUGGESTION_DEBOUNCE_DELAY);

    // --- Date Seek Feature --- (Keep as is)
    function handleSeek() { /* ... */ }

    // --- Helper Functions --- (Keep as is)
    function getMonthName(monthIndex) { return monthNames[monthIndex]; }
    // showLoading/hideLoading defined above

    // Debounced function to re-render the current view after filter change
    const debouncedRefetchCurrentView = debounce(() => {
        if (currentDate) {
            renderCalendar(currentDate.getFullYear(), currentDate.getMonth());
        }
    }, 300); // Short delay after toggle


    // --- Event Listeners (Keep existing, add NSFW toggle) ---
    if (prevMonthButton) prevMonthButton.addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth() - 1); if(searchInput) searchInput.value = ''; if(suggestionsContainer){suggestionsContainer.style.display = 'none'; suggestionsContainer.innerHTML = '';} renderCalendar(currentDate.getFullYear(), currentDate.getMonth()); });
    if (nextMonthButton) nextMonthButton.addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth() + 1); if(searchInput) searchInput.value = ''; if(suggestionsContainer){suggestionsContainer.style.display = 'none'; suggestionsContainer.innerHTML = '';} renderCalendar(currentDate.getFullYear(), currentDate.getMonth()); });
    if (searchInput) { /* ... search listeners ... */ }
    document.addEventListener('click', (event) => { /* ... hide suggestions ... */ });
    if (seekButton) seekButton.addEventListener('click', handleSeek);
    if (seekYearInput) seekYearInput.addEventListener('keypress', (event) => { /* ... seek on enter ... */ });
    // Theme toggle listener is already added during init

    // --- Initial Load ---
    populateSeekControls();
    renderCalendar(currentDate.getFullYear(), currentDate.getMonth()); // Initial render uses initial NSFW state

}); // End DOMContentLoaded