document.addEventListener('DOMContentLoaded', () => {
    // API Key is handled by Netlify Functions, no client-side key needed.

    const calendarGridView = document.getElementById('calendarGridView'); // Grid container
    const calendarListView = document.getElementById('calendarListView'); // List container
    const currentMonthYearDisplay = document.getElementById('currentMonthYear');
    const prevMonthBtn = document.getElementById('prevMonthBtn');
    const nextMonthBtn = document.getElementById('nextMonthBtn');
    const todayBtn = document.getElementById('todayBtn');
    const monthSelect = document.getElementById('monthSelect');
    const yearSelect = document.getElementById('yearSelect');
    const goToDateBtn = document.getElementById('goToDateBtn');
    const darkModeToggle = document.getElementById('darkModeToggle');
    const darkModeIconContainer = document.getElementById('darkModeIconContainer');
    const toggleContainer = document.getElementById('darkModeToggleContainer'); // Wrapper div
    const loadingIndicator = document.getElementById('loadingIndicator');
    const errorMessagesDiv = document.getElementById('errorMessages');
    const gameSearchInput = document.getElementById('gameSearchInput');
    const searchSuggestionsDiv = document.getElementById('searchSuggestions');
    let searchTimeout;

    let currentDate = new Date();
    let gamesCache = {}; // Client-side caching
    let gamesByDay = {};
    let activeSlideshowIntervals = [];

    const monthNames = ["January", "February", "March", "April", "May", "June",
                        "July", "August", "September", "October", "November", "December"];

    // --- UTILITY FUNCTIONS --- (Moved some utilities up)
    function getDaysInMonth(year, month) { return new Date(year, month + 1, 0).getDate(); }
    
    function showLoading(isLoading) {
        if(loadingIndicator) loadingIndicator.style.display = isLoading ? 'flex' : 'none';
        [prevMonthBtn, nextMonthBtn, todayBtn, goToDateBtn, gameSearchInput].forEach(el => {
            if(el) el.disabled = isLoading;
        });
    }

    function displayError(message) {
        if(errorMessagesDiv) {
            errorMessagesDiv.textContent = message;
            errorMessagesDiv.style.display = 'block';
        }
    }

    // --- SEARCH HANDLER FUNCTIONS (DEFINED BEFORE setupEventListeners) ---
    function handleSearchInput() {
        clearTimeout(searchTimeout);
        const query = gameSearchInput.value.trim();
        if (query.length < 3) {
            if(searchSuggestionsDiv) {
                searchSuggestionsDiv.style.display = 'none';
                searchSuggestionsDiv.innerHTML = '';
            }
            return;
        }
        if(searchSuggestionsDiv) {
            searchSuggestionsDiv.innerHTML = '<div class="list-group-item disabled">Searching...</div>';
            searchSuggestionsDiv.style.display = 'block';
        }
        searchTimeout = setTimeout(() => fetchSearchSuggestions(query), 400);
    }

    function handleSearchKeyDown(event) {
        if (event.key === 'Enter') {
            event.preventDefault();
            const query = gameSearchInput.value.trim();
            if(searchSuggestionsDiv) searchSuggestionsDiv.style.display = 'none';
            if (query) findAndGoToGame(query); // Will use the current input value for a direct search
        }
    }

     // --- Helper Function to Create Game Item Element ---
    // Moved this logic into a reusable function for both grid and list views
    function createGameItemElement(game) {
        const gameItem = document.createElement('a');
        gameItem.className = 'day-game-item'; // Use the shared base class
        gameItem.href = `https://rawg.io/games/${game.slug || game.name.toLowerCase().replace(/\s+/g, '-')}`;
        gameItem.target = '_blank';
        gameItem.title = `${game.name} - Rating: ${game.rating || 'N/A'}, Metacritic: ${game.metacritic || 'N/A'}`;

        const imgEl = document.createElement('img');
        imgEl.src = game.background_image || 'https://via.placeholder.com/32x20?text=G'; // Default size, CSS overrides for list
        imgEl.alt = game.name.substring(0,3);
        imgEl.loading = 'lazy'; // Add lazy loading for game images

        const nameSpan = document.createElement('span');
        nameSpan.className = 'game-name';
        nameSpan.textContent = game.name;
        
        gameItem.appendChild(imgEl);
        gameItem.appendChild(nameSpan);

        if (game.metacritic) {
            const metacriticSpan = document.createElement('span');
            metacriticSpan.className = 'game-metacritic';
            metacriticSpan.textContent = game.metacritic;
            // Add metacritic color styling
            if (game.metacritic >= 75) metacriticSpan.style.backgroundColor = '#6c3';
            else if (game.metacritic >= 50) metacriticSpan.style.backgroundColor = '#fc3';
            else if (game.metacritic > 0) metacriticSpan.style.backgroundColor = '#f00';
            else metacriticSpan.style.backgroundColor = '#888';
            gameItem.appendChild(metacriticSpan);
        }
        return gameItem;
    }


    // --- SETUP AND INITIALIZATION ---
    async function init() {
        console.log("Client: init() called");
        setupEventListeners();
        populateMonthYearSelectors();
        loadDarkModePreference();
        try {
            console.log("Client: Calling initial renderCalendar...");
            // Use await here to ensure the first render completes before other things might try to access elements
            await renderCalendar(currentDate.getFullYear(), currentDate.getMonth());
            console.log("Client: Initial renderCalendar finished.");
        } catch (error) {
            console.error("Client: Error during initial renderCalendar:", error);
            displayError("Failed to load initial calendar data. Please try refreshing.");
        }
    }

    function setupEventListeners() {
        console.log("Client: setupEventListeners() called");
        if(prevMonthBtn) prevMonthBtn.addEventListener('click', () => navigateMonth(-1));
        if(nextMonthBtn) nextMonthBtn.addEventListener('click', () => navigateMonth(1));
        if(todayBtn) todayBtn.addEventListener('click', goToToday);
        if(goToDateBtn) goToDateBtn.addEventListener('click', () => {
            const year = parseInt(yearSelect.value);
            const month = parseInt(monthSelect.value);
            if (isNaN(year) || isNaN(month)) {
                console.error("Client: Invalid year or month selected for Go To Date.");
                return;
            }
            currentDate = new Date(year, month, 1);
            renderCalendar(year, month);
        });
        
        if (darkModeToggle && toggleContainer) {
            // Listen for changes on the actual checkbox (e.g., keyboard interaction)
            darkModeToggle.addEventListener('change', () => {
                // The 'checked' state is already updated by the browser
                toggleDarkModeLogic(darkModeToggle.checked);
            });

            // Make the entire container clickable (covers the icon area)
            toggleContainer.addEventListener('click', (event) => {
                // Only manually toggle if the click was NOT on the input itself or its direct label
                // The label click should handle it normally via browser behavior, but this adds robustness
                 if (event.target !== darkModeToggle && event.target !== darkModeIconContainer && !darkModeIconContainer.contains(event.target) && event.target.tagName !== 'I') {
                    darkModeToggle.checked = !darkModeToggle.checked;
                    toggleDarkModeLogic(darkModeToggle.checked); 
                }
            });
        }

        if(gameSearchInput) gameSearchInput.addEventListener('input', handleSearchInput);
        if(gameSearchInput) gameSearchInput.addEventListener('keydown', handleSearchKeyDown);
        
        document.addEventListener('click', (event) => {
            // Hide suggestions if clicking outside the search input and suggestions area
            if (searchSuggestionsDiv && gameSearchInput) { // Check if elements exist
                 const isClickInsideSearchArea = gameSearchInput.contains(event.target) || searchSuggestionsDiv.contains(event.target);
                 if (!isClickInsideSearchArea) {
                     searchSuggestionsDiv.style.display = 'none';
                 }
            } else if (searchSuggestionsDiv && !searchSuggestionsDiv.contains(event.target)) { // Fallback if searchInput not found
                 searchSuggestionsDiv.style.display = 'none';
            }
        });
    }

    // --- DARK MODE FUNCTIONS ---
    function loadDarkModePreference() {
        const isDarkMode = localStorage.getItem('darkMode') === 'true';
        if (darkModeToggle) darkModeToggle.checked = isDarkMode;
        
        applyTheme(isDarkMode);
    }

    function toggleDarkModeLogic(isDarkMode) { 
        localStorage.setItem('darkMode', isDarkMode);
        applyTheme(isDarkMode);
    }

    function applyTheme(isDarkMode) {
        document.body.classList.toggle('dark-mode', isDarkMode);
        document.body.classList.toggle('light-mode', !isDarkMode);
        updateDarkModeIcon(isDarkMode);
    }

    function updateDarkModeIcon(isDarkMode) {
        if (darkModeIconContainer) {
            const iconElement = darkModeIconContainer.querySelector('i');
            if (iconElement) {
                iconElement.className = isDarkMode ? 'bi bi-sun-fill' : 'bi bi-moon-stars-fill';
            } else {
                 darkModeIconContainer.innerHTML = isDarkMode ? '<i class="bi bi-sun-fill"></i>' : '<i class="bi bi-moon-stars-fill"></i>';
            }
        }
    }

    // --- CALENDAR NAVIGATION AND RENDERING ---
    function navigateMonth(direction) {
        currentDate.setMonth(currentDate.getMonth() + direction);
        renderCalendar(currentDate.getFullYear(), currentDate.getMonth());
    }

    function goToToday() {
        currentDate = new Date();
        renderCalendar(currentDate.getFullYear(), currentDate.getMonth());
    }

    function populateMonthYearSelectors() {
        if(monthSelect && yearSelect) { // Check if elements exist
            monthNames.forEach((name, index) => monthSelect.add(new Option(name, index)));
            const currentYr = new Date().getFullYear();
            for (let i = currentYr - 10; i <= currentYr + 10; i++) yearSelect.add(new Option(i, i));
        }
    }

    function clearAllSlideshows() {
        activeSlideshowIntervals.forEach(clearInterval);
        activeSlideshowIntervals = [];
    }

    async function renderCalendar(year, month) {
        console.log(`Client: renderCalendar(${year}, ${month}) called`);
        showLoading(true);
        if(errorMessagesDiv) errorMessagesDiv.style.display = 'none';
        if(currentMonthYearDisplay) currentMonthYearDisplay.textContent = `${monthNames[month]} ${year}`;
        if(monthSelect) monthSelect.value = month;
        if(yearSelect) yearSelect.value = year;

        clearAllSlideshows();
        
        // Clear Grid View
        if(calendarGridView) calendarGridView.querySelectorAll('.calendar-day, .empty-day, .day-name:not(:first-child):not(:nth-child(2)):not(:nth-child(3)):not(:nth-child(4)):not(:nth-child(5)):not(:nth-child(6)):not(:nth-child(7))').forEach(el => el.remove());
        // Clear List View
        if(calendarListView) calendarListView.innerHTML = '';

        const firstDayOfMonth = new Date(year, month, 1).getDay();
        const daysInCurrentMonth = getDaysInMonth(year, month);
        const todayObj = new Date();

        console.log(`Client: Attempting to fetch games for ${year}-${month + 1}`);
        const gamesForMonth = await fetchGamesForMonth(year, month);
        console.log("Client: gamesForMonth received in renderCalendar:", gamesForMonth ? `${gamesForMonth.length} games` : "null/undefined");

        gamesByDay = {};
        if (gamesForMonth && Array.isArray(gamesForMonth)) {
            gamesForMonth.forEach(game => {
                if (game.released) {
                    const releaseDate = new Date(game.released + 'T00:00:00');
                    const day = releaseDate.getDate();
                    if (!gamesByDay[day]) gamesByDay[day] = [];
                    gamesByDay[day].push(game);
                }
            });
        } else if (gamesForMonth) {
            console.warn("Client: gamesForMonth is not an array:", gamesForMonth);
        }

        // --- Populate Grid View (for medium screens and up) ---
        if (calendarGridView) {
             // Add empty cells for padding before the first day
            for (let i = 0; i < firstDayOfMonth; i++) {
                calendarGridView.appendChild(Object.assign(document.createElement('div'), { className: 'empty-day calendar-day' }));
            }

            // Loop through days to populate grid cells
            for (let day = 1; day <= daysInCurrentMonth; day++) {
                const dayCell = document.createElement('div');
                dayCell.classList.add('calendar-day');

                const gamesOnThisDay = gamesByDay[day];
                const imagesForSlideshow = [];
                if (gamesOnThisDay && gamesOnThisDay.length > 0) {
                    gamesOnThisDay.forEach(game => { if (game.background_image) imagesForSlideshow.push(game.background_image); });
                    if (imagesForSlideshow.length > 0) { /* ... slideshow div creation ... */
                        const slideshowDiv = document.createElement('div');
                        slideshowDiv.className = 'day-background-slideshow';
                        imagesForSlideshow.forEach((imgSrc, index) => { /* ... img creation ... */ 
                            const img = document.createElement('img'); img.src = imgSrc; img.alt = `Game background ${index + 1}`; slideshowDiv.appendChild(img); });
                        dayCell.appendChild(slideshowDiv);
                        startSlideshowForCell(slideshowDiv, imagesForSlideshow.length > 1 ? 4000 : 0);
                    }
                }

                const contentWrapper = document.createElement('div');
                contentWrapper.className = 'day-content-wrapper';
                const dayNumberSpan = Object.assign(document.createElement('span'), { className: 'day-number', textContent: day });
                contentWrapper.appendChild(dayNumberSpan);

                if (year === todayObj.getFullYear() && month === todayObj.getMonth() && day === todayObj.getDate()) {
                    dayCell.classList.add('today');
                }

                if (gamesOnThisDay && gamesOnThisDay.length > 0) {
                    const dayGamesListDiv = document.createElement('div');
                    dayGamesListDiv.className = 'day-games-list'; // For internal scroll
                    gamesOnThisDay.forEach(game => {
                        dayGamesListDiv.appendChild(createGameItemElement(game)); // Use helper function
                    });
                    contentWrapper.appendChild(dayGamesListDiv);
                }
                dayCell.appendChild(contentWrapper);
                calendarGridView.appendChild(dayCell);
            }

            // Add empty cells at the end
             const totalGridCells = firstDayOfMonth + daysInCurrentMonth;
             const remainingGridCells = (7 - (totalGridCells % 7)) % 7;
             for (let i = 0; i < remainingGridCells; i++) {
                 calendarGridView.appendChild(Object.assign(document.createElement('div'), { className: 'empty-day calendar-day' }));
             }
        }


        // --- Populate List View (for small screens) ---
        if (calendarListView) {
            let hasGamesInList = false;
            for (let day = 1; day <= daysInCurrentMonth; day++) {
                const gamesOnThisDay = gamesByDay[day];

                if (gamesOnThisDay && gamesOnThisDay.length > 0) {
                    hasGamesInList = true;
                    const listDayItem = document.createElement('div');
                    listDayItem.className = 'list-day-item';

                    // Add Date Header
                    const listDayHeader = document.createElement('h5'); // Or h6, div etc.
                    listDayHeader.className = 'list-day-header';
                    const dateForHeader = new Date(year, month, day);
                    listDayHeader.textContent = dateForHeader.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }); // Format: e.g., Monday, May 15, 2025
                    listDayItem.appendChild(listDayHeader);

                    // Add Games List for this day
                    const gamesContainer = document.createElement('div');
                    gamesOnThisDay.forEach(game => {
                        gamesContainer.appendChild(createGameItemElement(game)); // Use helper function
                    });
                    listDayItem.appendChild(gamesContainer);

                    calendarListView.appendChild(listDayItem);
                }
            }
             // Optional: Show a message if no games found for the entire month in list view
             if (!hasGamesInList) {
                 calendarListView.innerHTML = '<p class="text-center text-muted p-3">No game releases found for this month.</p>';
             }
        }

        console.log(`Client: Finished processing day cells for ${year}-${month}`);
        showLoading(false);
    }

    function startSlideshowForCell(slideshowDiv, intervalTime) {
        const images = slideshowDiv.querySelectorAll('img');
        if (images.length === 0) return;
        let currentIndex = 0;
        if (images[currentIndex]) {
            images[currentIndex].classList.add('active-slide');
        }
        if (intervalTime === 0 || images.length <= 1) return;
        const intervalId = setInterval(() => {
            if (!slideshowDiv.isConnected) { // Stop interval if element is removed from DOM
                clearInterval(intervalId);
                return;
            }
            if (images[currentIndex]) images[currentIndex].classList.remove('active-slide');
            currentIndex = (currentIndex + 1) % images.length;
            if (images[currentIndex]) images[currentIndex].classList.add('active-slide');
        }, intervalTime);
        activeSlideshowIntervals.push(intervalId);
    }

    // --- API CALLS VIA NETLIFY FUNCTIONS ---
    async function fetchGamesForMonth(year, month) {
        const cacheKey = `month-${year}-${month}`;
        if (gamesCache[cacheKey]) {
            console.log("Client: Serving month data from cache:", cacheKey);
            return gamesCache[cacheKey];
        }

        const params = new URLSearchParams({
            year: year.toString(),
            month: month.toString(),
            ordering: '-metacritic,-added',
            pageSize: '40'
        });
        const functionUrl = `/.netlify/functions/getGames?${params.toString()}`;
        console.log("Client: Fetching month data from Netlify function:", functionUrl);

        try {
            const response = await fetch(functionUrl);
            if (!response.ok) {
                let errorDetails = "Server error, no details provided.";
                try {
                    const errorData = await response.json();
                    errorDetails = errorData.error || (errorData.details ? JSON.stringify(errorData.details) : response.statusText);
                    console.error("Client: Error from Netlify function (fetchGamesForMonth):", response.status, errorData);
                } catch (e) {
                    console.error("Client: Error from Netlify function (fetchGamesForMonth), couldn't parse JSON:", response.status, response.statusText);
                }
                displayError(`Error fetching games: ${errorDetails}`);
                return null;
            }
            const data = await response.json();
            console.log("Client: Received month data from function:", data);
            if (data && data.results && Array.isArray(data.results)) {
                gamesCache[cacheKey] = data.results;
                return data.results;
            } else {
                console.error("Client: Unexpected data structure from function (fetchGamesForMonth). Expected 'results' array:", data);
                displayError("Received unexpected data format from game service.");
                return null;
            }
        } catch (error) {
            console.error("Client: Network error calling Netlify function (fetchGamesForMonth):", error);
            displayError("Could not connect to game service. Check network or try later.");
            return null;
        }
    }

    async function fetchSearchSuggestions(query) {
        const params = new URLSearchParams({
            searchQuery: query,
            pageSize: '6',
            searchPrecise: 'true'
        });
        const functionUrl = `/.netlify/functions/getGames?${params.toString()}`;
        console.log("Client: Fetching search suggestions from Netlify function:", functionUrl);

        try {
            const response = await fetch(functionUrl);
            if (!response.ok) {
                let errorData = await response.json().catch(() => ({ error: "Failed to parse error from function." }));
                console.error("Client: Error from Netlify function (fetchSearchSuggestions):", response.status, errorData);
                if(searchSuggestionsDiv) searchSuggestionsDiv.innerHTML = `<div class="list-group-item text-danger">Error: ${errorData.error || `Server error ${response.status}`}</div>`;
                return;
            }
            const data = await response.json();
            console.log("Client: Received search suggestions:", data);
            if (data.results) {
                displaySearchSuggestions(data.results);
            } else {
                 console.error("Client: Unexpected data structure from function (fetchSearchSuggestions):", data);
                if(searchSuggestionsDiv) searchSuggestionsDiv.innerHTML = '<div class="list-group-item text-danger">Unexpected data.</div>';
            }
        } catch (error) {
            console.error("Client: Network error calling Netlify function (fetchSearchSuggestions):", error);
            if(searchSuggestionsDiv) searchSuggestionsDiv.innerHTML = '<div class-list-group-item text-danger">Network error.</div>';
        }
    }

    async function findAndGoToGame(gameName, releaseDateStr, gameSlug) {
        showLoading(true);
        if(errorMessagesDiv) errorMessagesDiv.style.display = 'none';
        let gameToNavigate = { name: gameName, released: releaseDateStr, slug: gameSlug };

        if (!releaseDateStr && gameName) {
            const params = new URLSearchParams({
                searchQuery: gameName,
                pageSize: '1',
                searchExact: 'true'
            });
            const functionUrl = `/.netlify/functions/getGames?${params.toString()}`;
            console.log("Client: Fetching game details from Netlify function:", functionUrl);

            try {
                const response = await fetch(functionUrl);
                if (!response.ok) {
                    let errorData = await response.json().catch(() => ({ error: "Failed to parse error from function." }));
                    throw new Error(errorData.error || `Server error ${response.status}`);
                }
                const data = await response.json();
                if (data.results && data.results.length > 0) {
                    gameToNavigate = data.results[0];
                } else {
                    throw new Error('Game not found in precise search via function.');
                }
            } catch (error) {
                console.error("Client: Error fetching game for navigation via function:", error);
                displayError(`Could not find details for "${gameName}".`);
                showLoading(false); return;
            }
        }
        
        if (gameToNavigate && gameToNavigate.released) {
            try {
                const releaseDate = new Date(gameToNavigate.released + 'T00:00:00');
                if (isNaN(releaseDate.getTime())) throw new Error("Invalid release date.");
                currentDate = new Date(releaseDate.getFullYear(), releaseDate.getMonth(), 1);
                await renderCalendar(currentDate.getFullYear(), currentDate.getMonth());
            } catch(e) {
                 console.error("Client: Error processing release date for navigation:", e);
                 displayError(`Error processing release date for "${gameToNavigate.name}".`);
            }
        } else {
            displayError(`"${gameToNavigate.name}" found, but no specific release date available for navigation.`);
        }
        showLoading(false);
    }

    // --- SEARCH DISPLAY UTILITY ---
    function displaySearchSuggestions(suggestions) {
        if(!searchSuggestionsDiv) return;
        searchSuggestionsDiv.innerHTML = '';
        if (!suggestions || suggestions.length === 0) {
            searchSuggestionsDiv.innerHTML = '<div class="list-group-item disabled">No games found.</div>'; return;
        }
        suggestions.forEach(game => {
            const item = document.createElement('a');
            item.className = 'list-group-item list-group-item-action';
            let text = game.name;
            if (game.released) text += ` (${new Date(game.released+'T00:00:00').getFullYear()})`;
            item.innerHTML = `<img src="${game.background_image || 'https://via.placeholder.com/40x25?text=G'}" alt="" width="40" height="25" class="me-2 rounded" style="object-fit:cover;"> ${text}`;
            item.addEventListener('click', (e) => {
                e.preventDefault();
                if(gameSearchInput) gameSearchInput.value = game.name;
                searchSuggestionsDiv.style.display = 'none';
                findAndGoToGame(game.name, game.released, game.slug);
            });
            searchSuggestionsDiv.appendChild(item);
        });
    }
    
    init();
});