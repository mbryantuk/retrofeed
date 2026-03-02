export const themes = {
    'modern-dark': {
        name: 'Deep Dark (Default)',
        sidebar: '#121214',
        card: '#1c1c1f',
        accent: '#6366f1',
        bg: '#09090b',
        text: '#fafafa'
    },
    'slate-grey': {
        name: 'Slate Grey',
        sidebar: '#1e293b',
        card: '#334155',
        accent: '#38bdf8',
        bg: '#0f172a',
        text: '#f8fafc'
    },
    'emerald-safe': {
        name: 'Emerald City',
        sidebar: '#064e3b',
        card: '#065f46',
        accent: '#10b981',
        bg: '#022c22',
        text: '#ecfdf5'
    },
    'pure-light': {
        name: 'Pure Light',
        sidebar: '#f4f4f5',
        card: '#ffffff',
        accent: '#6366f1',
        bg: '#fafafa',
        text: '#09090b'
    }
};

export function applyTheme(themeKey) {
    const theme = themes[themeKey] || themes['modern-dark'];
    const root = document.documentElement;
    
    root.style.setProperty('--color-sidebar', theme.sidebar);
    root.style.setProperty('--color-card', theme.card);
    root.style.setProperty('--color-accent', theme.accent);
    root.style.setProperty('--color-bg', theme.bg);
    root.style.setProperty('--color-text-main', theme.text);
    
    if (themeKey === 'pure-light') {
        root.style.setProperty('--color-text-muted', '#71717a');
        root.style.setProperty('--color-border', '#e4e4e7');
    } else {
        root.style.setProperty('--color-text-muted', '#a1a1aa');
        root.style.setProperty('--color-border', '#27272a');
    }

    localStorage.setItem('retrofeed_theme', themeKey);
}

export function initThemes() {
    const savedTheme = localStorage.getItem('retrofeed_theme') || 'modern-dark';
    applyTheme(savedTheme);
}
