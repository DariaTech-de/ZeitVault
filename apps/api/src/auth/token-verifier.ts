import { Injectable } from '@nestjs/common';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import jwksClient, { type JwksClient } from 'jwks-rsa';
import { loadEnv } from '../config/env';

/**
 * Verifiziert OIDC-Zugriffstokens (RS256) gegen die JWKS des Keycloak-Issuers
 * (ADR-0008). Prueft Signatur, Issuer und - falls konfiguriert - Audience.
 */
@Injectable()
export class TokenVerifier {
  private client: JwksClient | null = null;

  private signingKeyResolver(jwksUri: string): jwt.GetPublicKeyOrSecret {
    this.client ??= jwksClient({ jwksUri, cache: true, rateLimit: true });
    const client = this.client;
    return (header, callback) => {
      client.getSigningKey(header.kid, (err, key) => {
        if (err || !key) {
          callback(err ?? new Error('JWKS-Signaturschluessel nicht gefunden.'));
          return;
        }
        callback(null, key.getPublicKey());
      });
    };
  }

  async verify(token: string): Promise<JwtPayload> {
    const env = loadEnv();
    if (!env.KEYCLOAK_ISSUER_URL) {
      throw new Error('KEYCLOAK_ISSUER_URL ist nicht konfiguriert (AUTH_MODE=oidc).');
    }
    const issuer = env.KEYCLOAK_ISSUER_URL.replace(/\/$/, '');
    const jwksUri = `${issuer}/protocol/openid-connect/certs`;
    const getKey = this.signingKeyResolver(jwksUri);

    return new Promise<JwtPayload>((resolve, reject) => {
      jwt.verify(
        token,
        getKey,
        {
          issuer,
          audience: env.KEYCLOAK_AUDIENCE,
          algorithms: ['RS256'],
        },
        (err, decoded) => {
          if (err || decoded === undefined || typeof decoded === 'string') {
            reject(err ?? new Error('Token konnte nicht verifiziert werden.'));
            return;
          }
          resolve(decoded);
        },
      );
    });
  }
}
