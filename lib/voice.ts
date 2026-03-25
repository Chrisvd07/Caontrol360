export interface VoiceRecognitionResult {
  transcript: string;
  confidence: number;
  isFinal: boolean;
}

export interface VoiceRecognitionOptions {
  language?: string;
  continuous?: boolean;
  interimResults?: boolean;
  onResult?: (result: VoiceRecognitionResult) => void;
  onError?: (error: string) => void;
  onEnd?: () => void;
}

class VoiceService {
  private recognition: SpeechRecognition | null = null;
  private synthesis: SpeechSynthesis | null = null;
  private isListening = false;

  constructor() {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        this.recognition = new SpeechRecognition();
      }
      this.synthesis = window.speechSynthesis;
    }
  }

  isSupported(): boolean {
    return this.recognition !== null;
  }

  isSynthesisSupported(): boolean {
    return this.synthesis !== null;
  }

  startListening(options: VoiceRecognitionOptions = {}): boolean {
    if (!this.recognition || this.isListening) return false;

    this.recognition.lang = options.language || 'es-DO';
    this.recognition.continuous = options.continuous || false;
    this.recognition.interimResults = options.interimResults || true;

    this.recognition.onresult = (event) => {
      const result = event.results[event.results.length - 1];
      const transcript = result[0].transcript;
      const confidence = result[0].confidence;
      const isFinal = result.isFinal;

      options.onResult?.({
        transcript,
        confidence,
        isFinal
      });
    };

    this.recognition.onerror = (event) => {
      console.error('[GastoFlow] Speech recognition error:', event.error);
      let errorMsg = 'Error en el micrófono';
      if (event.error === 'not-allowed') errorMsg = 'Permiso de micrófono denegado';
      if (event.error === 'network')     errorMsg = 'Error de red en reconocimiento de voz';
      if (event.error === 'no-speech')   errorMsg = 'No se detectó voz';
      
      options.onError?.(errorMsg);
      this.isListening = false;
    };

    this.recognition.onend = () => {
      this.isListening = false;
      options.onEnd?.();
    };

    try {
      this.recognition.start();
      this.isListening = true;
      return true;
    } catch (error: any) {
      console.error('[GastoFlow] Failed to start recognition:', error);
      options.onError?.(error.message || 'No se pudo iniciar el micrófono');
      return false;
    }
  }

  stopListening(): void {
    if (this.recognition && this.isListening) {
      this.recognition.stop();
      this.isListening = false;
    }
  }

  isCurrentlyListening(): boolean {
    return this.isListening;
  }

  speak(text: string, options: { lang?: string; rate?: number; pitch?: number } = {}): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.synthesis) {
        reject(new Error('Speech synthesis not supported'));
        return;
      }

      // Cancel any ongoing speech
      this.synthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = options.lang || 'es-DO';
      utterance.rate = options.rate || 1;
      utterance.pitch = options.pitch || 1;

      // Get Spanish voice if available
      const voices = this.synthesis.getVoices();
      const spanishVoice = voices.find(v => v.lang.startsWith('es'));
      if (spanishVoice) {
        utterance.voice = spanishVoice;
      }

      utterance.onend = () => resolve();
      utterance.onerror = (event) => reject(event.error);

      this.synthesis.speak(utterance);
    });
  }

  stopSpeaking(): void {
    if (this.synthesis) {
      this.synthesis.cancel();
    }
  }
}

// Singleton instance
export const voiceService = new VoiceService();

// Parse voice input to extract request type and amount
export function parseVoiceInput(transcript: string): {
  type: string | null;
  amount: number | null;
  useDefault: boolean;
} {
  const normalizedText = transcript.toLowerCase().trim();
  
  // Detect request type
  let type: string | null = null;
  if (normalizedText.includes('combustible') || normalizedText.includes('gasolina')) {
    type = 'combustible';
  } else if (normalizedText.includes('material') || normalizedText.includes('ferreteria')) {
    type = 'materiales';
  } else if (normalizedText.includes('viatico') || normalizedText.includes('comida') || normalizedText.includes('almuerzo')) {
    type = 'viatico';
  } else if (normalizedText.includes('goma') || normalizedText.includes('gomera') || normalizedText.includes('neumatico')) {
    type = 'gomera';
  }
  
  // Check for default amount request
  const useDefault = 
    normalizedText.includes('de siempre') ||
    normalizedText.includes('lo usual') ||
    normalizedText.includes('como siempre') ||
    normalizedText.includes('el acostumbrado') ||
    normalizedText.includes('semanal') && !normalizedText.match(/\d/);
  
  // Extract amount if specified
  let amount: number | null = null;
  const amountMatch = normalizedText.match(/(\d+(?:[.,]\d+)?)\s*(?:pesos|rd\$?|mil)?/i);
  if (amountMatch) {
    amount = parseFloat(amountMatch[1].replace(',', '.'));
    // Handle "mil" (thousand)
    if (normalizedText.includes('mil') && amount < 100) {
      amount *= 1000;
    }
  }
  
  return { type, amount, useDefault };
}

// Type declarations for Web Speech API
declare global {
  interface SpeechRecognitionEvent extends Event {
    results: SpeechRecognitionResultList;
    resultIndex: number;
  }
  interface SpeechRecognitionErrorEvent extends Event {
    error: string;
    message: string;
  }
  interface SpeechRecognition extends EventTarget {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    onresult: (event: SpeechRecognitionEvent) => void;
    onerror: (event: SpeechRecognitionErrorEvent) => void;
    onend: () => void;
    start(): void;
    stop(): void;
    abort(): void;
  }
  var SpeechRecognition: {
    prototype: SpeechRecognition;
    new (): SpeechRecognition;
  };
  var webkitSpeechRecognition: {
    prototype: SpeechRecognition;
    new (): SpeechRecognition;
  };
}
