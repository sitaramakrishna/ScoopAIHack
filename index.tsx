import { GoogleGenAI, Session } from '@google/genai';
import { LitElement } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { initSession, submitTextMessage } from './src/api';
import { fadeAudio, getAudioInputDevices, startRecording, stopRecording } from './src/audio';
import { initAuth, loginWithEmailLink, loginWithGoogle } from './src/auth';
import {
  closeActivePopup,
  handleCancelCall,
  handleListenerClick,
  toggleFavoriteListener,
} from './src/handlers/marketplace';
import {
  handleContinueSession,
  handleContinueSessionFromWarning,
  handleEndSessionFromIdle,
  handleEndSessionFromWarning,
  handleResumeSession,
  handleStartNewSession,
  reset,
  saveCurrentSessionState,
} from './src/handlers/session';
import {
  closeSummary,
  closeVolumeControl,
  handleAudioDeviceChange,
  handleDeleteSession,
  handleEmbodimentToggle,
  handleFeedbackRating,
  handleFeedbackText,
  handleMusicVolumeChange,
  handleShareSummary,
  handleSpeechRateChange,
  handleTextInput,
  handleVolumeChange,
  nextTutorialStep,
  prevTutorialStep,
  selectSession,
  submitFeedback,
  toggleAboutModal,
  toggleBackgroundMusic,
  toggleHistory,
  toggleInputMode,
  toggleSettingsModal,
  togglePricingModal,
  toggleVisualizer,
} from './src/handlers/ui';
import { initializeApp } from './src/initialize';
import {
  addListenersToMap,
  attemptAutoConnect,
  createAndRenderMap,
  loadGoogleMapsScript,
} from './src/map';
import { clearUnfinishedSession, loadPastSessions, loadUserSettings } from './src/state';
import { styles } from './src/styles';
import { render } from './src/template';
import { renderTutorial } from './src/tutorial';
import type {
  AppConfig,
  ConnectionState,
  ConversationEntry,
  Listener,
  SavedSessionState,
  SessionData,
} from './src/types';
import './visual-3d';
import { crisisKeywords, defaultListener } from './src/constants';
import { trackEvent } from './src/analytics';
import { User } from 'firebase/auth';

declare global {
  interface Window {
    initMap: () => void;
    gm_authFailure: () => void;
  }
}
declare namespace google {
  namespace maps {
    class OverlayView {
      [key: string]: any;
      setMap(map: google.maps.Map | null): void;
      getPanes(): any;
      getProjection(): any;
    }
    class LatLng {
      constructor(lat: number, lng: number);
    }
    class LatLngBounds {
      constructor(sw?: google.maps.LatLng | null, ne?: google.maps.LatLng | null);
      extend(point: google.maps.LatLng): void;
      isEmpty(): boolean;
    }
    class Map {
      constructor(mapDiv: Element | null, opts?: any);
      addListener(eventName: string, handler: Function): void;
      panTo(latLng: google.maps.LatLng): void;
      getZoom(): number;
      setZoom(zoom: number): void;
      fitBounds(bounds: google.maps.LatLngBounds): void;
    }
    const event: any;
  }
}

// --- CONFIGURATION ---
const CONFIG: AppConfig = {
  mode: 'marketplace',
  showTutorial: true,
  enableMapPopups: true,
  enableTextInputToggle: false,
  enableEmbodiment: false,
  autoConnectToNearest: false,
  enableAvatarGeneration: false,
  enableAiTranscription: true,
};

@customElement('gdm-live-audio')
export class GdmLiveAudio extends LitElement {
  static styles = styles;
  public config = CONFIG;
  readonly MAX_TEXT_INPUT_LENGTH = 1000;

  // App State
  @state() isRecording = false;
  @state() status = '';
  @state() error = '';
  @state() crisisModeActive = false;
  @state() audioInputDevices: MediaDeviceInfo[] = [];
  @state() selectedAudioDeviceId = '';
  @state() conversationHistory: ConversationEntry[] = [];
  @state() currentInputTranscription = '';
  @state() currentOutputTranscription = '';
  @state() summary = '';
  @state() showSummary = false;
  @state() isSummarizing = false;
  @state() visualizerEnabled = true;
  @state() inputMode: 'audio' | 'text' = 'audio';
  @state() textInput = '';
  @state() isAwaitingTextResponse = false;
  @state() empathyTrigger = 0;
  @state() emailForSignIn = '';
  @state() user: User | null = null;
  @state() isLoggedIn = false;

  // Local State
  @state() isInitializing = true;
  @state() isMobile = window.innerWidth < 768;

  // Marketplace & Connection State
  @state() connectionState: ConnectionState = 'idle';
  @state() listeners: Listener[] = [];
  @state() selectedListener: Listener | null = null;
  @state() searchQuery = '';
  @state() mobileSearchQuery = '';
  @state() searchActive = false;
  @state() showAvailableOnly = true;
  @state() listenerTypeFilter: 'All' | 'AI' | 'Human' = 'All';
  callingTimeout: number | null = null;
  @state() generatingAvatarFor: string | null = null;

  // Session History State
  @state() pastSessions: SessionData[] = [];
  @state() showHistory = false;
  @state() selectedSession: SessionData | null = null;
  @state() isLoadingHistory = true;
  @state() historyError = '';
  @state() isClearingHistory = false;

  // Feedback State
  @state() isSubmittingFeedback = false;
  @state() currentSessionForFeedback: SessionData | null = null;
  @state() feedbackGiven = false;
  @state() feedbackRating = 0;
  @state() feedbackText = '';
  @state() shareStatus: 'idle' | 'copied' = 'idle';

  // Tutorial State
  @state() showTutorial = true;
  @state() tutorialStep = 1;

  // Session Limit State
  @state() sessionsUsed = 0;
  @state() sessionLimitReached = false;

  // Idle Detection State
  @state() showIdlePrompt = false;
  @state() idleCountdown = 30;

  // Session Duration Warning State
  @state() showSessionWarning = false;
  @state() sessionWarningCountdown = 60;
  @state() sessionTimeRemaining: number | null = null;

  // UI State
  @state() showVolumeControl = false;
  @state() showSettingsModal = false;
  @state() showAboutModal = false;
  @state() showLoginPrompt = false;
  @state() showPricingModal = false;
  @state() speechRate = 1.0; // Default speed
  @state() outputVolume = 1.0;
  @state() embodimentEnabled = false;

  // Background Music State
  @state() musicVolume = 0.6;
  backgroundMusicElement: HTMLAudioElement | null = null;
  @state() isMusicFading = false;
  @state() isMusicPlaying = true;

  // Auto-save & Resume state
  @state() showResumePrompt = false;
  @state() isAutoSaving = false;
  savedSessionState: SavedSessionState | null = null;
  autoSaveTimer: number | null = null;

  // Google Map State
  @state() mapInitialized = false;
  map: any; // google.maps.Map
  mapMarkers: any[] = []; // CustomMarker[]
  markerClusterer: any;
  CustomMarkerClass: any;
  CustomMarkerPopupClass: any;
  activePopup: any | null = null;
  @state() selectedMarker: any | null = null;
  @state() mapError = '';
  @state() locationPermissionDenied = false;
  @state() userLocation: {lat: number; lng: number} | null = null;

  // API & Audio Internals
  client: GoogleGenAI;
  sessionPromise: Promise<Session>;
  inputAudioContext = new (window.AudioContext ||
    (window as any).webkitAudioContext)({sampleRate: 16000});
  outputAudioContext = new (window.AudioContext ||
    (window as any).webkitAudioContext)({sampleRate: 24000});
  @state() inputNode = this.inputAudioContext.createGain();
  @state() outputNode = this.outputAudioContext.createGain();
  nextStartTime = 0;
  mediaStream: MediaStream;
  sourceNode: AudioBufferSourceNode;
  scriptProcessorNode: ScriptProcessorNode;
  sources = new Set<AudioBufferSourceNode>();
  ringingSources: OscillatorNode[] = [];
  ringingGainNode: GainNode | null = null;
  idleTimer: number | null = null;
  idleCountdownTimer: number | null = null;
  lastSoundTime = 0;
  sessionTimer: number | null = null;
  sessionWarningTimer: number | null = null;
  sessionWarningCountdownTimer: number | null = null;
  sessionDisplayTimer: number | null = null;
  handleBeforeUnload = () => saveCurrentSessionState(this);
  empathyRegex: RegExp;
  crisisRegex: RegExp;
  @state() autoConnectAttempted = false;
  private speechSynthesisUtterance: SpeechSynthesisUtterance | null = null;
  private speechSynthesisKeepAliveInterval: number | null = null;

  private resizeObserver: ResizeObserver;

  handleGlobalKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (this.showSummary) this.closeSummary();
      if (this.showHistory) this.toggleHistory();
      if (this.showSettingsModal) this.toggleSettingsModal();
      if (this.showAboutModal) this.toggleAboutModal();
      if (this.showLoginPrompt) this.showLoginPrompt = false;
      if (this.showPricingModal) this.togglePricingModal();
    }
  };

  constructor() {
    super();
    this.crisisRegex = new RegExp(crisisKeywords.join('|'), 'i');
    this.resizeObserver = new ResizeObserver(entries => {
        for (let entry of entries) {
            const { width } = entry.contentRect;
            this.isMobile = width < 768;
        }
    });
  }

  async connectedCallback() {
    super.connectedCallback();
    this.resizeObserver.observe(this);
    trackEvent('page_view');
    initAuth(this);
    this.startSpeechSynthesisKeepAlive();
    if (this.showTutorial) {
      // The tutorial will be shown, and the app will be initialized after it's finished.
    } else {
      await initializeApp(this);
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.resizeObserver.unobserve(this);
    window.removeEventListener('click', this.boundCloseVolumeControl);
    window.removeEventListener('beforeunload', this.handleBeforeUnload);
    window.removeEventListener('keydown', this.handleGlobalKeyDown);
    if (this.callingTimeout) clearTimeout(this.callingTimeout);
    this.stopRingingSound();
    this.clearSessionDisplayTimer();
    window.speechSynthesis.cancel();
    this.stopSpeechSynthesisKeepAlive();
    this.backgroundMusicElement?.pause();
  }

  updated(changedProperties: Map<string, unknown>) {
    if (changedProperties.has('isMobile')) {
        if (this.isMobile) {
            this.classList.add('mobile-view');
        } else {
            this.classList.remove('mobile-view');
        }
    }
    if (changedProperties.has('user') && this.user) {
        this.isLoggedIn = !this.user.isAnonymous;
    }

    if (
      changedProperties.has('isInitializing') &&
      !this.isInitializing &&
      !this.autoConnectAttempted
    ) {
      this.autoConnectAttempted = true;
      if (
        this.config.mode === 'marketplace' &&
        this.connectionState === 'idle'
      ) {
        attemptAutoConnect(this);
      }
    }

    if (
      this.config.mode === 'marketplace' &&
      changedProperties.has('connectionState') &&
      this.connectionState === 'idle' &&
      (changedProperties.get('connectionState') === 'calling' ||
        changedProperties.get('connectionState') === 'connected') &&
      this.mapInitialized
    ) {
      setTimeout(() => {
        createAndRenderMap(this);
      }, 0);
    }

    if (
      this.config.mode === 'marketplace' &&
      this.mapInitialized &&
      (changedProperties.has('listeners') ||
        changedProperties.has('searchQuery'))
    ) {
      this.closeActivePopup();
      addListenersToMap(this);
    }
  }

  get favoriteListeners(): Listener[] {
    return this.listeners.filter(listener => listener.isFavorite);
  }

  get filteredListeners(): Listener[] {
    const query = (this.isMobile ? this.mobileSearchQuery : this.searchQuery)
      .toLowerCase()
      .trim();

    let filtered = this.listeners;

    if (this.showAvailableOnly) {
      filtered = filtered.filter((listener) => listener.online === true);
    }

    if (this.listenerTypeFilter !== 'All') {
      filtered = filtered.filter((listener) => listener.type === this.listenerTypeFilter.toLowerCase());
    }

    if (query) {
      trackEvent('search', { search_term: query });
      filtered = filtered.filter(
        (listener) =>
          listener.name.toLowerCase().includes(query) ||
          (listener.type &&
            listener.type.toLowerCase().includes(query))
      );
    }

    return filtered;
  }

  // --- Methods are now wrappers for imported functions ---

  // Login Handlers
  handleEmailInput = (e: Event) => {
    this.emailForSignIn = (e.target as HTMLInputElement).value;
    this.requestUpdate();
  };

  handleEmailLogin = () => {
    if (this.emailForSignIn) {
      loginWithEmailLink(this, this.emailForSignIn);
    }
  };

  handleGoogleSignIn = () => {
    loginWithGoogle(this);
  }

  // Marketplace Handlers
  handleListenerClick = (listener: Listener, marker: any) =>
    handleListenerClick(this, listener, marker);
  handleCancelCall = () => handleCancelCall(this);
  toggleFavoriteListener = (listener: Listener) =>
    toggleFavoriteListener(this, listener);
  closeActivePopup = () => closeActivePopup(this);
  toggleSearch = () => {
      this.searchActive = !this.searchActive;
      trackEvent('toggle_search', { active: this.searchActive });
      if (!this.searchActive) {
          this.searchQuery = '';
      }
  };
  rateListener = (listener: Listener, rating: number) => {
      trackEvent('rate_listener', { listener_id: listener.id, rating });
      // TODO: Persist this rating to your backend
      this.listeners = this.listeners.map(l =>
          l.id === listener.id ? { ...l, rating } : l
      );
  };
  handleListenerTypeFilterChange = (type: 'All' | 'AI' | 'Human') => {
    this.listenerTypeFilter = type;
  }

  // Session Handlers
  reset = () => reset(this);
  handleResumeSession = () => handleResumeSession(this);
  handleStartNewSession = () => handleStartNewSession(this);
  handleContinueSession = () => handleContinueSession(this);
  handleEndSessionFromIdle = () => handleEndSessionFromIdle(this);
  handleContinueSessionFromWarning = () =>
    handleContinueSessionFromWarning(this);
  handleEndSessionFromWarning = () => handleEndSessionFromWarning(this);
  saveCurrentSessionState = () => saveCurrentSessionState(this);
  clearUnfinishedSession = () => clearUnfinishedSession(this);

  // UI Handlers
  closeSummary = () => closeSummary(this);
  toggleHistory = () => toggleHistory(this);
  selectSession = (session: SessionData) => selectSession(this, session);
  handleDeleteSession = (sessionId: string) =>
    handleDeleteSession(this, sessionId);
  clearHistory = () => this.isClearingHistory;
  handleFeedbackRating = (rating: number) => handleFeedbackRating(this, rating);
  handleFeedbackText = (e: Event) => handleFeedbackText(this, e);
  submitFeedback = () => submitFeedback(this);
  handleShareSummary = () => handleShareSummary(this);
  nextTutorialStep = () => nextTutorialStep(this);
  prevTutorialStep = () => prevTutorialStep(this);
  finishTutorial = async () => {
    this.showTutorial = false;
    await initializeApp(this);
  };
  toggleVisualizer = () => toggleVisualizer(this);
  toggleInputMode = () => toggleInputMode(this);
  handleTextInput = (e: Event) => handleTextInput(this, e);
  handleSearchInput = (e: Event) => {
    this.searchQuery = (e.target as HTMLInputElement).value;
  };
  handleMobileSearchInput = (e: Event) => {
    this.mobileSearchQuery = (e.target as HTMLInputElement).value;
  };
  toggleShowAvailableOnly = () => {
    this.showAvailableOnly = !this.showAvailableOnly;
  }
  submitTextMessage = () => submitTextMessage(this);
  closeVolumeControl = (event?: Event) => closeVolumeControl(this, event);
  toggleSettingsModal = () => toggleSettingsModal(this);
  togglePricingModal = () => togglePricingModal(this);
  toggleAboutModal = () => toggleAboutModal(this);
  handleSpeechRateChange = (e: Event) => handleSpeechRateChange(this, e);
  handleEmbodimentToggle = () => handleEmbodimentToggle(this);
  handleVolumeChange = (e: Event) => handleVolumeChange(this, e);
  handleAudioDeviceChange = (e: Event) => handleAudioDeviceChange(this, e);
  handleMusicVolumeChange = (e: Event) => handleMusicVolumeChange(this, e);
  toggleBackgroundMusic = () => toggleBackgroundMusic(this);
  loadPastSessions = () => loadPastSessions(this);
  loadUserSettings = () => loadUserSettings(this);
  addListenersToMap = () => addListenersToMap(this);
  boundCloseVolumeControl = this.closeVolumeControl.bind(this);

  // Core Audio Logic (delegated)
  startRecording = () => startRecording(this)
  stopRecording = (shouldSummarize = true) => stopRecording(this, shouldSummarize);
  startSpeechSynthesisKeepAlive() {
    this.speechSynthesisKeepAliveInterval = window.setInterval(() => {
      window.speechSynthesis.pause();
      window.speechSynthesis.resume();
    }, 5000);
  }

  stopSpeechSynthesisKeepAlive() {
    if (this.speechSynthesisKeepAliveInterval) {
      clearInterval(this.speechSynthesisKeepAliveInterval);
      this.speechSynthesisKeepAliveInterval = null;
    }
  }

  playRingingSound() {
    this.stopRingingSound();
    this.outputAudioContext.resume();
    this.ringingGainNode = this.outputAudioContext.createGain();
    this.ringingGainNode.gain.setValueAtTime(
      0,
      this.outputAudioContext.currentTime,
    );
    this.ringingGainNode.gain.linearRampToValueAtTime(
      0.3,
      this.outputAudioContext.currentTime + 0.1,
    );
    this.ringingGainNode.connect(this.outputAudioContext.destination);

    const oscillator = this.outputAudioContext.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(
      440,
      this.outputAudioContext.currentTime,
    );
    oscillator.connect(this.ringingGainNode);

    const oscillator2 = this.outputAudioContext.createOscillator();
    oscillator2.type = 'sine';
    oscillator2.frequency.setValueAtTime(
      480,
      this.outputAudioContext.currentTime,
    );
    oscillator2.connect(this.ringingGainNode);

    const patternStartTime = this.outputAudioContext.currentTime;
    oscillator.start(patternStartTime);
    oscillator2.start(patternStartTime);

    const ringDuration = 2;
    const silenceDuration = 2;
    const patternDuration = ringDuration + silenceDuration;

    const scheduleRing = (time: number) => {
      this.ringingGainNode!.gain.setTargetAtTime(0.3, time, 0.01);
      this.ringingGainNode!.gain.setTargetAtTime(0, time + ringDuration, 0.01);
    };

    for (let i = 0; i < 5; i++) {
      scheduleRing(patternStartTime + i * patternDuration);
    }

    this.ringingSources = [oscillator, oscillator2];
  }

  stopRingingSound() {
    this.ringingSources.forEach((source) => {
      try {
        source.stop();
        source.disconnect();
      } catch (e) {
        // It might have already stopped.
      }
    });
    this.ringingSources = [];

    if (this.ringingGainNode) {
      try {
        this.ringingGainNode.gain.cancelScheduledValues(
          this.outputAudioContext.currentTime,
        );
        this.ringingGainNode.disconnect();
      } catch (e) {
        // Might already be disconnected
      }
      this.ringingGainNode = null;
    }
  }

  clearSessionDisplayTimer() {
    if (this.sessionDisplayTimer) {
      clearInterval(this.sessionDisplayTimer);
      this.sessionDisplayTimer = null;
    }
  }

  render() {
    if (this.showTutorial) {
      return renderTutorial(this);
    }
    if(this.config.mode === 'marketplace'){
        this.classList.add('marketplace-mode');
    }else{
        this.classList.remove('marketplace-mode');
    }
    return render(this);
  }
}


declare global {
  interface HTMLElementTagNameMap {
    'gdm-live-audio': GdmLiveAudio;
  }
}
