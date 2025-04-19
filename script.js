document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM Loaded. Initializing Calendar..."); // Debug Start

    // --- DOM Elements ---
    // Add checks to ensure elements exist on the page
    const calendarBody = document.querySelector('.calendar-body');
    const calendarGrid = document.getElementById('calendar-grid');
    const monthYearDisplay = document.getElementById('month-year');
    const prevMonthButton = document.getElementById('prev-month');
    const nextMonthButton = document.getElementById('next-month');
    const loadingIndicator = document.getElementById('loading-indicator');
    const themeToggle = document.getElementById('theme-toggle');
    const nsfwToggle = document.getElementById('nsfw-toggle');
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
    let hideNsfw = true;

    // Add initial checks for essential elements
    if (!calendarGrid || !monthYearDisplay || !prevMonthButton || !nextMonthButton) {
        console.error("CRITICAL ERROR: Core calendar elements not found in the DOM. Aborting script.");
        alert("Error: Could not initialize calendar elements. Please check the HTML structure.");
        return; // Stop execution if essential elements are missing
    }

    // --- Utility: Debounce ---
    function debounce(func, delay) {
        let timeoutId;
        return function(...args) { clearTimeout(timeoutId); timeoutId = setTimeout(() => { func.apply(this, args); }, delay); };
    }

    // --- Theme Management ---
    function applyTheme(theme) { document.body.classList.toggle('dark-mode', theme === 'dark'); if (themeToggle) themeToggle.checked = (theme === 'dark'); const containerRgb = getComputedStyle(document.body).getPropertyValue('--container-bg-rgb').trim() || '255, 255, 255'; if (loadingIndicator) loadingIndicator.style.backgroundColor = `rgba(${containerRgb}, 0.8)`; }
    function toggleTheme() { const newTheme = document.body.classList.contains('dark-mode') ? 'light' : 'dark'; localStorage.setItem('theme', newTheme); applyTheme(newTheme); }
    const savedTheme = localStorage.getItem('theme'); const prefersDark = !savedTheme && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches; applyTheme(savedTheme || (prefersDark ? 'dark' : 'light'));
    if (themeToggle) themeToggle.addEventListener('change', toggleTheme);

    // --- NSFW Filter Management ---
    function applyNsfwFilterState(shouldHide) { hideNsfw = shouldHide; if (nsfwToggle) nsfwToggle.checked = shouldHide; localStorage.setItem('hideNsfwPref', hideNsfw ? 'true' : 'false'); console.log("NSFW Filter Active:", hideNsfw); }
    function toggleNsfwFilter() { applyNsfwFilterState(!hideNsfw); debouncedRefetchCurrentView(); }
    const savedNsfwPref = localStorage.getItem('hideNsfwPref'); const initialHideNsfw = savedNsfwPref === null ? true : (savedNsfwPref === 'true'); applyNsfwFilterState(initialHideNsfw);
    if (nsfwToggle) nsfwToggle.addEventListener('change', toggleNsfwFilter);

    // --- Populate Seek Controls ---
    function populateSeekControls() { if (!seekMonthSelect || !seekYearInput) return; monthNames.forEach((name, index) => { const option = document.createElement('option'); option.value = index; option.textContent = name; seekMonthSelect.appendChild(option); }); seekMonthSelect.value = currentDate.getMonth(); seekYearInput.value = currentDate.getFullYear(); }

    // --- Calendar Logic ---
    function clearSlideshowIntervals() { activeSlideshowIntervals.forEach(intervalData => { clearInterval(intervalData.id); if (intervalData.element?.classList) { intervalData.element.classList.remove('is-fading'); intervalData.element.style.removeProperty('--fade-bg-image'); } }); activeSlideshowIntervals = []; }

    function showLoading() {
        if (!loadingIndicator) { console.warn("Loading indicator element not found."); return; } // Check added
        const containerRgb = getComputedStyle(document.body).getPropertyValue('--container-bg-rgb').trim() || '255, 255, 255';
        loadingIndicator.style.backgroundColor = `rgba(${containerRgb}, 0.8)`;
        const target = calendarBody || calendarGrid; // Prefer calendarBody
        if (target && !target.contains(loadingIndicator)) { target.appendChild(loadingIndicator); }
        loadingIndicator.style.display = 'flex';
        console.log("Loading shown."); // Debug log
    }

    function hideLoading() {
        if (loadingIndicator?.parentNode) { // Check added
            loadingIndicator.parentNode.removeChild(loadingIndicator);
        }
        if (loadingIndicator) { // Check added
            loadingIndicator.style.display = 'none';
        }
         console.log("Loading hidden."); // Debug log
    }

    function processGameData(games) { /* ... (Keep exact implementation from previous correct version) ... */ }

    async function renderCalendar(year, month, highlightDate = null) {
        const renderID = ++currentRenderID; // Get unique ID for this request
        console.log(`[${renderID}] Attempting to render ${getMonthName(month)} ${year}. Highlight: ${highlightDate}`);
        showLoading();

        // Update display text immediately
        monthYearDisplay.textContent = `${getMonthName(month)} ${year}`;
        if (seekMonthSelect) seekMonthSelect.value = month;
        if (seekYearInput) seekYearInput.value = year;

        let gamesOfMonth = null;
        let fetchError = null;

        try {
            gamesOfMonth = await fetchGamesForMonth(year, month);
            console.log(`[${renderID}] Fetch successful.`);
        } catch (error) {
            console.error(`[${renderID}] Fetch error:`, error);
            fetchError = error; // Store error
        }

        // *** VERSION CHECK: Only proceed if this is the latest request ***
        if (renderID !== currentRenderID) {
            console.log(`[${renderID}] Discarding stale results (current is ${currentRenderID}). Loading potentially hidden by newer request.`);
            // Do *not* hide loading here, let the latest request handle it.
            return;
        }

        // --- If latest, proceed with clearing and rendering ---
        console.log(`[${renderID}] This is the latest request. Processing...`);
        clearSlideshowIntervals();
        calendarGrid.innerHTML = ''; // Clear grid content NOW

        // Clear previous highlights regardless of fetch success (if latest)
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
            const firstDayOfMonth = new Date(year, month, 1);
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            const startDayOfWeek = firstDayOfMonth.getDay();

            for (let i = 0; i < startDayOfWeek; i++) createDayCell(null, true);
            for (let day = 1; day <= daysInMonth; day++) {
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const gamesForDay = gamesByDate[dateStr] || [];
                createDayCell(day, false, gamesForDay, dateStr);
            }
            const totalCells = startDayOfWeek + daysInMonth;
            const remainingCells = (7 - (totalCells % 7)) % 7;
            for (let i = 0; i < remainingCells; i++) createDayCell(null, true);

            // Apply highlight if requested for this latest render
            if (highlightDate) {
                 console.log(`[${renderID}] Applying highlight: ${highlightDate}`);
                 const targetCell = calendarGrid.querySelector(`.calendar-day[data-date="${highlightDate}"]`);
                 if (targetCell) {
                     targetCell.classList.add('search-highlight');
                     if (targetCell.scrollIntoView) targetCell.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                 } else {
                      console.warn(`[${renderID}] Highlight target cell not found.`);
                 }
            }
            console.log(`[${renderID}] Grid built successfully.`);

        } catch (error) {
            // Display error in the grid (only happens if latest request failed fetch/process)
            console.error(`[${renderID}] Render error:`, error);
            calendarGrid.innerHTML = `<p style="color: red; grid-column: 1 / -1; text-align: center; padding: 20px;">${error.message || 'Failed to load game data.'}</p>`;
        } finally {
            // **Crucially, hide loading indicator because this IS the latest operation finishing**
            console.log(`[${renderID}] Finalizing render. Hiding loading.`);
            hideLoading();
        }
    }

    // Creates and appends the day cell element
    function createDayCell(dayNumber, isOtherMonth = false, gamesArray = [], dateStr = null) { /* ... (Keep exact implementation from previous correct version) ... */ }

    // --- API Call Functions (Using Proxy) ---
    async function fetchGamesForMonth(year, month) { /* ... (Keep exact implementation) ... */ }
    async function fetchSuggestions(query) { /* ... (Keep exact implementation) ... */ }

    // --- Search and Jump Feature ---
    async function searchAndJumpToGame(query) {
        if (!query) return;
        const renderID = ++currentRenderID; // Assign ID for this specific search operation
        showLoading();
        if(suggestionsContainer) { suggestionsContainer.style.display = 'none'; suggestionsContainer.innerHTML = ''; }

        let params = new URLSearchParams({ search: query, page_size: 1, search_exact: 'true' });
        params = addApiParams(params); // Apply NSFW filter
        let proxyUrl = `/.netlify/functions/rawg-proxy/games?${params.toString()}`; // ADJUST if necessary
        let foundGame = null; let searchError = null;

        console.log(`[${renderID}] Starting search for "${query}"`);
        try {
            let response = await fetch(proxyUrl); let data = await response.json();
            // Try broader search if exact fails
            if (!response.ok || !data.results || data.results.length === 0) {
                console.log(`[${renderID}] Exact search failed, trying broader...`);
                params = new URLSearchParams({ search: query, page_size: 1 });
                params = addApiParams(params); // Apply filter again
                proxyUrl = `/.netlify/functions/rawg-proxy/games?${params.toString()}`; // ADJUST if necessary
                response = await fetch(proxyUrl);
                if (!response.ok) { let e = `Proxy Error ${response.status}`; try{const d=await response.json();e=d.detail||d.error||`Search Failed`} catch(err){} throw new Error(e); }
                data = await response.json();
            }
            if (data.results && data.results.length > 0) foundGame = data.results[0];
        } catch (error) {
            console.error(`[${renderID}] Search fetch error:`, error); searchError = error;
        }

        // *** VERSION CHECK before processing result or calling renderCalendar ***
        if (renderID !== currentRenderID) {
            console.log(`[${renderID}] Search jump aborted (stale). Loading potentially hidden by newer op.`);
            return;
        }

        // --- Process result if this is the latest search ---
        console.log(`[${renderID}] Processing search result...`);
        if (searchError) {
            alert(`Error searching for game: ${searchError.message}`);
            hideLoading(); // Hide loading on definitive error
        } else if (foundGame) {
            console.log(`[${renderID}] Found game: ${foundGame.name}`);
            if (foundGame.released) {
                const highlightDate = foundGame.released;
                try {
                    const releaseDate = new Date(highlightDate + 'T00:00:00');
                    const targetYear = releaseDate.getFullYear(); const targetMonth = releaseDate.getMonth();
                    if (!isNaN(targetYear) && !isNaN(targetMonth)) {
                        currentDate = new Date(targetYear, targetMonth, 1);
                        // Call renderCalendar, let it handle loading indicator based on its *new* renderID
                        await renderCalendar(targetYear, targetMonth, highlightDate);
                    } else { throw new Error("Invalid date parsed from search result."); }
                } catch (dateError) {
                    console.error(`[${renderID}] Error parsing date for jump:`, dateError);
                    alert(`Found '${foundGame.name}' but couldn't process its release date (${highlightDate}).`);
                    hideLoading(); // Hide loading as jump failed
                }
            } else {
                alert(`Found '${foundGame.name}' but it has no specific release date listed.`);
                hideLoading(); // Hide loading as can't jump
            }
        } else {
            alert(`Game "${query}" not found.`);
            hideLoading(); // Hide loading as not found
        }
    }
    // --- End Search and Jump ---

    // --- Suggestion Display Logic ---
    function displaySuggestions(games) { /* ... (Keep exact implementation) ... */ }
    function handleSuggestionClick(game) { /* ... (Keep exact implementation) ... */ }
    const debouncedFetchSuggestions = debounce(async (query) => { if(!searchInput.value.trim()) return; const games = await fetchSuggestions(query); displaySuggestions(games); }, SUGGESTION_DEBOUNCE_DELAY);

    // --- Date Seek Feature ---
    function handleSeek() {
        if (!seekMonthSelect || !seekYearInput) return; // Add checks
        const selectedMonth = parseInt(seekMonthSelect.value, 10); const enteredYear = parseInt(seekYearInput.value, 10);
        if (isNaN(selectedMonth) || isNaN(enteredYear) || enteredYear < 1970 || enteredYear > 2100) { alert("Please enter a valid month and year (e.g., 1970-2100)."); return; }
        currentDate = new Date(enteredYear, selectedMonth, 1);
        if (searchInput) searchInput.value = ''; // Clear search
        if (suggestionsContainer) { suggestionsContainer.style.display = 'none'; suggestionsContainer.innerHTML = ''; } // Clear suggestions
        renderCalendar(currentDate.getFullYear(), currentDate.getMonth()); // Render new date (no highlight)
    }

    // --- Helper Functions ---
    function getMonthName(monthIndex) { return monthNames[monthIndex]; }
    // showLoading/hideLoading defined above

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
    populateSeekControls();
    renderCalendar(currentDate.getFullYear(), currentDate.getMonth());

}); // End DOMContentLoaded