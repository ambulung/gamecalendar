document.addEventListener('DOMContentLoaded', () => {
    // ... (API Key setup removed as before) ...

    // --- DOM Elements --- (Keep all element references)
    const calendarBody = document.querySelector('.calendar-body');
    const calendarGrid = document.getElementById('calendar-grid');
    const monthYearDisplay = document.getElementById('month-year');
    const prevMonthButton = document.getElementById('prev-month');
    const nextMonthButton = document.getElementById('next-month');
    const loadingIndicator = document.getElementById('loading-indicator');
    // ... all other element refs ...

    // --- State & Constants ---
    let currentDate = new Date();
    // REMOVED: let isLoading = false; // No longer needed for button disabling
    let currentRenderID = 0; // Keep the version counter
    // ... all other state/constants ...

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

    // --- UPDATED showLoading / hideLoading (Removed button disabling) ---
    function showLoading() {
        // REMOVED: isLoading = true;
        // REMOVED: prevMonthButton.disabled = true;
        // REMOVED: nextMonthButton.disabled = true;
        // REMOVED: seekButton.disabled = true;

        const containerRgb = getComputedStyle(document.body).getPropertyValue('--container-bg-rgb').trim() || '255, 255, 255';
        if(loadingIndicator) loadingIndicator.style.backgroundColor = `rgba(${containerRgb}, 0.8)`;
        const target = document.querySelector('.calendar-body') || calendarGrid;
        if (target && loadingIndicator && !target.contains(loadingIndicator)) {
             target.appendChild(loadingIndicator);
        }
        if(loadingIndicator) loadingIndicator.style.display = 'flex';
    }

    function hideLoading() {
         // REMOVED: isLoading = false;
         // REMOVED: prevMonthButton.disabled = false;
         // REMOVED: nextMonthButton.disabled = false;
         // REMOVED: seekButton.disabled = false;

         if (loadingIndicator && loadingIndicator.parentNode) {
             loadingIndicator.parentNode.removeChild(loadingIndicator);
         }
         if (loadingIndicator) {
            loadingIndicator.style.display = 'none';
         }
    }

    // --- UPDATED renderCalendar (Keeping version check) ---
    async function renderCalendar(year, month) {
        showLoading(); // Show loading immediately
        const renderID = ++currentRenderID; // Increment and assign ID for this specific render call

        // Clear previous content *before* awaiting fetch
        clearSlideshowIntervals();
        calendarGrid.innerHTML = '';

        // Update display immediately (even if fetch takes time)
        monthYearDisplay.textContent = `${getMonthName(month)} ${year}`;
        seekMonthSelect.value = month;
        seekYearInput.value = year;

        const firstDayOfMonth = new Date(year, month, 1);
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const startDayOfWeek = firstDayOfMonth.getDay();

        try {
            console.log(`Starting fetch for render ID: ${renderID} (${getMonthName(month)} ${year})`);
            const gamesOfMonth = await fetchGamesForMonth(year, month);

            // *** CRITICAL CHECK ***
            // If the global ID has changed (meaning a newer request started), discard results
            if (renderID !== currentRenderID) {
                console.log(`Discarding results for render ID: ${renderID} (current is ${currentRenderID})`);
                // Do NOT hide loading here - the newer request will handle it.
                return; // Exit without rendering or hiding loading
            }
            console.log(`Processing results for render ID: ${renderID}`);

            const gamesByDate = processGameData(gamesOfMonth);

            // Build Grid Directly (appending)
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
             console.error(`Error in render ID ${renderID}:`, error);
             // Only display error if it belongs to the *latest* request
             if (renderID === currentRenderID) {
                 // Clear grid again before showing error in case stale content was somehow rendered
                 calendarGrid.innerHTML = `<p style="color: red; grid-column: 1 / -1; text-align: center; padding: 20px;">${error.message || 'Failed to load game data.'}</p>`;
             }
        } finally {
             // *** CRITICAL CHECK ***
             // Only hide loading if this is the *latest* request finishing
            if (renderID === currentRenderID) {
                console.log(`Finishing render for ID: ${renderID}`);
                hideLoading();
            } else {
                 console.log(`Skipping hideLoading for stale render ID: ${renderID}`);
            }
        }
    }

    // createDayCell remains the same
    function createDayCell(dayNumber, isOtherMonth = false, gamesArray = []) { /* ... (Keep exact same logic) ... */
        const dayCell = document.createElement('div');
        dayCell.classList.add('calendar-day');
        dayCell.dataset.day = dayNumber;
        if (isOtherMonth) dayCell.classList.add('other-month');

        const daySpan = document.createElement('div');
        daySpan.classList.add('day-number');
        daySpan.textContent = dayNumber !== null ? dayNumber : '';
        dayCell.appendChild(daySpan);

        const validGamesWithImages = gamesArray.filter(g => g.background_image);

        if (!isOtherMonth && gamesArray.length > 0) {
            dayCell.classList.add('has-game');

            const gameList = document.createElement('ul');
            gameList.classList.add('game-list');
            gamesArray.forEach(game => {
                const listItem = document.createElement('li');
                listItem.classList.add('game-list-item');
                listItem.textContent = game.name;
                listItem.title = `${game.name}\nReleased: ${game.released}\nRating: ${game.rating || 'N/A'} / 5\nMetacritic: ${game.metacritic || 'N/A'}`;
                gameList.appendChild(listItem);
            });
            dayCell.appendChild(gameList);

            const initialGame = validGamesWithImages.length > 0 ? validGamesWithImages[0] : null;
            if (initialGame) {
                dayCell.style.backgroundImage = `url(${initialGame.background_image})`;
                dayCell.dataset.currentImageIndex = '0';
            }

            if (validGamesWithImages.length > 1) {
                const intervalId = setInterval(() => {
                    const style = window.getComputedStyle(dayCell);
                    if (!document.body.contains(dayCell) || style.display === 'none') { clearInterval(intervalId); activeSlideshowIntervals = activeSlideshowIntervals.filter(item => item.id !== intervalId); return; }
                    if (dayCell.classList.contains('is-fading')) return;
                     let currentIndex = parseInt(dayCell.dataset.currentImageIndex || '0', 10);
                     const nextIndex = (currentIndex + 1) % validGamesWithImages.length;
                     const nextGame = validGamesWithImages[nextIndex];
                     if (!nextGame || !nextGame.background_image) { dayCell.dataset.currentImageIndex = String(nextIndex); return; }
                     const nextImageUrl = `url(${nextGame.background_image})`;
                     dayCell.style.setProperty('--fade-bg-image', nextImageUrl);
                     dayCell.classList.add('is-fading');
                     setTimeout(() => {
                          if (!document.body.contains(dayCell) || !dayCell.classList.contains('is-fading')) { if (dayCell.classList) { dayCell.classList.remove('is-fading'); dayCell.style.removeProperty('--fade-bg-image'); } return; }
                          dayCell.style.backgroundImage = nextImageUrl;
                          dayCell.classList.remove('is-fading');
                          dayCell.dataset.currentImageIndex = String(nextIndex);
                     }, FADE_DURATION);
                }, SLIDESHOW_INTERVAL);
                activeSlideshowIntervals.push({ id: intervalId, element: dayCell });
            }
        }
        calendarGrid.appendChild(dayCell);
    }


    // --- API Call Functions (Using Proxy) --- (Keep as is)
    async function fetchGamesForMonth(year, month) { /* ... */ }
    async function fetchSuggestions(query) { /* ... */ }
    async function searchAndJumpToGame(query) {
        // Keep the version check logic here too
        showLoading(); // Show loading immediately
        suggestionsContainer.style.display = 'none';
        suggestionsContainer.innerHTML = '';
        const renderID = ++currentRenderID; // Assign unique ID for this operation

        let params = new URLSearchParams({ search: query, page_size: 1, search_exact: 'true' });
        let proxyUrl = `/.netlify/functions/rawg-proxy/games?${params.toString()}`;
        console.log("Searching game (via proxy):", proxyUrl);

        try {
             let response = await fetch(proxyUrl); let data = await response.json();
             if (!response.ok || !data.results || data.results.length === 0) {
                 params = new URLSearchParams({ search: query, page_size: 1 });
                 proxyUrl = `/.netlify/functions/rawg-proxy/games?${params.toString()}`;
                 response = await fetch(proxyUrl);
                 if (!response.ok) { /* ... error handling ... */ throw new Error(/* ... */); }
                 data = await response.json();
             }

            // *** VERSION CHECK before processing jump ***
            if (renderID !== currentRenderID) {
                 console.log(`Search jump aborted (version ${renderID} != ${currentRenderID})`);
                 // No need to hide loading if stale
                 return;
            }

             if (data.results && data.results.length > 0) {
                 const topGame = data.results[0];
                 if (topGame.released) {
                     try {
                         const releaseDate = new Date(topGame.released + 'T00:00:00'); const targetYear = releaseDate.getFullYear(); const targetMonth = releaseDate.getMonth();
                         if (!isNaN(targetYear) && !isNaN(targetMonth)) {
                             currentDate = new Date(targetYear, targetMonth, 1);
                             // RenderCalendar handles its own loading state based on its renderID
                             await renderCalendar(targetYear, targetMonth);
                         } else { throw new Error("Invalid date parsed."); }
                     } catch (dateError) {
                          console.error("Error parsing release date:", topGame.released, dateError);
                          alert(`Found '${topGame.name}' but couldn't parse its release date (${topGame.released}).`);
                          if(renderID === currentRenderID) hideLoading(); // Hide only if this was the latest operation
                     }
                 } else { alert(`Found '${topGame.name}' but it doesn't have a specific release date listed.`); if(renderID === currentRenderID) hideLoading(); }
             } else { alert(`Game "${query}" not found.`); if(renderID === currentRenderID) hideLoading();}
        } catch (error) {
            console.error('Failed to search for game:', error);
            alert(`Error searching for game: ${error.message}`);
            if(renderID === currentRenderID) hideLoading(); // Hide only if this was the latest operation
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