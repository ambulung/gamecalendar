document.addEventListener('DOMContentLoaded', () => {
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

    // --- State & Constants ---
    let currentDate = new Date();
    const MAX_GAMES_PER_DAY = 10;
    let activeSlideshowIntervals = [];
    const SLIDESHOW_INTERVAL = 5000;
    const FADE_DURATION = 700;
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const SUGGESTION_DEBOUNCE_DELAY = 350;
    let currentRenderID = 0; // Version counter for async operations

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
    function applyTheme(theme) {
        document.body.classList.toggle('dark-mode', theme === 'dark');
        themeToggle.checked = (theme === 'dark');
        const containerRgb = getComputedStyle(document.body).getPropertyValue('--container-bg-rgb').trim() || '255, 255, 255';
        if (loadingIndicator) loadingIndicator.style.backgroundColor = `rgba(${containerRgb}, 0.8)`;
    }
    function toggleTheme() {
        const newTheme = document.body.classList.contains('dark-mode') ? 'light' : 'dark';
        localStorage.setItem('theme', newTheme);
        applyTheme(newTheme);
    }
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = !savedTheme && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(savedTheme || (prefersDark ? 'dark' : 'light'));
    if (themeToggle) themeToggle.addEventListener('change', toggleTheme); // Add null check

    // --- Populate Seek Controls --- (Seek Date Feature)
    function populateSeekControls() {
        if (!seekMonthSelect || !seekYearInput) return; // Add checks
        monthNames.forEach((name, index) => {
            const option = document.createElement('option');
            option.value = index; // 0-11
            option.textContent = name;
            seekMonthSelect.appendChild(option);
        });
        seekMonthSelect.value = currentDate.getMonth();
        seekYearInput.value = currentDate.getFullYear();
    }

    // --- Calendar Logic ---
    function clearSlideshowIntervals() {
        activeSlideshowIntervals.forEach(intervalData => {
             clearInterval(intervalData.id);
            if (intervalData.element && intervalData.element.classList) {
                 intervalData.element.classList.remove('is-fading');
                 intervalData.element.style.removeProperty('--fade-bg-image');
             }
        });
        activeSlideshowIntervals = [];
    }

    function showLoading() {
        if (!loadingIndicator) return; // Add check
        const containerRgb = getComputedStyle(document.body).getPropertyValue('--container-bg-rgb').trim() || '255, 255, 255';
        loadingIndicator.style.backgroundColor = `rgba(${containerRgb}, 0.8)`;
        const target = document.querySelector('.calendar-body') || calendarGrid;
        // Ensure target exists before appending
        if (target && !target.contains(loadingIndicator)) {
            target.appendChild(loadingIndicator);
        }
        loadingIndicator.style.display = 'flex';
    }

    function hideLoading() {
        if (loadingIndicator && loadingIndicator.parentNode) {
            loadingIndicator.parentNode.removeChild(loadingIndicator);
        }
        if (loadingIndicator) {
            loadingIndicator.style.display = 'none';
        }
    }

    // Groups fetched games by their release date
    function processGameData(games) {
        const gamesByDate = {};
        if (!games || games.length === 0) return gamesByDate;
        games.forEach(game => {
            if (game && game.released && game.name) {
                const releaseDate = game.released;
                if (!gamesByDate[releaseDate]) gamesByDate[releaseDate] = [];
                if (gamesByDate[releaseDate].length < MAX_GAMES_PER_DAY) {
                    if (!gamesByDate[releaseDate].some(g => g.id === game.id)) {
                        gamesByDate[releaseDate].push(game);
                    }
                }
            }
        });
        return gamesByDate;
    }

    async function renderCalendar(year, month, highlightDate = null) {
        // Ensure core elements exist
        if (!calendarGrid || !monthYearDisplay || !seekMonthSelect || !seekYearInput) {
            console.error("Core calendar elements not found!");
            return;
        }

        const renderID = ++currentRenderID; // Assign ID for this operation
        showLoading(); // Show loading indicator

        // Update display text immediately
        monthYearDisplay.textContent = `${getMonthName(month)} ${year}`;
        seekMonthSelect.value = month;
        seekYearInput.value = year;

        let gamesOfMonth = null;
        let fetchError = null;

        try {
            console.log(`[${renderID}] Starting fetch for ${getMonthName(month)} ${year}`);
            gamesOfMonth = await fetchGamesForMonth(year, month);
        } catch (error) {
            console.error(`[${renderID}] Fetch error:`, error);
            fetchError = error; // Store error to handle later
        }

        // *** VERSION CHECK: Is this still the latest request? ***
        if (renderID !== currentRenderID) {
            console.log(`[${renderID}] Discarding stale results (current is ${currentRenderID}).`);
            // Don't hide loading; the latest operation will handle it.
            return;
        }

        // --- If this IS the latest request, proceed ---
        console.log(`[${renderID}] Processing results...`);
        clearSlideshowIntervals(); // Clear old intervals
        calendarGrid.innerHTML = ''; // Clear grid content NOW

        // --- Clear previous search highlights ---
        document.querySelectorAll('.calendar-day.search-highlight').forEach(cell => {
            cell.classList.remove('search-highlight');
        });

        try {
            // Handle fetch error *here* if it occurred in the latest request
            if (fetchError) {
                throw fetchError;
            }

            // Process and render fetched data
            const gamesByDate = processGameData(gamesOfMonth || []);

            const firstDayOfMonth = new Date(year, month, 1);
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            const startDayOfWeek = firstDayOfMonth.getDay();

            // Build grid structure and append cells
            for (let i = 0; i < startDayOfWeek; i++) createDayCell(null, true);
            for (let day = 1; day <= daysInMonth; day++) {
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const gamesForDay = gamesByDate[dateStr] || [];
                createDayCell(day, false, gamesForDay, dateStr); // Pass dateStr for data-date
            }
            const totalCells = startDayOfWeek + daysInMonth;
            const remainingCells = (7 - (totalCells % 7)) % 7;
            for (let i = 0; i < remainingCells; i++) createDayCell(null, true);

            // --- Apply Highlight if needed ---
            if (highlightDate) {
                console.log(`[${renderID}] Attempting to highlight date: ${highlightDate}`);
                const targetCell = calendarGrid.querySelector(`.calendar-day[data-date="${highlightDate}"]`);
                if (targetCell) {
                    targetCell.classList.add('search-highlight');
                    // Scroll into view if needed (consider only on specific views or actions)
                    if (targetCell.scrollIntoView) {
                         targetCell.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    }
                    console.log(`[${renderID}] Highlight applied.`);
                } else {
                     console.log(`[${renderID}] Target cell for highlight not found.`);
                }
            }

        } catch (error) {
            // Display error message (only runs if this is the latest request)
            console.error(`[${renderID}] Render error:`, error);
            calendarGrid.innerHTML = `<p style="color: red; grid-column: 1 / -1; text-align: center; padding: 20px;">${error.message || 'Failed to load game data.'}</p>`;
        } finally {
            // **Always** hide loading indicator if this was the latest operation finishing
            console.log(`[${renderID}] Finishing render.`);
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
            gamesArray.forEach(game => { // Iterate through potentially filtered games
                if (game && game.name) { // Check game object and name exist
                    const listItem = document.createElement('li'); listItem.classList.add('game-list-item'); listItem.textContent = game.name; listItem.title = `${game.name}\nReleased: ${game.released || 'N/A'}\nRating: ${game.rating || 'N/A'} / 5\nMetacritic: ${game.metacritic || 'N/A'}`; gameList.appendChild(listItem);
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

    // --- API Call Functions (Using Proxy) ---
    async function fetchGamesForMonth(year, month) {
        const firstDay = `${year}-${String(month + 1).padStart(2, '0')}-01`;
        const lastDayDate = new Date(year, month + 1, 0);
        const lastDay = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDayDate.getDate()).padStart(2, '0')}`;
        const params = new URLSearchParams({ dates: `${firstDay},${lastDay}`, ordering: 'released,-added,-rating,-metacritic', page_size: 100 });
        const proxyUrl = `/.netlify/functions/rawg-proxy/games?${params.toString()}`; // ADJUST if not using Netlify functions root
        try {
            const response = await fetch(proxyUrl); if (!response.ok) { let e = `Proxy Error ${response.status}`; try{const d=await response.json();e=d.detail||d.error||e}catch(err){} throw new Error(`Fetch games failed: ${e}`); } const data = await response.json(); return data.results || [];
        } catch (error) { console.error('Fetch games failed:', error); throw error; }
    }

    // --- Suggestion Search Feature ---
    async function fetchSuggestions(query) {
        if (!query) return [];
        const params = new URLSearchParams({ search: query, page_size: 5, search_precise: 'true' });
        const proxyUrl = `/.netlify/functions/rawg-proxy/games?${params.toString()}`; // ADJUST if not using Netlify functions root
        try {
            const response = await fetch(proxyUrl); if (!response.ok) { console.error(`Suggestion fetch error: ${response.status}`); return []; } const data = await response.json(); return data.results || [];
        } catch (error) { console.error('Failed to fetch suggestions:', error); return []; }
    }

    function displaySuggestions(games) {
        if (!suggestionsContainer) return; // Add check
        suggestionsContainer.innerHTML = '';
        if (!games || games.length === 0) { suggestionsContainer.style.display = 'none'; return; }
        games.forEach(game => {
            const div = document.createElement('div'); div.classList.add('suggestion-item'); div.textContent = game.name;
            if (game.released) { const year = game.released.substring(0, 4); const yearSpan = document.createElement('small'); yearSpan.textContent = ` (${year})`; div.appendChild(yearSpan); }
            div.dataset.gameData = JSON.stringify(game);
            div.addEventListener('click', () => handleSuggestionClick(game)); suggestionsContainer.appendChild(div);
        });
        suggestionsContainer.style.display = 'block';
    }

    function handleSuggestionClick(game) {
        if (!searchInput || !suggestionsContainer) return; // Add checks
        searchInput.value = game.name; suggestionsContainer.style.display = 'none'; suggestionsContainer.innerHTML = '';
        searchAndJumpToGame(game.name);
    }

    const debouncedFetchSuggestions = debounce(async (query) => { const games = await fetchSuggestions(query); displaySuggestions(games); }, SUGGESTION_DEBOUNCE_DELAY);
    // --- End Suggestion Search ---


    // --- Search and Jump Feature ---
    async function searchAndJumpToGame(query) {
        if (!query) return;
        const renderID = ++currentRenderID; showLoading();
        if(suggestionsContainer) { suggestionsContainer.style.display = 'none'; suggestionsContainer.innerHTML = ''; }

        let params = new URLSearchParams({ search: query, page_size: 1, search_exact: 'true' });
        let proxyUrl = `/.netlify/functions/rawg-proxy/games?${params.toString()}`; // ADJUST if not using Netlify functions root
        let foundGame = null; let searchError = null;
        console.log(`[${renderID}] Searching game (via proxy):`, proxyUrl);
        try {
            let response = await fetch(proxyUrl); let data = await response.json();
            if (!response.ok || !data.results || data.results.length === 0) { params = new URLSearchParams({ search: query, page_size: 1 }); proxyUrl = `/.netlify/functions/rawg-proxy/games?${params.toString()}`; response = await fetch(proxyUrl); if (!response.ok) { let e = `Proxy Error ${response.status}`; try{const d=await response.json();e=d.detail||d.error||`Search Failed`} catch(err){} throw new Error(e); } data = await response.json(); }
            if (data.results && data.results.length > 0) foundGame = data.results[0];
        } catch (error) { console.error(`[${renderID}] Failed to search for game:`, error); searchError = error; }

        // VERSION CHECK before processing result or calling renderCalendar
        if (renderID !== currentRenderID) { console.log(`[${renderID}] Search jump aborted (stale).`); return; }

        console.log(`[${renderID}] Processing search result...`);
        if (searchError) { alert(`Error searching for game: ${searchError.message}`); hideLoading(); } // Hide loading on definitive error
        else if (foundGame) { console.log(`[${renderID}] Found game:`, foundGame.name, foundGame.released);
            if (foundGame.released) {
                const highlightDate = foundGame.released; // Keep YYYY-MM-DD format
                try {
                    const releaseDate = new Date(highlightDate + 'T00:00:00'); const targetYear = releaseDate.getFullYear(); const targetMonth = releaseDate.getMonth();
                    if (!isNaN(targetYear) && !isNaN(targetMonth)) {
                        currentDate = new Date(targetYear, targetMonth, 1);
                        // Call renderCalendar. It will show/hide loading based on its own ID.
                        await renderCalendar(targetYear, targetMonth, highlightDate); // Pass highlight date
                    } else { throw new Error("Invalid date parsed."); }
                }
                catch (dateError) { console.error("Error parsing release date:", highlightDate, dateError); alert(`Found '${foundGame.name}' but couldn't parse its release date (${highlightDate}).`); hideLoading(); /* Hide here since render failed */ }
            } else { alert(`Found '${foundGame.name}' but it doesn't have a specific release date listed.`); hideLoading(); /* Hide here since can't jump */ }
        } else { alert(`Game "${query}" not found.`); hideLoading(); /* Hide here since not found */ }
    }
    // --- End Search and Jump ---

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
    // --- End Date Seek ---

    // --- Helper Functions ---
    function getMonthName(monthIndex) { return monthNames[monthIndex]; }
    // showLoading/hideLoading defined above

    // --- Event Listeners (Including checks for element existence) ---
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