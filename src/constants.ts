export interface Template {
  id: string;
  name: string;
  description: string;
  content: string;
}

export interface AppTheme {
  id: string;
  name: string;
  colors: {
    bg: string;
    sidebar: string;
    border: string;
    text: string;
    muted: string;
    accent: string;
  };
}

export interface AppFont {
  id: string;
  name: string;
  family: string;
}

export const FONTS: AppFont[] = [
  { id: 'sans', name: 'Inter (Sans)', family: '"Inter", sans-serif' },
  { id: 'serif', name: 'EB Garamond (Serif)', family: '"EB Garamond", serif' },
  { id: 'mono', name: 'JetBrains Mono', family: '"JetBrains Mono", monospace' },
  { id: 'readable', name: 'Merriweather', family: '"Merriweather", serif' },
];

export const THEMES: AppTheme[] = [
  {
    id: 'minimal',
    name: 'Minimal Light',
    colors: {
      bg: '#ffffff',
      sidebar: '#fafafa',
      border: '#e8e8e8',
      text: '#2c3e50',
      muted: '#95a5a6',
      accent: '#3498db',
    }
  },
  {
    id: 'midnight',
    name: 'Midnight Dark',
    colors: {
      bg: '#0f172a',
      sidebar: '#1e293b',
      border: '#334155',
      text: '#f8fafc',
      muted: '#94a3b8',
      accent: '#38bdf8',
    }
  },
  {
    id: 'solar',
    name: 'Warm Solar',
    colors: {
      bg: '#fdf6e3',
      sidebar: '#eee8d5',
      border: '#d5ccba',
      text: '#586e75',
      muted: '#93a1a1',
      accent: '#cb4b16',
    }
  },
  {
    id: 'nord',
    name: 'Arctic Nord',
    colors: {
      bg: '#eceff4',
      sidebar: '#e5e9f0',
      border: '#d8dee9',
      text: '#2e3440',
      muted: '#4c566a',
      accent: '#81a1c1',
    }
  },
  {
    id: 'forest',
    name: 'Evergreen Forest',
    colors: {
      bg: '#f0f4f0',
      sidebar: '#e3eae3',
      border: '#c8d4c8',
      text: '#2d332d',
      muted: '#6b7b6b',
      accent: '#4a7c44',
    }
  }
];

export const TEMPLATES: Template[] = [
  {
    id: 'meeting-notes',
    name: 'Meeting Notes',
    description: 'Structure for meeting agenda, attendees, and action items.',
    content: `# Meeting Notes: [Project Name]

**Date:** [Date]
**Time:** [Time]
**Location:** [Location/Zoom]

## 🎯 Objective
[What is the primary goal of this meeting?]

## 👥 Attendees
- [Name 1]
- [Name 2]

## 📝 Agenda
1. [Agenda Item 1]
2. [Agenda Item 2]

## 📌 Discussion Points
- **Point A:** [Details]
- **Point B:** [Details]

## ✅ Action Items
- [ ] [Task 1] (@Assignee)
- [ ] [Task 2] (@Assignee)

## 💡 Key Decisions
- [Decision 1]
`,
  },
  {
    id: 'resume',
    name: 'Professional Resume',
    description: 'Clean Markdown resume format with sections for experience.',
    content: `# [Your Name]
[City, State] | [Phone Number] | [Email] | [LinkedIn/Portfolio]

## 💼 Professional Summary
[Highly motivated professional with X years of experience in...]

## 🛠️ Technical Skills
- **Languages:** [JavaScript, TypeScript, Python]
- **Frameworks:** [React, Node.js, Tailwind]
- **Tools:** [Git, Docker, VS Code]

## 📈 Work Experience

### [Job Title] | [Company Name]
*[Date From] – [Date To]*
- [Accomplishment 1: Improved performance by X%]
- [Accomplishment 2: Led a team of 5 developers...]

### [Job Title] | [Company Name]
*[Date From] – [Date To]*
- [Accomplishment 1]
- [Accomplishment 2]

## 🎓 Education
### [Degree Name]
*[University Name], [Graduation Year]*

## 🌟 Projects
- **[Project Name]:** [Short description of your contribution]
`,
  },
  {
    id: 'blog-post',
    name: 'Blog Post Draft',
    description: 'Structure for a well-organized technical blog post.',
    content: `# [Engaging Blog Post Title]

> **Subtitle:** [A short one-liner summarizing the post]

---

![Header Image](https://picsum.photos/seed/blog/1200/600)

## 📖 Introduction
[Start with a hook. Why does this matter? What problem are we solving?]

## 💡 The Core Concept
[Deep dive into the main topic here.]

\`\`\`javascript
// Example code snippet
const feature = "Awesome";
console.log(\`This is \${feature}!\`);
\`\`\`

## 🚀 Key Takeaways
- **First point:** [Details]
- **Second point:** [Details]

## 🏁 Conclusion
[Wrap up your thoughts and provide a call to action.]

---

*Thanks for reading! If you enjoyed this post, feel free to share it.*
`,
  },
  {
    id: 'project-readme',
    name: 'Project README',
    description: 'Standard README for open-source or private projects.',
    content: `# [Project Name]

![License](https://img.shields.io/badge/license-MIT-blue.svg)

[Brief 1-2 sentence description of what this project does.]

## ✨ Features
- [Feature A]
- [Feature B]

## 🚀 Getting Started

### Prerequisites
- [Node.js v18+]
- [npm/yarn]

### Installation
\`\`\`bash
npm install
npm run dev
\`\`\`

## 🛠️ Tech Stack
- [React]
- [Vite]
- [Tailwind CSS]

## 🤝 Contributing
Contributions are welcome! Please open an issue or submit a PR.

## 📄 License
This project is licensed under the MIT License.
`,
  },
  {
    id: 'uml-diagram',
    name: 'Architectural Diagram (UML)',
    description: 'Render diagrams from code using Mermaid and PlantUML.',
    content: `# Architectural Diagrams

Ink & Quill supports rendering UML diagrams directly from code blocks using Kroki.

## 🧜‍♂️ Mermaid Diagram
A simple sequence diagram for user authentication.

\`\`\`mermaid
sequenceDiagram
    User->>App: Clicks Login
    App->>AI_Studio: Requests Auth
    AI_Studio-->>App: Returns Token
    App-->>User: Redirects to Editor
\`\`\`

## 🌳 PlantUML Diagram
A class diagram example for a messaging system.

\`\`\`plantuml
@startuml
class User {
  String name
  String email
}
class Message {
  String text
  Date timestamp
}
User "1" *-- "many" Message : sends
@enduml
\`\`\`

## 🧠 Mind Map
Organize your thoughts with Mermaid mindmaps.

\`\`\`mermaid
mindmap
  root((Ink & Quill))
    Features
      Markdown
      AI Assistant
      UML Rendering
    Design
      Minimalist
      Fast
      Reliable
\`\`\`
`,
  },
];
