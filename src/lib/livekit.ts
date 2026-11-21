import { AccessToken, RoomServiceClient } from "livekit-server-sdk";

export function isLiveKitServerConfigured(): boolean {
  return Boolean(
    process.env.LIVEKIT_API_KEY &&
      process.env.LIVEKIT_API_SECRET &&
      process.env.NEXT_PUBLIC_LIVEKIT_URL
  );
}

export async function generateLiveKitToken(params: {
  roomName: string;
  identity: string;
  name: string;
  isHost: boolean;
  metadata?: Record<string, unknown>;
}): Promise<string> {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!apiKey || !apiSecret) {
    throw new Error("LiveKit server credentials not configured");
  }

  const at = new AccessToken(apiKey, apiSecret, {
    identity: params.identity,
    name: params.name,
    metadata: JSON.stringify({
      isHost: params.isHost,
      ...(params.metadata || {})
    }),
    ttl: "4h"
  });

  at.addGrant({
    room: params.roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    roomAdmin: params.isHost
  });

  return await at.toJwt();
}

export function getRoomServiceClient(): RoomServiceClient | null {
  const httpUrl = process.env.LIVEKIT_HTTP_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!httpUrl || !apiKey || !apiSecret) return null;
  return new RoomServiceClient(httpUrl, apiKey, apiSecret);
}
