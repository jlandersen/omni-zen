let settings = {
	fetchFavicons: false,
	fuzzySearch: true,
	groupByType: true,
	searchHistory: false
};

const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;

async function loadSettings() {
	try {
		const stored = await browser.storage.local.get(['settings']);
		if (stored.settings) {
			settings = { ...settings, ...stored.settings };
		}
		updateUI();
	} catch (error) {
		console.error('Omni Zen: Failed to load settings', error);
		updateUI();
	}
}

async function saveSettings() {
	try {
		await browser.storage.local.set({ settings });
		showStatus();
		browser.runtime.sendMessage({ request: 'settings-changed', settings }).catch(() => {});
	} catch (error) {
		console.error('Omni Zen: Failed to save settings', error);
	}
}

function updateUI() {
	const fetchFavicons = document.getElementById('fetchFavicons');
	const fuzzySearch = document.getElementById('fuzzySearch');
	const groupByType = document.getElementById('groupByType');
	const searchHistory = document.getElementById('searchHistory');
	const modifierKey = document.getElementById('modifierKey');
	if (fetchFavicons) fetchFavicons.checked = settings.fetchFavicons;
	if (fuzzySearch) fuzzySearch.checked = settings.fuzzySearch;
	if (groupByType) groupByType.checked = settings.groupByType;
	if (searchHistory) searchHistory.checked = settings.searchHistory;
	if (modifierKey) modifierKey.textContent = isMac ? 'Cmd' : 'Ctrl';
}

function showStatus() {
	const statusEl = document.getElementById('statusMessage');
	if (statusEl) {
		statusEl.classList.add('show');
		setTimeout(() => {
			statusEl.classList.remove('show');
		}, 2000);
	}
}

function initPopup() {
	updateUI();
	
	const fetchFaviconsEl = document.getElementById('fetchFavicons');
	const fuzzySearchEl = document.getElementById('fuzzySearch');
	const groupByTypeEl = document.getElementById('groupByType');
	const searchHistoryEl = document.getElementById('searchHistory');
	const openOmniEl = document.getElementById('openOmni');
	
	if (fetchFaviconsEl) {
		fetchFaviconsEl.addEventListener('change', async (e) => {
			settings.fetchFavicons = e.target.checked;
			await saveSettings();
		});
	}
	
	if (fuzzySearchEl) {
		fuzzySearchEl.addEventListener('change', async (e) => {
			settings.fuzzySearch = e.target.checked;
			await saveSettings();
		});
	}
	
	if (groupByTypeEl) {
		groupByTypeEl.addEventListener('change', async (e) => {
			settings.groupByType = e.target.checked;
			await saveSettings();
		});
	}
	
	if (searchHistoryEl) {
		searchHistoryEl.addEventListener('change', async (e) => {
			settings.searchHistory = e.target.checked;
			await saveSettings();
		});
	}

	if (openOmniEl) {
		openOmniEl.addEventListener('click', async () => {
			try {
				const tabs = await browser.tabs.query({ active: true, currentWindow: true });
				if (tabs[0]) {
					await browser.tabs.sendMessage(tabs[0].id, { request: 'toggle-omni' });
					window.close();
				}
			} catch (error) {
				console.error('Omni Zen: Failed to open command palette', error);
			}
		});
	}

	loadSettings();
}

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', initPopup);
} else {
	initPopup();
}
