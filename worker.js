import 'dotenv/config';
import { supabaseAdmin } from './lib/supabaseClient.js';
import { ytGet, getRemainingKeys, resetKeyUsage } from './lib/youtubeClient.js';
import { GoogleGenerativeAI } from '@google/generative-ai';

// --- Initialize AI ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// --- Nichefy Outlier Rulebook ---
const LONG_FORM_MIN_VIEWS = 2000, LONG_FORM_MAX_SUBSCRIBERS = 30000, LONG_FORM_MIN_OUTLIER_RATIO = 15, LONG_FORM_MAX_OUTLIER_RATIO = 50;
const SHORTS_MIN_VIEWS = 50000, SHORTS_MIN_SUBSCRIBERS = 30000, SHORTS_MIN_OUTLIER_RATIO = 50;
const parseISODuration = (d) => { if (!d || typeof d !== 'string') return 0; const m = d.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/); if (!m) return 0; return (parseInt(m[1]||0)*3600) + (parseInt(m[2]||0)*60) + (parseInt(m[3]||0)); };
const DICTIONARY = ['idea', 'story', 'blue', 'glass', 'water', 'sound', 'city', 'mountain', 'river', 'fire', 'book', 'key', 'journey', 'moment', 'future', 'past', 'friend', 'smile', 'dream', 'power', 'change', 'truth', 'art', 'science', 'world', 'home', 'road', 'letter', 'reason', 'shadow', 'light', 'voice', 'silence', 'paper', 'number', 'line', 'square', 'circle', 'morning', 'night', 'yesterday', 'today', 'tomorrow', 'again'];
const chunkArray = (array, size) => { const chunks = []; for (let i = 0; i < array.length; i += size) { chunks.push(array.slice(i, i + size)); } return chunks; };

// --- AI Analysis Function ---
async function getAIAnalysis(video) {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
        const prompt = `Analyze the following YouTube video, which is a viral outlier for a small channel. Based on the title, explain in 1 concise paragraph (2-3 sentences) what makes the video concept compelling and why it likely went viral. Focus on the topic, title strategy, or audience appeal. Do not mention view/subscriber counts. Video Title: "${video.snippet.title}"`;
        const result = await model.generateContent(prompt);
        return result.response.text().trim();
    } catch (error) {
        console.error("❌ AI analysis error:", error.message);
        return "AI analysis could not be generated for this video.";
    }
}

// --- Main Engine Loop ---
async function engineLoop() {
    console.log(`\n--- [${new Date().toISOString()}] Starting new discovery cycle ---`);
    
    if (getRemainingKeys() === 0) {
        const now = new Date();
        const resetTime = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 8, 5, 0));
        const timeUntilReset = resetTime - now;
        if (timeUntilReset > 0) {
            console.log(`🔴 All API keys exhausted. Sleeping for ${Math.round(timeUntilReset / 1000 / 60 / 60)} hours...`);
            await new Promise(resolve => setTimeout(resolve, timeUntilReset));
        }
        resetKeyUsage();
        engineLoop();
        return;
    }

    try {
        const shuffledQueries = [...DICTIONARY].sort(() => 0.5 - Math.random()).slice(0, 10);
        const allFoundVideos = new Map();
        for (const query of shuffledQueries) {
            const searchResult = await ytGet('search', { part: 'snippet', type: 'video', order: 'date', maxResults: 50, q: query });
            if (searchResult?.items) {
                searchResult.items.forEach(item => allFoundVideos.set(item.id.videoId, item));
            }
        }
        
        const videoIds = Array.from(allFoundVideos.keys());
        const uniqueChannelIds = [...new Set(Array.from(allFoundVideos.values()).map(v => v.snippet.channelId))];

        if (videoIds.length === 0) {
            console.log("No videos found in this cycle.");
            return;
        }

        const videoIdChunks = chunkArray(videoIds, 50);
        const channelIdChunks = chunkArray(uniqueChannelIds, 50);

        const allVideoStats = (await Promise.all(videoIdChunks.map(chunk => ytGet('videos', { part: 'statistics,snippet,contentDetails', id: chunk.join(',') })))).flatMap(res => res.items || []);
        const allChannelStats = (await Promise.all(channelIdChunks.map(chunk => ytGet('channels', { part: 'statistics', id: chunk.join(',') })))).flatMap(res => res.items || []);
        const channelsMap = new Map(allChannelStats.map(c => [c.id, c.statistics]));

        const outliersToInsert = [];
        for (const video of allVideoStats) {
            if (!video.statistics || !video.snippet || !video.contentDetails) continue;
            const isShort = parseISODuration(video.contentDetails.duration) <= 61;
            const viewCount = Number(video.statistics.viewCount || 0);
            const channelData = channelsMap.get(video.snippet.channelId);
            if (!channelData) continue;
            const subscriberCount = Number(channelData.subscriberCount || 0);
            if (subscriberCount === 0) continue; // Avoid division by zero
            const outlierScore = viewCount / subscriberCount;
            let isOutlier = false;

            if (isShort) { if (subscriberCount >= SHORTS_MIN_SUBSCRIBERS && viewCount >= SHORTS_MIN_VIEWS && outlierScore >= SHORTS_MIN_OUTLIER_RATIO) isOutlier = true; } 
            else { if (subscriberCount < LONG_FORM_MAX_SUBSCRIBERS && viewCount >= LONG_FORM_MIN_VIEWS && outlierScore >= LONG_FORM_MIN_OUTLIER_RATIO && outlierScore <= LONG_FORM_MAX_OUTLIER_RATIO) isOutlier = true; }
            
            if (isOutlier) {
                console.log(`🔎 Outlier found: "${video.snippet.title}". Generating AI analysis...`);
                const aiAnalysis = await getAIAnalysis(video);
                outliersToInsert.push({ 
                    video_id: video.id, 
                    title: video.snippet.title, 
                    thumbnail_url: video.snippet.thumbnails.high.url, 
                    view_count: viewCount, 
                    subscriber_count: subscriberCount, 
                    channel_title: video.snippet.channelTitle, 
                    published_at: new Date(video.snippet.publishedAt), 
                    outlier_score: outlierScore, 
                    type: isShort ? 'short' : 'long',
                    ai_analysis: aiAnalysis
                });
            }
        }
        
        if (outliersToInsert.length > 0) {
            const { error } = await supabaseAdmin.from('outliers').upsert(outliersToInsert, { onConflict: 'video_id' });
            if (error) console.error("❌ Supabase insert error:", error.message);
            else console.log(`✅ Successfully saved/updated ${outliersToInsert.length} new AI-analyzed outliers!`);
        } else {
            console.log("No new outliers found in this cycle.");
        }

    } catch (error) {
        console.error("🔥 Cycle failed:", error.message);
    } finally {
        const pauseDuration = 2 * 60 * 1000; // 2 minutes
        console.log(`...pausing for ${pauseDuration / 1000 / 60} minutes before next cycle...`);
        setTimeout(engineLoop, pauseDuration);
    }
}

// --- Start the Engine! ---
engineLoop();