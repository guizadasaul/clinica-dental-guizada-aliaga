import { Injectable, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import * as admin from 'firebase-admin';
import type { DecodedIdToken } from 'firebase-admin/auth';
import type { TokenPort } from '../domain/TokenPort.js';

@Injectable()
export class FirebaseService implements OnModuleInit, TokenPort {
  private app: admin.app.App;

  onModuleInit(): void {
    this.app = admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env['FIREBASE_PROJECT_ID'],
        clientEmail: process.env['FIREBASE_CLIENT_EMAIL'],
        privateKey: process.env['FIREBASE_PRIVATE_KEY']?.replace(/\\n/g, '\n'),
      }),
    });
  }

  async verifyIdToken(token: string): Promise<DecodedIdToken> {
    try {
      return await this.app.auth().verifyIdToken(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired Firebase token');
    }
  }

  async createFirebaseUser(displayName: string): Promise<string> {
    const userRecord = await this.app.auth().createUser({ displayName });
    return userRecord.uid;
  }

  async createCustomToken(uid: string): Promise<string> {
    return this.app.auth().createCustomToken(uid);
  }
}
