import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

document.addEventListener('DOMContentLoaded', async () => {
    let supabase;
    const dashboardContent = document.getElementById('dashboard-content');
    const logoutButton = document.getElementById('logout-button');
    let allOutliers = []; // Store the original dataset

    // --- 1. INITIALIZATION ---
    try {
        const response = await fetch('/api/config');
        if (!response.ok) throw new Error('Could not fetch server configuration.');
        const config = await response.json();
        supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);
    } catch (error) {
        dashboardContent.innerHTML = `<p class="error-message">Error: Could not load page.</p>`;
        return;
    }

    // --- 2. AUTHENTICATION ---
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        window.location.href = '/'; // Not logged in, redirect to home
        return;
    }

    logoutButton.addEventListener('click', async () => {
        await supabase.auth.signOut();
        window.location.href = '/';
    });

    // --- 3. RENDER CONTENT BASED ON SUBSCRIPTION ---
    const { data: profile } = await supabase
        .from('profiles')
        .select('subscription_status')
        .eq('id', session.user.id)
        .single();

    if (profile && profile.subscription_status === 'pro') {
        await renderProView();
    } else {
        renderFreeView();
    }
    
    // --- 4. RENDER FUNCTIONS ---
    function renderFreeView() {
        dashboardContent.innerHTML = `
            <div class="free-tier-view">
                <h1>You're on the Free Plan</h1>
                <p>Upgrade to Pro to unlock the full database and see AI-powered analysis on why these videos went viral.</p>
                <a href="/pricing" class="upgrade-button">Upgrade to Pro</a>
            </div>
        `;
    };

    async function renderProView() {
        dashboardContent.innerHTML = `
            <div class="dashboard-header">
                <h1>Outlier Dashboard</h1>
                <p>Newly discovered viral videos from small channels, analyzed by AI.</p>
            </div>
            <div class="controls">
                <div class="control-group">
                    <button id="filter-all" class="active">All</button>
                    <button id="filter-long">Long-form</button>
                    <button id="filter-short">Shorts</button>
                </div>
                <div class="control-group">
                    <input type="text" id="search-input" class="search-input" placeholder="Search by title...">
                </div>
            </div>
            <div class="outliers-grid" id="outliers-grid">
                <div class="loader"></div>
            </div>
        `;
        
        await fetchAndRenderOutliers();
        setupEventListeners();
    }

    async function fetchAndRenderOutliers() {
        try {
            const { data, error } = await supabase
                .from('outliers')
                .select('*')
                .order('published_at', { ascending: false });

            if (error) throw error;
            allOutliers = data;
            renderOutliers(allOutliers);
        } catch (err) {
            document.getElementById('outliers-grid').innerHTML = `<p class="error-message">Could not fetch outlier data.</p>`;
        }
    }
    
    function renderOutliers(outliers) {
        const grid = document.getElementById('outliers-grid');
        if (outliers.length === 0) {
            grid.innerHTML = '<p class="info-message">No outliers found matching your criteria.</p>';
            return;
        }
        grid.innerHTML = outliers.map(video => `
            <div class="outlier-card">
                <div class="card-thumbnail">
                    <a href="https://www.youtube.com/watch?v=${video.video_id}" target="_blank">
                        <img src="${video.thumbnail_url}" alt="Video thumbnail">
                        <span class="video-type-badge">${video.type}</span>
                    </a>
                </div>
                <div class="card-content">
                    <h3><a href="https://www.youtube.com/watch?v=${video.video_id}" target="_blank">${video.title}</a></h3>
                    <p class="channel-info">by <a href="https://www.youtube.com/channel/${video.channel_id}" target="_blank">${video.channel_title}</a></p>
                    <div class="card-stats">
                        <div class="stat"><span class="stat-value">${Number(video.view_count).toLocaleString()}</span> Views</div>
                        <div class="stat"><span class="stat-value">${Number(video.subscriber_count).toLocaleString()}</span> Subs</div>
                        <div class="stat"><span class="stat-value">${Math.round(video.outlier_score)}x</span> Outlier Score</div>
                    </div>
                    <div class="card-ai-analysis">${video.ai_analysis}</div>
                </div>
            </div>
        `).join('');
    }

    function setupEventListeners() {
        const filterButtons = document.querySelectorAll('.controls button');
        const searchInput = document.getElementById('search-input');

        filterButtons.forEach(button => {
            button.addEventListener('click', () => {
                filterButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                applyFilters();
            });
        });
        
        searchInput.addEventListener('input', applyFilters);
    }
    
    function applyFilters() {
        const activeFilter = document.querySelector('.controls button.active').id;
        const searchTerm = document.getElementById('search-input').value.toLowerCase();
        
        let filtered = allOutliers;

        // Apply type filter
        if (activeFilter === 'filter-long') {
            filtered = filtered.filter(v => v.type === 'long');
        } else if (activeFilter === 'filter-short') {
            filtered = filtered.filter(v => v.type === 'short');
        }

        // Apply search filter
        if (searchTerm) {
            filtered = filtered.filter(v => v.title.toLowerCase().includes(searchTerm));
        }
        
        renderOutliers(filtered);
    }
});

// Add Mouse Glow Effect to the Dashboard
document.addEventListener('DOMContentLoaded', () => {
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