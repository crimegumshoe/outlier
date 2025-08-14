import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

document.addEventListener('paddle:ready', async () => {

    const upgradeButton = document.getElementById('upgrade-button');

    try {
        // --- 1. FETCH CONFIG & INITIALIZE LIBRARIES ---
        const response = await fetch('/api/config');
        if (!response.ok) throw new Error('Could not fetch server configuration.');
        const config = await response.json();
        
        const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);

        Paddle.Initialize({ token: config.paddleClientToken });

        // --- 2. CHECK USER AUTHENTICATION ---
        const { data: { session } } = await supabase.auth.getSession();

        if (!session || !session.user) {
            upgradeButton.disabled = true;
            upgradeButton.textContent = 'Please Login to Upgrade';
            upgradeButton.onclick = () => { window.location.href = '/'; };
            return; 
        }

        // --- 3. ATTACH THE WORKING CHECKOUT EVENT LISTENER ---
        upgradeButton.addEventListener('click', () => {
            Paddle.Checkout.open({
                items: [{ priceId: config.paddleProPriceId, quantity: 1 }],
                customer: { email: session.user.email },
                customData: { user_id: session.user.id }
            });
        });

    } catch (error) {
        console.error("Initialization or Auth failed:", error);
    }
});


// --- DYNAMIC UI EFFECTS ---
document.addEventListener('DOMContentLoaded', () => {
    // Reveal animation for pricing cards
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('is-visible');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1 });

    document.querySelectorAll('.pricing-card').forEach(el => observer.observe(el));

    // Re-initialize Mouse Glow Effect for this page
    const mouseGlow = document.getElementById('mouse-glow');
    if (mouseGlow) {
        document.addEventListener('mousemove', (e) => {
            requestAnimationFrame(() => {
                mouseGlow.style.left = `${e.clientX}px`;
                mouseGlow.style.top = `${e.clientY}px`;
            });
        });
    }
});