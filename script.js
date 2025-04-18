document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements --- (References for ALL features)
    const calendarBody = document.querySelector('.calendar-body');
    const calendarGrid = document.getElementById('calendar-grid');
    const monthYearDisplay = document.getElementById('month-year');
    const prevMonthButton = document.getElementById('prev-month');
    const nextMonthButton = document.getElementById('next-month');
    const loadingIndicator = document.getElementById('loading-indicator');
    const themeToggle = document.getElementById('theme-toggle');
    const searchInput = document.getElementById('search-input');
    const suggestionsContainer = document.getElementById('search-suggestions'); // For suggestions
    const seekMonthSelect = document.getElementById('seek-month');             // For seek
    const seekYearInput = document.getElementById('seek-year');               // For seek
    const seekButton = document.getElementById('seek-button');                 // For seek

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

    // --- Populate Seek Controls --- (Seek Date Feature)
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

    function processGameData(games) { // Groups games by release date
        const gamesByDate = {};
        if (!games || games.length === 0) return gamesByDate;
        games.forEach(game => {
            if (game.released && game.name) {
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

        if (renderID !== currentRenderID) { // Check if stale
            console.log(`[${renderID}] Discarding stale results (current is ${currentRenderID}).`);
            return;
        }

        console.log(`[${renderID}] Processing results...`);
        clearSlideshowIntervals();
        calendarGrid.innerHTML = ''; // Clear grid only if processing latest

        try {
            if (fetchError) throw fetchError; // Handle error if latest

            const gamesByDate = processGameData(gamesOfMonth || []);

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
            // Always hide loading if this was the latest request that finished processing
            console.log(`[${renderID}] Finishing render.`);
            hideLoading();
        }
    }

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
        const params = new URLSearchParams({ dates: `${firstDay},${lastDay}`, ordering: 'released,-added,-rating,-metacritic', page_size: 100 });
        const proxyUrl = `/.netlify/functions/rawg-proxy/games?${params.toString()}`;
        try {
            const response = await fetch(proxyUrl); if (!response.ok) { let e = `Proxy Error ${response.status}`; try{const d=await response.json();e=d.detail||d.error||e}catch(err){} throw new Error(`Fetch games failed: ${e}`); } const data = await response.json(); return data.results || [];
        } catch (error) { console.error('Fetch games failed:', error); throw error; }
    }

    // --- Suggestion Search Feature ---
    async function fetchSuggestions(query) {
        if (!query) return [];
        const params = new URLSearchParams({ search: query, page_size: 5, search_precise: 'true' });
        const proxyUrl = `/.netlify/functions/rawg-proxy/games?${params.toString()}`; // Uses proxy
        try {
            const response = await fetch(proxyUrl); if (!response.ok) { console.error(`Suggestion fetch error: ${response.status}`); return []; } const data = await response.json(); return data.results || [];
        } catch (error) { console.error('Failed to fetch suggestions:', error); return []; }
    }

    function displaySuggestions(games) {
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
        searchInput.value = game.name; suggestionsContainer.style.display = 'none'; suggestionsContainer.innerHTML = '';
        searchAndJumpToGame(game.name); // Jump after click
    }

    const debouncedFetchSuggestions = debounce(async (query) => { const games = await fetchSuggestions(query); displaySuggestions(games); }, SUGGESTION_DEBOUNCE_DELAY);
    // --- End Suggestion Search ---


    // --- Search and Jump Feature ---
    async function searchAndJumpToGame(query) {
        if (!query) return;
        const renderID = ++currentRenderID; showLoading(); suggestionsContainer.style.display = 'none'; suggestionsContainer.innerHTML = '';
        let params = new URLSearchParams({ search: query, page_size: 1, search_exact: 'true' }); let proxyUrl = `/.netlify/functions/rawg-proxy/games?${params.toString()}`; let foundGame = null; let searchError = null;
        console.log(`[${renderID}] Searching game (via proxy):`, proxyUrl);
        try {
            let response = await fetch(proxyUrl); let data = await response.json();
            if (!response.ok || !data.results || data.results.length === 0) { params = new URLSearchParams({ search: query, page_size: 1 }); proxyUrl = `/.netlify/functions/rawg-proxy/games?${params.toString()}`; response = await fetch(proxyUrl); if (!response.ok) { let e = `Proxy Error ${response.status}`; try{const d=await response.json();e=d.detail||d.error||`Search Failed`} catch(err){} throw new Error(e); } data = await response.json(); }
            if (data.results && data.results.length > 0) foundGame = data.results[0];
        } catch (error) { console.error(`[${renderID}] Failed to search for game:`, error); searchError = error; }

        if (renderID !== currentRenderID) { console.log(`[${renderID}] Search jump aborted (stale).`); return; } // Check if stale

        console.log(`[${renderID}] Processing search result...`);
        if (searchError) { alert(`Error searching for game: ${searchError.message}`); hideLoading(); }
        else if (foundGame) { console.log(`[${renderID}] Found game:`, foundGame.name, foundGame.released);
            if (foundGame.released) {
                try { const releaseDate = new Date(foundGame.released + 'T00:00:00'); const targetYear = releaseDate.getFullYear(); const targetMonth = releaseDate.getMonth(); if (!isNaN(targetYear) && !isNaN(targetMonth)) { currentDate = new Date(targetYear, targetMonth, 1); await renderCalendar(targetYear, targetMonth); } else { throw new Error("Invalid date parsed."); } } // renderCalendar handles hideLoading
                catch (dateError) { console.error("Error parsing release date:", foundGame.released, dateError); alert(`Found '${foundGame.name}' but couldn't parse its release date (${foundGame.released}).`); hideLoading(); }
            } else { alert(`Found '${foundGame.name}' but it doesn't have a specific release date listed.`); hideLoading(); }
        } else { alert(`Game "${query}" not found.`); hideLoading(); }
    }
    // --- End Search and Jump ---


    // --- Date Seek Feature ---
    function handleSeek() {
        const selectedMonth = parseInt(seekMonthSelect.value, 10); const enteredYear = parseInt(seekYearInput.value, 10);
        if (isNaN(selectedMonth) || isNaN(enteredYear) || enteredYear < 1970 || enteredYear > 2100) { alert("Please enter a valid month and year (e.g., 1970-2100)."); return; }
        currentDate = new Date(enteredYear, selectedMonth, 1);
        searchInput.value = ''; suggestionsContainer.style.display = 'none'; suggestionsContainer.innerHTML = '';
        renderCalendar(currentDate.getFullYear(), currentDate.getMonth()); // Render new date
    }
    // --- End Date Seek ---


    // --- Helper Functions ---
    function getMonthName(monthIndex) { return monthNames[monthIndex]; }
    // showLoading/hideLoading defined above

    // --- Event Listeners (Including Search/Seek/Suggestions) ---
    prevMonthButton.addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth() - 1); searchInput.value = ''; suggestionsContainer.style.display = 'none'; suggestionsContainer.innerHTML = ''; renderCalendar(currentDate.getFullYear(), currentDate.getMonth()); });
    nextMonthButton.addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth() + 1); searchInput.value = ''; suggestionsContainer.style.display = 'none'; suggestionsContainer.innerHTML = ''; renderCalendar(currentDate.getFullYear(), currentDate.getMonth()); });
    // Suggestion listener
    searchInput.addEventListener('input', () => { const query = searchInput.value.trim(); if (query.length > 1) { debouncedFetchSuggestions(query); } else { suggestionsContainer.style.display = 'none'; suggestionsContainer.innerHTML = ''; } });
    // Search jump listener
    searchInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); searchAndJumpToGame(searchInput.value.trim()); } else if (event.key === 'Escape') { suggestionsContainer.style.display = 'none'; suggestionsContainer.innerHTML = ''; } });
    // Hide suggestions listener
    document.addEventListener('click', (event) => { if (!searchInput.contains(event.target) && !suggestionsContainer.contains(event.target)) { suggestionsContainer.style.display = 'none'; suggestionsContainer.innerHTML = ''; } });
    // Seek listeners
    seekButton.addEventListener('click', handleSeek);
    seekYearInput.addEventListener('keypress', (event) => { if (event.key === 'Enter') { event.preventDefault(); handleSeek(); } });

    // --- Initial Load ---
    populateSeekControls(); // Setup seek dropdowns
    renderCalendar(currentDate.getFullYear(), currentDate.getMonth()); // Initial render

}); // End DOMContentLoaded