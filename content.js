let isOpen = false;
let isOpening = false;
let actions = [];
let baseActions = [];
let settings = { fuzzySearch: true, groupByType: true, searchHistory: false, siteActions: true };
let lastInputValue = '';
let injectionPromise = null;
let shadowRoot = null;
let searchDebounceTimer = null;

const SITE_ACTIONS = [
	{
		id: 'youtube',
		name: 'YouTube',
		hosts: ['youtube.com', '*.youtube.com'],
		actions: [
			{ title: 'Subscriptions', url: 'https://www.youtube.com/feed/subscriptions' },
			{ title: 'Library', url: 'https://www.youtube.com/feed/library' },
			{ title: 'History', url: 'https://www.youtube.com/feed/history' },
			{ title: 'Watch Later', url: 'https://www.youtube.com/playlist?list=WL' },
			{ title: 'Liked videos', url: 'https://www.youtube.com/playlist?list=LL' },
			{ title: 'Shorts', url: 'https://www.youtube.com/shorts' }
		]
	},
	{
		id: 'github',
		name: 'GitHub',
		hosts: ['github.com', '*.github.com'],
		actions: [
			{ title: 'Notifications', url: 'https://github.com/notifications' },
			{ title: 'Pull requests', url: 'https://github.com/pulls' },
			{ title: 'Issues', url: 'https://github.com/issues' },
			{ title: 'Stars', url: 'https://github.com/stars' },
			{ title: 'Repositories', url: 'https://github.com/?tab=repositories' },
			{ title: 'Trending', url: 'https://github.com/trending' }
		]
	},
	{
		id: 'reddit',
		name: 'Reddit',
		hosts: ['reddit.com', '*.reddit.com', 'old.reddit.com', '*.old.reddit.com'],
		actions: [
			{ title: 'Home', path: '/' },
			{ title: 'Popular', path: '/r/popular/' },
			{ title: 'All', path: '/r/all/' },
			{ title: 'Saved', path: '/user/me/saved/' },
			{ title: 'Messages', path: '/message/inbox/' },
			{ title: 'Submit', path: '/submit/' }
		]
	}
];

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
		const siteActions = items.filter(item => item.type === 'site-action');
		
		let globalIndex = 0;
		
		if (siteActions.length > 0) {
			const grouped = {};
			for (const action of siteActions) {
				const name = action.siteName || 'Site Actions';
				if (!grouped[name]) {
					grouped[name] = [];
				}
				grouped[name].push(action);
			}
			
			for (const [name, actions] of Object.entries(grouped)) {
				const siteHeader = document.createElement('div');
				siteHeader.className = 'omni-group-header';
				siteHeader.textContent = name;
				list.appendChild(siteHeader);
				
				actions.forEach((item) => {
					list.appendChild(createItemElement(item, globalIndex, defaultIcon, shadowRoot));
					globalIndex++;
				});
			}
		}
		
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
		settings = { fuzzySearch: true, groupByType: true, searchHistory: false, siteActions: true, ...settingsResponse?.settings };
		
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
		} else if (type === 'site-action') {
			await browser.runtime.sendMessage({ request: 'open-site-action', url, tabId });
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
	} else if (message.request === 'get-site-actions') {
		return Promise.resolve({ actions: getSiteActions() });
	}
});

function getSiteActions() {
	try {
		const hostname = window.location.hostname || '';
		return buildSiteActionsForHost(hostname);
	} catch {
		return [];
	}
	return [];
}

function buildSiteActionsForHost(hostname) {
	const actions = [];
	for (const site of SITE_ACTIONS) {
		if (!hostMatches(hostname, site.hosts)) {
			continue;
		}
		const baseUrl = site.baseUrl ? site.baseUrl : `https://${hostname}`;
		for (const action of site.actions) {
			actions.push({
				...action,
				url: action.url || new URL(action.path || '', baseUrl).toString(),
				type: 'site-action',
				siteName: site.name
			});
		}
	}
	return actions;
}

function hostMatches(hostname, patterns) {
	if (!hostname) return false;
	for (const pattern of patterns) {
		if (pattern.startsWith('*.')) {
			const suffix = pattern.slice(1);
			if (hostname.endsWith(suffix)) {
				return true;
			}
		} else if (hostname === pattern) {
			return true;
		}
	}
	return false;
}
