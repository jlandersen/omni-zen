let isOpen = false;
let isOpening = false;
let actions = [];
let settings = { fuzzySearch: true };
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
	
	list.addEventListener('click', (e) => {
		const item = e.target.closest('.omni-item');
		if (item) {
			handleAction(item.dataset.index);
		}
	});
	
	document.addEventListener('keydown', handleKeyDown);
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
	searchDebounceTimer = setTimeout(() => {
		const filtered = filterActions(actions, value, { fuzzy: settings.fuzzySearch });
		renderItems(filtered);
		updateResultsCount(filtered.length, shadowRoot);
	}, 300);
}

function renderItems(items) {
	const list = shadowRoot.querySelector('#omni-list');
	list.innerHTML = '';
	
	const defaultIcon = browser.runtime.getURL('assets/logo-16.png');
	items.forEach((item, index) => {
		list.appendChild(createItemElement(item, index, defaultIcon, shadowRoot));
	});
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
		actions = actionsResponse?.actions || [];
		settings = { fuzzySearch: true, ...settingsResponse?.settings };
		
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

// Injection is now lazy - only happens when openOmni() is called
