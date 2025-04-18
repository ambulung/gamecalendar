document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements --- (Keep all)
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

    // --- State & Constants --- (Keep all)
    let currentDate = new Date();
    const MAX_GAMES_PER_DAY = 10;
    let activeSlideshowIntervals = [];
    const SLIDESHOW_INTERVAL = 5000;
    const FADE_DURATION = 700;
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const SUGGESTION_DEBOUNCE_DELAY = 350;
    let currentRenderID = 0;

    // --- Utility: Debounce --- (Keep)
    function debounce(func, delay) { /* ... */ }

    // --- Theme Management --- (Keep)
    function applyTheme(theme) { /* ... */ }
    function toggleTheme() { /* ... */ }
    // ... (theme init) ...

    // --- Populate Seek Controls --- (Keep)
    function populateSeekControls() { /* ... */ }

    // --- Calendar Logic ---
    function clearSlideshowIntervals() { /* ... */ }
    function showLoading() { /* ... */ }
    function hideLoading() { /* ... */ }
    function processGameData(games) { /* ... */ } // Keep this function

    // --- UPDATED renderCalendar (Accepts highlightDate) ---
    async function renderCalendar(year, month, highlightDate = null) { // Added highlightDate parameter
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

        // Check if stale BEFORE clearing grid
        if (renderID !== currentRenderID) {
            console.log(`[${renderID}] Discarding stale results (current is ${currentRenderID}).`);
            return;
        }

        console.log(`[${renderID}] Processing results...`);
        clearSlideshowIntervals();
        calendarGrid.innerHTML = ''; // Clear grid only if processing latest

        // --- Clear previous search highlights ---
        document.querySelectorAll('.calendar-day.search-highlight').forEach(cell => {
            cell.classList.remove('search-highlight');
        });
        // --- End Clear highlights ---

        try {
            if (fetchError) throw fetchError;

            const gamesByDate = processGameData(gamesOfMonth || []);

            const firstDayOfMonth = new Date(year, month, 1);
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            const startDayOfWeek = firstDayOfMonth.getDay();

            for (let i = 0; i < startDayOfWeek; i++) createDayCell(null, true);
            for (let day = 1; day <= daysInMonth; day++) {
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const gamesForDay = gamesByDate[dateStr] || [];
                createDayCell(day, false, gamesForDay, dateStr); // Pass dateStr
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
                    // Optional: Scroll the highlighted cell into view within the calendar-body
                     targetCell.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    console.log(`[${renderID}] Highlight applied.`);
                } else {
                     console.log(`[${renderID}] Target cell for highlight not found.`);
                }
            }
            // --- End Apply Highlight ---

        } catch (error) {
            console.error(`[${renderID}] Render error:`, error);
            calendarGrid.innerHTML = `<p style="color: red; grid-column: 1 / -1; text-align: center; padding: 20px;">${error.message || 'Failed to load game data.'}</p>`;
        } finally {
            console.log(`[${renderID}] Finishing render.`);
            hideLoading(); // Always hide if latest
        }
    }

    // --- UPDATED createDayCell (Adds data-date) ---
    function createDayCell(dayNumber, isOtherMonth = false, gamesArray = [], dateStr = null) { // Added dateStr parameter
        const dayCell = document.createElement('div');
        dayCell.classList.add('calendar-day');
        dayCell.dataset.day = dayNumber;
        if (isOtherMonth) dayCell.classList.add('other-month');

        // Add data-date attribute if it's a valid day of the current month
        if (!isOtherMonth && dayNumber !== null && dateStr) {
            dayCell.dataset.date = dateStr; // Store YYYY-MM-DD
        }

        const daySpan = document.createElement('div');
        daySpan.classList.add('day-number');
        daySpan.textContent = dayNumber !== null ? dayNumber : '';
        dayCell.appendChild(daySpan);

        const validGamesWithImages = gamesArray.filter(g => g.background_image);

        if (!isOtherMonth && gamesArray.length > 0) {
            dayCell.classList.add('has-game');
            // ... (gameList creation logic remains the same) ...
             const gameList = document.createElement('ul'); gameList.classList.add('game-list'); gamesArray.forEach(game => { const listItem = document.createElement('li'); listItem.classList.add('game-list-item'); listItem.textContent = game.name; listItem.title = `${game.name}\nReleased: ${game.released}\nRating: ${game.rating || 'N/A'} / 5\nMetacritic: ${game.metacritic || 'N/A'}`; gameList.appendChild(listItem); }); dayCell.appendChild(gameList);
             const initialGame = validGamesWithImages.length > 0 ? validGamesWithImages[0] : null; if (initialGame) { dayCell.style.backgroundImage = `url(${initialGame.background_image})`; dayCell.dataset.currentImageIndex = '0'; }
            // ... (slideshow interval logic remains the same) ...
            if (validGamesWithImages.length > 1) {
                const intervalId = setInterval(() => { const style = window.getComputedStyle(dayCell); if (!document.body.contains(dayCell) || style.display === 'none') { clearInterval(intervalId); activeSlideshowIntervals = activeSlideshowIntervals.filter(item => item.id !== intervalId); return; } if (dayCell.classList.contains('is-fading')) return; let currentIndex = parseInt(dayCell.dataset.currentImageIndex || '0', 10); const nextIndex = (currentIndex + 1) % validGamesWithImages.length; const nextGame = validGamesWithImages[nextIndex]; if (!nextGame || !nextGame.background_image) { dayCell.dataset.currentImageIndex = String(nextIndex); return; } const nextImageUrl = `url(${nextGame.background_image})`; dayCell.style.setProperty('--fade-bg-image', nextImageUrl); dayCell.classList.add('is-fading'); setTimeout(() => { if (!document.body.contains(dayCell) || !dayCell.classList.contains('is-fading')) { if (dayCell.classList) { dayCell.classList.remove('is-fading'); dayCell.style.removeProperty('--fade-bg-image'); } return; } dayCell.style.backgroundImage = nextImageUrl; dayCell.classList.remove('is-fading'); dayCell.dataset.currentImageIndex = String(nextIndex); }, FADE_DURATION); }, SLIDESHOW_INTERVAL); activeSlideshowIntervals.push({ id: intervalId, element: dayCell });
            }
        }
        calendarGrid.appendChild(dayCell);
   }


    // --- API Call Functions (Using Proxy) --- (Keep as is)
    async function fetchGamesForMonth(year, month) { /* ... */ }
    async function fetchSuggestions(query) { /* ... */ }

    // --- UPDATED searchAndJumpToGame (Passes highlightDate) ---
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

        if (renderID !== currentRenderID) { console.log(`[${renderID}] Search jump aborted (stale).`); return; }

        console.log(`[${renderID}] Processing search result...`);
        if (searchError) { alert(`Error searching for game: ${searchError.message}`); hideLoading(); }
        else if (foundGame) { console.log(`[${renderID}] Found game:`, foundGame.name, foundGame.released);
            if (foundGame.released) {
                const highlightDate = foundGame.released; // Get the date string YYYY-MM-DD
                try {
                    const releaseDate = new Date(highlightDate + 'T00:00:00'); // Use highlightDate for parsing
                    const targetYear = releaseDate.getFullYear();
                    const targetMonth = releaseDate.getMonth();
                    if (!isNaN(targetYear) && !isNaN(targetMonth)) {
                        currentDate = new Date(targetYear, targetMonth, 1);
                        // *** Pass highlightDate to renderCalendar ***
                        await renderCalendar(targetYear, targetMonth, highlightDate);
                    } else { throw new Error("Invalid date parsed."); }
                } catch (dateError) {
                     console.error("Error parsing release date:", highlightDate, dateError);
                     alert(`Found '${foundGame.name}' but couldn't parse its release date (${highlightDate}).`);
                     hideLoading();
                }
            } else {
                alert(`Found '${foundGame.name}' but it doesn't have a specific release date listed.`);
                hideLoading();
            }
        } else { alert(`Game "${query}" not found.`); hideLoading(); }
    }

    // --- Suggestion Display Logic --- (Keep as is)
    function displaySuggestions(games) { /* ... */ }
    function handleSuggestionClick(game) { /* ... */ }
    const debouncedFetchSuggestions = debounce(async (query) => { /* ... */ }, SUGGESTION_DEBOUNCE_DELAY);

    // --- Date Seek Feature (Ensure highlight is cleared) ---
    function handleSeek() {
        const selectedMonth = parseInt(seekMonthSelect.value, 10); const enteredYear = parseInt(seekYearInput.value, 10);
        if (isNaN(selectedMonth) || isNaN(enteredYear) || enteredYear < 1970 || enteredYear > 2100) { alert("Please enter a valid month and year (e.g., 1970-2100)."); return; }
        currentDate = new Date(enteredYear, selectedMonth, 1);
        searchInput.value = ''; suggestionsContainer.style.display = 'none'; suggestionsContainer.innerHTML = '';
        renderCalendar(currentDate.getFullYear(), currentDate.getMonth()); // Call without highlightDate
    }

    // --- Helper Functions --- (Keep as is)
    function getMonthName(monthIndex) { return monthNames[monthIndex]; }
    // showLoading/hideLoading defined above

    // --- Event Listeners (Ensure Prev/Next clear highlight) ---
    prevMonthButton.addEventListener('click', () => {
        currentDate.setMonth(currentDate.getMonth() - 1);
        searchInput.value = ''; suggestionsContainer.style.display = 'none'; suggestionsContainer.innerHTML = '';
        renderCalendar(currentDate.getFullYear(), currentDate.getMonth()); // Call without highlightDate
    });
    nextMonthButton.addEventListener('click', () => {
        currentDate.setMonth(currentDate.getMonth() + 1);
        searchInput.value = ''; suggestionsContainer.style.display = 'none'; suggestionsContainer.innerHTML = '';
        renderCalendar(currentDate.getFullYear(), currentDate.getMonth()); // Call without highlightDate
    });
    // ... (Keep other listeners: search input, keydown, document click, seek button/enter) ...
    searchInput.addEventListener('input', () => { const query = searchInput.value.trim(); if (query.length > 1) { debouncedFetchSuggestions(query); } else { suggestionsContainer.style.display = 'none'; suggestionsContainer.innerHTML = ''; } });
    searchInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); searchAndJumpToGame(searchInput.value.trim()); } else if (event.key === 'Escape') { suggestionsContainer.style.display = 'none'; suggestionsContainer.innerHTML = ''; } });
    document.addEventListener('click', (event) => { if (!searchInput.contains(event.target) && !suggestionsContainer.contains(event.target)) { suggestionsContainer.style.display = 'none'; suggestionsContainer.innerHTML = ''; } });
    seekButton.addEventListener('click', handleSeek);
    seekYearInput.addEventListener('keypress', (event) => { if (event.key === 'Enter') { event.preventDefault(); handleSeek(); } });


    // --- Initial Load ---
    populateSeekControls();
    renderCalendar(currentDate.getFullYear(), currentDate.getMonth()); // Initial render without highlight

}); // End DOMContentLoaded