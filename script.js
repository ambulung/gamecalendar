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
    const nsfwToggle = document.getElementById('nsfw-toggle'); // Ensure this element exists
    const searchInput = document.getElementById('search-input');
    const suggestionsContainer = document.getElementById('search-suggestions');
    const seekMonthSelect = document.getElementById('seek-month');
    const seekYearInput = document.getElementById('seek-year');
    const seekButton = document.getElementById('seek-button');

    // Add initial checks for essential elements
    if (!calendarGrid || !monthYearDisplay || !prevMonthButton || !nextMonthButton) {
        console.error("CRITICAL ERROR: Core calendar elements not found in the DOM. Aborting script.");
        alert("Error: Could not initialize calendar elements. Please check the HTML structure.");
        return;
    }

    // --- State & Constants ---
    let currentDate = new Date();
    const MAX_GAMES_PER_DAY = 10;
    let activeSlideshowIntervals = [];
    const SLIDESHOW_INTERVAL = 5000;
    const FADE_DURATION = 700;
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const SUGGESTION_DEBOUNCE_DELAY = 350;
    let currentRenderID = 0;
    let hideNsfw = true; // Default state

    // --- Utility: Debounce ---
    function debounce(func, delay) {
        let timeoutId;
        return function(...args) {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
                func.apply(this, args);
            }, delay);
        };
    }

    // --- Theme Management ---
    function applyTheme(theme) { document.body.classList.toggle('dark-mode', theme === 'dark'); if (themeToggle) themeToggle.checked = (theme === 'dark'); const containerRgb = getComputedStyle(document.body).getPropertyValue('--container-bg-rgb').trim() || '255, 255, 255'; if (loadingIndicator) loadingIndicator.style.backgroundColor = `rgba(${containerRgb}, 0.8)`; }
    function toggleTheme() { const newTheme = document.body.classList.contains('dark-mode') ? 'light' : 'dark'; localStorage.setItem('theme', newTheme); applyTheme(newTheme); }
    const savedTheme = localStorage.getItem('theme'); const prefersDark = !savedTheme && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches; applyTheme(savedTheme || (prefersDark ? 'dark' : 'light'));
    if (themeToggle) themeToggle.addEventListener('change', toggleTheme);

    // --- NSFW Filter Management (Added Debugging) ---
    function applyNsfwFilterState(shouldHide) {
        hideNsfw = shouldHide;
        if (nsfwToggle) {
            nsfwToggle.checked = shouldHide;
        }
        localStorage.setItem('hideNsfwPref', hideNsfw ? 'true' : 'false');
        console.log("NSFW Filter State Set:", hideNsfw ? "Hide NSFW" : "Show NSFW"); // Debug log
    }

    function toggleNsfwFilter() {
        console.log("NSFW Toggle clicked."); // Debug log
        applyNsfwFilterState(!hideNsfw); // Toggle the state
        debouncedRefetchCurrentView(); // Re-render with the new state
    }

    // Initialize NSFW Filter state from localStorage or default
    const savedNsfwPref = localStorage.getItem('hideNsfwPref');
    // If savedPref is 'false', hideNsfw should be false. Otherwise, true (default hide).
    const initialHideNsfw = savedNsfwPref === 'false' ? false : true;
    applyNsfwFilterState(initialHideNsfw); // Apply on load

    if (nsfwToggle) { // Add check
        nsfwToggle.addEventListener('change', toggleNsfwFilter);
    }
    // --- End NSFW Filter Management ---


    // --- Populate Seek Controls ---
    function populateSeekControls() { if (!seekMonthSelect || !seekYearInput) return; monthNames.forEach((name, index) => { const option = document.createElement('option'); option.value = index; option.textContent = name; seekMonthSelect.appendChild(option); }); seekMonthSelect.value = currentDate.getMonth(); seekYearInput.value = currentDate.getFullYear(); }

    // --- Calendar Logic ---
    function clearSlideshowIntervals() { activeSlideshowIntervals.forEach(intervalData => { clearInterval(intervalData.id); if (intervalData.element?.classList) { intervalData.element.classList.remove('is-fading'); intervalData.element.style.removeProperty('--fade-bg-image'); } }); activeSlideshowIntervals = []; }

    function showLoading() {
        if (!loadingIndicator) { console.warn("Loading indicator element not found."); return; }
        const containerRgb = getComputedStyle(document.body).getPropertyValue('--container-bg-rgb').trim() || '255, 255, 255';
        loadingIndicator.style.backgroundColor = `rgba(${containerRgb}, 0.8)`;
        const target = calendarBody || calendarGrid;
        if (target && !target.contains(loadingIndicator)) { target.appendChild(loadingIndicator); }
        loadingIndicator.style.display = 'flex';
        console.log("Loading shown.");
    }

    function hideLoading() {
        if (loadingIndicator?.parentNode) {
            loadingIndicator.parentNode.removeChild(loadingIndicator);
        }
        if (loadingIndicator) {
            loadingIndicator.style.display = 'none';
        }
        console.log("Loading hidden.");
    }

    function processGameData(games) { /* ... (Keep exact implementation) ... */ }

    async function renderCalendar(year, month, highlightDate = null) {
        if (!calendarGrid || !monthYearDisplay || !seekMonthSelect || !seekYearInput) { console.error("Core elements missing!"); return; }
        const renderID = ++currentRenderID;
        console.log(`[${renderID}] Attempting to render ${getMonthName(month)} ${year}. Highlight: ${highlightDate || 'None'}. Hide NSFW: ${hideNsfw}`); // Debug log

        // Check if a newer render is already underway before showing loading/clearing grid
        // This helps prevent flickering if clicks are *extremely* rapid
        // We show loading *immediately* in the calling function (e.g., handleSeek, toggleNsfwFilter)
        // We hide loading *only* if this renderID is the latest in the finally block

        // Update display text immediately
        monthYearDisplay.textContent = `${getMonthName(month)} ${year}`;
        if (seekMonthSelect) seekMonthSelect.value = month;
        if (seekYearInput) seekYearInput.value = year;

        let gamesByDate = {};
        let fetchError = null;

        try {
            console.log(`[${renderID}] Starting fetch... (Hide NSFW: ${hideNsfw})`);
            gamesOfMonth = await fetchGamesForMonth(year, month); // Fetch applies NSFW filter
            console.log(`[${renderID}] Fetch successful.`);
        } catch (error) {
            console.error(`[${renderID}] Fetch error:`, error);
            fetchError = error; // Store error
        }

        // *** VERSION CHECK: Only proceed with DOM manipulation if this is the latest request ***
        if (renderID !== currentRenderID) {
            console.log(`[${renderID}] Discarding stale results (current is ${currentRenderID}).`);
            return; // Exit without touching the DOM or hiding loading
        }

        // --- If this IS the latest, proceed with clearing and rendering ---
        console.log(`[${renderID}] This is the latest request. Processing data and rendering...`);
        clearSlideshowIntervals(); // Clear old intervals
        calendarGrid.innerHTML = ''; // Clear grid content NOW

        // Clear previous search highlights (only if this is the latest render)
        document.querySelectorAll('.calendar-day.search-highlight').forEach(cell => {
            cell.classList.remove('search-highlight');
        });

        try {
            // If fetch failed in this *latest* request, throw the error now
            if (fetchError) {
                throw fetchError;
            }

            // If fetch succeeded, process and render
            const gamesByDate = processGameData(gamesOfMonth || []);
            const firstDayOfMonth = new Date(year, month, 1); const daysInMonth = new Date(year, month + 1, 0).getDate(); const startDayOfWeek = firstDayOfMonth.getDay();
            for (let i = 0; i < startDayOfWeek; i++) createDayCell(null, true);
            for (let day = 1; day <= daysInMonth; day++) { const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`; const gamesForDay = gamesByDate[dateStr] || []; createDayCell(day, false, gamesForDay, dateStr); }
            const totalCells = startDayOfWeek + daysInMonth; const remainingCells = (7 - (totalCells % 7)) % 7; for (let i = 0; i < remainingCells; i++) createDayCell(null, true);

            // Apply highlight if requested for this latest render
            if (highlightDate) {
                 console.log(`[${renderID}] Attempting to highlight date: ${highlightDate}`);
                 const targetCell = calendarGrid.querySelector(`.calendar-day[data-date="${highlightDate}"]`);
                 if (targetCell) {
                     targetCell.classList.add('search-highlight');
                     if (targetCell.scrollIntoView) targetCell.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                     console.log(`[${renderID}] Highlight applied.`);
                 } else { console.warn(`[${renderID}] Target cell for highlight not found.`); }
            }
            console.log(`[${renderID}] Grid built successfully.`);

        } catch (error) {
            // Display error in the grid (only happens if latest request failed fetch/process)
            console.error(`[${renderID}] Render error:`, error);
            // Ensure grid is clear before showing error
            clearSlideshowIntervals(); // Clear intervals just in case
            calendarGrid.innerHTML = `<p style="color: red; grid-column: 1 / -1; text-align: center; padding: 20px;">${error.message || 'Failed to load game data.'}</p>`;

        } finally {
            // **Crucially, hide loading indicator because this IS the latest operation finishing**
            console.log(`[${renderID}] Finalizing render. Hiding loading.`);
            hideLoading();
        }
    }

    // Creates and appends the day cell element
    function createDayCell(dayNumber, isOtherMonth = false, gamesArray = [], dateStr = null) { /* ... (Keep exact implementation from previous correct version) ... */ }

    // --- API Call Functions (Using Proxy and NSFW filter - Added Debugging) ---
    function addApiParams(params) {
         if (hideNsfw) {
             console.log("Adding NSFW filter: exclude_esrb_ratings=4"); // Debug log
             params.append('exclude_esrb_ratings', '4'); // Exclude Adults Only
         } else {
             console.log("NSFW filter is OFF."); // Debug log
         }
         return params;
    }

    async function fetchGamesForMonth(year, month) {
        const firstDay = `${year}-${String(month + 1).padStart(2, '0')}-01`;
        const lastDayDate = new Date(year, month + 1, 0);
        const lastDay = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDayDate.getDate()).padStart(2, '0')}`;
        let params = new URLSearchParams({ dates: `${firstDay},${lastDay}`, ordering: 'released,-added,-rating,-metacritic', page_size: 100 });
        params = addApiParams(params);
        const proxyUrl = `/.netlify/functions/rawg-proxy/games?${params.toString()}`; // ADJUST if not using Netlify functions root
        console.log("Fetching month games (via proxy):", proxyUrl.replace(/&key=[^&]+/, '&key=***HIDDEN***')); // Log sanitized URL
        try {
            const response = await fetch(proxyUrl); if (!response.ok) { let e = `Proxy Error ${response.status}`; try{const d=await response.json();e=d.detail||d.error||e}catch(err){} throw new Error(`Fetch games failed: ${e}`); } const data = await response.json(); return data.results || [];
        } catch (error) { console.error('Fetch games failed:', error); throw error; }
    }

    async function fetchSuggestions(query) {
        if (!query) return [];
        let params = new URLSearchParams({ search: query, page_size: 5, search_precise: 'true' });
        params = addApiParams(params); // Apply filter
        const proxyUrl = `/.netlify/functions/rawg-proxy/games?${params.toString()}`; // ADJUST if not using Netlify functions root
        console.log("Fetching suggestions (via proxy):", proxyUrl.replace(/&key=[^&]+/, '&key=***HIDDEN***')); // Log sanitized URL
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
        params = addApiParams(params);
        let proxyUrl = `/.netlify/functions/rawg-proxy/games?${params.toString()}`; // ADJUST if necessary

        let foundGame = null; let searchError = null;

        console.log(`[${renderID}] Starting search for "${query}" (Hide NSFW: ${hideNsfw})`);
        try {
            let response = await fetch(proxyUrl); let data = await response.json();
            // Try broader search if exact fails
            if (!response.ok || !data.results || data.results.length === 0) {
                console.log(`[${renderID}] Exact search failed, trying broader...`);
                params = new URLSearchParams({ search: query, page_size: 1 });
                params = addApiParams(params); // Apply filter again
                proxyUrl = `/.netlify/functions/rawg-proxy/games?${params.toString()}`; // ADJUST if necessary
                response = await fetch(proxyUrl); if (!response.ok) { let e = `Proxy Error ${response.status}`; try{const d=await response.json();e=d.detail||d.error||`Search Failed`} catch(err){} throw new Error(e); } data = await response.json();
            }
            if (data.results && data.results.length > 0) foundGame = data.results[0];
            console.log(`[${renderID}] Search fetch successful.`);
        } catch (error) { console.error(`[${renderID}] Search fetch error:`, error); searchError = error; }

        // *** VERSION CHECK before processing result or calling renderCalendar ***
        if (renderID !== currentRenderID) { console.log(`[${renderID}] Search jump aborted (stale).`); return; }

        // --- Process result if this is the latest search ---
        console.log(`[${renderID}] Processing search result...`);
        if (searchError) {
            alert(`Error searching for game: ${searchError.message}`);
            hideLoading(); // Hide loading on definitive error for latest op
        } else if (foundGame) {
            console.log(`[${renderID}] Found game: ${foundGame.name}, Released: ${foundGame.released}`);
            if (foundGame.released) {
                const highlightDate = foundGame.released;
                try {
                    const releaseDate = new Date(highlightDate + 'T00:00:00'); const targetYear = releaseDate.getFullYear(); const targetMonth = releaseDate.getMonth();
                    if (!isNaN(targetYear) && !isNaN(targetMonth)) {
                         currentDate = new Date(targetYear, targetMonth, 1);
                         // Call renderCalendar, let it manage state based on its ID
                         await renderCalendar(targetYear, targetMonth, highlightDate); // Pass highlight date
                    } else { throw new Error("Invalid date parsed."); }
                }
                catch (dateError) { console.error(`[${renderID}] Error parsing date for jump:`, dateError); alert(`Found '${foundGame.name}' but couldn't process its release date (${highlightDate}).`); hideLoading(); }
            } else { alert(`Found '${foundGame.name}' but it doesn't have a specific release date listed.`); hideLoading(); }
        } else { alert(`Game "${query}" not found.`); hideLoading(); }
    }
    // --- End Search and Jump ---

    // --- Suggestion Display Logic ---
    function displaySuggestions(games) { if (!suggestionsContainer) return; suggestionsContainer.innerHTML = ''; if (!games || games.length === 0) { suggestionsContainer.style.display = 'none'; return; } games.forEach(game => { const div = document.createElement('div'); div.classList.add('suggestion-item'); div.textContent = game.name; if (game.released) { const year = game.released.substring(0, 4); const yearSpan = document.createElement('small'); yearSpan.textContent = ` (${year})`; div.appendChild(yearSpan); } div.dataset.gameData = JSON.stringify(game); div.addEventListener('click', () => handleSuggestionClick(game)); suggestionsContainer.appendChild(div); }); suggestionsContainer.style.display = 'block'; }
    function handleSuggestionClick(game) { if (!searchInput || !suggestionsContainer) return; searchInput.value = game.name; suggestionsContainer.style.display = 'none'; suggestionsContainer.innerHTML = ''; searchAndJumpToGame(game.name); }
    const debouncedFetchSuggestions = debounce(async (query) => { if(!searchInput.value.trim()) return; const games = await fetchSuggestions(query); displaySuggestions(games); }, SUGGESTION_DEBOUNCE_DELAY);

    // --- Date Seek Feature ---
    function handleSeek() {
        if (!seekMonthSelect || !seekYearInput) return;
        const selectedMonth = parseInt(seekMonthSelect.value, 10); const enteredYear = parseInt(seekYearInput.value, 10);
        if (isNaN(selectedMonth) || isNaN(enteredYear) || enteredYear < 1970 || enteredYear > 2100) { alert("Please enter a valid month and year (e.g., 1970-2100)."); return; }
        currentDate = new Date(enteredYear, selectedMonth, 1);
        if (searchInput) searchInput.value = ''; if (suggestionsContainer) { suggestionsContainer.style.display = 'none'; suggestionsContainer.innerHTML = ''; }
        renderCalendar(currentDate.getFullYear(), currentDate.getMonth()); // Render new date (no highlight)
    }
    // --- End Date Seek ---

    // --- Helper Functions ---
    function getMonthName(monthIndex) { return monthNames[monthIndex]; }

    // Debounced function to re-render the current view after filter change
    const debouncedRefetchCurrentView = debounce(() => {
        if (currentDate) {
            renderCalendar(currentDate.getFullYear(), currentDate.getMonth());
        }
    }, 300); // Adjust delay as needed

    // --- Event Listeners (Add checks for element existence) ---
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
    renderCalendar(currentDate.getFullYear(), currentDate.getMonth()); // Initial render uses initial NSFW state

    console.log("Calendar script initialized.");

}); // End DOMContentLoaded