document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements --- (Keep all element references)
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
    let currentRenderID = 0; // Version counter

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

    // --- *** ADDED BACK processGameData FUNCTION *** ---
    function processGameData(games) {
        const gamesByDate = {};
        if (!games || games.length === 0) return gamesByDate;

        games.forEach(game => {
            if (game.released && game.name) { // Ensure game has a release date and name
                const releaseDate = game.released; // Format: YYYY-MM-DD
                if (!gamesByDate[releaseDate]) {
                    gamesByDate[releaseDate] = []; // Initialize array if date not seen before
                }
                // Add game to the date's array only if under the limit
                if (gamesByDate[releaseDate].length < MAX_GAMES_PER_DAY) {
                    // Basic duplicate check (by ID) just in case API returns duplicates for a day
                    if (!gamesByDate[releaseDate].some(existing => existing.id === game.id)) {
                         gamesByDate[releaseDate].push(game);
                    }
                }
            }
        });
        // The sorting is handled by the API request's 'ordering' parameter.
        // This function just groups and limits the number per day.
        return gamesByDate;
    }
    // --- *** END of added function *** ---


    async function renderCalendar(year, month) {
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

        try {
            if (fetchError) throw fetchError; // Handle error if this is latest request

            const gamesByDate = processGameData(gamesOfMonth || []); // Use processGameData

            const firstDayOfMonth = new Date(year, month, 1);
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            const startDayOfWeek = firstDayOfMonth.getDay();

            for (let i = 0; i < startDayOfWeek; i++) createDayCell(null, true);
            for (let day = 1; day <= daysInMonth; day++) {
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const gamesForDay = gamesByDate[dateStr] || [];
                createDayCell(day, false, gamesForDay);
            }
            const totalCells = startDayOfWeek + daysInMonth;
            const remainingCells = (7 - (totalCells % 7)) % 7;
            for (let i = 0; i < remainingCells; i++) createDayCell(null, true);

        } catch (error) {
            console.error(`[${renderID}] Render error:`, error);
            calendarGrid.innerHTML = `<p style="color: red; grid-column: 1 / -1; text-align: center; padding: 20px;">${error.message || 'Failed to load game data.'}</p>`;
        } finally {
            console.log(`[${renderID}] Finishing render.`);
            hideLoading(); // Always hide if latest
        }
    }

    // createDayCell appends directly
    function createDayCell(dayNumber, isOtherMonth = false, gamesArray = []) {
        const dayCell = document.createElement('div'); dayCell.classList.add('calendar-day'); dayCell.dataset.day = dayNumber; if (isOtherMonth) dayCell.classList.add('other-month');
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
    async function fetchGamesForMonth(year, month) {
        const firstDay = `${year}-${String(month + 1).padStart(2, '0')}-01`;
        const lastDayDate = new Date(year, month + 1, 0);
        const lastDay = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDayDate.getDate()).padStart(2, '0')}`;
        const pageSize = 100;
        const ordering = 'released,-added,-rating,-metacritic';
        const params = new URLSearchParams({ dates: `${firstDay},${lastDay}`, ordering: ordering, page_size: pageSize });
        const proxyUrl = `/.netlify/functions/rawg-proxy/games?${params.toString()}`;
        console.log("Fetching month games (via proxy):", proxyUrl);
        try {
            const response = await fetch(proxyUrl);
            if (!response.ok) { let errorDetail = `Proxy Error ${response.status}`; try { const errorData = await response.json(); errorDetail = errorData.detail || errorData.error || errorDetail; } catch(e){ errorDetail = `${errorDetail} ${response.statusText}`;} throw new Error(`Failed to fetch games: ${errorDetail}`); }
            const data = await response.json(); return data.results || [];
        } catch (error) { console.error('Fetch failed:', error); throw error; }
    }
    async function fetchSuggestions(query) {
        if (!query) return [];
        const params = new URLSearchParams({ search: query, page_size: 5, search_precise: 'true' });
        const proxyUrl = `/.netlify/functions/rawg-proxy/games?${params.toString()}`;
        try {
            const response = await fetch(proxyUrl); if (!response.ok) { console.error(`Suggestion fetch error: ${response.status}`); return []; } const data = await response.json(); return data.results || [];
        } catch (error) { console.error('Failed to fetch suggestions:', error); return []; }
    }
    async function searchAndJumpToGame(query) {
        if (!query) return;
        const renderID = ++currentRenderID; showLoading(); suggestionsContainer.style.display = 'none'; suggestionsContainer.innerHTML = '';
        let params = new URLSearchParams({ search: query, page_size: 1, search_exact: 'true' }); let proxyUrl = `/.netlify/functions/rawg-proxy/games?${params.toString()}`; let foundGame = null; let searchError = null;
        console.log(`[${renderID}] Searching game (via proxy):`, proxyUrl);
        try {
            let response = await fetch(proxyUrl); let data = await response.json();
            if (!response.ok || !data.results || data.results.length === 0) { params = new URLSearchParams({ search: query, page_size: 1 }); proxyUrl = `/.netlify/functions/rawg-proxy/games?${params.toString()}`; response = await fetch(proxyUrl); if (!response.ok) { let errorDetail = `Proxy Error ${response.status}`; try{ const errorData = await response.json(); errorDetail = errorData.detail || errorData.error || `Search Failed`; } catch(e) {} throw new Error(errorDetail); } data = await response.json(); }
            if (data.results && data.results.length > 0) foundGame = data.results[0];
        } catch (error) { console.error(`[${renderID}] Failed to search for game:`, error); searchError = error; }
        if (renderID !== currentRenderID) { console.log(`[${renderID}] Search jump aborted (stale).`); return; }
        console.log(`[${renderID}] Processing search result...`);
        if (searchError) { alert(`Error searching for game: ${searchError.message}`); hideLoading(); }
        else if (foundGame) { console.log(`[${renderID}] Found game:`, foundGame.name, foundGame.released);
            if (foundGame.released) {
                try { const releaseDate = new Date(foundGame.released + 'T00:00:00'); const targetYear = releaseDate.getFullYear(); const targetMonth = releaseDate.getMonth(); if (!isNaN(targetYear) && !isNaN(targetMonth)) { currentDate = new Date(targetYear, targetMonth, 1); await renderCalendar(targetYear, targetMonth); } else { throw new Error("Invalid date parsed."); } }
                catch (dateError) { console.error("Error parsing release date:", foundGame.released, dateError); alert(`Found '${foundGame.name}' but couldn't parse its release date (${foundGame.released}).`); hideLoading(); }
            } else { alert(`Found '${foundGame.name}' but it doesn't have a specific release date listed.`); hideLoading(); }
        } else { alert(`Game "${query}" not found.`); hideLoading(); }
    }

    // --- Suggestion Display Logic ---
    function displaySuggestions(games) { /* ... (no changes) ... */ }
    function handleSuggestionClick(game) { /* ... (no changes) ... */ }
    const debouncedFetchSuggestions = debounce(async (query) => { const games = await fetchSuggestions(query); displaySuggestions(games); }, SUGGESTION_DEBOUNCE_DELAY);

    // --- Date Seek Functionality ---
    function handleSeek() { /* ... (no changes) ... */ }

    // --- Helper Functions ---
    function getMonthName(monthIndex) { return monthNames[monthIndex]; }
    // showLoading/hideLoading defined above

    // --- Event Listeners ---
    prevMonthButton.addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth() - 1); searchInput.value = ''; suggestionsContainer.style.display = 'none'; suggestionsContainer.innerHTML = ''; renderCalendar(currentDate.getFullYear(), currentDate.getMonth()); });
    nextMonthButton.addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth() + 1); searchInput.value = ''; suggestionsContainer.style.display = 'none'; suggestionsContainer.innerHTML = ''; renderCalendar(currentDate.getFullYear(), currentDate.getMonth()); });
    searchInput.addEventListener('input', () => { const query = searchInput.value.trim(); if (query.length > 1) { debouncedFetchSuggestions(query); } else { suggestionsContainer.style.display = 'none'; suggestionsContainer.innerHTML = ''; } });
    searchInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); searchAndJumpToGame(searchInput.value.trim()); } else if (event.key === 'Escape') { suggestionsContainer.style.display = 'none'; suggestionsContainer.innerHTML = ''; } });
    document.addEventListener('click', (event) => { if (!searchInput.contains(event.target) && !suggestionsContainer.contains(event.target)) { suggestionsContainer.style.display = 'none'; suggestionsContainer.innerHTML = ''; } });
    seekButton.addEventListener('click', handleSeek);
    seekYearInput.addEventListener('keypress', (event) => { if (event.key === 'Enter') { event.preventDefault(); handleSeek(); } });

    // --- Initial Load ---
    populateSeekControls();
    renderCalendar(currentDate.getFullYear(), currentDate.getMonth());

}); // End DOMContentLoaded