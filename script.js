document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM Loaded. Initializing Calendar...");

    // --- DOM Elements --- (Declare first)
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
    const seekYearInput = document.getElementById('seek-year'); // Corrected typo was fixed here
    const seekButton = document.getElementById('seek-button');

    // Add initial checks for essential elements
    if (!calendarGrid || !monthYearDisplay || !prevMonthButton || !nextMonthButton) {
        console.error("CRITICAL ERROR: Core calendar elements not found in the DOM. Aborting script.");
        alert("Error: Could not initialize calendar elements. Please check the HTML structure.");
        return; // Stop execution if essential elements are missing
    }
     // Add checks for other frequently used elements
    if (!loadingIndicator || !searchInput || !suggestionsContainer || !seekMonthSelect || !seekYearInput || !seekButton) {
        console.warn("Some non-critical elements for search/seek/loading/theme not found. Functionality may be limited.");
    }
     // NSFW toggle is optional
     if (!nsfwToggle) {
         console.warn("NSFW toggle element not found. NSFW filter functionality disabled.");
     }


    // --- State & Constants --- (Declare after elements)
    let currentDate = new Date();
    const MAX_GAMES_PER_DAY = 10;
    let activeSlideshowIntervals = []; // Stores { id: intervalId, element: dayCell }
    const SLIDESHOW_INTERVAL = 5000; // ms
    const FADE_DURATION = 700; // ms
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const SUGGESTION_DEBOUNCE_DELAY = 350; // ms
    let currentRenderID = 0; // Version counter for async operations
    let hideNsfw = true; // Default: Hide NSFW


    // --- Utility Functions --- (Define before main logic uses them)

    function debounce(func, delay) {
        let timeoutId;
        return function(...args) {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => func.apply(this, args), delay);
        };
    }

    // *** MOVED getMonthName here ***
    function getMonthName(monthIndex) {
        return monthNames[monthIndex];
    }

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

    function clearSlideshowIntervals() {
        activeSlideshowIntervals.forEach(intervalData => {
            clearInterval(intervalData.id);
            // Optional chaining for safer access to classList and style
            if (intervalData.element?.classList) {
                intervalData.element.classList.remove('is-fading');
                intervalData.element.style.removeProperty('--fade-bg-image');
            }
        });
        activeSlideshowIntervals = [];
    }

    // Groups fetched games by their release date
    // *** Ensure processGameData is defined BEFORE renderCalendar ***
    function processGameData(games) {
        console.log("Processing raw games data:", games);
        const gamesByDate = {};
        if (!games || games.length === 0) {
            console.log("Raw games array is empty or null.");
            return gamesByDate;
        }
        games.forEach(game => {
            if (game && game.released && game.name) {
                const releaseDate = game.released;
                if (!gamesByDate[releaseDate]) gamesByDate[releaseDate] = [];
                if (gamesByDate[releaseDate].length < MAX_GAMES_PER_DAY) {
                    if (!gamesByDate[releaseDate].some(existing => existing.id === game.id)) {
                        gamesByDate[releaseDate].push(game);
                    }
                }
            } else {
                console.warn("Skipping game during processing (missing data):", game);
            }
        });
         console.log("Processed gamesByDate object:", gamesByDate);
        return gamesByDate;
    }


    // --- API Call Functions (Using Proxy and NSFW filter) ---
    // Define these before they are called by renderCalendar/search functions

    // Helper to add common parameters including NSFW filter
    function addApiParams(params) {
         if (hideNsfw) {
             console.log("Adding NSFW filter: exclude_esrb_ratings=4");
             params.append('exclude_esrb_ratings', '4'); // Exclude Adults Only
         } else {
             console.log("NSFW filter is OFF.");
         }
         return params;
    }

    async function fetchGamesForMonth(year, month) {
        const firstDay = `${year}-${String(month + 1).padStart(2, '0')}-01`; const lastDayDate = new Date(year, month + 1, 0); const lastDay = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDayDate.getDate()).padStart(2, '0')}`;
        let params = new URLSearchParams({ dates: `${firstDay},${lastDay}`, ordering: 'released,-added,-rating,-metacritic', page_size: 100, fields: 'id,name,released,background_image,metacritic,rating,platforms,short_screenshots,clip,youtube' });
        params = addApiParams(params);
        const proxyUrl = `/.netlify/functions/rawg-proxy/games?${params.toString()}`; // ADJUST if not using Netlify functions root
        console.log("Fetching month games (via proxy):", proxyUrl.replace(/&key=[^&]+/, '&key=***HIDDEN***'));
        try {
            const response = await fetch(proxyUrl); if (!response.ok) { let e = `Proxy Error ${response.status}`; try{const d=await response.json();e=d.detail||d.error||e}catch(err){} throw new Error(`Fetch games failed: ${e}`); } const data = await response.json(); return data.results || [];
        } catch (error) { console.error('Fetch games failed:', error); throw error; }
    }

    async function fetchSuggestions(query) {
        if (!query) return [];
        let params = new URLSearchParams({ search: query, page_size: 5, search_precise: 'true', fields: 'id,name,released,background_image,metacritic,rating,platforms,short_screenshots,clip,youtube' });
        params = addApiParams(params);
        const proxyUrl = `/.netlify/functions/rawg-proxy/games?${params.toString()}`;
        console.log("Fetching suggestions (via proxy):", proxyUrl.replace(/&key=[^&]+/, '&key=***HIDDEN***'));
        try {
            const response = await fetch(proxyUrl); if (!response.ok) { console.error(`Suggestion fetch error: ${response.status}`); return []; } const data = await response.json(); return data.results || [];
        } catch (error) { console.error('Failed to fetch suggestions:', error); throw error; }
    }

    // --- Rendering Calendar ---
    // *** Ensure renderCalendar is defined after API calls and processGameData ***
    async function renderCalendar(year, month, highlightDate = null) {
        if (!calendarGrid || !monthYearDisplay || !seekMonthSelect || !seekYearInput) { console.error("Core elements missing!"); return; }
        const renderID = ++currentRenderID;
        console.log(`[${renderID}] Attempting to render ${getMonthName(month)} ${year}. Highlight: ${highlightDate || 'None'}. Hide NSFW: ${hideNsfw}`);
        showLoading();

        monthYearDisplay.textContent = `${getMonthName(month)} ${year}`;
        if (seekMonthSelect) seekMonthSelect.value = month;
        if (seekYearInput) seekYearInput.value = year;

        let gamesOfMonth = null; // Define here
        let fetchError = null; // Define here

        try {
            console.log(`[${renderID}] Starting fetch...`);
            gamesOfMonth = await fetchGamesForMonth(year, month);
            console.log(`[${renderID}] Fetch successful.`);
        } catch (error) {
            console.error(`[${renderID}] Fetch error:`, error);
            fetchError = error;
        }

        // --- Version check AFTER fetch but BEFORE processing/DOM manipulation ---
        if (renderID !== currentRenderID) {
            console.log(`[${renderID}] Discarding stale results (current is ${currentRenderID}).`);
            return;
        }

        // --- If this IS the latest, proceed with processing and rendering ---
        console.log(`[${renderID}] This is the latest request. Processing data and rendering...`);
        clearSlideshowIntervals(); // Clear old intervals
        calendarGrid.innerHTML = ''; // Clear grid content NOW

        // Clear previous search highlights (only if this is the latest render)
        document.querySelectorAll('.calendar-day.search-highlight').forEach(cell => { cell.classList.remove('search-highlight'); });

        let gamesByDate = {}; // Define and initialize here before the try block below

        try {
             // Handle fetch error here (if it occurred in this latest request)
            if (fetchError) {
                console.error(`[${renderID}] Throwing fetchError in render try block.`);
                throw fetchError; // This jumps to the catch block below
            }

            // If fetch succeeded (and was latest), process the data
            console.log(`[${renderID}] Before processGameData.`);
            gamesByDate = processGameData(gamesOfMonth || []); // Assign value here
            console.log(`[${renderID}] After processGameData. Games by date count: ${Object.keys(gamesByDate).length}`);


            // --- Build the Grid ---
            console.log(`[${renderID}] Starting grid build loops.`);
            const firstDayOfMonth = new Date(year, month, 1); const daysInMonth = new Date(year, month + 1, 0).getDate(); const startDayOfWeek = firstDayOfMonth.getDay();
            for (let i = 0; i < startDayOfWeek; i++) createDayCell(null, true);
            for (let day = 1; day <= daysInMonth; day++) {
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const gamesForDay = gamesByDate[dateStr] || []; // Access gamesByDate
                console.log(`[${renderID}] Rendering day ${day}. Games for this day:`, gamesForDay.length);
                createDayCell(day, false, gamesForDay, dateStr); // Pass dateStr
            }
            const totalCells = startDayOfWeek + daysInMonth; const remainingCells = (7 - (totalCells % 7)) % 7; for (let i = 0; i < remainingCells; i++) createDayCell(null, true);
            console.log(`[${renderID}] Grid build loops finished.`);

            // Apply Highlight if needed for this latest render
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
            // Display error in the grid (only happens if latest request failed fetch or processing)
            console.error(`[${renderID}] Render/Process error:`, error);
            clearSlideshowIntervals();
            calendarGrid.innerHTML = `<p style="color: red; grid-column: 1 / -1; text-align: center; padding: 20px;">${error.message || 'Failed to load game data.'}</p>`;

        } finally {
            // Crucially, hide loading indicator because this IS the latest operation finishing
            console.log(`[${renderID}] Finalizing render. Hiding loading.`);
            hideLoading();
        }
    }

    // Creates and appends the day cell element
    function createDayCell(dayNumber, isOtherMonth = false, gamesArray = [], dateStr = null) { /* ... (Keep exact implementation including trailer link) ... */ }

    // --- Search and Jump Feature ---
    async function searchAndJumpToGame(query) { /* ... (Keep exact implementation) ... */ }

    // --- Suggestion Display Logic ---
    function displaySuggestions(games) { /* ... (Keep exact implementation) ... */ }
    function handleSuggestionClick(game) { /* ... (Keep exact implementation) ... */ }
    const debouncedFetchSuggestions = debounce(async (query) => { if(!searchInput?.value?.trim()) return; const games = await fetchSuggestions(query); displaySuggestions(games); }, SUGGESTION_DEBOUNCE_DELAY);

    // --- Date Seek Feature ---
    function handleSeek() { /* ... (Keep exact implementation) ... */ }

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

    // Debounced function to re-render the current view after filter change
    const debouncedRefetchCurrentView = debounce(() => {
        if (currentDate) {
            renderCalendar(currentDate.getFullYear(), currentDate.getMonth());
        }
    }, 300); // Adjust delay as needed


    // --- Initial Load ---
    populateSeekControls();
    renderCalendar(currentDate.getFullYear(), currentDate.getMonth());

    console.log("Calendar script initialized.");

}); // End DOMContentLoaded