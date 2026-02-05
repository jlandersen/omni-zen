let isOpen = false;
let actions = [];
let lastInputValue = '';

async function injectOmni() {
	if (document.querySelector('#omni-extension')) {
		return;
	}
	
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
		
		const response = await fetch(browser.runtime.getURL('/content.html'));
		const html = await response.text();
		const temp = document.createElement('div');
		temp.innerHTML = html;
		document.body.appendChild(temp.firstElementChild);
		
		setupEventListeners();
	} catch (error) {
		console.error('Omni Zen: Failed to inject', error);
	}
}

function setupEventListeners() {
	const input = document.querySelector('#omni-extension input');
	const overlay = document.querySelector('#omni-overlay');
	const list = document.querySelector('#omni-list');
	
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
				updateResultsCount(actions.length);
				return;
			}
		}
	}
	
	if (FILTER_SHORTCUTS[value]) {
		e.target.value = FILTER_SHORTCUTS[value];
		lastInputValue = FILTER_SHORTCUTS[value];
		const filtered = filterActions(actions, FILTER_SHORTCUTS[value]);
		renderItems(filtered);
		updateResultsCount(filtered.length);
		return;
	}
	
	lastInputValue = value;
	const filtered = filterActions(actions, value);
	renderItems(filtered);
	updateResultsCount(filtered.length);
}

function renderItems(items) {
	const list = document.querySelector('#omni-list');
	list.innerHTML = '';
	
	const defaultIcon = browser.runtime.getURL('assets/logo-16.png');
	items.forEach((item, index) => {
		list.appendChild(createItemElement(item, index, defaultIcon));
	});
}

async function openOmni() {
	isOpen = true;
	const extension = document.querySelector('#omni-extension');
	const input = document.querySelector('#omni-extension input');
	
	if (!extension || !input) {
		return;
	}
	
	try {
		const response = await browser.runtime.sendMessage({ request: 'get-actions' });
		actions = response?.actions || [];
		
		input.value = '';
		lastInputValue = '';
		extension.classList.remove('omni-closing');
		renderItems(actions);
		updateResultsCount(actions.length);
		
		input.focus();
		requestAnimationFrame(() => {
			input.focus();
		});
	} catch (error) {
		console.error('Omni Zen: Failed to get actions', error);
	}
}

function closeOmni() {
	isOpen = false;
	const extension = document.querySelector('#omni-extension');
	if (extension) {
		extension.classList.add('omni-closing');
	}
}

function handleKeyDown(e) {
	handleKeyboardNavigation(e, isOpen, closeOmni, handleAction);
}

async function handleAction(index) {
	const items = document.querySelectorAll('#omni-list .omni-item');
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
		} else {
			openOmni();
		}
	} else if (message.request === 'close-omni') {
		closeOmni();
	}
});

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', injectOmni);
} else {
	injectOmni();
}
