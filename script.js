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
    function applyTheme(theme) { /* ... (no changes) ... */ }
    function toggleTheme() { /* ... (no changes) ... */ }
    // ... (theme init) ...

    // --- Populate Seek Controls ---
    function populateSeekControls() { /* ... (no changes) ... */ }

    // --- Calendar Logic ---
    function clearSlideshowIntervals() { /* ... (no changes) ... */ }

    function showLoading() {
        // Only show loading indicator visually
        const containerRgb = getComputedStyle(document.body).getPropertyValue('--container-bg-rgb').trim() || '255, 255, 255';
        if (loadingIndicator) loadingIndicator.style.backgroundColor = `rgba(${containerRgb}, 0.8)`;
        const target = document.querySelector('.calendar-body') || calendarGrid;
        if (target && loadingIndicator && !target.contains(loadingIndicator)) {
            target.appendChild(loadingIndicator);
        }
        if (loadingIndicator) loadingIndicator.style.display = 'flex';
    }

    function hideLoading() {
        // Only hide loading indicator visually
        if (loadingIndicator && loadingIndicator.parentNode) {
            loadingIndicator.parentNode.removeChild(loadingIndicator);
        }
        if (loadingIndicator) {
            loadingIndicator.style.display = 'none';
        }
    }

    // --- Refined renderCalendar ---
    async function renderCalendar(year, month) {
        const renderID = ++currentRenderID; // Assign unique ID for this render call
        showLoading(); // Show loading indicator

        // Update display text immediately
        monthYearDisplay.textContent = `${getMonthName(month)} ${year}`;
        seekMonthSelect.value = month;
        seekYearInput.value = year;

        // Fetch data *before* clearing the grid
        let gamesOfMonth = null;
        let fetchError = null;

        try {
            console.log(`[${renderID}] Starting fetch for ${getMonthName(month)} ${year}`);
            gamesOfMonth = await fetchGamesForMonth(year, month);
        } catch (error) {
            console.error(`[${renderID}] Fetch error:`, error);
            fetchError = error; // Store error to handle later
        }

        // *** CRITICAL CHECK: Is this still the latest request? ***
        if (renderID !== currentRenderID) {
            console.log(`[${renderID}] Discarding stale results (current is ${currentRenderID}).`);
            // If this stale request errored, we still don't want to necessarily hide loading
            // The latest request will handle hiding it eventually.
            return; // Exit without rendering or hiding loading
        }

        // --- If this IS the latest request, proceed ---
        console.log(`[${renderID}] Processing results...`);
        clearSlideshowIntervals(); // Clear intervals from previous view
        calendarGrid.innerHTML = ''; // NOW clear the grid

        try {
            // Handle fetch error *here* if it occurred
            if (fetchError) {
                throw fetchError; // Re-throw to be caught by the outer catch
            }

            // Process and render fetched data
            const gamesByDate = processGameData(gamesOfMonth || []); // Use empty array if fetch failed but wasn't latest error

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
            // Display error message (this catch block is only reached if renderID === currentRenderID)
            console.error(`[${renderID}] Render error:`, error);
            calendarGrid.innerHTML = `<p style="color: red; grid-column: 1 / -1; text-align: center; padding: 20px;">${error.message || 'Failed to load game data.'}</p>`;
        } finally {
            // **Always** hide loading indicator now, because we only reach here if renderID === currentRenderID
            console.log(`[${renderID}] Finishing render.`);
            hideLoading();
        }
    }

    // createDayCell appends directly, no changes needed here from before
    function createDayCell(dayNumber, isOtherMonth = false, gamesArray = []) { /* ... (Keep exact same logic as previous correct version) ... */
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
         calendarGrid.appendChild(dayCell); // Append here
    }


    // --- API Call Functions (Using Proxy) --- (Keep as is)
    async function fetchGamesForMonth(year, month) { /* ... */ }
    async function fetchSuggestions(query) { /* ... */ }

    // --- Refined searchAndJumpToGame ---
    async function searchAndJumpToGame(query) {
        if (!query) return;

        const renderID = ++currentRenderID; // Increment global ID, assign to this op
        showLoading(); // Show loading
        suggestionsContainer.style.display = 'none';
        suggestionsContainer.innerHTML = '';

        let params = new URLSearchParams({ search: query, page_size: 1, search_exact: 'true' });
        let proxyUrl = `/.netlify/functions/rawg-proxy/games?${params.toString()}`;
        let foundGame = null;
        let searchError = null;

        console.log(`[${renderID}] Searching game (via proxy):`, proxyUrl);
        try {
            let response = await fetch(proxyUrl); let data = await response.json();
            if (!response.ok || !data.results || data.results.length === 0) {
                params = new URLSearchParams({ search: query, page_size: 1 });
                proxyUrl = `/.netlify/functions/rawg-proxy/games?${params.toString()}`;
                response = await fetch(proxyUrl);
                if (!response.ok) { /* ... error handling ... */ throw new Error(/* ... */); }
                data = await response.json();
            }
            if (data.results && data.results.length > 0) {
                foundGame = data.results[0]; // Store the found game
            }
        } catch (error) {
            console.error(`[${renderID}] Failed to search for game:`, error);
            searchError = error; // Store the search error
        }

        // *** VERSION CHECK before proceeding ***
        if (renderID !== currentRenderID) {
            console.log(`[${renderID}] Search jump aborted (stale).`);
            // Don't hide loading - the newer operation will.
            return;
        }

        // --- If this IS the latest operation, handle search results/errors ---
        console.log(`[${renderID}] Processing search result...`);
        if (searchError) {
            alert(`Error searching for game: ${searchError.message}`);
            hideLoading(); // Hide loading as this operation failed definitively
        } else if (foundGame) {
            console.log(`[${renderID}] Found game:`, foundGame.name, foundGame.released);
            if (foundGame.released) {
                try {
                    const releaseDate = new Date(foundGame.released + 'T00:00:00');
                    const targetYear = releaseDate.getFullYear();
                    const targetMonth = releaseDate.getMonth();
                    if (!isNaN(targetYear) && !isNaN(targetMonth)) {
                        currentDate = new Date(targetYear, targetMonth, 1);
                        // Call renderCalendar. It will show its own loading and hide it when done.
                        // Do NOT hide loading here.
                        await renderCalendar(targetYear, targetMonth);
                    } else { throw new Error("Invalid date parsed."); }
                } catch (dateError) {
                     console.error("Error parsing release date:", foundGame.released, dateError);
                     alert(`Found '${foundGame.name}' but couldn't parse its release date (${foundGame.released}).`);
                     hideLoading(); // Hide loading as the jump failed
                }
            } else {
                alert(`Found '${foundGame.name}' but it doesn't have a specific release date listed.`);
                hideLoading(); // Hide loading as we can't jump
            }
        } else {
            alert(`Game "${query}" not found.`);
            hideLoading(); // Hide loading as nothing was found
        }
    }

    // --- Suggestion Display Logic --- (Keep as is)
    function displaySuggestions(games) { /* ... */ }
    function handleSuggestionClick(game) { /* ... */ }
    const debouncedFetchSuggestions = debounce(async (query) => { /* ... */ }, SUGGESTION_DEBOUNCE_DELAY);

    // --- Date Seek Functionality ---
    function handleSeek() {
        // REMOVED isLoading check, rely on renderCalendar's versioning
        const selectedMonth = parseInt(seekMonthSelect.value, 10); const enteredYear = parseInt(seekYearInput.value, 10);
        if (isNaN(selectedMonth) || isNaN(enteredYear) || enteredYear < 1970 || enteredYear > 2100) { alert("Please enter a valid month and year (e.g., 1970-2100)."); return; }
        currentDate = new Date(enteredYear, selectedMonth, 1);
        searchInput.value = ''; suggestionsContainer.style.display = 'none'; suggestionsContainer.innerHTML = '';
        renderCalendar(currentDate.getFullYear(), currentDate.getMonth()); // Let renderCalendar handle loading state
    }

    // --- Helper Functions --- (Keep as is)
    function getMonthName(monthIndex) { return monthNames[monthIndex]; }
    // showLoading/hideLoading updated above

    // --- Event Listeners --- (Keep as is)
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