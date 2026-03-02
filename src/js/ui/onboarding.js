export const onboardingSteps = [
    {
        title: "WELCOME TO RETROFEED",
        body: "Your gateway to syncing high-fidelity podcast content to your legacy hardware. Let's configure your terminal."
    },
    {
        title: "STEP 1: ADD FEEDS",
        body: "Search for podcasts or paste RSS URLs. We'll automatically sanitize filenames for maximum device compatibility."
    },
    {
        title: "STEP 2: CACHE CONTENT",
        body: "Episodes are downloaded to your secure local IndexedDB cache. No internet required for later syncing."
    },
    {
        title: "STEP 3: HARDWARE SYNC",
        body: "Connect your USB Mass Storage device, select the drive, and hit SYNC. We'll handle the rest."
    }
];

export function startOnboarding() {
    const hasSeenOnboarding = localStorage.getItem('retrofeed_onboarding_complete');
    const isDevMode = localStorage.getItem('retrofeed_dev_mode') === 'true' || 
                      new URLSearchParams(window.location.search).get('dev') === 'true';
    if (hasSeenOnboarding || isDevMode) return;

    const overlay = document.getElementById('onboarding-overlay');
    const title = document.getElementById('onboarding-title');
    const body = document.getElementById('onboarding-body');
    const nextBtn = document.getElementById('onboarding-next-btn');
    const skipBtn = document.getElementById('onboarding-skip-btn');

    skipBtn.addEventListener('click', () => {
        overlay.classList.add('hidden');
        localStorage.setItem('retrofeed_onboarding_complete', 'true');
    });

    let currentStep = 0;

    overlay.classList.remove('hidden');

    function updateStep() {
        const step = onboardingSteps[currentStep];
        title.textContent = step.title;
        body.textContent = step.body;
        
        if (currentStep === onboardingSteps.length - 1) {
            nextBtn.textContent = "FINISH";
            skipBtn.classList.add('hidden');
        } else {
            nextBtn.textContent = "PROCEED";
            skipBtn.classList.remove('hidden');
        }
    }

    nextBtn.onclick = () => {
        currentStep++;
        if (currentStep >= onboardingSteps.length) {
            overlay.classList.add('hidden');
            localStorage.setItem('retrofeed_onboarding_complete', 'true');
        } else {
            updateStep();
        }
    };

    updateStep();
}
