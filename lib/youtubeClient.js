import 'dotenv/config';

const keys = process.env.YOUTUBE_API_KEYS.split(',');
let keyUsage = new Map(keys.map(k => [k, 0]));
let currentKeyIndex = 0;

const MAX_QUOTA_PER_KEY = 9500; // Slightly under the 10,000 limit for safety

export const ytGet = async (endpoint, params) => {
    if (getRemainingKeys() === 0) {
        throw new Error("All YouTube API keys have reached their daily quota limit.");
    }
    
    let key = keys[currentKeyIndex];
    
    while (keyUsage.get(key) >= MAX_QUOTA_PER_KEY) {
        currentKeyIndex = (currentKeyIndex + 1) % keys.length;
        key = keys[currentKeyIndex];
    }
    
    params.key = key;
    const url = new URL(`https://www.googleapis.com/youtube/v3/${endpoint}`);
    url.search = new URLSearchParams(params).toString();
    
    const response = await fetch(url);
    const data = await response.json();
    
    // Estimate quota cost - a search is ~100 units.
    const cost = (endpoint === 'search') ? 100 : 1;
    keyUsage.set(key, keyUsage.get(key) + cost);
    
    currentKeyIndex = (currentKeyIndex + 1) % keys.length; // Rotate key on each request
    
    if (data.error) {
        throw new Error(`YouTube API Error: ${data.error.message}`);
    }
    return data;
};

export const getRemainingKeys = () => {
    return keys.filter(k => keyUsage.get(k) < MAX_QUOTA_PER_KEY).length;
};

export const resetKeyUsage = () => {
    keyUsage = new Map(keys.map(k => [k, 0]));
    console.log("YouTube API key usage has been reset.");
};