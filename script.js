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
    themeToggle.addEventListener('change', toggleTheme);

    // --- Populate Seek Controls ---
    function populateSeekControls() {
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
        const containerRgb = getComputedStyle(document.body).getPropertyValue('--container-bg-rgb').trim() || '255, 255, 255';
        if (loadingIndicator) loadingIndicator.style.backgroundColor = `rgba(${containerRgb}, 0.8)`;
        const target = document.querySelector('.calendar-body') || calendarGrid;
        if (target && loadingIndicator && !target.contains(loadingIndicator)) {
            target.appendChild(loadingIndicator);
        }
        if (loadingIndicator) loadingIndicator.style.display = 'flex';
    }

    function hideLoading() {
        if (loadingIndicator && loadingIndicator.parentNode) {
            loadingIndicator.parentNode.removeChild(loadingIndicator);
        }
        if (loadingIndicator) {
            loadingIndicator.style.display = 'none';
        }
    }

    // --- **** ADDED BACK processGameData FUNCTION **** ---
    function processGameData(games) {
        const gamesByDate = {}; // Initialize the result object
        if (!games || games.length === 0) {
             return gamesByDate; // Return empty object if no games
        }

        games.forEach(game => {
            // Ensure the game has the necessary properties
            if (game && game.released && game.name) {
                const releaseDate = game.released; // Format: YYYY-MM-DD

                // Initialize array for the date if it doesn't exist yet
                if (!gamesByDate[releaseDate]) {
                    gamesByDate[releaseDate] = [];
                }

                // Add game to the array for that date, respecting the limit
                if (gamesByDate[releaseDate].length < MAX_GAMES_PER_DAY) {
                    // Optional: Basic duplicate check just in case
                    if (!gamesByDate[releaseDate].some(existing => existing.id === game.id)) {
                        gamesByDate[releaseDate].push(game);
                    }
                }
            }
        });
        // Sorting is primarily handled by the API's 'ordering' param.
        // This function groups and limits.
        return gamesByDate; // Return the populated object
    }
    // --- **** END of added function **** ---


    async function renderCalendar(year, month, highlightDate = null) {
        const renderID = ++currentRenderID;
        showLoading();

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
            fetchError = error;
        }

        if (renderID !== currentRenderID) {
            console.log(`[${renderID}] Discarding stale results (current is ${currentRenderID}).`);
            return;
        }

        console.log(`[${renderID}] Processing results...`);
        clearSlideshowIntervals();
        calendarGrid.innerHTML = ''; // Clear grid now

        // --- Clear previous search highlights ---
        document.querySelectorAll('.calendar-day.search-highlight').forEach(cell => {
            cell.classList.remove('search-highlight');
        });

        try {
            if (fetchError) throw fetchError;

            // *** Use the processGameData function ***
            const gamesByDate = processGameData(gamesOfMonth || []);

            const firstDayOfMonth = new Date(year, month, 1);
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            const startDayOfWeek = firstDayOfMonth.getDay();

            for (let i = 0; i < startDayOfWeek; i++) createDayCell(null, true);
            for (let day = 1; day <= daysInMonth; day++) {
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const gamesForDay = gamesByDate[dateStr] || []; // Use gamesByDate here
                createDayCell(day, false, gamesForDay, dateStr);
            }
            const totalCells = startDayOfWeek + daysInMonth;
            const remainingCells = (7 - (totalCells % 7)) % 7;
            for (let i = 0; i < remainingCells; i++) createDayCell(null, true);

            // Apply Highlight if needed
            if (highlightDate) {
                console.log(`[${renderID}] Attempting to highlight date: ${highlightDate}`);
                const targetCell = calendarGrid.querySelector(`.calendar-day[data-date="${highlightDate}"]`);
                if (targetCell) {
                    targetCell.classList.add('search-highlight');
                    targetCell.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    console.log(`[${renderID}] Highlight applied.`);
                } else {
                     console.log(`[${renderID}] Target cell for highlight not found.`);
                }
            }

        } catch (error) {
            console.error(`[${renderID}] Render error:`, error);
            calendarGrid.innerHTML = `<p style="color: red; grid-column: 1 / -1; text-align: center; padding: 20px;">${error.message || 'Failed to load game data.'}</p>`;
        } finally {
            console.log(`[${renderID}] Finishing render.`);
            hideLoading(); // Always hide if latest
        }
    }

    function createDayCell(dayNumber, isOtherMonth = false, gamesArray = [], dateStr = null) {
        const dayCell = document.createElement('div'); dayCell.classList.add('calendar-day'); dayCell.dataset.day = dayNumber; if (isOtherMonth) dayCell.classList.add('other-month');
        // Add data-date attribute
        if (!isOtherMonth && dayNumber !== null && dateStr) { dayCell.dataset.date = dateStr; }
        const daySpan = document.createElement('div'); daySpan.classList.add('day-number'); daySpan.textContent = dayNumber !== null ? dayNumber : ''; dayCell.appendChild(daySpan);
        const validGamesWithImages = gamesArray.filter(g => g.background_image);
        if (!isOtherMonth && gamesArray.length > 0) {
            dayCell.classList.add('has-game');
            const gameList = document.createElement('ul'); gameList.classList.add('game-list'); gamesArray.forEach(game => { const listItem = document.createElement('li'); listItem.classList.add('game-list-item'); listItem.textContent = game.name; listItem.title = `${game.name}\nReleased: ${game.released}\nRating: ${game.rating || 'N/A'} / 5\nMetacritic: ${game.metacritic || 'N/A'}`; gameList.appendChild(listItem); }); dayCell.appendChild(gameList);
            const initialGame = validGamesWithImages.length > 0 ? validGamesWithImages[0] : null; if (initialGame) { dayCell.style.backgroundImage = `url(${initialGame.background_image})`; dayCell.dataset.currentImageIndex = '0'; }
            if (validGamesWithImages.length > 1) {
                const intervalId = setInterval(() => { const style = window.getComputedStyle(dayCell); if (!document.body.contains(dayCell) || style.display === 'none') { clearInterval(intervalId); activeSlideshowIntervals = activeSlideshowIntervals.filter(item => item.id !== intervalId); return; } if (dayCell.classList.contains('is-fading')) return; let currentIndex = parseInt(dayCell.dataset.currentImageIndex || '0', 10); const nextIndex = (currentIndex + 1) % validGamesWithImages.length; const nextGame = validGamesWithImages[nextIndex]; if (!nextGame || !nextGame.background_image) { dayCell.dataset.currentImageIndex = String(nextIndex); return; } const nextImageUrl = `url(${nextGame.background_image})`; dayCell.style.setProperty('--fade-bg-image', nextImageUrl); dayCell.classList.add('is-fading'); setTimeout(() => { if (!document.body.contains(dayCell) || !dayCell.classList.contains('is-fading')) { if (dayCell.classList) { dayCell.classList.remove('is-fading'); dayCell.style.removeProperty('--fade-bg-image'); } return; } dayCell.style.backgroundImage = nextImageUrl; dayCell.classList.remove('is-fading'); dayCell.dataset.currentImageIndex = String(nextIndex); }, FADE_DURATION); }, SLIDESHOW_INTERVAL); activeSlideshowIntervals.push({ id: intervalId, element: dayCell });
            }
        }
        calendarGrid.appendChild(dayCell);
   }


    // --- API Call Functions (Using Proxy) ---
    async function fetchGamesForMonth(year, month) { /* ... (Keep as is) ... */ }
    async function fetchSuggestions(query) { /* ... (Keep as is) ... */ }
    async function searchAndJumpToGame(query) { /* ... (Keep as is - includes highlightDate pass) ... */ }

    // --- Suggestion Display Logic ---
    function displaySuggestions(games) { /* ... (Keep as is) ... */ }
    function handleSuggestionClick(game) { /* ... (Keep as is) ... */ }
    const debouncedFetchSuggestions = debounce(async (query) => { const games = await fetchSuggestions(query); displaySuggestions(games); }, SUGGESTION_DEBOUNCE_DELAY);

    // --- Date Seek Feature ---
    function handleSeek() { /* ... (Keep as is - calls renderCalendar without highlightDate) ... */ }

    // --- Helper Functions ---
    function getMonthName(monthIndex) { return monthNames[monthIndex]; }
    // showLoading/hideLoading defined above

    // --- Event Listeners ---
    prevMonthButton.addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth() - 1); searchInput.value = ''; suggestionsContainer.style.display = 'none'; suggestionsContainer.innerHTML = ''; renderCalendar(currentDate.getFullYear(), currentDate.getMonth()); /* No highlight */ });
    nextMonthButton.addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth() + 1); searchInput.value = ''; suggestionsContainer.style.display = 'none'; suggestionsContainer.innerHTML = ''; renderCalendar(currentDate.getFullYear(), currentDate.getMonth()); /* No highlight */ });
    searchInput.addEventListener('input', () => { const query = searchInput.value.trim(); if (query.length > 1) { debouncedFetchSuggestions(query); } else { suggestionsContainer.style.display = 'none'; suggestionsContainer.innerHTML = ''; } });
    searchInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); searchAndJumpToGame(searchInput.value.trim()); } else if (event.key === 'Escape') { suggestionsContainer.style.display = 'none'; suggestionsContainer.innerHTML = ''; } });
    document.addEventListener('click', (event) => { if (!searchInput.contains(event.target) && !suggestionsContainer.contains(event.target)) { suggestionsContainer.style.display = 'none'; suggestionsContainer.innerHTML = ''; } });
    seekButton.addEventListener('click', handleSeek);
    seekYearInput.addEventListener('keypress', (event) => { if (event.key === 'Enter') { event.preventDefault(); handleSeek(); } });

    // --- Initial Load ---
    populateSeekControls();
    renderCalendar(currentDate.getFullYear(), currentDate.getMonth()); // Initial render without highlight

}); // End DOMContentLoaded