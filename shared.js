const FALLBACK_ICON = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>';

const FILTER_SHORTCUTS = {
	'/t': '/tabs ',
	'/b': '/bookmarks '
};

const FILTER_COMMANDS = ['/tabs ', '/bookmarks '];

function filterActions(actions, searchValue) {
	const value = searchValue.toLowerCase();
	
	if (value.startsWith('/tabs')) {
		const query = value.replace('/tabs', '').trim();
		let filtered = actions.filter(a => a.type === 'tab');
		if (query) {
			filtered = filtered.filter(a => 
				a.title.toLowerCase().includes(query) || 
				a.url.toLowerCase().includes(query)
			);
		}
		return filtered;
	}
	
	if (value.startsWith('/bookmarks')) {
		const query = value.replace('/bookmarks', '').trim();
		let filtered = actions.filter(a => a.type === 'bookmark');
		if (query) {
			filtered = filtered.filter(a => 
				a.title.toLowerCase().includes(query) || 
				a.url.toLowerCase().includes(query)
			);
		}
		return filtered;
	}
	
	if (value) {
		return actions.filter(a => 
			a.title.toLowerCase().includes(value) || 
			a.url.toLowerCase().includes(value)
		);
	}
	
	return actions;
}

function createItemElement(item, index, defaultIconUrl) {
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
	name.textContent = item.title;
	
	const desc = document.createElement('div');
	desc.className = 'omni-item-desc';
	desc.textContent = item.url;
	
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
		document.querySelectorAll('.omni-item-active').forEach(el => {
			el.classList.remove('omni-item-active');
		});
		div.classList.add('omni-item-active');
	});
	
	return div;
}

function handleKeyboardNavigation(e, isOpen, closeCallback, actionCallback) {
	if (!isOpen) return false;
	
	const activeItem = document.querySelector('.omni-item-active');
	
	if (e.key === 'Escape') {
		e.preventDefault();
		closeCallback();
		return true;
	}
	
	if (e.key === 'ArrowDown') {
		e.preventDefault();
		if (activeItem && activeItem.nextElementSibling) {
			activeItem.classList.remove('omni-item-active');
			activeItem.nextElementSibling.classList.add('omni-item-active');
			activeItem.nextElementSibling.scrollIntoView({ block: 'nearest' });
		}
		return true;
	}
	
	if (e.key === 'ArrowUp') {
		e.preventDefault();
		if (activeItem && activeItem.previousElementSibling) {
			activeItem.classList.remove('omni-item-active');
			activeItem.previousElementSibling.classList.add('omni-item-active');
			activeItem.previousElementSibling.scrollIntoView({ block: 'nearest' });
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

function updateResultsCount(count) {
	const results = document.querySelector('#omni-results');
	if (results) {
		results.textContent = `${count} result${count !== 1 ? 's' : ''}`;
	}
}
