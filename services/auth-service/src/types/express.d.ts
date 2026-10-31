// Redundant with services/toolkit/src/express.ts's own augmentation, kept
// here too as a safety net - toolkit's ambient type only reaches this
// project if TypeScript actually resolves and includes its dist/express.d.ts,
// which depends on toolkit's own build/packaging staying correct. Declaring
// it locally as well means this project's own build doesn't depend on that.
import { TokenPayload } from '@scalable-demo/toolkit';

declare global {
  namespace Express {
    interface Request {
      auth?: TokenPayload;
    }
  }
}

export {};
