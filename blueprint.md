# Project Blueprint: Calm Aura

## 1. Core Concept

**Calm Aura** is a web-based application designed to provide users with a safe and non-judgmental space to talk about their feelings. The primary interaction is with an empathetic AI listener, available 24/7. The core goal is to make users feel heard, validated, and less alone.

## 2. Key Features

- **AI-Powered Empathetic Listener**: The central feature is a conversational AI trained to be a supportive and understanding listener.
- **Real-Time Conversation**: Users can engage in a text-based conversation with the AI in real-time.
- **Interactive World Map**: A "Marketplace" mode allows users to see available AI and human listeners distributed geographically on a world map.
- **Listener Profiles**: Users can click on listeners on the map to view basic information and initiate a call.
- **Interactive Tutorial**: An animated, full-screen tutorial introduces first-time users to the app's core features.
- **Session History**: Users can view a history of their past conversations.
- **User Location & Auto-Connect**: The application can use the user's location to find and suggest the nearest available listener.
- **Responsive Design**: The interface is designed to work across various devices, from mobile phones to desktops.

## 3. Technical Architecture

- **Frontend Framework**: The application is built using modern web components, likely with a library like Lit, as indicated by the use of `lit` in the codebase.
- **Language**: The entire frontend codebase is written in TypeScript (`.ts` and `.tsx` files), providing type safety and better code organization.
- **Styling**: CSS-in-JS is used for styling, with styles defined in TypeScript files using the `css` tag from Lit. This modularizes styles and collocates them with their respective components.
- **Mapping**: Google Maps JavaScript API is used to render the interactive map, including custom markers, popups, and marker clustering.
- **Build/Deployment**: The project seems to be set up for deployment on Firebase Hosting.

## 4. Codebase Structure

The project's source code is organized within the `src/` directory:

- `index.tsx`: The main entry point of the application, likely containing the primary web component definition (`GdmLiveAudio`).
- `main.ts`: Handles the application's initialization.
- `api.ts`: Handles communication with backend services.
- `firebase.ts`: Contains the configuration and initialization logic for Firebase services.
- `state.ts`: Manages the application's global state.
- `template.ts`: Defines the main HTML structure of the application, dynamically rendering different views based on the application state.
- `constants.ts`: Stores shared constants like default user IDs and configurations.

### 4.1. Components (`src/components/`)

This directory contains the definitions for reusable UI components:

- `marketplace.ts`: Renders the main map view, the listener search, and the "calling" screen.
- `session-view.ts`: Renders the main conversation interface where the user interacts with the listener.
- `modals.ts`: Defines various modal dialogs used in the app, such as the "About" modal.
- `common.ts`: Likely contains common, shared UI elements.

### 4.2. Handlers (`src/handlers/`)

This directory is responsible for user interactions and business logic:

- `session.ts`: Manages the logic within a conversation session.
- `marketplace.ts`: Handles interactions on the map, like selecting a listener.
- `ui.ts`: Manages general UI state changes.

### 4.3. Styles (`src/styles/`)

This directory contains the CSS styles for the application, written in TypeScript:

- `base.ts`: Defines the global, foundational styles for the application.
- `marketplace.ts`: Styles for the map, listener markers, and popups.
- `session.ts`: Styles for the chat interface.
- `header.ts`: Styles for the header component.
- `tutorial.ts`: Contains the CSS for the introductory tutorial modal.
- `responsive.ts`: Contains media queries to handle different screen sizes.

## 5. Current Issue: Layout Problem on Wide Desktops

- **Symptom**: A white strip appears at the top of the page on extra-wide desktop screens when viewing the map.
- **Root Cause Analysis**: My initial investigation suggests that a `max-width` property is being applied to a container element at wider screen resolutions. This prevents the map container from stretching to the full width of the viewport, creating empty space (the white strip). The responsible style is likely in a file I haven't inspected yet, or within a `min-width` media query that I have overlooked.
- **Next Steps**: I will now perform a more thorough investigation of all style-related files to locate and remove this `max-width` constraint, ensuring the map container fills the entire viewport on all screen sizes.
