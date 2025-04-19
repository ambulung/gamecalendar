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


    // --- Utility Functions --- (Define these first)

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
            if (intervalData.element?.classList) {
                intervalData.element.classList.remove('is-fading');
                intervalData.element.style.removeProperty('--fade-bg-image');
            }
        });
        activeSlideshowIntervals = [];
    }

    // Groups fetched games by their release date
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

     // *** MOVED populateSeekControls here ***
    function populateSeekControls() {
        if (!seekMonthSelect || !seekYearInput) return;
        monthNames.forEach((name, index) => {
            const option = document.createElement('option'); option.value = index; option.textContent = name; seekMonthSelect.appendChild(option);
        });
        seekMonthSelect.value = currentDate.getMonth();
        seekYearInput.value = currentDate.getFullYear();
    }


    // --- API Call Functions (Using Proxy and NSFW filter) ---
    // Define these before renderCalendar and search functions

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
        const proxyUrl = `/.netlify/functions/rawg-proxy/games?${params.toString()}`;
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
        } catch (error) { console.error('Failed to fetch suggestions:', error); return []; }
    }

    // --- Rendering Calendar ---
    // Define renderCalendar after its dependencies (utility, processData, fetch)
    async function renderCalendar(year, month, highlightDate = null) {
        if (!calendarGrid || !monthYearDisplay || !seekMonthSelect || !seekYearInput) { console.error("Core elements missing!"); return; }
        const renderID = ++currentRenderID;
        console.log(`[${renderID}] Attempting to render ${getMonthName(month)} ${year}. Highlight: ${highlightDate || 'None'}. Hide NSFW: ${hideNsfw}`);
        showLoading();

        monthYearDisplay.textContent = `${getMonthName(month)} ${year}`;
        if (seekMonthSelect) seekMonthSelect.value = month;
        if (seekYearInput) seekYearInput.value = year;

        let gamesOfMonth = null;
        let fetchError = null;

        try {
            console.log(`[${renderID}] Starting fetch...`);
            gamesOfMonth = await fetchGamesForMonth(year, month); // Fetch applies filter
            console.log(`[${renderID}] Fetch successful.`);
        } catch (error) {
            console.error(`[${renderID}] Fetch error:`, error);
            fetchError = error;
        }

        // *** VERSION CHECK: Only proceed with DOM manipulation if this is the latest request ***
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

        let gamesByDate = {}; // Define and initialize here

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
            // Display error in the grid (only happens if latest request failed fetch/process)
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
    // *** Ensure createDayCell is defined before it's called in renderCalendar ***
    function createDayCell(dayNumber, isOtherMonth = false, gamesArray = [], dateStr = null) {
        if (!calendarGrid) { console.warn("calendarGrid not found in createDayCell."); return; }

        const dayCell = document.createElement('div'); dayCell.classList.add('calendar-day'); dayCell.dataset.day = dayNumber; if (isOtherMonth) dayCell.classList.add('other-month');
        if (!isOtherMonth && dayNumber !== null && dateStr) { dayCell.dataset.date = dateStr; } // data-date
        const daySpan = document.createElement('div'); daySpan.classList.add('day-number'); daySpan.textContent = dayNumber !== null ? dayNumber : ''; dayCell.appendChild(daySpan);
        const validGamesWithImages = gamesArray.filter(g => g && g.background_image);
        if (!isOtherMonth && gamesArray.length > 0) {
            dayCell.classList.add('has-game');
            const gameList = document.createElement('ul'); gameList.classList.add('game-list');
            let itemsAdded = 0; // Counter for games actually added to the list
            gamesArray.forEach(game => {
                if (game && game.name) {
                    const listItem = document.createElement('li'); listItem.classList.add('game-list-item'); listItem.textContent = game.name;
                    listItem.title = `${game.name}\nReleased: ${game.released || 'N/A'}\nRating: ${game.rating || 'N/A'} / 5\nMetacritic: ${game.metacritic || 'N/A'}`;
                    // --- Add Click Listener for Trailer ---
                    if (game.clip?.video) {
                         listItem.style.cursor = 'pointer';
                         listItem.title += `\nTrailer Available!`;
                         listItem.addEventListener('click', (event) => {
                             event.stopPropagation();
                             window.open(game.clip.video, '_blank');
                         });
                    }
                    gameList.appendChild(listItem);
                    itemsAdded++;
                } else { console.warn(`[Day ${dayNumber}] Skipping list item for game with missing data:`, game); }
             });
             if (gameList.children.length > 0) { dayCell.appendChild(gameList); } else { console.warn(`[Day ${dayNumber}] No valid game items added to list despite gamesArray having length > 0.`); }
            const initialGame = validGamesWithImages.length > 0 ? validGamesWithImages[0] : null; if (initialGame) { dayCell.style.backgroundImage = `url(${initialGame.background_image})`; dayCell.dataset.currentImageIndex = '0'; }
            if (validGamesWithImages.length > 1) {
                const intervalId = setInterval(() => { const style = window.getComputedStyle(dayCell); if (!document.body.contains(dayCell) || style.display === 'none') { clearInterval(intervalId); activeSlideshowIntervals = activeSlideshowIntervals.filter(item => item.id !== intervalId); return; } if (dayCell.classList.contains('is-fading')) return; let currentIndex = parseInt(dayCell.dataset.currentImageIndex || '0', 10); const nextIndex = (currentIndex + 1) % validGamesWithImages.length; const nextGame = validGamesWithImages[nextIndex]; if (!nextGame || !nextGame.background_image) { dayCell.dataset.currentImageIndex = String(nextIndex); return; } const nextImageUrl = `url(${nextGame.background_image})`; dayCell.style.setProperty('--fade-bg-image', nextImageUrl); dayCell.classList.add('is-fading'); setTimeout(() => { if (!document.body.contains(dayCell) || !dayCell.classList.contains('is-fading')) { if (dayCell.classList) { dayCell.classList.remove('is-fading'); dayCell.style.removeProperty('--fade-bg-image'); } return; } dayCell.style.backgroundImage = nextImageUrl; dayCell.classList.remove('is-fading'); dayCell.dataset.currentImageIndex = String(nextIndex); }, FADE_DURATION); }, SLIDESHOW_INTERVAL); activeSlideshowIntervals.push({ id: intervalId, element: dayCell });
            } else if (gamesArray.length > 0) { console.log(`[Day ${dayNumber}] Only one or no games with images available for slideshow.`); }
        } else if (!isOtherMonth && gamesArray.length === 0) { console.log(`[Day ${dayNumber}] No games for this day.`); } else if (isOtherMonth) { console.log(`[Day ${dayNumber}] Other month day.`); }

        calendarGrid.appendChild(dayCell);
   }

    // --- Search and Jump Feature ---
    // Define searchAndJumpToGame after its dependencies (fetchSuggestions, renderCalendar)
    async function searchAndJumpToGame(query) {
        if (!query) return;
        const renderID = ++currentRenderID; showLoading();
        if(suggestionsContainer) { suggestionsContainer.style.display = 'none'; suggestionsContainer.innerHTML = ''; }

        let params = new URLSearchParams({ search: query, page_size: 1, search_exact: 'true', fields: 'id,name,released,background_image,metacritic,rating,platforms,short_screenshots,clip,youtube' });
        params = addApiParams(params);
        let proxyUrl = `/.netlify/functions/rawg-proxy/games?${params.toString()}`;

        let foundGame = null; let searchError = null;

        console.log(`[${renderID}] Starting search for "${query}" (Hide NSFW: ${hideNsfw})`);
        try {
            let response = await fetch(proxyUrl); let data = await response.json();
            if (!response.ok || !data.results || data.results.length === 0) {
                console.log(`[${renderID}] Exact search failed, trying broader...`);
                params = new URLSearchParams({ search: query, page_size: 1, fields: 'id,name,released,background_image,metacritic,rating,platforms,short_screenshots,clip,youtube' });
                params = addApiParams(params);
                proxyUrl = `/.netlify/functions/rawg-proxy/games?${params.toString()}`;
                response = await fetch(proxyUrl); if (!response.ok) { let e = `Proxy Error ${response.status}`; try{const d=await response.json();e=d.detail||d.error||`Search Failed`} catch(err){} throw new Error(e); } data = await response.json();
            }
            if (data.results && data.results.length > 0) foundGame = data.results[0];
            console.log(`[${renderID}] Search fetch successful.`);
        } catch (error) { console.error(`[${renderID}] Search fetch error:`, error); searchError = error; }

        if (renderID !== currentRenderID) { console.log(`[${renderID}] Search jump aborted (stale).`); return; }

        console.log(`[${renderID}] Processing search result...`);
        if (searchError) { alert(`Error searching for game: ${searchError.message}`); hideLoading(); }
        else if (foundGame) { console.log(`[${renderID}] Found game:`, foundGame.name, foundGame.released, 'Clip:', foundGame.clip?.video);
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
    // Define these before searchAndJumpToGame calls them
    function displaySuggestions(games) { if (!suggestionsContainer) return; suggestionsContainer.innerHTML = ''; if (!games || games.length === 0) { suggestionsContainer.style.display = 'none'; return; } games.forEach(game => { const div = document.createElement('div'); div.classList.add('suggestion-item'); div.textContent = game.name; if (game.released) { const year = game.released.substring(0, 4); const yearSpan = document.createElement('small'); yearSpan.textContent = ` (${year})`; div.appendChild(yearSpan); } div.dataset.gameData = JSON.stringify(game); div.addEventListener('click', () => handleSuggestionClick(game)); suggestionsContainer.appendChild(div); }); suggestionsContainer.style.display = 'block'; }
    function handleSuggestionClick(game) { if (!searchInput || !suggestionsContainer) return; searchInput.value = game.name; suggestionsContainer.style.display = 'none'; suggestionsContainer.innerHTML = ''; searchAndJumpToGame(game.name); }
    const debouncedFetchSuggestions = debounce(async (query) => { if(!searchInput?.value?.trim()) return; const games = await fetchSuggestions(query); displaySuggestions(games); }, SUGGESTION_DEBOUNCE_DELAY);

    // --- Date Seek Feature ---
    // Define handleSeek after renderCalendar
    function handleSeek() {
        if (!seekMonthSelect || !seekYearInput) return;
        const selectedMonth = parseInt(seekMonthSelect.value, 10); const enteredYear = parseInt(seekYearInput.value, 10);
        if (isNaN(selectedMonth) || isNaN(enteredYear) || enteredYear < 1970 || enteredYear > 2100) { alert("Please enter a valid month and year (e.g., 1970-2100)."); return; }
        currentDate = new Date(enteredYear, selectedMonth, 1);
        if (searchInput) searchInput.value = ''; if (suggestionsContainer) { suggestionsContainer.style.display = 'none'; suggestionsContainer.innerHTML = ''; }
        renderCalendar(currentDate.getFullYear(), currentDate.getMonth());
    }
    // --- End Date Seek ---

    // Debounced function to re-render the current view after filter change
    // Define after renderCalendar
    const debouncedRefetchCurrentView = debounce(() => {
        if (currentDate) {
            renderCalendar(currentDate.getFullYear(), currentDate.getMonth());
        }
    }, 300);


    // --- Event Listeners --- (Ensure elements exist)
    if (prevMonthButton) prevMonthButton.addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth() - 1); if(searchInput) searchInput.value = ''; if(suggestionsContainer){suggestionsContainer.style.display = 'none'; suggestionsContainer.innerHTML = '';} renderCalendar(currentDate.getFullYear(), currentDate.getMonth()); });
    if (nextMonthButton) nextMonthButton.addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth() + 1); if(searchInput) searchInput.value = ''; if(suggestionsContainer){suggestionsContainer.style.display = 'none'; suggestionsContainer.innerHTML = '';} renderCalendar(currentDate.getFullYear(), currentDate.getMonth()); });
    if (searchInput) {
        searchInput.addEventListener('input', () => { const query = searchInput.value.trim(); if (query.length > 1) { debouncedFetchSuggestions(query); } else { if(suggestionsContainer){suggestionsContainer.style.display = 'none'; suggestionsContainer.innerHTML = '';} } });
        searchInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); searchAndJumpToGame(searchInput.value.trim()); } else if (event.key === 'Escape') { if(suggestionsContainer){suggestionsContainer.style.display = 'none'; suggestionsContainer.innerHTML = '';} } });
    }
    document.addEventListener('click', (event) => { if (searchInput && suggestionsContainer && !searchInput.contains(event.target) && !suggestionsContainer.contains(event.target)) { suggestionsContainer.style.display = 'none'; suggestionsContainer.innerHTML = ''; } });
    if (seekButton) seekButton.addEventListener('click', handleSeek);
    if (seekYearInput) seekYearInput.addEventListener('keypress', (event) => { if (event.key === 'Enter') { event.preventDefault(); handleSeek(); } });

    // --- Initial Load --- (Call these last)
    populateSeekControls(); // Calls populateSeekControls
    renderCalendar(currentDate.getFullYear(), currentDate.getMonth()); // Calls renderCalendar

    console.log("Calendar script initialized.");

}); // End DOMContentLoaded