# Technical Documentation: Calm Aura

## 1. Project Overview

Calm Aura is an interactive web application that uses the Google Gemini Live Audio API to create a real-time, voice-based conversational experience. The application's AI is programmed with a specific system instruction to act as an empathetic, non-judgmental listener. The user's voice and the AI's responses are visualized through an immersive 3D orb powered by Three.js.

The core goal is to provide a safe and private space for users to talk, with all session data stored securely in the cloud.

---

## 2. Features

*   **Real-time Voice Conversation:** Low-latency, bidirectional audio streaming with the Gemini Live API.
*   **Interactive Tutorial:** An animated, full-screen tutorial introduces first-time users to the app's core features.
*   **Marketplace UI:** A Google Maps-based interface to select from various AI and human listeners distributed globally. Features configurable interactive markers that can either display a detail popup on click or initiate a call directly.
*   **Favorite Listeners:** Users can mark listeners as favorites. Favorited listeners are visually highlighted on the map and prioritized for easier access. Favorites are saved to the user's Firebase account.
*   **Listener Ratings:** Users can rate listeners on a 5-star scale directly from the map popup.
*   **Unique Listener Introductions:** Each AI listener has a unique, pre-defined introductory message that is played using the browser's text-to-speech engine upon selection, giving them distinct personalities.
*   **Regional Accent Support:** AI listeners have distinct regional accents (US, British, Australian, Indian English) based on their configured location, providing a more diverse and personalized experience.
*   **Interactive 3D Audio Visualizer:** A central orb and particle system that reacts dynamically to the user's input and the AI's output audio frequencies.
*   **Auditory Cues:** Subtle sound effects confirm the start and stop of a session, providing non-visual feedback.
*   **Empathetic AI Persona:** A carefully crafted system prompt ensures the AI listener is supportive, validating, and refrains from giving advice.
*   **Embodiment Personality:** An optional setting that instructs the AI to speak with a more distinct personality, incorporating subtle vocal tics and a more pronounced emotional tone for a deeper sense of presence.
*   **Session Management:**
    *   30-minute session timer with on-screen countdown.
    *   Idle detection prompts the user if there's a long silence.
    *   Session limit of three free sessions per user.
*   **Post-Session Reflection:** An AI-generated summary is provided at the end of each session.
*   **Cloud-Synced Session History:** Users can review summaries and full transcripts of past sessions, which are stored in their Firebase account, allowing access from any device.
*   **User Feedback:** A 5-star rating and text feedback system for each session.
*   **Crisis Detection:** A built-in safety mechanism listens for keywords indicating severe distress, ends the session, and provides emergency contact information.
*   **Text Input Fallback:** A text-based input mode is available as an alternative to voice.
*   **User Settings & Help:**
    *   An "About & Help" modal, accessible from the header, explains the app's purpose, features, and privacy policies.
    *   Controls for AI playback speed, volume, and toggling the 3D visualizer.
*   **Auto-Save & Resume:**
    *   Interrupted sessions are saved automatically, and the user is prompted to resume upon returning.
    *   A visual indicator in the status bar briefly appears to confirm when the session is being auto-saved.
*   **Configurable Avatar Generation:** AI listener avatars can be generated on-demand. This feature is disabled by default and runs after a call is initiated to improve initial UI responsiveness.
*   **Map Performance Optimization:** The map uses the Google Maps Marker Clusterer to efficiently handle a large number of listeners without sacrificing performance.
*   **Mobile Optimization:** The app is optimized for mobile devices, with a responsive layout, improved touch interactions, and a cinematic zoom effect on the map.

---

## 3. Technology Stack

*   **Frontend Framework:** **LitElement** (a simple base class for creating fast, lightweight web components).
*   **Language:** **TypeScript**.
*   **AI & Audio API:** **`@google/genai`** for the Gemini Live API, a `gemini-2.5-flash-native-audio-preview-09-2025` model.
*   **Testing:** **Vitest** for unit and component testing, with **`@open-wc/testing`** for Lit-specific utilities.
*   **Text-to-Speech:** **Web Speech API** (`SpeechSynthesisUtterance`) for listener introductions.
*   **3D Graphics:** **Three.js** for the scene, camera, custom shaders, and post-processing effects (bloom).
*   **Mapping:** **Google Maps JavaScript API** for the listener marketplace view, with the **`@googlemaps/markerclusterer`** for optimization.
*   **Backend & Database:** **Firebase** (Firestore for data storage, Authentication for user management, Hosting for deployment, and Analytics for event tracking).
*   **Secret Management:** **`.env` file** for local development, with a `.gitignore` to prevent committing secrets to the repository. For production, secrets are managed through **Google Secret Manager**.
*   **Audio Processing:** **Web Audio API** (`AudioContext`, `AnalyserNode`) for capturing and analyzing audio frequency data to drive the visualizer.
*   **Styling:** Plain CSS within Lit's `css` template literal tag.

---

## 4. Architecture

This diagram illustrates the high-level architecture of the Calm Aura application, showing the relationship between the frontend components, browser APIs, and external backend services.

```mermaid
graph TD
    User[User] --> Browser;

    subgraph "Frontend: Browser"
        Browser[LitElement Web Components] --> UIs[UI Components: Marketplace, Session, Visuals];
        Browser -- Manages Audio --> WebAudio[Web Audio API];
        Browser -- Manages Speech --> WebSpeech[Web Speech API];
    end

    subgraph "Backend & Services"
        Browser -- API Calls --> Gemini[Google Gemini API];
        Browser -- Data Sync --> Firebase[Firebase Services];
        Browser -- Map Data --> GoogleMaps[Google Maps API];
    end

    subgraph "Firebase"
        Firebase --> Auth[Authentication];
        Firebase --> Firestore[Firestore: History & Prefs];
        Firebase --> Hosting[Hosting];
    end

    subgraph "Deployment & Secrets"
        Dev[Local Dev] --> Express[Express Server (.env)];
        Prod[Production] --> SecretManager[Google Secret Manager];
        Hosting -- Serves --> Browser;
    end

    style User fill:#c9f,stroke:#333,stroke-width:2px;
```

---

## 5. Core Conversation Flow (Gemini Live API)

The entire conversational experience is powered by the Gemini Live API. Here is a step-by-step breakdown of the data flow from user voice input to the AI's response:

1.  **Client Initialization (`initClient`):**
    *   The application initializes the Gemini Live API client using an API key. This client is used for all subsequent interactions with the API.

2.  **Session Initialization (`initSession`):**
    *   When a user starts a session, a real-time, bidirectional connection is established with the Gemini Live API using `component.client.live.connect`.
    *   The application specifies the AI model to be used (`gemini-2.5-flash-native-audio-preview-09-2025`) and provides a system instruction to set the AI's persona.

3.  **Real-time Audio Streaming and Transcription:**
    *   The user's speech is captured through the microphone and streamed to the Gemini Live API in real-time.
    *   The API processes this audio and sends back `inputTranscription` messages, which are displayed live in the UI.

4.  **AI Response Generation and Streaming:**
    *   The Gemini Live API processes the transcribed text and generates a response.
    *   This response is streamed back to the client in two forms:
        *   **Audio:** The API sends audio data (`inlineData`), which the client decodes and plays through the user's speakers.
        *   **Text:** The API also sends the `outputTranscription` of its own response, which is displayed on the screen in sync with the audio.

5.  **Turn Management and Conversation History:**
    *   The API sends a `turnComplete` message to signal the end of a conversational exchange.
    *   The client uses this message to update the conversation history, storing both the user's input and the AI's response.

6.  **Session Termination:**
    *   When the session ends, the connection to the Gemini Live API is closed.

---

## 6. File Structure (Modular Architecture)

The project is organized into a modular structure to separate concerns, making the codebase more maintainable and scalable.

```
.
├── index.html              # Main HTML entry point.
├── main.ts                 # Handles the application's initialization.
├── index.tsx               # Main Web Component (GdmLiveAudio). Manages state and lifecycle.
├── server.cjs              # Express server to serve static files and expose secrets.
├── visual-3d.ts            # The 3D visualizer Web Component.
├── utils.ts                # Core utilities (audio encoding/decoding).
├── analyser.ts             # Wrapper for the Web Audio AnalyserNode.
├── *-shader.ts             # GLSL shader code for 3D objects.
├── src/
│   ├── api.ts              # Handles all communication with the Gemini API.
│   ├── audio.ts            # Manages the audio pipeline (mic, recording, sounds).
│   ├── constants.ts        # Stores all application-wide constants and system prompts.
│   ├── firebase.ts         # Initializes and configures Firebase services.
│   ├── analytics.ts        # Manages all Firebase Analytics event tracking.
│   ├── secrets.ts          # Manages the loading of secrets for different environments.
│   ├── handlers/           # Contains all event handler functions for user interactions.
│   │   ├── marketplace.ts
│   │   ├── session.ts
│   │   └── ui.ts
│   ├── map.ts              # Encapsulates all Google Maps API logic.
│   ├── state.ts            # Manages loading/saving state from/to Firebase.
│   ├── styles.ts           # Global CSS styles for the main component.
│   ├── styles/
│   │   └── tutorial.ts     # Contains the CSS for the introductory tutorial modal.
│   ├── template.ts         # Main render function; acts as a UI router.
│   ├── types.ts            # TypeScript interface and type definitions.
│   └── components/
│       ├── common.ts       # Shared UI components (e.g., loader).
│       ├── marketplace.ts  # Renders the map and calling screen UI.
│       ├── modals.ts       # Renders all modal dialogs (summary, history, about, etc.).
│       └── session-view.ts # Renders the main UI for an active session.
├── test/
│   ├── audio.test.ts       # Unit tests for the audio pipeline.
│   ├── session.test.ts     # Unit tests for session management.
│   └── marketplace.test.ts # Unit tests for the marketplace UI.
└── metadata.json           # Project metadata and permission requests.
```

---

## 7. Deployment

The application is configured for easy deployment to **Firebase Hosting**.

### Secret Management

All API keys and secrets are stored in a `.env` file for local development. This file is included in the `.gitignore` to prevent it from being committed to the repository. For production, secrets are managed through **Google Secret Manager**.

### Configuration Files

*   **`firebase.json`**: Configures Firebase Hosting.
    *   `"public": "dist"`: Specifies that the `dist` directory (the output of the Vite build) should be deployed.
*   **`package.json`**: Contains the `deploy` and `test` scripts.
    *   `"deploy": "npm run build && firebase deploy --only hosting"`: This script builds the project and deploys the contents of the `dist` directory to Firebase Hosting.
    *   `"test": "vitest"`: Runs the unit tests.

### Deployment Process

To deploy the application, simply run the following command in your terminal:

```bash
npm run deploy
```

This will build the project and then deploy the build to Firebase Hosting.

### Testing

To run the unit tests, use the following command:

```bash
npm run test
```
