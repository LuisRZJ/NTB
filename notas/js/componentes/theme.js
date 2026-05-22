let currentThemeMode = localStorage.getItem('theme_mode') || 'auto';
let autoThemeConfig = JSON.parse(localStorage.getItem('auto_theme_config') || '{"mode":"device","batteryThreshold":20,"schedules":{"from":"18:00","to":"06:00"}}');

export function getThemeMode() {
    return currentThemeMode;
}

export function getAutoThemeConfig() {
    return autoThemeConfig;
}

export function setThemeMode(mode) {
    currentThemeMode = mode;
    localStorage.setItem('theme_mode', mode);
    applyTheme();
    updateThemeToggleButton();
}

export function setAutoThemeConfig(config) {
    autoThemeConfig = { ...autoThemeConfig, ...config };
    localStorage.setItem('auto_theme_config', JSON.stringify(autoThemeConfig));
    applyTheme();
}

function applyTheme() {
    let isDark = false;
    if (currentThemeMode === 'dark') {
        isDark = true;
    } else if (currentThemeMode === 'light') {
        isDark = false;
    } else {
        isDark = evaluateAutoTheme();
    }
    if (isDark) {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
}

function evaluateAutoTheme() {
    const config = autoThemeConfig;
    if (config.mode === 'device') {
        return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    if (config.mode === 'battery') {
        if ('getBattery' in navigator) {
            return navigator.getBattery().then(battery => {
                const isLowBattery = battery.level * 100 <= config.batteryThreshold && !battery.charging;
                return isLowBattery;
            }).catch(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
        }
        return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    if (config.mode === 'schedule') {
        return isWithinSchedule(config.schedules.from, config.schedules.to);
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function isWithinSchedule(from, to) {
    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();
    const [fromH, fromM] = from.split(':').map(Number);
    const [toH, toM] = to.split(':').map(Number);
    const fromMinutes = fromH * 60 + fromM;
    const toMinutes = toH * 60 + toM;
    if (fromMinutes < toMinutes) {
        return currentTime >= fromMinutes && currentTime < toMinutes;
    } else {
        return currentTime >= fromMinutes || currentTime < toMinutes;
    }
}

export function initializeTheme() {
    applyTheme();
    if (autoThemeConfig.mode === 'battery' && 'getBattery' in navigator) {
        navigator.getBattery().then(battery => {
            battery.addEventListener('levelchange', () => applyTheme());
            battery.addEventListener('chargingchange', () => applyTheme());
        }).catch(() => {});
    }
    if (autoThemeConfig.mode === 'schedule') {
        setInterval(applyTheme, 60000);
    }
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (currentThemeMode === 'auto' && autoThemeConfig.mode === 'device') {
            applyTheme();
        }
    });
    updateThemeToggleButton();
}

export function toggleTheme() {
    if (currentThemeMode === 'light') {
        setThemeMode('dark');
    } else if (currentThemeMode === 'dark') {
        setThemeMode('auto');
    } else {
        setThemeMode('light');
    }
}

export function updateThemeToggleButton() {
    const themeBtn = document.getElementById('theme-toggle-btn');
    const themeIcon = document.getElementById('theme-toggle-icon');
    const themeText = document.getElementById('theme-toggle-text');
    if (!themeBtn || !themeIcon || !themeText) return;
    const icons = { light: 'light_mode', dark: 'dark_mode', auto: 'brightness_auto' };
    const texts = { light: 'Modo Día', dark: 'Modo Noche', auto: 'Automático' };
    themeIcon.textContent = icons[currentThemeMode] || icons.auto;
    themeText.textContent = texts[currentThemeMode] || texts.auto;
    themeIcon.classList.remove('dark:hidden', 'hidden');
    if (currentThemeMode === 'dark') {
        themeIcon.classList.add('dark:hidden');
    } else if (currentThemeMode === 'light') {
        themeIcon.classList.remove('dark:hidden');
        themeIcon.classList.add('hidden');
    }
}

export function openAutoThemeDialog() {
    const backdrop = document.getElementById('auto-theme-dialog-backdrop');
    const container = document.getElementById('auto-theme-dialog-container');
    if (!backdrop || !container) return;
    const config = getAutoThemeConfig();
    const options = document.querySelectorAll('.auto-theme-option');
    const batteryConfig = document.getElementById('battery-config');
    const scheduleConfig = document.getElementById('schedule-config');
    const batteryThreshold = document.getElementById('battery-threshold');
    const batteryThresholdValue = document.getElementById('battery-threshold-value');
    const scheduleFrom = document.getElementById('schedule-from');
    const scheduleTo = document.getElementById('schedule-to');
    options.forEach(opt => {
        const radio = opt.querySelector('input[type="radio"]');
        const check = opt.querySelector('.auto-theme-check');
        if (radio.value === config.mode) {
            radio.checked = true;
            if (check) check.classList.remove('hidden');
        } else {
            radio.checked = false;
            if (check) check.classList.add('hidden');
        }
    });
    if (batteryThreshold) batteryThreshold.value = config.batteryThreshold || 20;
    if (batteryThresholdValue) batteryThresholdValue.textContent = (config.batteryThreshold || 20) + '%';
    if (scheduleFrom) scheduleFrom.value = config.schedules?.from || '18:00';
    if (scheduleTo) scheduleTo.value = config.schedules?.to || '06:00';
    if (batteryConfig) batteryConfig.classList.toggle('hidden', config.mode !== 'battery');
    if (scheduleConfig) scheduleConfig.classList.toggle('hidden', config.mode !== 'schedule');
    backdrop.classList.remove('hidden');
    backdrop.classList.add('flex');
    setTimeout(() => container.classList.remove('scale-95'), 10);
}

export function closeAutoThemeDialog() {
    const backdrop = document.getElementById('auto-theme-dialog-backdrop');
    const container = document.getElementById('auto-theme-dialog-container');
    if (!backdrop || !container) return;
    container.classList.add('scale-95');
    setTimeout(() => {
        backdrop.classList.remove('flex');
        backdrop.classList.add('hidden');
    }, 150);
}

export function saveAutoThemeConfig() {
    const selectedMode = document.querySelector('input[name="auto-theme-mode"]:checked');
    const mode = selectedMode ? selectedMode.value : 'device';
    const config = { mode };
    if (mode === 'battery') {
        const thresholdInput = document.getElementById('battery-threshold');
        config.batteryThreshold = thresholdInput ? parseInt(thresholdInput.value) : 20;
    }
    if (mode === 'schedule') {
        const fromInput = document.getElementById('schedule-from');
        const toInput = document.getElementById('schedule-to');
        config.schedules = {
            from: fromInput ? fromInput.value : '18:00',
            to: toInput ? toInput.value : '06:00'
        };
    }
    setAutoThemeConfig(config);
    setThemeMode('auto');
    closeAutoThemeDialog();
}

document.addEventListener('DOMContentLoaded', () => {
    const batteryThreshold = document.getElementById('battery-threshold');
    const batteryThresholdValue = document.getElementById('battery-threshold-value');
    if (batteryThreshold && batteryThresholdValue) {
        batteryThreshold.addEventListener('input', () => {
            batteryThresholdValue.textContent = batteryThreshold.value + '%';
        });
    }
    const options = document.querySelectorAll('.auto-theme-option');
    options.forEach(opt => {
        opt.addEventListener('click', () => {
            const mode = opt.dataset.mode;
            const batteryConfig = document.getElementById('battery-config');
            const scheduleConfig = document.getElementById('schedule-config');
            document.querySelectorAll('.auto-theme-option').forEach(o => {
                const check = o.querySelector('.auto-theme-check');
                if (check) check.classList.add('hidden');
            });
            const check = opt.querySelector('.auto-theme-check');
            if (check) check.classList.remove('hidden');
            if (batteryConfig) batteryConfig.classList.toggle('hidden', mode !== 'battery');
            if (scheduleConfig) scheduleConfig.classList.toggle('hidden', mode !== 'schedule');
        });
    });
});

window.toggleTheme = toggleTheme;
window.setThemeMode = setThemeMode;
window.getThemeMode = getThemeMode;
window.setAutoThemeConfig = setAutoThemeConfig;
window.getAutoThemeConfig = getAutoThemeConfig;
window.initializeTheme = initializeTheme;
window.openAutoThemeDialog = openAutoThemeDialog;
window.closeAutoThemeDialog = closeAutoThemeDialog;
window.saveAutoThemeConfig = saveAutoThemeConfig;