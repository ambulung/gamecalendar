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
    const seekYearInput = document('seek-year');
    const seekButton = document.getElementById('seek-button');

    // --- State & Constants ---
    let currentDate = new Date();
    const MAX_GAMES_PER_DAY = 10;
    let activeSlideshowIntervals = []; // Stores { id: intervalId, element: dayCell }
    const SLIDESHOW_INTERVAL = 5000; // ms
    const FADE_DURATION = 700; // ms
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const SUGGESTION_DEBOUNCE_DELAY = 350; // ms
    let currentRenderID = 0; // Version counter for async operations
    let hideNsfw = true; // Default: Hide NSFW

    // --- Initial DOM Check ---
    if (!calendarGrid || !monthYearDisplay || !prevMonthButton || !nextMonthButton) {
        console.error("CRITICAL ERROR: Core calendar elements not found in the DOM. Aborting script.");
        alert("Error: Could not initialize calendar elements. Please check the HTML structure.");
        return; // Stop execution if essential elements are missing
    }

    // --- Utility Functions ---
    function debounce(func, delay) {
        let timeoutId;
        return function(...args) {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => func.apply(this, args), delay);
        };
    }

    function getMonthName(monthIndex) {
        return monthNames[monthIndex];
    }

    function showLoading() {
        if (!loadingIndicator) return;
        const containerRgb = getComputedStyle(document.body).getPropertyValue('--container-bg-rgb').trim() || '255, 255, 255';
        loadingIndicator.style.backgroundColor = `rgba(${containerRgb}, 0.8)`;
        const target = calendarBody || calendarGrid;
        if (target && !target.contains(loadingIndicator)) {
            target.appendChild(loadingIndicator);
        }
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
            if (intervalData.element?.classList) {
                intervalData.element.classList.remove('is-fading');
                intervalData.element.style.removeProperty('--fade-bg-image');
            }
        });
        activeSlideshowIntervals = [];
    }

    // --- API Call Functions (Using Proxy and NSFW filter) ---

    // Helper to add common parameters including NSFW filter
    function addApiParams(params) {
         if (hideNsfw) {
             // Exclude Adults Only (rating 4)
             params.append('exclude_esrb_ratings', '4');
         }
         return params;
    }

    async function fetchGamesForMonth(year, month) {
        const firstDay = `${year}-${String(month + 1).padStart(2, '0')}-01`;
        const lastDayDate = new Date(year, month + 1, 0);
        const lastDay = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDayDate.getDate()).padStart(2, '0')}`;
        let params = new URLSearchParams({
            dates: `${firstDay},${lastDay}`,
            ordering: 'released,-added,-rating,-metacritic', // Order by release date, then quality/hype
            page_size: 100, // Fetch enough games for the month
            // We need the 'youtube' field for trailer links
            fields: 'id,name,released,background_image,metacritic,rating,platforms,short_screenshots,clip,youtube' // Add youtube field
        });
        params = addApiParams(params); // Apply filter

        const proxyUrl = `/.netlify/functions/rawg-proxy/games?${params.toString()}`; // ADJUST if not using Netlify functions root
        console.log("Fetching month games (via proxy):", proxyUrl.replace(/&key=[^&]+/, '&key=***HIDDEN***')); // Log sanitized URL

        try {
            const response = await fetch(proxyUrl);
            if (!response.ok) {
                let e = `Proxy Error ${response.status}`;
                try{const d=await response.json();e=d.detail||d.error||e}catch(err){}
                throw new Error(`Fetch games failed: ${e}`);
            }
            const data = await response.json();
            return data.results || [];
        } catch (error) {
            console.error('Fetch games failed:', error);
            throw error; // Re-throw to be handled by renderCalendar
        }
    }

     // This fetch is used by search/suggestions - also include 'youtube' field
    async function fetchSuggestions(query) {
        if (!query) return [];
        let params = new URLSearchParams({
            search: query,
            page_size: 5,
            search_precise: 'true',
             // Add youtube field
            fields: 'id,name,released,background_image,metacritic,rating,platforms,short_screenshots,clip,youtube'
        });
        params = addApiParams(params); // Apply filter

        const proxyUrl = `/.netlify/functions/rawg-proxy/games?${params.toString()}`; // ADJUST if not using Netlify functions root
        console.log("Fetching suggestions (via proxy):", proxyUrl.replace(/&key=[^&]+/, '&key=***HIDDEN***')); // Log sanitized URL
        try {
            const response = await fetch(proxyUrl);
            if (!response.ok) { console.error(`Suggestion fetch error: ${response.status}`); return []; }
            const data = await response.json();
            return data.results || [];
        } catch (error) { console.error('Failed to fetch suggestions:', error); return []; }
    }

    // --- Processing Data ---

    // Groups fetched games by their release date
    function processGameData(games) {
        const gamesByDate = {};
        if (!games || games.length === 0) return gamesByDate;

        games.forEach(game => {
            if (game && game.released && game.name) {
                const releaseDate = game.released;
                if (!gamesByDate[releaseDate]) gamesByDate[releaseDate] = [];
                if (gamesByDate[releaseDate].length < MAX_GAMES_PER_DAY) {
                    if (!gamesByDate[releaseDate].some(existing => existing.id === game.id)) {
                        gamesByDate[releaseDate].push(game);
                    }
                }
            }
        });
        return gamesByDate;
    }

    // --- Rendering Calendar ---

    async function renderCalendar(year, month, highlightDate = null) {
        if (!calendarGrid || !monthYearDisplay || !seekMonthSelect || !seekYearInput) { console.error("Core elements missing!"); return; }
        const renderID = ++currentRenderID; // Get unique ID for this render request
        console.log(`[${renderID}] Attempting to render ${getMonthName(month)} ${year}. Highlight: ${highlightDate || 'None'}. Hide NSFW: ${hideNsfw}`);
        showLoading(); // Show loading indicator

        // Update display text immediately
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
                 // Do *not* hide loading; the latest op will.
                return;
            }

            // --- If this IS the latest, process data ---
            console.log(`[${renderID}] This is the latest request. Processing data...`);
            gamesByDate = processGameData(gamesOfMonth || []); // Assign value here

            // --- Proceed to Render the Grid ---
            console.log(`[${renderID}] Rendering grid...`);
            clearSlideshowIntervals(); // Clear old intervals
            calendarGrid.innerHTML = ''; // Clear grid content NOW

            // Clear previous search highlights (only if this is the latest render)
            document.querySelectorAll('.calendar-day.search-highlight').forEach(cell => {
                cell.classList.remove('search-highlight');
            });

            const firstDayOfMonth = new Date(year, month, 1);
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            const startDayOfWeek = firstDayOfMonth.getDay();

            // Build grid structure and append cells using the populated gamesByDate
            for (let i = 0; i < startDayOfWeek; i++) createDayCell(null, true);
            for (let day = 1; day <= daysInMonth; day++) {
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const gamesForDay = gamesByDate[dateStr] || []; // Access gamesByDate
                createDayCell(day, false, gamesForDay, dateStr); // Pass dateStr for data-date
            }
            const totalCells = startDayOfWeek + daysInMonth;
            const remainingCells = (7 - (totalCells % 7)) % 7;
            for (let i = 0; i < remainingCells; i++) createDayCell(null, true);

            // Apply Highlight if needed for this latest render
            if (highlightDate) {
                 console.log(`[${renderID}] Attempting to highlight date: ${highlightDate}`);
                 const targetCell = calendarGrid.querySelector(`.calendar-day[data-date="${highlightDate}"]`);
                 if (targetCell) {
                     targetCell.classList.add('search-highlight');
                     // Scroll into view if needed
                     if (targetCell.scrollIntoView) targetCell.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                     console.log(`[${renderID}] Highlight applied.`);
                 } else {
                      console.warn(`[${renderID}] Target cell for highlight not found.`);
                 }
            }
            console.log(`[${renderID}] Grid built successfully.`);


        } catch (error) {
            // Display error in the grid (only happens if latest request failed fetch/process)
            console.error(`[${renderID}] Render/Process error:`, error);
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
    function createDayCell(dayNumber, isOtherMonth = false, gamesArray = [], dateStr = null) {
        if (!calendarGrid) return; // Ensure grid exists before appending

        const dayCell = document.createElement('div'); dayCell.classList.add('calendar-day'); dayCell.dataset.day = dayNumber; if (isOtherMonth) dayCell.classList.add('other-month');
        // Add data-date attribute for highlighting
        if (!isOtherMonth && dayNumber !== null && dateStr) { dayCell.dataset.date = dateStr; }
        const daySpan = document.createElement('div'); daySpan.classList.add('day-number'); daySpan.textContent = dayNumber !== null ? dayNumber : ''; dayCell.appendChild(daySpan);
        const validGamesWithImages = gamesArray.filter(g => g && g.background_image); // Add check for game object itself
        if (!isOtherMonth && gamesArray.length > 0) {
            dayCell.classList.add('has-game');
            const gameList = document.createElement('ul'); gameList.classList.add('game-list');
            gamesArray.forEach(game => { // Iterate through games for this day
                if (game && game.name) { // Check game object and name exist
                    const listItem = document.createElement('li'); listItem.classList.add('game-list-item'); listItem.textContent = game.name;
                    // Build comprehensive title
                    listItem.title = `${game.name}\nReleased: ${game.released || 'N/A'}\nRating: ${game.rating || 'N/A'} / 5\nMetacritic: ${game.metacritic || 'N/A'}`;

                    // --- Add Click Listener for Trailer ---
                    if (game.clip && game.clip.video) { // Check if clip video URL exists
                         listItem.style.cursor = 'pointer'; // Indicate clickable
                         listItem.title += `\nTrailer Available!`; // Add to tooltip
                         listItem.addEventListener('click', (event) => {
                             event.stopPropagation(); // Prevent calendar day click if implemented later
                             window.open(game.clip.video, '_blank'); // Open trailer in new tab
                         });
                    } else if (game.youtube) { // Fallback/alternative check for dedicated YouTube field if API provides it
                         // Note: RAWG's 'youtube' field on a game object itself is less common than 'clip.video' for trailers.
                         // You might need to check the 'short_screenshots' for specific video links if needed.
                         // The 'clip' field is the most common for game trailers directly on the game object.
                         // If 'clip.video' is the primary source, the check above is sufficient.
                         // If API structure varies, you might need more robust checks or fetch video list separately.
                    }

                    gameList.appendChild(listItem);
                }
             });
             // Only append list if it has items
             if (gameList.children.length > 0) {
                dayCell.appendChild(gameList);
             }

            const initialGame = validGamesWithImages.length > 0 ? validGamesWithImages[0] : null; if (initialGame) { dayCell.style.backgroundImage = `url(${initialGame.background_image})`; dayCell.dataset.currentImageIndex = '0'; }
            // Slideshow setup
            if (validGamesWithImages.length > 1) {
                const intervalId = setInterval(() => { const style = window.getComputedStyle(dayCell); if (!document.body.contains(dayCell) || style.display === 'none') { clearInterval(intervalId); activeSlideshowIntervals = activeSlideshowIntervals.filter(item => item.id !== intervalId); return; } if (dayCell.classList.contains('is-fading')) return; let currentIndex = parseInt(dayCell.dataset.currentImageIndex || '0', 10); const nextIndex = (currentIndex + 1) % validGamesWithImages.length; const nextGame = validGamesWithImages[nextIndex]; if (!nextGame || !nextGame.background_image) { dayCell.dataset.currentImageIndex = String(nextIndex); return; } const nextImageUrl = `url(${nextGame.background_image})`; dayCell.style.setProperty('--fade-bg-image', nextImageUrl); dayCell.classList.add('is-fading'); setTimeout(() => { if (!document.body.contains(dayCell) || !dayCell.classList.contains('is-fading')) { if (dayCell.classList) { dayCell.classList.remove('is-fading'); dayCell.style.removeProperty('--fade-bg-image'); } return; } dayCell.style.backgroundImage = nextImageUrl; dayCell.classList.remove('is-fading'); dayCell.dataset.currentImageIndex = String(nextIndex); }, FADE_DURATION); }, SLIDESHOW_INTERVAL); activeSlideshowIntervals.push({ id: intervalId, element: dayCell });
            }
        }
        calendarGrid.appendChild(dayCell); // Append the cell to the grid
   }

    // --- API Call Functions (Using Proxy and NSFW filter) ---
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
        const firstDay = `${year}-${String(month + 1).padStart(2, '0')}-01`;
        const lastDayDate = new Date(year, month + 1, 0);
        const lastDay = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDayDate.getDate()).padStart(2, '0')}`;
        let params = new URLSearchParams({
            dates: `${firstDay},${lastDay}`,
            ordering: 'released,-added,-rating,-metacritic', page_size: 100,
            // *** Request fields including clip and youtube ***
            fields: 'id,name,released,background_image,metacritic,rating,platforms,short_screenshots,clip,youtube'
        });
        params = addApiParams(params); // Apply filter
        const proxyUrl = `/.netlify/functions/rawg-proxy/games?${params.toString()}`;
        console.log("Fetching month games (via proxy):", proxyUrl.replace(/&key=[^&]+/, '&key=***HIDDEN***'));
        try {
            const response = await fetch(proxyUrl); if (!response.ok) { let e = `Proxy Error ${response.status}`; try{const d=await response.json();e=d.detail||d.error||e}catch(err){} throw new Error(`Fetch games failed: ${e}`); } const data = await response.json(); return data.results || [];
        } catch (error) { console.error('Fetch games failed:', error); throw error; }
    }

    // Suggestion fetch also needs the clip/youtube fields if you want trailers from suggestions
    async function fetchSuggestions(query) {
        if (!query) return [];
        let params = new URLSearchParams({
            search: query, page_size: 5, search_precise: 'true',
             // *** Request fields including clip and youtube ***
            fields: 'id,name,released,background_image,metacritic,rating,platforms,short_screenshots,clip,youtube'
        });
        params = addApiParams(params); // Apply filter
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

        // Apply NSFW filter to search as well and request fields
        let params = new URLSearchParams({
            search: query, page_size: 1, search_exact: 'true',
            // *** Request fields including clip and youtube ***
            fields: 'id,name,released,background_image,metacritic,rating,platforms,short_screenshots,clip,youtube'
        });
        params = addApiParams(params);
        let proxyUrl = `/.netlify/functions/rawg-proxy/games?${params.toString()}`;

        let foundGame = null; let searchError = null;

        console.log(`[${renderID}] Starting search for "${query}" (Hide NSFW: ${hideNsfw})`);
        try {
            let response = await fetch(proxyUrl); let data = await response.json();
            if (!response.ok || !data.results || data.results.length === 0) {
                console.log(`[${renderID}] Exact search failed, trying broader...`);
                params = new URLSearchParams({ search: query, page_size: 1, fields: 'id,name,released,background_image,metacritic,rating,platforms,short_screenshots,clip,youtube' }); // Request fields
                params = addApiParams(params); // Apply filter again
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
        else if (foundGame) { console.log(`[${renderID}] Found game:`, foundGame.name, foundGame.released, 'Clip:', foundGame.clip?.video); // Log clip URL
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
    function displaySuggestions(games) { /* ... */ }
    function handleSuggestionClick(game) { /* ... */ }
    const debouncedFetchSuggestions = debounce(async (query) => { if(!searchInput.value.trim()) return; const games = await fetchSuggestions(query); displaySuggestions(games); }, SUGGESTION_DEBOUNCE_DELAY);

    // --- Date Seek Feature ---
    function handleSeek() {
        if (!seekMonthSelect || !seekYearInput) return;
        const selectedMonth = parseInt(seekMonthSelect.value, 10); const enteredYear = parseInt(seekYearInput.value, 10);
        if (isNaN(selectedMonth) || isNaN(enteredYear) || enteredYear < 1970 || enteredYear > 2100) { alert("Please enter a valid month and year (e.g., 1970-2100)."); return; }
        currentDate = new Date(enteredYear, selectedMonth, 1);
        if (searchInput) searchInput.value = ''; if (suggestionsContainer) { suggestionsContainer.style.display = 'none'; suggestionsContainer.innerHTML = ''; }
        renderCalendar(currentDate.getFullYear(), currentDate.getMonth());
    }
    // --- End Date Seek ---

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