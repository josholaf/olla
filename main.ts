import { App, Plugin, PluginSettingTab, Setting, requestUrl, Notice, setIcon } from 'obsidian';

// Types
interface OllamaModel {
  name: string;
  size: number;
  digest: string;
  modified_at: string;
}

interface ChatMessage {
  id: string;
  content: string;
  sender: 'user' | 'assistant';
  timestamp: number;
}

interface OllaSettings {
  ollamaUrl: string;
  selectedModel: string;
  models: OllamaModel[];
  chatHistory: ChatMessage[];
}

const DEFAULT_SETTINGS: OllaSettings = {
  ollamaUrl: 'http://localhost:11434',
  selectedModel: '',
  models: [],
  chatHistory: [],
};

// Ollama API Client
class OllamaClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  }

  async listModels(): Promise<OllamaModel[]> {
    try {
      const response = await requestUrl({
        url: `${this.baseUrl}/api/tags`,
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      if (response.status !== 200) {
        throw new Error(`Failed to list models: ${response.status}`);
      }
      const data = response.json as { models: OllamaModel[] };
      return data.models || [];
    } catch (error) {
      console.error('Error listing models:', error);
      throw error;
    }
  }

  async generate(prompt: string, model: string): Promise<string> {
    try {
      const response = await requestUrl({
        url: `${this.baseUrl}/api/generate`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt,
          stream: false,
        }),
      });

      if (response.status !== 200) {
        throw new Error(`Failed to generate: ${response.status}`);
      }

      const data = response.json as { response: string; done: boolean };
      return data.response || '';
    } catch (error) {
      console.error('Error generating:', error);
      throw error;
    }
  }

  async pullModel(modelName: string): Promise<{ status: string; name: string }> {
    try {
      const response = await requestUrl({
        url: `${this.baseUrl}/api/pull`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: modelName }),
      });

      if (response.status !== 200) {
        throw new Error(`Failed to pull model: ${response.status}`);
      }

      return response.json as { status: string; name: string };
    } catch (error) {
      console.error('Error pulling model:', error);
      throw error;
    }
  }

  async checkHealth(): Promise<boolean> {
    try {
      const response = await requestUrl({
        url: `${this.baseUrl}/api/tags`,
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }
}

// Chat Panel View
class ChatPanelView {
  private containerEl: HTMLElement;
  private plugin: OllaPlugin;
  private messagesContainer: HTMLElement;
  private inputEl: HTMLTextAreaElement;
  private sendButton: HTMLButtonElement;
  private modelSelector: HTMLSelectElement;
  private statusEl: HTMLElement;

  constructor(containerEl: HTMLElement, plugin: OllaPlugin) {
    this.containerEl = containerEl;
    this.plugin = plugin;
    this.buildUI();
  }

  buildUI() {
    this.containerEl.empty();
    this.containerEl.addClass('olla-chat-container');

    // Header
    const header = this.containerEl.createDiv({ cls: 'olla-chat-header' });
    header.createEl('h2', { text: 'Olla Chat' });
    this.statusEl = header.createSpan({ cls: 'olla-status' });

    // Model selector
    const modelSelectorContainer = this.containerEl.createDiv({ cls: 'olla-model-selector' });
    this.modelSelector = modelSelectorContainer.createEl('select', { cls: 'olla-model-dropdown' });

    // Messages container
    this.messagesContainer = this.containerEl.createDiv({ cls: 'olla-messages-container' });

    // Input container
    const inputContainer = this.containerEl.createDiv({ cls: 'olla-input-container' });
    this.inputEl = inputContainer.createEl('textarea', { cls: 'olla-input' });
    this.inputEl.placeholder = 'Type your message... (Enter to send, Shift+Enter for new line)';
    this.inputEl.addEventListener('keydown', this.handleKeyDown.bind(this));

    this.sendButton = inputContainer.createEl('button', { cls: 'olla-send-button' });
    this.sendButton.textContent = 'Send';
    this.sendButton.addEventListener('click', this.handleSend.bind(this));

    this.refresh();
  }

  handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this.handleSend();
    }
  }

  handleSend() {
    const content = this.inputEl.value.trim();
    if (content) {
      this.plugin.sendMessage(content);
      this.inputEl.value = '';
    }
  }

  refresh() {
    const { settings, isConnected, isLoading } = this.plugin;

    // Update status
    this.statusEl.empty();
    if (isConnected) {
      this.statusEl.createSpan({ text: 'Connected to Ollama', cls: 'olla-status-connected' });
    } else {
      this.statusEl.createSpan({ text: 'Disconnected', cls: 'olla-status-disconnected' });
    }

    // Update model selector
    this.modelSelector.empty();
    if (settings.models.length === 0) {
      const option = this.modelSelector.createEl('option');
      option.text = 'No models available';
      option.value = '';
    } else {
      settings.models.forEach((model) => {
        const option = this.modelSelector.createEl('option');
        option.text = model.name;
        option.value = model.name;
      });
    }
    this.modelSelector.value = settings.selectedModel;
    this.modelSelector.disabled = !isConnected || settings.models.length === 0;
    this.modelSelector.addEventListener('change', () => {
      settings.selectedModel = this.modelSelector.value;
      this.plugin.saveSettings();
      this.refresh();
    });

    // Update messages
    this.messagesContainer.empty();
    if (settings.chatHistory.length === 0) {
      const welcome = this.messagesContainer.createDiv({ cls: 'olla-welcome-message' });
      welcome.createEl('p', { text: 'Start a conversation with Ollama!' });
      welcome.createEl('p', { text: 'Select a model and type your message below.' });
    } else {
      settings.chatHistory.forEach((msg) => this.renderMessage(msg));
    }

    // Add loading indicator
    if (isLoading) {
      const loadingDiv = this.messagesContainer.createDiv({ cls: 'olla-message olla-message-assistant' });
      loadingDiv.createDiv({ text: 'assistant', cls: 'olla-message-sender' });
      const contentDiv = loadingDiv.createDiv({ cls: 'olla-message-content olla-typing-indicator' });
      contentDiv.createSpan();
      contentDiv.createSpan();
      contentDiv.createSpan();
    }

    // Update input state
    this.inputEl.disabled = !isConnected || !settings.selectedModel;
    this.sendButton.disabled = !isConnected || !settings.selectedModel || isLoading;

    if (!isConnected) {
      this.inputEl.placeholder = 'Ollama is not connected. Please start Ollama server.';
    } else if (!settings.selectedModel) {
      this.inputEl.placeholder = 'Please select a model first.';
    } else {
      this.inputEl.placeholder = 'Type your message... (Enter to send, Shift+Enter for new line)';
    }
  }

  renderMessage(message: ChatMessage) {
    const msgEl = this.messagesContainer.createDiv({
      cls: `olla-message olla-message-${message.sender}`,
    });
    msgEl.createDiv({ text: message.sender, cls: 'olla-message-sender' });
    const contentDiv = msgEl.createDiv({ cls: 'olla-message-content' });
    contentDiv.innerHTML = message.content;
    msgEl.createDiv({ text: new Date(message.timestamp).toLocaleTimeString(), cls: 'olla-message-time' });
  }

  addMessage(message: ChatMessage) {
    this.renderMessage(message);
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
  }
}

// Settings Tab
class OllaSettingTab extends PluginSettingTab {
  plugin: OllaPlugin;

  constructor(app: App, plugin: OllaPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass('olla-settings-tab');

    new Setting(containerEl)
      .setName('Ollama Server URL')
      .setDesc('URL of your Ollama server (default: http://localhost:11434)')
      .addText((text) => {
        text.setValue(this.plugin.settings.ollamaUrl);
        text.onChange(async (value) => {
          this.plugin.settings.ollamaUrl = value;
          await this.plugin.saveSettings();
          this.plugin.ollamaClient = new OllamaClient(value);
          this.plugin.checkConnection();
          this.plugin.loadModels();
        });
      });

    containerEl.createEl('h3', { text: 'Available Models' });
    
    if (this.plugin.settings.models.length === 0) {
      containerEl.createEl('p', { text: 'No models available. Make sure Ollama is running and models are downloaded.' });
    } else {
      const modelList = containerEl.createDiv({ cls: 'olla-model-list' });
      this.plugin.settings.models.forEach((model) => {
        const modelItem = modelList.createDiv({ cls: 'olla-model-item' });
        modelItem.createSpan({ text: model.name, cls: 'olla-model-name' });
        modelItem.createSpan({ text: ` - ${(model.size / 1024 / 1024 / 1024).toFixed(2)} GB`, cls: 'olla-model-size' });
      });
    }

    containerEl.createEl('h3', { text: 'Download New Model' });
    
    const downloadContainer = containerEl.createDiv({ cls: 'olla-download-container' });
    
    const modelNameInput = downloadContainer.createEl('input', { type: 'text', cls: 'olla-model-input' });
    modelNameInput.placeholder = 'Enter model name (e.g., llama2, mistral)';

    const downloadButton = downloadContainer.createEl('button', { cls: 'olla-download-button' });
    downloadButton.textContent = 'Download';
    downloadButton.addEventListener('click', async () => {
      const modelName = modelNameInput.value.trim();
      if (modelName) {
        await this.plugin.downloadModel(modelName);
        modelNameInput.value = '';
        new Notice(`Model ${modelName} download started`);
      }
    });
  }
}

// Main Plugin
class OllaPlugin extends Plugin {
  settings: OllaSettings;
  ollamaClient: OllamaClient;
  private chatPanel: ChatPanelView | null = null;
  private leaf: any = null;
  isLoading: boolean = false;
  isConnected: boolean = false;

  async onload() {
    await this.loadSettings();
    this.ollamaClient = new OllamaClient(this.settings.ollamaUrl);

    // Add status bar item
    this.addStatusBarItem().setText('Olla');

    // Add ribbon icon
    const ribbonIcon = this.addRibbonIcon('bot', 'Olla', () => {
      this.toggleChatPanel();
    });
    setIcon(ribbonIcon, 'bot');

    // Add settings tab
    this.addSettingTab(new OllaSettingTab(this.app, this));

    // Check connection and load models
    this.checkConnection();
    this.loadModels();

    // Inject CSS
    this.injectCSS();
  }

  async loadSettings() {
    const data = await this.loadData();
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...data,
    };
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async checkConnection() {
    this.isConnected = await this.ollamaClient.checkHealth();
    if (this.chatPanel) {
      this.chatPanel.refresh();
    }
  }

  async loadModels() {
    try {
      const models = await this.ollamaClient.listModels();
      this.settings.models = models;
      
      // Set default model if none selected
      if (!this.settings.selectedModel && models.length > 0) {
        this.settings.selectedModel = models[0].name;
        await this.saveSettings();
      }
      
      if (this.chatPanel) {
        this.chatPanel.refresh();
      }
    } catch (error) {
      console.error('Error loading models:', error);
      this.settings.models = [];
    }
  }

  async downloadModel(modelName: string) {
    try {
      this.isLoading = true;
      if (this.chatPanel) {
        this.chatPanel.refresh();
      }

      await this.ollamaClient.pullModel(modelName);
      await this.loadModels();
      new Notice(`Model ${modelName} downloaded successfully`);
    } catch (error) {
      console.error('Error downloading model:', error);
      new Notice(`Failed to download model: ${error}`);
    } finally {
      this.isLoading = false;
      if (this.chatPanel) {
        this.chatPanel.refresh();
      }
    }
  }

  async sendMessage(content: string) {
    if (!this.settings.selectedModel) {
      new Notice('Please select a model first');
      return;
    }

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      content,
      sender: 'user',
      timestamp: Date.now(),
    };

    this.settings.chatHistory.push(userMessage);
    await this.saveSettings();
    
    if (this.chatPanel) {
      this.chatPanel.addMessage(userMessage);
    }

    try {
      this.isLoading = true;
      if (this.chatPanel) {
        this.chatPanel.refresh();
      }

      const response = await this.ollamaClient.generate(content, this.settings.selectedModel);

      const assistantMessage: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        content: response || 'No response received',
        sender: 'assistant',
        timestamp: Date.now(),
      };

      this.settings.chatHistory.push(assistantMessage);
      await this.saveSettings();
      
      if (this.chatPanel) {
        this.chatPanel.addMessage(assistantMessage);
      }
    } catch (error) {
      console.error('Error generating response:', error);
      const errorMessage: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        content: `Error: ${error}`,
        sender: 'assistant',
        timestamp: Date.now(),
      };
      this.settings.chatHistory.push(errorMessage);
      await this.saveSettings();
      if (this.chatPanel) {
        this.chatPanel.addMessage(errorMessage);
      }
    } finally {
      this.isLoading = false;
      if (this.chatPanel) {
        this.chatPanel.refresh();
      }
    }
  }

  toggleChatPanel() {
    if (this.leaf) {
      this.app.workspace.detachLeaf(this.leaf);
      this.leaf = null;
      this.chatPanel = null;
    } else {
      this.createChatPanel();
    }
  }

  createChatPanel() {
    this.leaf = this.app.workspace.getRightLeaf(false);
    this.chatPanel = new ChatPanelView(this.leaf.getContainer(), this);
  }

  injectCSS() {
    const style = document.createElement('style');
    style.textContent = `
.olla-chat-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  background: var(--background-secondary);
  border-left: 1px solid var(--background-modifier-border);
}

.olla-chat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--background-modifier-border);
}

.olla-chat-header h2 {
  margin: 0;
  font-size: 1.2em;
}

.olla-status {
  font-size: 0.8em;
}

.olla-status-connected {
  color: var(--text-success);
}

.olla-status-disconnected {
  color: var(--text-error);
}

.olla-model-selector {
  margin-bottom: 12px;
}

.olla-model-dropdown {
  width: 100%;
  padding: 8px;
  border-radius: 4px;
  border: 1px solid var(--background-modifier-border);
  background: var(--background-secondary);
  color: var(--text-normal);
  font-size: 0.9em;
}

.olla-messages-container {
  flex: 1;
  overflow-y: auto;
  margin-bottom: 12px;
  padding: 8px;
  background: var(--background-primary);
  border-radius: 4px;
}

.olla-welcome-message {
  text-align: center;
  color: var(--text-muted);
  padding: 20px;
}

.olla-message {
  margin-bottom: 12px;
  padding: 12px;
  border-radius: 8px;
  max-width: 80%;
}

.olla-message-user {
  background: var(--background-modifier-active-hover);
  margin-left: auto;
  border-bottom-right-radius: 0;
}

.olla-message-assistant {
  background: var(--background-secondary);
  margin-right: auto;
  border-bottom-left-radius: 0;
}

.olla-message-sender {
  font-weight: bold;
  margin-bottom: 4px;
  font-size: 0.85em;
  color: var(--text-muted);
}

.olla-message-content {
  white-space: pre-wrap;
  word-wrap: break-word;
}

.olla-message-content p {
  margin: 0 0 8px 0;
}

.olla-message-content pre {
  background: var(--background-primary);
  padding: 8px;
  border-radius: 4px;
  overflow-x: auto;
}

.olla-message-content code {
  background: var(--background-primary);
  padding: 2px 4px;
  border-radius: 2px;
  font-family: var(--font-monospace);
}

.olla-message-time {
  font-size: 0.75em;
  color: var(--text-muted);
  margin-top: 4px;
}

.olla-typing-indicator {
  display: flex;
  gap: 4px;
}

.olla-typing-indicator span {
  width: 8px;
  height: 8px;
  background: var(--text-muted);
  border-radius: 50%;
  animation: olla-typing 1.4s infinite;
}

.olla-typing-indicator span:nth-child(2) {
  animation-delay: 0.2s;
}

.olla-typing-indicator span:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes olla-typing {
  0%, 60%, 100% {
    transform: translateY(0);
    opacity: 0.4;
  }
  30% {
    transform: translateY(-4px);
    opacity: 1;
  }
}

.olla-input-container {
  display: flex;
  gap: 8px;
  align-items: flex-end;
}

.olla-input {
  flex: 1;
  padding: 12px;
  border-radius: 4px;
  border: 1px solid var(--background-modifier-border);
  background: var(--background-secondary);
  color: var(--text-normal);
  font-family: inherit;
  font-size: 0.9em;
  resize: none;
  min-height: 80px;
  max-height: 200px;
}

.olla-input:focus {
  outline: none;
  border-color: var(--background-modifier-active);
}

.olla-input::placeholder {
  color: var(--text-muted);
}

.olla-input:disabled {
  background: var(--background-primary);
  color: var(--text-muted);
  cursor: not-allowed;
}

.olla-send-button {
  padding: 12px 24px;
  border-radius: 4px;
  border: none;
  background: var(--interactive-accent);
  color: white;
  font-weight: bold;
  cursor: pointer;
  transition: background 0.2s;
}

.olla-send-button:hover:not(:disabled) {
  background: var(--interactive-accent-hover);
}

.olla-send-button:disabled {
  background: var(--background-modifier-border);
  color: var(--text-muted);
  cursor: not-allowed;
}

.olla-settings-tab {
  padding: 12px;
}

.olla-model-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}

.olla-model-item {
  display: flex;
  justify-content: space-between;
  padding: 8px 12px;
  background: var(--background-secondary);
  border-radius: 4px;
}

.olla-model-name {
  font-weight: 500;
}

.olla-model-size {
  color: var(--text-muted);
  font-size: 0.85em;
}

.olla-download-container {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--background-modifier-border);
}

.olla-model-input {
  width: 100%;
  padding: 8px;
  margin-bottom: 8px;
  border-radius: 4px;
  border: 1px solid var(--background-modifier-border);
  background: var(--background-secondary);
  color: var(--text-normal);
  font-size: 0.9em;
}

.olla-download-button {
  padding: 8px 16px;
  border-radius: 4px;
  border: none;
  background: var(--interactive-accent);
  color: white;
  font-weight: bold;
  cursor: pointer;
}
`;
    document.head.appendChild(style);
  }

  async onunload() {
    if (this.leaf) {
      this.app.workspace.detachLeaf(this.leaf);
      this.leaf = null;
    }
    this.chatPanel = null;
  }
}

export default OllaPlugin;
