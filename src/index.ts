import {AppServer, AppSession, StreamType, type AppSetting} from '@mentra/sdk';
// import {TpaServer, TpaSession, StreamType} from '@augmentos/sdk'
import logger from './utils/logger'
import {config} from './config/environment';
// import {setTimeout as sleep} from 'timers/promises';

const defaultSettings = {
    display_option: 'posture_line'
};

class PostureCheck extends AppServer {
    private activeUserSessions = new Map<string, {session: AppSession, sessionId: string}>();
    private userSettings = new Map<string, {display_option: string}>();

    constructor() {
        super({
            packageName: config.augmentOS.packageName,
            apiKey: config.augmentOS.apiKey,
            port: config.server.port,
        });
        // Set up express server for auth callback
        const app = this.getExpressApp();
    };

  // Called when new user connects to app
  protected async onSession(session: AppSession, sessionId: string, userId: string): Promise<void> {
    logger.info(`New session started: ${sessionId} for user: ${userId}`);

    this.activeUserSessions.set(userId, {session, sessionId});
    this.userSettings.set(userId, defaultSettings)

    try {
      this.setupSettingsHandlers(session, sessionId, userId);
      await this.applySettings(session, sessionId, userId);
    } catch (error) {
      logger.error(`Error initializing settings for user ${userId}.`, {
        userId: userId,
        error: {
          message: error.message,
          stack: error.stack,
          responseStatus: error.response?.status,
          responseBody: error.response?.data 
        }
      });
    }

    if (this.userSettings.get(userId)?.display_option === 'posture_line') {
        session.layouts.showTextWall('\n\n------------------------------------------', {durationMs: -1});
    } else if (this.userSettings.get(userId)?.display_option === 'crosshair') {
        session.layouts.showTextWall('            |\n            |\n-------+-------\n            |\n            |', {durationMs: -1});
    }

    // Register cleanup handlers
    this.addCleanupHandler(() => this.activeUserSessions.delete(userId));
  }

  protected async onStop(sessionId: string, userId: string, reason: string): Promise<void> {
    await super.onStop(sessionId, userId, reason);
    logger.info(`[User ${userId}] Received cleanup complete notification for session ${sessionId}.`);
    // Verify if the session being cleaned up is still the one we are tracking
    const trackedInfo = this.activeUserSessions.get(userId);
    if (trackedInfo && trackedInfo.sessionId === sessionId) {
      logger.info(`[User ${userId}] Removing session ${sessionId} from active tracking map.`);
      this.activeUserSessions.delete(userId);
    } else {
      logger.warn(`[User ${userId}] Cleanup complete notification for session ${sessionId}, but different session ${trackedInfo?.sessionId ?? 'none'} is tracked or user already removed.`);
    }
  }

  private setupSettingsHandlers(session: AppSession, sessionId: string, userId: string): void {
    session.settings.onValueChange('display_option', (newValue, oldValue) => {
      logger.info(`Display type changed for user ${userId}: ${oldValue} -> ${newValue}`);
      this.applySettings(session, sessionId, userId);
    });
  }

  private async applySettings(session: AppSession, sessionId: string, userId: string): Promise<void> {
    try {
      const settings = session.settings.getAll();
      settings.forEach((data) => {
        logger.debug(`key: ${data.key}`);
        logger.debug(`value: ${data.value}`);
        if (data.key ===  'display_option') {
            this.userSettings.set(userId, {display_option: data.value});
        }
      })
      logger.info(`[Session ${sessionId}]: display=${this.userSettings.get(userId)?.display_option}`);
    } catch (error) {
      logger.error(`Error fetching settings for user ${userId}.`, {
        userId: userId,
        error: {
          message: error.message,
          stack: error.stack,
          responseStatus: error.response?.status,
          responseBody: error.response?.data 
        }
      });
      throw error;
    }
  }
}

const tpa = new PostureCheck();

tpa.start().catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});