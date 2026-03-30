import type { CapacitorConfig } from '@capacitor/cli';

const serverUrl = process.env.CAPACITOR_SERVER_URL ?? 'https://control360-smoky.vercel.app';

const config: CapacitorConfig = {
  appId: 'com.caontrol360.app',
  appName: 'Caontrol360',
  webDir: 'public',
  android: {
    allowMixedContent: true,
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

config.server = {
  url: serverUrl,
  cleartext: serverUrl.startsWith('http://'),
};

export default config;
