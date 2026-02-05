# Omni Zen

A lightweight Firefox extension for managing tabs and bookmarks with a command palette interface. Spiritual successor to the original [Omni](https://github.com/alyssaxuu/omni) extension, built with pure vanilla JavaScript - no jQuery or other dependencies.

## Features

- 🔍 Search all open tabs
- 📚 Browse and search bookmarks
- ⌨️ Keyboard shortcuts for quick access
- 🌙 Dark/light mode support
- 🎯 Fuzzy search across titles and URLs
- ⚡ Lightweight and fast - no dependencies

## Usage

- Press `Ctrl+Shift+K` (Windows/Linux) or `Cmd+Shift+K` (Mac) to open the command palette
- **Or click the extension icon** in the toolbar to access settings
- Type to search across all tabs and bookmarks
- Use `/tabs` or `/t` to filter only tabs
- Use `/bookmarks` or `/b` to filter only bookmarks
- Use arrow keys (↑/↓) to navigate
- Press `Enter` to select an item
- Press `Escape` to close

**Note:** The keyboard shortcut does not work on Firefox's built-in pages (e.g., `about:newtab`, `about:addons`, standard new tab pages etc.).

## Keyboard Shortcut

The default shortcut is `Ctrl+Shift+K` (Windows/Linux) or `Cmd+Shift+K` (Mac). To change it:

1. Go to `about:addons`
2. Click the gear icon (⚙️)
3. Select "Manage Extension Shortcuts"
4. Find "Omni Zen" and customize the shortcut

## Privacy

By default, Omni Zen does not make any external network requests. Website favicons are not fetched and a generic icon is shown instead.

You can optionally enable favicon fetching in the settings, which will use Google's favicon service to display website icons.

## License

MIT License - Feel free to use and modify

## Credits

Inspired by the original [Omni](https://github.com/alyssaxuu/omni) extension by Alyssa X.
