import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

export interface PushMessage {
  title: string;
  body: string;
  /** Read by the app to open the right screen when the notification is tapped. */
  data: Record<string, string>;
}

/** Tokens FCM reports as gone for good; they are removed from the table. */
const STALE_TOKEN_ERRORS = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private supabase: SupabaseClient;
  private app: App | null | undefined;

  constructor(private configService: ConfigService) {
    this.supabase = createClient(
      this.configService.get<string>('SUPABASE_URL')!,
      this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );
  }

  async registerToken(
    userId: string,
    token: string,
    platform: 'ios' | 'android',
  ) {
    // A device belongs to whoever signed in last on it.
    const { error } = await this.supabase.from('push_tokens').upsert({
      token,
      user_id: userId,
      platform,
      updated_at: new Date().toISOString(),
    });
    if (error) this.logger.error(`Saving push token failed: ${error.message}`);
    return { registered: !error };
  }

  async removeToken(userId: string, token: string) {
    await this.supabase
      .from('push_tokens')
      .delete()
      .eq('token', token)
      .eq('user_id', userId);
    return { removed: true };
  }

  /**
   * Sends a notification to every device of the user. Never throws: a
   * failed notification must not fail the action that triggered it.
   */
  async sendToUser(userId: string, message: PushMessage): Promise<void> {
    try {
      const app = this.firebase();
      if (!app) return;

      const { data } = await this.supabase
        .from('push_tokens')
        .select('token')
        .eq('user_id', userId);
      const tokens = (data ?? []).map((row: { token: string }) => row.token);
      if (!tokens.length) return;

      const response = await getMessaging(app).sendEachForMulticast({
        tokens,
        notification: { title: message.title, body: message.body },
        data: message.data,
        android: {
          priority: 'high',
          notification: { channelId: 'nayha_default', sound: 'default' },
        },
        apns: { payload: { aps: { sound: 'default' } } },
      });

      const stale = response.responses
        .map((result, index) =>
          !result.success && STALE_TOKEN_ERRORS.has(result.error?.code ?? '')
            ? tokens[index]
            : null,
        )
        .filter((token): token is string => token !== null);
      if (stale.length) {
        await this.supabase.from('push_tokens').delete().in('token', stale);
      }
    } catch (cause) {
      this.logger.error(`Push to user ${userId} failed: ${String(cause)}`);
    }
  }

  /**
   * Firebase Admin, from the service account JSON in FIREBASE_SERVICE_ACCOUNT
   * (raw or base64). Without it, notifications are skipped.
   */
  private firebase(): App | null {
    if (this.app !== undefined) return this.app;
    const raw = this.configService.get<string>('FIREBASE_SERVICE_ACCOUNT');
    if (!raw) {
      this.logger.warn('FIREBASE_SERVICE_ACCOUNT is not set: push disabled');
      this.app = null;
      return null;
    }
    try {
      const json = raw.trim().startsWith('{')
        ? raw
        : Buffer.from(raw, 'base64').toString('utf8');
      const account = JSON.parse(json) as {
        project_id: string;
        client_email: string;
        private_key: string;
      };
      this.app =
        getApps()[0] ??
        initializeApp({
          credential: cert({
            projectId: account.project_id,
            clientEmail: account.client_email,
            privateKey: account.private_key,
          }),
        });
    } catch (cause) {
      this.logger.error(`Invalid FIREBASE_SERVICE_ACCOUNT: ${String(cause)}`);
      this.app = null;
    }
    return this.app;
  }
}
