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
    // *** CORRECTED LINE ***
    const seekYearInput = document.getElementById('seek-year');
    // *** END CORRECTED LINE ***
    const seekButton = document.getElementById('seek-button');

    // Add initial checks for essential elements
    if (!calendarGrid || !monthYearDisplay || !prevMonthButton || !nextMonthButton) {
        console.error("CRITICAL ERROR: Core calendar elements not found in the DOM. Aborting script.");
        alert("Error: Could not initialize calendar elements. Please check the HTML structure.");
        return; // Stop execution if essential elements are missing
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
    let hideNsfw = true;

    // --- Utility: Debounce ---
    function debounce(func, delay) { /* ... (Keep exact implementation) ... */ }

    // --- Theme Management ---
    function applyTheme(theme) { document.body.classList.toggle('dark-mode', theme === 'dark'); if (themeToggle) themeToggle.checked = (theme === 'dark'); const containerRgb = getComputedStyle(document.body).getPropertyValue('--container-bg-rgb').trim() || '255, 255, 255'; if (loadingIndicator) loadingIndicator.style.backgroundColor = `rgba(${containerRgb}, 0.8)`; }
    function toggleTheme() { const newTheme = document.body.classList.contains('dark-mode') ? 'light' : 'dark'; localStorage.setItem('theme', newTheme); applyTheme(newTheme); }
    const savedTheme = localStorage.getItem('theme'); const prefersDark = !savedTheme && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches; applyTheme(savedTheme || (prefersDark ? 'dark' : 'light'));
    if (themeToggle) themeToggle.addEventListener('change', toggleTheme);

    // --- NSFW Filter Management ---
    function applyNsfwFilterState(shouldHide) { hideNsfw = shouldHide; if (nsfwToggle) { nsfwToggle.checked = shouldHide; } localStorage.setItem('hideNsfwPref', hideNsfw ? 'true' : 'false'); console.log("NSFW Filter State Set:", hideNsfw ? "Hide NSFW" : "Show NSFW"); }
    function toggleNsfwFilter() { console.log("NSFW Toggle clicked."); applyNsfwFilterState(!hideNsfw); debouncedRefetchCurrentView(); }
    const savedNsfwPref = localStorage.getItem('hideNsfwPref'); const initialHideNsfw = savedNsfwPref === 'false' ? false : true; applyNsfwFilterState(initialHideNsfw);
    if (nsfwToggle) nsfwToggle.addEventListener('change', toggleNsfwFilter);

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

    // Groups fetched games by their release date
    function processGameData(games) { /* ... (Keep exact implementation) ... */
         const gamesByDate = {}; if (!games || games.length === 0) return gamesByDate; games.forEach(game => { if (game && game.released && game.name) { const releaseDate = game.released; if (!gamesByDate[releaseDate]) gamesByDate[releaseDate] = []; if (gamesByDate[releaseDate].length < MAX_GAMES_PER_DAY) { if (!gamesByDate[releaseDate].some(existing => existing.id === game.id)) { gamesByDate[releaseDate].push(game); } } } }); return gamesByDate;
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

        let gamesByDate = {};
        let fetchError = null;

        try {
            console.log(`[${renderID}] Starting fetch...`);
            const gamesOfMonth = await fetchGamesForMonth(year, month); // Fetch applies filter
            console.log(`[${renderID}] Fetch successful.`);

            if (renderID !== currentRenderID) { console.log(`[${renderID}] Discarding stale results (current is ${currentRenderID}).`); return; }

            console.log(`[${renderID}] This is the latest request. Processing data...`);
            gamesByDate = processGameData(gamesOfMonth || []); // Assign value here

            console.log(`[${renderID}] Rendering grid...`);
            clearSlideshowIntervals();
            calendarGrid.innerHTML = '';

            document.querySelectorAll('.calendar-day.search-highlight').forEach(cell => { cell.classList.remove('search-highlight'); });

            const firstDayOfMonth = new Date(year, month, 1); const daysInMonth = new Date(year, month + 1, 0).getDate(); const startDayOfWeek = firstDayOfMonth.getDay();
            for (let i = 0; i < startDayOfWeek; i++) createDayCell(null, true);
            for (let day = 1; day <= daysInMonth; day++) { const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`; const gamesForDay = gamesByDate[dateStr] || []; createDayCell(day, false, gamesForDay, dateStr); }
            const totalCells = startDayOfWeek + daysInMonth; const remainingCells = (7 - (totalCells % 7)) % 7; for (let i = 0; i < remainingCells; i++) createDayCell(null, true);

            if (highlightDate) {
                 console.log(`[${renderID}] Attempting to highlight date: ${highlightDate}`);
                 const targetCell = calendarGrid.querySelector(`.calendar-day[data-date="${highlightDate}"]`);
                 if (targetCell) { targetCell.classList.add('search-highlight'); if (targetCell.scrollIntoView) targetCell.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); console.log(`[${renderID}] Highlight applied.`); } else { console.warn(`[${renderID}] Target cell for highlight not found.`); }
            }
            console.log(`[${renderID}] Grid built successfully.`);

        } catch (error) {
            console.error(`[${renderID}] Render/Process error:`, error);
            clearSlideshowIntervals();
            calendarGrid.innerHTML = `<p style="color: red; grid-column: 1 / -1; text-align: center; padding: 20px;">${error.message || 'Failed to load game data.'}</p>`;
        } finally {
            console.log(`[${renderID}] Finalizing render. Hiding loading.`);
            hideLoading();
        }
    }

    // Creates and appends the day cell element
    function createDayCell(dayNumber, isOtherMonth = false, gamesArray = [], dateStr = null) { /* ... (Keep exact implementation including trailer link) ... */
        if (!calendarGrid) return; // Ensure grid exists before appending

        const dayCell = document.createElement('div'); dayCell.classList.add('calendar-day'); dayCell.dataset.day = dayNumber; if (isOtherMonth) dayCell.classList.add('other-month');
        if (!isOtherMonth && dayNumber !== null && dateStr) { dayCell.dataset.date = dateStr; } // data-date
        const daySpan = document.createElement('div'); daySpan.classList.add('day-number'); daySpan.textContent = dayNumber !== null ? dayNumber : ''; dayCell.appendChild(daySpan);
        const validGamesWithImages = gamesArray.filter(g => g && g.background_image);
        if (!isOtherMonth && gamesArray.length > 0) {
            dayCell.classList.add('has-game');
            const gameList = document.createElement('ul'); gameList.classList.add('game-list');
            gamesArray.forEach(game => {
                if (game && game.name) {
                    const listItem = document.createElement('li'); listItem.classList.add('game-list-item'); listItem.textContent = game.name;
                    listItem.title = `${game.name}\nReleased: ${game.released || 'N/A'}\nRating: ${game.rating || 'N/A'} / 5\nMetacritic: ${game.metacritic || 'N/A'}`;
                    // --- Add Click Listener for Trailer ---
                    if (game.clip && game.clip.video) {
                         listItem.style.cursor = 'pointer';
                         listItem.title += `\nTrailer Available!`;
                         listItem.addEventListener('click', (event) => {
                             event.stopPropagation();
                             window.open(game.clip.video, '_blank');
                         });
                    }
                    gameList.appendChild(listItem);
                }
             });
             if (gameList.children.length > 0) {
                dayCell.appendChild(gameList);
             }
            const initialGame = validGamesWithImages.length > 0 ? validGamesWithImages[0] : null; if (initialGame) { dayCell.style.backgroundImage = `url(${initialGame.background_image})`; dayCell.dataset.currentImageIndex = '0'; }
            if (validGamesWithImages.length > 1) {
                const intervalId = setInterval(() => { const style = window.getComputedStyle(dayCell); if (!document.body.contains(dayCell) || style.display === 'none') { clearInterval(intervalId); activeSlideshowIntervals = activeSlideshowIntervals.filter(item => item.id !== intervalId); return; } if (dayCell.classList.contains('is-fading')) return; let currentIndex = parseInt(dayCell.dataset.currentImageIndex || '0', 10); const nextIndex = (currentIndex + 1) % validGamesWithImages.length; const nextGame = validGamesWithImages[nextIndex]; if (!nextGame || !nextGame.background_image) { dayCell.dataset.currentImageIndex = String(nextIndex); return; } const nextImageUrl = `url(${nextGame.background_image})`; dayCell.style.setProperty('--fade-bg-image', nextImageUrl); dayCell.classList.add('is-fading'); setTimeout(() => { if (!document.body.contains(dayCell) || !dayCell.classList.contains('is-fading')) { if (dayCell.classList) { dayCell.classList.remove('is-fading'); dayCell.style.removeProperty('--fade-bg-image'); } return; } dayCell.style.backgroundImage = nextImageUrl; dayCell.classList.remove('is-fading'); dayCell.dataset.currentImageIndex = String(nextIndex); }, FADE_DURATION); }, SLIDESHOW_INTERVAL); activeSlideshowIntervals.push({ id: intervalId, element: dayCell });
            }
        }
        calendarGrid.appendChild(dayCell);
   }

    // --- API Call Functions (Using Proxy and NSFW filter) ---
    // Helper to add common parameters including NSFW filter
    function addApiParams(params) { /* ... (Keep exact implementation) ... */ }
    async function fetchGamesForMonth(year, month) { /* ... (Keep exact implementation) ... */ }
    async function fetchSuggestions(query) { /* ... (Keep exact implementation) ... */ }
    async function searchAndJumpToGame(query) { /* ... (Keep exact implementation) ... */ }

    // --- Suggestion Display Logic ---
    function displaySuggestions(games) { /* ... (Keep exact implementation) ... */ }
    function handleSuggestionClick(game) { /* ... (Keep exact implementation) ... */ }
    const debouncedFetchSuggestions = debounce(async (query) => { if(!searchInput.value.trim()) return; const games = await fetchSuggestions(query); displaySuggestions(games); }, SUGGESTION_DEBOUNCE_DELAY);

    // --- Date Seek Feature ---
    function handleSeek() { /* ... (Keep exact implementation) ... */ }

    // --- Helper Functions ---
    function getMonthName(monthIndex) { return monthNames[monthIndex]; }

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