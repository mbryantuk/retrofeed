export function initPlayer() {
    const playerContainer = document.getElementById('mini-player');
    const audioEl = document.getElementById('html-audio-player');
    const playBtn = document.getElementById('player-play-btn');
    const closeBtn = document.getElementById('player-close-btn');
    const progressBar = document.getElementById('player-progress');
    const titleEl = document.getElementById('player-title');
    const showEl = document.getElementById('player-show');
    const artworkEl = document.getElementById('player-artwork');
    const timeCurrentEl = document.getElementById('player-time-current');
    const timeTotalEl = document.getElementById('player-time-total');
    const speedBtn = document.getElementById('player-speed-btn');
    const sleepBtn = document.getElementById('player-sleep-btn');
    const skipBackBtn = document.getElementById('player-skip-back');
    const skipForwardBtn = document.getElementById('player-skip-forward');

    let currentUrl = null;
    let sleepTimer = null;

    function formatTime(seconds) {
        if (isNaN(seconds)) return "0:00";
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    }

    playBtn.addEventListener('click', () => {
        if (audioEl.paused) {
            audioEl.play();
            playBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
        } else {
            audioEl.pause();
            playBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
        }
    });

    skipBackBtn.addEventListener('click', () => {
        audioEl.currentTime = Math.max(0, audioEl.currentTime - 15);
    });

    skipForwardBtn.addEventListener('click', () => {
        audioEl.currentTime = Math.min(audioEl.duration, audioEl.currentTime + 30);
    });

    closeBtn.addEventListener('click', () => {
        audioEl.pause();
        playerContainer.classList.add('hidden');
        currentUrl = null;
    });

    audioEl.addEventListener('timeupdate', () => {
        const percent = (audioEl.currentTime / audioEl.duration) * 100 || 0;
        progressBar.value = percent;
        timeCurrentEl.textContent = formatTime(audioEl.currentTime);
        timeTotalEl.textContent = formatTime(audioEl.duration);
        
        if (Math.floor(audioEl.currentTime) % 5 === 0 && currentUrl) {
            localStorage.setItem(`resume_${currentUrl}`, audioEl.currentTime);
        }
    });

    progressBar.addEventListener('input', (e) => {
        const percent = e.target.value;
        audioEl.currentTime = (percent / 100) * audioEl.duration;
    });

    // Playback Speed
    const speeds = [1.0, 1.25, 1.5, 1.75, 2.0];
    let currentSpeedIndex = 0;
    speedBtn.addEventListener('click', () => {
        currentSpeedIndex = (currentSpeedIndex + 1) % speeds.length;
        const speed = speeds[currentSpeedIndex];
        audioEl.playbackRate = speed;
        speedBtn.textContent = `${speed}x`;
    });

    // Sleep Timer
    sleepBtn.onclick = () => {
        const mins = prompt("Minutes until sleep?", "30");
        if (mins) {
            if (sleepTimer) clearTimeout(sleepTimer);
            sleepBtn.textContent = `${mins}m`;
            sleepTimer = setTimeout(() => {
                audioEl.pause();
                playBtn.click(); // Update UI
                sleepBtn.textContent = 'SLEEP';
            }, mins * 60000);
        }
    };

    // Media Session
    function updateMediaSession(title, show, artwork) {
        if ('mediaSession' in navigator) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: title,
                artist: show,
                artwork: artwork ? [{ src: artwork, sizes: '512x512', type: 'image/jpeg' }] : []
            });
        }
    }

    window.playEpisode = (url, title, show, artwork) => {
        if (currentUrl === url) {
            playBtn.click();
            return;
        }

        currentUrl = url;
        titleEl.textContent = title;
        showEl.textContent = show || 'Retrofeed';
        if (artworkEl) artworkEl.src = artwork || '';
        
        audioEl.src = url;
        const savedPos = localStorage.getItem(`resume_${url}`);
        if (savedPos) audioEl.currentTime = parseFloat(savedPos);

        audioEl.play();
        playBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
        playerContainer.classList.remove('hidden');
        updateMediaSession(title, show, artwork);
    };
}
