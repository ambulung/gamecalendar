document.addEventListener('DOMContentLoaded', () => {
    // ... (apiKey check removed, other consts remain same) ...
    const calendarGridView = document.getElementById('calendarGridView'); // Get Grid container
    const calendarListView = document.getElementById('calendarListView'); // Get List container
    // ... (other consts like currentMonthYearDisplay, etc.) ...

    // ... (init, event listeners, dark mode, navigation, utilities remain same) ...

    // --- Helper Function to Create Game Item Element ---
    // Moved this logic into a reusable function
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


    async function renderCalendar(year, month) {
        console.log(`Client: renderCalendar(${year}, ${month}) called`);
        showLoading(true);
        if(errorMessagesDiv) errorMessagesDiv.style.display = 'none';
        if(currentMonthYearDisplay) currentMonthYearDisplay.textContent = `${monthNames[month]} ${year}`;
        if(monthSelect) monthSelect.value = month;
        if(yearSelect) yearSelect.value = year;

        clearAllSlideshows();
        // Clear both containers
        if(calendarGridView) calendarGridView.querySelectorAll('.calendar-day, .empty-day, .day-name:not(:first-child):not(:nth-child(2)):not(:nth-child(3)):not(:nth-child(4)):not(:nth-child(5)):not(:nth-child(6)):not(:nth-child(7))').forEach(el => el.remove()); // Remove old cells/empty days but keep first 7 day-name headers
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
            let hasGamesInList = false; // Flag to check if any games were added
            for (let day = 1; day <= daysInCurrentMonth; day++) {
                const gamesOnThisDay = gamesByDay[day];

                // **Only render the day if there are games releasing**
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

    // ... (startSlideshowForCell remains the same) ...
    function startSlideshowForCell(slideshowDiv, intervalTime) { /* ... */ }

    // ... (fetchGamesForMonth, fetchSearchSuggestions, findAndGoToGame remain the same - using Netlify functions) ...
    async function fetchGamesForMonth(year, month) { /* ... */ }
    async function fetchSearchSuggestions(query) { /* ... */ }
    async function findAndGoToGame(gameName, releaseDateStr, gameSlug) { /* ... */ }

    // ... (displaySearchSuggestions, showLoading, displayError remain the same) ...
    function displaySearchSuggestions(suggestions) { /* ... */ }
    function showLoading(isLoading) { /* ... */ }
    function displayError(message) { /* ... */ }

    // ... (init() call at the end) ...
    init();
});