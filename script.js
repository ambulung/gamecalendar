document.addEventListener('DOMContentLoaded', () => {
    const apiKey = window.RAWG_API_KEY;

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
    let gamesCache = {};
    let gamesByDay = {};
    let activeSlideshowIntervals = [];

    const monthNames = ["January", "February", "March", "April", "May", "June",
                        "July", "August", "September", "October", "November", "December"];

    function init() {
        if (!apiKey) {
            displayError("API Key not found. Ensure config.js is loaded and contains your RAWG_API_KEY.");
            loadingIndicator.style.display = 'none';
            [prevMonthBtn, nextMonthBtn, todayBtn, goToDateBtn, gameSearchInput].forEach(el => el.disabled = true);
            return;
        }
        setupEventListeners();
        populateMonthYearSelectors();
        loadDarkModePreference();
        renderCalendar(currentDate.getFullYear(), currentDate.getMonth());
    }

    function setupEventListeners() {
        prevMonthBtn.addEventListener('click', () => navigateMonth(-1));
        nextMonthBtn.addEventListener('click', () => navigateMonth(1));
        todayBtn.addEventListener('click', goToToday);
        goToDateBtn.addEventListener('click', () => {
            const year = parseInt(yearSelect.value);
            const month = parseInt(monthSelect.value);
            currentDate = new Date(year, month, 1);
            renderCalendar(year, month);
        });
        
        const toggleContainer = document.getElementById('darkModeToggleContainer');
        if(toggleContainer) {
            darkModeToggle.addEventListener('change', toggleDarkMode); // Listen to change on checkbox
            // Make container (icon area) also toggle the checkbox
            toggleContainer.addEventListener('click', (event) => {
                // Prevent double toggling if the checkbox itself was the click target
                if (event.target !== darkModeToggle) {
                    darkModeToggle.checked = !darkModeToggle.checked;
                    // Manually trigger the logic as if the checkbox 'change' event fired
                    toggleDarkMode(); 
                }
            });
        }


        gameSearchInput.addEventListener('input', handleSearchInput);
        gameSearchInput.addEventListener('keydown', handleSearchKeyDown);
        document.addEventListener('click', (event) => {
            if (!searchSuggestionsDiv.contains(event.target) && event.target !== gameSearchInput) {
                searchSuggestionsDiv.style.display = 'none';
            }
        });
    }

    function loadDarkModePreference() {
        const isDarkMode = localStorage.getItem('darkMode') === 'true';
        darkModeToggle.checked = isDarkMode;
        
        document.body.classList.toggle('dark-mode', isDarkMode);
        document.body.classList.toggle('light-mode', !isDarkMode); // Explicitly set light-mode

        updateDarkModeIcon(isDarkMode);
    }

    function toggleDarkMode() {
        const isDarkMode = darkModeToggle.checked; // Get current state of the checkbox
        
        document.body.classList.toggle('dark-mode', isDarkMode);
        document.body.classList.toggle('light-mode', !isDarkMode);
        
        localStorage.setItem('darkMode', isDarkMode);
        updateDarkModeIcon(isDarkMode);
    }

    function updateDarkModeIcon(isDarkMode) {
        if (darkModeIconContainer) {
            if (isDarkMode) {
                darkModeIconContainer.innerHTML = '<i class="bi bi-sun-fill"></i>';
            } else {
                darkModeIconContainer.innerHTML = '<i class="bi bi-moon-stars-fill"></i>';
            }
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
        showLoading(true);
        errorMessagesDiv.style.display = 'none';
        currentMonthYearDisplay.textContent = `${monthNames[month]} ${year}`;
        monthSelect.value = month;
        yearSelect.value = year;

        clearAllSlideshows();
        calendarGrid.querySelectorAll('.calendar-day, .empty-day').forEach(cell => cell.remove());

        const firstDayOfMonth = new Date(year, month, 1).getDay();
        const daysInCurrentMonth = getDaysInMonth(year, month);
        const todayObj = new Date();

        for (let i = 0; i < firstDayOfMonth; i++) {
            calendarGrid.appendChild(Object.assign(document.createElement('div'), { className: 'empty-day calendar-day' }));
        }

        const gamesForMonth = await fetchGamesForMonth(year, month);
        gamesByDay = {};
        if (gamesForMonth) {
            gamesForMonth.forEach(game => {
                if (game.released) {
                    const releaseDate = new Date(game.released + 'T00:00:00');
                    const day = releaseDate.getDate();
                    if (!gamesByDay[day]) gamesByDay[day] = [];
                    gamesByDay[day].push(game);
                }
            });
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
            calendarGrid.appendChild(dayCell);
        }

        const totalCells = firstDayOfMonth + daysInCurrentMonth;
        const remainingCells = (7 - (totalCells % 7)) % 7;
        for (let i = 0; i < remainingCells; i++) {
            calendarGrid.appendChild(Object.assign(document.createElement('div'), { className: 'empty-day calendar-day' }));
        }
        showLoading(false);
    }

    function startSlideshowForCell(slideshowDiv, intervalTime) {
        const images = slideshowDiv.querySelectorAll('img');
        if (images.length === 0) return;
        let currentIndex = 0;
        images[currentIndex].classList.add('active-slide');
        if (intervalTime === 0 || images.length <= 1) return;
        const intervalId = setInterval(() => {
            if (!slideshowDiv.isConnected) { 
                clearInterval(intervalId);
                return;
            }
            images[currentIndex].classList.remove('active-slide');
            currentIndex = (currentIndex + 1) % images.length;
            images[currentIndex].classList.add('active-slide');
        }, intervalTime);
        activeSlideshowIntervals.push(intervalId);
    }

    async function fetchGamesForMonth(year, month) {
        const cacheKey = `${year}-${String(month + 1).padStart(2, '0')}`;
        if (gamesCache[cacheKey]) return gamesCache[cacheKey];
        const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
        const endDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(getDaysInMonth(year, month)).padStart(2, '0')}`;
        const apiUrl = `https://api.rawg.io/api/games?key=${apiKey}&dates=${startDate},${endDate}&ordering=-metacritic,-added&page_size=40`;
        try {
            const response = await fetch(apiUrl);
            if (!response.ok) { handleApiError(response, "Error fetching games for month"); return null; }
            const data = await response.json();
            gamesCache[cacheKey] = data.results;
            return data.results;
        } catch (error) {
            console.error("Network error fetching games for month:", error);
            displayError("Could not connect to game service. Check network or try later.");
            return null;
        }
    }

    function handleSearchInput() {
        clearTimeout(searchTimeout);
        const query = gameSearchInput.value.trim();
        if (query.length < 3) { searchSuggestionsDiv.style.display = 'none'; searchSuggestionsDiv.innerHTML = ''; return; }
        searchSuggestionsDiv.innerHTML = '<div class="list-group-item disabled">Searching...</div>';
        searchSuggestionsDiv.style.display = 'block';
        searchTimeout = setTimeout(() => fetchSearchSuggestions(query), 400);
    }

    function handleSearchKeyDown(event) {
        if (event.key === 'Enter') {
            event.preventDefault();
            const query = gameSearchInput.value.trim();
            searchSuggestionsDiv.style.display = 'none';
            if (query) findAndGoToGame(query);
        }
    }

    async function fetchSearchSuggestions(query) {
        const apiUrl = `https://api.rawg.io/api/games?key=${apiKey}&search=${encodeURIComponent(query)}&page_size=6&search_precise=true`;
        try {
            const response = await fetch(apiUrl);
            if (!response.ok) { searchSuggestionsDiv.innerHTML = '<div class="list-group-item text-danger">Error fetching.</div>'; return; }
            const data = await response.json();
            displaySearchSuggestions(data.results);
        } catch (error) {
            console.error("Error fetching search suggestions:", error);
            searchSuggestionsDiv.innerHTML = '<div class="list-group-item text-danger">Network error.</div>';
        }
    }

    function displaySearchSuggestions(suggestions) {
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
                gameSearchInput.value = game.name;
                searchSuggestionsDiv.style.display = 'none';
                findAndGoToGame(game.name, game.released, game.slug);
            });
            searchSuggestionsDiv.appendChild(item);
        });
    }

    async function findAndGoToGame(gameName, releaseDateStr, gameSlug) {
        showLoading(true);
        errorMessagesDiv.style.display = 'none';
        let gameToNavigate = { name: gameName, released: releaseDateStr, slug: gameSlug };
        if (!releaseDateStr && gameName) {
            const apiUrl = `https://api.rawg.io/api/games?key=${apiKey}&search=${encodeURIComponent(gameName)}&page_size=1&search_exact=true`;
            try {
                const response = await fetch(apiUrl);
                if (!response.ok) throw new Error('Game not found for navigation details');
                const data = await response.json();
                if (data.results && data.results.length > 0) gameToNavigate = data.results[0];
                else throw new Error('Game not found in precise search');
            } catch (error) {
                console.error("Error fetching game for navigation:", error);
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
                 console.error("Error processing release date for navigation:", e);
                 displayError(`Error processing release date for "${gameToNavigate.name}".`);
            }
        } else {
            displayError(`"${gameToNavigate.name}" found, but no specific release date available.`);
        }
        showLoading(false);
    }

    function showLoading(isLoading) {
        loadingIndicator.style.display = isLoading ? 'flex' : 'none';
        [prevMonthBtn, nextMonthBtn, todayBtn, goToDateBtn, gameSearchInput].forEach(el => el.disabled = isLoading);
    }

    function displayError(message) {
        errorMessagesDiv.textContent = message;
        errorMessagesDiv.style.display = 'block';
    }
    
    async function handleApiError(response, contextMessage) {
        let errorDetail = response.statusText;
        try { const errorData = await response.json(); if (errorData && errorData.detail) errorDetail = errorData.detail; }
        catch (e) { /* ignore */ }
        console.error(`${contextMessage}: ${response.status} ${errorDetail}`);
        if (response.status === 401) displayError(`API Key Error: ${errorDetail}. Check config.js.`);
        else displayError(`${contextMessage}: ${response.status} ${errorDetail}.`);
    }

    init();
});