export function createSearchModal() {
    if (document.getElementById('search-modal')) return;

    const modalHTML = `
        <div id="search-modal" class="modal-overlay hidden">
            <div class="modal-content" style="max-width: 500px;">
                <div class="modal-header">
                    <h3 class="modal-title">Search Results</h3>
                    <button class="close-btn" id="close-search-btn">&times;</button>
                </div>
                <div class="modal-body" style="padding: 1rem;">
                    <ul id="search-results-list" class="episode-list">
                        <!-- Results injected here -->
                    </ul>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);

    const closeBtn = document.getElementById('close-search-btn');
    closeBtn.addEventListener('click', closeSearchModal);
}

export function openSearchModal(results, onSelectCallback) {
    createSearchModal();
    const modal = document.getElementById('search-modal');
    const listEl = document.getElementById('search-results-list');
    
    listEl.innerHTML = '';
    
    if (results.length === 0) {
        listEl.innerHTML = '<li style="text-align:center; color: var(--color-text-muted); padding: 2rem;">No podcasts found.</li>';
    } else {
        results.forEach((result) => {
            if (!result.feedUrl) return;
            
            const li = document.createElement('li');
            li.className = 'episode-item';
            li.style.cursor = 'pointer';
            li.style.flexDirection = 'row';
            li.style.alignItems = 'center';
            li.style.gap = '1rem';
            li.style.background = 'rgba(255,255,255,0.03)';
            
            li.innerHTML = `
                <img src="${result.artwork}" alt="" onerror="this.onerror=null; this.src='data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' viewBox=\\'0 0 100 100\\'%3E%3Crect width=\\'100\\' height=\\'100\\' fill=\\'%23374151\\'/%3E%3Ctext x=\\'50%25\\' y=\\'50%25\\' dominant-baseline=\\'middle\\' text-anchor=\\'middle\\' font-family=\\'sans-serif\\' font-size=\\'40\\' fill=\\'white\\'%3E${(result.title.replace(/^the\\s+/i, '').charAt(0) || 'P').toUpperCase()}%3C/text%3E%3C/svg%3E'" style="width:60px; height:60px; border-radius:8px; object-fit:cover;">
                <div style="flex-grow:1; overflow:hidden;">
                    <div class="ep-title" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${result.title}</div>
                    <div class="ep-meta" style="margin:0">${result.author || 'Unknown'}</div>
                </div>
            `;
            
            li.addEventListener('click', () => {
                closeSearchModal();
                onSelectCallback(result.feedUrl, result.artwork);
            });
            
            listEl.appendChild(li);
        });
    }

    modal.classList.remove('hidden');
}

export function closeSearchModal() {
    const modal = document.getElementById('search-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
}
