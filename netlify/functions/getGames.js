// .netlify/functions/getGames.js

// This function uses the global `fetch` API, which is available in Netlify Functions' Node.js runtime.
// Therefore, no external modules like 'axios' or 'node-fetch' are needed.

exports.handler = async function(event, context) {
    const apiKey = process.env.RAWG_API_KEY; // Access the environment variable

    if (!apiKey) {
        console.error("RAWG_API_KEY environment variable not set in Netlify.");
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Server configuration error: API Key missing.' }),
        };
    }

    // Get query parameters passed from the client (e.g., date, search query)
    const { date, month, year, searchQuery, gameSlug, pageSize, ordering, searchPrecise, searchExact } = event.queryStringParameters;

    let rawgApiUrl;
    let params = new URLSearchParams({ key: apiKey });

    // Construct the RAWG API URL based on the parameters received
    // This logic needs to mirror what your client-side was doing
    if (month && year) { // Fetching for a whole month
        const M = parseInt(month);
        const Y = parseInt(year);
        const getDaysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
        const startDate = `${Y}-${String(M + 1).padStart(2, '0')}-01`;
        const endDate = `${Y}-${String(M + 1).padStart(2, '0')}-${String(getDaysInMonth(Y, M)).padStart(2, '0')}`;
        params.append('dates', `${startDate},${endDate}`);
        params.append('ordering', ordering || '-metacritic,-added');
        params.append('page_size', pageSize || 40);
        rawgApiUrl = `https://api.rawg.io/api/games?${params.toString()}`;

    } else if (searchQuery) { // Fetching search suggestions or specific game
        params.append('search', searchQuery); // Use append, encodeURIComponent is handled by URLSearchParams
        params.append('page_size', pageSize || 6);
        if (searchPrecise) params.append('search_precise', searchPrecise);
        if (searchExact) params.append('search_exact', searchExact);
        rawgApiUrl = `https://api.rawg.io/api/games?${params.toString()}`;

    } else {
        // Handle other cases or return an error if parameters are missing
        return {
            statusCode: 400,
            body: JSON.stringify({ error: "Missing required query parameters for API call." }),
        };
    }

    console.log("Netlify Function: Fetching URL:", rawgApiUrl.replace(apiKey, "YOUR_API_KEY_HIDDEN")); // Log URL without key

    // --- NSFW Filtering Criteria ---
    // These are based on common RAWG data fields (ESRB ratings and tags)
    const NSFW_ESRB_RATINGS = ['Adults Only']; // Games with this ESRB rating will be excluded
    const NSFW_KEYWORDS = ['porn', 'hentai', 'adult', 'erotic', 'sexual', 'nudity']; // Games with tags containing these keywords will be excluded

    function isGameNSFW(game) {
        // 1. Check ESRB rating
        if (game.esrb_rating && NSFW_ESRB_RATINGS.includes(game.esrb_rating.name)) {
            // console.log(`[NSFW Filter] Excluding (ESRB): ${game.name} - ${game.esrb_rating.name}`); // Uncomment for debugging
            return true; // Exclude this game (it's NSFW)
        }

        // 2. Check game tags for NSFW keywords
        if (game.tags && game.tags.some(tag =>
            NSFW_KEYWORDS.some(keyword => tag.name.toLowerCase().includes(keyword))
        )) {
            // console.log(`[NSFW Filter] Excluding (Tag): ${game.name}`); // Uncomment for debugging
            return true; // Exclude this game (it has an NSFW tag)
        }

        // If the game passes both checks, it's not considered NSFW, so include it
        return false;
    }

    try {
        const response = await fetch(rawgApiUrl);
        const data = await response.json();

        if (!response.ok) {
            console.error("RAWG API Error:", data);
            return {
                statusCode: response.status,
                body: JSON.stringify({ error: `RAWG API Error: ${response.statusText}`, details: data }),
            };
        }

        // --- Apply NSFW Filtering ---
        let filteredResults = data.results; // Assume 'results' array is present

        if (Array.isArray(data.results)) { // Ensure 'results' is an array before filtering
            filteredResults = data.results.filter(game => !isGameNSFW(game));
        } else {
            // Handle cases where RAWG might return a single game object directly (e.g., precise search for one game)
            // Or if the data structure is unexpected, try to filter the whole object if it's a game.
            // For robust filtering, if `data` itself is a single game object, filter it.
            if (!Array.isArray(data.results) && data.name && isGameNSFW(data)) { // Check if 'data' looks like a single game
                console.log(`[NSFW Filter] Excluding single game (check): ${data.name}`);
                filteredResults = []; // No results if the single game is NSFW
            } else if (!Array.isArray(data.results)) {
                 // If it's not an array of results, and not a single game object (that we filtered),
                 // then just return the original data, or handle as an error if unexpected.
                 // For now, we'll assume `data.results` is the primary target.
                 console.warn("RAWG response does not contain a 'results' array or a single filterable game object.", data);
                 // If you expect other data structures for single game fetches, adjust this.
                 filteredResults = data; // Pass original data if it's not an array of results or a single game
            }
        }
        
        // Return the filtered data. Adjust the response structure to always return 'results' and 'count' for consistency.
        return {
            statusCode: 200,
            body: JSON.stringify({
                results: filteredResults,
                count: Array.isArray(filteredResults) ? filteredResults.length : 1 // Adjust count based on filtered type
            }),
            headers: {
                'Content-Type': 'application/json',
            }
        };

    } catch (error) {
        console.error("Error in Netlify function:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Failed to fetch data from RAWG API via function.", details: error.message }),
        };
    }
};