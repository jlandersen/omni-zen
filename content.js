let isOpen = false;
let isOpening = false;
let actions = [];
let baseActions = [];
let settings = { fuzzySearch: true, groupByType: true, searchHistory: false };
let lastInputValue = '';
let injectionPromise = null;
let shadowRoot = null;
let searchDebounceTimer = null;

async function injectOmni() {
	if (shadowRoot) {
		return;
	}
	
	if (injectionPromise) {
		return injectionPromise;
	}
	
	injectionPromise = (async () => {
		try {
			if (!document.body) {
				await new Promise(resolve => {
					if (document.readyState === 'loading') {
						document.addEventListener('DOMContentLoaded', resolve);
					} else {
						resolve();
					}
				});
			}
			
			const [htmlResponse, cssResponse] = await Promise.all([
				fetch(browser.runtime.getURL('/content.html')),
				fetch(browser.runtime.getURL('/content.css'))
			]);
			const [html, css] = await Promise.all([
				htmlResponse.text(),
				cssResponse.text()
			]);
			
			const host = document.createElement('div');
			host.id = 'omni-zen-host';
			shadowRoot = host.attachShadow({ mode: 'closed' });
			
			const style = document.createElement('style');
			style.textContent = css;
			shadowRoot.appendChild(style);
			
			const parser = new DOMParser();
			const doc = parser.parseFromString(html, 'text/html');
			shadowRoot.appendChild(doc.body.firstElementChild);
			
			document.body.appendChild(host);
			
			setupEventListeners();
		} catch (error) {
			console.error('Omni Zen: Failed to inject', error);
		}
	})();
	
	return injectionPromise;
}

function setupEventListeners() {
	const input = shadowRoot.querySelector('#omni-extension input');
	const overlay = shadowRoot.querySelector('#omni-overlay');
	const list = shadowRoot.querySelector('#omni-list');
	
	input.addEventListener('input', handleSearch);
	overlay.addEventListener('click', closeOmni);
	list.addEventListener('scroll', handleListScroll);
	
	list.addEventListener('click', (e) => {
		const item = e.target.closest('.omni-item');
		if (item) {
			handleAction(item.dataset.index);
		}
	});
	
	document.addEventListener('keydown', handleKeyDown);
}

function handleListScroll() {
	const list = shadowRoot.querySelector('#omni-list');
	const stickyHeader = shadowRoot.querySelector('#omni-sticky-header');
	const headers = list.querySelectorAll('.omni-group-header');
	
	if (headers.length === 0) {
		stickyHeader.classList.remove('visible');
		return;
	}
	
	let currentHeader = null;
	const scrollTop = list.scrollTop;
	
	for (const header of headers) {
		if (header.offsetTop <= scrollTop) {
			currentHeader = header;
		} else {
			break;
		}
	}
	
	if (currentHeader && scrollTop > 0) {
		stickyHeader.textContent = currentHeader.textContent;
		stickyHeader.classList.add('visible');
	} else {
		stickyHeader.classList.remove('visible');
	}
}

function handleSearch(e) {
	const value = e.target.value.toLowerCase();
	const isDeleting = value.length < lastInputValue.length;
	
	if (isDeleting) {
		for (const cmd of FILTER_COMMANDS) {
			const cmdWithoutSpace = cmd.trimEnd();
			if (lastInputValue === cmd && value === cmdWithoutSpace) {
				e.target.value = '';
				lastInputValue = '';
				renderItems(actions);
				updateResultsCount(actions.length, shadowRoot);
				return;
			}
		}
	}
	
	if (FILTER_SHORTCUTS[value]) {
		e.target.value = FILTER_SHORTCUTS[value];
		lastInputValue = FILTER_SHORTCUTS[value];
		const filtered = filterActions(actions, FILTER_SHORTCUTS[value], { fuzzy: settings.fuzzySearch });
		renderItems(filtered);
		updateResultsCount(filtered.length, shadowRoot);
		return;
	}
	
	lastInputValue = value;
	
	clearTimeout(searchDebounceTimer);
	searchDebounceTimer = setTimeout(async () => {
		let query = value;
		if (value.startsWith('/history')) {
			query = value.replace('/history', '').trim();
		}
		
		if (settings.searchHistory && query) {
			const response = await browser.runtime.sendMessage({ request: 'search-history', query });
			const historyResults = response?.history || [];
			actions = [...baseActions, ...historyResults];
		} else {
			actions = baseActions;
		}
		
		const filtered = filterActions(actions, value, { fuzzy: settings.fuzzySearch });
		renderItems(filtered);
		updateResultsCount(filtered.length, shadowRoot);
	}, 300);
}

function renderItems(items) {
	const list = shadowRoot.querySelector('#omni-list');
	const stickyHeader = shadowRoot.querySelector('#omni-sticky-header');
	list.innerHTML = '';
	stickyHeader.classList.remove('visible');
	
	const defaultIcon = browser.runtime.getURL('assets/logo-16.png');
	
	const shouldGroup = settings.groupByType && !items._hasTypeFilter && items.length > 0;
	
	if (shouldGroup) {
		const tabs = items.filter(item => item.type === 'tab');
		const bookmarks = items.filter(item => item.type === 'bookmark');
		const history = items.filter(item => item.type === 'history');
		
		let globalIndex = 0;
		
		if (tabs.length > 0) {
			const tabHeader = document.createElement('div');
			tabHeader.className = 'omni-group-header';
			tabHeader.textContent = 'Tabs';
			list.appendChild(tabHeader);
			
			tabs.forEach((item) => {
				list.appendChild(createItemElement(item, globalIndex, defaultIcon, shadowRoot));
				globalIndex++;
			});
		}
		
		if (bookmarks.length > 0) {
			const bookmarkHeader = document.createElement('div');
			bookmarkHeader.className = 'omni-group-header';
			bookmarkHeader.textContent = 'Bookmarks';
			list.appendChild(bookmarkHeader);
			
			bookmarks.forEach((item) => {
				list.appendChild(createItemElement(item, globalIndex, defaultIcon, shadowRoot));
				globalIndex++;
			});
		}
		
		if (history.length > 0) {
			const historyHeader = document.createElement('div');
			historyHeader.className = 'omni-group-header';
			historyHeader.textContent = 'History';
			list.appendChild(historyHeader);
			
			history.forEach((item) => {
				list.appendChild(createItemElement(item, globalIndex, defaultIcon, shadowRoot));
				globalIndex++;
			});
		}
	} else {
		items.forEach((item, index) => {
			list.appendChild(createItemElement(item, index, defaultIcon, shadowRoot));
		});
	}
}

async function openOmni() {
	if (isOpening) {
		return;
	}
	isOpening = true;
	
	try {
		await injectOmni();
		
		const extension = shadowRoot.querySelector('#omni-extension');
		const input = shadowRoot.querySelector('#omni-extension input');
		
		if (!extension || !input) {
			return;
		}
		
		const [actionsResponse, settingsResponse] = await Promise.all([
			browser.runtime.sendMessage({ request: 'get-actions' }),
			browser.runtime.sendMessage({ request: 'get-settings' })
		]);
		baseActions = actionsResponse?.actions || [];
		actions = baseActions;
		settings = { fuzzySearch: true, groupByType: true, searchHistory: false, ...settingsResponse?.settings };
		
		input.value = '';
		lastInputValue = '';
		extension.classList.remove('omni-closing');
		renderItems(actions.map(a => ({ ...a, titleIndices: [], urlIndices: [] })));
		updateResultsCount(actions.length, shadowRoot);
		
		isOpen = true;
		
		input.focus();
		requestAnimationFrame(() => {
			input.focus();
		});
	} catch (error) {
		console.error('Omni Zen: Failed to get actions', error);
	} finally {
		isOpening = false;
	}
}

function closeOmni() {
	isOpen = false;
	const extension = shadowRoot?.querySelector('#omni-extension');
	if (extension) {
		extension.classList.add('omni-closing');
	}
}

function handleKeyDown(e) {
	handleKeyboardNavigation(e, isOpen, closeOmni, handleAction, shadowRoot);
}

async function handleAction(index) {
	const items = shadowRoot.querySelectorAll('#omni-list .omni-item');
	const item = items[index];
	
	if (!item) return;
	
	const type = item.dataset.type;
	const url = item.dataset.url;
	const tabId = parseInt(item.dataset.tabId, 10);
	
	closeOmni();
	
	try {
		if (type === 'tab') {
			await browser.runtime.sendMessage({ request: 'switch-tab', tabId });
		} else if (type === 'bookmark') {
			await browser.runtime.sendMessage({ request: 'open-bookmark', url });
		} else if (type === 'history') {
			await browser.runtime.sendMessage({ request: 'open-history', url });
		}
	} catch (error) {
		console.error('Omni Zen: Action failed', error);
	}
}

browser.runtime.onMessage.addListener((message) => {
	if (message.request === 'toggle-omni') {
		if (isOpen) {
			closeOmni();
		} else if (!isOpening) {
			openOmni();
		}
	} else if (message.request === 'close-omni') {
		closeOmni();
	}
});
