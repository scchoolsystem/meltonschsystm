import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ke.co.smartdev.app',
  appName: 'SmartDev ERP',
  webDir: 'dist/client',
  server: {
    url: 'https://app.smartdev.co.ke',
    cleartext: false,
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_icon_config_sample',
      iconColor: '#0ea5e9',
      sound: 'beep.wav',
    },
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#0ea5e9',
      showSpinner: false,
    },
    Keyboard: {
      resize: 'body',
      style: 'dark',
      resizeOnFullScreen: true,
    },
    StatusBar: {
      style: 'default',
      backgroundColor: '#0ea5e9',
    },
  },
};

export default config;
