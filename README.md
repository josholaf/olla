# Olla - Obsidian Ollama Integration

Olla is an Obsidian plugin that integrates [Ollama](https://ollama.ai/) into your note-taking workflow. It allows you to chat with local AI models directly within Obsidian.

## Features

- **Dockable Chat Panel**: A dedicated panel for chatting with Ollama models
- **Ribbon Toggle**: Quick access via Obsidian's ribbon bar
- **Model Management**: View, download, and switch between available Ollama models
- **Markdown Rendering**: Ollama responses are rendered with full markdown support
- **Persistent History**: Chat history is saved per vault
- **Connection Status**: Visual indicator of Ollama server connection

## Installation

### Prerequisites

1. **Ollama**: You must have [Ollama](https://ollama.ai/) installed and running on your system.
2. **Obsidian**: Version 1.0.0 or higher.

### Manual Installation

1. Download the latest release from the [GitHub repository](https://github.com/josholaf/olla/releases)
2. Extract the plugin files to your Obsidian vault's plugins folder: `VaultFolder/.obsidian/plugins/olla/`
3. In Obsidian, go to Settings > Community plugins and enable "Olla"

### Development Installation

1. Clone this repository into your Obsidian vault's plugins folder
2. Run `npm install` to install dependencies
3. Run `npm run build` to compile the plugin
4. Enable the plugin in Obsidian under Settings > Community plugins

## Usage

### Starting a Chat

1. Click the Olla icon in the ribbon bar (or use the command palette)
2. The chat panel will open on the right side of your workspace
3. Select a model from the dropdown menu
4. Type your message and press Enter to send

### Managing Models

1. Open Olla settings from the Obsidian settings panel
2. View all available models that are currently downloaded
3. To download a new model:
   - Enter the model name (e.g., `llama2`, `mistral`) in the "Model Name" field
   - Click "Download"
   - The model will be downloaded and appear in the available models list

### Changing Server URL

By default, Olla connects to `http://localhost:11434`. If your Ollama server is running on a different URL:

1. Open Olla settings
2. Update the "Ollama Server URL" field
3. Save the settings

## Configuration

The plugin automatically saves your settings including:
- Ollama server URL
- Selected model
- Chat history
- Available models

## Troubleshooting

### Ollama is not connected

- Make sure Ollama is running: `ollama serve`
- Check that the server URL in settings is correct
- Verify that the Ollama port (default: 11434) is accessible

### Models not appearing

- Ensure you have downloaded models using Ollama: `ollama pull llama2`
- Restart the Ollama server if you recently downloaded models
- Check the connection status in the chat panel

### Plugin not loading

- Make sure you've run `npm run build` after making changes
- Check the Obsidian console for errors (Ctrl+Shift+I > Console)
- Ensure you're using a compatible version of Obsidian

## Development

### Project Structure

- `main.ts`: Main plugin file with all functionality
- `manifest.json`: Plugin metadata
- `package.json`: Project configuration and dependencies
- `tsconfig.json`: TypeScript configuration

### Building

```bash
npm run build
```

For development with automatic rebuilding:

```bash
npm run dev
```

### Architecture

The plugin uses:
- Obsidian API for plugin integration
- React for UI components
- TypeScript for type safety
- Ollama REST API for model interaction

## Contributing

Contributions are welcome! Please open an issue or pull request on GitHub.

## License

MIT
