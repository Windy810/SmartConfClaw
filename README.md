# 🦐 SmartConf Claw 

> **Your AI Academic Co-Pilot.** > Built for the OpenClaw Agent Hackathon.

**SmartConf Claw** is an AI-powered desktop agent designed for researchers, PhD students, and data scientists. It runs quietly in the background during online academic conferences (e.g., CVPR, NeurIPS), transforming high-density presentations into a structured, interactive knowledge base.

![SmartConf Claw Demo](placeholder-for-your-demo-image-or-gif.gif) 
*(Note: Replace with your actual screenshot or demo GIF)*

## ✨ Key Features

* 🎥 **Smart Capture & Auto-Sync:** Select a screen region to capture. The agent intelligently detects PPT slide changes and perfectly aligns the presentation screenshots with the real-time audio transcript (ASR).
* 🧠 **Intelligent Summaries & Annotations:** Automatically generates chapter summaries and extracts complex academic concepts (e.g., *NeRF, Mixture of Experts*), providing instant definitions via hover tooltips to lower the learning curve.
* 📚 **Automated Literature Retrieval:** Based on the session's context, the agent automatically searches and compiles a list of related top-tier papers and industry blogs for extended reading.
* 🕸️ **Interactive Knowledge Graph:** Breaks down linear notes! It extracts methods, datasets, metrics, and authors across multiple sessions, weaving them into a visual, clickable React Flow graph.
* ⚔️ **Q&A Simulator:** Turns passive listening into active preparation. The agent acts as a strict reviewer, generating tough interview questions based on the presentation to help you practice for your thesis defense.
* 🔒 **Privacy-First & Local Inference:** Built-in support for local ASR (`whisper.cpp`) and local on-device LLMs. Keep your unreleased research data strictly on your own machine.

## 🛠️ Tech Stack

* **Frontend:** React 18, TypeScript, TailwindCSS, Shadcn/ui
* **Desktop Core:** Tauri 2.0 (Rust)
* **AI & Workflow:** OpenClaw Agent Framework
* **Visualization:** React Flow
* **State Management:** Zustand

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+)
- [Rust](https://www.rust-lang.org/tools/install)
- OS-specific dependencies for Tauri (see [Tauri Setup Guide](https://tauri.app/v1/guides/getting-started/prerequisites))

### Installation

1. Clone the repository:
   ```bash
   git clone [https://github.com/yourusername/smartconf-claw.git](https://github.com/yourusername/smartconf-claw.git)
   cd smartconf-claw
   ```

2. Install frontend dependencies:
   ```bash
   npm install
   ```

3. Run the application in development mode:
   ```bash
   npm run tauri dev
   ```

## ⚙️ Configuration

To use the AI features, navigate to the **Settings** tab in the app:
1. Choose your preferred LLM provider (OpenAI, Anthropic, or Local).
2. Enter your API keys (if using cloud providers).
3. Configure your screen capture and audio loopback preferences.

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to check the [issues page](https://github.com/yourusername/smartconf-claw/issues).

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---
