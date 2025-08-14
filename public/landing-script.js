import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

document.addEventListener('DOMContentLoaded', async () => {
    let supabase;
    const authButtonsContainer = document.querySelector('.auth-buttons');
    const mainCta = document.querySelector('.google-cta');

    // --- 1. INITIALIZATION ---
    try {
        const response = await fetch('/api/config');
        if (!response.ok) throw new Error('Could not fetch server configuration.');
        const config = await response.json();
        supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);
    } catch (error) {
        console.error("Initialization failed:", error);
        return;
    }

    // --- 2. AUTHENTICATION LOGIC ---
    const handleGoogleLogin = (e) => {
        e.preventDefault();
        supabase.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: `${window.location.origin}/dashboard` }
        });
    };

    // THIS IS THE NEW, SMARTER UI UPDATE FUNCTION
    const updateUserInterface = async (session) => {
        if (session) {
            // User is logged in, hide the main Google button
            if(mainCta) mainCta.style.display = 'none';

            // Now, check their subscription status from the 'profiles' table
            const { data: profile } = await supabase
                .from('profiles')
                .select('subscription_status')
                .eq('id', session.user.id)
                .single();

            if (profile && profile.subscription_status === 'pro') {
                // PRO user: Show Dashboard button
                authButtonsContainer.innerHTML = `<a href="/dashboard" class="nav-button">Dashboard</a>`;
            } else {
                // FREE user: Show Upgrade button
                authButtonsContainer.innerHTML = `<a href="/pricing" class="nav-button">Upgrade Now</a>`;
            }
        } else {
            // User is LOGGED OUT
            authButtonsContainer.innerHTML = `
                <a href="#" class="login-link">Login</a>
                <a href="#" class="nav-button signup-button">Sign Up</a>
            `;
            if(mainCta) mainCta.style.display = 'inline-block';
            document.querySelector('.login-link').onclick = handleGoogleLogin;
            document.querySelector('.signup-button').onclick = handleGoogleLogin;
            if(mainCta) mainCta.onclick = handleGoogleLogin;
        }
    };

    // --- 3. DYNAMIC UI & ANIMATIONS ---
    const heroContent = document.querySelector('.hero-content');
    if (heroContent) {
        document.addEventListener('mousemove', (e) => {
            const { clientX, clientY } = e;
            const x = (clientX / window.innerWidth - 0.5) * -40;
            const y = (clientY / window.innerHeight - 0.5) * -30;
            requestAnimationFrame(() => {
                heroContent.style.transform = `rotateY(${x / 5}deg) rotateX(${-y / 5}deg) translateZ(0)`;
            });
        });
    }

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('is-visible');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1 });

    document.querySelectorAll('.feature-card').forEach(el => observer.observe(el));
    
    const mouseGlow = document.getElementById('mouse-glow');
    if (mouseGlow) {
        document.addEventListener('mousemove', (e) => {
            requestAnimationFrame(() => {
                mouseGlow.style.left = `${e.clientX}px`;
                mouseGlow.style.top = `${e.clientY}px`;
            });
        });
    }

    // --- 4. EXECUTION ---
    const { data: { session } } = await supabase.auth.getSession();
    await updateUserInterface(session); // Await the initial check

    supabase.auth.onAuthStateChange((_event, session) => {
        updateUserInterface(session); // Update UI on login/logout
    });
});