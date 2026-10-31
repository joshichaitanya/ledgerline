// A plain .ts file, not .d.ts: tsc reliably emits a declaration file to
// dist/ for a normal source file, but doesn't for standalone .d.ts source
// files - which was silently dropping this augmentation from the built
// package (consumers never saw `req.auth`).
import { TokenPayload } from './types';

declare global {
  namespace Express {
    interface Request {
      auth?: TokenPayload;
    }
  }
}

export {};
