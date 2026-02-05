let settings = {
	fetchFavicons: false
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
	document.getElementById('fetchFavicons').checked = settings.fetchFavicons;
	document.getElementById('modifierKey').textContent = isMac ? 'Cmd' : 'Ctrl';
}

function showStatus() {
	const statusEl = document.getElementById('statusMessage');
	statusEl.classList.add('show');
	setTimeout(() => {
		statusEl.classList.remove('show');
	}, 2000);
}

document.addEventListener('DOMContentLoaded', () => {
	document.getElementById('fetchFavicons').addEventListener('change', async (e) => {
		settings.fetchFavicons = e.target.checked;
		await saveSettings();
	});

	document.getElementById('openOmni').addEventListener('click', async () => {
		const tabs = await browser.tabs.query({ active: true, currentWindow: true });
		if (tabs[0]) {
			browser.tabs.sendMessage(tabs[0].id, { request: 'toggle-omni' });
			window.close();
		}
	});

	loadSettings();
});
