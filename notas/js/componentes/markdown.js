const markdownCache = new Map();

export function clearMarkdownCache() {
    markdownCache.clear();
}

export function renderMarkdown(text) {
    if (!text) return '';
    if (markdownCache.has(text)) {
        return markdownCache.get(text);
    }
    let html = escapeHtml(text);
    html = parseHorizontalRules(html);
    html = parseBold(html);
    html = parseItalic(html);
    html = parseStrikethrough(html);
    html = parseInlineCode(html);
    html = parseHeaders(html);
    html = parseLinks(html);
    html = parseLists(html);
    html = parseBlockquote(html);
    html = parseCodeBlocks(html);
    html = parseLineBreaks(html);
    markdownCache.set(text, html);
    return html;
}

function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function parseHorizontalRules(html) {
    return html.replace(/^(-{3,}|\*{3,}|_{3,})\s*$/gm, '<hr class="my-4 border-0 border-t-2 border-slate-200 dark:border-slate-700">');
}

function parseLineBreaks(html) {
    return html.replace(/\n/g, '<br>');
}

function parseBold(html) {
    return html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

function parseItalic(html) {
    return html.replace(/\*(.+?)\*/g, '<em>$1</em>');
}

function parseStrikethrough(html) {
    return html.replace(/~~(.+?)~~/g, '<del>$1</del>');
}

function parseInlineCode(html) {
    return html.replace(/`(.+?)`/g, '<code class="px-1.5 py-0.5 bg-slate-200 dark:bg-slate-700 rounded text-xs font-mono text-slate-700 dark:text-slate-200">$1</code>');
}

function parseHeaders(html) {
    html = html.replace(/^### (.+)$/gm, '<h4 class="text-xs font-bold text-slate-700 dark:text-slate-200 mt-3 mb-1">$1</h4>');
    html = html.replace(/^## (.+)$/gm, '<h3 class="text-sm font-bold text-slate-700 dark:text-slate-200 mt-3 mb-1">$1</h3>');
    html = html.replace(/^# (.+)$/gm, '<h2 class="text-base font-bold text-slate-800 dark:text-slate-100 mt-3 mb-1">$1</h2>');
    return html;
}

function parseLinks(html) {
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    return html.replace(linkRegex, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-google-blue dark:text-google-blueDark hover:underline">$1</a>');
}

function parseLists(html) {
    let lines = html.split('<br>');
    let inOrderedList = false;
    let inUnorderedList = false;
    let result = [];

    for (let line of lines) {
        const orderedMatch = line.match(/^(\d+)\. (.+)$/);
        const unorderedMatch = line.match(/^[-*] (.+)$/);

        if (orderedMatch) {
            if (!inOrderedList) {
                if (inUnorderedList) {
                    result.push('</ul>');
                    inUnorderedList = false;
                }
                result.push('<ol class="list-decimal list-inside space-y-1 my-2">');
                inOrderedList = true;
            }
            result.push(`<li>${orderedMatch[2]}</li>`);
        } else if (unorderedMatch) {
            if (!inUnorderedList) {
                if (inOrderedList) {
                    result.push('</ol>');
                    inOrderedList = false;
                }
                result.push('<ul class="list-disc list-inside space-y-1 my-2">');
                inUnorderedList = true;
            }
            const taskMatch = unorderedMatch[1].match(/^\[([ xX])\]\s?(.*)/);
            if (taskMatch) {
                const checked = taskMatch[1] !== ' ' ? ' checked disabled' : ' disabled';
                result.push(`<li class="flex items-start gap-2" style="list-style-type: none;"><input type="checkbox" class="rounded text-google-blue border-slate-300 pointer-events-none mt-1 shrink-0" ${checked}><span>${taskMatch[2]}</span></li>`);
            } else {
                result.push(`<li>${unorderedMatch[1]}</li>`);
            }
        } else {
            if (inOrderedList) {
                result.push('</ol>');
                inOrderedList = false;
            }
            if (inUnorderedList) {
                result.push('</ul>');
                inUnorderedList = false;
            }
            result.push(line);
        }
    }

    if (inOrderedList) result.push('</ol>');
    if (inUnorderedList) result.push('</ul>');

    return result.join('<br>');
}

function parseBlockquote(html) {
    return html.replace(/^&gt; (.+)$/gm, '<blockquote class="border-l-4 border-google-blue dark:border-google-blueDark pl-3 my-2 text-slate-600 dark:text-slate-300 italic">$1</blockquote>');
}

function parseCodeBlocks(html) {
    const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
    return html.replace(codeBlockRegex, (match, lang, code) => {
        return `<pre class="bg-slate-800 dark:bg-slate-900 text-slate-100 rounded-lg p-3 my-2 overflow-x-auto"><code class="text-xs font-mono">${code.trim()}</code></pre>`;
    });
}

export function renderMarkdownPreview(text, maxLength = 200) {
    if (!text) return '';
    const html = renderMarkdown(text);
    const plainStrip = html.replace(/<[^>]+>/g, '');
    if (plainStrip.length > maxLength) {
        return plainStrip.substring(0, maxLength) + '...';
    }
    return html;
}