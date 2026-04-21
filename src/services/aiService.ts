import { ragService } from './ragService';

export type AIAssistantAction = 'improve' | 'fix-grammar' | 'shorten' | 'expand' | 'generate-outline' | 'expand-outline' | 'summarize' | 'suggest-title' | 'draft-topic';

export interface ChatMessage {
  role: 'user' | 'model' | 'system';
  parts: { text: string }[];
  images?: string[];
}

export interface AIProvider {
  chat(messages: any[], model: string, onChunk?: (chunk: string) => void): Promise<string>;
  generate(prompt: string, system: string, model: string, onChunk?: (chunk: string) => void): Promise<string>;
}

export class OllamaProvider implements AIProvider {
  constructor(private host: string = '') {}

  async chat(messages: any[], model: string, onChunk?: (chunk: string) => void): Promise<string> {
    const response = await fetch(`/api/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: !!onChunk
      })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || response.statusText);
    }

    if (onChunk) {
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";
      
      while (true) {
        const { done, value } = await reader!.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);
            if (data.message?.content) {
              fullContent += data.message.content;
              onChunk(data.message.content);
            }
          } catch (e) {}
        }
      }
      return fullContent;
    } else {
      const data = await response.json();
      return data.message?.content || "";
    }
  }

  async generate(prompt: string, system: string, model: string, onChunk?: (chunk: string) => void): Promise<string> {
    const response = await fetch(`/api/ai/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        system,
        stream: !!onChunk
      })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || response.statusText);
    }

    if (onChunk) {
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";
      
      while (true) {
        const { done, value } = await reader!.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);
            if (data.response) {
              fullContent += data.response;
              onChunk(data.response);
            }
          } catch (e) {}
        }
      }
      return fullContent;
    } else {
      const data = await response.json();
      return data.response || "";
    }
  }
}

export class OpenAIProvider implements AIProvider {
  constructor(private apiKey: string) {}

  async chat(messages: any[], model: string, onChunk?: (chunk: string) => void): Promise<string> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: model || 'gpt-4o',
        messages: messages.map(m => ({
          role: m.role === 'assistant' ? 'assistant' : m.role,
          content: m.content
        })),
        stream: !!onChunk
      })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error?.message || response.statusText);
    }

    if (onChunk) {
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";
      
      while (true) {
        const { done, value } = await reader!.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        for (const line of lines) {
          const cleanLine = line.replace(/^data: /, '').trim();
          if (!cleanLine || cleanLine === '[DONE]') continue;
          try {
            const data = JSON.parse(cleanLine);
            const content = data.choices[0]?.delta?.content;
            if (content) {
              fullContent += content;
              onChunk(content);
            }
          } catch (e) {}
        }
      }
      return fullContent;
    } else {
      const data = await response.json();
      return data.choices[0]?.message?.content || "";
    }
  }

  async generate(prompt: string, system: string, model: string, onChunk?: (chunk: string) => void): Promise<string> {
    return this.chat([
      { role: 'system', content: system },
      { role: 'user', content: prompt }
    ], model, onChunk);
  }
}

export class AnthropicProvider implements AIProvider {
  constructor(private apiKey: string) {}

  async chat(messages: any[], model: string, onChunk?: (chunk: string) => void): Promise<string> {
    const system = messages.find(m => m.role === 'system')?.content || '';
    const chatMessages = messages.filter(m => m.role !== 'system').map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content
    }));

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'dangerously-allow-browser': 'true'
      },
      body: JSON.stringify({
        model: model || 'claude-3-5-sonnet-20240620',
        system,
        messages: chatMessages,
        max_tokens: 4096,
        stream: !!onChunk
      })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error?.message || response.statusText);
    }

    if (onChunk) {
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";
      
      while (true) {
        const { done, value } = await reader!.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const cleanLine = line.replace(/^data: /, '').trim();
          try {
            const data = JSON.parse(cleanLine);
            if (data.type === 'content_block_delta') {
              const content = data.delta?.text;
              if (content) {
                fullContent += content;
                onChunk(content);
              }
            }
          } catch (e) {}
        }
      }
      return fullContent;
    } else {
      const data = await response.json();
      return data.content[0]?.text || "";
    }
  }

  async generate(prompt: string, system: string, model: string, onChunk?: (chunk: string) => void): Promise<string> {
    return this.chat([
      { role: 'system', content: system },
      { role: 'user', content: prompt }
    ], model, onChunk);
  }
}

export const getProvider = (type: 'ollama' | 'openai' | 'anthropic', config: any): AIProvider => {
  switch (type) {
    case 'openai': return new OpenAIProvider(config.apiKeys.openai);
    case 'anthropic': return new AnthropicProvider(config.apiKeys.anthropic);
    default: return new OllamaProvider(config.providerConfigs.ollama.host);
  }
};

export const processAIAction = async (
  text: string, 
  action: AIAssistantAction, 
  options: {
    personalInstructions?: string;
    model?: string;
    provider?: 'ollama' | 'openai' | 'anthropic';
    apiKeys?: any;
    providerConfigs?: any;
    onChunk?: (chunk: string) => void;
  }
): Promise<string> => {
  const { personalInstructions = "", model = 'mistral', provider = 'ollama', apiKeys, providerConfigs, onChunk } = options;
  
  let systemInstruction = "You are a helpful writing assistant. ";
  if (personalInstructions) {
    systemInstruction += `The user has specified these stylistic preferences: "${personalInstructions}". Please adhere to them while performing the action. `;
  }
  
  let prompt = "";

  switch (action) {
    case 'improve':
      systemInstruction += "Improve the quality of the following text while keeping its meaning and general structure.";
      prompt = `Improve this text:\n\n${text}`;
      break;
    case 'draft-topic':
      systemInstruction += "Take the following topic or snippet and draft a detailed, well-structured, and engaging piece of content around it.";
      prompt = `Draft a detailed piece about this topic:\n\n${text}`;
      break;
    case 'fix-grammar':
      systemInstruction += "Fix any grammar, spelling, or punctuation errors in the following text. Do not change the meaning.";
      prompt = `Fix grammar in this text:\n\n${text}`;
      break;
    case 'shorten':
      systemInstruction += "Make the following text more concise without losing key information.";
      prompt = `Shorten this text:\n\n${text}`;
      break;
    case 'summarize':
      systemInstruction += "Summarize the following text into a concise one-sentence description or a few key bullet points.";
      prompt = `Summarize this text:\n\n${text}`;
      break;
    case 'expand':
      systemInstruction += "Expand on the following text with relevant details and richer language.";
      prompt = `Expand on this text:\n\n${text}`;
      break;
    case 'generate-outline':
      systemInstruction += "Generate a clear, high-level structural outline for the following text. Use Markdown headings and bullet points.";
      prompt = `Generate an outline for this text:\n\n${text}`;
      break;
    case 'expand-outline':
      systemInstruction += "You are a master writer. Your task is to take a Markdown outline (headings and bullet points) and expand it into a full, detailed, and well-written draft. Use the outline structure as your guide but write in a natural, cohesive prose style. Maintain any existing Markdown formatting like bolding or italics if present in the outline.";
      prompt = `Convert this outline into a full draft section:\n\n${text}`;
      break;
    case 'suggest-title':
      systemInstruction += "Suggest three punchy and relevant titles for the following text. Return only the three titles as a list.";
      prompt = `Suggest titles for this text:\n\n${text}`;
      break;
    default:
      prompt = text;
  }

  const aiProvider = getProvider(provider, { apiKeys, providerConfigs });
  return await aiProvider.generate(prompt, systemInstruction, model, onChunk);
};

export const generateContentFromPrompt = async (
  userInput: string, 
  context: string = "", 
  options: {
    personalInstructions?: string;
    model?: string;
    provider?: 'ollama' | 'openai' | 'anthropic';
    apiKeys?: any;
    providerConfigs?: any;
    onChunk?: (chunk: string) => void;
  }
): Promise<string> => {
  const { personalInstructions = "", model = 'mistral', provider = 'ollama', apiKeys, providerConfigs, onChunk } = options;
  
  let systemInstruction = "You are an expert content creator. Generate high-quality Markdown content based on the user's prompt. If context is provided, ensure your response fits naturally within it.";
  if (personalInstructions) {
    systemInstruction += ` Important User Preferences to follow: "${personalInstructions}".`;
  }
  
  const prompt = `
User requested: ${userInput}
Existing context: ${context}

Generate only the markdown content.
`;

  const aiProvider = getProvider(provider, { apiKeys, providerConfigs });
  return await aiProvider.generate(prompt, systemInstruction, model, onChunk);
};

export const chatWithAI = async (
  messages: ChatMessage[], 
  documentContext: string, 
  options: {
    personalInstructions?: string;
    model?: string;
    provider?: 'ollama' | 'openai' | 'anthropic';
    apiKeys?: any;
    providerConfigs?: any;
    onChunk?: (chunk: string) => void;
    cursorContext?: string;
  }
): Promise<string> => {
  const { personalInstructions = "", model = 'mistral', provider = 'ollama', apiKeys, providerConfigs, onChunk, cursorContext = "" } = options;
  
  let systemInstruction = "You are a helpful AI writing partner in Ink & Quill. You help users refine their documents through conversation.";
  if (personalInstructions) {
    systemInstruction += ` Always follow these style preferences: "${personalInstructions}".`;
  }
  
  // Get relevant context from RAG
  const lastUserMessage = [...messages].reverse().find(m => m.role === 'user')?.parts[0].text || "";
  
  // 1. Fetch all contexts
  const relevantContext = await ragService.getRelevantContext(lastUserMessage);
  const globalSummary = await ragService.getGlobalSummary(documentContext);
  const relevantEpisodes = await ragService.getRelevantEpisodes(lastUserMessage);
  
  // Token budget estimation (rough: 4 chars per token)
  const MAX_TOKENS = 4000;
  let currentTokens = ragService.estimateTokens(systemInstruction) + ragService.estimateTokens(cursorContext);
  
  if (globalSummary) {
    const summaryText = `\n\n### DOCUMENT STRUCTURE ###\n${globalSummary}`;
    systemInstruction += summaryText;
    currentTokens += ragService.estimateTokens(summaryText);
  }

  if (cursorContext) {
    systemInstruction += `\n\n### NEARBY CONTEXT (Around Cursor) ###\n${cursorContext}`;
  }
  
  // 2. Budget aware inclusion of full doc vs semantic chunks
  const docTokens = ragService.estimateTokens(documentContext);
  if (docTokens < 1500 && (currentTokens + docTokens) < MAX_TOKENS) {
    systemInstruction += `\n\n### FULL DOCUMENT CONTENT ###\n${documentContext}`;
    currentTokens += docTokens;
  } else {
    systemInstruction += `\n\n### ADDITIONAL RELEVANT CHUNKS ###\nUse the specific context provided below to answer questions accurately.`;
    if (relevantContext) {
      const contextTokens = ragService.estimateTokens(relevantContext);
      if (currentTokens + contextTokens < MAX_TOKENS) {
        systemInstruction += `\n\n### SEMANTICALLY RELEVANT CONTEXT ###\n${relevantContext}`;
        currentTokens += contextTokens;
      } else {
        // Trim relevant context
        const trimmed = ragService.trimToTokens(relevantContext, MAX_TOKENS - currentTokens);
        systemInstruction += `\n\n### SEMANTICALLY RELEVANT CONTEXT ###\n${trimmed}`;
        currentTokens = MAX_TOKENS;
      }
    }
  }

  // 3. Episodic Memory (lowest priority)
  if (relevantEpisodes && currentTokens < MAX_TOKENS) {
    const epTokens = ragService.estimateTokens(relevantEpisodes);
    if (currentTokens + epTokens < MAX_TOKENS) {
      systemInstruction += `\n\n### RELEVANT PAST CONVERSATIONS ###\n${relevantEpisodes}`;
    } else {
      const trimmed = ragService.trimToTokens(relevantEpisodes, MAX_TOKENS - currentTokens);
      systemInstruction += `\n\n### RELEVANT PAST CONVERSATIONS ###\n${trimmed}`;
    }
  }
  
  systemInstruction += `\n\nIMPORTANT: Use the provided context to answer questions about the document. If the information is not in the context or document, state that you don't know based on the current document, rather than saying you don't have memory.`;

  const formattedMessages = [
    { role: 'system', content: systemInstruction },
    ...messages.filter(m => m.role !== 'system').map(m => ({
      role: m.role === 'model' ? 'assistant' : m.role,
      content: m.parts[0].text,
      images: m.images
    }))
  ];

  const aiProvider = getProvider(provider, { apiKeys, providerConfigs });
  return await aiProvider.chat(formattedMessages, model, onChunk);
};

export const checkOllamaConnection = async (selectedModel?: string): Promise<{ success: boolean; model?: string; allModels: string[]; error?: string }> => {
  try {
    const response = await fetch(`/api/ai/tags`);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    const models = data.models?.map((m: any) => m.name) || [];
    const modelToUse = selectedModel && models.includes(selectedModel) ? selectedModel : (models[0] || "None");
    
    return { 
      success: true, 
      model: modelToUse,
      allModels: models
    };
  } catch (error) {
    return { success: false, allModels: [], error: error instanceof Error ? error.message : String(error) };
  }
};
