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
    const nsfwToggle = document.getElementById('nsfw-toggle');
    const searchInput = document.getElementById('search-input');
    const suggestionsContainer = document.getElementById('search-suggestions');
    const seekMonthSelect = document.getElementById('seek-month');
    const seekYearInput = document.getElementById('seek-year');
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


    // --- State & Constants ---
    let currentDate = new Date();
    const MAX_GAMES_PER_DAY = 10;
    let activeSlideshowIntervals = [];
    const SLIDESHOW_INTERVAL = 5000;
    const FADE_DURATION = 700;
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const SUGGESTION_DEBOUNCE_DELAY = 350;
    let currentRenderID = 0; // Version counter for async operations
    let hideNsfw = true; // Default: Hide NSFW

    // --- Utility: Debounce ---
    function debounce(func, delay) {
        let timeoutId;
        return function(...args) {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => func.apply(this, args), delay);
        };
    }

    // --- Theme Management ---
    function applyTheme(theme) { document.body.classList.toggle('dark-mode', theme === 'dark'); if (themeToggle) themeToggle.checked = (theme === 'dark'); const containerRgb = getComputedStyle(document.body).getPropertyValue('--container-bg-rgb').trim() || '255, 255, 255'; if (loadingIndicator) loadingIndicator.style.backgroundColor = `rgba(${containerRgb}, 0.8)`; }
    function toggleTheme() { const newTheme = document.body.classList.contains('dark-mode') ? 'light' : 'dark'; localStorage.setItem('theme', newTheme); applyTheme(newTheme); }
    const savedTheme = localStorage.getItem('theme'); const prefersDark = !savedTheme && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches; applyTheme(savedTheme || (prefersDark ? 'dark' : 'light'));
    if (themeToggle) themeToggle.addEventListener('change', toggleTheme);

    // --- NSFW Filter Management ---
    function applyNsfwFilterState(shouldHide) {
        hideNsfw = shouldHide;
        if (nsfwToggle) {
            nsfwToggle.checked = shouldHide;
        }
        localStorage.setItem('hideNsfwPref', hideNsfw ? 'true' : 'false');
        console.log("NSFW Filter State Set:", hideNsfw ? "Hide NSFW" : "Show NSFW");
    }

    function toggleNsfwFilter() {
        console.log("NSFW Toggle clicked.");
        applyNsfwFilterState(!hideNsfw);
        // Re-render the current view with the new filter setting
        debouncedRefetchCurrentView(); // Uses debounced call
    }

    // Initialize NSFW Filter state from localStorage or default
    const savedNsfwPref = localStorage.getItem('hideNsfwPref');
    const initialHideNsfw = savedNsfwPref === 'false' ? false : true; // Default is true (hide)
    applyNsfwFilterState(initialHideNsfw);

    if (nsfwToggle) {
        nsfwToggle.addEventListener('change', toggleNsfwFilter);
    }
    // --- End NSFW Filter Management ---


    // --- Populate Seek Controls ---
    function populateSeekControls() {
        if (!seekMonthSelect || !seekYearInput) return;
        monthNames.forEach((name, index) => {
            const option = document.createElement('option'); option.value = index; option.textContent = name; seekMonthSelect.appendChild(option);
        });
        seekMonthSelect.value = currentDate.getMonth();
        seekYearInput.value = currentDate.getFullYear();
    }

    // --- Calendar Logic ---
    function clearSlideshowIntervals() {
        activeSlideshowIntervals.forEach(intervalData => { clearInterval(intervalData.id); if (intervalData.element?.classList) { intervalData.element.classList.remove('is-fading'); intervalData.element.style.removeProperty('--fade-bg-image'); } }); activeSlideshowIntervals = [];
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

    // Groups fetched games by their release date
    function processGameData(games) {
        console.log("Processing raw games data:", games); // Debug log: What does the raw games array look like?
        const gamesByDate = {};
        if (!games || games.length === 0) {
            console.log("Raw games array is empty or null."); // Debug log
            return gamesByDate;
        }

        games.forEach(game => {
            // Ensure the game has the necessary properties
            if (game && game.released && game.name) {
                const releaseDate = game.released; // Format: YYYY-MM-DD

                if (!gamesByDate[releaseDate]) {
                    gamesByDate[releaseDate] = []; // Initialize array
                }

                // Add game to the array for that date, respecting the limit
                if (gamesByDate[releaseDate].length < MAX_GAMES_PER_DAY) {
                    // Basic duplicate check
                    if (!gamesByDate[releaseDate].some(existing => existing.id === game.id)) {
                         gamesByDate[releaseDate].push(game);
                    }
                }
            } else {
                console.warn("Skipping game during processing (missing data):", game); // Debug log: Identify problematic game objects
            }
        });
         console.log("Processed gamesByDate object:", gamesByDate); // Debug log: What does the final object look like?
        return gamesByDate;
    }

    // --- Refined renderCalendar Structure ---
    async function renderCalendar(year, month, highlightDate = null) {
        if (!calendarGrid || !monthYearDisplay || !seekMonthSelect || !seekYearInput) { console.error("Core elements missing!"); return; }
        const renderID = ++currentRenderID;
        console.log(`[${renderID}] Attempting to render ${getMonthName(month)} ${year}. Highlight: ${highlightDate || 'None'}. Hide NSFW: ${hideNsfw}`);
        showLoading();

        monthYearDisplay.textContent = `${getMonthName(month)} ${year}`;
        if (seekMonthSelect) seekMonthSelect.value = month;
        if (seekYearInput) seekYearInput.value = year;

        let gamesByDate = {}; // Define gamesByDate BEFORE fetch
        let fetchError = null;

        try {
            console.log(`[${renderID}] Starting fetch...`);
            const gamesOfMonth = await fetchGamesForMonth(year, month); // Fetch applies filter
            console.log(`[${renderID}] Fetch successful.`);

             // *** Version check AFTER fetch but BEFORE processing/DOM manipulation ***
            if (renderID !== currentRenderID) {
                console.log(`[${renderID}] Discarding stale results (current is ${currentRenderID}).`);
                return; // Exit without touching the DOM or hiding loading
            }

            // --- If this IS the latest, process data ---
            console.log(`[${renderID}] This is the latest request. Processing data...`);
            gamesByDate = processGameData(gamesOfMonth || []); // Assign value here

            // --- Proceed to Render the Grid ---
            console.log(`[${renderID}] Rendering grid...`);
            clearSlideshowIntervals(); // Clear old intervals
            calendarGrid.innerHTML = ''; // Clear grid content NOW

            // Clear previous search highlights (only if this is the latest render)
            document.querySelectorAll('.calendar-day.search-highlight').forEach(cell => { cell.classList.remove('search-highlight'); });

            const firstDayOfMonth = new Date(year, month, 1); const daysInMonth = new Date(year, month + 1, 0).getDate(); const startDayOfWeek = firstDayOfMonth.getDay();
            for (let i = 0; i < startDayOfWeek; i++) createDayCell(null, true);
            for (let day = 1; day <= daysInMonth; day++) {
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const gamesForDay = gamesByDate[dateStr] || []; // Access gamesByDate
                console.log(`[${renderID}] Rendering day ${day}. Games for this day:`, gamesForDay.length); // Debug log
                createDayCell(day, false, gamesForDay, dateStr); // Pass dateStr for data-date
            }
            const totalCells = startDayOfWeek + daysInMonth; const remainingCells = (7 - (totalCells % 7)) % 7; for (let i = 0; i < remainingCells; i++) createDayCell(null, true);

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
            // Display error in the grid (only happens if latest request failed fetch/process)
            console.error(`[${renderID}] Render/Process error:`, error);
            clearSlideshowIntervals(); // Clear intervals just in case
            calendarGrid.innerHTML = `<p style="color: red; grid-column: 1 / -1; text-align: center; padding: 20px;">${error.message || 'Failed to load game data.'}</p>`;

        } finally {
            // **Crucially, hide loading indicator because this IS the latest operation finishing**
            console.log(`[${renderID}] Finalizing render. Hiding loading.`);
            hideLoading();
        }
    }

    // Creates and appends the day cell element
    function createDayCell(dayNumber, isOtherMonth = false, gamesArray = [], dateStr = null) {
        if (!calendarGrid) { console.warn("calendarGrid not found in createDayCell."); return; } // Added check

        const dayCell = document.createElement('div'); dayCell.classList.add('calendar-day'); dayCell.dataset.day = dayNumber; if (isOtherMonth) dayCell.classList.add('other-month');
        if (!isOtherMonth && dayNumber !== null && dateStr) { dayCell.dataset.date = dateStr; } // data-date
        const daySpan = document.createElement('div'); daySpan.classList.add('day-number'); daySpan.textContent = dayNumber !== null ? dayNumber : ''; dayCell.appendChild(daySpan);
        const validGamesWithImages = gamesArray.filter(g => g && g.background_image); // Filter for images
        console.log(`[Day ${dayNumber}] Creating cell. Input games: ${gamesArray.length}, Valid images: ${validGamesWithImages.length}`); // Debug log

        if (!isOtherMonth && gamesArray.length > 0) { // Check if there are ANY games for the day
            dayCell.classList.add('has-game');
            const gameList = document.createElement('ul'); gameList.classList.add('game-list');
            let itemsAdded = 0; // Counter for games actually added to the list
            gamesArray.forEach(game => { // Iterate through games for this day
                if (game && game.name) { // Check game object and name exist
                    const listItem = document.createElement('li'); listItem.classList.add('game-list-item'); listItem.textContent = game.name;
                    listItem.title = `${game.name}\nReleased: ${game.released || 'N/A'}\nRating: ${game.rating || 'N/A'} / 5\nMetacritic: ${game.metacritic || 'N/A'}`;
                    // Add Click Listener for Trailer
                    if (game.clip?.video) { // Use optional chaining for safety
                         listItem.style.cursor = 'pointer';
                         listItem.title += `\nTrailer Available!`;
                         listItem.addEventListener('click', (event) => {
                             event.stopPropagation();
                             window.open(game.clip.video, '_blank');
                         });
                    }
                    gameList.appendChild(listItem);
                    itemsAdded++;
                } else {
                     console.warn(`[Day ${dayNumber}] Skipping list item for game with missing data:`, game); // Debug log
                }
             });

             if (itemsAdded > 0) { // Append list only if items were actually added
                dayCell.appendChild(gameList);
             } else {
                 // If gamesArray had objects but none were valid for list items, remove has-game?
                 // Or just leave it, the empty list won't show. Keeping has-game might be fine.
                 console.warn(`[Day ${dayNumber}] No valid game items added to list despite gamesArray having length > 0.`); // Debug log
             }


            const initialGame = validGamesWithImages.length > 0 ? validGamesWithImages[0] : null; if (initialGame) { dayCell.style.backgroundImage = `url(${initialGame.background_image})`; dayCell.dataset.currentImageIndex = '0'; }
            if (validGamesWithImages.length > 1) {
                const intervalId = setInterval(() => { const style = window.getComputedStyle(dayCell); if (!document.body.contains(dayCell) || style.display === 'none') { clearInterval(intervalId); activeSlideshowIntervals = activeSlideshowIntervals.filter(item => item.id !== intervalId); return; } if (dayCell.classList.contains('is-fading')) return; let currentIndex = parseInt(dayCell.dataset.currentImageIndex || '0', 10); const nextIndex = (currentIndex + 1) % validGamesWithImages.length; const nextGame = validGamesWithImages[nextIndex]; if (!nextGame || !nextGame.background_image) { dayCell.dataset.currentImageIndex = String(nextIndex); return; } const nextImageUrl = `url(${nextGame.background_image})`; dayCell.style.setProperty('--fade-bg-image', nextImageUrl); dayCell.classList.add('is-fading'); setTimeout(() => { if (!document.body.contains(dayCell) || !dayCell.classList.contains('is-fading')) { if (dayCell.classList) { dayCell.classList.remove('is-fading'); dayCell.style.removeProperty('--fade-bg-image'); } return; } dayCell.style.backgroundImage = nextImageUrl; dayCell.classList.remove('is-fading'); dayCell.dataset.currentImageIndex = String(nextIndex); }, FADE_DURATION); }, SLIDESHOW_INTERVAL); activeSlideshowIntervals.push({ id: intervalId, element: dayCell });
            } else if (gamesArray.length > 0) {
                 console.log(`[Day ${dayNumber}] Only one or no games with images available for slideshow.`); // Debug log
            }
        } else if (!isOtherMonth && gamesArray.length === 0) {
             console.log(`[Day ${dayNumber}] No games for this day.`); // Debug log
        } else if (isOtherMonth) {
             console.log(`[Day ${dayNumber}] Other month day.`); // Debug log
        }

        calendarGrid.appendChild(dayCell);
   }

    // --- API Call Functions (Using Proxy and NSFW filter) ---
    function addApiParams(params) {
         if (hideNsfw) { console.log("Adding NSFW filter: exclude_esrb_ratings=4"); params.append('exclude_esrb_ratings', '4'); } else { console.log("NSFW filter is OFF."); } return params;
    }

    async function fetchGamesForMonth(year, month) {
        const firstDay = `${year}-${String(month + 1).padStart(2, '0')}-01`; const lastDayDate = new Date(year, month + 1, 0); const lastDay = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDayDate.getDate()).padStart(2, '0')}`;
        let params = new URLSearchParams({ dates: `${firstDay},${lastDay}`, ordering: 'released,-added,-rating,-metacritic', page_size: 100, fields: 'id,name,released,background_image,metacritic,rating,platforms,short_screenshots,clip,youtube' });
        params = addApiParams(params);
        const proxyUrl = `/.netlify/functions/rawg-proxy/games?${params.toString()}`;
        console.log("Fetching month games (via proxy):", proxyUrl.replace(/&key=[^&]+/, '&key=***HIDDEN***'));
        try {
            const response = await fetch(proxyUrl); if (!response.ok) { let e = `Proxy Error ${response.status}`; try{const d=await response.json();e=d.detail||d.error||e}catch(err){} throw new Error(`Fetch games failed: ${e}`); } const data = await response.json(); return data.results || [];
        } catch (error) { console.error('Fetch games failed:', error); throw error; }
    }

    async function fetchSuggestions(query) { /* ... (Keep exact implementation) ... */ }
    async function searchAndJumpToGame(query) { /* ... (Keep exact implementation) ... */ }

    // --- Suggestion Display Logic ---
    function displaySuggestions(games) { /* ... (Keep exact implementation) ... */ }
    function handleSuggestionClick(game) { /* ... (Keep exact implementation) ... */ }
    const debouncedFetchSuggestions = debounce(async (query) => { if(!searchInput?.value?.trim()) return; const games = await fetchSuggestions(query); displaySuggestions(games); }, SUGGESTION_DEBOUNCE_DELAY);

    // --- Date Seek Feature ---
    function handleSeek() { /* ... (Keep exact implementation) ... */ }

    // --- Helper Functions --- (Defined above)

    // Debounced function to re-render the current view after filter change
    const debouncedRefetchCurrentView = debounce(() => {
        if (currentDate) {
            renderCalendar(currentDate.getFullYear(), currentDate.getMonth());
        }
    }, 300);

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