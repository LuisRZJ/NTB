import { state, getLabelsList, colorPalette } from './state.js';

export function updateMetricsView() {
    const periodSelect = document.getElementById('metrics-period-select');
    const period = periodSelect ? periodSelect.value : '30';

    if (state.metricsOffsetPeriods === undefined) {
        state.metricsOffsetPeriods = 0;
    }

    const prevBtn = document.getElementById('metrics-prev-btn');
    const nextBtn = document.getElementById('metrics-next-btn');
    const periodRangeEl = document.getElementById('metrics-period-range');
    const comparisonEl = document.getElementById('metrics-period-comparison');

    let filteredNotes = state.notes;
    let rangeText = '';
    let limitMs = 0;
    let startTime = 0;
    let endTime = 0;

    if (period === 'custom') {
        const customValEl = document.getElementById('metrics-custom-value');
        const customUnitEl = document.getElementById('metrics-custom-unit');
        const val = customValEl ? Math.max(1, parseInt(customValEl.value) || 1) : 5;
        const unit = customUnitEl ? customUnitEl.value : 'weeks';
        
        let days = val;
        if (unit === 'weeks') days = val * 7;
        else if (unit === 'months') days = val * 30;
        else if (unit === 'years') days = val * 365;

        limitMs = days * 24 * 60 * 60 * 1000;
    } else if (period !== 'all') {
        const days = parseInt(period);
        limitMs = days * 24 * 60 * 60 * 1000;
    }

    if (period !== 'all') {
        const offset = state.metricsOffsetPeriods;

        // Rango de fechas: de endTime (límite superior) a startTime (límite inferior)
        const now = Date.now();
        endTime = now - (offset * limitMs);
        startTime = endTime - limitMs;

        filteredNotes = state.notes.filter(note => {
            const t = note.createdAt || 0;
            return t >= startTime && t <= endTime;
        });

        // Formatear el rango de fechas para mostrar
        const formatOptions = { day: 'numeric', month: 'short', year: 'numeric' };
        const startStr = new Date(startTime).toLocaleDateString('es-ES', formatOptions);
        const endStr = new Date(endTime).toLocaleDateString('es-ES', formatOptions);
        rangeText = `${startStr} - ${endStr}`;

        // Configurar botones de navegación
        if (prevBtn) prevBtn.disabled = false;
        if (nextBtn) nextBtn.disabled = (offset === 0);

        // Comparación con el período anterior (excluyendo papelera)
        if (comparisonEl) {
            const activeNotes = state.notes.filter(n => !n.isTrash);
            const currentCount = filteredNotes.filter(n => !n.isTrash).length;
            
            const prevPeriodNotes = activeNotes.filter(note => {
                const t = note.createdAt || 0;
                return t >= (startTime - limitMs) && t < startTime;
            });
            const prevCount = prevPeriodNotes.length;

            let diff = currentCount - prevCount;
            let pctStr = '';
            if (prevCount > 0) {
                const pct = ((diff / prevCount) * 100).toFixed(1);
                pctStr = ` (${diff >= 0 ? '+' : ''}${pct}%)`;
            }

            if (diff > 0) {
                comparisonEl.className = 'text-[10px] font-bold text-emerald-600 dark:text-emerald-400 select-none mt-0.5 flex items-center gap-0.5 justify-end';
                comparisonEl.innerHTML = `<span class="material-symbols-outlined text-[13px]">trending_up</span> +${diff} ${diff === 1 ? 'nota' : 'notas'} vs periodo anterior${pctStr}`;
            } else if (diff < 0) {
                comparisonEl.className = 'text-[10px] font-bold text-red-500 dark:text-red-400 select-none mt-0.5 flex items-center gap-0.5 justify-end';
                comparisonEl.innerHTML = `<span class="material-symbols-outlined text-[13px]">trending_down</span> ${diff} ${diff === -1 ? 'nota' : 'notas'} vs periodo anterior${pctStr}`;
            } else {
                comparisonEl.className = 'text-[10px] font-bold text-slate-400 dark:text-slate-500 select-none mt-0.5 flex items-center gap-0.5 justify-end';
                comparisonEl.innerHTML = `<span class="material-symbols-outlined text-[13px]">trending_flat</span> Igual que el periodo anterior (0 de dif.)`;
            }
        }
    } else {
        rangeText = 'Todo el historial';
        // En "Todo el historial", la navegación se deshabilita
        if (prevBtn) prevBtn.disabled = true;
        if (nextBtn) nextBtn.disabled = true;
        if (comparisonEl) {
            comparisonEl.innerHTML = '';
        }
    }

    if (periodRangeEl) {
        periodRangeEl.textContent = rangeText;
    }

    // Renderizar tarjetas generales de KPI (Antigüedad y Racha)
    renderGlobalKPIs(filteredNotes, limitMs);

    // Renderizar recuerdos y acontecimientos (Nota del día y Un día como hoy)
    renderRecuerdos(filteredNotes);

    const chartsContainer = document.getElementById('metrics-charts-container');
    const emptyMessage = document.getElementById('metrics-empty-message');

    if (filteredNotes.length === 0) {
        // Estado vacío: ocultar gráficos y mostrar mensaje
        if (chartsContainer) chartsContainer.classList.add('hidden');
        if (emptyMessage) emptyMessage.classList.remove('hidden');
    } else {
        // Mostrar gráficos y ocultar mensaje
        if (chartsContainer) chartsContainer.classList.remove('hidden');
        if (emptyMessage) emptyMessage.classList.add('hidden');

        // Renderizar métricas individuales
        renderStateMetrics(filteredNotes);
        renderLabelMetrics(filteredNotes);
        renderColorMetrics(filteredNotes);
        renderContentMetrics(filteredNotes);
    }

    // El mapa de calor siempre se renderiza y siempre se muestra
    renderActivityHeatmap();
}

export function navigateMetricsPeriod(direction) {
    if (state.metricsOffsetPeriods === undefined) {
        state.metricsOffsetPeriods = 0;
    }
    
    if (direction === -1) {
        // Retroceder en el tiempo (ir al pasado => aumentar offset)
        state.metricsOffsetPeriods++;
    } else if (direction === 1) {
        // Avanzar en el tiempo (ir al presente => reducir offset)
        state.metricsOffsetPeriods = Math.max(0, state.metricsOffsetPeriods - 1);
    }
    
    updateMetricsView();
}

export function resetMetricsOffsetAndUpdate() {
    state.metricsOffsetPeriods = 0;
    
    // Mostrar u ocultar el contenedor personalizado
    const periodSelect = document.getElementById('metrics-period-select');
    const customContainer = document.getElementById('metrics-custom-container');
    if (periodSelect && customContainer) {
        if (periodSelect.value === 'custom') {
            customContainer.classList.remove('hidden');
        } else {
            customContainer.classList.add('hidden');
        }
    }
    
    updateMetricsView();
}

function renderGlobalKPIs(filteredNotes, limitMs) {
    const firstNoteDateEl = document.getElementById('metrics-first-note-date');
    const timeElapsedEl = document.getElementById('metrics-time-elapsed');
    const streakCountEl = document.getElementById('metrics-streak-count');
    const streakHistoryEl = document.getElementById('metrics-streak-history');
    const totalUsageTimeEl = document.getElementById('metrics-total-usage-time');
    const avgSessionTimeEl = document.getElementById('metrics-avg-session-time');
    const periodAverageEl = document.getElementById('metrics-period-average');
    const activeTimeRangeEl = document.getElementById('metrics-active-time-range');

    // Filtrar notas válidas (excluyendo papelera)
    const activeNotes = state.notes.filter(n => !n.isTrash);

    if (activeNotes.length === 0) {
        if (firstNoteDateEl) firstNoteDateEl.textContent = 'Sin notas';
        if (timeElapsedEl) timeElapsedEl.textContent = 'Comienza a escribir notas.';
        if (streakCountEl) streakCountEl.textContent = '0 semanas';
        if (streakHistoryEl) streakHistoryEl.innerHTML = '<p class="text-slate-400 text-[10px]">No hay rachas previas.</p>';
        if (totalUsageTimeEl) totalUsageTimeEl.textContent = '0 s';
        if (avgSessionTimeEl) avgSessionTimeEl.textContent = 'Sesión: 0 s';
        if (periodAverageEl) periodAverageEl.textContent = '0 notas / día';
        if (activeTimeRangeEl) activeTimeRangeEl.textContent = 'Pico: Sin actividad';
        return;
    }

    // --- 1. Calcular antigüedad ---
    const timestamps = activeNotes.map(n => n.createdAt || 0).filter(t => t > 0);
    const minTimestamp = Math.min(...timestamps);
    const firstDate = new Date(minTimestamp);
    const dateStr = firstDate.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
    
    const diffMs = Date.now() - minTimestamp;
    const diffDays = Math.max(1, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
    let elapsedStr = '';
    if (diffDays === 0) {
        elapsedStr = 'Creada hoy';
    } else if (diffDays === 1) {
        elapsedStr = 'Hace 1 día';
    } else {
        elapsedStr = `Hace ${diffDays} días`;
    }

    if (firstNoteDateEl) firstNoteDateEl.textContent = `Creada el ${dateStr}`;
    if (timeElapsedEl) timeElapsedEl.textContent = elapsedStr;

    // --- 2. Calcular racha semanal ---
    const getStartOfWeek = (timestamp) => {
        const d = new Date(timestamp);
        const day = d.getDay();
        const diff = d.getDate() - day;
        const sunday = new Date(d.setDate(diff));
        sunday.setHours(0, 0, 0, 0);
        return sunday.getTime();
    };

    const weeksSet = new Set();
    timestamps.forEach(t => {
        weeksSet.add(getStartOfWeek(t));
    });

    const sortedWeeks = Array.from(weeksSet).sort((a, b) => a - b);
    const currentWeekStart = getStartOfWeek(Date.now());

    let streaks = [];
    let currentBlock = [];

    for (let i = 0; i < sortedWeeks.length; i++) {
        const week = sortedWeeks[i];
        if (currentBlock.length === 0) {
            currentBlock.push(week);
        } else {
            const lastWeek = currentBlock[currentBlock.length - 1];
            const diffDays = Math.round((week - lastWeek) / (24 * 60 * 60 * 1000));
            if (diffDays === 7) {
                currentBlock.push(week);
            } else {
                streaks.push(currentBlock);
                currentBlock = [week];
            }
        }
    }
    if (currentBlock.length > 0) {
        streaks.push(currentBlock);
    }

    let activeStreakLength = 0;
    let activeStreakWeeks = [];
    
    if (streaks.length > 0) {
        const lastStreak = streaks[streaks.length - 1];
        const lastWeekInStreak = lastStreak[lastStreak.length - 1];
        const diffToCurrent = Math.round((currentWeekStart - lastWeekInStreak) / (24 * 60 * 60 * 1000));
        
        if (diffToCurrent === 0 || diffToCurrent === 7) {
            activeStreakLength = lastStreak.length;
            activeStreakWeeks = lastStreak;
        }
    }

    if (streakCountEl) {
        streakCountEl.textContent = activeStreakLength === 1 
            ? '1 semana' 
            : `${activeStreakLength} semanas`;
    }

    const previousStreaks = streaks.filter(strk => strk !== activeStreakWeeks);

    if (streakHistoryEl) {
        streakHistoryEl.innerHTML = '';
        if (previousStreaks.length === 0) {
            streakHistoryEl.innerHTML = '<p class="text-slate-400 text-[10px] py-1">No hay rachas previas registradas.</p>';
        } else {
            previousStreaks.reverse().forEach(strk => {
                const len = strk.length;
                const start = new Date(strk[0]);
                const end = new Date(strk[strk.length - 1]);
                const formatOptions = { day: 'numeric', month: 'short' };
                const rangeStr = `${start.toLocaleDateString('es-ES', formatOptions)} - ${end.toLocaleDateString('es-ES', formatOptions)}`;
                
                const row = document.createElement('div');
                row.className = 'flex items-center justify-between border-b border-slate-100 dark:border-slate-800/40 py-1 text-[11px]';
                row.innerHTML = `
                    <span class="font-semibold text-slate-600 dark:text-slate-400">Racha de ${len} ${len === 1 ? 'semana' : 'semanas'}</span>
                    <span class="font-mono text-slate-400 dark:text-slate-500 text-[10px]">${rangeStr}</span>
                `;
                streakHistoryEl.appendChild(row);
            });
        }
    }

    // --- 3. Calcular tiempos de uso ---
    if (totalUsageTimeEl && avgSessionTimeEl) {
        const totalSec = parseInt(localStorage.getItem('metrics_total_time')) || 0;
        const sessionCount = parseInt(localStorage.getItem('metrics_sessions_count')) || 1;

        let totalText = '';
        if (totalSec >= 3600) {
            const h = Math.floor(totalSec / 3600);
            const m = Math.floor((totalSec % 3600) / 60);
            totalText = `${h} h ${m} min`;
        } else if (totalSec >= 60) {
            const m = Math.floor(totalSec / 60);
            const s = totalSec % 60;
            totalText = `${m} min ${s} s`;
        } else {
            totalText = `${totalSec} s`;
        }

        const avgSec = Math.round(totalSec / sessionCount);
        let avgText = '';
        if (avgSec >= 3600) {
            const h = Math.floor(avgSec / 3600);
            const m = Math.floor((avgSec % 3600) / 60);
            avgText = `${h}h ${m}m`;
        } else if (avgSec >= 60) {
            const m = Math.floor(avgSec / 60);
            const s = avgSec % 60;
            avgText = `${m} min ${s} s`;
        } else {
            avgText = `${avgSec} s`;
        }

        totalUsageTimeEl.textContent = totalText;
        avgSessionTimeEl.textContent = `Sesión: ${avgText} (${sessionCount} ${sessionCount === 1 ? 'visita' : 'visitas'})`;
    }

    // --- 4. Calcular productividad del período ---
    if (periodAverageEl && activeTimeRangeEl) {
        const periodNotesCount = filteredNotes.filter(n => !n.isTrash).length;
        
        let days = 1;
        if (limitMs > 0) {
            days = limitMs / (24 * 60 * 60 * 1000);
        } else {
            days = diffDays;
        }

        const avg = (periodNotesCount / days).toFixed(2);
        periodAverageEl.textContent = `${avg} notas / día`;

        // Franja horaria más activa (local)
        const franjas = {
            'Madrugada (00:00 - 06:00)': 0,
            'Mañana (06:00 - 12:00)': 0,
            'Tarde (12:00 - 18:00)': 0,
            'Noche (18:00 - 00:00)': 0
        };

        filteredNotes.forEach(note => {
            if (!note.createdAt) return;
            const hr = new Date(note.createdAt).getHours();
            if (hr >= 0 && hr < 6) franjas['Madrugada (00:00 - 06:00)']++;
            else if (hr >= 6 && hr < 12) franjas['Mañana (06:00 - 12:00)']++;
            else if (hr >= 12 && hr < 18) franjas['Tarde (12:00 - 18:00)']++;
            else franjas['Noche (18:00 - 00:00)']++;
        });

        let maxFranja = 'Ninguna';
        let maxCount = -1;
        Object.keys(franjas).forEach(f => {
            if (franjas[f] > maxCount && franjas[f] > 0) {
                maxCount = franjas[f];
                maxFranja = f;
            }
        });

        if (maxCount <= 0) {
            activeTimeRangeEl.textContent = 'Pico: Sin actividad';
        } else {
            activeTimeRangeEl.textContent = `Pico: ${maxFranja}`;
        }
    }
}

export function toggleStreakHistory() {
    const historyEl = document.getElementById('metrics-streak-history');
    const arrowIcon = document.getElementById('streak-arrow-icon');
    if (historyEl && arrowIcon) {
        const isHidden = historyEl.classList.contains('hidden');
        if (isHidden) {
            historyEl.classList.remove('hidden');
            arrowIcon.style.transform = 'rotate(180deg)';
        } else {
            historyEl.classList.add('hidden');
            arrowIcon.style.transform = 'rotate(0deg)';
        }
    }
}

function renderStateMetrics(notes) {
    const container = document.getElementById('metrics-state-container');
    if (!container) return;

    const total = notes.length;
    const states = {
        pinned: { label: 'Destacadas', icon: 'keep', count: notes.filter(n => n.isPinned && !n.isTrash).length, color: 'text-amber-500', barBg: 'bg-amber-500' },
        archived: { label: 'Archivadas', icon: 'archive', count: notes.filter(n => n.isArchived && !n.isTrash).length, color: 'text-google-blue dark:text-google-blueDark', barBg: 'bg-google-blue dark:bg-google-blueDark' },
        trash: { label: 'Papelera', icon: 'delete', count: notes.filter(n => n.isTrash).length, color: 'text-red-500', barBg: 'bg-red-500' },
        active: { label: 'Activas (Notas simples)', icon: 'description', count: notes.filter(n => !n.isArchived && !n.isTrash && !n.isPinned).length, color: 'text-emerald-500', barBg: 'bg-emerald-500' }
    };

    container.innerHTML = '';

    Object.keys(states).forEach(key => {
        const item = states[key];
        const pct = total > 0 ? ((item.count / total) * 100).toFixed(1) : 0;

        const row = document.createElement('div');
        row.className = 'space-y-1.5';
        row.innerHTML = `
            <div class="flex items-center justify-between text-xs font-semibold">
                <div class="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                    <span class="material-symbols-outlined text-base ${item.color}">${item.icon}</span>
                    <span>${item.label}</span>
                </div>
                <span class="text-slate-500 dark:text-slate-400 font-mono">${item.count} (${pct}%)</span>
            </div>
            <div class="w-full bg-slate-200/50 dark:bg-slate-800/40 h-2 rounded-full overflow-hidden">
                <div class="h-full ${item.barBg} rounded-full transition-all duration-500" style="width: ${pct}%"></div>
            </div>
        `;
        container.appendChild(row);
    });
}

function renderLabelMetrics(notes) {
    const container = document.getElementById('metrics-label-container');
    if (!container) return;

    container.innerHTML = '';

    const labels = getLabelsList();
    const total = notes.length;

    if (labels.length === 0) {
        container.innerHTML = '<p class="text-xs text-slate-400 text-center py-4">No hay etiquetas creadas.</p>';
        return;
    }

    // Contar notas por etiqueta (excluyendo papelera)
    const counts = {};
    labels.forEach(lbl => {
        counts[lbl.name] = notes.filter(n => Array.isArray(n.tags) && n.tags.includes(lbl.name) && !n.isTrash).length;
    });

    // Agregar categoría "Sin Etiqueta"
    counts["Sin Etiqueta"] = notes.filter(n => !(n.tags?.length) && !n.isTrash).length;

    const sortedLabels = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);

    sortedLabels.forEach(lbl => {
        const count = counts[lbl];
        const pct = total > 0 ? ((count / total) * 100).toFixed(1) : 0;
        const isUnlabeled = lbl === "Sin Etiqueta";
        
        const labelObj = labels.find(l => l.name === lbl);
        const color = labelObj ? labelObj.color : null;
        const barStyle = color ? `background-color: ${color};` : '';
        const iconStyle = color ? `style="color: ${color}"` : '';

        const row = document.createElement('div');
        row.className = 'space-y-1.5';
        row.innerHTML = `
            <div class="flex items-center justify-between text-xs font-semibold">
                <div class="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                    <span class="material-symbols-outlined text-base text-slate-400" ${iconStyle}>${isUnlabeled ? 'label_off' : 'label'}</span>
                    <span class="truncate max-w-[120px]">${lbl}</span>
                </div>
                <span class="text-slate-500 dark:text-slate-400 font-mono">${count} (${pct}%)</span>
            </div>
            <div class="w-full bg-slate-200/50 dark:bg-slate-800/40 h-2 rounded-full overflow-hidden">
                <div class="h-full bg-indigo-500 dark:bg-indigo-400 rounded-full transition-all duration-500" style="width: ${pct}%; ${barStyle}"></div>
            </div>
        `;
        container.appendChild(row);
    });
}

function renderColorMetrics(notes) {
    const container = document.getElementById('metrics-color-container');
    if (!container) return;

    container.innerHTML = '';
    const total = notes.length;

    // Colores disponibles en la app
    const counts = {};
    Object.keys(colorPalette).forEach(col => {
        counts[col] = notes.filter(n => n.color === col).length;
    });

    const sortedColors = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);

    sortedColors.forEach(col => {
        const count = counts[col];
        if (count === 0) return; // No mostrar colores no utilizados

        const pct = total > 0 ? ((count / total) * 100).toFixed(1) : 0;
        const meta = colorPalette[col] || colorPalette.default;
        
        // Estilo de barra de color
        const dotBg = col === 'default' ? 'bg-slate-300 dark:bg-slate-700' : meta.bgLight;

        const row = document.createElement('div');
        row.className = 'space-y-1.5';
        row.innerHTML = `
            <div class="flex items-center justify-between text-xs font-semibold">
                <div class="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                    <span class="w-3.5 h-3.5 rounded-full border border-slate-300 dark:border-slate-700 ${dotBg} shrink-0"></span>
                    <span class="capitalize">${col === 'default' ? 'Predeterminado (Blanco)' : col}</span>
                </div>
                <span class="text-slate-500 dark:text-slate-400 font-mono">${count} (${pct}%)</span>
            </div>
            <div class="w-full bg-slate-200/50 dark:bg-slate-800/40 h-2 rounded-full overflow-hidden">
                <div class="h-full bg-slate-500 rounded-full transition-all duration-500" style="width: ${pct}%"></div>
            </div>
        `;
        container.appendChild(row);
    });
}

function renderContentMetrics(notes) {
    const container = document.getElementById('metrics-word-container');
    if (!container) return;

    container.innerHTML = '';

    const activeNotes = notes.filter(n => !n.isTrash);
    if (activeNotes.length === 0) {
        container.innerHTML = '<p class="text-xs text-slate-400 text-center py-4">No hay datos de contenido suficientes.</p>';
        return;
    }

    let totalWords = 0;
    let totalChars = 0;
    let longestNote = null;
    let shortestNote = null;
    let maxWords = -1;
    let minWords = Infinity;

    activeNotes.forEach(note => {
        const text = (note.title || '') + ' ' + (note.content || '');
        const words = text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
        const chars = text.length;

        totalWords += words;
        totalChars += chars;

        if (words > maxWords) {
            maxWords = words;
            longestNote = note;
        }
        if (words < minWords) {
            minWords = words;
            shortestNote = note;
        }
    });

    const avgWords = (totalWords / activeNotes.length).toFixed(1);
    const avgChars = (totalChars / activeNotes.length).toFixed(0);

    const stats = [
        { label: 'Palabras totales', val: totalWords, icon: 'text_fields' },
        { label: 'Promedio palabras por nota', val: avgWords, icon: 'analytics' },
        { label: 'Promedio caracteres por nota', val: avgChars, icon: 'pin' },
        { label: 'Nota más extensa', val: maxWords, icon: 'menu_book' }
    ];

    stats.forEach(st => {
        const row = document.createElement('div');
        
        if (st.label === 'Nota más extensa' && longestNote) {
            row.className = 'flex items-center justify-between p-3 bg-white dark:bg-[#202124] hover:bg-slate-100/60 dark:hover:bg-slate-800/40 rounded-xl border border-slate-200/40 dark:border-slate-800/30 text-xs font-semibold cursor-pointer transition-all duration-200 group active:scale-[0.98]';
            row.setAttribute('title', `Haz clic para ver/editar: ${longestNote.title || 'Nota sin título'}`);
            row.onclick = (e) => {
                if (window.openFullEditorForEdit) {
                    window.openFullEditorForEdit(longestNote.id, e);
                }
            };
            
            row.innerHTML = `
                <div class="flex items-center gap-2 text-slate-500 dark:text-slate-400 min-w-0 flex-1">
                    <span class="material-symbols-outlined text-base group-hover:text-google-blue dark:group-hover:text-google-blueDark transition-colors">${st.icon}</span>
                    <span class="truncate">${st.label}</span>
                </div>
                <div class="flex items-center gap-1.5 text-slate-800 dark:text-slate-200 ml-2 shrink-0 min-w-0 max-w-[150px]">
                    <span class="truncate text-google-blue dark:text-google-blueDark hover:underline font-bold max-w-[90px]">${longestNote.title || 'Sin título'}</span>
                    <span class="text-[10px] text-slate-400 dark:text-slate-500 font-mono">(${st.val} pal.)</span>
                    <span class="material-symbols-outlined text-[13px] text-slate-400 group-hover:text-google-blue dark:group-hover:text-google-blueDark transition-colors">open_in_new</span>
                </div>
            `;
        } else {
            row.className = 'flex items-center justify-between p-3 bg-white dark:bg-[#202124] rounded-xl border border-slate-200/40 dark:border-slate-800/30 text-xs font-semibold';
            row.innerHTML = `
                <div class="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                    <span class="material-symbols-outlined text-base">${st.icon}</span>
                    <span>${st.label}</span>
                </div>
                <span class="text-slate-800 dark:text-slate-200">${st.val}</span>
            `;
        }
        
        container.appendChild(row);
    });
}

function renderActivityHeatmap() {
    const grid = document.getElementById('heatmap-grid');
    if (!grid) return;

    grid.innerHTML = '';

    // Mapa de calor: 12 columnas (12 semanas), 7 filas por columna (de domingo a sábado)
    const weeksCount = 12;
    const daysCount = weeksCount * 7;

    // Calcular las fechas
    const now = new Date();
    // Ajustar la fecha al sábado de la semana actual
    const endDate = new Date(now);
    endDate.setDate(now.getDate() + (6 - now.getDay())); // Llevar al sábado de la semana actual
    
    // El día de inicio de las 12 semanas será 83 días antes (84 días en total)
    const startDate = new Date(endDate);
    startDate.setDate(endDate.getDate() - (daysCount - 1)); // Domingo de hace 12 semanas
    
    // Mapear los timestamps de creación de notas a una fecha sin horas
    const creationsByDate = {};
    state.notes.forEach(note => {
        if (!note.createdAt) return;
        const d = new Date(note.createdAt);
        const dateStr = d.toDateString(); // "Mon May 25 2026"
        creationsByDate[dateStr] = (creationsByDate[dateStr] || 0) + 1;
    });

    // Generar columnas de semanas
    for (let w = 0; w < weeksCount; w++) {
        const weekCol = document.createElement('div');
        weekCol.className = 'grid grid-rows-7 gap-1';

        for (let d = 0; d < 7; d++) {
            const dayOffset = (w * 7) + d;
            const currentDayDate = new Date(startDate);
            currentDayDate.setDate(startDate.getDate() + dayOffset);

            const dateString = currentDayDate.toDateString();
            const count = creationsByDate[dateString] || 0;

            const cell = document.createElement('div');
            cell.className = 'w-3.5 h-3.5 rounded transition-colors cursor-pointer hover:ring-2 hover:ring-google-blue dark:hover:ring-[#c2e7ff] focus:ring-2 focus:ring-google-blue dark:focus:ring-[#c2e7ff] focus:outline-none';

            // Asignar colores de intensidad de actividad
            let bgClass = 'bg-slate-200 dark:bg-slate-800';
            if (count === 1) bgClass = 'bg-blue-200 dark:bg-blue-900/40';
            else if (count >= 2 && count <= 3) bgClass = 'bg-blue-400 dark:bg-blue-800/70';
            else if (count >= 4) bgClass = 'bg-blue-600 dark:bg-blue-600';

            cell.className += ` ${bgClass}`;

            // Formatear fecha para el tooltip
            const formattedDate = currentDayDate.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
            const tooltipText = `${count} ${count === 1 ? 'nota creada' : 'notas creadas'} el ${formattedDate}`;
            cell.setAttribute('title', tooltipText);
            cell.setAttribute('tabindex', '0');

            // Detalle interactivo para touch/clic
            cell.onclick = () => {
                const detailEl = document.getElementById('heatmap-cell-detail');
                if (detailEl) {
                    detailEl.textContent = tooltipText;
                }
            };

            weekCol.appendChild(cell);
        }

        grid.appendChild(weekCol);
    }
}

function renderRecuerdos(filteredNotes) {
    const noteOfDayEl = document.getElementById('metrics-note-of-the-day');
    const onThisDayEl = document.getElementById('metrics-on-this-day');

    if (!noteOfDayEl || !onThisDayEl) return;

    // 1. Calcular Nota del Día (filtrada y aleatoria)
    const activePeriodNotes = filteredNotes.filter(n => !n.isTrash);
    if (activePeriodNotes.length === 0) {
        noteOfDayEl.className = 'p-3 bg-white dark:bg-[#202124] rounded-xl border border-slate-200/40 dark:border-slate-800/30 text-xs text-slate-400 dark:text-slate-500 text-center select-none';
        noteOfDayEl.onclick = null;
        noteOfDayEl.innerHTML = 'Sin notas en este período.';
    } else {
        // Seleccionar una nota aleatoria del período activo de forma fija por día
        const todayStr = new Date().toDateString();
        let hash = 0;
        for (let i = 0; i < todayStr.length; i++) {
            hash = todayStr.charCodeAt(i) + ((hash << 5) - hash);
        }
        const randomIndex = Math.abs(hash) % activePeriodNotes.length;
        const note = activePeriodNotes[randomIndex];

        noteOfDayEl.className = 'p-3 bg-white dark:bg-[#202124] hover:bg-slate-100/60 dark:hover:bg-slate-800/40 rounded-xl border border-slate-200/40 dark:border-slate-800/30 text-xs font-semibold cursor-pointer transition-all duration-200 group active:scale-[0.98]';
        noteOfDayEl.setAttribute('title', `Ver nota: ${note.title || 'Sin título'}`);
        noteOfDayEl.onclick = (e) => {
            if (window.openFullEditorForEdit) {
                window.openFullEditorForEdit(note.id, e);
            }
        };

        const dateStr = new Date(note.createdAt || 0).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
        const snippet = note.content ? note.content.slice(0, 80) + (note.content.length > 80 ? '...' : '') : 'Sin contenido adicional.';

        noteOfDayEl.innerHTML = `
            <div class="flex items-center justify-between text-slate-800 dark:text-slate-200 font-bold mb-1 min-w-0">
                <span class="truncate text-google-blue dark:text-google-blueDark hover:underline pr-2 flex-1">${note.title || 'Sin título'}</span>
                <span class="text-[10px] text-slate-400 dark:text-slate-500 font-mono font-normal shrink-0">${dateStr}</span>
            </div>
            <p class="text-slate-500 dark:text-slate-400 font-normal line-clamp-2">${snippet}</p>
        `;
    }

    // 2. Calcular "Un Día como Hoy" (Notas del mismo día en años anteriores)
    const activeAllNotes = state.notes.filter(n => !n.isTrash);
    const today = new Date();
    
    const matchingNotes = activeAllNotes.filter(note => {
        if (!note.createdAt) return false;
        const d = new Date(note.createdAt);
        return d.getDate() === today.getDate() && 
               d.getMonth() === today.getMonth() && 
               d.getFullYear() < today.getFullYear();
    });

    if (matchingNotes.length === 0) {
        onThisDayEl.className = 'p-3 bg-white dark:bg-[#202124] rounded-xl border border-slate-200/40 dark:border-slate-800/30 text-xs text-slate-400 dark:text-slate-500 text-center select-none';
        onThisDayEl.onclick = null;
        onThisDayEl.innerHTML = 'No hay recuerdos registrados en este día.';
    } else {
        const todayStr = today.toDateString();
        let hash = 0;
        for (let i = 0; i < todayStr.length; i++) {
            hash = todayStr.charCodeAt(i) + ((hash << 5) - hash);
        }
        const randomIndex = Math.abs(hash) % matchingNotes.length;
        const note = matchingNotes[randomIndex];

        onThisDayEl.className = 'p-3 bg-white dark:bg-[#202124] hover:bg-slate-100/60 dark:hover:bg-slate-800/40 rounded-xl border border-slate-200/40 dark:border-slate-800/30 text-xs font-semibold cursor-pointer transition-all duration-200 group active:scale-[0.98]';
        onThisDayEl.setAttribute('title', `Ver recuerdo: ${note.title || 'Sin título'}`);
        onThisDayEl.onclick = (e) => {
            if (window.openFullEditorForEdit) {
                window.openFullEditorForEdit(note.id, e);
            }
        };

        const noteYear = new Date(note.createdAt).getFullYear();
        const diffYears = today.getFullYear() - noteYear;
        const yearText = diffYears === 1 ? 'Hace 1 año' : `Hace ${diffYears} años`;
        const snippet = note.content ? note.content.slice(0, 80) + (note.content.length > 80 ? '...' : '') : 'Sin contenido adicional.';

        onThisDayEl.innerHTML = `
            <div class="flex items-center justify-between text-slate-800 dark:text-slate-200 font-bold mb-1 min-w-0">
                <span class="truncate text-google-blue dark:text-google-blueDark hover:underline pr-2 flex-1">${note.title || 'Sin título'}</span>
                <span class="text-[10px] text-amber-500 font-mono font-bold shrink-0">${yearText} (${noteYear})</span>
            </div>
            <p class="text-slate-500 dark:text-slate-400 font-normal line-clamp-2">${snippet}</p>
        `;
    }
}

// Exponer globalmente
window.updateMetricsView = updateMetricsView;
window.navigateMetricsPeriod = navigateMetricsPeriod;
window.resetMetricsOffsetAndUpdate = resetMetricsOffsetAndUpdate;
window.toggleStreakHistory = toggleStreakHistory;
