// netlify/functions/rawg-proxy.js

// Use dynamic import for node-fetch v3+
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

// Access the API key from environment variables (SET IN NETLIFY UI)
const RAWG_API_KEY = process.env.RAWG_API_KEY;
const RAWG_BASE_URL = 'https://api.rawg.io/api';

exports.handler = async (event, context) => {
  // 1. Check if API Key is configured on Netlify
  if (!RAWG_API_KEY) {
    console.error("FATAL: RAWG_API_KEY environment variable is not set.");
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'API key configuration error on server.' }),
      headers: { 'Content-Type': 'application/json' }
    };
  }

  // 2. Get details from the frontend request
  const queryStringParams = event.queryStringParameters || {};
  // Determine the RAWG path (e.g., /games) by removing the function path prefix
  const rawgPath = event.path.replace('/.netlify/functions/rawg-proxy', '');

  // 3. Construct the target RAWG API URL
  const params = new URLSearchParams(queryStringParams);
  params.set('key', RAWG_API_KEY); // Securely add the API key

  const targetUrl = `${RAWG_BASE_URL}${rawgPath}?${params.toString()}`;

  // Log safely (without showing the key)
  const safeLogUrl = `${RAWG_BASE_URL}${rawgPath}?${new URLSearchParams(queryStringParams).toString()}&key=***HIDDEN***`;
  console.log(`Proxying request for: ${event.path} to ${safeLogUrl}`);

  try {
    // 4. Make the actual request to RAWG
    const rawgResponse = await fetch(targetUrl);
    const rawgData = await rawgResponse.json();

    // 5. Handle RAWG API errors
    if (!rawgResponse.ok) {
        console.error(`RAWG API Error (${rawgResponse.status}):`, rawgData);
         return {
            statusCode: rawgResponse.status, // Forward RAWG's status
            body: JSON.stringify(rawgData), // Forward RAWG's error details
            headers: { 'Content-Type': 'application/json' }
         };
    }

    // 6. Return successful data to the frontend
    return {
      statusCode: 200,
      body: JSON.stringify(rawgData),
      headers: { 'Content-Type': 'application/json' }
    };

  } catch (error) {
    // 7. Handle network or other errors during proxying
    console.error('Proxy Function Error:', error);
    return {
      statusCode: 502, // Bad Gateway might be appropriate
      body: JSON.stringify({ error: 'Proxy failed to connect to RAWG API.', details: error.message }),
      headers: { 'Content-Type': 'application/json' }
    };
  }
};