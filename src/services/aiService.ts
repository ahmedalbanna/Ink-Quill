const DEFAULT_MODEL = 'mistral';

export type AIAssistantAction = 'improve' | 'fix-grammar' | 'shorten' | 'expand' | 'generate-outline' | 'expand-outline' | 'summarize' | 'suggest-title' | 'draft-topic';

export interface ChatMessage {
  role: 'user' | 'model' | 'system';
  parts: { text: string }[];
  images?: string[];
}

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

const callAiProxy = async (prompt: string, system?: string, model: string = 'mistral', onChunk?: (chunk: string) => void): Promise<string> => {
  try {
    const response = await fetch(`/api/ai/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model,
        prompt: prompt,
        system: system,
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
  } catch (error) {
    console.error("AI Proxy Error:", error);
    return `Error: ${error instanceof Error ? error.message : "Unable to reach AI service."}`;
  }
};

export const processAIAction = async (text: string, action: AIAssistantAction, personalInstructions: string = "", model: string = 'mistral', onChunk?: (chunk: string) => void): Promise<string> => {
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

  return await callAiProxy(prompt, systemInstruction, model, onChunk);
};

export const generateContentFromPrompt = async (userInput: string, context: string = "", personalInstructions: string = "", model: string = 'mistral', onChunk?: (chunk: string) => void): Promise<string> => {
  let systemInstruction = "You are an expert content creator. Generate high-quality Markdown content based on the user's prompt. If context is provided, ensure your response fits naturally within it.";
  if (personalInstructions) {
    systemInstruction += ` Important User Preferences to follow: "${personalInstructions}".`;
  }
  
  const prompt = `
User requested: ${userInput}
Existing context: ${context}

Generate only the markdown content.
`;

  return await callAiProxy(prompt, systemInstruction, model, onChunk);
};

export const chatWithAI = async (
  messages: ChatMessage[], 
  documentContext: string, 
  personalInstructions: string = "",
  model: string = 'mistral',
  onChunk?: (chunk: string) => void
): Promise<string> => {
  let systemInstruction = "You are a helpful AI writing partner in Ink & Quill. You help users refine their documents through conversation.";
  if (personalInstructions) {
    systemInstruction += ` Always follow these style preferences: "${personalInstructions}".`;
  }
  systemInstruction += `\n\nHere is the current document content for context:\n${documentContext}`;

  const formattedMessages = [
    { role: 'system', content: systemInstruction },
    ...messages.filter(m => m.role !== 'system').map(m => ({
      role: m.role === 'model' ? 'assistant' : m.role,
      content: m.parts[0].text,
      images: m.images
    }))
  ];

  try {
    const response = await fetch(`/api/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model,
        messages: formattedMessages,
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
  } catch (error) {
    console.error("AI Proxy Chat Error:", error);
    return `Error: ${error instanceof Error ? error.message : "Unable to reach AI service."}`;
  }
};
