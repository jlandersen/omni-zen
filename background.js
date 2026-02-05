let settings = {
	fetchFavicons: false,
	fuzzySearch: true
};

async function loadSettings() {
	try {
		const stored = await browser.storage.local.get(['settings']);
		if (stored.settings) {
			settings = { ...settings, ...stored.settings };
		}
	} catch (error) {
		console.error('Omni Zen: Failed to load settings', error);
	}
}

async function getAllTabs() {
	return await browser.tabs.query({});
}

function getFaviconUrl(url) {
	if (!settings.fetchFavicons) {
		return null;
	}
	try {
		const hostname = new URL(url).hostname;
		return `https://www.google.com/s2/favicons?domain=${hostname}`;
	} catch {
		return null;
	}
}

async function getAllBookmarks() {
	try {
		const bookmarkTree = await browser.bookmarks.getTree();
		const bookmarks = [];
		
		function traverseBookmarks(nodes) {
			for (const node of nodes) {
				if (node.url) {
					bookmarks.push({
						title: node.title || node.url,
						url: node.url,
						type: "bookmark",
						favIconUrl: getFaviconUrl(node.url)
					});
				}
				if (node.children) {
					traverseBookmarks(node.children);
				}
			}
		}
		
		traverseBookmarks(bookmarkTree);
		return bookmarks;
	} catch (error) {
		console.error('Omni Zen: Failed to get bookmarks', error);
		return [];
	}
}

async function buildActions() {
	const actions = [];
	
	const tabs = await getAllTabs();
	for (const tab of tabs) {
		actions.push({
			title: tab.title,
			url: tab.url,
			type: "tab",
			tabId: tab.id,
			favIconUrl: tab.favIconUrl || getFaviconUrl(tab.url),
			active: tab.active
		});
	}
	
	const bookmarks = await getAllBookmarks();
	actions.push(...bookmarks);
	
	return actions;
}

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
	(async () => {
		switch (message.request) {
			case "get-actions":
				const actions = await buildActions();
				sendResponse({ actions });
				break;
				
			case "switch-tab":
				await browser.tabs.update(message.tabId, { active: true });
				sendResponse({});
				break;
				
			case "close-tab":
				await browser.tabs.remove(message.tabId);
				sendResponse({});
				break;
				
			case "open-bookmark":
				await browser.tabs.create({ url: message.url });
				sendResponse({});
				break;
				
			case "close-omni":
				browser.tabs.sendMessage(sender.tab.id, { request: "close-omni" });
				sendResponse({});
				break;
				
			case "settings-changed":
				settings = { ...settings, ...message.settings };
				await browser.storage.local.set({ settings });
				sendResponse({});
				break;
				
			case "get-settings":
				sendResponse({ settings });
				break;
				
			default:
				sendResponse({});
		}
	})();
	return true;
});

browser.commands.onCommand.addListener((command) => {
	if (command === "open-omni") {
		browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
			browser.tabs.sendMessage(tabs[0].id, { request: "toggle-omni" }).catch(() => {});
		});
	}
});

loadSettings();
