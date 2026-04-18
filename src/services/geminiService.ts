import { GoogleGenAI } from "@google/genai";

let aiInstance: GoogleGenAI | null = null;

const getAI = () => {
  if (!aiInstance) {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not set in the environment.");
    }
    aiInstance = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return aiInstance;
};

export type AIAssistantAction = 'improve' | 'fix-grammar' | 'shorten' | 'expand' | 'tone-professional' | 'tone-casual' | 'tone-creative' | 'generate-outline' | 'expand-outline' | 'summarize' | 'suggest-title';

export const processAIAction = async (text: string, action: AIAssistantAction, personalInstructions: string = ""): Promise<string> => {
  const ai = getAI();
  
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
    case 'tone-professional':
      systemInstruction += "Rewrite the following text in a professional, formal tone suitable for business communication.";
      prompt = `Make this professional:\n\n${text}`;
      break;
    case 'tone-casual':
      systemInstruction += "Rewrite the following text in a casual, friendly, and conversational tone.";
      prompt = `Make this casual:\n\n${text}`;
      break;
    case 'tone-creative':
      systemInstruction += "Rewrite the following text in a creative and engaging tone.";
      prompt = `Make this creative:\n\n${text}`;
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

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      systemInstruction,
    },
  });

  return response.text.trim();
};

export const generateContentFromPrompt = async (userInput: string, context: string = "", personalInstructions: string = ""): Promise<string> => {
  const ai = getAI();
  
  let systemInstruction = "You are an expert content creator. Generate high-quality Markdown content based on the user's prompt. If context is provided, ensure your response fits naturally within it.";
  if (personalInstructions) {
    systemInstruction += ` Important User Preferences to follow: "${personalInstructions}".`;
  }
  
  const prompt = `
User requested: ${userInput}
Existing context: ${context}

Generate only the markdown content.
`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      systemInstruction,
    },
  });

  return response.text.trim();
};
