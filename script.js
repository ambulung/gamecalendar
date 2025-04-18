document.addEventListener('DOMContentLoaded', () => {
    // --- API Key is NO LONGER DEFINED HERE ---
    // It will be handled by the serverless function via environment variables

    // --- DOM Elements ---
    const calendarBody = document.querySelector('.calendar-body'); // For loading indicator target
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
    const FADE_DURATION = 700; // Corresponds to CSS --fade-duration
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const SUGGESTION_DEBOUNCE_DELAY = 350;

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

    async function renderCalendar(year, month) {
        showLoading();
        clearSlideshowIntervals();
        calendarGrid.innerHTML = '';
        monthYearDisplay.textContent = `${getMonthName(month)} ${year}`;
        seekMonthSelect.value = month;
        seekYearInput.value = year;

        const firstDayOfMonth = new Date(year, month, 1);
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const startDayOfWeek = firstDayOfMonth.getDay();

        try {
            // Fetch games using the proxy endpoint
            const gamesOfMonth = await fetchGamesForMonth(year, month);
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
             console.error("Error rendering calendar:", error);
             // Display error message within the grid area
             calendarGrid.innerHTML = `<p style="color: red; grid-column: 1 / -1; text-align: center; padding: 20px;">${error.message || 'Failed to load game data.'}</p>`;
        } finally {
            hideLoading();
        }
    }

    // Appends the day cell element to the grid
    function createDayCell(dayNumber, isOtherMonth = false, gamesArray = []) {
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

            // Slideshow setup
            if (validGamesWithImages.length > 1) {
                const intervalId = setInterval(() => {
                    const style = window.getComputedStyle(dayCell);
                    // Check if element exists and is displayed (relevant for responsive changes)
                    if (!document.body.contains(dayCell) || style.display === 'none') {
                        clearInterval(intervalId);
                        activeSlideshowIntervals = activeSlideshowIntervals.filter(item => item.id !== intervalId);
                        return;
                    }
                    // Prevent starting a new fade if one is already in progress
                    if (dayCell.classList.contains('is-fading')) return;

                     let currentIndex = parseInt(dayCell.dataset.currentImageIndex || '0', 10);
                     const nextIndex = (currentIndex + 1) % validGamesWithImages.length;
                     const nextGame = validGamesWithImages[nextIndex];
                     // Skip if the next game somehow lacks an image (shouldn't happen with filter)
                     if (!nextGame || !nextGame.background_image) {
                          dayCell.dataset.currentImageIndex = String(nextIndex); // Still advance index
                          return;
                     }
                     const nextImageUrl = `url(${nextGame.background_image})`;

                     // Set ::after bg to NEXT image
                     dayCell.style.setProperty('--fade-bg-image', nextImageUrl);
                     // Add class to fade IN ::after
                     dayCell.classList.add('is-fading');

                     // After fade duration, update stable bg & remove class
                     setTimeout(() => {
                          if (!document.body.contains(dayCell) || !dayCell.classList.contains('is-fading')) {
                               if (dayCell.classList) { // Check element still exists
                                 dayCell.classList.remove('is-fading');
                                 dayCell.style.removeProperty('--fade-bg-image');
                               } return;
                          }
                          dayCell.style.backgroundImage = nextImageUrl; // Set stable bg
                          dayCell.classList.remove('is-fading'); // Fade out ::after
                          dayCell.dataset.currentImageIndex = String(nextIndex); // Update index
                     }, FADE_DURATION);
                }, SLIDESHOW_INTERVAL);
                activeSlideshowIntervals.push({ id: intervalId, element: dayCell });
            }
        }
        // Append the fully constructed cell to the grid
        calendarGrid.appendChild(dayCell);
    }

    // --- API Call Functions (Using Proxy) ---

    async function fetchGamesForMonth(year, month) {
        const firstDay = `${year}-${String(month + 1).padStart(2, '0')}-01`;
        const lastDayDate = new Date(year, month + 1, 0);
        const lastDay = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDayDate.getDate()).padStart(2, '0')}`;
        const pageSize = 100;
        const ordering = 'released,-added,-rating,-metacritic';

        const params = new URLSearchParams({
            dates: `${firstDay},${lastDay}`,
            ordering: ordering,
            page_size: pageSize
        });
        // Use relative path for Netlify function
        const proxyUrl = `/.netlify/functions/rawg-proxy/games?${params.toString()}`;

        console.log("Fetching month games (via proxy):", proxyUrl);
        try {
            const response = await fetch(proxyUrl);
            if (!response.ok) {
                let errorDetail = `Proxy Error ${response.status}`;
                try { const errorData = await response.json(); errorDetail = errorData.detail || errorData.error || errorDetail; } catch(e){ errorDetail = `${errorDetail} ${response.statusText}`;}
                throw new Error(`Failed to fetch games: ${errorDetail}`);
            }
            const data = await response.json();
            return data.results || [];
        } catch (error) {
            console.error('Fetch failed:', error);
            throw error; // Re-throw to be handled by renderCalendar
        }
    }

    async function fetchSuggestions(query) {
        if (!query) return [];
        const params = new URLSearchParams({
            search: query,
            page_size: 5,
            search_precise: 'true'
        });
        // Use relative path for Netlify function
        const proxyUrl = `/.netlify/functions/rawg-proxy/games?${params.toString()}`;

        try {
            const response = await fetch(proxyUrl);
            if (!response.ok) {
                console.error(`Suggestion fetch error: ${response.status}`);
                return [];
            }
            const data = await response.json();
            return data.results || [];
        } catch (error) {
            console.error('Failed to fetch suggestions:', error);
            return [];
        }
    }

    async function searchAndJumpToGame(query) {
        if (!query) return;
        showLoading();
        suggestionsContainer.style.display = 'none';
        suggestionsContainer.innerHTML = '';

        // Use relative path for Netlify function
        let params = new URLSearchParams({ search: query, page_size: 1, search_exact: 'true' });
        let proxyUrl = `/.netlify/functions/rawg-proxy/games?${params.toString()}`;

        console.log("Searching game (via proxy):", proxyUrl);
        try {
            let response = await fetch(proxyUrl);
            let data = await response.json();

            // If exact search failed or errored, try broader search
            if (!response.ok || !data.results || data.results.length === 0) {
                console.log(`Exact search failed for "${query}", trying broader...`);
                params = new URLSearchParams({ search: query, page_size: 1 });
                proxyUrl = `/.netlify/functions/rawg-proxy/games?${params.toString()}`;
                response = await fetch(proxyUrl);
                // Check broader search response
                if (!response.ok) {
                     let errorDetail = `Proxy Error ${response.status}`;
                     try{ const errorData = await response.json(); errorDetail = errorData.detail || errorData.error || `Search Failed`; } catch(e) {}
                     throw new Error(errorDetail);
                }
                data = await response.json();
            }

            // Process results
            if (data.results && data.results.length > 0) {
                const topGame = data.results[0];
                console.log("Found game:", topGame.name, topGame.released);
                if (topGame.released) {
                    try {
                        // Attempt to parse date and navigate
                        const releaseDate = new Date(topGame.released + 'T00:00:00'); // Add time part
                        const targetYear = releaseDate.getFullYear();
                        const targetMonth = releaseDate.getMonth(); // 0-indexed
                        if (!isNaN(targetYear) && !isNaN(targetMonth)) {
                            currentDate = new Date(targetYear, targetMonth, 1);
                            // renderCalendar already hides loading indicator on completion/error
                            await renderCalendar(targetYear, targetMonth);
                        } else { throw new Error("Invalid date parsed from API."); }
                    } catch (dateError) {
                         console.error("Error parsing release date:", topGame.released, dateError);
                         alert(`Found '${topGame.name}' but couldn't parse its release date (${topGame.released}).`);
                         hideLoading();
                    }
                } else {
                    alert(`Found '${topGame.name}' but it doesn't have a specific release date listed.`);
                    hideLoading();
                }
            } else {
                alert(`Game "${query}" not found.`);
                hideLoading();
            }
        } catch (error) {
            console.error('Failed to search for game:', error);
            alert(`Error searching for game: ${error.message}`);
            hideLoading();
        }
        // NOTE: hideLoading() is called within renderCalendar or manually in error paths
    }

    // --- Suggestion Display Logic ---
    function displaySuggestions(games) {
        suggestionsContainer.innerHTML = '';
        if (games.length === 0) { suggestionsContainer.style.display = 'none'; return; }
        games.forEach(game => {
            const div = document.createElement('div'); div.classList.add('suggestion-item'); div.textContent = game.name;
            if (game.released) { const year = game.released.substring(0, 4); const yearSpan = document.createElement('small'); yearSpan.textContent = ` (${year})`; div.appendChild(yearSpan); }
            div.dataset.gameData = JSON.stringify(game); // Store data if needed later
            div.addEventListener('click', () => handleSuggestionClick(game)); suggestionsContainer.appendChild(div);
        });
        suggestionsContainer.style.display = 'block';
    }
    function handleSuggestionClick(game) {
        searchInput.value = game.name; suggestionsContainer.style.display = 'none'; suggestionsContainer.innerHTML = '';
        searchAndJumpToGame(game.name); // Directly jump
    }
    const debouncedFetchSuggestions = debounce(async (query) => { const games = await fetchSuggestions(query); displaySuggestions(games); }, SUGGESTION_DEBOUNCE_DELAY);

    // --- Date Seek Functionality ---
    function handleSeek() {
        const selectedMonth = parseInt(seekMonthSelect.value, 10); const enteredYear = parseInt(seekYearInput.value, 10);
        if (isNaN(selectedMonth) || isNaN(enteredYear) || enteredYear < 1970 || enteredYear > 2100) { alert("Please enter a valid month and year (e.g., 1970-2100)."); return; }
        currentDate = new Date(enteredYear, selectedMonth, 1);
        searchInput.value = ''; // Clear search on seek
        suggestionsContainer.style.display = 'none'; suggestionsContainer.innerHTML = ''; // Clear suggestions
        renderCalendar(currentDate.getFullYear(), currentDate.getMonth());
    }

    // --- Helper Functions ---
    function getMonthName(monthIndex) { return monthNames[monthIndex]; }

    function showLoading() {
        const containerRgb = getComputedStyle(document.body).getPropertyValue('--container-bg-rgb').trim() || '255, 255, 255';
        if(loadingIndicator) loadingIndicator.style.backgroundColor = `rgba(${containerRgb}, 0.8)`;
        // Append to calendarBody if it exists, otherwise grid as fallback
        const target = document.querySelector('.calendar-body') || calendarGrid;
        if (target && loadingIndicator && !target.contains(loadingIndicator)) {
             target.appendChild(loadingIndicator);
        }
        if(loadingIndicator) loadingIndicator.style.display = 'flex';
    }

    function hideLoading() {
         if (loadingIndicator && loadingIndicator.parentNode) {
             loadingIndicator.parentNode.removeChild(loadingIndicator);
         }
         if (loadingIndicator) {
            loadingIndicator.style.display = 'none';
         }
    }

    // --- Event Listeners ---
    prevMonthButton.addEventListener('click', () => {
        currentDate.setMonth(currentDate.getMonth() - 1);
        searchInput.value = ''; suggestionsContainer.style.display = 'none'; suggestionsContainer.innerHTML = '';
        renderCalendar(currentDate.getFullYear(), currentDate.getMonth());
    });
    nextMonthButton.addEventListener('click', () => {
        currentDate.setMonth(currentDate.getMonth() + 1);
        searchInput.value = ''; suggestionsContainer.style.display = 'none'; suggestionsContainer.innerHTML = '';
        renderCalendar(currentDate.getFullYear(), currentDate.getMonth());
    });
    // Suggestions on input
    searchInput.addEventListener('input', () => {
        const query = searchInput.value.trim();
        if (query.length > 1) { debouncedFetchSuggestions(query); }
        else { suggestionsContainer.style.display = 'none'; suggestionsContainer.innerHTML = ''; }
    });
    // Jump on Enter
    searchInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') { event.preventDefault(); searchAndJumpToGame(searchInput.value.trim()); }
        else if (event.key === 'Escape') { suggestionsContainer.style.display = 'none'; suggestionsContainer.innerHTML = ''; }
    });
    // Hide suggestions on click outside
    document.addEventListener('click', (event) => {
        if (!searchInput.contains(event.target) && !suggestionsContainer.contains(event.target)) {
            suggestionsContainer.style.display = 'none'; suggestionsContainer.innerHTML = '';
        }
     });
    // Seek button/enter
    seekButton.addEventListener('click', handleSeek);
    seekYearInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') { event.preventDefault(); handleSeek(); }
    });

    // --- Initial Load ---
    populateSeekControls();
    // REMOVED: setupResizeObserver(); // No longer needed
    renderCalendar(currentDate.getFullYear(), currentDate.getMonth());

}); // End DOMContentLoaded