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
    // REMOVED: const nsfwToggle = document.getElementById('nsfw-toggle');
    const searchInput = document.getElementById('search-input');
    const suggestionsContainer = document.getElementById('search-suggestions');
    const seekMonthSelect = document.getElementById('seek-month');
    const seekYearInput = document.getElementById('seek-year');
    const seekButton = document.getElementById('seek-button');

    // Add initial checks for essential elements
    if (!calendarGrid || !monthYearDisplay || !prevMonthButton || !nextMonthButton) { /* ... error handling ... */ return; }
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
    // REMOVED: let hideNsfw = true;

    // --- Utility Functions ---
    function debounce(func, delay) { /* ... (keep implementation) ... */ }
    function getMonthName(monthIndex) { return monthNames[monthIndex]; }
    function showLoading() { /* ... (keep implementation) ... */ }
    function hideLoading() { /* ... (keep implementation) ... */ }
    function clearSlideshowIntervals() { /* ... (keep implementation) ... */ }
    function processGameData(games) { /* ... (keep implementation) ... */ }

    // --- Theme Management ---
    function applyTheme(theme) { /* ... (keep implementation) ... */ }
    function toggleTheme() { /* ... (keep implementation) ... */ }
    const savedTheme = localStorage.getItem('theme'); const prefersDark = !savedTheme && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches; applyTheme(savedTheme || (prefersDark ? 'dark' : 'light'));
    if (themeToggle) themeToggle.addEventListener('change', toggleTheme);

    // --- NSFW Filter Management REMOVED ---

    // --- Populate Seek Controls ---
    function populateSeekControls() { /* ... (keep implementation) ... */ }

    // --- Calendar Logic ---

    async function renderCalendar(year, month, highlightDate = null) {
        if (!calendarGrid || !monthYearDisplay || !seekMonthSelect || !seekYearInput) { console.error("Core elements missing!"); return; }
        const renderID = ++currentRenderID;
        console.log(`[${renderID}] Attempting to render ${getMonthName(month)} ${year}. Highlight: ${highlightDate || 'None'}.`); // Removed NSFW log
        showLoading();

        monthYearDisplay.textContent = `${getMonthName(month)} ${year}`;
        if (seekMonthSelect) seekMonthSelect.value = month;
        if (seekYearInput) seekYearInput.value = year;

        let gamesByDate = {};
        let fetchError = null;

        try {
            console.log(`[${renderID}] Starting fetch...`);
            const gamesOfMonth = await fetchGamesForMonth(year, month); // Fetch doesn't need NSFW state now
            console.log(`[${renderID}] Fetch successful.`);

            if (renderID !== currentRenderID) { console.log(`[${renderID}] Discarding stale results (current is ${currentRenderID}).`); return; }

            console.log(`[${renderID}] This is the latest request. Processing data...`);
            gamesByDate = processGameData(gamesOfMonth || []);

            console.log(`[${renderID}] Rendering grid...`);
            clearSlideshowIntervals();
            calendarGrid.innerHTML = '';
            document.querySelectorAll('.calendar-day.search-highlight').forEach(cell => { cell.classList.remove('search-highlight'); });

            const firstDayOfMonth = new Date(year, month, 1); const daysInMonth = new Date(year, month + 1, 0).getDate(); const startDayOfWeek = firstDayOfMonth.getDay();
            for (let i = 0; i < startDayOfWeek; i++) createDayCell(null, true);
            for (let day = 1; day <= daysInMonth; day++) { const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`; const gamesForDay = gamesByDate[dateStr] || []; createDayCell(day, false, gamesForDay, dateStr); }
            const totalCells = startDayOfWeek + daysInMonth; const remainingCells = (7 - (totalCells % 7)) % 7; for (let i = 0; i < remainingCells; i++) createDayCell(null, true);

            if (highlightDate) {
                 const targetCell = calendarGrid.querySelector(`.calendar-day[data-date="${highlightDate}"]`);
                 if (targetCell) { targetCell.classList.add('search-highlight'); if (targetCell.scrollIntoView) targetCell.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); console.log(`[${renderID}] Highlight applied.`); } else { console.warn(`[${renderID}] Target cell for highlight not found.`); }
            }
            console.log(`[${renderID}] Grid built successfully.`);

        } catch (error) {
            console.error(`[${renderID}] Render/Process error:`, error); clearSlideshowIntervals(); calendarGrid.innerHTML = `<p style="color: red; grid-column: 1 / -1; text-align: center; padding: 20px;">${error.message || 'Failed to load game data.'}</p>`;
        } finally {
            console.log(`[${renderID}] Finalizing render. Hiding loading.`); hideLoading();
        }
    }

    // Creates and appends the day cell element - Includes Trailer Link Logic
    function createDayCell(dayNumber, isOtherMonth = false, gamesArray = [], dateStr = null) {
        if (!calendarGrid) { console.warn("calendarGrid not found in createDayCell."); return; }

        const dayCell = document.createElement('div'); dayCell.classList.add('calendar-day'); dayCell.dataset.day = dayNumber; if (isOtherMonth) dayCell.classList.add('other-month');
        if (!isOtherMonth && dayNumber !== null && dateStr) { dayCell.dataset.date = dateStr; }
        const daySpan = document.createElement('div'); daySpan.classList.add('day-number'); daySpan.textContent = dayNumber !== null ? dayNumber : ''; dayCell.appendChild(daySpan);
        const validGamesWithImages = gamesArray.filter(g => g && g.background_image);
        if (!isOtherMonth && gamesArray.length > 0) {
            dayCell.classList.add('has-game');
            const gameList = document.createElement('ul'); gameList.classList.add('game-list');
            let itemsAdded = 0;
            gamesArray.forEach(game => {
                if (game && game.name) {
                    const listItem = document.createElement('li'); listItem.classList.add('game-list-item'); listItem.textContent = game.name;
                    listItem.title = `${game.name}\nReleased: ${game.released || 'N/A'}\nRating: ${game.rating || 'N/A'} / 5\nMetacritic: ${game.metacritic || 'N/A'}`;
                    // *** Add Click Listener for Trailer ***
                    if (game.clip?.video) { // Check for clip.video first
                         listItem.style.cursor = 'pointer';
                         listItem.title += `\n(Click for Trailer)`; // Updated tooltip
                         listItem.addEventListener('click', (event) => {
                             event.stopPropagation(); // Prevent potential parent clicks
                             window.open(game.clip.video, '_blank');
                         });
                    } else {
                         listItem.style.cursor = 'default'; // Explicitly default cursor if no link
                    }
                    gameList.appendChild(listItem);
                    itemsAdded++;
                } else { console.warn(`[Day ${dayNumber}] Skipping list item for game with missing data:`, game); }
             });
             if (itemsAdded > 0) { dayCell.appendChild(gameList); } else { console.warn(`[Day ${dayNumber}] No valid game items added to list.`); }
            const initialGame = validGamesWithImages.length > 0 ? validGamesWithImages[0] : null; if (initialGame) { dayCell.style.backgroundImage = `url(${initialGame.background_image})`; dayCell.dataset.currentImageIndex = '0'; }
            if (validGamesWithImages.length > 1) {
                const intervalId = setInterval(() => { /* ... (slideshow logic unchanged) ... */ }, SLIDESHOW_INTERVAL); activeSlideshowIntervals.push({ id: intervalId, element: dayCell });
            }
        }
        calendarGrid.appendChild(dayCell);
   }

    // --- API Call Functions (Using Proxy) ---
    // REMOVED addApiParams helper function

    async function fetchGamesForMonth(year, month) {
        const firstDay = `${year}-${String(month + 1).padStart(2, '0')}-01`; const lastDayDate = new Date(year, month + 1, 0); const lastDay = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDayDate.getDate()).padStart(2, '0')}`;
        // Request fields needed including 'clip' for trailer
        const params = new URLSearchParams({ dates: `${firstDay},${lastDay}`, ordering: 'released,-added,-rating,-metacritic', page_size: 100, fields: 'id,name,released,background_image,metacritic,rating,platforms,short_screenshots,clip' });
        // REMOVED: params = addApiParams(params);
        const proxyUrl = `/.netlify/functions/rawg-proxy/games?${params.toString()}`;
        console.log("Fetching month games (via proxy):", proxyUrl.replace(/&key=[^&]+/, '&key=***HIDDEN***'));
        try {
            const response = await fetch(proxyUrl); if (!response.ok) { let e = `Proxy Error ${response.status}`; try{const d=await response.json();e=d.detail||d.error||e}catch(err){} throw new Error(`Fetch games failed: ${e}`); } const data = await response.json(); return data.results || [];
        } catch (error) { console.error('Fetch games failed:', error); throw error; }
    }

    async function fetchSuggestions(query) {
        if (!query) return [];
        // Request fields needed including 'clip' for trailer
        const params = new URLSearchParams({ search: query, page_size: 5, search_precise: 'true', fields: 'id,name,released,background_image,metacritic,rating,platforms,short_screenshots,clip' });
        // REMOVED: params = addApiParams(params);
        const proxyUrl = `/.netlify/functions/rawg-proxy/games?${params.toString()}`;
        console.log("Fetching suggestions (via proxy):", proxyUrl.replace(/&key=[^&]+/, '&key=***HIDDEN***'));
        try {
            const response = await fetch(proxyUrl); if (!response.ok) { console.error(`Suggestion fetch error: ${response.status}`); return []; } const data = await response.json(); return data.results || [];
        } catch (error) { console.error('Failed to fetch suggestions:', error); throw error; }
    }

    async function searchAndJumpToGame(query) {
        if (!query) return;
        const renderID = ++currentRenderID; showLoading();
        if(suggestionsContainer) { suggestionsContainer.style.display = 'none'; suggestionsContainer.innerHTML = ''; }

        // Request fields needed including 'clip' for trailer
        let params = new URLSearchParams({ search: query, page_size: 1, search_exact: 'true', fields: 'id,name,released,background_image,metacritic,rating,platforms,short_screenshots,clip' });
        // REMOVED: params = addApiParams(params);
        let proxyUrl = `/.netlify/functions/rawg-proxy/games?${params.toString()}`;

        let foundGame = null; let searchError = null;
        console.log(`[${renderID}] Starting search for "${query}"`);
        try {
            let response = await fetch(proxyUrl); let data = await response.json();
            if (!response.ok || !data.results || data.results.length === 0) {
                console.log(`[${renderID}] Exact search failed, trying broader...`);
                params = new URLSearchParams({ search: query, page_size: 1, fields: 'id,name,released,background_image,metacritic,rating,platforms,short_screenshots,clip' }); // Request fields
                // REMOVED: params = addApiParams(params);
                proxyUrl = `/.netlify/functions/rawg-proxy/games?${params.toString()}`;
                response = await fetch(proxyUrl); if (!response.ok) { let e = `Proxy Error ${response.status}`; try{const d=await response.json();e=d.detail||d.error||`Search Failed`} catch(err){} throw new Error(e); } data = await response.json();
            }
            if (data.results && data.results.length > 0) foundGame = data.results[0];
            console.log(`[${renderID}] Search fetch successful.`);
        } catch (error) { console.error(`[${renderID}] Search fetch error:`, error); searchError = error; }

        // Version check before processing result or calling renderCalendar
        if (renderID !== currentRenderID) { console.log(`[${renderID}] Search jump aborted (stale).`); return; }

        console.log(`[${renderID}] Processing search result...`);
        if (searchError) { alert(`Error searching for game: ${searchError.message}`); hideLoading(); }
        else if (foundGame) { console.log(`[${renderID}] Found game:`, foundGame.name, foundGame.released);
            if (foundGame.released) {
                const highlightDate = foundGame.released;
                try {
                    const releaseDate = new Date(highlightDate + 'T00:00:00'); const targetYear = releaseDate.getFullYear(); const targetMonth = releaseDate.getMonth();
                    if (!isNaN(targetYear) && !isNaN(targetMonth)) {
                         currentDate = new Date(targetYear, targetMonth, 1);
                         await renderCalendar(targetYear, targetMonth, highlightDate);
                    } else { throw new Error("Invalid date parsed."); }
                }
                catch (dateError) { console.error(`[${renderID}] Error parsing date for jump:`, dateError); alert(`Found '${foundGame.name}' but couldn't process its release date (${highlightDate}).`); hideLoading(); }
            } else { alert(`Found '${foundGame.name}' but it doesn't have a specific release date listed.`); hideLoading(); }
        } else { alert(`Game "${query}" not found.`); hideLoading(); }
    }
    // --- End Search and Jump ---

    // --- Suggestion Display Logic ---
    function displaySuggestions(games) { /* ... (Keep exact implementation) ... */ }
    function handleSuggestionClick(game) { /* ... (Keep exact implementation) ... */ }
    const debouncedFetchSuggestions = debounce(async (query) => { if(!searchInput?.value?.trim()) return; const games = await fetchSuggestions(query); displaySuggestions(games); }, SUGGESTION_DEBOUNCE_DELAY);

    // --- Date Seek Feature ---
    function handleSeek() { /* ... (Keep exact implementation) ... */ }

    // --- Helper Functions --- (Defined above)

    // REMOVED: debouncedRefetchCurrentView (no longer needed without NSFW toggle triggering refetch)

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