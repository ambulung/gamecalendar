document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM Loaded. Initializing Calendar...");

    // --- DOM Elements ---
    const calendarBody = document.querySelector('.calendar-body');
    const calendarGrid = document.getElementById('calendar-grid');
    const monthYearDisplay = document.getElementById('month-year');
    const prevMonthButton = document.getElementById('prev-month');
    const nextMonthButton = document.getElementById('next-month');
    const loadingIndicator = document.getElementById('loading-indicator');
    const themeToggle = document.getElementById('theme-toggle'); // Find the toggle
    const nsfwToggle = document.getElementById('nsfw-toggle');
    const searchInput = document.getElementById('search-input');
    const suggestionsContainer = document.getElementById('search-suggestions');
    const seekMonthSelect = document.getElementById('seek-month');
    const seekYearInput = document.getElementById('seek-year');
    const seekButton = document.getElementById('seek-button');

    // Add initial checks for essential elements
    if (!calendarGrid || !monthYearDisplay || !prevMonthButton || !nextMonthButton) {
        console.error("CRITICAL ERROR: Core calendar elements not found in the DOM. Aborting script.");
        alert("Error: Could not initialize calendar elements. Please check the HTML structure.");
        return;
    }
    if (!loadingIndicator || !searchInput || !suggestionsContainer || !seekMonthSelect || !seekYearInput || !seekButton) {
        console.warn("Some non-critical elements for search/seek/loading not found. Functionality may be limited.");
    }
    if (!themeToggle) { // Specific check for theme toggle
        console.warn("Theme toggle element (#theme-toggle) not found. Dark mode switching disabled.");
    }
    if (!nsfwToggle) {
         console.warn("NSFW toggle element not found. NSFW filter functionality disabled.");
     }

    // --- State & Constants ---
    let currentDate = new Date();
    const MAX_GAMES_PER_DAY = 10;
    let activeSlideshowIntervals = [];
    const SLIDESHOW_INTERVAL = 5000;
    const FADE_DURATION = 700;
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const SUGGESTION_DEBOUNCE_DELAY = 350;
    let currentRenderID = 0;
    let hideNsfw = true;

    // --- Utility Functions ---
    function debounce(func, delay) { /* ... (keep implementation) ... */ }
    function getMonthName(monthIndex) { return monthNames[monthIndex]; }
    function showLoading() { /* ... (keep implementation) ... */ }
    function hideLoading() { /* ... (keep implementation) ... */ }
    function clearSlideshowIntervals() { /* ... (keep implementation) ... */ }
    function processGameData(games) { /* ... (keep implementation) ... */ }
    function addApiParams(params) { /* ... (keep implementation) ... */ }
    async function fetchGamesForMonth(year, month) { /* ... (keep implementation) ... */ }
    async function fetchSuggestions(query) { /* ... (keep implementation) ... */ }

    // --- Theme Management (With Debugging) ---
    function applyTheme(theme) {
        console.log(`Applying theme: ${theme}`); // Log theme being applied
        // Use toggle force argument for clarity
        if (theme === 'dark') {
            document.body.classList.add('dark-mode');
        } else {
            document.body.classList.remove('dark-mode');
        }
        console.log(`Body class list after applyTheme: ${document.body.classList}`); // Check class

        if (themeToggle) { // Check if toggle exists
             themeToggle.checked = (theme === 'dark');
             console.log(`Theme toggle checked state set to: ${theme === 'dark'}`);
        } else {
             console.warn("Theme toggle element not found when trying to set checked state.");
        }
        // Update loader background (ensure loadingIndicator exists)
        if (loadingIndicator) {
            const containerRgb = getComputedStyle(document.body).getPropertyValue('--container-bg-rgb').trim() || '255, 255, 255';
             loadingIndicator.style.backgroundColor = `rgba(${containerRgb}, 0.8)`;
        }
    }

    function toggleTheme() {
        console.log("Toggling theme...");
        // Determine the NEW theme based on the CURRENT state
        const newTheme = document.body.classList.contains('dark-mode') ? 'light' : 'dark';
        console.log(`New theme will be: ${newTheme}`);
        localStorage.setItem('theme', newTheme); // Save preference
        applyTheme(newTheme); // Apply the new theme
    }

    // --- Initialize Theme on Load ---
    console.log("Initializing theme...");
    const savedTheme = localStorage.getItem('theme');
    console.log("Saved theme from localStorage:", savedTheme);
    const prefersDark = !savedTheme && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    console.log("Prefers dark scheme:", prefersDark);
    // Determine initial theme: saved value OR system preference OR default to light
    const initialTheme = savedTheme || (prefersDark ? 'dark' : 'light');
    console.log(`Applying initial theme: ${initialTheme}`);
    applyTheme(initialTheme); // Apply initial theme

    // --- Attach Theme Toggle Listener ---
    if (themeToggle) {
        console.log("Attaching change listener to theme toggle.");
        themeToggle.addEventListener('change', toggleTheme);
    } else {
        console.warn("Theme toggle element not found. Cannot attach listener.");
    }
    // --- End Theme Management ---


    // --- NSFW Filter Management ---
    function applyNsfwFilterState(shouldHide) { /* ... (keep implementation) ... */ }
    function toggleNsfwFilter() { /* ... (keep implementation) ... */ }
    const savedNsfwPref = localStorage.getItem('hideNsfwPref'); const initialHideNsfw = savedNsfwPref === 'false' ? false : true; applyNsfwFilterState(initialHideNsfw);
    if (nsfwToggle) nsfwToggle.addEventListener('change', toggleNsfwFilter);

    // --- Populate Seek Controls ---
    function populateSeekControls() { /* ... (keep implementation) ... */ }

    // --- Rendering Calendar ---
    async function renderCalendar(year, month, highlightDate = null) { /* ... (keep implementation) ... */ }
    function createDayCell(dayNumber, isOtherMonth = false, gamesArray = [], dateStr = null) { /* ... (keep implementation) ... */ }

    // --- Search and Jump Feature ---
    async function searchAndJumpToGame(query) { /* ... (keep implementation) ... */ }

    // --- Suggestion Display Logic ---
    function displaySuggestions(games) { /* ... (keep implementation) ... */ }
    function handleSuggestionClick(game) { /* ... (keep implementation) ... */ }
    const debouncedFetchSuggestions = debounce(async (query) => { if(!searchInput?.value?.trim()) return; const games = await fetchSuggestions(query); displaySuggestions(games); }, SUGGESTION_DEBOUNCE_DELAY);

    // --- Date Seek Feature ---
    function handleSeek() { /* ... (keep implementation) ... */ }

    // Debounced function to re-render the current view after filter change
    const debouncedRefetchCurrentView = debounce(() => {
        if (currentDate) {
            renderCalendar(currentDate.getFullYear(), currentDate.getMonth());
        }
    }, 300);

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

    // --- Initial Load ---
    populateSeekControls();
    renderCalendar(currentDate.getFullYear(), currentDate.getMonth());

    console.log("Calendar script initialized.");

}); // End DOMContentLoaded