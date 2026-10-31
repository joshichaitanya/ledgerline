// Every backend call goes through api-gateway (Kong) - one entry point,
// which is what actually enforces JWT verification and rate limiting (see
// infrastructure/api-gateway/README.md). The gateway routes by path+method
// to the right service internally; web-app doesn't need to know which
// service is which anymore.
export const API_GATEWAY_URL = process.env.NEXT_PUBLIC_API_GATEWAY_URL || 'http://localhost:8000';
