document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM Loaded. Initializing Calendar...");

    // --- DOM Elements ---
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

    // Add initial checks for essential elements
    if (!calendarGrid || !monthYearDisplay || !prevMonthButton || !nextMonthButton) { console.error("CRITICAL ERROR: Core calendar elements not found."); alert("Error: Could not initialize calendar elements."); return; }
    if (!loadingIndicator || !searchInput || !suggestionsContainer || !seekMonthSelect || !seekYearInput || !seekButton) { console.warn("Some non-critical elements missing."); }
    if (!themeToggle) { console.warn("Theme toggle element not found."); }


    // --- State & Constants ---
    let currentDate = new Date();
    const MAX_GAMES_PER_DAY = 10;
    let activeSlideshowIntervals = [];
    const SLIDESHOW_INTERVAL = 5000;
    const FADE_DURATION = 700;
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const SUGGESTION_DEBOUNCE_DELAY = 350;
    let currentRenderID = 0; // Version counter

    // --- Utility Functions ---
    function debounce(func, delay) { let timeoutId; return function(...args) { clearTimeout(timeoutId); timeoutId = setTimeout(() => func.apply(this, args), delay); }; }
    function getMonthName(monthIndex) { return monthNames[monthIndex]; }
    function showLoading() { if (!loadingIndicator) return; const cRgb = getComputedStyle(document.body).getPropertyValue('--container-bg-rgb').trim()||'255,255,255'; loadingIndicator.style.backgroundColor = `rgba(${cRgb}, 0.8)`; const t = calendarBody||calendarGrid; if(t && !t.contains(loadingIndicator)) t.appendChild(loadingIndicator); loadingIndicator.style.display='flex'; console.log("Loading shown."); }
    function hideLoading() { if(loadingIndicator?.parentNode) loadingIndicator.parentNode.removeChild(loadingIndicator); if(loadingIndicator) loadingIndicator.style.display='none'; console.log("Loading hidden."); }
    function clearSlideshowIntervals() { activeSlideshowIntervals.forEach(d => { clearInterval(d.id); if (d.element?.classList) { d.element.classList.remove('is-fading'); d.element.style.removeProperty('--fade-bg-image'); } }); activeSlideshowIntervals = []; }
    function processGameData(games) { const gbd={}; if(!games||games.length===0) return gbd; games.forEach(g => { if (g?.released && g.name){ const rd=g.released; if(!gbd[rd])gbd[rd]=[]; if(gbd[rd].length<MAX_GAMES_PER_DAY && !gbd[rd].some(e=>e.id===g.id)) gbd[rd].push(g); } }); console.log("Processed gamesByDate:",gbd); return gbd; }

    // --- Theme Management ---
    function applyTheme(theme) { document.body.classList.toggle('dark-mode', theme === 'dark'); if (themeToggle) themeToggle.checked = (theme === 'dark'); const cRgb = getComputedStyle(document.body).getPropertyValue('--container-bg-rgb').trim()||'255,255,255'; if(loadingIndicator) loadingIndicator.style.backgroundColor=`rgba(${cRgb}, 0.8)`; }
    function toggleTheme() { const nt = document.body.classList.contains('dark-mode')?'light':'dark'; localStorage.setItem('theme',nt); applyTheme(nt); }
    const savedTheme = localStorage.getItem('theme'); const prefersDark = !savedTheme && window.matchMedia?.('(prefers-color-scheme: dark)').matches; applyTheme(savedTheme || (prefersDark?'dark':'light'));
    if (themeToggle) themeToggle.addEventListener('change', toggleTheme);

    // --- Populate Seek Controls ---
    function populateSeekControls() { if (!seekMonthSelect || !seekYearInput) return; monthNames.forEach((n, i) => { const o=document.createElement('option'); o.value=i; o.textContent=n; seekMonthSelect.appendChild(o); }); seekMonthSelect.value = currentDate.getMonth(); seekYearInput.value = currentDate.getFullYear(); }

    // --- Calendar Logic ---

    async function renderCalendar(year, month, highlightDate = null) {
        if (!calendarGrid || !monthYearDisplay || !seekMonthSelect || !seekYearInput) return; // Guard clause
        const renderID = ++currentRenderID;
        console.log(`[${renderID}] Render: ${getMonthName(month)} ${year}. Highlight: ${highlightDate || 'None'}`);
        showLoading();

        // Update display text immediately
        monthYearDisplay.textContent = `${getMonthName(month)} ${year}`;
        if (seekMonthSelect) seekMonthSelect.value = month;
        if (seekYearInput) seekYearInput.value = year;

        let gamesOfMonth = null;
        let fetchError = null;
        let gamesByDate = {}; // Initialize gamesByDate here

        try {
            // --- Step 1: Fetch Data ---
            console.log(`[${renderID}] Starting fetch...`);
            gamesOfMonth = await fetchGamesForMonth(year, month);
            console.log(`[${renderID}] Fetch successful.`);

            // --- Step 2: Version Check ---
            if (renderID !== currentRenderID) {
                console.log(`[${renderID}] Discarding stale fetch results (current is ${currentRenderID}).`);
                return; // Exit early, do not process or render
            }

            // --- Step 3: Process Data (only if latest and fetch succeeded) ---
            console.log(`[${renderID}] Processing data...`);
            gamesByDate = processGameData(gamesOfMonth || []); // Assign processed data

            // --- Step 4: Render Grid (only if latest and fetch succeeded) ---
            console.log(`[${renderID}] Rendering grid...`);
            clearSlideshowIntervals();
            calendarGrid.innerHTML = ''; // Clear grid now
            document.querySelectorAll('.calendar-day.search-highlight').forEach(c => c.classList.remove('search-highlight'));

            const firstDayOfMonth = new Date(year, month, 1); const daysInMonth = new Date(year, month + 1, 0).getDate(); const startDayOfWeek = firstDayOfMonth.getDay();
            for (let i=0; i<startDayOfWeek; i++) createDayCell(null, true);
            for (let day=1; day<=daysInMonth; day++) {
                const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                // Access gamesByDate - guaranteed to be an object by this point if latest
                const gamesForDay = gamesByDate[dateStr] || [];
                createDayCell(day, false, gamesForDay, dateStr);
            }
            const totalCells = startDayOfWeek + daysInMonth; const remainingCells = (7 - (totalCells % 7)) % 7; for (let i=0; i<remainingCells; i++) createDayCell(null, true);

            // Apply Highlight if needed
            if (highlightDate) {
                const targetCell = calendarGrid.querySelector(`.calendar-day[data-date="${highlightDate}"]`);
                if (targetCell) { targetCell.classList.add('search-highlight'); if (targetCell.scrollIntoView) targetCell.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
                 else { console.warn(`[${renderID}] Highlight target cell not found.`); }
            }
            console.log(`[${renderID}] Grid built successfully.`);

        } catch (error) {
            // This catch handles errors from fetch (if latest) or processing/rendering
             // --- Step 2a: Version Check (within catch) ---
             // Only show error if this is the *latest* operation that failed
            if (renderID === currentRenderID) {
                console.error(`[${renderID}] Render/Process error:`, error);
                clearSlideshowIntervals(); // Still clear intervals
                calendarGrid.innerHTML = `<p style="color: red; grid-column: 1 / -1;">${error.message || 'Failed load.'}</p>`;
            } else {
                 console.log(`[${renderID}] Stale error ignored (current is ${currentRenderID}).`);
            }

        } finally {
            // Hide loading indicator ONLY if this is the latest operation, regardless of success/error
            if (renderID === currentRenderID) {
                console.log(`[${renderID}] Finalizing latest render. Hiding loading.`);
                hideLoading();
            } else {
                console.log(`[${renderID}] Stale render finalizing, not hiding loading (current is ${currentRenderID}).`);
            }
        }
    }

    // Creates and appends the day cell element
    function createDayCell(dayNumber, isOtherMonth = false, gamesArray = [], dateStr = null) {
        if (!calendarGrid) return;
        const dayCell = document.createElement('div'); dayCell.classList.add('calendar-day'); dayCell.dataset.day = dayNumber; if (isOtherMonth) dayCell.classList.add('other-month');
        if (!isOtherMonth && dayNumber !== null && dateStr) { dayCell.dataset.date = dateStr; }
        const daySpan = document.createElement('div'); daySpan.classList.add('day-number'); daySpan.textContent = dayNumber !== null ? dayNumber : ''; dayCell.appendChild(daySpan);
        const validGamesWithImages = gamesArray.filter(g => g?.background_image);
        if (!isOtherMonth && gamesArray.length > 0) {
            dayCell.classList.add('has-game');
            const gameList = document.createElement('ul'); gameList.classList.add('game-list');
            let itemsAdded = 0;
            gamesArray.forEach(game => {
                if (game?.name) {
                    const listItem = document.createElement('li'); listItem.classList.add('game-list-item'); listItem.textContent = game.name;
                    listItem.title = `${game.name}\nReleased: ${game.released||'N/A'}\nRating: ${game.rating||'N/A'}/5\nMetacritic: ${game.metacritic||'N/A'}`;
                    if (game.clip?.video) { listItem.style.cursor = 'pointer'; listItem.title += `\n(Click for Trailer)`; listItem.addEventListener('click', (e) => { e.stopPropagation(); window.open(game.clip.video, '_blank'); }); }
                    else { listItem.style.cursor = 'default'; }
                    gameList.appendChild(listItem); itemsAdded++;
                }
             });
             if (itemsAdded > 0) { dayCell.appendChild(gameList); }
            const initialGame = validGamesWithImages.length > 0 ? validGamesWithImages[0] : null; if (initialGame) { dayCell.style.backgroundImage = `url(${initialGame.background_image})`; dayCell.dataset.currentImageIndex = '0'; }
            if (validGamesWithImages.length > 1) {
                const intervalId = setInterval(() => { const style = window.getComputedStyle(dayCell); if (!document.body.contains(dayCell)||style.display==='none'){clearInterval(intervalId);activeSlideshowIntervals=activeSlideshowIntervals.filter(item=>item.id!==intervalId);return;} if(dayCell.classList.contains('is-fading'))return; let ci = parseInt(dayCell.dataset.currentImageIndex||'0',10); const ni=(ci+1)%validGamesWithImages.length; const ng=validGamesWithImages[ni]; if(!ng?.background_image){dayCell.dataset.currentImageIndex=String(ni);return;} const nu=`url(${ng.background_image})`; dayCell.style.setProperty('--fade-bg-image',nu); dayCell.classList.add('is-fading'); setTimeout(()=>{if(!document.body.contains(dayCell)||!dayCell.classList.contains('is-fading')){if(dayCell.classList){dayCell.classList.remove('is-fading');dayCell.style.removeProperty('--fade-bg-image');}return;} dayCell.style.backgroundImage=nu; dayCell.classList.remove('is-fading'); dayCell.dataset.currentImageIndex=String(ni);},FADE_DURATION);}, SLIDESHOW_INTERVAL); activeSlideshowIntervals.push({ id: intervalId, element: dayCell });
            }
        }
        calendarGrid.appendChild(dayCell);
   }

    // --- API Call Functions (Using Proxy) ---
    async function fetchGamesForMonth(year, month) { /* ... (Keep exact implementation) ... */ }
    async function fetchSuggestions(query) { /* ... (Keep exact implementation) ... */ }
    async function searchAndJumpToGame(query) { /* ... (Keep exact implementation) ... */ }

    // --- Suggestion Display Logic ---
    function displaySuggestions(games) { /* ... (Keep exact implementation) ... */ }
    function handleSuggestionClick(game) { /* ... (Keep exact implementation) ... */ }
    const debouncedFetchSuggestions = debounce(async (query) => { if(!searchInput?.value?.trim()) return; const games = await fetchSuggestions(query); displaySuggestions(games); }, SUGGESTION_DEBOUNCE_DELAY);

    // --- Date Seek Feature ---
    function handleSeek() { /* ... (Keep exact implementation) ... */ }

    // --- Event Listeners ---
    if (prevMonthButton) prevMonthButton.addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth() - 1); if(searchInput) searchInput.value = ''; if(suggestionsContainer){suggestionsContainer.style.display = 'none'; suggestionsContainer.innerHTML = '';} renderCalendar(currentDate.getFullYear(), currentDate.getMonth()); });
    if (nextMonthButton) nextMonthButton.addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth() + 1); if(searchInput) searchInput.value = ''; if(suggestionsContainer){suggestionsContainer.style.display = 'none'; suggestionsContainer.innerHTML = '';} renderCalendar(currentDate.getFullYear(), currentDate.getMonth()); });
    if (searchInput) {
        searchInput.addEventListener('input', () => { const query = searchInput.value.trim(); if (query.length > 1) { debouncedFetchSuggestions(query); } else { if(suggestionsContainer){suggestionsContainer.style.display = 'none'; suggestionsContainer.innerHTML = '';} } });
        searchInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); searchAndJumpToGame(searchInput.value.trim()); } else if (event.key === 'Escape') { if(suggestionsContainer){suggestionsContainer.style.display = 'none'; suggestionsContainer.innerHTML = '';} } });
    }
    document.addEventListener('click', (event) => { if (searchInput && suggestionsContainer && !searchInput.contains(event.target) && !suggestionsContainer.contains(event.target)) { suggestionsContainer.style.display = 'none'; suggestionsContainer.innerHTML = ''; } });
    if (seekButton) seekButton.addEventListener('click', handleSeek);
    if (seekYearInput) seekYearInput.addEventListener('keypress', (event) => { if (event.key === 'Enter') { event.preventDefault(); handleSeek(); } });

    // Debounced function for filter changes (if needed later)
    const debouncedRefetchCurrentView = debounce(() => {
        if (currentDate) {
            renderCalendar(currentDate.getFullYear(), currentDate.getMonth());
        }
    }, 300);


    // --- Initial Load ---
    populateSeekControls();
    renderCalendar(currentDate.getFullYear(), currentDate.getMonth());

    console.log("Calendar script initialized.");

}); // End DOMContentLoaded