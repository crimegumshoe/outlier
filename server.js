import 'dotenv/config';
import express from 'express';
import path from 'path';
import { Paddle, EventName } from '@paddle/paddle-node-sdk';
import { supabaseAdmin } from './lib/supabaseClient.js';

const app = express();
const port = process.env.PORT || 4000;
const __dirname = path.resolve();

// --- CORRECT INITIALIZATION ---
// Initialize Paddle with your main SECRET API KEY. This was the error before.
const paddle = new Paddle(process.env.PADDLE_API_KEY);

// Middleware to handle raw body for webhook verification
app.post('/api/paddle-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    try {
        // The signature is in the headers, the body is the raw payload,
        // and the WEBHOOK secret is used here for verification.
        const signature = req.headers['paddle-signature'];
        const webhookSecret = process.env.PADDLE_WEBHOOK_SECRET_KEY;
        const event = paddle.webhooks.unmarshal(req.body, webhookSecret, signature);

        console.log(`Received Paddle event: ${event.eventType}`);

        if (event.eventType === EventName.TransactionCompleted) {
            const userId = event.data.customData?.user_id;
            const customerId = event.data.customerId;

            if (!userId) {
                console.error('Webhook Error: Missing user_id in customData');
                return res.status(400).send('Webhook Error: Missing user_id');
            }

            const { error } = await supabaseAdmin.from('profiles').update({ 
                subscription_status: 'pro',
                paddle_customer_id: customerId 
            }).eq('id', userId);

            if (error) {
                console.error('Supabase update failed:', error.message);
                return res.status(500).send('Supabase update failed');
            }

            console.log(`✅ User ${userId} successfully upgraded to Pro via Paddle webhook!`);
        }
        res.status(200).send('Webhook received.');
    } catch (error) {
        console.error('❌ Webhook verification failed:', error.message);
        res.status(400).send('Webhook signature verification failed.');
    }
});


// Regular JSON parser for all other routes
app.use(express.json());

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// --- API ENDPOINTS ---
app.get('/api/config', (req, res) => {
    res.json({
        supabaseUrl: process.env.SUPABASE_URL,
        supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
        paddleClientToken: process.env.PADDLE_CLIENT_TOKEN,
        paddleProPriceId: process.env.PADDLE_PRO_PRICE_ID
    });
});


// --- PAGE SERVING ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/pricing', (req, res) => res.sendFile(path.join(__dirname, 'public', 'pricing.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));

// Start the server
app.listen(port, () => {
    console.log(`✅ Server is live at http://localhost:${port}`);
});