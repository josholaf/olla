import { App, Plugin, PluginSettingTab, Setting, TFile, requestUrl } from 'obsidian';
import { createRoot, Root } from 'react-dom/client';
import React from 'react';

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

  async generate(response: { content: string; model: string; done: boolean; total_duration?: number; eval_count?: number }, stream: boolean = false): Promise<string> {
    try {
      const requestBody = {
        model: response.model,
        prompt: response.content,
        stream,
      };

      const fetchResponse = await requestUrl({
        url: `${this.baseUrl}/api/generate`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (fetchResponse.status !== 200) {
        throw new Error(`Failed to generate: ${fetchResponse.status}`);
      }

      const data = fetchResponse.json as { response: string; done: boolean; total_duration?: number; eval_count?: number };
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

// Chat Message Component
const ChatMessageComponent: React.FC<{ message: ChatMessage }> = ({ message }) => {
  const isUser = message.sender === 'user';
  const messageClass = isUser ? 'olla-message-user' : 'olla-message-assistant';

  return (
    <div className={`olla-message ${messageClass}`}>
      <div className="olla-message-sender">{message.sender}</div>
      <div className="olla-message-content" dangerouslySetInnerHTML={{ __html: message.content }} />
      <div className="olla-message-time">{new Date(message.timestamp).toLocaleTimeString()}</div>
    </div>
  );
};

// Chat Panel Component
class ChatPanelComponent extends React.Component<{
  messages: ChatMessage[];
  onSend: (content: string) => void;
  isLoading: boolean;
  selectedModel: string;
  onModelChange: (model: string) => void;
  models: OllamaModel[];
  isConnected: boolean;
}, {}> {
  private inputRef: React.RefObject<HTMLTextAreaElement>;

  constructor(props: any) {
    super(props);
    this.inputRef = React.createRef<HTMLTextAreaElement>();
  }

  handleSend = () => {
    const input = this.inputRef.current;
    if (input && input.value.trim()) {
      this.props.onSend(input.value.trim());
      input.value = '';
    }
  };

  handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this.handleSend();
    }
  };

  render() {
    const { messages, isLoading, selectedModel, onModelChange, models, isConnected } = this.props;

    return (
      <div className="olla-chat-panel">
        <div className="olla-chat-header">
          <h2>Olla Chat</h2>
          <div className="olla-status">
            {isConnected ? (
              <span className="olla-status-connected">Connected to Ollama</span>
            ) : (
              <span className="olla-status-disconnected">Disconnected</span>
            )}
          </div>
        </div>

        <div className="olla-model-selector">
          <select
            value={selectedModel}
            onChange={(e) => onModelChange(e.target.value)}
            disabled={!isConnected || models.length === 0}
            className="olla-model-dropdown"
          >
            {models.length === 0 ? (
              <option value="">No models available</option>
            ) : (
              models.map((model) => (
                <option key={model.name} value={model.name}>
                  {model.name}
                </option>
              ))
            )}
          </select>
        </div>

        <div className="olla-messages-container">
          {messages.length === 0 ? (
            <div className="olla-welcome-message">
              <p>Start a conversation with Ollama!</p>
              <p>Select a model and type your message below.</p>
            </div>
          ) : (
            messages.map((message) => (
              <ChatMessageComponent key={message.id} message={message} />
            ))
          )}
          {isLoading && (
            <div className="olla-message olla-message-assistant">
              <div className="olla-message-sender">assistant</div>
              <div className="olla-message-content olla-typing-indicator">
                <span></span><span></span><span></span>
              </div>
            </div>
          )}
        </div>

        <div className="olla-input-container">
          <textarea
            ref={this.inputRef}
            className="olla-input"
            placeholder={isConnected ? "Type your message... (Enter to send, Shift+Enter for new line)" : "Ollama is not connected. Please start Ollama server."}
            onKeyDown={this.handleKeyDown}
            disabled={!isConnected || !selectedModel}
          />
          <button
            className="olla-send-button"
            onClick={this.handleSend}
            disabled={!isConnected || !selectedModel || isLoading}
          >
            Send
          </button>
        </div>
      </div>
    );
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
    new Setting(downloadContainer)
      .setName('Model Name')
      .setDesc('Enter the name of the model to download (e.g., llama2, mistral)')
      .addText((text) => {
        text.setPlaceholder('llama2');
      });

    new Setting(downloadContainer)
      .addButton((button) => {
        button.setButtonText('Download');
        button.onClick(async () => {
          const input = downloadContainer.querySelector('input') as HTMLInputElement;
          const modelName = input.value.trim();
          if (modelName) {
            await this.plugin.downloadModel(modelName);
            input.value = '';
          }
        });
      });
  }
}

// Main Plugin
class OllaPlugin extends Plugin {
  settings: OllaSettings;
  private root: Root | null = null;
  private containerEl: HTMLElement | null = null;
  private ollamaClient: OllamaClient;
  private isLoading: boolean = false;
  private isConnected: boolean = false;

  constructor(app: App, manifest: any) {
    super(app, manifest);
    this.ollamaClient = new OllamaClient(DEFAULT_SETTINGS.ollamaUrl);
  }

  async onload() {
    await this.loadSettings();
    
    // Create status bar item
    this.addStatusBarItem().setText('Olla');

    // Add ribbon icon
    this.addRibbonIcon('bot', 'Olla', () => {
      this.toggleChatPanel();
    });

    // Create and register the chat panel
    this.register(() => {
      if (this.root) {
        this.root.unmount();
        this.root = null;
      }
      if (this.containerEl) {
        this.containerEl.empty();
      }
    });

    // Add settings tab
    this.addSettingTab(new OllaSettingTab(this.app, this));

    // Check connection and load models
    this.checkConnection();
    this.loadModels();

    // Create chat panel
    this.createChatPanel();
  }

  async loadSettings() {
    const data = await this.loadData();
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...data,
    };
    this.ollamaClient = new OllamaClient(this.settings.ollamaUrl);
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async checkConnection() {
    this.isConnected = await this.ollamaClient.checkHealth();
    if (this.containerEl) {
      this.renderChatPanel();
    }
  }

  async loadModels() {
    try {
      const models = await this.ollamaClient.listModels();
      this.settings.models = models;
      
      // Set default model if none selected
      if (!this.settings.selectedModel && models.length > 0) {
        this.settings.selectedModel = models[0].name;
      }
      
      await this.saveSettings();
      
      if (this.containerEl) {
        this.renderChatPanel();
      }
    } catch (error) {
      console.error('Error loading models:', error);
      this.settings.models = [];
    }
  }

  async downloadModel(modelName: string) {
    try {
      this.isLoading = true;
      if (this.containerEl) {
        this.renderChatPanel();
      }

      await this.ollamaClient.pullModel(modelName);
      await this.loadModels();
    } catch (error) {
      console.error('Error downloading model:', error);
      new Notice(`Failed to download model: ${error}`);
    } finally {
      this.isLoading = false;
      if (this.containerEl) {
        this.renderChatPanel();
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
    this.renderChatPanel();

    try {
      this.isLoading = true;
      this.renderChatPanel();

      const response = await this.ollamaClient.generate({
        content,
        model: this.settings.selectedModel,
        done: false,
      });

      const assistantMessage: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        content: response || 'No response received',
        sender: 'assistant',
        timestamp: Date.now(),
      };

      this.settings.chatHistory.push(assistantMessage);
      await this.saveSettings();
    } catch (error) {
      console.error('Error generating response:', error);
      const errorMessage: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        content: `Error: ${error}`,
        sender: 'assistant',
        timestamp: Date.now(),
      };
      this.settings.chatHistory.push(errorMessage);
    } finally {
      this.isLoading = false;
      this.renderChatPanel();
    }
  }

  toggleChatPanel() {
    if (this.containerEl) {
      this.containerEl.empty();
      this.containerEl = null;
      this.root = null;
    } else {
      this.createChatPanel();
    }
  }

  createChatPanel() {
    if (this.containerEl) return;

    this.containerEl = this.app.workspace.getRightLeaf(false).getContainer();
    this.containerEl.empty();
    this.containerEl.addClass('olla-chat-container');

    this.root = createRoot(this.containerEl);
    this.renderChatPanel();
  }

  renderChatPanel() {
    if (!this.containerEl || !this.root) return;

    this.root.render(
      <ChatPanelComponent
        messages={this.settings.chatHistory}
        onSend={this.sendMessage.bind(this)}
        isLoading={this.isLoading}
        selectedModel={this.settings.selectedModel}
        onModelChange={(model) => {
          this.settings.selectedModel = model;
          this.saveSettings();
          this.renderChatPanel();
        }}
        models={this.settings.models}
        isConnected={this.isConnected}
      />
    );
  }

  async onunload() {
    if (this.root) {
      this.root.unmount();
      this.root = null;
    }
    if (this.containerEl) {
      this.containerEl.empty();
    }
  }
}

// CSS Styles
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

.olla-chat-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  padding: 12px;
  box-sizing: border-box;
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
`;
document.head.appendChild(style);

export default OllaPlugin;
