exports.handler = async function(event, context) {
    const apiKey = process.env.RAWG_API_KEY; // Access the environment variable

    // Get query parameters passed from the client (e.g., date, search query)
    const { date, month, year, searchQuery, gameSlug, pageSize, ordering, searchPrecise, searchExact } = event.queryStringParameters;

    let rawgApiUrl;

    // Construct the RAWG API URL based on the parameters received
    // This logic needs to mirror what your client-side was doing
    if (month && year) { // Fetching for a whole month
        const M = parseInt(month);
        const Y = parseInt(year);
        const getDaysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
        const startDate = `${Y}-${String(M + 1).padStart(2, '0')}-01`;
        const endDate = `${Y}-${String(M + 1).padStart(2, '0')}-${String(getDaysInMonth(Y, M)).padStart(2, '0')}`;
        rawgApiUrl = `https://api.rawg.io/api/games?key=${apiKey}&dates=${startDate},${endDate}&ordering=${ordering || '-metacritic,-added'}&page_size=${pageSize || 40}`;
    } else if (searchQuery) { // Fetching search suggestions or specific game
        let searchParams = `search=${encodeURIComponent(searchQuery)}&page_size=${pageSize || 6}`;
        if (searchPrecise) searchParams += `&search_precise=${searchPrecise}`;
        if (searchExact) searchParams += `&search_exact=${searchExact}`;
        rawgApiUrl = `https://api.rawg.io/api/games?key=${apiKey}&${searchParams}`;
    } else {
        // Handle other cases or return an error if parameters are missing
        return {
            statusCode: 400,
            body: JSON.stringify({ error: "Missing required query parameters for API call." }),
        };
    }

    console.log("Netlify Function: Fetching URL:", rawgApiUrl.replace(apiKey, "YOUR_API_KEY_HIDDEN")); // Log URL without key

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

        return {
            statusCode: 200,
            body: JSON.stringify(data), // Forward the RAWG response to the client
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