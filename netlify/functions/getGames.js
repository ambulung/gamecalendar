// .netlify/functions/getGames.js

const axios = require('axios'); // Make sure you have axios installed (npm install axios)

exports.handler = async function(event, context) {
    // Extract query parameters from the client-side request
    const { searchQuery, year, month, pageSize, ordering, searchPrecise, searchExact } = event.queryStringParameters;
    
    // Your RAWG API Key should be set as an environment variable in Netlify
    // e.g., RAWG_API_KEY = YOUR_ACTUAL_RAWG_API_KEY
    const RAWG_API_KEY = process.env.RAWG_API_KEY;

    if (!RAWG_API_KEY) {
        console.error("RAWG_API_KEY environment variable not set in Netlify.");
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Server configuration error: API Key missing.' }),
        };
    }

    let url = 'https://api.rawg.io/api/games';
    const params = { key: RAWG_API_KEY };

    // Build RAWG API parameters based on the client's request
    if (searchQuery) {
        params.search = searchQuery;
        if (searchPrecise === 'true') params.search_precise = true;
        if (searchExact === 'true') params.search_exact = true;
    } else if (year && month) {
        // RAWG API expects month to be 1-indexed (Jan=1, Feb=2), but JS month is 0-indexed (Jan=0, Feb=1)
        const parsedMonth = parseInt(month); // Convert month string to integer
        const parsedYear = parseInt(year);

        const startDate = `${parsedYear}-${parsedMonth + 1}-01`;
        const endDate = `${parsedYear}-${parsedMonth + 1}-${new Date(parsedYear, parsedMonth + 1, 0).getDate()}`;
        params.dates = `${startDate},${endDate}`;
        params.ordering = ordering || '-released'; // Default ordering if not specified
    }

    params.page_size = pageSize || 40; // Default page size for the API call

    // --- NSFW Filtering Criteria ---
    // These are based on common RAWG data fields (ESRB ratings and tags)
    const NSFW_ESRB_RATINGS = ['Adults Only']; // Games with this ESRB rating will be excluded
    const NSFW_KEYWORDS = ['porn', 'hentai', 'adult', 'erotic', 'sexual', 'nudity']; // Games with tags containing these keywords will be excluded

    try {
        const response = await axios.get(url, { params });
        let games = response.data.results; // This is the array of games from RAWG

        // --- Apply NSFW Filtering ---
        const filteredGames = games.filter(game => {
            // 1. Check ESRB rating
            if (game.esrb_rating && NSFW_ESRB_RATINGS.includes(game.esrb_rating.name)) {
                // console.log(`[NSFW Filter] Excluding (ESRB): ${game.name} - ${game.esrb_rating.name}`); // For debugging
                return false; // Exclude this game (it's NSFW)
            }

            // 2. Check game tags for NSFW keywords
            if (game.tags && game.tags.some(tag =>
                NSFW_KEYWORDS.some(keyword => tag.name.toLowerCase().includes(keyword))
            )) {
                // console.log(`[NSFW Filter] Excluding (Tag): ${game.name}`); // For debugging
                return false; // Exclude this game (it has an NSFW tag)
            }

            // If the game passes both checks, it's not considered NSFW, so include it
            return true;
        });

        // Return the filtered list of games to the client
        return {
            statusCode: 200,
            body: JSON.stringify({ results: filteredGames, count: filteredGames.length }),
        };

    } catch (error) {
        console.error('Error calling RAWG API from Netlify function:', error.response ? error.response.data : error.message);
        return {
            statusCode: error.response ? error.response.status : 500,
            body: JSON.stringify({ error: 'Failed to fetch games from RAWG API', details: error.response ? error.response.data : error.message }),
        };
    }
};