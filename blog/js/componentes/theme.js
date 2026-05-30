// ============================================================
// theme.js — Gestión de temas (claro, oscuro, automático)
// ============================================================

let currentThemeMode = localStorage.getItem('blog_theme_mode') || 'auto';
let autoThemeConfig = JSON.parse(
    localStorage.getItem('blog_auto_theme_config') ||
    '{"mode":"device","batteryThreshold":20,"schedules":{"from":"18:00","to":"06:00"}}'
);

export function getThemeMode() {
    return currentThemeMode;
}

export function getAutoThemeConfig() {
    return autoThemeConfig;
}

export function setThemeMode(mode) {
    currentThemeMode = mode;
    localStorage.setItem('blog_theme_mode', mode);
    applyTheme();
    updateThemeToggleButton();
}

export function setAutoThemeConfig(config) {
    autoThemeConfig = { ...autoThemeConfig, ...config };
    localStorage.setItem('blog_auto_theme_config', JSON.stringify(autoThemeConfig));
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
        document.documentElement.classList.remove('light');
    } else {
        document.documentElement.classList.remove('dark');
        document.documentElement.classList.add('light');
    }
}

function evaluateAutoTheme() {
    const config = autoThemeConfig;
    if (config.mode === 'device') {
        return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    if (config.mode === 'battery') {
        // Por seguridad, si no es soportado, devolvemos falso o falso-positivo
        // Pero intentamos leer sincrónicamente un valor guardado o asumir falso
        const cachedBattery = localStorage.getItem('blog_last_battery_dark');
        return cachedBattery === 'true';
    }
    if (config.mode === 'schedule') {
        const now = new Date();
        const currentTime = now.getHours() * 60 + now.getMinutes();
        const [fromH, fromM] = (config.schedules?.from || '18:00').split(':').map(Number);
        const [toH, toM] = (config.schedules?.to || '06:00').split(':').map(Number);
        const fromMinutes = fromH * 60 + fromM;
        const toMinutes = toH * 60 + toM;

        if (fromMinutes < toMinutes) {
            return currentTime >= fromMinutes && currentTime <= toMinutes;
        } else {
            // Cruza la medianoche (ej: 18:00 a 06:00)
            return currentTime >= fromMinutes || currentTime <= toMinutes;
        }
    }
    return false;
}

// Escuchar cambios de batería de forma asíncrona
if ('getBattery' in navigator) {
    navigator.getBattery().then(battery => {
        const updateBatteryStatus = () => {
            const level = battery.level * 100;
            const threshold = autoThemeConfig.batteryThreshold || 20;
            const isLow = level <= threshold;
            localStorage.setItem('blog_last_battery_dark', isLow ? 'true' : 'false');
            if (currentThemeMode === 'auto' && autoThemeConfig.mode === 'battery') {
                applyTheme();
            }
        };
        battery.addEventListener('levelchange', updateBatteryStatus);
        battery.addEventListener('chargingchange', updateBatteryStatus);
        updateBatteryStatus();
    });
}

function updateThemeToggleButton() {
    const icon = document.getElementById('theme-toggle-icon');
    const text = document.getElementById('theme-toggle-text');

    if (!icon) return;

    if (currentThemeMode === 'dark') {
        icon.textContent = 'dark_mode';
        if (text) text.textContent = 'Tema oscuro';
    } else if (currentThemeMode === 'light') {
        icon.textContent = 'light_mode';
        if (text) text.textContent = 'Tema claro';
    } else {
        icon.textContent = 'brightness_auto';
        if (text) text.textContent = 'Tema automático';
    }
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

export function openAutoThemeDialog() {
    const backdrop = document.getElementById('auto-theme-dialog-backdrop');
    const container = document.getElementById('auto-theme-dialog-container');
    if (!backdrop || !container) return;

    // Cargar config actual en la UI
    const config = autoThemeConfig;
    
    // Configurar la opción seleccionada
    document.querySelectorAll('.auto-theme-option').forEach(opt => {
        const mode = opt.dataset.mode;
        const check = opt.querySelector('.auto-theme-check');
        if (check) {
            if (mode === config.mode) {
                check.classList.remove('hidden');
            } else {
                check.classList.add('hidden');
            }
        }
    });

    // Configurar los paneles específicos
    const batteryConfig = document.getElementById('battery-config');
    const scheduleConfig = document.getElementById('schedule-config');
    
    if (batteryConfig) batteryConfig.classList.toggle('hidden', config.mode !== 'battery');
    if (scheduleConfig) scheduleConfig.classList.toggle('hidden', config.mode !== 'schedule');

    const thresholdInput = document.getElementById('battery-threshold');
    const thresholdVal = document.getElementById('battery-threshold-value');
    if (thresholdInput && thresholdVal) {
        thresholdInput.value = config.batteryThreshold || 20;
        thresholdVal.textContent = (config.batteryThreshold || 20) + '%';
    }

    const scheduleFrom = document.getElementById('schedule-from');
    const scheduleTo = document.getElementById('schedule-to');
    if (scheduleFrom && scheduleTo) {
        scheduleFrom.value = config.schedules?.from || '18:00';
        scheduleTo.value = config.schedules?.to || '06:00';
    }

    // Mostrar
    backdrop.classList.remove('hidden');
    backdrop.classList.add('flex');
    setTimeout(() => {
        container.classList.remove('scale-95');
        container.classList.add('scale-100');
    }, 10);
}

export function closeAutoThemeDialog() {
    const backdrop = document.getElementById('auto-theme-dialog-backdrop');
    const container = document.getElementById('auto-theme-dialog-container');
    if (!backdrop || !container) return;

    container.classList.remove('scale-100');
    container.classList.add('scale-95');
    setTimeout(() => {
        backdrop.classList.remove('flex');
        backdrop.classList.add('hidden');
    }, 150);
}

export function saveAutoThemeConfig() {
    // Buscar la opción activa
    let selectedMode = 'device';
    document.querySelectorAll('.auto-theme-option').forEach(opt => {
        const check = opt.querySelector('.auto-theme-check');
        if (check && !check.classList.contains('hidden')) {
            selectedMode = opt.dataset.mode;
        }
    });

    const thresholdInput = document.getElementById('battery-threshold');
    const scheduleFrom = document.getElementById('schedule-from');
    const scheduleTo = document.getElementById('schedule-to');

    const newConfig = {
        mode: selectedMode,
        batteryThreshold: thresholdInput ? parseInt(thresholdInput.value, 10) : 20,
        schedules: {
            from: scheduleFrom ? scheduleFrom.value : '18:00',
            to: scheduleTo ? scheduleTo.value : '06:00'
        }
    };

    setAutoThemeConfig(newConfig);
    setThemeMode('auto');
    closeAutoThemeDialog();
}

export function initializeTheme() {
    applyTheme();
    updateThemeToggleButton();

    // Event listeners
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

    // Escuchar cambio de tema del sistema operativo si estamos en auto y modo device
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (currentThemeMode === 'auto' && autoThemeConfig.mode === 'device') {
            applyTheme();
        }
    });
}

// Exponer a window
window.toggleTheme = toggleTheme;
window.setThemeMode = setThemeMode;
window.getThemeMode = getThemeMode;
window.setAutoThemeConfig = setAutoThemeConfig;
window.getAutoThemeConfig = getAutoThemeConfig;
window.initializeTheme = initializeTheme;
window.openAutoThemeDialog = openAutoThemeDialog;
window.closeAutoThemeDialog = closeAutoThemeDialog;
window.saveAutoThemeConfig = saveAutoThemeConfig;
