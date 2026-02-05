const FALLBACK_ICON = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>';

const FILTER_SHORTCUTS = {
	'/t': '/tabs ',
	'/b': '/bookmarks ',
	'/h': '/history '
};

const FILTER_COMMANDS = ['/tabs ', '/bookmarks ', '/history '];

/**
 * Fuzzy match a query against a string.
 * Returns { score, indices } or null if no match.
 * Higher score = better match.
 */
function fuzzyMatch(query, str) {
	const text = str.toLowerCase();
	query = query.toLowerCase();
	
	let textIdx = 0;
	let queryIdx = 0;
	let score = 0;
	let indices = [];
	let consecutiveBonus = 0;
	let prevMatchIdx = -2;
	
	while (textIdx < text.length && queryIdx < query.length) {
		if (text[textIdx] === query[queryIdx]) {
			indices.push(textIdx);
			
			if (textIdx === prevMatchIdx + 1) {
				consecutiveBonus += 5;
				score += consecutiveBonus;
			} else {
				consecutiveBonus = 0;
			}
			
			if (textIdx === 0 || /[\s\-_/.]/.test(text[textIdx - 1])) {
				score += 10;
			}
			
			score += Math.max(0, 20 - textIdx);
			
			prevMatchIdx = textIdx;
			queryIdx++;
		}
		textIdx++;
	}
	
	if (queryIdx !== query.length) {
		return null;
	}
	
	if (text === query) {
		score += 100;
	}
	
	return { score, indices };
}

/**
 * Score an action against a query, checking title, URL, and combined.
 * Returns { score, titleIndices, urlIndices } or null if no match.
 */
function scoreAction(action, query) {
	const titleMatch = fuzzyMatch(query, action.title);
	const urlMatch = fuzzyMatch(query, action.url);
	
	// Also try matching against combined strings in both orders
	// This allows queries like "ycombinator typing" to match items where
	// "ycombinator" is in the URL and "typing" is in the title (or vice versa)
	const titleFirst = action.title + ' ' + action.url;
	const urlFirst = action.url + ' ' + action.title;
	const titleFirstMatch = fuzzyMatch(query, titleFirst);
	const urlFirstMatch = fuzzyMatch(query, urlFirst);
	
	// Pick the better combined match
	const combinedMatch = (titleFirstMatch && urlFirstMatch)
		? (titleFirstMatch.score >= urlFirstMatch.score ? titleFirstMatch : urlFirstMatch)
		: (titleFirstMatch || urlFirstMatch);
	const combinedIsUrlFirst = combinedMatch === urlFirstMatch;
	
	if (!titleMatch && !urlMatch && !combinedMatch) {
		return null;
	}
	
	const titleScore = titleMatch ? titleMatch.score * 2 : 0;
	const urlScore = urlMatch ? urlMatch.score : 0;
	
	// Split combined indices back into title/url indices
	let combinedTitleIndices = [];
	let combinedUrlIndices = [];
	if (combinedMatch) {
		const firstLen = combinedIsUrlFirst ? action.url.length : action.title.length;
		for (const idx of combinedMatch.indices) {
			if (idx < firstLen) {
				if (combinedIsUrlFirst) {
					combinedUrlIndices.push(idx);
				} else {
					combinedTitleIndices.push(idx);
				}
			} else if (idx > firstLen) {
				// idx > firstLen means it's in the second part (skip the space)
				if (combinedIsUrlFirst) {
					combinedTitleIndices.push(idx - firstLen - 1);
				} else {
					combinedUrlIndices.push(idx - firstLen - 1);
				}
			}
		}
	}
	
	// Use combined match for highlighting only if individual matches failed
	const useCombined = combinedMatch && (!titleMatch && !urlMatch);
	
	return {
		score: titleScore + urlScore + (combinedMatch ? combinedMatch.score : 0),
		titleIndices: useCombined ? combinedTitleIndices : (titleMatch?.indices || []),
		urlIndices: useCombined ? combinedUrlIndices : (urlMatch?.indices || [])
	};
}

function filterActions(actions, searchValue, options = {}) {
	const { fuzzy = true } = options;
	const value = searchValue.toLowerCase();
	
	let typeFilter = null;
	let query = value;
	
	if (value.startsWith('/tabs')) {
		typeFilter = 'tab';
		query = value.replace('/tabs', '').trim();
	} else if (value.startsWith('/bookmarks')) {
		typeFilter = 'bookmark';
		query = value.replace('/bookmarks', '').trim();
	} else if (value.startsWith('/history')) {
		typeFilter = 'history';
		query = value.replace('/history', '').trim();
	}
	
	let filtered = typeFilter 
		? actions.filter(a => a.type === typeFilter)
		: actions;
	
	if (!query) {
		const mapped = filtered.map(a => ({ ...a, titleIndices: [], urlIndices: [] }));
		mapped._hasTypeFilter = !!typeFilter;
		return mapped;
	}
	
	if (fuzzy) {
		const scored = [];
		for (const action of filtered) {
			const result = scoreAction(action, query);
			if (result) {
				scored.push({
					...action,
					_score: result.score,
					titleIndices: result.titleIndices,
					urlIndices: result.urlIndices
				});
			}
		}
		
		scored.sort((a, b) => b._score - a._score);
		scored._hasTypeFilter = !!typeFilter;
		return scored;
	} else {
		const matched = filtered
			.filter(a => 
				a.title.toLowerCase().includes(query) || 
				a.url.toLowerCase().includes(query)
			)
			.map(a => ({ ...a, titleIndices: [], urlIndices: [] }));
		
		matched._hasTypeFilter = !!typeFilter;
		return matched;
	}
}

/**
 * Highlight matched characters in a string.
 */
function highlightMatches(text, indices) {
	if (!indices || indices.length === 0) {
		return document.createTextNode(text);
	}
	
	const fragment = document.createDocumentFragment();
	const indexSet = new Set(indices);
	let i = 0;
	
	while (i < text.length) {
		if (indexSet.has(i)) {
			let end = i;
			while (indexSet.has(end + 1)) {
				end++;
			}
			const mark = document.createElement('mark');
			mark.textContent = text.slice(i, end + 1);
			fragment.appendChild(mark);
			i = end + 1;
		} else {
			let end = i;
			while (end + 1 < text.length && !indexSet.has(end + 1)) {
				end++;
			}
			fragment.appendChild(document.createTextNode(text.slice(i, end + 1)));
			i = end + 1;
		}
	}
	
	return fragment;
}

function createItemElement(item, index, defaultIconUrl, rootElement) {
	const div = document.createElement('div');
	div.className = 'omni-item' + (index === 0 ? ' omni-item-active' : '');
	div.dataset.index = index;
	div.dataset.type = item.type;
	div.dataset.url = item.url;
	div.dataset.tabId = item.tabId || '';
	
	const icon = document.createElement('img');
	icon.className = 'omni-icon';
	icon.src = item.favIconUrl || defaultIconUrl || FALLBACK_ICON;
	icon.onerror = () => { icon.src = FALLBACK_ICON; };
	
	const details = document.createElement('div');
	details.className = 'omni-item-details';
	
	const name = document.createElement('div');
	name.className = 'omni-item-name';
	name.appendChild(highlightMatches(item.title, item.titleIndices));
	
	const desc = document.createElement('div');
	desc.className = 'omni-item-desc';
	desc.appendChild(highlightMatches(item.url, item.urlIndices));
	
	details.appendChild(name);
	details.appendChild(desc);
	
	div.appendChild(icon);
	div.appendChild(details);
	
	if (item.type === 'tab') {
		const badge = document.createElement('span');
		badge.className = 'omni-item-badge';
		badge.textContent = item.active ? 'active' : 'tab';
		div.appendChild(badge);
	}
	
	const select = document.createElement('div');
	select.className = 'omni-select';
	select.innerHTML = 'Select <span class="omni-shortcut">⏎</span>';
	div.appendChild(select);
	
	div.addEventListener('mouseenter', () => {
		rootElement.querySelectorAll('.omni-item-active').forEach(el => {
			el.classList.remove('omni-item-active');
		});
		div.classList.add('omni-item-active');
	});
	
	return div;
}

function handleKeyboardNavigation(e, isOpen, closeCallback, actionCallback, rootElement) {
	if (!isOpen) return false;
	
	const activeItem = rootElement.querySelector('.omni-item-active');
	
	if (e.key === 'Escape') {
		e.preventDefault();
		closeCallback();
		return true;
	}
	
	if (e.key === 'ArrowDown') {
		e.preventDefault();
		if (activeItem) {
			let next = activeItem.nextElementSibling;
			while (next && next.classList.contains('omni-group-header')) {
				next = next.nextElementSibling;
			}
			if (next && next.classList.contains('omni-item')) {
				activeItem.classList.remove('omni-item-active');
				next.classList.add('omni-item-active');
				next.scrollIntoView({ block: 'nearest' });
			}
		}
		return true;
	}
	
	if (e.key === 'ArrowUp') {
		e.preventDefault();
		if (activeItem) {
			let prev = activeItem.previousElementSibling;
			let groupHeader = null;
			
			while (prev && prev.classList.contains('omni-group-header')) {
				groupHeader = prev;
				prev = prev.previousElementSibling;
			}
			
			if (prev && prev.classList.contains('omni-item')) {
				activeItem.classList.remove('omni-item-active');
				prev.classList.add('omni-item-active');
				prev.scrollIntoView({ block: 'nearest' });
				
				let checkPrev = prev.previousElementSibling;
				if (checkPrev && checkPrev.classList.contains('omni-group-header')) {
					checkPrev.scrollIntoView({ block: 'start' });
				}
			}
		}
		return true;
	}
	
	if (e.key === 'Enter') {
		e.preventDefault();
		if (activeItem) {
			actionCallback(activeItem.dataset.index);
		}
		return true;
	}
	
	return false;
}

function updateResultsCount(count, rootElement) {
	const results = rootElement.querySelector('#omni-results');
	if (results) {
		results.textContent = `${count} result${count !== 1 ? 's' : ''}`;
	}
}
