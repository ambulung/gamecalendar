document.addEventListener('DOMContentLoaded', () => {
    // API Key is no longer stored or used directly in client-side JS

    const calendarGrid = document.querySelector('.calendar-grid');
    const currentMonthYearDisplay = document.getElementById('currentMonthYear');
    const prevMonthBtn = document.getElementById('prevMonthBtn');
    const nextMonthBtn = document.getElementById('nextMonthBtn');
    const todayBtn = document.getElementById('todayBtn');
    const monthSelect = document.getElementById('monthSelect');
    const yearSelect = document.getElementById('yearSelect');
    const goToDateBtn = document.getElementById('goToDateBtn');
    const darkModeToggle = document.getElementById('darkModeToggle');
    const darkModeIconContainer = document.getElementById('darkModeIconContainer');
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

    async function init() {
        console.log("Client: init() called");
        setupEventListeners();
        populateMonthYearSelectors();
        loadDarkModePreference();
        try {
            console.log("Client: Calling initial renderCalendar...");
            await renderCalendar(currentDate.getFullYear(), currentDate.getMonth());
            console.log("Client: Initial renderCalendar finished.");
        } catch (error) {
            console.error("Client: Error during initial renderCalendar:", error);
            displayError("Failed to load initial calendar data. Please try refreshing.");
        }
    }

    function setupEventListeners() {
        prevMonthBtn.addEventListener('click', () => navigateMonth(-1));
        nextMonthBtn.addEventListener('click', () => navigateMonth(1));
        todayBtn.addEventListener('click', goToToday);
        goToDateBtn.addEventListener('click', () => {
            const year = parseInt(yearSelect.value);
            const month = parseInt(monthSelect.value);
            if (isNaN(year) || isNaN(month)) {
                console.error("Client: Invalid year or month selected for Go To Date.");
                return;
            }
            currentDate = new Date(year, month, 1);
            renderCalendar(year, month);
        });
        
        const toggleContainer = document.getElementById('darkModeToggleContainer');
        if(toggleContainer) {
            darkModeToggle.addEventListener('change', toggleDarkMode);
            toggleContainer.addEventListener('click', (event) => {
                if (event.target !== darkModeToggle && event.target.parentNode !== darkModeToggle) {
                    darkModeToggle.checked = !darkModeToggle.checked;
                    toggleDarkMode(); 
                }
            });
        }

        gameSearchInput.addEventListener('input', handleSearchInput);
        gameSearchInput.addEventListener('keydown', handleSearchKeyDown);
        document.addEventListener('click', (event) => {
            if (searchSuggestionsDiv && !searchSuggestionsDiv.contains(event.target) && event.target !== gameSearchInput) {
                searchSuggestionsDiv.style.display = 'none';
            }
        });
    }

    function loadDarkModePreference() {
        const isDarkMode = localStorage.getItem('darkMode') === 'true';
        if (darkModeToggle) darkModeToggle.checked = isDarkMode; // Check if element exists
        
        document.body.classList.toggle('dark-mode', isDarkMode);
        document.body.classList.toggle('light-mode', !isDarkMode);

        updateDarkModeIcon(isDarkMode);
    }

    function toggleDarkMode() {
        const isDarkMode = darkModeToggle.checked;
        
        document.body.classList.toggle('dark-mode', isDarkMode);
        document.body.classList.toggle('light-mode', !isDarkMode);
        
        localStorage.setItem('darkMode', isDarkMode);
        updateDarkModeIcon(isDarkMode);
    }

    function updateDarkModeIcon(isDarkMode) {
        if (darkModeIconContainer) {
            darkModeIconContainer.innerHTML = isDarkMode ? '<i class="bi bi-sun-fill"></i>' : '<i class="bi bi-moon-stars-fill"></i>';
        }
    }

    function navigateMonth(direction) {
        currentDate.setMonth(currentDate.getMonth() + direction);
        renderCalendar(currentDate.getFullYear(), currentDate.getMonth());
    }

    function goToToday() {
        currentDate = new Date();
        renderCalendar(currentDate.getFullYear(), currentDate.getMonth());
    }

    function populateMonthYearSelectors() {
        monthNames.forEach((name, index) => monthSelect.add(new Option(name, index)));
        const currentYr = new Date().getFullYear();
        for (let i = currentYr - 10; i <= currentYr + 10; i++) yearSelect.add(new Option(i, i));
    }

    function getDaysInMonth(year, month) { return new Date(year, month + 1, 0).getDate(); }

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
        if(calendarGrid) calendarGrid.querySelectorAll('.calendar-day, .empty-day').forEach(cell => cell.remove());

        const firstDayOfMonth = new Date(year, month, 1).getDay();
        const daysInCurrentMonth = getDaysInMonth(year, month);
        const todayObj = new Date();

        for (let i = 0; i < firstDayOfMonth; i++) {
            if(calendarGrid) calendarGrid.appendChild(Object.assign(document.createElement('div'), { className: 'empty-day calendar-day' }));
        }

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

        for (let day = 1; day <= daysInCurrentMonth; day++) {
            const dayCell = document.createElement('div');
            dayCell.classList.add('calendar-day');

            const gamesOnThisDay = gamesByDay[day];
            const imagesForSlideshow = [];
            if (gamesOnThisDay && gamesOnThisDay.length > 0) {
                gamesOnThisDay.forEach(game => {
                    if (game.background_image) imagesForSlideshow.push(game.background_image);
                });

                if (imagesForSlideshow.length > 0) {
                    const slideshowDiv = document.createElement('div');
                    slideshowDiv.className = 'day-background-slideshow';
                    imagesForSlideshow.forEach((imgSrc, index) => {
                        const img = document.createElement('img');
                        img.src = imgSrc;
                        img.alt = `Game background ${index + 1}`;
                        slideshowDiv.appendChild(img);
                    });
                    dayCell.appendChild(slideshowDiv);
                    startSlideshowForCell(slideshowDiv, imagesForSlideshow.length > 1 ? 4000 : 0);
                }
            }

            const contentWrapper = document.createElement('div');
            contentWrapper.className = 'day-content-wrapper';

            const dayNumberSpan = Object.assign(document.createElement('span'), {
                className: 'day-number', textContent: day
            });
            contentWrapper.appendChild(dayNumberSpan);

            if (year === todayObj.getFullYear() && month === todayObj.getMonth() && day === todayObj.getDate()) {
                dayCell.classList.add('today');
            }

            if (gamesOnThisDay && gamesOnThisDay.length > 0) {
                const dayGamesListDiv = document.createElement('div');
                dayGamesListDiv.className = 'day-games-list';
                gamesOnThisDay.forEach(game => {
                    const gameItem = document.createElement('a');
                    gameItem.className = 'day-game-item';
                    gameItem.href = `https://rawg.io/games/${game.slug || game.name.toLowerCase().replace(/\s+/g, '-')}`;
                    gameItem.target = '_blank';
                    gameItem.title = `${game.name} - Rating: ${game.rating || 'N/A'}, Metacritic: ${game.metacritic || 'N/A'}`;

                    const imgEl = document.createElement('img');
                    imgEl.src = game.background_image || 'https://via.placeholder.com/32x20?text=G';
                    imgEl.alt = game.name.substring(0,3);

                    const nameSpan = document.createElement('span');
                    nameSpan.className = 'game-name';
                    nameSpan.textContent = game.name;
                    
                    gameItem.appendChild(imgEl);
                    gameItem.appendChild(nameSpan);

                    if (game.metacritic) {
                        const metacriticSpan = document.createElement('span');
                        metacriticSpan.className = 'game-metacritic';
                        metacriticSpan.textContent = game.metacritic;
                        if (game.metacritic >= 75) metacriticSpan.style.backgroundColor = '#6c3';
                        else if (game.metacritic >= 50) metacriticSpan.style.backgroundColor = '#fc3';
                        else if (game.metacritic > 0) metacriticSpan.style.backgroundColor = '#f00';
                        else metacriticSpan.style.backgroundColor = '#888';
                        gameItem.appendChild(metacriticSpan);
                    }
                    dayGamesListDiv.appendChild(gameItem);
                });
                contentWrapper.appendChild(dayGamesListDiv);
            }
            dayCell.appendChild(contentWrapper);
            if(calendarGrid) calendarGrid.appendChild(dayCell);
        }

        const totalCells = firstDayOfMonth + daysInCurrentMonth;
        const remainingCells = (7 - (totalCells % 7)) % 7;
        for (let i = 0; i < remainingCells; i++) {
            if(calendarGrid) calendarGrid.appendChild(Object.assign(document.createElement('div'), { className: 'empty-day calendar-day' }));
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
            if (!slideshowDiv.isConnected) { 
                clearInterval(intervalId);
                return;
            }
            if (images[currentIndex]) images[currentIndex].classList.remove('active-slide');
            currentIndex = (currentIndex + 1) % images.length;
            if (images[currentIndex]) images[currentIndex].classList.add('active-slide');
        }, intervalTime);
        activeSlideshowIntervals.push(intervalId);
    }

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
                const errorData = await response.json().catch(() => ({ error: "Failed to parse error from function." }));
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
            if(searchSuggestionsDiv) searchSuggestionsDiv.innerHTML = '<div class="list-group-item text-danger">Network error.</div>';
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
                    const errorData = await response.json().catch(() => ({ error: "Failed to parse error from function." }));
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
    
    init();
});