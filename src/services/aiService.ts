/**
 * AI Service for interacting with the local Ollama instance via server proxy
 */

export type AIAssistantAction = 'improve' | 'fix-grammar' | 'shorten' | 'expand' | 'generate-outline' | 'expand-outline' | 'summarize' | 'suggest-title';

const callAiProxy = async (prompt: string, system?: string): Promise<string> => {
  const response = await fetch('/api/ai/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prompt, system }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to generate content");
  }

  const data = await response.json();
  return data.text;
};

export const processAIAction = async (text: string, action: AIAssistantAction, personalInstructions: string = ""): Promise<string> => {
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

  return await callAiProxy(prompt, systemInstruction);
};

export const generateContentFromPrompt = async (userInput: string, context: string = "", personalInstructions: string = ""): Promise<string> => {
  let systemInstruction = "You are an expert content creator. Generate high-quality Markdown content based on the user's prompt. If context is provided, ensure your response fits naturally within it.";
  if (personalInstructions) {
    systemInstruction += ` Important User Preferences to follow: "${personalInstructions}".`;
  }
  
  const prompt = `
User requested: ${userInput}
Existing context: ${context}

Generate only the markdown content.
`;

  return await callAiProxy(prompt, systemInstruction);
};
